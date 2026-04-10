import { claudeJson } from './anthropic.js';
import { logger } from '../../utils/logger.js';

interface BusinessAnalysis {
  companySummary: string;
  valueProposition: string;
  keyDifferentiators: string[];
  targetVerticals: string[];
  painPointsSolved: string[];
  suggestedIcps: Array<{
    name: string;
    description: string;
    targetJobTitles: string[];
    targetIndustries: string[];
    targetCompanySizes: string[];
  }>;
}

async function fetchWebsiteContent(url: string): Promise<string> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'CloserAIBot/1.0' },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return '';
    const html = await res.text();
    // Quick-and-dirty text extraction — strip scripts, styles, tags.
    return html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .slice(0, 20_000);
  } catch (err) {
    logger.warn({ err, url }, 'Failed to fetch website');
    return '';
  }
}

export async function analyzeBusiness(websiteUrl: string): Promise<BusinessAnalysis> {
  const content = await fetchWebsiteContent(websiteUrl);

  const prompt = `You are a B2B sales strategist. Analyze the following website content and produce a structured business analysis.

Website: ${websiteUrl}
Content:
${content || '(content could not be fetched)'}

Return JSON with these keys:
- companySummary (string, 2-3 sentences)
- valueProposition (string, 1 sentence)
- keyDifferentiators (array of 3-5 short strings)
- targetVerticals (array of likely target industries)
- painPointsSolved (array of 3-5 pain points this product addresses)
- suggestedIcps (array of 2-3 ideal customer profiles, each with: name, description, targetJobTitles (array), targetIndustries (array), targetCompanySizes (array from "1-10","11-50","51-200","201-500","501-1000","1001-5000","5000+"))`;

  return claudeJson<BusinessAnalysis>(prompt, { maxTokens: 2048, temperature: 0.4 });
}
