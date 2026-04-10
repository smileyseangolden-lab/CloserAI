import { and, eq } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { idealCustomerProfiles, leads } from '../../db/schema.js';
import { claude } from './anthropic.js';
import { NotFoundError } from '../../utils/errors.js';

/**
 * Inspects the ICP definition and observed lead performance,
 * then asks Claude for refinement suggestions.
 */
export async function refineIcp(icpId: string, organizationId: string): Promise<string> {
  const [icp] = await db
    .select()
    .from(idealCustomerProfiles)
    .where(
      and(
        eq(idealCustomerProfiles.id, icpId),
        eq(idealCustomerProfiles.organizationId, organizationId),
      ),
    )
    .limit(1);
  if (!icp) throw new NotFoundError('ICP');

  const recentLeads = await db
    .select({
      companyName: leads.companyName,
      companyIndustry: leads.companyIndustry,
      companySize: leads.companySize,
      leadScore: leads.leadScore,
      status: leads.status,
    })
    .from(leads)
    .where(and(eq(leads.icpId, icpId), eq(leads.organizationId, organizationId)))
    .limit(50);

  const prompt = `You are a revenue operations expert. The following ICP is being used for outbound:

Name: ${icp.name}
Description: ${icp.description}
Target industries: ${icp.targetIndustries?.join(', ')}
Target job titles: ${icp.targetJobTitles?.join(', ')}
Target company sizes: ${icp.targetCompanySizes?.join(', ')}
Buying signals: ${icp.buyingSignals?.join(', ')}
Disqualifiers: ${icp.disqualifiers?.join(', ')}

Recent lead performance (score / status):
${recentLeads.map((l) => `- ${l.companyName} (${l.companyIndustry}, ${l.companySize}): score=${l.leadScore}, status=${l.status}`).join('\n') || '(no leads yet)'}

Suggest specific, actionable refinements to this ICP to improve lead quality. Focus on 3-5 concrete changes. Keep response under 250 words.`;

  const { text } = await claude(prompt, { maxTokens: 1024, temperature: 0.5 });

  await db
    .update(idealCustomerProfiles)
    .set({ aiRefinementNotes: text, updatedAt: new Date() })
    .where(eq(idealCustomerProfiles.id, icpId));

  return text;
}
