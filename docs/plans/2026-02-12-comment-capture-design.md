# Comment Capture Design

## Goal

Automatically capture every comment the user posts on iNaturalist, along with observation metadata. Store locally and sync to a local server. Also support manual capture of existing comments on a page.

iNaturalist does not provide API access to a user's own comments, so this feature builds a personal searchable archive.

## Data Model

```json
{
  "id": "uuid",
  "commentText": "Your comment body",
  "observationId": "12345",
  "observationUrl": "https://www.inaturalist.org/observations/12345",
  "species": "Genus species",
  "commonName": "Common Name",
  "observer": "username",
  "observationDate": "2024-01-15",
  "location": "Place name",
  "capturedAt": "2024-01-15T10:30:00Z",
  "captureMethod": "auto | manual",
  "synced": false
}
```

## Auto-Capture: Network Interception

Use `browser.webRequest.onBeforeRequest` in the background script to intercept POST requests to iNat's comment creation endpoint. Extract comment text from the request body. Then message the content script on that tab to grab observation metadata from the DOM.

Flow:
1. User posts comment via standard iNat form
2. Background script intercepts the POST request body (comment text)
3. Background sends message to content script on that tab
4. Content script extracts observation metadata from DOM
5. Background stores comment + metadata in browser.storage.local
6. Background POSTs to localhost server
7. On success, marks comment as synced

## Manual Capture

Inject a small button near each comment on the observation page. When clicked, the content script reads that comment's text and the page's observation metadata, sends to background for storage and sync.

## Sync to Local Server

- Hardcoded endpoint: `http://localhost:<PORT>/comments`
- On capture: immediately POST to server
- If server unreachable: comment stays in storage with `synced: false`
- Periodic retry: background script retries unsynced comments every 5 minutes
- Buffer is persistent in browser.storage.local

## Permissions

- `webRequest` — intercept comment POST requests
- `*://localhost/*` — host permission for server communication

## Out of Scope

- No sidebar UI for browsing/searching comments
- No identification capture (comments only)
- Viewing/searching handled by separate tool consuming the local server
