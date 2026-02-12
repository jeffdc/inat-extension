# Comment Capture Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Automatically capture comments posted on iNaturalist via network interception, with manual capture support and sync to a local server.

**Architecture:** Background script intercepts POST requests to iNat's comment endpoints using `webRequest`, extracts comment text from request body, then messages content script for observation metadata. Comments stored in `browser.storage.local` (separate key from existing items) and synced to a hardcoded localhost endpoint. Content script injects "save" buttons next to existing comments for manual capture.

**Tech Stack:** Firefox WebExtensions API (`webRequest`, `storage`, `tabs`), vanilla JS

---

### Task 1: Add webRequest permission and localhost host permission

**Files:**
- Modify: `manifest.json`

**Step 1: Update manifest.json permissions**

Add `"webRequest"` to the permissions array and `"*://localhost/*"` to a new host permission. The permissions array should become:

```json
"permissions": [
  "storage",
  "tabs",
  "webRequest",
  "*://*.inaturalist.org/*",
  "*://localhost/*"
]
```

**Step 2: Verify extension loads**

Run: `npm run dev`
Expected: Extension loads without errors in about:debugging

**Step 3: Commit**

```bash
git add manifest.json
git commit -m "Add webRequest and localhost permissions for comment capture"
```

---

### Task 2: Create comment storage module

**Files:**
- Create: `lib/comment-store.js`

**Step 1: Create the CommentStore module**

This module manages comment storage separately from the existing `Storage` object. Uses a distinct storage key `'inat_captured_comments'`.

```javascript
// Comment storage for captured iNaturalist comments

const CommentStore = {
  STORAGE_KEY: 'inat_captured_comments',

  generateId() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  },

  async getAll() {
    const result = await browser.storage.local.get(this.STORAGE_KEY);
    return result[this.STORAGE_KEY] || [];
  },

  async save(comments) {
    await browser.storage.local.set({ [this.STORAGE_KEY]: comments });
  },

  async addComment(comment) {
    const comments = await this.getAll();
    const entry = {
      id: this.generateId(),
      commentText: comment.commentText,
      observationId: comment.observationId,
      observationUrl: comment.observationUrl || `https://www.inaturalist.org/observations/${comment.observationId}`,
      species: comment.species || null,
      commonName: comment.commonName || null,
      observer: comment.observer || null,
      observationDate: comment.observationDate || null,
      location: comment.location || null,
      capturedAt: new Date().toISOString(),
      captureMethod: comment.captureMethod || 'auto',
      synced: false
    };
    comments.push(entry);
    await this.save(comments);
    return entry;
  },

  async getUnsynced() {
    const comments = await this.getAll();
    return comments.filter(c => !c.synced);
  },

  async markSynced(id) {
    const comments = await this.getAll();
    const comment = comments.find(c => c.id === id);
    if (comment) {
      comment.synced = true;
      await this.save(comments);
    }
  },

  async markManySynced(ids) {
    const comments = await this.getAll();
    for (const comment of comments) {
      if (ids.includes(comment.id)) {
        comment.synced = true;
      }
    }
    await this.save(comments);
  }
};
```

**Step 2: Commit**

```bash
git add lib/comment-store.js
git commit -m "Add CommentStore module for captured comments"
```

---

### Task 3: Create server sync module

**Files:**
- Create: `lib/comment-sync.js`

**Step 1: Create the CommentSync module**

Handles POSTing comments to the local server and periodic retry of unsynced comments.

```javascript
// Sync captured comments to local server

