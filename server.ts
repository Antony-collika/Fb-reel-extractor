import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer';
import { buildReelsTabUrl } from './reels-url.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '32kb' }));
  const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

  app.post('/api/scrape-reels', async (req, res) => {
    let browser: Awaited<ReturnType<typeof puppeteer.launch>> | undefined;
    try {
      const profileUrl = typeof req.body?.profileUrl === 'string' ? req.body.profileUrl : '';
      if (!profileUrl.trim()) {
        return res.status(400).json({ error: 'Profile URL is required' });
      }

      let target: { profileId: string; reelsTabUrl: string };
      try {
        target = buildReelsTabUrl(profileUrl);
      } catch (error: any) {
        return res.status(400).json({ error: error.message || 'Facebook profile URL is invalid' });
      }
      const { profileId, reelsTabUrl } = target;
      console.log(`[Puppeteer] Opening Reels list: ${reelsTabUrl}`);

      browser = await puppeteer.launch({
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
          '--disable-notifications',
          '--window-size=1280,1024',
        ],
      });

      const page = await browser.newPage();
      page.setDefaultNavigationTimeout(45000);
      page.setDefaultTimeout(12000);
      await page.setViewport({ width: 1280, height: 1024 });
      await page.setUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
      );

      try {
        // Facebook often keeps network requests open indefinitely; don't wait for networkidle.
        await page.goto(reelsTabUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
      } catch (error) {
        console.warn('[Puppeteer] Navigation did not finish cleanly:', error);
      }

      await new Promise((resolve) => setTimeout(resolve, 2500));

      const evaluationResult = await page.evaluate(async () => {
        type LogEntry = { time: string; msg: string; meta: Record<string, unknown> };
        const debugLogs: LogEntry[] = [];
        const log = (msg: string, meta: Record<string, unknown> = {}) => {
          debugLogs.push({ time: new Date().toISOString(), msg, meta });
        };
        const pause = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

        const isVisible = (element: Element) => {
          const rect = element.getBoundingClientRect();
          const style = window.getComputedStyle(element);
          return rect.width > 0 && rect.height > 0 &&
            style.display !== 'none' && style.visibility !== 'hidden' &&
            Number(style.opacity || 1) > 0;
        };

        const closePopups = () => {
          const dialogs = Array.from(document.querySelectorAll('[role="dialog"], [aria-modal="true"]'))
            .filter(isVisible);
          for (const dialog of dialogs) {
            const close = dialog.querySelector(
              '[aria-label="Close"], [aria-label="close"], [aria-label="Đóng"], [data-testid="close-button"]'
            );
            if (close && isVisible(close)) {
              (close as HTMLElement).click();
              log('Closed visible dialog');
              return true;
            }
          }
          return false;
        };

        const getReelUrl = (anchor: HTMLAnchorElement): { id: string; url: string } | null => {
          try {
            const url = new URL(anchor.href, location.href);
            if (!/(^|\.)facebook\.com$/i.test(url.hostname)) return null;
            const match = url.pathname.match(/\/reel\/([0-9]+)/i);
            if (!match) return null;
            return { id: match[1], url: `https://www.facebook.com/reel/${match[1]}/` };
          } catch {
            return null;
          }
        };

        const seen = new Map<string, string>();
        const scan = () => {
          const anchors = document.querySelectorAll<HTMLAnchorElement>('a[href]');
          for (const anchor of anchors) {
            const reel = getReelUrl(anchor);
            if (reel && !seen.has(reel.id)) seen.set(reel.id, reel.url);
          }
          return seen.size;
        };

        closePopups();
        await pause(800);
        closePopups();
        scan();

        // Prefer a scrollable ancestor that actually contains Reel links. Facebook changes
        // its internal DOM often, so avoid relying on a single undocumented selector.
        const findScroller = (): HTMLElement | null => {
          const preferred = document.querySelector<HTMLElement>('#scrollview');
          if (preferred && preferred.scrollHeight > preferred.clientHeight + 100) return preferred;

          const candidates = Array.from(document.querySelectorAll<HTMLElement>('main, [role="main"], div, section'))
            .filter((el) => {
              const style = getComputedStyle(el);
              return /(auto|scroll)/i.test(style.overflowY) &&
                el.scrollHeight > el.clientHeight + 150 &&
                el.querySelector('a[href*="/reel/"]') !== null;
            });
          candidates.sort((a, b) => {
            const aCount = a.querySelectorAll('a[href*="/reel/"]').length;
            const bCount = b.querySelectorAll('a[href*="/reel/"]').length;
            return bCount - aCount || b.scrollHeight - a.scrollHeight;
          });
          return candidates[0] || null;
        };

        const scroller = findScroller();
        const useWindow = !scroller;
        const getMetrics = () => ({
          top: useWindow ? window.scrollY : scroller!.scrollTop,
          clientHeight: useWindow ? window.innerHeight : scroller!.clientHeight,
          scrollHeight: useWindow
            ? Math.max(document.documentElement.scrollHeight, document.body?.scrollHeight || 0)
            : scroller!.scrollHeight,
        });

        log('Initial scan complete', {
          count: seen.size,
          scroller: useWindow ? 'window' : scroller!.id || scroller!.tagName.toLowerCase(),
        });

        let idleSteps = 0;
        let previousCount = seen.size;
        let previousHeight = getMetrics().scrollHeight;
        const maxSteps = 180;
        const idleLimit = 8;

        for (let step = 1; step <= maxSteps && idleSteps < idleLimit; step++) {
          closePopups();
          const before = getMetrics();
          const amount = Math.max(350, Math.floor(before.clientHeight * 0.78));

          if (useWindow) {
            window.scrollTo({ top: before.top + amount, behavior: 'instant' });
            window.dispatchEvent(new WheelEvent('wheel', { deltaY: amount, bubbles: true }));
          } else {
            scroller!.scrollTop = Math.min(before.top + amount, before.scrollHeight);
            scroller!.dispatchEvent(new Event('scroll', { bubbles: true }));
            scroller!.dispatchEvent(new WheelEvent('wheel', { deltaY: amount, bubbles: true }));
          }

          await pause(1800);
          closePopups();
          const currentCount = scan();
          const after = getMetrics();
          const added = currentCount - previousCount;
          const heightChanged = after.scrollHeight !== previousHeight;

          idleSteps = added > 0 || heightChanged ? 0 : idleSteps + 1;
          log('Scroll scan', {
            step,
            count: currentCount,
            added,
            scrollHeight: after.scrollHeight,
            idleSteps,
          });

          previousCount = currentCount;
          previousHeight = after.scrollHeight;

          const atBottom = after.top + after.clientHeight >= after.scrollHeight - 80;
          if (atBottom && idleSteps >= 3) break;
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

      await browser.close();
      browser = undefined;

      res.json({
        success: true,
        profileId,
        reelsTabUrl,
        count: evaluationResult.links.length,
        links: evaluationResult.links,
        debugLogs: evaluationResult.debugLogs,
        status: evaluationResult.status,
        pageState: evaluationResult.pageState,
        finalUrl: evaluationResult.finalUrl,
      });
    } catch (error: any) {
      if (browser) {
        try { await browser.close(); } catch { /* browser may already be closed */ }
      }
      console.error('Puppeteer scrape reels error:', error);
      res.status(500).json({ error: error.message || 'Failed to scrape Reels list' });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => res.sendFile(path.resolve(distPath, 'index.html')));
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
