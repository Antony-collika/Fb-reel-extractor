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

      console.log(`[Audited Scraper] Launching headless browser for: ${reelsTabUrl}`);

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
      await page.setUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
      );
      await page.setViewport({ width: 1280, height: 1024 });

      try {
        await page.goto(reelsTabUrl, { waitUntil: 'networkidle2', timeout: 35000 });
      } catch (navErr) {
        console.warn('Navigation networkidle2 timeout:', navErr);
      }

      try {
        await page.waitForSelector('a[href*="/reel/"]', { timeout: 10000 });
      } catch (e) {
        console.warn('Initial reels selector wait timeout.');
      }

      await new Promise((r) => setTimeout(r, 3000));

      // Pass script as a raw string literal to page.evaluate to prevent esbuild from injecting __name helper
      const evaluationResult: any = await page.evaluate(`
        (async function() {
          var debugLogs = [];
          var log = function(msg, meta) {
            debugLogs.push({ time: new Date().toISOString(), msg: msg, meta: meta || {} });
          };

          function closePopup() {
            var visible = function(el) {
              var r = el.getBoundingClientRect();
              var s = window.getComputedStyle(el);
              return r.width > 0 && r.height > 0 && s.display !== 'none' && s.visibility !== 'hidden';
            };
            var dialogs = Array.prototype.slice.call(document.querySelectorAll('[role="dialog"], [aria-modal="true"]'))
              .filter(visible);
            var roots = dialogs.length ? dialogs : [document];
            var closeBtn = null;
            for (var i = 0; i < roots.length; i++) {
              var btns = roots[i].querySelectorAll('[aria-label="Close"], [aria-label="close"]');
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
              log('Closed popup dialog');
              return true;
            }
            return false;
          }

          closePopup();
          await new Promise(function(r) { setTimeout(r, 1200); });
          closePopup();

          var scroller = document.querySelector('#scrollview');
          if (!scroller) {
            var all = document.querySelectorAll('*');
            for (var k = 0; k < all.length; k++) {
              var s = window.getComputedStyle(all[k]);
              if (/(auto|scroll)/.test(s.overflowY) && all[k].scrollHeight > all[k].clientHeight + 150) {
                scroller = all[k];
                break;
              }
            }
          }
          if (!scroller || scroller === document.body || scroller === document.documentElement) {
            scroller = window;
          }

          log('Scroller identified', { tag: scroller === window ? 'window' : scroller.tagName });

          var seen = new Map();
          var scan = function() {
            var anchors = document.querySelectorAll('a[href]');
            for (var a = 0; a < anchors.length; a++) {
              try {
                var href = anchors[a].getAttribute('href') || '';
                var m = href.match(/\\/reel\\/(\\d+)/i);
                if (m) {
                  seen.set(m[1], 'https://www.facebook.com/reel/' + m[1] + '/');
                }
              } catch (e) {}
            }
          };

          scan();
          log('Initial scan count', { count: seen.size });

          var maxSteps = 150;
          var idleLimit = 12;
          var idle = 0;
          var prevCount = seen.size;
          var prevHeight = scroller === window ? document.body.scrollHeight : scroller.scrollHeight;

          for (var step = 1; step <= maxSteps && idle < idleLimit; step++) {
            closePopup();

            var clientH = scroller === window ? window.innerHeight : scroller.clientHeight;
            var scrollH = scroller === window ? document.body.scrollHeight : scroller.scrollHeight;
            var scrollT = scroller === window ? window.scrollY : scroller.scrollTop;

            var amount = Math.max(300, Math.floor(clientH * 0.65));

            if (scroller === window) {
              window.scrollBy({ top: amount, behavior: 'smooth' });
              window.dispatchEvent(new WheelEvent('wheel', { deltaY: amount }));
            } else {
              scroller.scrollTop = Math.min(scrollT + amount, scrollH);
              scroller.dispatchEvent(new Event('scroll', { bubbles: true }));
            }

            await new Promise(function(r) { setTimeout(r, 2500); });
            scan();

            var currCount = seen.size;
            var currHeight = scroller === window ? document.body.scrollHeight : scroller.scrollHeight;

            var newLinksAdded = currCount - prevCount;
            var heightChanged = currHeight !== prevHeight;

            if (newLinksAdded > 0 || heightChanged) {
              idle = 0;
            } else {
              idle++;
            }

            log('Step execution', { step: step, count: currCount, added: newLinksAdded, height: currHeight, idle: idle });

            prevCount = currCount;
            prevHeight = currHeight;

            if (scrollT + clientH >= scrollH - 50 && idle >= 4) {
              break;
            }
          }

          var result = [];
          seen.forEach(function(url) {
            result.push(url);
          });

          return {
            links: result,
            debugLogs: debugLogs,
            status: idle >= idleLimit ? 'stopped_idle_limit' : 'stopped_max_steps'
          };
        })()
      `);

      await browser.close();

      res.json({
        success: true,
        profileId,
        reelsTabUrl,
        count: (evaluationResult.links || []).length,
        links: evaluationResult.links || [],
        debugLogs: evaluationResult.debugLogs || [],
        status: evaluationResult.status || 'completed',
      });
    } catch (error: any) {
      if (browser) {
        try { await browser.close(); } catch (_) {}
      }
      console.error('Audited Scraper error:', error);
      res.status(500).json({ error: error.message || 'Failed to scrape reels via audited protocol' });
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
