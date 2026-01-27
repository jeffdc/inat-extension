# Notifications Feature Design

## Overview

Replace iNaturalist's poor notification UI with a power-user-friendly system. Two UI surfaces:
1. **Dropdown** - Quick-view popup replacing native bell behavior
2. **Sidebar panel** - Full notification management alongside existing TODOs/Research tabs

## Core Requirements

- Show all notifications, paginated, with read/unread state
- Mark as read (no mark-unread for v1)
- Click to go to observation (auto-marks as read)
- Separate by type: Mentions | Comments | IDs (in that order)
- Clean UI with sensible ordering (newest first, unread prioritized)

## Architecture

### New Files

```
/
├── notifications/
│   ├── notifications-api.js    # API client for iNat notifications
│   ├── notifications-store.js  # Local state/cache management
│   ├── dropdown.js             # Popup UI injected into iNat pages
│   ├── dropdown.css
│   └── panel.js                # Sidebar panel code
├── content/
│   └── content.js              # Extend to intercept bell click
├── sidebar/
│   └── ...                     # Add Notifications tab
└── manifest.json               # Add host permissions
```

### Data Flow

1. Content script intercepts bell click, injects dropdown
2. Dropdown/sidebar request data via background script
3. Background script makes authenticated API calls using session cookies
4. Results cached briefly to avoid hammering API

### Permissions

Add to manifest.json:
- `*://*.inaturalist.org/*` - For authenticated API calls and content script on all iNat pages

## API Layer

### Fetching Notifications

```
GET https://api.inaturalist.org/v1/observations/updates
  ?per_page=20
  &page=1
  &observations_by=owner
```

Response fields used:
- `id` - Notification ID
- `viewed` - Read/unread state
- `notification` - Type: "identification" or "comment"
- `resource_id` - The ID/comment record
- `created_at` - Timestamp
- `resource.user` - Who made the ID/comment
- `resource.body` - Comment text or ID details
- `resource.taxon` - For identifications, what taxon

### Marking as Read

```
PUT https://api.inaturalist.org/v1/observations/updates/viewed
  ?id=123
```

### Authentication

Piggyback on user's existing iNat session cookies. Extension only works when user is logged into iNat. No separate OAuth flow needed.

## Dropdown UI

### Trigger

- Content script intercepts click on notification bell
- `event.stopPropagation()` + `event.preventDefault()` to block native popup
- Inject/show custom dropdown positioned below bell icon

### Layout

```
┌─────────────────────────────────────────┐
│ Notifications              [Mark all read] │
├─────────────────────────────────────────┤
│ ○ Mentions (1)  ○ Comments (3)  ○ IDs (12) │
├─────────────────────────────────────────┤
│ ● User789 mentioned you                    │
│   "Hey @you, what do you think..."         │
│   3 hours ago                              │
├─────────────────────────────────────────┤
│   User456 commented                        │
│   "Great photo! Where exactly..."          │
│   Yesterday                                │
├─────────────────────────────────────────┤
│         [Load more]  [Open in sidebar]     │
└─────────────────────────────────────────┘
```

### Specs

- ~350px wide, max ~500px tall with scroll
- Clean styling, doesn't clash with iNat
- Click outside or Escape to close
- Type tabs filter locally (no new API call)
- Badge on tabs shows unread count per type
- Default tab: Mentions

### Behaviors

- Click notification row → open observation in new tab, mark as read
- "Load more" → append next page
- "Mark all read" → mark all visible as read
- "Open in sidebar" → open extension sidebar to Notifications tab

## Sidebar Panel

### Integration

New "Notifications" tab alongside TODOs and Research tabs. Reuses existing sidebar styling.

### Layout

```
┌─────────────────────────────────────────┐
│ [TODOs] [Research] [Notifications]         │
├─────────────────────────────────────────┤
│ ○ Mentions  ○ Comments  ○ IDs              │
├─────────────────────────────────────────┤
│ Show: ○ Unread  ○ All       [Mark all read]│
├─────────────────────────────────────────┤
│ ● @you in comment on Genus species         │
│   User789: "Hey @you, what do you..."      │
│   3 hours ago                       [Mark] │
├─────────────────────────────────────────┤
│ ...more items...                           │
├─────────────────────────────────────────┤
│          Page 1 of 12  [←] [→]             │
└─────────────────────────────────────────┘
```

### Differences from Dropdown

- Full pagination controls (not just "load more")
- "Show unread/all" toggle (persists across sessions)
- More vertical space for longer previews
- Explicit "Mark" button per row (in addition to click-to-open)

## Bell Interception

### Implementation

1. Content script runs on all `inaturalist.org` pages
2. On page load, find notification bell element
3. Attach click handler with `capture: true` to intercept first
4. On click: prevent default, show dropdown

### Edge Cases

- Bell not found (not logged in, layout changed) → let native behavior work
- Navigation to new page → dropdown resets, fresh fetch on next open
- API error → show error in dropdown, don't break native fallback

## Implementation Phases

### Phase 1 - API & Foundation
- Add host permissions to manifest
- Create `notifications-api.js` with fetch/mark-read functions
- Test API calls work with session cookies
- Basic error handling

### Phase 2 - Dropdown
- Bell click interception in content script
- Dropdown UI with type tabs (Mentions | Comments | IDs)
- Click to open observation + mark read
- "Load more" pagination
- "Mark all read" button

### Phase 3 - Sidebar Panel
- Add Notifications tab to sidebar
- Full pagination
- Unread/All toggle
- Shared styling with existing panels

## Out of Scope (v1)

- Mark as unread
- Complex filters (taxon, date range, observer, etc.)
- Search within notifications
- Notification grouping (by observation, by day)
- Updating native badge count
- Offline support / advanced caching

These can be added later based on real usage patterns.
