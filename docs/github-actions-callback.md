# GitHub Actions → Vercel scrape flow

Each click creates a fresh UUID job. Vercel makes one GitHub API request to dispatch `.github/workflows/scrape-reels.yml`; the Action runs the Puppeteer scraper and POSTs its complete result to `/api/scrape-result`. The browser polls only Vercel's `/api/scrape-status`, every 2.5 seconds. Results are stored in Upstash Redis with a 15-minute TTL and are not kept as a permanent history.

## Required setup

1. Create an Upstash Redis database and set `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` in Vercel (Production and Preview as needed).
2. Create a GitHub token with Actions write permission for this repository. Add it to Vercel as `GITHUB_ACTIONS_TOKEN`. Keep it server-side; never use a `VITE_` prefix.
3. Set `SCRAPE_CALLBACK_SECRET` in Vercel to a long random secret.
4. Add GitHub repository Actions secrets:
   - `VERCEL_CALLBACK_URL`: `https://fb-reel-extractor.vercel.app/api/scrape-result`
   - `SCRAPE_CALLBACK_SECRET`: exactly the same secret as in Vercel.
5. Merge this workflow into the repository's default branch (`main`) before relying on `workflow_dispatch`. The Vercel API dispatches the workflow using `SCRAPE_WORKFLOW_REF` (defaults to `main`); change that variable only if you intentionally want to run code from another ref.
6. In Vercel, redeploy after adding environment variables. Git deployments are disabled in `vercel.json` for this repository, so deployment may need to be triggered manually.

## API quota and lifecycle

The website performs one GitHub API dispatch call per click. GitHub Actions sends results to Vercel over ordinary HTTPS; browser polling never calls GitHub. Jobs and results expire after 15 minutes. A callback secret protects the result endpoint, and UUIDs keep concurrent requests separate.

The app uses animated waiting messages, not claimed live scrape progress. If the callback fails, check the workflow logs for the HTTP error.
