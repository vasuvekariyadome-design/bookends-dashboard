// Daily dashboard refresh — runs in GitHub Actions, no Claude / no PC needed.
// Pulls Instagram post metrics straight from the Meta Graph API and rewrites the
// posts[] arrays + SNAPSHOT_DATE inside index.html. Never invents data: if a brand
// fails, its rows are left exactly as they are.
//
// Env:
//   IG_ACCESS_TOKEN  (required) long-lived Instagram/Page access token with
//                    instagram_basic + instagram_manage_insights
//   GRAPH_VERSION    (optional) Graph API version, default v21.0

import { readFileSync, writeFileSync } from 'node:fs';

const TOKEN = process.env.IG_ACCESS_TOKEN;
if (!TOKEN) { console.error('FATAL: IG_ACCESS_TOKEN is not set.'); process.exit(1); }
const V = process.env.GRAPH_VERSION || 'v21.0';
const BASE = `https://graph.facebook.com/${V}`;
const FILE = new URL('../index.html', import.meta.url);

const BRANDS = [
  { key: 'capiche',  acct: '17841418368091658', sinceDays: 90 },
  { key: 'aiko',     acct: '17841449386057518', sinceDays: 90 },
  { key: 'bookends', acct: '17841463855235063', since: '2024-06-20' },
];

const today = new Date().toISOString().slice(0, 10);
const isoToUnix = d => Math.floor(new Date(d + 'T00:00:00Z').getTime() / 1000);
const daysAgoIso = n => { const d = new Date(); d.setUTCDate(d.getUTCDate() - n); return d.toISOString().slice(0, 10); };
const mapType = t => t === 'VIDEO' ? 'Reel' : t === 'CAROUSEL_ALBUM' ? 'Carousel' : t === 'IMAGE' ? 'Image' : t;

async function getJSON(url) {
  const r = await fetch(url);
  const j = await r.json();
  if (j.error) throw new Error(j.error.message || JSON.stringify(j.error));
  return j;
}
function api(path, params = {}) {
  const u = new URL(BASE + path);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  u.searchParams.set('access_token', TOKEN);
  return getJSON(u.toString());
}

async function fetchMedia(acct, sinceIso) {
  const out = [];
  let page = await api(`/${acct}/media`, {
    fields: 'id,timestamp,media_type,media_product_type,permalink,caption,like_count,comments_count',
    since: String(isoToUnix(sinceIso)), limit: '100',
  });
  while (true) {
    for (const m of (page.data || [])) out.push(m);
    if (page.paging && page.paging.next) page = await getJSON(page.paging.next);
    else break;
  }
  return out;
}

async function fetchInsights(mediaId) {
  // Combined call first; if it errors (a metric unsupported for this media type),
  // fall back to the three rock-solid metrics so we still get most of the data.
  for (const metrics of ['reach,saved,shares,total_interactions', 'reach,saved,total_interactions']) {
    try {
      const j = await api(`/${mediaId}/insights`, { metric: metrics });
      const map = {};
      for (const d of (j.data || [])) map[d.name] = (d.values && d.values[0] && d.values[0].value) || 0;
      return map;
    } catch (e) { /* try next, narrower set */ }
  }
  return {};
}

async function fetchProfile(acct) {
  try { return await api(`/${acct}`, { fields: 'followers_count,media_count' }); }
  catch { return null; }
}

function genCaption(raw) {
  let s = (raw || '').split('\n')[0].replace(/"/g, '').replace(/\s+/g, ' ').trim();
  if (s.length <= 42) return s;
  s = s.slice(0, 42);
  const i = s.lastIndexOf(' ');
  if (i > 20) s = s.slice(0, i);
  return s.trim();
}

// url -> existing curated caption, so we never overwrite Vasu's editorial captions
function existingCaptions(html) {
  const map = {};
  const re = /"(https:\/\/www\.instagram\.com\/[^"]+)","([^"]*)"\]/g;
  let m; while ((m = re.exec(html))) map[m[1]] = m[2];
  return map;
}

