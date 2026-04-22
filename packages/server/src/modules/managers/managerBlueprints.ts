/**
 * Shared types + defaults for the three manager roles. The analyzer functions
 * (salesManager.ts, marketingManager.ts, cro.ts) receive an AnalyzerContext
 * with pre-loaded org settings + recent data so each runs deterministically
 * on the same slice of state.
 */
import type { ManagerAgent } from '../../db/schema.js';

export type ManagerRole = 'sales_manager' | 'marketing_manager' | 'cro';

export interface ManagerBlueprint {
  role: ManagerRole;
  name: string;
  description: string;
  cadence: 'hourly' | 'daily' | 'weekly';
  systemPrompt: string;
}

/**
 * Catalog entries users pick from when enabling a manager. Each role is
 * deliberately single-instance per org (enforced by the unique index on
 * (organizationId, role)) so the UX is "enable / disable", not "configure N".
 */
export const MANAGER_BLUEPRINTS: Record<ManagerRole, ManagerBlueprint> = {
  sales_manager: {
    role: 'sales_manager',
    name: 'Sales Manager',
    description:
      'Watches individual opportunities and cadence leads for stall, missing MEDDPICC elements, and off-brand tone. Coaches specific IC agents by filing optimization proposals and activity notes.',
    cadence: 'hourly',
    systemPrompt:
      'You are a Sales Manager overseeing a team of AI sales ICs. You review individual deals and specific agent outputs, then take concrete actions: file optimization proposals against specific agents, leave coaching notes in the activity log, and recommend handoffs. Bias toward small, specific interventions, not abstract advice.',
  },
  marketing_manager: {
    role: 'marketing_manager',
    name: 'Marketing Manager',
    description:
      'Watches content effectiveness — which objections keep appearing, missing battlecards, brand-voice drift — and writes knowledge base entries plus proposes value-prop / cadence changes.',
    cadence: 'daily',
    systemPrompt:
      'You are a Marketing Manager supporting the sales team. You review which objections are landing without playbooks, which battlecards are underused, and where brand voice drifts across agents. You produce new knowledge base entries and propose value-prop + cadence edits grounded in real reply patterns.',
  },
  cro: {
    role: 'cro',
    name: 'Chief Revenue Officer',
    description:
      'Weekly executive brief. Reads Sales Manager + Marketing Manager digests and the Optimization queue, then produces a prioritised action list and ICP drift observations.',
    cadence: 'weekly',
    systemPrompt:
      'You are the Chief Revenue Officer. Each week you produce a sharp, prioritised executive brief. Start with a 2-sentence pipeline-health TL;DR, then the top 3-5 priority actions (each with a one-line rationale), then ICP drift observations based on win/loss patterns, then any brand / positioning gaps. Do not re-propose work the IC agents are already doing well.',
  },
};

export function nextRunAtFor(cadence: ManagerAgent['cadence']): Date | null {
  const now = Date.now();
  switch (cadence) {
    case 'hourly':
      return new Date(now + 60 * 60 * 1000);
    case 'daily':
      return new Date(now + 24 * 60 * 60 * 1000);
    case 'weekly':
      return new Date(now + 7 * 24 * 60 * 60 * 1000);
    default:
      return null; // manual — only runs when user hits "Run now"
  }
}
