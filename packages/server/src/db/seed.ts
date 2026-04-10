import bcrypt from 'bcrypt';
import { db, pool } from './index.js';
import {
  organizations,
  users,
  businessProfiles,
  idealCustomerProfiles,
  agentProfiles,
  agentKnowledgeBase,
  campaigns,
  cadenceSteps,
  leads,
  contacts,
} from './schema.js';
import { logger } from '../utils/logger.js';

async function seed() {
  logger.info('Seeding demo data...');

  // Organization
  const [org] = await db
    .insert(organizations)
    .values({
      name: 'Acme Demo Co',
      industry: 'SaaS',
      website: 'https://acme.demo',
      description: 'Demo organization for local development',
      subscriptionTier: 'professional',
      subscriptionStatus: 'active',
    })
    .returning();

  if (!org) throw new Error('Failed to create organization');

  // Owner user
  const passwordHash = await bcrypt.hash('demopassword', 12);
  const [owner] = await db
    .insert(users)
    .values({
      organizationId: org.id,
      email: 'demo@closerai.local',
      passwordHash,
      firstName: 'Demo',
      lastName: 'Owner',
      role: 'owner',
    })
    .returning();

  if (!owner) throw new Error('Failed to create owner');

  // Business profile
  await db.insert(businessProfiles).values({
    organizationId: org.id,
    companyName: 'Acme Demo Co',
    industry: 'SaaS',
    subIndustry: 'Sales Automation',
    companySize: '11-50',
    annualRevenueRange: '$1M-$10M',
    headquartersLocation: 'San Francisco, CA',
    website: 'https://acme.demo',
    valueProposition: 'We help B2B teams automate their sales lifecycle end to end.',
    keyDifferentiators: ['Multi-agent AI', 'Full funnel coverage', 'Autonomous closing'],
    targetVerticals: ['SaaS', 'Fintech', 'Manufacturing'],
    painPointsSolved: ['Manual outreach burnout', 'Low reply rates', 'Slow pipeline velocity'],
    aiGeneratedSummary: 'Acme Demo Co sells an autonomous AI sales platform for B2B teams.',
  });

  // ICP
  const [icp] = await db
    .insert(idealCustomerProfiles)
    .values({
      organizationId: org.id,
      name: 'Mid-market SaaS VP Sales',
      description: 'Revenue leaders at growing SaaS companies feeling pipeline pain.',
      targetIndustries: ['SaaS', 'Technology'],
      targetCompanySizes: ['51-200', '201-500'],
      targetJobTitles: ['VP Sales', 'Head of Revenue', 'Chief Revenue Officer'],
      targetDepartments: ['Sales', 'Revenue'],
      targetGeographies: ['North America', 'Europe'],
      buyingSignals: ['Hiring SDRs', 'Switching CRMs', 'Recent funding'],
      disqualifiers: ['Under 10 employees', 'Not in B2B'],
      priority: 10,
    })
    .returning();

  // Agents
  const [prospector] = await db
    .insert(agentProfiles)
    .values({
      organizationId: org.id,
      name: 'Prospecting Priya',
      agentType: 'prospector',
      personalityStyle: 'consultative',
      toneDescription:
        'Warm, curious, and respectful. Asks thoughtful questions, never pushy.',
      writingStyleExamples: [
        'Hi {{firstName}}, noticed you recently expanded the sales team at {{company}} — curious how you are handling the extra pipeline load?',
      ],
      senderName: 'Priya Sharma',
      senderTitle: 'Senior Account Executive',
      emailSignature: 'Priya Sharma\nSenior Account Executive, Acme Demo Co',
      responseSpeed: 'fast_1hr',
      maxDailyOutreach: 80,
    })
    .returning();

  const [closer] = await db
    .insert(agentProfiles)
    .values({
      organizationId: org.id,
      name: 'Closing Carlos',
      agentType: 'closer',
      personalityStyle: 'executive',
      toneDescription:
        'Confident, concise, outcome oriented. Good at booking meetings and handling objections.',
      writingStyleExamples: [
        'Appreciate the detail, {{firstName}}. Given everything you shared, I think a 20-minute walkthrough would answer this best.',
      ],
      senderName: 'Carlos Mendez',
      senderTitle: 'Director of Strategic Accounts',
      emailSignature: 'Carlos Mendez\nDirector of Strategic Accounts, Acme Demo Co',
      responseSpeed: 'fast_1hr',
      maxDailyOutreach: 40,
    })
    .returning();

  if (prospector) {
    await db.insert(agentKnowledgeBase).values([
      {
        agentId: prospector.id,
        knowledgeType: 'product_info',
        title: 'Platform overview',
        content:
          'Acme automates the full B2B sales lifecycle: lead generation, outreach, nurture, and close.',
      },
      {
        agentId: prospector.id,
        knowledgeType: 'objection_handling',
        title: 'Too busy objection',
        content:
          'Acknowledge the busyness, offer to send a 2-minute async Loom instead of a meeting.',
      },
    ]);
  }

  // Campaign
  if (prospector && closer && icp) {
    const [campaign] = await db
      .insert(campaigns)
      .values({
        organizationId: org.id,
        icpId: icp.id,
        name: 'Q2 SaaS VP Sales Outbound',
        description: 'Cold outbound to VP Sales at mid-market SaaS companies.',
        campaignType: 'outbound_cold',
        status: 'draft',
        assignedAgentId: prospector.id,
        closingAgentId: closer.id,
        strategy: 'pain_point',
        channels: ['email'],
        warmLeadThreshold: 60,
        autoCloseEnabled: false,
        humanHandoffEnabled: true,
        handoffUserId: owner.id,
      })
      .returning();

    if (campaign) {
      await db.insert(cadenceSteps).values([
        {
          campaignId: campaign.id,
          stepNumber: 1,
          channel: 'email',
          delayDays: 0,
          delayHours: 0,
          subjectTemplate: 'Quick thought on {{company}} pipeline',
          bodyTemplate:
            'Hi {{firstName}},\n\nSaw you are scaling the team at {{company}}. Most VPs I talk with at that stage struggle with keeping outbound consistent while hiring. Is that resonating at all on your side?\n\nIf helpful I can share what has been working.\n\n{{agentSignature}}',
          aiPersonalizationEnabled: true,
          personalizationInstructions:
            'Reference something specific about the prospect company. Keep under 80 words.',
        },
        {
          campaignId: campaign.id,
          stepNumber: 2,
          channel: 'email',
          delayDays: 3,
          delayHours: 0,
          subjectTemplate: 'Re: Quick thought on {{company}} pipeline',
          bodyTemplate:
            'Hi {{firstName}},\n\nJust bumping this back to the top. Happy to share the framework regardless of whether we ever work together.\n\n{{agentSignature}}',
          aiPersonalizationEnabled: true,
        },
      ]);
    }
  }

  // Demo leads
  const [lead1] = await db
    .insert(leads)
    .values({
      organizationId: org.id,
      icpId: icp?.id,
      companyName: 'Widget Corp',
      companyWebsite: 'https://widgetcorp.example',
      companyIndustry: 'SaaS',
      companySize: '51-200',
      companyLocation: 'Austin, TX',
      source: 'manual',
      leadScore: 72,
      status: 'new',
    })
    .returning();

  if (lead1) {
    await db.insert(contacts).values({
      leadId: lead1.id,
      organizationId: org.id,
      firstName: 'Morgan',
      lastName: 'Lee',
      email: 'morgan@widgetcorp.example',
      jobTitle: 'VP of Sales',
      seniorityLevel: 'vp',
      isPrimary: true,
      isDecisionMaker: true,
      preferredChannel: 'email',
      timezone: 'America/Chicago',
    });
  }

  logger.info('Seed completed.');
  logger.info('Login with demo@closerai.local / demopassword');
}

seed()
  .catch((err) => {
    logger.error({ err }, 'Seed failed');
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
