import { scrapeProfile } from './scrape-local.ts';

const profileUrl = process.env.PROFILE_URL?.trim() || '';
const jobId = process.env.SCRAPE_JOB_ID || '';
const callbackUrl = process.env.VERCEL_CALLBACK_URL || '';
const callbackSecret = process.env.SCRAPE_CALLBACK_SECRET || '';

type Payload = {
  success?: boolean; count?: number; links?: string[]; reelsTabUrl?: string;
  profileId?: string; pageState?: string; status?: string; finalUrl?: string;
  error?: string; debugLogs?: unknown[];
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
    result = await scrapeProfile(profileUrl) as Payload;
    if (!Array.isArray(result.links)) throw new Error('Scraper did not return a links array.');
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