const CommentSync = {
  SERVER_URL: 'http://localhost:48372/comments',
  RETRY_INTERVAL_MS: 5 * 60 * 1000, // 5 minutes
  _retryTimer: null,

  async sendComment(comment) {
    try {
      const response = await fetch(this.SERVER_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(comment)
      });
      if (!response.ok) {
        console.warn('[iNat Comments] Server responded with', response.status);
        return false;
      }
      return true;
    } catch (e) {
      // Server unreachable — expected when not running
      return false;
    }
  },

  async syncOne(comment) {
    const ok = await this.sendComment(comment);
    if (ok) {
      await CommentStore.markSynced(comment.id);
    }
    return ok;
  },

  async retryUnsynced() {
    const unsynced = await CommentStore.getUnsynced();
    if (unsynced.length === 0) return;

    console.log(`[iNat Comments] Retrying ${unsynced.length} unsynced comments`);
    const synced = [];
    for (const comment of unsynced) {
      const ok = await this.sendComment(comment);
      if (ok) {
        synced.push(comment.id);
      } else {
        // Server down, stop trying the rest
        break;
      }
    }
    if (synced.length > 0) {
      await CommentStore.markManySynced(synced);
      console.log(`[iNat Comments] Synced ${synced.length} comments`);
    }
  },

  startRetryLoop() {
    if (this._retryTimer) return;
    this._retryTimer = setInterval(() => this.retryUnsynced(), this.RETRY_INTERVAL_MS);
    // Also run immediately on start
    this.retryUnsynced();
  },

  stopRetryLoop() {
    if (this._retryTimer) {
      clearInterval(this._retryTimer);
      this._retryTimer = null;
    }
  }
};
```

Port 48372 is arbitrary — high port unlikely to conflict.

**Step 2: Commit**

```bash
git add lib/comment-sync.js
git commit -m "Add CommentSync module for localhost server sync"
```

---

### Task 4: Add webRequest interceptor in background script

**Files:**
- Modify: `manifest.json` (add new scripts to background)
- Modify: `background/background.js`

**Step 1: Add comment modules to background scripts in manifest.json**

Update the background scripts array:

```json
"background": {
  "scripts": [
    "lib/storage.js",
    "lib/comment-store.js",
    "lib/comment-sync.js",
    "lib/inat-auth.js",
    "lib/notifications-api.js",
    "background/background.js"
  ]
}
```

**Step 2: Add webRequest listener to background.js**

Add this block at the top of `background/background.js`, after the existing code:

```javascript
// --- Comment Capture via webRequest ---

// Intercept comment POST requests to iNaturalist
// iNat uses two possible endpoints:
//   1. Rails: POST /comments.json (form-encoded or JSON)
//   2. API v1: POST https://api.inaturalist.org/v1/comments (JSON)
browser.webRequest.onBeforeRequest.addListener(
  handleCommentRequest,
  {
    urls: [
      "*://*.inaturalist.org/comments*",
      "*://api.inaturalist.org/v1/comments*"
    ],
    types: ["xmlhttprequest"]
  },
  ["requestBody"]
);

function handleCommentRequest(details) {
  if (details.method !== 'POST') return;

  const commentText = extractCommentFromRequest(details);
  const observationId = extractObservationIdFromRequest(details);

  if (!commentText || !observationId) {
    console.log('[iNat Comments] Could not extract comment data from request');
    return;
  }

  console.log(`[iNat Comments] Captured comment on observation ${observationId}`);

  // Get metadata from content script, then store and sync
  captureComment(details.tabId, commentText, observationId);
}

function extractCommentFromRequest(details) {
  const body = details.requestBody;
  if (!body) return null;

  // JSON body (API v1)
  if (body.raw) {
    try {
      const decoder = new TextDecoder();
      const text = decoder.decode(body.raw[0].bytes);
      const json = JSON.parse(text);
      return json.comment?.body || null;
    } catch (e) {
      return null;
    }
  }

  // Form-encoded body (Rails)
  if (body.formData) {
    return body.formData['comment[body]']?.[0] || null;
  }

  return null;
}

function extractObservationIdFromRequest(details) {
  const body = details.requestBody;
  if (!body) return null;

  // JSON body
  if (body.raw) {
    try {
      const decoder = new TextDecoder();
      const text = decoder.decode(body.raw[0].bytes);
      const json = JSON.parse(text);
      if (json.comment?.parent_type === 'Observation') {
        return String(json.comment.parent_id);
      }
    } catch (e) {
      // fall through
    }
  }

  // Form-encoded body
  if (body.formData) {
    const parentType = body.formData['comment[parent_type]']?.[0];
    if (parentType === 'Observation') {
      return body.formData['comment[parent_id]']?.[0] || null;
    }
  }

  return null;
}

