import chromium from '@sparticuz/chromium';
import puppeteer from 'puppeteer-core';
import { scrapePage } from './scrape-page.js';
import { buildReelsTabUrl } from '../reels-url.ts';

type ApiRequest = {
  method?: string;
  body?: { profileUrl?: unknown };
};

type ApiResponse = {
  status: (code: number) => ApiResponse;
  json: (body: unknown) => void;
  setHeader?: (name: string, value: string) => void;
  flushHeaders?: () => void;
  write?: (chunk: string) => boolean;
  end?: () => void;
  on?: (event: string, listener: (...args: any[]) => void) => void;
  writableEnded?: boolean;
  destroyed?: boolean;
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

  // Stream newly discovered links immediately; the browser UI can render them
  // before this bounded Vercel invocation finishes.
  res.setHeader?.('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader?.('Cache-Control', 'no-cache, no-transform');
  res.setHeader?.('Connection', 'keep-alive');
  res.setHeader?.('X-Accel-Buffering', 'no');
  res.flushHeaders?.();
  let clientDisconnected = false;
  let browser: Awaited<ReturnType<typeof puppeteer.launch>> | undefined;
  res.on?.('close', () => {
    if (!res.writableEnded) {
      clientDisconnected = true;
      void browser?.close().catch(() => undefined);
    }
  });
  const send = (event: string, data: unknown) => {
    if (!clientDisconnected && !res.destroyed && res.write) {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    }
  };
  try {
    browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: { width: 1280, height: 20000 },
      executablePath: await chromium.executablePath(),
      headless: true,
    });
    if (clientDisconnected) {
      await browser.close();
      return;
    }

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
    if (clientDisconnected) return;
    await new Promise((resolve) => setTimeout(resolve, 1000));
    if (clientDisconnected) return;

    const result = await scrapePage(page, {
      noScroll: false,
      viewportGrowth: true,
      initialViewportHeight: 20000,
      viewportStep: 1000,
      maxViewportHeight: 50000,
      deadline: Date.now() + 105000,
      shouldCancel: () => clientDisconnected,
      onLink: (url: string, meta: unknown) => send('link', { url, meta }),
      onProgress: (progress: unknown) => send('progress', progress),
    });

    if (clientDisconnected) return;
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
