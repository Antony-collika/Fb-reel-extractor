import handler from '../api/scrape-reels.ts';

const profileUrl = process.env.PROFILE_URL?.trim() || '';
const jobId = process.env.SCRAPE_JOB_ID || '';
const callbackUrl = process.env.VERCEL_CALLBACK_URL || '';
const callbackSecret = process.env.SCRAPE_CALLBACK_SECRET || '';

type Payload = {
  success?: boolean; count?: number; links?: string[]; reelsTabUrl?: string;
  profileId?: string; pageState?: string; status?: string; finalUrl?: string;
  error?: string; debugLogs?: unknown[];
};

const response = {
  statusCode: 200,
  body: undefined as Payload | undefined,
  stream: '',
  status(code: number) { this.statusCode = code; return this; },
  json(body: Payload) { this.body = body; return this; },
  setHeader() {},
  flushHeaders() {},
  write(chunk: string) { this.stream += chunk; return true; },
  end() {
    for (const block of this.stream.split('\n\n')) {
      const event = block.match(/^event:\s*(.+)$/m)?.[1]?.trim();
      const data = block.match(/^data:\s*(.+)$/m)?.[1];
      if (!data) continue;
      try {
        const payload = JSON.parse(data) as Payload;
        if (event === 'done' || event === 'error') this.body = payload;
      } catch { /* Ignore partial SSE frames. */ }
    }
  },
};

async function sendCallback(body: Record<string, unknown>) {
  if (!callbackUrl || !callbackSecret) throw new Error('VERCEL_CALLBACK_URL and SCRAPE_CALLBACK_SECRET must be configured in GitHub Actions secrets.');
  const response = await fetch(callbackUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-scrape-callback-secret': callbackSecret },
    body: JSON.stringify({ jobId, ...body }),
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) throw new Error(`Vercel callback failed with HTTP ${response.status}: ${(await response.text()).slice(0, 300)}`);
}

async function main() {
  if (!profileUrl || !/^[0-9a-f-]{36}$/i.test(jobId)) throw new Error('Missing or invalid PROFILE_URL / SCRAPE_JOB_ID.');
  let result: Payload = {};
  try {
    await handler({ method: 'POST', body: { profileUrl } } as any, response as any);
    result = response.body || {};
    if (response.statusCode !== 200 || !Array.isArray(result.links)) {
      throw new Error(result.error || `Scraper returned HTTP ${response.statusCode} without a result.`);
    }
    await sendCallback({ success: true, result });
    console.log(`Sent ${result.links.length} Reels to Vercel for job ${jobId}.`);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown scrape error';
    try {
      await sendCallback({ success: false, error: message });
    } catch (callbackError) {
      console.error('Could not notify Vercel about the failed scrape:', callbackError);
      throw callbackError;
    }
    throw error;
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
