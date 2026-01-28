# GitHub Issue Draft: Notifications API Improvements

**Repository:** https://github.com/inaturalist/inaturalist/issues/new

---

## Title

`/users/new_updates` JSON endpoint cannot retrieve viewed notifications or paginate results

## Labels (suggested)

`enhancement`, `api`

---

## Issue Body

### Problem Description

The `/users/new_updates` endpoint has limitations that make it difficult to build tools for managing notifications effectively:

1. **JSON endpoint only returns unviewed notifications** - Once notifications are marked as viewed, they cannot be retrieved via JSON
2. **No pagination support** - Cannot paginate through notification history
3. **Mentions inconsistently returned** - The `notification=mention` filter doesn't reliably return mention notifications

### Current Behavior

**JSON requests:**
```
GET /users/new_updates.json?notification=activity,mention&skip_view=1
```
- Returns only `unviewed: true` notifications (up to 200)
- If all notifications are viewed, returns empty array `[]`
- No way to retrieve viewed notifications or paginate

**HTML requests:**
- Falls back to showing 10 viewed notifications if no unviewed exist
- This fallback doesn't apply to JSON responses

### Impact

This makes it impossible to:
- Build a notification manager that shows full notification history
- Retrieve notifications that were auto-marked as viewed
- Paginate through older notifications
- Reliably access @mention notifications

The native iNaturalist UI only shows ~10 recent notifications, and if you have 11+ notifications where the oldest is an @mention, that mention becomes inaccessible.

### Proposed Solution

Add optional parameters to the JSON endpoint for backwards-compatible improvements:

```ruby
def new_updates
  # ... existing filter setup ...

  per_page = (params[:per_page] || 200).to_i.clamp(1, 200)
  page = (params[:page] || 1).to_i

  if params[:include_viewed] == "true"
    # Return all notifications (viewed + unviewed) with pagination
    @updates = current_user.recent_notifications(
      per_page: per_page,
      page: page,
      filters: filters
    )
  else
    # Default behavior unchanged - unviewed only
    @updates = current_user.recent_notifications(
      unviewed: true,
      per_page: per_page,
      filters: filters
    )
  end

  # ... rest of method unchanged ...
end
```

### New Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `include_viewed` | boolean | When `true`, return both viewed and unviewed notifications |
| `page` | integer | Page number for pagination (default: 1) |
| `per_page` | integer | Results per page, max 200 (default: 200) |

### Example Usage

```
# Get all notifications (viewed + unviewed), page 1
GET /users/new_updates.json?notification=activity,mention&include_viewed=true&page=1&per_page=50

# Get page 2
GET /users/new_updates.json?notification=activity,mention&include_viewed=true&page=2&per_page=50
```

### Additional Question

When testing, I noticed that `notification=mention` doesn't return mention notifications even when they exist and are visible in the native UI dropdown. The native dropdown calls the same endpoint (`/users/new_updates?notification=activity,mention`) and displays mentions correctly, but accessing the URL directly doesn't include them.

Is there additional processing happening in the frontend, or is this a bug in how mentions are queried?

### Environment

- Tested via browser and extension development
- User has mention notifications visible in native UI but not returned by API

### Willingness to Contribute

I'm happy to submit a PR for this if the approach is acceptable. Please let me know if there are any concerns or alternative approaches you'd prefer.

---

## Notes for Submitting

1. Check if there's an existing issue first by searching: https://github.com/inaturalist/inaturalist/issues?q=notifications+api
2. The iNaturalist team is active on their forum - you might also post there: https://forum.inaturalist.org/
3. Be patient - they're a small team with many requests
