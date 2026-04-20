import { logger } from '../../utils/logger.js';

export interface TestResult {
  ok: boolean;
  message: string;
  details?: unknown;
}

/**
 * Lightweight, side-effect-free probes for each provider. They make a single
 * cheap call (often an "auth check" or a GET on a small endpoint) so the user
 * can confirm that the credentials they just saved actually work.
 */
export async function runProviderTest(
  providerKey: string,
  values: Record<string, unknown>,
): Promise<TestResult> {
  try {
    switch (providerKey) {
      case 'anthropic':
        return await testAnthropic(values);
      case 'embeddings':
        return await testEmbeddings(values);
      case 'apollo':
        return await testApollo(values);
      case 'clearbit':
        return await testClearbit(values);
      case 'hunter':
        return await testHunter(values);
      case 'unipile':
        return await testUnipile(values);
      case 'proxycurl':
        return await testProxycurl(values);
      case 'smtp':
        return await testSmtp(values);
      default:
        return { ok: false, message: `No test available for ${providerKey}` };
    }
  } catch (err) {
    logger.warn({ err, providerKey }, 'Provider test threw');
    return { ok: false, message: err instanceof Error ? err.message : 'Unknown error' };
  }
}

async function testAnthropic(v: Record<string, unknown>): Promise<TestResult> {
  const apiKey = v.apiKey as string | undefined;
  if (!apiKey) return { ok: false, message: 'API key not set' };
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: (v.fastModel as string) || (v.model as string) || 'claude-haiku-4-5-20251001',
      max_tokens: 8,
      messages: [{ role: 'user', content: 'ping' }],
    }),
  });
  return statusOk(res, 'Anthropic');
}

async function testEmbeddings(v: Record<string, unknown>): Promise<TestResult> {
  const provider = v.provider as string;
  if (provider === 'stub') return { ok: true, message: 'Stub embeddings always available' };
  if (provider === 'openai') {
    const key = v.openaiApiKey as string;
    if (!key) return { ok: false, message: 'OpenAI API key not set' };
    const res = await fetch('https://api.openai.com/v1/models', {
      headers: { Authorization: `Bearer ${key}` },
    });
    return statusOk(res, 'OpenAI');
  }
  if (provider === 'voyage') {
    const key = v.voyageApiKey as string;
    if (!key) return { ok: false, message: 'Voyage API key not set' };
    const res = await fetch('https://api.voyageai.com/v1/embeddings', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'voyage-3', input: ['ping'], input_type: 'document' }),
    });
    return statusOk(res, 'Voyage');
  }
  return { ok: false, message: `Unknown embeddings provider: ${provider}` };
}

async function testApollo(v: Record<string, unknown>): Promise<TestResult> {
  const apiKey = v.apiKey as string;
  if (!apiKey) return { ok: false, message: 'API key not set' };
  const res = await fetch('https://api.apollo.io/v1/organizations/enrich', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ api_key: apiKey, domain: 'apollo.io' }),
  });
  return statusOk(res, 'Apollo');
}

async function testClearbit(v: Record<string, unknown>): Promise<TestResult> {
  const apiKey = v.apiKey as string;
  if (!apiKey) return { ok: false, message: 'API key not set' };
  const res = await fetch('https://company.clearbit.com/v2/companies/find?domain=clearbit.com', {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  // 200 = success, 202 = queued (still proves auth works), 404 = no match (also proves auth).
  if (res.status === 200 || res.status === 202 || res.status === 404) {
    return { ok: true, message: 'Authenticated' };
  }
  return statusOk(res, 'Clearbit');
}

async function testHunter(v: Record<string, unknown>): Promise<TestResult> {
  const apiKey = v.apiKey as string;
  if (!apiKey) return { ok: false, message: 'API key not set' };
  const res = await fetch(`https://api.hunter.io/v2/account?api_key=${encodeURIComponent(apiKey)}`);
  return statusOk(res, 'Hunter');
}

async function testUnipile(v: Record<string, unknown>): Promise<TestResult> {
  const dsn = v.dsn as string;
  const apiKey = v.apiKey as string;
  const accountId = v.accountId as string;
  if (!dsn || !apiKey || !accountId) {
    return { ok: false, message: 'DSN, API key, and account ID are all required' };
  }
  const res = await fetch(`${dsn}/api/v1/accounts/${encodeURIComponent(accountId)}`, {
    headers: { 'X-API-KEY': apiKey, Accept: 'application/json' },
  });
  return statusOk(res, 'Unipile');
}

async function testProxycurl(v: Record<string, unknown>): Promise<TestResult> {
  const apiKey = v.apiKey as string;
  if (!apiKey) return { ok: false, message: 'API key not set' };
  // /credit-balance is a free no-side-effect endpoint that proves the key is live.
  const res = await fetch('https://nubela.co/proxycurl/api/credit-balance', {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  return statusOk(res, 'Proxycurl');
}

async function testSmtp(v: Record<string, unknown>): Promise<TestResult> {
  const host = v.host as string | undefined;
  if (!host) return { ok: false, message: 'SMTP host not set' };
  const nodemailer = await import('nodemailer');
  const transporter = nodemailer.default.createTransport({
    host,
    port: (v.port as number) ?? 587,
    secure: ((v.port as number) ?? 587) === 465,
    auth: v.user ? { user: v.user as string, pass: (v.password as string) ?? '' } : undefined,
  });
  await transporter.verify();
  return { ok: true, message: 'SMTP connection verified' };
}

async function statusOk(res: Response, label: string): Promise<TestResult> {
  if (res.ok) return { ok: true, message: `${label} responded ${res.status}` };
  const body = await res.text();
  return {
    ok: false,
    message: `${label} returned ${res.status}: ${body.slice(0, 200)}`,
  };
}
