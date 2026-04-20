import type { Job } from 'bullmq';
import { eq, and, isNull } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { leads, contacts, activities } from '../../db/schema.js';
import { getEnrichmentProvider } from '../../integrations/enrichment/index.js';
import { logger } from '../../utils/logger.js';

function extractDomain(website?: string | null, contactEmail?: string | null): string | undefined {
  if (website) {
    try {
      const url = website.startsWith('http') ? website : `https://${website}`;
      return new URL(url).hostname.replace(/^www\./, '');
    } catch {
      // fall through
    }
  }
  if (contactEmail?.includes('@')) {
    return contactEmail.split('@')[1];
  }
  return undefined;
}

export async function processEnrichJob(job: Job<{ leadId: string; organizationId: string }>) {
  const { leadId, organizationId } = job.data;
  const [lead] = await db.select().from(leads).where(eq(leads.id, leadId)).limit(1);
  if (!lead) return;

  const provider = getEnrichmentProvider();
  const sampleContact = await db
    .select()
    .from(contacts)
    .where(and(eq(contacts.leadId, leadId), isNull(contacts.deletedAt)))
    .limit(1);
  const domain = extractDomain(lead.companyWebsite, sampleContact[0]?.email);

  try {
    const result = await provider.enrich({
      companyName: lead.companyName,
      domain,
    });
    await db
      .update(leads)
      .set({
        enrichmentStatus: 'enriched',
        enrichedAt: new Date(),
        enrichmentData: result.raw as Record<string, unknown>,
        companyIndustry: result.industry ?? lead.companyIndustry,
        companySize: result.size ?? lead.companySize,
        companyRevenueRange: result.revenueRange ?? lead.companyRevenueRange,
        companyLocation: result.location ?? lead.companyLocation,
        companyDescription: result.description ?? lead.companyDescription,
      })
      .where(eq(leads.id, leadId));

    await db.insert(activities).values({
      organizationId,
      leadId,
      activityType: 'lead_enriched',
      description: 'Lead enriched with external data',
      metadata: {
        industry: result.industry,
        size: result.size,
        location: result.location,
      },
    });

    // Enrich every contact attached to this lead. Email-find when we only
    // have a name + the freshly enriched domain.
    const allContacts = await db
      .select()
      .from(contacts)
      .where(and(eq(contacts.leadId, leadId), isNull(contacts.deletedAt)));
    const enrichDomain = domain ?? extractDomainFromResult(result);

    for (const contact of allContacts) {
      try {
        if (!contact.email && enrichDomain && contact.firstName && contact.lastName && provider.findEmail) {
          const found = await provider.findEmail({
            domain: enrichDomain,
            firstName: contact.firstName,
            lastName: contact.lastName,
          });
          if (found.email) {
            await db
              .update(contacts)
              .set({
                email: found.email,
                emailVerified: !!found.verified,
                updatedAt: new Date(),
              })
              .where(eq(contacts.id, contact.id));
            contact.email = found.email;
          }
        }

        if (provider.enrichContact && (contact.email || contact.linkedinUrl)) {
          const c = await provider.enrichContact({
            email: contact.email ?? undefined,
            firstName: contact.firstName ?? undefined,
            lastName: contact.lastName ?? undefined,
            companyDomain: enrichDomain,
            linkedinUrl: contact.linkedinUrl ?? undefined,
          });
          await db
            .update(contacts)
            .set({
              jobTitle: c.jobTitle ?? contact.jobTitle,
              department: c.department ?? contact.department,
              seniorityLevel: normalizeSeniority(c.seniority) ?? contact.seniorityLevel,
              linkedinUrl: c.linkedinUrl ?? contact.linkedinUrl,
              twitterUrl: c.twitterUrl ?? contact.twitterUrl,
              location: c.location ?? contact.location,
              bio: c.bio ?? contact.bio,
              phone: c.phone ?? contact.phone,
              updatedAt: new Date(),
            })
            .where(eq(contacts.id, contact.id));
        }
      } catch (err) {
        logger.warn({ err, contactId: contact.id }, 'Contact enrichment failed');
      }
    }
  } catch (err) {
    logger.error({ err, leadId }, 'Enrichment failed');
    await db
      .update(leads)
      .set({ enrichmentStatus: 'failed' })
      .where(eq(leads.id, leadId));
    throw err;
  }
}

function extractDomainFromResult(result: { firmographics?: Record<string, unknown> }): string | undefined {
  const d = result.firmographics?.domain;
  return typeof d === 'string' ? d : undefined;
}

function normalizeSeniority(
  s?: string,
): 'c_suite' | 'vp' | 'director' | 'manager' | 'senior' | 'mid' | 'junior' | 'intern' | undefined {
  if (!s) return undefined;
  const lower = s.toLowerCase();
  if (lower.startsWith('c_') || /^c[a-z]o$/.test(lower) || lower.includes('chief') || lower.includes('founder') || lower.includes('owner')) {
    return 'c_suite';
  }
  if (lower.includes('vp') || lower.includes('vice president')) return 'vp';
  if (lower.includes('director') || lower.includes('head of')) return 'director';
  if (lower.includes('manager') || lower.includes('lead')) return 'manager';
  if (lower.includes('senior') || lower.includes('staff') || lower.includes('principal')) return 'senior';
  if (lower.includes('intern')) return 'intern';
  if (lower.includes('junior') || lower.includes('entry')) return 'junior';
  return 'mid';
}

export const _internal = { extractDomain, normalizeSeniority };
