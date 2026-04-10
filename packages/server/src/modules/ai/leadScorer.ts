import { and, eq, isNull, desc } from 'drizzle-orm';
import { db } from '../../db/index.js';
import {
  leads,
  contacts,
  messages,
  idealCustomerProfiles,
  activities,
} from '../../db/schema.js';
import { NotFoundError } from '../../utils/errors.js';

interface ScoreBreakdown {
  icpFit: number;
  engagement: number;
  recency: number;
  completeness: number;
  sentiment: number;
  total: number;
}

/**
 * Deterministic lead scorer (0-100). Weighted factors:
 *  - ICP fit (30)
 *  - Engagement signals — opens, clicks, replies (30)
 *  - Recency of activity (10)
 *  - Contact completeness (15)
 *  - Average inbound sentiment (15)
 */
export async function scoreLead(leadId: string, organizationId: string) {
  const [lead] = await db
    .select()
    .from(leads)
    .where(
      and(
        eq(leads.id, leadId),
        eq(leads.organizationId, organizationId),
        isNull(leads.deletedAt),
      ),
    )
    .limit(1);
  if (!lead) throw new NotFoundError('Lead');

  let icp: typeof idealCustomerProfiles.$inferSelect | undefined;
  if (lead.icpId) {
    [icp] = await db
      .select()
      .from(idealCustomerProfiles)
      .where(eq(idealCustomerProfiles.id, lead.icpId))
      .limit(1);
  }

  const leadContacts = await db
    .select()
    .from(contacts)
    .where(and(eq(contacts.leadId, leadId), isNull(contacts.deletedAt)));

  const leadMessages = await db
    .select()
    .from(messages)
    .where(eq(messages.contactId, leadContacts[0]?.id ?? ''))
    .orderBy(desc(messages.createdAt))
    .limit(50);

  // 1. ICP fit (max 30)
  let icpFit = 0;
  if (icp) {
    if (icp.targetIndustries?.includes(lead.companyIndustry ?? '')) icpFit += 12;
    if (icp.targetCompanySizes?.includes(lead.companySize ?? '')) icpFit += 10;
    if (lead.companyWebsite) icpFit += 4;
    if (lead.companyLocation) icpFit += 4;
  } else {
    icpFit = 10; // neutral if no ICP assigned
  }

  // 2. Engagement (max 30)
  let engagement = 0;
  const opens = leadMessages.filter((m) => m.openedAt).length;
  const clicks = leadMessages.filter((m) => m.clickedAt).length;
  const replies = leadMessages.filter((m) => m.direction === 'inbound').length;
  engagement += Math.min(opens * 2, 10);
  engagement += Math.min(clicks * 3, 10);
  engagement += Math.min(replies * 5, 10);

  // 3. Recency (max 10)
  let recency = 0;
  const lastActivity = leadMessages[0]?.createdAt ?? lead.updatedAt;
  const daysAgo = (Date.now() - new Date(lastActivity).getTime()) / (1000 * 60 * 60 * 24);
  if (daysAgo < 1) recency = 10;
  else if (daysAgo < 7) recency = 7;
  else if (daysAgo < 30) recency = 4;
  else recency = 1;

  // 4. Completeness (max 15)
  let completeness = 0;
  const primary = leadContacts.find((c) => c.isPrimary) ?? leadContacts[0];
  if (primary?.email) completeness += 5;
  if (primary?.phone) completeness += 3;
  if (primary?.linkedinUrl) completeness += 3;
  if (primary?.jobTitle) completeness += 2;
  if (primary?.isDecisionMaker) completeness += 2;

  // 5. Sentiment (max 15)
  let sentiment = 7.5; // neutral default
  const sentiments = leadMessages
    .filter((m) => m.direction === 'inbound' && m.sentimentScore != null)
    .map((m) => m.sentimentScore as number);
  if (sentiments.length > 0) {
    const avg = sentiments.reduce((a, b) => a + b, 0) / sentiments.length;
    // avg is -1..1 → scale to 0..15
    sentiment = Math.max(0, Math.min(15, Math.round((avg + 1) * 7.5)));
  }

  const total = Math.round(icpFit + engagement + recency + completeness + sentiment);
  const breakdown: ScoreBreakdown = {
    icpFit,
    engagement,
    recency,
    completeness,
    sentiment,
    total,
  };

  await db
    .update(leads)
    .set({
      leadScore: total,
      leadScoreBreakdown: breakdown,
      updatedAt: new Date(),
    })
    .where(eq(leads.id, leadId));

  await db.insert(activities).values({
    organizationId,
    leadId,
    activityType: 'lead_scored',
    description: `Lead scored ${total}/100`,
    metadata: breakdown,
  });

  return { leadScore: total, breakdown };
}