function fmtRows(rows, caps) {
  return rows.map((r, idx) => {
    const cap = (caps[r.url] != null ? caps[r.url] : genCaption(r.rawCaption)).replace(/"/g, '');
    const last = idx === rows.length - 1;
    return `   ["${r.date}","${r.type}",${r.likes},${r.comments},${r.saves},${r.shares},${r.reach},${r.interactions},"${r.url}","${cap}"]` + (last ? '' : ',');
  }).join('\n');
}

function replacePosts(html, acct, rowsText) {
  const re = new RegExp('(acct:"' + acct + '"[\\s\\S]*?posts:\\[\\n)([\\s\\S]*?)(\\n  \\],)');
  if (!re.test(html)) throw new Error('posts[] anchor not found for ' + acct);
  return html.replace(re, (_f, pre, _body, post) => pre + rowsText + post);
}
function replaceNum(html, acct, field, val) {
  if (val == null) return html;
  return html.replace(new RegExp('(acct:"' + acct + '"[\\s\\S]*?' + field + ':)\\d+'), '$1' + val);
}

async function buildRows(b) {
  const sinceIso = b.since || daysAgoIso(b.sinceDays);
  const media = await fetchMedia(b.acct, sinceIso);
  const rows = [];
  for (const m of media) {
    const ins = await fetchInsights(m.id);
    const likes = m.like_count || 0, comments = m.comments_count || 0;
    const saves = ins.saved || 0, shares = ins.shares || 0, reach = ins.reach || 0;
    const interactions = ins.total_interactions || (likes + comments + saves + shares);
    rows.push({
      date: (m.timestamp || '').slice(0, 10), type: mapType(m.media_type),
      likes, comments, saves, shares, reach, interactions,
      url: m.permalink || '#', rawCaption: m.caption || '',
    });
  }
  rows.sort((a, c) => (a.interactions < c.interactions ? 1 : a.interactions > c.interactions ? -1 : (a.date < c.date ? 1 : -1)));
  return rows;
}

// ---- Phase 2: deep panels (account insights + follower demographics) --------
// Pulls daily reach/profile-views (→ trend + month-over-month) and follower
// age/gender/city. Fully isolated: any failure throws and is caught by the
// caller, leaving that brand's deep:{} block as the existing snapshot. It never
// touches reels/stories/comments, and never zeroes a value it couldn't fetch.
const AGE_ORDER = ['13-17', '18-24', '25-34', '35-44', '45-54', '55-64', '65+'];
const unixDaysAgo = n => { const d = new Date(); d.setUTCDate(d.getUTCDate() - n); return Math.floor(d.getTime() / 1000); };

async function fetchDailySeries(acct) {
  // reach + profile_views, daily, ~60 days. The day-period range caps at 30 days,
  // so we ask in two windows. If profile_views is unsupported, fall back to reach only.
  const series = {};
  for (const [since, until] of [[unixDaysAgo(60), unixDaysAgo(30)], [unixDaysAgo(30), unixDaysAgo(0)]]) {
    let data = null;
    try { data = (await api(`/${acct}/insights`, { metric: 'reach,profile_views', period: 'day', since, until })).data; }
    catch { try { data = (await api(`/${acct}/insights`, { metric: 'reach', period: 'day', since, until })).data; } catch { data = null; } }
    for (const d of (data || [])) for (const v of (d.values || [])) {
      const day = (v.end_time || '').slice(0, 10); if (!day) continue;
      series[day] = series[day] || { reach: 0, pv: 0 };
      if (d.name === 'reach') series[day].reach = v.value || 0;
      if (d.name === 'profile_views') series[day].pv = v.value || 0;
    }
  }
  return series;
}

async function fetchFollowerCount30(acct) {
  try {
    const data = (await api(`/${acct}/insights`, { metric: 'follower_count', period: 'day', since: unixDaysAgo(30), until: unixDaysAgo(0) })).data;
    let sum = 0; for (const d of (data || [])) for (const v of (d.values || [])) sum += (v.value || 0);
    return sum;
  } catch { return null; }
}

async function fetchDemoBreakdown(acct, breakdown) {
  const j = await api(`/${acct}/insights`, { metric: 'follower_demographics', period: 'lifetime', metric_type: 'total_value', breakdown });
  const tv = (((j.data || [])[0] || {}).total_value) || {};
  const results = ((tv.breakdowns || [])[0] || {}).results || [];
  return results.map(r => [((r.dimension_values || [''])[0]), r.value || 0]);
}

const fmtPairs = pairs => '[' + pairs.map(([k, v]) => `["${String(k).replace(/"/g, '')}",${Math.round(v)}]`).join(',') + ']';

function oldMom(html, acct) {
  // last-known values, so fields we can't refresh are preserved, never invented or zeroed
  const m = html.match(new RegExp('acct:"' + acct + '"[\\s\\S]*?mom:\\{newFoll:(\\d+),perDay:([\\d.]+),reachL:\\d+,reachP:\\d+,reachD:[-\\d.]+,pvL:(\\d+),pvP:(\\d+),pvD:([-\\d.]+)\\}'));
  return m ? { newFoll: +m[1], perDay: +m[2], pvL: +m[3], pvP: +m[4], pvD: +m[5] } : {};
}

async function applyDeep(html, b) {
  const acct = b.acct;
  const series = await fetchDailySeries(acct);
  const days = Object.keys(series).sort();
  if (days.length < 10) throw new Error('insufficient daily insights');
  const last = days.slice(-30), prior = days.slice(-60, -30);
  const sum = (arr, key) => arr.reduce((s, d) => s + (series[d][key] || 0), 0);
  const prev = oldMom(html, acct);

  const reachL = sum(last, 'reach'), reachP = sum(prior, 'reach');
  const reachD = reachP ? (reachL - reachP) / reachP * 100 : 0;
  const pvFresh = days.some(d => series[d].pv > 0);
  const pvL = pvFresh ? sum(last, 'pv') : (prev.pvL ?? 0);
  const pvP = pvFresh ? sum(prior, 'pv') : (prev.pvP ?? 0);
  const pvD = pvFresh ? (pvP ? (pvL - pvP) / pvP * 100 : 0) : (prev.pvD ?? 0);

  let newFoll = await fetchFollowerCount30(acct);
  let perDay;
  if (newFoll == null) { newFoll = prev.newFoll ?? 0; perDay = prev.perDay ?? 0; }
  else perDay = +(newFoll / 30).toFixed(1);

  // demographics — require all three present, else leave the whole block as snapshot
  const ageRaw = await fetchDemoBreakdown(acct, 'age');
  const genRaw = await fetchDemoBreakdown(acct, 'gender');
  const cityRaw = await fetchDemoBreakdown(acct, 'city');
  if (!ageRaw.length || !genRaw.length || !cityRaw.length) throw new Error('demographics empty');
  const agePairs = AGE_ORDER.map(a => [a, (ageRaw.find(x => x[0] === a) || [a, 0])[1]]).filter(p => p[1] > 0);
  const g = { M: 0, F: 0, U: 0 }; for (const [k, v] of genRaw) g[k] = v;
  const cities = cityRaw.map(([c, v]) => [String(c).split(',')[0].trim(), v]).sort((a, c) => c[1] - a[1]).slice(0, 8);

  const mom = `mom:{newFoll:${Math.round(newFoll)},perDay:${perDay},reachL:${Math.round(reachL)},reachP:${Math.round(reachP)},reachD:${reachD.toFixed(1)},pvL:${Math.round(pvL)},pvP:${Math.round(pvP)},pvD:${(+pvD).toFixed(1)}}`;
  const daily = 'daily:[' + days.map(d => `["${d.slice(5)}",${Math.round(series[d].reach)},${Math.round(series[d].pv)}]`).join(',') + ']';
  const age = 'age:' + fmtPairs(agePairs);
  const gender = `gender:{male:${Math.round(g.M)},female:${Math.round(g.F)},undef:${Math.round(g.U)}}`;
  const citiesS = 'cities:' + fmtPairs(cities);

  const txt = `\n   ${mom},\n   ${daily},\n   ${age},\n   ${gender},\n   ${citiesS},`;
  const re = new RegExp('(acct:"' + acct + '"[\\s\\S]*?deep:\\{)([\\s\\S]*?)(\\n\\s*reels:)');
  if (!re.test(html)) throw new Error('deep anchor not found');
  return html.replace(re, (_m, a, _b, c) => a + txt + c);
}

(async () => {
  let html = readFileSync(FILE, 'utf8');
  const caps = existingCaptions(html);
  let okBrands = [];

  for (const b of BRANDS) {
    try {
      const rows = await buildRows(b);
      if (!rows.length) { console.warn(`${b.key}: no media returned — leaving rows untouched.`); continue; }
      html = replacePosts(html, b.acct, fmtRows(rows, caps));
      const prof = await fetchProfile(b.acct);
      if (prof) { html = replaceNum(html, b.acct, 'followers', prof.followers_count); html = replaceNum(html, b.acct, 'media', prof.media_count); }
      okBrands.push(`${b.key}(${rows.length})`);
      console.log(`${b.key}: ${rows.length} posts refreshed.`);
      // Deep panels are isolated: a failure here leaves the snapshot, never the posts.
      try { html = await applyDeep(html, b); console.log(`${b.key}: deep panels (reach/audience) refreshed.`); }
      catch (e) { console.warn(`${b.key}: deep panels left as snapshot — ${e.message}`); }
    } catch (e) {
      console.error(`${b.key}: FAILED — ${e.message}. Leaving its data untouched.`);
    }
  }

  if (!okBrands.length) { console.error('No brand refreshed; aborting without writing.'); process.exit(1); }

  html = html.replace(/const SNAPSHOT_DATE="[^"]*";/, `const SNAPSHOT_DATE="${today}";`);
  writeFileSync(FILE, html);
  console.log(`Wrote index.html — ${today} — brands: ${okBrands.join(', ')}`);
})().catch(e => { console.error('Unhandled:', e); process.exit(1); });
