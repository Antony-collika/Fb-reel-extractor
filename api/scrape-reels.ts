import chromium from '@sparticuz/chromium';
import puppeteer from 'puppeteer-core';
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

    const result = await page.evaluate(async () => {
      type LogEntry = { time: string; msg: string; meta: Record<string, unknown> };
      const debugLogs: LogEntry[] = [];
      function log(msg: string, meta: Record<string, unknown> = {}) {
        debugLogs.push({ time: new Date().toISOString(), msg, meta });
      }
      function pause(ms: number): Promise<void> {
        return new Promise<void>((resolve) => setTimeout(resolve, ms));
      }
      function visible(element: Element) {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return rect.width > 0 && rect.height > 0 &&
          style.display !== 'none' && style.visibility !== 'hidden' &&
          Number(style.opacity || 1) > 0;
      }
      function closePopups() {
        const dialogs = Array.from(document.querySelectorAll('[role="dialog"], [aria-modal="true"]')).filter(visible);
        for (const dialog of dialogs) {
          const button = dialog.querySelector(
            '[aria-label="Close"], [aria-label="close"], [aria-label="Đóng"], [data-testid="close-button"]'
          );
          if (button && visible(button)) {
            (button as HTMLElement).click();
            log('Closed visible dialog');
            return;
          }
        }
      }
      const seen = new Map<string, string>();
      function scan() {
        for (const anchor of document.querySelectorAll<HTMLAnchorElement>('a[href]')) {
          try {
            const url = new URL(anchor.href, location.href);
            if (!/(^|\.)facebook\.com$/i.test(url.hostname)) continue;
            const match = url.pathname.match(/\/reel\/([0-9]+)/i);
            if (match && !seen.has(match[1])) {
              seen.set(match[1], `https://www.facebook.com/reel/${match[1]}/`);
            }
          } catch {
            // Ignore malformed anchors.
          }
        }
        return seen.size;
      }
      function findScroller(): HTMLElement | null {
        const preferred = document.querySelector<HTMLElement>('#scrollview');
        if (preferred && preferred.scrollHeight > preferred.clientHeight + 100) return preferred;
        const candidates = Array.from(document.querySelectorAll<HTMLElement>('main, [role="main"], div, section'))
          .filter((element) => {
            const style = getComputedStyle(element);
            return /(auto|scroll)/i.test(style.overflowY) &&
              element.scrollHeight > element.clientHeight + 150 &&
              element.querySelector('a[href*="/reel/"]') !== null;
          });
        candidates.sort((a, b) =>
          b.querySelectorAll('a[href*="/reel/"]').length - a.querySelectorAll('a[href*="/reel/"]').length ||
          b.scrollHeight - a.scrollHeight
        );
        return candidates[0] || null;
      }

      closePopups();
      await pause(500);
      scan();
      const scroller = findScroller();
      const useWindow = !scroller;
      function metrics() {
        return {
          top: useWindow ? window.scrollY : scroller!.scrollTop,
          clientHeight: useWindow ? window.innerHeight : scroller!.clientHeight,
          scrollHeight: useWindow
            ? Math.max(document.documentElement.scrollHeight, document.body?.scrollHeight || 0)
            : scroller!.scrollHeight,
        };
      }
      let idleSteps = 0;
      let previousCount = seen.size;
      let previousHeight = metrics().scrollHeight;
      const maxSteps = 24;
      const idleLimit = 5;
      log('Initial scan complete', { count: seen.size, scroller: useWindow ? 'window' : scroller!.id || scroller!.tagName.toLowerCase() });

      for (let step = 1; step <= maxSteps && idleSteps < idleLimit; step++) {
        closePopups();
        const before = metrics();
        const amount = Math.max(350, Math.floor(before.clientHeight * 0.78));
        if (useWindow) {
          window.scrollTo({ top: before.top + amount, behavior: 'instant' });
          window.dispatchEvent(new WheelEvent('wheel', { deltaY: amount, bubbles: true }));
        } else {
          scroller!.scrollTop = Math.min(before.top + amount, before.scrollHeight);
          scroller!.dispatchEvent(new Event('scroll', { bubbles: true }));
          scroller!.dispatchEvent(new WheelEvent('wheel', { deltaY: amount, bubbles: true }));
        }
        await pause(1200);
        closePopups();
        const count = scan();
        const after = metrics();
        const added = count - previousCount;
        const heightChanged = after.scrollHeight !== previousHeight;
        idleSteps = added > 0 || heightChanged ? 0 : idleSteps + 1;
        log('Scroll scan', { step, count, added, scrollHeight: after.scrollHeight, idleSteps });
        previousCount = count;
        previousHeight = after.scrollHeight;
        if (after.top + after.clientHeight >= after.scrollHeight - 80 && idleSteps >= 2) break;
      }

      const pageState = /\/checkpoint\//i.test(location.pathname)
        ? 'checkpoint'
        : /\/login(?:\/|$)/i.test(location.pathname)
          ? 'login_required'
          : 'loaded';
      return {
        links: Array.from(seen.values()),
        debugLogs,
        status: idleSteps >= idleLimit ? 'stopped_idle_limit' : 'stopped_after_scrolling',
        pageState,
        finalUrl: location.href,
      };
    });

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