async function captureComment(tabId, commentText, observationId) {
  let metadata = {};
  try {
    metadata = await browser.tabs.sendMessage(tabId, { action: 'getMetadata' });
  } catch (e) {
    console.warn('[iNat Comments] Could not get metadata from tab:', e.message);
  }

  const comment = await CommentStore.addComment({
    commentText,
    observationId,
    observationUrl: `https://www.inaturalist.org/observations/${observationId}`,
    species: metadata.species,
    commonName: metadata.commonName,
    observer: metadata.observer,
    observationDate: metadata.observationDate,
    location: metadata.location,
    captureMethod: 'auto'
  });

  // Try to sync immediately
  await CommentSync.syncOne(comment);
}

// Start the retry loop for unsynced comments
CommentSync.startRetryLoop();
```

**Step 3: Test auto-capture**

Run: `npm run dev`
1. Navigate to an iNat observation
2. Post a comment
3. Check the browser console (background script) for `[iNat Comments] Captured comment on observation ...`
4. Check `browser.storage.local.get('inat_captured_comments')` in the extension debugger

**Step 4: Commit**

```bash
git add manifest.json background/background.js
git commit -m "Add webRequest interceptor for auto-capturing comments"
```

---

### Task 5: Add manual comment capture to content script

**Files:**
- Create: `content/comment-capture.js`
- Modify: `manifest.json` (add to content_scripts)

**Step 1: Create content/comment-capture.js**

Injects a small "save" button next to comments on observation pages. When clicked, captures that comment's text along with observation metadata.

```javascript
// Manual comment capture - injects save buttons next to comments on observation pages

(function() {
  // Only run on observation pages
  if (!window.location.pathname.match(/\/observations\/\d+/)) return;

  const BUTTON_CLASS = 'inat-ext-save-comment';

  function createSaveButton(commentText) {
    const btn = document.createElement('button');
    btn.className = BUTTON_CLASS;
    btn.textContent = 'Save';
    btn.title = 'Save this comment to your archive';
    btn.style.cssText = 'font-size:11px;padding:1px 6px;margin-left:6px;cursor:pointer;border:1px solid #999;border-radius:3px;background:#f0f0f0;color:#333;';
    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      btn.disabled = true;
      btn.textContent = 'Saving...';

      try {
        const metadata = extractMetadata();
        const observationId = window.location.pathname.match(/\/observations\/(\d+)/)?.[1];
        await browser.runtime.sendMessage({
          action: 'captureComment',
          commentText,
          observationId,
          observationUrl: window.location.href.split('?')[0],
          metadata
        });
        btn.textContent = 'Saved';
      } catch (err) {
        console.error('[iNat Comments] Manual save failed:', err);
        btn.textContent = 'Error';
        btn.disabled = false;
      }
    });
    return btn;
  }

  function injectSaveButtons() {
    // Remove existing buttons to avoid duplicates
    document.querySelectorAll(`.${BUTTON_CLASS}`).forEach(b => b.remove());

    // iNat comment selectors - comments appear in the activity feed
    const commentSelectors = [
      '.ActivityItem .body',           // React app
      '[class*="ActivityItem"] [class*="body"]',
      '.comment_body',                 // Classic
      '.activity_comment .body'
    ];

    for (const selector of commentSelectors) {
      document.querySelectorAll(selector).forEach(el => {
        const text = el.textContent.trim();
        if (!text) return;
        // Don't add button if one already exists nearby
        if (el.parentElement.querySelector(`.${BUTTON_CLASS}`)) return;

        const btn = createSaveButton(text);
        // Insert after the comment body
        el.parentElement.appendChild(btn);
      });
    }
  }

  // Run once after page settles (iNat is React, content loads async)
  setTimeout(injectSaveButtons, 3000);

  // Re-inject when new comments appear (e.g., after posting)
  const observer = new MutationObserver(() => {
    setTimeout(injectSaveButtons, 500);
  });

  // Observe the activity section for changes
  function startObserving() {
    const activitySection = document.querySelector('[class*="Activity"], .activity, #activity');
    if (activitySection) {
      observer.observe(activitySection, { childList: true, subtree: true });
    } else {
      // Retry — React may not have rendered yet
      setTimeout(startObserving, 2000);
    }
  }
  startObserving();
})();
```

**Step 2: Add to manifest.json content_scripts**

Add `"content/comment-capture.js"` to the js array in the content_scripts section:

```json
"content_scripts": [{
  "matches": ["*://*.inaturalist.org/*"],
  "js": [
    "lib/inat-auth.js",
    "lib/notifications.js",
    "lib/notification-ui.js",
    "lib/notification-controller.js",
    "content/dropdown.js",
    "content/content.js",
    "content/comment-capture.js"
  ],
  "css": [
    "lib/notification-ui.css",
    "content/dropdown.css"
  ]
}]
```

**Step 3: Handle the captureComment message in background.js**

Add a new case to the `browser.runtime.onMessage.addListener` switch in `background/background.js`:

```javascript
case 'captureComment':
  return (async () => {
    const comment = await CommentStore.addComment({
      commentText: message.commentText,
      observationId: message.observationId,
      observationUrl: message.observationUrl,
      species: message.metadata?.species,
      commonName: message.metadata?.commonName,
      observer: message.metadata?.observer,
      observationDate: message.metadata?.observationDate,
      location: message.metadata?.location,
      captureMethod: 'manual'
    });
    await CommentSync.syncOne(comment);
    return comment;
  })();
