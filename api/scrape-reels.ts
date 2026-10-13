import { randomUUID } from 'node:crypto';
import { buildReelsTabUrl } from '../reels-url.ts';
import { saveJob } from './_lib/job-store.ts';

type Req = { method?: string; body?: { profileUrl?: unknown } };
type Res = { status: (code: number) => Res; json: (body: unknown) => void; setHeader?: (name: string, value: string) => void };

export default async function handler(req: Req, res: Res) {
  if (req.method !== 'POST') {
    res.setHeader?.('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed. Use POST.' });
  }

  const profileUrl = typeof req.body?.profileUrl === 'string' ? req.body.profileUrl.trim() : '';
  if (!profileUrl) return res.status(400).json({ error: 'Profile URL is required.' });
  try { buildReelsTabUrl(profileUrl); } catch (error) {
    return res.status(400).json({ error: error instanceof Error ? error.message : 'Invalid Facebook profile URL.' });
  }

  const token = process.env.GITHUB_ACTIONS_TOKEN;
  const repository = process.env.GITHUB_REPOSITORY || 'Antony-collika/Fb-reel-extractor';
  const workflowRef = process.env.SCRAPE_WORKFLOW_REF || 'main';
  if (!token) return res.status(503).json({ error: 'GitHub Actions is not configured yet. Set GITHUB_ACTIONS_TOKEN in Vercel.' });

  const jobId = randomUUID();
  try {
    await saveJob({ jobId, status: 'queued', createdAt: new Date().toISOString() });
    const response = await fetch(`https://api.github.com/repos/${repository}/actions/workflows/scrape-reels.yml/dispatches`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ref: workflowRef, inputs: { profile_url: profileUrl, job_id: jobId } }),
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      await saveJob({ jobId, status: 'failed', createdAt: new Date().toISOString(), error: `Could not start GitHub Actions (HTTP ${response.status}). ${detail.slice(0, 300)}` });
      return res.status(502).json({ error: 'Không thể khởi chạy GitHub Actions. Hãy kiểm tra token và workflow trên nhánh main.' });
    }
    return res.status(202).json({ jobId, status: 'queued' });
  } catch (error) {
    console.error('[scrape-reels] Dispatch failed:', error);
    return res.status(503).json({ error: error instanceof Error ? error.message : 'Could not start scrape job.' });
  }
}
