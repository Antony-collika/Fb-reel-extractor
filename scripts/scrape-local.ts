import chromium from '@sparticuz/chromium';
import puppeteer from 'puppeteer-core';
import { scrapePage } from '../api/scrape-page.js';
import { buildReelsTabUrl } from '../reels-url.ts';

export async function scrapeProfile(profileUrl: string) {
  const target = buildReelsTabUrl(profileUrl);
  const browser = await puppeteer.launch({
    args: chromium.args,
    defaultViewport: { width: 1280, height: 20000 },
    executablePath: await chromium.executablePath(),
    headless: true,
  });
  try {
    const page = await browser.newPage();
    page.setDefaultNavigationTimeout(18000);
    page.setDefaultTimeout(8000);
    await page.setUserAgent(
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
    );
    try {
      await page.goto(target.reelsTabUrl, { waitUntil: 'domcontentloaded', timeout: 18000 });
    } catch (error) {
      console.warn('[scrape-job] Navigation warning:', error instanceof Error ? error.message : error);
    }
    await new Promise(resolve => setTimeout(resolve, 1000));
    const result = await scrapePage(page, {
      noScroll: false,
      viewportGrowth: true,
      initialViewportHeight: 5000,
      viewportStep: 2000,
      maxViewportHeight: 50000,
      deadline: Date.now() + 105000,
      onLink: () => {},
      onProgress: () => {},
    });
    return {
      success: true,
      profileId: target.profileId,
      reelsTabUrl: target.reelsTabUrl,
      count: result.links.length,
      links: result.links,
      debugLogs: result.debugLogs,
      status: result.status,
      pageState: result.pageState,
      finalUrl: result.finalUrl,
    };
  } finally {
    await browser.close().catch(error => console.warn('[scrape-job] Browser close warning:', error));
  }
}
