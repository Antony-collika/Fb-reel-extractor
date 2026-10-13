import { timingSafeEqual } from 'node:crypto';
import { saveJob } from './_lib/job-store.ts';

type Req = { method?: string; headers?: Record<string, string | string[] | undefined>; body?: any };
type Res = { status: (code: number) => Res; json: (body: unknown) => void; setHeader?: (name: string, value: string) => void };

function safeEqual(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export default async function handler(req: Req, res: Res) {
  if (req.method !== 'POST') {
    res.setHeader?.('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed. Use POST.' });
  }
  const expected = process.env.SCRAPE_CALLBACK_SECRET;
  const received = req.headers?.['x-scrape-callback-secret'];
  const secret = Array.isArray(received) ? received[0] : received;
  if (!expected || !secret || !safeEqual(secret, expected)) return res.status(401).json({ error: 'Unauthorized callback.' });

  const jobId = typeof req.body?.jobId === 'string' ? req.body.jobId : '';
  if (!/^[0-9a-f-]{36}$/i.test(jobId)) return res.status(400).json({ error: 'Invalid job ID.' });
  const success = req.body?.success === true;
  const result = req.body?.result;
  try {
    await saveJob(success
      ? { jobId, status: 'completed', createdAt: new Date().toISOString(), result: result && typeof result === 'object' ? result : {} }
      : { jobId, status: 'failed', createdAt: new Date().toISOString(), error: typeof req.body?.error === 'string' ? req.body.error.slice(0, 1000) : 'Scraping failed.' });
    return res.status(202).json({ accepted: true });
  } catch (error) {
    console.error('[scrape-result] Save failed:', error);
    return res.status(503).json({ error: 'Could not store scrape result.' });
  }
}
