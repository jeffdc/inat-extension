# Notification Data Flow

How the extension fetches, processes, and displays notifications.
See also: `inat-notifications-research.md` for iNat API details.

## Sources

We fetch from three sources in parallel (`dropdown.js:loadNotifications`):

| Source | Endpoint | Auth | Runs in | Mentions | Comments/IDs | Pagination | Read/Unread |
|--------|----------|------|---------|----------|-------------|------------|-------------|
| **API v1** | `api.inaturalist.org/v1/observations/updates` | JWT | Background script | No | Yes | Yes | Yes |
| **JSON** | `www.inaturalist.org/users/new_updates.json` | Session cookie | Content script | Yes (unreliable) | Yes | No (up to 200) | Unread only |
| **HTML** | `www.inaturalist.org/users/new_updates` | Session cookie | Content script | Yes | Yes | No | Unread + fallback |

### What gets added to the store

```
API v1 → all notifications added (IDs + comments)
JSON   → only mentions filtered and added
HTML   → only mentions filtered and added
```

API v1 is the primary source for comments/IDs. JSON and HTML are mention-only supplements.

## Processing Pipeline

```
1. Parallel fetch (API v1, JSON, HTML)
2. Filter: JSON/HTML → mentions only
3. Add to NotificationStore (dedup on insert)
4. Render immediately
5. Background: resolve comment IDs → observation IDs (for mentions with /comments/ URLs)
6. Background: fetch observation details for all observation IDs
7. Enrich notifications with observation data
8. Re-render
```

## Deduplication

Key formula (`notifications.js:getNotificationKey`):
```
${observationId}-${category}-${10-minute-time-bucket}
```

Store keeps the higher-priority source on collision: `api_v1 (3) > json (2) > html (1)`.

### Known Bug: Mention Dedup Collapse

For mentions, `observationId` is set from `resource_id`. If `resource_id` is the observation ID (not comment ID), then multiple people mentioning you on the **same observation** within 10 minutes produce identical keys. All but one are silently dropped.

## Mention-Specific Issues

### `resource_id` for mentions

The JSON endpoint's `resource_id` for mention notifications may be the **observation ID**, not the comment ID containing the mention. This causes:
- Wrong dedup (see above)
- The `observationUrl` is constructed as `/observations/${resource_id}` which works if it's an obs ID, but won't deep-link to the comment

The HTML fetcher handles this differently: when it finds a `/comments/ID` link, it sets `observationId = 'comment_' + commentId`. These get resolved later via redirect-following in `enrichWithObservationData`.

### Comment body not showing for mentions

**JSON fetcher** (`notifications.js:547`): Extracts body from `raw.comment || raw.identification`. For mentions, `raw.comment` may not exist at the top level of the notification — the mention data structure may nest the comment differently. Result: `body` is `undefined`.

**HTML fetcher**: Sets `body` to the full `<li>` text content. But the renderer at `dropdown.js:251` explicitly filters it out:
```js
if (n.body && n.source !== 'html')
```
Rationale: HTML body is the raw notification text ("username mentioned you in..."), not the actual comment. But this means no mention body is ever displayed.

### Mentions not loading at all

The JSON endpoint only returns **unread** notifications. If mentions have already been viewed (e.g., native dropdown was opened), the JSON endpoint returns nothing.

The HTML endpoint has a fallback to viewed notifications, but our fetcher only extracts mentions from it — and parsing is fragile (text pattern matching for usernames, link extraction).

**"Priming" theory**: The native iNat dropdown may trigger a backend process that loads/caches mention notifications. Our fetchers may hit the endpoint before this process runs, getting empty results. This is unconfirmed but consistent with observed behavior where mentions appear after opening the native UI first.

## Observation Enrichment

After initial render, `enrichWithObservationData` runs:

1. **Resolve comment IDs**: Mentions from the HTML fetcher with `observationId` starting with `comment_` get resolved via `HEAD` requests to `/comments/{id}` (follows redirect to `/observations/{id}`). JSON fetcher mentions with bare IDs are **not resolved** by this step.

2. **Fetch observation data**: All unique observation IDs → batched `GET /v1/observations?id=X,Y,Z` (30 per batch).

3. **Enrich**: Each notification gets `observation` object with:
   - `taxon` (id, name, commonName)
   - `thumbnail` (small), `mediumPhoto` (medium)
   - `observer`, `observedOn`, `placeGuess`
   - `qualityGrade`, `identificationsCount`

4. **Re-render**: Dropdown re-renders with enriched data (obs taxon line, hover preview).

## Rendering

### Notification row shows:
- Thumbnail (observation photo if enriched, else user avatar)
- User name + time ago
- Action text ("mentioned you", "commented", "added ID: Taxon Name")
- Observation taxon (if enriched)
- Comment body preview (truncated to 100 chars, excluded for `source: 'html'`)

### Hover preview popout (left of dropdown):
- Only shown when `observation` data exists (post-enrichment)
- Positioned via JS (mouseenter/mouseleave) to escape the scroll container's overflow clipping
- Shows: taxon name (italic), observer, date, ID count, quality grade badge, "View" link

## File Map

```
lib/notifications.js      - Normalized data structures, NotificationStore, all three fetchers,
                             dedup logic, observation fetching, comment ID resolution
lib/notifications-api.js   - API client used by background script (JWT auth, /observations/updates)
lib/inat-auth.js           - JWT token management (fetch, store, refresh)
background/background.js   - Message handler, proxies getNotifications to NotificationsAPI
content/dropdown.js        - Dropdown UI, loadNotifications orchestration, rendering, hover preview
content/dropdown.css       - All dropdown and preview styles
```
