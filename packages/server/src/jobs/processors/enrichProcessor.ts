import type { Job } from 'bullmq';
import { eq } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { leads, activities } from '../../db/schema.js';
import { getEnrichmentProvider } from '../../integrations/enrichment/index.js';
import { logger } from '../../utils/logger.js';

export async function processEnrichJob(job: Job<{ leadId: string; organizationId: string }>) {
  const { leadId, organizationId } = job.data;
  const [lead] = await db.select().from(leads).where(eq(leads.id, leadId)).limit(1);
  if (!lead) return;

  const provider = getEnrichmentProvider();
  try {
    const result = await provider.enrich({
      companyName: lead.companyName,
      domain: lead.companyWebsite ?? undefined,
    });
    await db
      .update(leads)
      .set({
        enrichmentStatus: 'enriched',
        enrichedAt: new Date(),
        enrichmentData: result.raw as Record<string, unknown>,
        companyIndustry: result.industry ?? lead.companyIndustry,
        companySize: result.size ?? lead.companySize,
        companyLocation: result.location ?? lead.companyLocation,
        companyDescription: result.description ?? lead.companyDescription,
      })
      .where(eq(leads.id, leadId));

    await db.insert(activities).values({
      organizationId,
      leadId,
      activityType: 'lead_enriched',
      description: 'Lead enriched with external data',
    });
  } catch (err) {
    logger.error({ err, leadId }, 'Enrichment failed');
    await db
      .update(leads)
      .set({ enrichmentStatus: 'failed' })
      .where(eq(leads.id, leadId));
  }
}
