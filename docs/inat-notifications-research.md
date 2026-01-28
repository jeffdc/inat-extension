# iNaturalist Notifications System Research

## Overview

This document summarizes research into the iNaturalist notifications system, conducted while building a Firefox extension to improve notification management. The goal was to overcome limitations in the native iNat UI which only shows ~10 recent notifications.

## The Problem

The native iNaturalist notification dropdown:
- Only displays ~10 most recent notifications
- Marks all as "viewed" when opened
- No way to access older notifications
- If you have 11+ notifications, older ones (including @mentions) become inaccessible

## API Endpoints Investigated

### 1. API v1: `/observations/updates` (api.inaturalist.org)

**URL:** `https://api.inaturalist.org/v1/observations/updates`

**Authentication:** JWT Bearer token (obtained from `/users/api_token` with session cookies)

**Pros:**
- Proper pagination support (`page`, `per_page` parameters)
- Returns both viewed and unviewed notifications
- Structured JSON response

**Cons:**
- Does NOT include @mention notifications
- Only returns activity on observations you own or follow
- The `observations_by` parameter filters results but doesn't add mentions

**Example:**
```
GET /v1/observations/updates?per_page=20&page=1
Authorization: Bearer <jwt_token>
```

### 2. Rails: `/users/new_updates` (www.inaturalist.org)

**URL:** `https://www.inaturalist.org/users/new_updates`

**Authentication:** Session cookies

**Parameters:**
- `notification` - Filter by type: `activity`, `mention`, or `activity,mention`
- `skip_view` - Set to `1` to not mark as viewed when fetching
- `notifier_types` - Filter by notifier type (Identification, Comment)
- `resource_type` - Filter by resource type

**JSON Response (`.json`):**
- Only returns `unviewed: true` notifications
- Up to 200 results
- If all notifications are viewed, returns empty array `[]`
- NO fallback to viewed notifications

**HTML Response (no `.json`):**
- Returns unviewed first
- Falls back to 10 viewed notifications if no unviewed
- Falls back to 5 any notifications if still empty
- This is what the native UI uses

**The Critical Limitation:**
```ruby
# From users_controller.rb
@updates = current_user.recent_notifications(unviewed: true, per_page: 200, filters: filters)
unless request.format.json?
  # HTML gets fallback, JSON doesn't
  if @updates.count == 0
    @updates = current_user.recent_notifications(viewed: true, per_page: 10, filters: filters)
  end
end
```

### 3. Rails: `/users/dashboard_updates`

**URL:** `https://www.inaturalist.org/users/dashboard_updates`

- Returns dashboard feed (broader than notifications)
- Includes subscription updates (when people you follow upload)
- `per_page: 50`
- Not suitable for notification-specific use cases

### 4. Rails: `/users/updates_count`

**URL:** `https://www.inaturalist.org/users/updates_count`

- Returns count of unviewed notifications
- Used by the UI to show badge numbers

## Notification Types

Notifications have a `notification` field with these values:
- `activity` - Someone commented on or identified your observation
- `mention` - Someone @mentioned you in a comment/ID

And a `notifier_type` field:
- `Identification` - An ID was added
- `Comment` - A comment was added

## The Mentions Mystery

**Observed behavior:**
1. Native iNat dropdown shows @mentions interleaved with other notifications
2. Native UI calls: `GET /users/new_updates?notification=activity,mention`
3. When accessing the same URL directly, mentions don't appear
4. The `notification=mention` filter returns empty even when mentions exist

**Possible explanations:**
- Frontend JavaScript does additional processing
- Mentions are cached or handled differently based on request context
- There may be a bug in how mentions are queried

**How mentions are created (from source code):**
```ruby
# In comment.rb
notifies_users :mentioned_users,
  on: :save,
  delay: false,
  notification: "mention",
  if: lambda( &:prefers_receive_mentions? )
```

Mentions ARE stored with `notification: "mention"` - the issue is in retrieval.

## Authentication Methods

### Session-Based (Rails endpoints)
- Works on `www.inaturalist.org` domain
- Use `credentials: 'include'` with fetch
- Content scripts on iNat pages have access

### JWT Token (API v1)
- Obtain from: `GET /users/api_token` (requires session cookies)
- Token valid for ~24 hours
- Use as: `Authorization: Bearer <token>`
- Works from any context (background scripts, etc.)

**Getting JWT from session:**
```javascript
const response = await fetch('https://www.inaturalist.org/users/api_token', {
  credentials: 'include'
});
const data = await response.json();
const jwt = data.api_token;
```

## What Would Fix This

### Proposed API Changes

Add parameters to `/users/new_updates` JSON endpoint:

| Parameter | Description |
|-----------|-------------|
| `include_viewed=true` | Return viewed + unviewed notifications |
| `page=N` | Pagination page number |
| `per_page=N` | Results per page (max 200) |

This would allow:
```
GET /users/new_updates.json?notification=activity,mention&include_viewed=true&page=1&per_page=50
```

### Source Code Location

The fix would be in:
- **File:** `app/controllers/users_controller.rb`
- **Method:** `new_updates`

See `github-issue-notifications-api.md` for the proposed code changes.

## Current Workaround

For the extension, we can:

1. **Use API v1 for paginated activity** - IDs and comments on your observations
2. **Use HTML endpoint for mentions** - Parse the HTML response (limited to ~10)
3. **Merge and display** - Combine both sources

This gives us:
- Full paginated history of IDs/comments (via API)
- Recent mentions (via HTML parsing, limited by iNat)

The mentions limitation is on iNat's side - we cannot fully overcome it without changes to their API.

## Files in This Extension

```
lib/inat-auth.js       - JWT token management
lib/notifications-api.js - API client for both endpoints
content/dropdown.js    - Notification dropdown UI
sidebar/sidebar.js     - Sidebar notification panel
```

## References

- iNaturalist source: https://github.com/inaturalist/inaturalist
- API docs: https://api.inaturalist.org/v1/docs
- Forum: https://forum.inaturalist.org/
