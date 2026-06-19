# Daily refresh procedure — Bookends dashboard

This repo serves a **static** dashboard at
`https://vasuvekariyadome-design.github.io/bookends-dashboard/`.
The page has no live data connection when opened on the web, so fresh numbers must be
**baked into `index.html`** by a daily agent that has the Supermetrics + TickTick MCP tools.

The agent's job each morning: pull fresh Instagram metrics, rewrite the data inside
`index.html`, commit, and push. GitHub Pages redeploys automatically (~1 min).

Currency/locale: INR, India. **Never invent numbers** — if a query fails for a brand,
leave that brand's data untouched and note it in the commit message.

## Brands (Supermetrics ds_id = `IGI`, Instagram Insights)

| Brand    | account id            | history start |
|----------|-----------------------|---------------|
| Capiche  | `17841418368091658`   | last 90 days  |
| Aiko     | `17841449386057518`   | last 90 days  |
| Bookends | `17841463855235063`   | since 2024-06-20 |

## Step 1 — pull posts for each brand

```
data_query(
  ds_id="IGI",
  ds_accounts="<account id>",
  fields="timestamp,media_type,media_like_count,media_comments_count,media_saved,media_shares,media_reach,interactions,media_permalink,caption",
  date_range_type="custom",
  start_date=<90 days ago, or 2024-06-20 for Bookends>,
  end_date=<today>,
  max_rows=300, compress=true
)
```
Then poll `get_async_query_results(schedule_id=...)` until `status=="completed"`.
The data_query call sometimes times out before returning the schedule_id — just retry it.
Map columns by `requested_field_ids` (the API returns dimensions before metrics, so the
column order differs from the request).

## Step 2 — build each post row

Target row shape (this is what `index.html` expects):
```
[date, type, likes, comments, saves, shares, reach, interactions, url, caption]
```
- `date`  → `timestamp` sliced to `YYYY-MM-DD`
- `type`  → map `VIDEO`/`REELS` → `"Reel"`, `CAROUSEL_ALBUM` → `"Carousel"`, `IMAGE` → `"Image"`
- numbers → integers (`0` if blank)
- `url`   → `media_permalink`
- `caption` → real caption, trimmed to ~40 chars, with `"` and newlines stripped (keep it
  safe to embed in a JS string). If empty, use `""`.
Sort rows newest-first (matches the existing file).

## Step 3 — rewrite `index.html`

For each brand, replace the contents of that brand's `posts:[ ... ]` array (inside the
`const DATA={...}` block) with the freshly built rows. Replace **only** the rows — keep the
surrounding `name/handle/acct/color/followers/media/thr/deep` fields exactly as they are.

Also update the snapshot date:
```
const SNAPSHOT_DATE="<today YYYY-MM-DD>";
```

Leave the `deep:{...}`, `EXTRA`, `BENCH`, `CAL`, `STORYP` blocks unchanged — they are
labelled "snapshot" in the UI on purpose. (Followers/media counts also change slowly; leave
them unless explicitly asked to refresh.)

## Step 4 — TickTick backlog (optional, if TickTick MCP is available)

`get_project_with_undone_tasks(project_id="6a2cfbb9ebcdba000000029f")`, count the undone
tasks, and update `const BACKLOG={... total:<n> ...}`. If TickTick is unavailable, skip it.

## Step 5 — commit and push

```
git add index.html
git commit -m "Daily refresh — <today>  (Capiche/Aiko/Bookends posts)"
git push origin main
```
If a brand's query failed, say so in the commit message and do not touch that brand's rows.

## Verify

After pushing, the live page updates within ~1 minute. The header pill still reads
"Snapshot · <date>" because that text reflects the baked date — that's expected for the
static/hosted version. Confirm `SNAPSHOT_DATE` advanced to today.
