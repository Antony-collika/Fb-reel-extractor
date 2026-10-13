import { scrapeProfile } from './scrape-local.ts';

const profileUrl = process.env.TEST_PROFILE_URL || 'https://www.facebook.com/people/Professor-Glitch/61580646125999/?sk=reels_tab';
const startedAt = Date.now();

try {
  const result = await scrapeProfile(profileUrl);
  const elapsedSeconds = Math.round((Date.now() - startedAt) / 1000);
  console.log(JSON.stringify({
    test: 'live-facebook-reels-acceptance',
    profileUrl,
    count: result.count,
    threshold: 61,
    pageState: result.pageState,
    scraperStatus: result.status,
    finalUrl: result.finalUrl,
    debugLogs: result.debugLogs,
    elapsedSeconds,
  }, null, 2));

  if (!Array.isArray(result.links) || result.links.length <= 60) {
    throw new Error(`Acceptance test failed: expected more than 60 Reels, got ${result.links?.length ?? 0}`);
  }
  console.log(`PASS: collected ${result.count} Reels (> 60).`);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
