const TTL_SECONDS = 15 * 60;

function config() {
  const url = process.env.UPSTASH_REDIS_REST_URL?.replace(/\/$/, '');
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) throw new Error('Job storage is not configured. Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN.');
  return { url, token };
}

async function command<T>(parts: Array<string | number>): Promise<T> {
  const { url, token } = config();
  const response = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(parts),
  });
  if (!response.ok) throw new Error(`Temporary job storage returned HTTP ${response.status}`);
  const payload = await response.json() as { result?: T; error?: string };
  if (payload.error) throw new Error(payload.error);
  return payload.result as T;
}

export type ScrapeJob = {
  jobId: string;
  status: 'queued' | 'completed' | 'failed';
  createdAt: string;
  result?: Record<string, unknown>;
  error?: string;
};

const key = (jobId: string) => `fb-reels:scrape-job:${jobId}`;

export async function saveJob(job: ScrapeJob): Promise<void> {
  await command(['SET', key(job.jobId), JSON.stringify(job), 'EX', TTL_SECONDS]);
}

export async function readJob(jobId: string): Promise<ScrapeJob | null> {
  const raw = await command<string | null>(['GET', key(jobId)]);
  if (!raw) return null;
  try { return JSON.parse(raw) as ScrapeJob; } catch { return null; }
}
