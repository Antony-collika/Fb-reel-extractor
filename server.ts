import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function startServer() {
  const app = express();
  app.use(express.json());

  const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

  function buildReelsTabUrl(inputUrl: string): { profileId: string; reelsTabUrl: string } {
    let clean = inputUrl.trim();
    if (!clean.startsWith('http')) {
      clean = 'https://' + clean;
    }
    try {
      const u = new URL(clean);
      const idParam = u.searchParams.get('id');
      const peopleMatch = u.pathname.match(/\/people\/[^/]+\/(\d+)/i);
      const profileId = idParam || (peopleMatch ? peopleMatch[1] : null);

      if (profileId) {
        return {
          profileId,
          reelsTabUrl: `https://www.facebook.com/profile.php?id=${profileId}&sk=reels_tab`,
        };
      } else {
        const cleanPath = u.pathname.replace(/\/$/, '');
        return {
          profileId: cleanPath.split('/').pop() || 'unknown',
          reelsTabUrl: `https://www.facebook.com${cleanPath}/reels/`,
        };
      }
    } catch (e) {
      return {
        profileId: '61580646125999',
        reelsTabUrl: 'https://www.facebook.com/profile.php?id=61580646125999&sk=reels_tab',
      };
    }
  }

  app.post('/api/scrape-reels', async (req, res) => {
    let browser;
    try {
      const { profileUrl } = req.body;
      if (!profileUrl) {
        return res.status(400).json({ error: 'Profile URL is required' });
      }

      const { profileId, reelsTabUrl } = buildReelsTabUrl(profileUrl);

      console.log(`[Puppeteer] Launching headless browser for: ${reelsTabUrl}`);

      browser = await puppeteer.launch({
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
          '--disable-notifications',
          '--window-size=1280,800',
        ],
      });

      const page = await browser.newPage();
      await page.setUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
      );
      await page.setViewport({ width: 1280, height: 900 });

      try {
        await page.goto(reelsTabUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
      } catch (navErr) {
        console.warn('Navigation timeout/redirect:', navErr);
      }

      await new Promise((r) => setTimeout(r, 4000));

      const extractedLinks = await page.evaluate(async function() {
        function closePopup() {
          var visible = function(el: any) {
            var r = el.getBoundingClientRect();
            var s = window.getComputedStyle(el);
            return r.width > 0 && r.height > 0 && s.display !== 'none' && s.visibility !== 'hidden';
          };
          var dialogs = Array.prototype.slice.call(document.querySelectorAll('[role="dialog"], [aria-modal="true"]'))
            .filter(visible);
          var roots = dialogs.length ? dialogs : [document];
          var closeBtn: any = null;
          for (var i = 0; i < roots.length; i++) {
            var btns = roots[i].querySelectorAll('[aria-label="Close"], [aria-label="close"], button');
            for (var j = 0; j < btns.length; j++) {
              if (visible(btns[j]) && /^(close|đóng|dismiss)$/i.test(btns[j].getAttribute('aria-label') || '')) {
                closeBtn = btns[j];
                break;
              }
            }
            if (closeBtn) break;
          }
          if (closeBtn) {
            closeBtn.click();
            return true;
          }
          return false;
        }

        closePopup();
        await new Promise(function(r) { setTimeout(r, 1000); });
        closePopup();

        var seen = new Map();
        var scan = function() {
          var anchors = document.querySelectorAll('a[href]');
          for (var a = 0; a < anchors.length; a++) {
            try {
              var href = anchors[a].getAttribute('href') || '';
              var m = href.match(/\/reel\/(\d+)/i);
              if (m) {
                seen.set(m[1], 'https://www.facebook.com/reel/' + m[1] + '/');
              }
            } catch (e) {}
          }
        };

        scan();

        var maxSteps = 30;
        var idleLimit = 5;
        var idle = 0;
        var prevCount = seen.size;

        for (var step = 1; step <= maxSteps && idle < idleLimit; step++) {
          closePopup();
          window.scrollBy({ top: 1200, behavior: 'smooth' });
          window.dispatchEvent(new WheelEvent('wheel', { deltaY: 1200 }));

          await new Promise(function(r) { setTimeout(r, 2000); });
          scan();

          var currCount = seen.size;
          if (currCount > prevCount) {
            idle = 0;
          } else {
            idle++;
          }
          prevCount = currCount;
        }

        var result: string[] = [];
        seen.forEach(function(url) {
          result.push(url);
        });
        return result;
      });

      await browser.close();

      res.json({
        success: true,
        profileId,
        reelsTabUrl,
        count: extractedLinks.length,
        links: extractedLinks,
      });
    } catch (error: any) {
      if (browser) {
        try { await browser.close(); } catch (_) {}
      }
      console.error('Puppeteer scrape reels error:', error);
      res.status(500).json({ error: error.message || 'Failed to scrape reels via headless browser' });
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
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
