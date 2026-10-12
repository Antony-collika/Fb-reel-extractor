import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer';
import { buildReelsTabUrl } from './reels-url.ts';
import { scrapePage } from './api/scrape-page.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '32kb' }));
  const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

  app.post('/api/scrape-reels', async (req, res) => {
    let browser: Awaited<ReturnType<typeof puppeteer.launch>> | undefined;
    let clientDisconnected = false;
    res.on('close', () => {
      if (!res.writableEnded) {
        clientDisconnected = true;
        void browser?.close().catch(() => undefined);
      }
    });
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
          '--window-size=1280,20000',
        ],
      });
      if (clientDisconnected) {
        await browser.close();
        return;
      }

      const page = await browser.newPage();
      page.setDefaultNavigationTimeout(18000);
      page.setDefaultTimeout(8000);
      await page.setViewport({ width: 1280, height: 20000 });
      await page.setUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
      );

      try {
        // Facebook often keeps network requests open indefinitely; don't wait for networkidle.
        await page.goto(reelsTabUrl, { waitUntil: 'domcontentloaded', timeout: 18000 });
      } catch (error) {
        console.warn('[Puppeteer] Navigation did not finish cleanly:', error);
      }
      if (clientDisconnected) return;
      await new Promise((resolve) => setTimeout(resolve, 1000));
      if (clientDisconnected) return;

      res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache, no-transform');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');
      res.flushHeaders();

      const send = (event: string, data: unknown) => {
        if (!clientDisconnected && !res.destroyed) res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      };

      const evaluationResult = await scrapePage(page, {
        noScroll: false,
        viewportGrowth: true,
        initialViewportHeight: 20000,
        viewportStep: 500,
        maxViewportHeight: 50000,
        deadline: Date.now() + 105000,
        shouldCancel: () => clientDisconnected,
        onLink: (url: string, meta: unknown) => send('link', { url, meta }),
        onProgress: (progress: unknown) => send('progress', progress),
      });

      if (clientDisconnected) return;
      send('done', {
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
      if (clientDisconnected) return;
      if (browser) {
        try { await browser.close(); } catch { /* browser may already be closed */ }
      }
      console.error('Puppeteer scrape reels error:', error);
      if (res.headersSent) {
        if (!res.destroyed) {
          res.write(`event: error\ndata: ${JSON.stringify({ error: error.message || 'Failed to scrape Reels list' })}\n\n`);
          res.end();
        }
      } else {
        res.status(500).json({ error: error.message || 'Failed to scrape Reels list' });
      }
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
