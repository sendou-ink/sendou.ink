# sendou.ink Slow Routes Analysis

Generated: 2026-01-14
Data source: Render logs (last 24 hours, 4000 requests sampled)

## Overview

Overall performance is good with 91% of requests under 50ms and an average of 32.2ms. However, there are specific routes that need attention.

## Critical Issues

### 1. `/leaderboards` - CRITICAL

- **Max response time:** 2,542ms (2.5 seconds)
- **Occurrences:** 2 requests hit >2 seconds
- **Priority:** HIGH

This is the slowest route. Investigate the database query and consider caching.

### 2. `/static-assets/img/main-weapons/:id.avif` - HIGH

- **Slow request ratio:** 41% (16 out of 39 requests over 100ms)
- **Max response time:** 1,646ms
- **Pattern:** Multiple weapon images (IDs: 3041, 1115, 5015, 10, 51, 1110, 1122, 3000, 3030, 4022, 4001, 1001, 3020, 7020, 1020, 1111) taking 1.2-1.6 seconds

Static assets should be instant. This suggests:
- Cold cache / disk I/O issues on Render
- Missing CDN/edge caching
- File system latency on the mounted disk

### 3. `/q/looking.data` - MEDIUM

- **Request count:** 96 (high traffic)
- **Slow requests:** 7 (7.3%)
- **Max response time:** 690ms
- **Average:** 48.6ms

SendouQ looking group data endpoint. Occasional spikes suggest database query or lock contention.

### 4. `/to/:id/matches/:id` - MEDIUM

- **Request count:** 93
- **Slow requests:** 4 (4.3%)
- **Max response time:** 1,800ms
- **Average:** 62.2ms

Tournament match pages occasionally very slow. Check for N+1 queries or missing indexes.

### 5. `/q/match/:id` - MEDIUM

- **Request count:** 116
- **Slow requests:** 4 (3.4%)
- **Max response time:** 936ms
- **Average:** 31.5ms

SendouQ match pages. Similar pattern to looking.data.

### 6. `/u.data` (user search) - LOW

- **Request count:** 18
- **Max response time:** 1,571ms (outlier)
- **Average:** 119ms

User search endpoint. One extreme outlier, otherwise acceptable.

### 7. `/q.data` - LOW

- **Request count:** 14
- **Slow requests:** 2 (14.3%)
- **Max response time:** 644ms
- **Average:** 90ms

SendouQ index data.

## All Requests Over 500ms

| Time (ms) | Path |
|-----------|------|
| 2542 | /leaderboards |
| 2295 | /leaderboards |
| 1985 | /assets/xsearch-Trb5_yyZ.js |
| 1800 | /to/1037/matches/44873 |
| 1646 | /static-assets/img/main-weapons/3041.avif |
| 1571 | /u.data?q=%232879 |
| 1534 | /to/2970/matches/102745 |
| 1528 | /static-assets/img/main-weapons/1115.avif |
| 1526 | /static-assets/img/main-weapons/5015.avif |
| 1526 | /static-assets/img/main-weapons/10.avif |
| 1525 | /static-assets/img/main-weapons/51.avif |
| 1525 | /static-assets/img/main-weapons/1110.avif |
| 1522 | /static-assets/img/main-weapons/1122.avif |
| 1515 | /static-assets/img/main-weapons/3000.avif |
| 1514 | /static-assets/img/main-weapons/3030.avif |
| 1511 | /static-assets/img/main-weapons/4022.avif |
| 1486 | /static-assets/img/main-weapons/4001.avif |
| 1320 | /static-assets/img/main-weapons/1001.avif |
| 1284 | /static-assets/img/main-weapons/3020.avif |
| 1282 | /static-assets/img/main-weapons/7020.avif |
| 1273 | /static-assets/img/main-weapons/1020.avif |
| 1224 | /static-assets/img/main-weapons/1111.avif |
| 936 | /q/match/61218 |
| 801 | /u/kuwu/results |
| 690 | /q/looking.data |
| 662 | /q/looking.data |
| 661 | /q/looking.data |
| 657 | /builds/e-liter-4k?limit=240 |
| 644 | /q.data?index |
| 588 | /to/3126/brackets.data |
| 569 | /q/looking.data |
| 545 | /to/20/teams/568 |
| 544 | /q/looking.data |
| 527 | /q.data?index |
| 524 | /notifications/seen.data |
| 521 | /u/bookity/builds |
| 514 | /static-assets/img/main-weapons-outlined/30.avif |

## Recommended Actions

### Immediate (This Week)

1. **Investigate `/leaderboards` route**
   - Profile the database query
   - Check for missing indexes
   - Consider adding caching (Redis or in-memory)

2. **Fix static asset serving for weapon images**
   - Add Cache-Control headers if missing
   - Consider serving from CDN (Cloudflare, etc.)
   - Check if Render disk is causing latency

### Short-term

3. **Profile SendouQ endpoints** (`/q/looking.data`, `/q/match/:id`, `/q.data`)
   - Add query logging to identify slow queries
   - Check for N+1 query patterns
   - Review database indexes on sendouq-related tables

4. **Profile tournament match pages** (`/to/:id/matches/:id`)
   - Similar investigation to SendouQ

### Long-term

5. **Add application-level response time monitoring**
   - Log slow queries (>100ms) with full context
   - Set up alerting for routes exceeding thresholds

## Route File Locations (for reference)

To investigate these routes, look at:

- `/leaderboards` → `app/features/leaderboards/`
- `/q/*` → `app/features/sendouq/` and `app/features/sendouq-match/`
- `/to/*` → `app/features/tournament/`
- `/u/*` → `app/features/user-page/` and `app/features/user-search/`
- `/builds/*` → `app/features/builds/`
- Static assets → check Express/Remix static serving config
