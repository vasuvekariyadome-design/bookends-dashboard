# Unattended daily refresh — setup

This repo refreshes itself every morning on **GitHub's servers** (GitHub Actions).
No PC, no Claude, nothing open. It needs exactly **one secret**: an Instagram access token.

- Workflow: `.github/workflows/refresh.yml` (cron `23 1 * * *` = 06:53 IST daily, + manual run)
- Fetcher: `scripts/refresh.mjs` (Meta Graph API → rewrites `index.html`)
- Publishing: automatic (the workflow's built-in token pushes the commit)

## The one thing to provide: `IG_ACCESS_TOKEN`

A long-lived Instagram/Page access token with these permissions:
`instagram_basic`, `instagram_manage_insights`, `pages_show_list`, `pages_read_engagement`.

### Getting it (uses the same Meta app as the WhatsApp tool)
1. https://developers.facebook.com → your app → **Tools → Graph API Explorer**.
2. Pick your app, click **Generate Access Token**, log in, and grant the 4 permissions above.
3. That token is short-lived. Make it long-lived (≈60 days) by opening this URL
   (replace APP_ID / APP_SECRET / SHORT_TOKEN):
   `https://graph.facebook.com/v21.0/oauth/access_token?grant_type=fb_exchange_token&client_id=APP_ID&client_secret=APP_SECRET&fb_exchange_token=SHORT_TOKEN`
4. For a token that effectively never expires, call `https://graph.facebook.com/v21.0/me/accounts?access_token=LONG_TOKEN`
   and use the `access_token` of the Page linked to your Instagram account — Page tokens don't expire.

### Storing it
GitHub repo → **Settings → Secrets and variables → Actions → New repository secret**
- Name: `IG_ACCESS_TOKEN`
- Value: the token

(Optional) add a repo **Variable** `GRAPH_VERSION` = `v21.0` to pin/upgrade the API version.

## Run it
Repo → **Actions → "Daily dashboard refresh" → Run workflow**. Watch it go green, then the
live page updates within ~1 minute. After that it runs on its own every morning.

## If a brand fails
The script leaves that brand's data untouched and logs why — it never invents numbers.
