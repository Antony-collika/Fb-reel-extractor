import handler from '../api/scrape-reels.ts';

const profileUrl = 'https://www.facebook.com/people/Professor-Glitch/61580646125999';

type Payload = {
  success?: boolean;
  count?: number;
  links?: string[];
  pageState?: string;
  status?: string;
  finalUrl?: string;
  error?: string;
};

const response = {
  statusCode: 200,
  body: undefined as Payload | undefined,
  headers: {} as Record<string, string>,
  status(code: number) {
    this.statusCode = code;
    return this;
  },
  json(body: Payload) {
    this.body = body;
    return this;
  },
  setHeader(name: string, value: string) {
    this.headers[name] = value;
  },
};

const startedAt = Date.now();

try {
  await handler(
    { method: 'POST', body: { profileUrl } } as any,
    response as any,
  );

  const elapsedSeconds = Math.round((Date.now() - startedAt) / 1000);
  const result = response.body ?? {};

  console.log(JSON.stringify({
    test: 'live-facebook-reels-acceptance',
    profileUrl,
    httpStatus: response.statusCode,
    count: result.count ?? 0,
    threshold: 61,
    pageState: result.pageState ?? null,
    scraperStatus: result.status ?? null,
    finalUrl: result.finalUrl ?? null,
    elapsedSeconds,
    error: result.error ?? null,
  }, null, 2));

  if (response.statusCode !== 200) {
    throw new Error(`Scraper API returned HTTP ${response.statusCode}: ${result.error ?? 'unknown error'}`);
  }

  if (!Array.isArray(result.links) || (result.count ?? result.links.length) <= 60) {
    throw new Error(`Acceptance test failed: expected more than 60 Reels, got ${result.count ?? result.links?.length ?? 0}`);
  }

  console.log(`PASS: collected ${result.count} Reels (> 60).`);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