```

**Step 4: Test manual capture**

Run: `npm run dev`
1. Navigate to an iNat observation with comments
2. Look for small "Save" buttons next to comment bodies
3. Click one — should change to "Saved"
4. Verify in storage via extension debugger

**Step 5: Commit**

```bash
git add content/comment-capture.js manifest.json background/background.js
git commit -m "Add manual comment capture with save buttons on observation pages"
```

---

### Task 6: End-to-end testing and polish

**Files:**
- Possibly modify: `background/background.js`, `content/comment-capture.js`

**Step 1: Test auto-capture end to end**

Run: `npm run dev`
1. Go to any iNat observation
2. Post a comment
3. Check background console for capture log
4. Verify comment stored in `browser.storage.local`

**Step 2: Test manual capture end to end**

1. On the same observation page, find the comment you just posted
2. Click the "Save" button next to it
3. Verify it stores (check for duplicate — same comment via auto and manual is fine, they're separate captures)

**Step 3: Test server sync behavior**

1. With no server running, post a comment — should capture with `synced: false`
2. Start a simple test server:
   ```bash
   npx http-echo-server 48372
   ```
   Or use a one-liner:
   ```bash
   node -e "require('http').createServer((q,r)=>{let d='';q.on('data',c=>d+=c);q.on('end',()=>{console.log(JSON.parse(d));r.writeHead(200);r.end('ok')})}).listen(48372,()=>console.log('listening on 48372'))"
   ```
3. Wait for retry loop (5 min) or trigger manually — comment should sync

**Step 4: Test lint passes**

Run: `npm run lint`
Expected: No errors

**Step 5: Commit any fixes**

```bash
git add -A
git commit -m "Polish comment capture after end-to-end testing"
```

---

### Task 7: Version bump and release prep

**Files:**
- Modify: `manifest.json` (version)
- Modify: `package.json` (version)

**Step 1: Bump version**

Update version in both `manifest.json` and `package.json` from `0.3.0` to `0.4.0`.

**Step 2: Commit**

```bash
git add manifest.json package.json
git commit -m "Bump version to v0.4.0 for comment capture feature"
```

**Step 3: Sign and release**

Follow the release process:
```bash
npm run sign
# User pushes: git push origin main
gh release create v0.4.0 web-ext-artifacts/*.xpi --title "v0.4.0" --notes "Add comment capture: auto-captures comments via network interception, manual save buttons on observation pages, syncs to local server"
```
