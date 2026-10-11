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
};

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader?.('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed. Use POST.' });
  }

  const profileUrl = typeof req.body?.profileUrl === 'string' ? req.body.profileUrl.trim() : '';
  if (!profileUrl) {
    return res.status(400).json({ error: 'Profile URL is required' });
  }

  let target: { profileId: string; reelsTabUrl: string };
  try {
    target = buildReelsTabUrl(profileUrl);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Facebook profile URL is invalid';
    return res.status(400).json({ error: message });
  }

  let browser: Awaited<ReturnType<typeof puppeteer.launch>> | undefined;
  try {
    browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: { width: 1280, height: 1024 },
      executablePath: await chromium.executablePath(),
      headless: true,
    });

    const page = await browser.newPage();
    page.setDefaultNavigationTimeout(25000);
    page.setDefaultTimeout(10000);
    await page.setUserAgent(
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
    );

    try {
      await page.goto(target.reelsTabUrl, { waitUntil: 'domcontentloaded', timeout: 25000 });
    } catch (error) {
      console.warn('[scrape-reels] Navigation warning:', error instanceof Error ? error.message : error);
    }
    await new Promise((resolve) => setTimeout(resolve, 1800));

    const result = await scrapePage(page);

    return res.status(200).json({
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
    return res.status(500).json({ error: message });
  } finally {
    if (browser) {
      try {
        await browser.close();
      } catch (error) {
        console.warn('[scrape-reels] Browser close warning:', error);
      }
    }
  }
}
