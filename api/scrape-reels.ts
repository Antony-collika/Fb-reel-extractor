import chromium from '@sparticuz/chromium';
import puppeteer from 'puppeteer-core';
import { scrapePage } from './scrape-page.js';
import { buildReelsTabUrl } from '../reels-url.ts';

type ApiRequest = {
  method?: string;
  body?: { profileUrl?: unknown; knownLinks?: unknown; resumeAfterId?: unknown };
};

type ApiResponse = {
  status: (code: number) => ApiResponse;
  json: (body: unknown) => void;
  setHeader?: (name: string, value: string) => void;
  flushHeaders?: () => void;
  write?: (chunk: string) => boolean;
  end?: () => void;
};

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader?.('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed. Use POST.' });
  }

  const profileUrl = typeof req.body?.profileUrl === 'string' ? req.body.profileUrl.trim() : '';
  if (!profileUrl) return res.status(400).json({ error: 'Profile URL is required' });

  let target: { profileId: string; reelsTabUrl: string };
  try {
    target = buildReelsTabUrl(profileUrl);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Facebook profile URL is invalid';
    return res.status(400).json({ error: message });
  }

  const rawKnownLinks = req.body?.knownLinks;
  const knownLinks = Array.isArray(rawKnownLinks)
    ? rawKnownLinks.filter((link): link is string => typeof link === 'string' && /facebook\.com\/reel\/\d+/i.test(link)).slice(-5000)
    : [];
  const resumeAfterId = typeof req.body?.resumeAfterId === 'string' && /^\d+$/.test(req.body.resumeAfterId)
    ? req.body.resumeAfterId
    : null;

  // Stream newly discovered links immediately; the browser UI can render them
  // before this bounded Vercel invocation finishes.
  res.setHeader?.('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader?.('Cache-Control', 'no-cache, no-transform');
  res.setHeader?.('Connection', 'keep-alive');
  res.setHeader?.('X-Accel-Buffering', 'no');
  res.flushHeaders?.();
  const send = (event: string, data: unknown) => {
    if (res.write) res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  let browser: Awaited<ReturnType<typeof puppeteer.launch>> | undefined;
  try {
    browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: { width: 1280, height: 12000 },
      executablePath: await chromium.executablePath(),
      headless: true,
    });

    const page = await browser.newPage();
    page.setDefaultNavigationTimeout(18000);
    page.setDefaultTimeout(8000);
    await page.setUserAgent(
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
    );

    try {
      await page.goto(target.reelsTabUrl, { waitUntil: 'domcontentloaded', timeout: 18000 });
    } catch (error) {
      console.warn('[scrape-reels] Navigation warning:', error instanceof Error ? error.message : error);
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));

    const result = await scrapePage(page, {
      knownLinks,
      resumeAfterId,
      noScroll: true,
      deadline: Date.now() + 30000,
      onLink: (url: string, meta: unknown) => send('link', { url, meta }),
      onProgress: (progress: unknown) => send('progress', progress),
    });

    send('done', {
      success: true,
      profileId: target.profileId,
      reelsTabUrl: target.reelsTabUrl,
      count: result.links.length,
      links: result.links,
      debugLogs: result.debugLogs,
      status: result.status,
      pageState: result.pageState,
      finalUrl: result.finalUrl,
      resumeAfterId: result.resumeAfterId,
    });
  } catch (error) {
    console.error('[scrape-reels] Error:', error);
    const message = error instanceof Error ? error.message : 'Failed to scrape Reels list';
    send('error', { error: message });
  } finally {
    if (browser) {
      try {
        await browser.close();
      } catch (error) {
        console.warn('[scrape-reels] Browser close warning:', error);
      }
    }
    res.end?.();
  }
}
