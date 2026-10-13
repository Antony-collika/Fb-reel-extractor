import { readJob } from './_lib/job-store.ts';

type Req = { method?: string; query?: { jobId?: unknown } };
type Res = { status: (code: number) => Res; json: (body: unknown) => void; setHeader?: (name: string, value: string) => void };

export default async function handler(req: Req, res: Res) {
  res.setHeader?.('Cache-Control', 'no-store, max-age=0');
  if (req.method !== 'GET') {
    res.setHeader?.('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed. Use GET.' });
  }
  const jobId = typeof req.query?.jobId === 'string' ? req.query.jobId : '';
  if (!/^[0-9a-f-]{36}$/i.test(jobId)) return res.status(400).json({ error: 'Invalid job ID.' });
  try {
    const job = await readJob(jobId);
    if (!job) return res.status(404).json({ error: 'Job not found or expired. Please start a new scrape.' });
    if (job.status === 'failed') return res.status(200).json({ status: 'failed', error: job.error || 'Scraping failed.' });
    if (job.status === 'completed') return res.status(200).json({ status: 'completed', result: job.result });
    return res.status(200).json({ status: 'queued' });
  } catch (error) {
    console.error('[scrape-status] Read failed:', error);
    return res.status(503).json({ error: 'Temporary job storage is unavailable.' });
  }
}
