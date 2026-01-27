# Notifications Feature Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace iNat's notification UI with a dropdown popup and sidebar panel for power-user notification management.

**Architecture:** Content script intercepts bell click, injects custom dropdown. Background script handles authenticated API calls via session cookies. Sidebar gets new Notifications tab. Notifications separated by type: Mentions, Comments, IDs.

**Tech Stack:** Browser extension APIs, iNaturalist API v1, vanilla JS (matching existing codebase style)

---

## Task 1: Update Manifest Permissions

**Files:**
- Modify: `manifest.json`

**Step 1: Add host permission for iNat API**

In `manifest.json`, add to the `permissions` array:

```json
"permissions": [
  "storage",
  "tabs",
  "*://*.inaturalist.org/*"
]
```

**Step 2: Expand content script to all iNat pages**

Change the `content_scripts` matches from just observations to all iNat pages:

```json
"content_scripts": [{
  "matches": ["*://*.inaturalist.org/*"],
  "js": ["content/content.js"]
}]
```

**Step 3: Verify manifest is valid JSON**

Run: `cat manifest.json | jq .`
Expected: Valid JSON output with new permissions

**Step 4: Commit**

```bash
git add manifest.json
git commit -m "feat: add host permission for iNat API calls"
```

---

## Task 2: Create Notifications API Client

**Files:**
- Create: `lib/notifications-api.js`

**Step 1: Create the API client file**

```javascript
// Notifications API client for iNaturalist
// Uses session cookies for authentication (user must be logged into iNat)

const NotificationsAPI = {
  BASE_URL: 'https://api.inaturalist.org/v1',

  // Fetch notifications/updates
  // Returns: { results: [...], total_results: number, page: number, per_page: number }
  async getUpdates(options = {}) {
    const params = new URLSearchParams({
      per_page: options.perPage || 20,
      page: options.page || 1,
      observations_by: 'owner'
    });

    const response = await fetch(`${this.BASE_URL}/observations/updates?${params}`, {
      credentials: 'include'  // Include cookies for auth
    });

    if (!response.ok) {
      if (response.status === 401) {
        throw new Error('Not logged in to iNaturalist');
      }
      throw new Error(`API error: ${response.status}`);
    }

    return response.json();
  },

  // Mark a notification as viewed/read
  async markViewed(notificationId) {
    const response = await fetch(`${this.BASE_URL}/observations/${notificationId}/viewed`, {
      method: 'PUT',
      credentials: 'include'
    });

    if (!response.ok) {
      throw new Error(`Failed to mark as read: ${response.status}`);
    }

    return true;
  },

  // Mark all notifications as viewed
  async markAllViewed() {
    const response = await fetch(`${this.BASE_URL}/observations/updates/viewed`, {
      method: 'PUT',
      credentials: 'include'
    });

    if (!response.ok) {
      throw new Error(`Failed to mark all as read: ${response.status}`);
    }

    return true;
  },

  // Categorize notification by type
  // Returns: 'mention', 'comment', or 'identification'
  categorizeNotification(notification) {
    const notifType = notification.notification || '';
    const body = notification.comment?.body || notification.identification?.body || '';

    // Check for @mention in comment/ID body
    if (body.includes('@')) {
      // Could refine this to check for actual username mention
      return 'mention';
    }

    if (notifType === 'comment' || notification.comment) {
      return 'comment';
    }

    if (notifType === 'identification' || notification.identification) {
      return 'identification';
    }

    return 'identification'; // default
  },

  // Transform API response into normalized notification objects
  normalizeNotification(raw) {
    const category = this.categorizeNotification(raw);
    const resource = raw.comment || raw.identification || {};
    const user = resource.user || {};

    return {
      id: raw.id,
      category,
      viewed: raw.viewed,
      createdAt: raw.created_at,
      observationId: raw.resource_owner_id,
      user: {
        login: user.login || 'unknown',
        name: user.name || user.login || 'Unknown user',
        iconUrl: user.icon_url || null
      },
      body: resource.body || null,
      taxon: resource.taxon ? {
        id: resource.taxon.id,
        name: resource.taxon.name,
        commonName: resource.taxon.preferred_common_name || null
      } : null,
      observationUrl: `https://www.inaturalist.org/observations/${raw.resource_owner_id}`
    };
  }
};
```

**Step 2: Test the file loads without syntax errors**

Run: `node --check lib/notifications-api.js`
Expected: No output (no syntax errors)

**Step 3: Commit**

```bash
git add lib/notifications-api.js
git commit -m "feat: add notifications API client"
```

---

## Task 3: Add Notifications API to Background Script

**Files:**
- Modify: `manifest.json` (add script to background)
- Modify: `background/background.js` (add message handlers)

**Step 1: Add notifications-api.js to background scripts in manifest**

Change the background scripts array:

```json
"background": {
  "scripts": ["lib/storage.js", "lib/notifications-api.js", "background/background.js"]
}
```

**Step 2: Add message handlers for notifications in background.js**

Add these cases to the switch statement in the `onMessage` listener (before the `default` case):

```javascript
    case 'getNotifications':
      return (async () => {
        const response = await NotificationsAPI.getUpdates({
          page: message.page || 1,
          perPage: message.perPage || 20
        });
        return {
          notifications: response.results.map(n => NotificationsAPI.normalizeNotification(n)),
          totalResults: response.total_results,
          page: response.page,
          perPage: response.per_page
        };
      })();

    case 'markNotificationRead':
      return NotificationsAPI.markViewed(message.notificationId);

    case 'markAllNotificationsRead':
      return NotificationsAPI.markAllViewed();
```

**Step 3: Verify syntax**

Run: `node --check background/background.js`
Expected: No output (no syntax errors)

**Step 4: Commit**

```bash
git add manifest.json background/background.js
git commit -m "feat: add notification message handlers to background"
```

---

## Task 4: Create Dropdown CSS

**Files:**
- Create: `content/dropdown.css`

**Step 1: Create the dropdown styles**

```css
/* iNat Link Manager - Notifications Dropdown */

.inat-ext-dropdown-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 99998;
}

.inat-ext-dropdown {
  position: absolute;
  width: 360px;
  max-height: 500px;
  background: #fff;
  border-radius: 8px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
  z-index: 99999;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  font-size: 13px;
  color: #333;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.inat-ext-dropdown-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  border-bottom: 1px solid #eee;
  background: #fafafa;
}

.inat-ext-dropdown-title {
  font-weight: 600;
  font-size: 14px;
}

.inat-ext-mark-all-btn {
  padding: 4px 8px;
  font-size: 11px;
  border: 1px solid #ddd;
  border-radius: 4px;
  background: #fff;
  cursor: pointer;
  color: #666;
}

.inat-ext-mark-all-btn:hover {
  background: #f0f0f0;
}

.inat-ext-tabs {
  display: flex;
  border-bottom: 1px solid #eee;
  background: #fff;
}

.inat-ext-tab {
  flex: 1;
  padding: 10px 8px;
  border: none;
  background: transparent;
  cursor: pointer;
  font-size: 12px;
  color: #666;
  text-align: center;
  transition: all 0.2s;
}

.inat-ext-tab:hover {
  background: #f5f5f5;
}

.inat-ext-tab.active {
  color: #74ac00;
  border-bottom: 2px solid #74ac00;
  font-weight: 500;
}

.inat-ext-tab-badge {
  display: inline-block;
  min-width: 16px;
  height: 16px;
  line-height: 16px;
  padding: 0 4px;
  margin-left: 4px;
  background: #e0e0e0;
  border-radius: 8px;
  font-size: 10px;
  font-weight: 600;
}

.inat-ext-tab.active .inat-ext-tab-badge {
  background: #74ac00;
  color: #fff;
}

.inat-ext-list {
  flex: 1;
  overflow-y: auto;
  max-height: 350px;
}

.inat-ext-notification {
  padding: 12px 16px;
  border-bottom: 1px solid #f0f0f0;
  cursor: pointer;
  transition: background 0.15s;
}

.inat-ext-notification:hover {
  background: #f9f9f9;
}

.inat-ext-notification.unread {
  background: #f8fdf0;
}

.inat-ext-notification.unread:hover {
  background: #f0f8e0;
}

.inat-ext-notification-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}

.inat-ext-notification-icon {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: #eee;
}

.inat-ext-notification-user {
  font-weight: 500;
  flex: 1;
}

.inat-ext-notification-time {
  font-size: 11px;
  color: #999;
}

.inat-ext-notification-body {
  font-size: 12px;
  color: #666;
  margin-top: 4px;
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

.inat-ext-notification-taxon {
  font-style: italic;
  color: #74ac00;
}

.inat-ext-dropdown-footer {
  display: flex;
  justify-content: space-between;
  padding: 10px 16px;
  border-top: 1px solid #eee;
  background: #fafafa;
}

.inat-ext-footer-btn {
  padding: 6px 12px;
  font-size: 12px;
  border: 1px solid #ddd;
  border-radius: 4px;
  background: #fff;
  cursor: pointer;
  color: #666;
}

.inat-ext-footer-btn:hover {
  background: #f0f0f0;
}

.inat-ext-footer-btn.primary {
  background: #74ac00;
  color: #fff;
  border-color: #74ac00;
}

.inat-ext-footer-btn.primary:hover {
  background: #5d8a00;
}

.inat-ext-loading,
.inat-ext-error,
.inat-ext-empty {
  padding: 40px 20px;
  text-align: center;
  color: #888;
}

.inat-ext-error {
  color: #c00;
}

.inat-ext-unread-dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  background: #74ac00;
  border-radius: 50%;
  margin-right: 6px;
}
```

**Step 2: Commit**

```bash
git add content/dropdown.css
git commit -m "feat: add dropdown styles"
```

---

## Task 5: Create Dropdown JavaScript

**Files:**
- Create: `content/dropdown.js`

**Step 1: Create the dropdown module**

```javascript
// Notifications dropdown UI for iNaturalist pages

const NotificationsDropdown = {
  dropdown: null,
  overlay: null,
  notifications: [],
  currentTab: 'mention',
  isLoading: false,
  error: null,
  page: 1,
  hasMore: true,

  // Initialize - find and hook the notification bell
  init() {
    this.findAndHookBell();
    // Re-check periodically for SPA navigation
    setInterval(() => this.findAndHookBell(), 2000);
  },

  findAndHookBell() {
    // Common selectors for the notification bell
    const selectors = [
      '.notifications-icon',
      '[class*="notification"] button',
      '[class*="Notification"] button',
      'a[href*="notifications"]',
      '.nav-notifications'
    ];

    for (const selector of selectors) {
      const bell = document.querySelector(selector);
      if (bell && !bell.dataset.inatExtHooked) {
        bell.dataset.inatExtHooked = 'true';
        bell.addEventListener('click', (e) => this.handleBellClick(e), true);
        console.log('[iNat Ext] Hooked notification bell:', selector);
        return;
      }
    }
  },

  handleBellClick(e) {
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();

    if (this.dropdown) {
      this.close();
    } else {
      this.open(e.target);
    }
  },

  async open(bellElement) {
    // Create overlay
    this.overlay = document.createElement('div');
    this.overlay.className = 'inat-ext-dropdown-overlay';
    this.overlay.addEventListener('click', () => this.close());

    // Create dropdown
    this.dropdown = document.createElement('div');
    this.dropdown.className = 'inat-ext-dropdown';
    this.dropdown.innerHTML = this.renderLoading();

    // Position near bell
    const rect = bellElement.getBoundingClientRect();
    this.dropdown.style.top = `${rect.bottom + 8}px`;
    this.dropdown.style.right = `${window.innerWidth - rect.right}px`;

    document.body.appendChild(this.overlay);
    document.body.appendChild(this.dropdown);

    // Prevent clicks inside dropdown from closing
    this.dropdown.addEventListener('click', (e) => e.stopPropagation());

    // Handle escape key
    this.escHandler = (e) => {
      if (e.key === 'Escape') this.close();
    };
    document.addEventListener('keydown', this.escHandler);

    // Fetch notifications
    await this.loadNotifications();
  },

  close() {
    if (this.overlay) {
      this.overlay.remove();
      this.overlay = null;
    }
    if (this.dropdown) {
      this.dropdown.remove();
      this.dropdown = null;
    }
    if (this.escHandler) {
      document.removeEventListener('keydown', this.escHandler);
      this.escHandler = null;
    }
    // Reset state
    this.notifications = [];
    this.page = 1;
    this.hasMore = true;
  },

  async loadNotifications(append = false) {
    if (this.isLoading) return;

    this.isLoading = true;
    this.error = null;

    if (!append) {
      this.dropdown.innerHTML = this.renderLoading();
    }

    try {
      const response = await browser.runtime.sendMessage({
        action: 'getNotifications',
        page: this.page,
        perPage: 20
      });

      if (append) {
        this.notifications = [...this.notifications, ...response.notifications];
      } else {
        this.notifications = response.notifications;
      }

      this.hasMore = this.notifications.length < response.totalResults;
      this.render();
    } catch (err) {
      console.error('[iNat Ext] Failed to load notifications:', err);
      this.error = err.message;
      this.render();
    } finally {
      this.isLoading = false;
    }
  },

  render() {
    if (!this.dropdown) return;

    if (this.error) {
      this.dropdown.innerHTML = this.renderError();
      return;
    }

    const filtered = this.getFilteredNotifications();
    const counts = this.getCounts();

    this.dropdown.innerHTML = `
      <div class="inat-ext-dropdown-header">
        <span class="inat-ext-dropdown-title">Notifications</span>
        <button class="inat-ext-mark-all-btn">Mark all read</button>
      </div>
      <div class="inat-ext-tabs">
        <button class="inat-ext-tab ${this.currentTab === 'mention' ? 'active' : ''}" data-tab="mention">
          Mentions<span class="inat-ext-tab-badge">${counts.mention}</span>
        </button>
        <button class="inat-ext-tab ${this.currentTab === 'comment' ? 'active' : ''}" data-tab="comment">
          Comments<span class="inat-ext-tab-badge">${counts.comment}</span>
        </button>
        <button class="inat-ext-tab ${this.currentTab === 'identification' ? 'active' : ''}" data-tab="identification">
          IDs<span class="inat-ext-tab-badge">${counts.identification}</span>
        </button>
      </div>
      <div class="inat-ext-list">
        ${filtered.length ? filtered.map(n => this.renderNotification(n)).join('') : this.renderEmpty()}
      </div>
      <div class="inat-ext-dropdown-footer">
        <button class="inat-ext-footer-btn" ${!this.hasMore || this.isLoading ? 'disabled' : ''}>
          ${this.isLoading ? 'Loading...' : 'Load more'}
        </button>
        <button class="inat-ext-footer-btn primary open-sidebar-btn">Open in sidebar</button>
      </div>
    `;

    this.attachEventListeners();
  },

  renderNotification(n) {
    const timeAgo = this.formatTimeAgo(n.createdAt);
    const bodyHtml = n.body
      ? `<div class="inat-ext-notification-body">${this.escapeHtml(n.body)}</div>`
      : '';
    const taxonHtml = n.taxon
      ? `<span class="inat-ext-notification-taxon">${this.escapeHtml(n.taxon.name)}</span>`
      : '';

    let action = '';
    if (n.category === 'mention') action = 'mentioned you';
    else if (n.category === 'comment') action = 'commented';
    else if (n.category === 'identification') action = `identified as ${taxonHtml}`;

    return `
      <div class="inat-ext-notification ${n.viewed ? '' : 'unread'}" data-id="${n.id}" data-url="${n.observationUrl}">
        <div class="inat-ext-notification-header">
          ${!n.viewed ? '<span class="inat-ext-unread-dot"></span>' : ''}
          ${n.user.iconUrl ? `<img class="inat-ext-notification-icon" src="${n.user.iconUrl}" alt="">` : '<div class="inat-ext-notification-icon"></div>'}
          <span class="inat-ext-notification-user">${this.escapeHtml(n.user.name)}</span>
          <span class="inat-ext-notification-time">${timeAgo}</span>
        </div>
        <div class="inat-ext-notification-body">${action}</div>
        ${bodyHtml}
      </div>
    `;
  },

  renderLoading() {
    return '<div class="inat-ext-loading">Loading notifications...</div>';
  },

  renderError() {
    return `<div class="inat-ext-error">Error: ${this.escapeHtml(this.error)}</div>`;
  },

  renderEmpty() {
    return '<div class="inat-ext-empty">No notifications in this category</div>';
  },

  attachEventListeners() {
    // Tab switching
    this.dropdown.querySelectorAll('.inat-ext-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        this.currentTab = tab.dataset.tab;
        this.render();
      });
    });

    // Notification clicks
    this.dropdown.querySelectorAll('.inat-ext-notification').forEach(el => {
      el.addEventListener('click', () => this.handleNotificationClick(el));
    });

    // Mark all read
    const markAllBtn = this.dropdown.querySelector('.inat-ext-mark-all-btn');
    if (markAllBtn) {
      markAllBtn.addEventListener('click', () => this.handleMarkAllRead());
    }

    // Load more
    const loadMoreBtn = this.dropdown.querySelector('.inat-ext-footer-btn:not(.primary)');
    if (loadMoreBtn && !loadMoreBtn.disabled) {
      loadMoreBtn.addEventListener('click', () => this.handleLoadMore());
    }

    // Open in sidebar
    const sidebarBtn = this.dropdown.querySelector('.open-sidebar-btn');
    if (sidebarBtn) {
      sidebarBtn.addEventListener('click', () => {
        browser.runtime.sendMessage({ action: 'openSidebarNotifications' });
        this.close();
      });
    }
  },

  async handleNotificationClick(el) {
    const url = el.dataset.url;
    const id = el.dataset.id;

    // Mark as read
    try {
      await browser.runtime.sendMessage({
        action: 'markNotificationRead',
        notificationId: id
      });
    } catch (err) {
      console.error('[iNat Ext] Failed to mark as read:', err);
    }

    // Open in new tab
    window.open(url, '_blank');
    this.close();
  },

  async handleMarkAllRead() {
    try {
      await browser.runtime.sendMessage({ action: 'markAllNotificationsRead' });
      // Update local state
      this.notifications.forEach(n => n.viewed = true);
      this.render();
    } catch (err) {
      console.error('[iNat Ext] Failed to mark all as read:', err);
    }
  },

  async handleLoadMore() {
    this.page++;
    await this.loadNotifications(true);
  },

  getFilteredNotifications() {
    return this.notifications.filter(n => n.category === this.currentTab);
  },

  getCounts() {
    const counts = { mention: 0, comment: 0, identification: 0 };
    this.notifications.forEach(n => {
      if (counts[n.category] !== undefined) {
        counts[n.category]++;
      }
    });
    return counts;
  },

  formatTimeAgo(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const seconds = Math.floor((now - date) / 1000);

    if (seconds < 60) return 'just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
    return date.toLocaleDateString();
  },

  escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
};

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => NotificationsDropdown.init());
} else {
  NotificationsDropdown.init();
}
```

**Step 2: Verify syntax**

Run: `node --check content/dropdown.js`
Expected: No output (no syntax errors)

**Step 3: Commit**

```bash
git add content/dropdown.js
git commit -m "feat: add notifications dropdown UI"
```

---

## Task 6: Register Dropdown in Manifest

**Files:**
- Modify: `manifest.json`

**Step 1: Add dropdown files to content_scripts**

Update the content_scripts section to include the dropdown JS and CSS:

```json
"content_scripts": [{
  "matches": ["*://*.inaturalist.org/*"],
  "js": ["content/dropdown.js", "content/content.js"],
  "css": ["content/dropdown.css"]
}]
```

**Step 2: Commit**

```bash
git add manifest.json
git commit -m "feat: register dropdown in content scripts"
```

---

## Task 7: Add Notifications Tab to Sidebar HTML

**Files:**
- Modify: `sidebar/sidebar.html`

**Step 1: Add the Notifications tab button**

Update the `<nav class="tabs">` section:

```html
    <nav class="tabs">
      <button class="tab active" data-tab="todo">TODOs</button>
      <button class="tab" data-tab="research">Research</button>
      <button class="tab" data-tab="notifications">Notifications</button>
    </nav>
```

**Step 2: Add the notifications panel**

After the `research-panel` div, add:

```html
      <div id="notifications-panel" class="panel">
        <div class="panel-header notifications-header">
          <div class="notifications-filters">
            <label><input type="radio" name="notif-filter" value="unread" checked> Unread</label>
            <label><input type="radio" name="notif-filter" value="all"> All</label>
          </div>
          <button id="mark-all-read-btn" class="btn-small">Mark all read</button>
        </div>
        <div class="notif-type-tabs">
          <button class="notif-tab active" data-type="mention">Mentions</button>
          <button class="notif-tab" data-type="comment">Comments</button>
          <button class="notif-tab" data-type="identification">IDs</button>
        </div>
        <ul id="notifications-list" class="item-list"></ul>
        <div class="notif-pagination">
          <button id="notif-prev" class="btn-small" disabled>&larr; Prev</button>
          <span id="notif-page-info">Page 1</span>
          <button id="notif-next" class="btn-small">Next &rarr;</button>
        </div>
      </div>
```

**Step 3: Commit**

```bash
git add sidebar/sidebar.html
git commit -m "feat: add notifications tab to sidebar HTML"
```

---

## Task 8: Add Sidebar Notifications CSS

**Files:**
- Modify: `sidebar/sidebar.css`

**Step 1: Add notifications-specific styles**

Append to the end of `sidebar/sidebar.css`:

```css

/* Notifications panel styles */
.notifications-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.notifications-filters {
  display: flex;
  gap: 12px;
}

.notifications-filters label {
  font-size: 12px;
  color: #666;
  cursor: pointer;
}

.notifications-filters input {
  margin-right: 4px;
}

.notif-type-tabs {
  display: flex;
  background: #fff;
  border-bottom: 1px solid #eee;
}

.notif-tab {
  flex: 1;
  padding: 8px;
  border: none;
  background: transparent;
  cursor: pointer;
  font-size: 12px;
  color: #666;
  transition: all 0.2s;
}

.notif-tab:hover {
  background: #f5f5f5;
}

.notif-tab.active {
  color: #74ac00;
  border-bottom: 2px solid #74ac00;
  font-weight: 500;
}

.notif-item {
  padding: 12px;
  background: #fff;
  border-bottom: 1px solid #eee;
  cursor: pointer;
  transition: background 0.2s;
}

.notif-item:hover {
  background: #fafafa;
}

.notif-item.unread {
  background: #f8fdf0;
}

.notif-item.unread:hover {
  background: #f0f8e0;
}

.notif-item-header {
  display: flex;
  align-items: center;
  gap: 8px;
}

.notif-unread-dot {
  width: 8px;
  height: 8px;
  background: #74ac00;
  border-radius: 50%;
  flex-shrink: 0;
}

.notif-user-icon {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: #eee;
}

.notif-user {
  font-weight: 500;
  flex: 1;
}

.notif-time {
  font-size: 11px;
  color: #999;
}

.notif-body {
  font-size: 12px;
  color: #666;
  margin-top: 4px;
  margin-left: 40px;
}

.notif-taxon {
  font-style: italic;
  color: #74ac00;
}

.notif-actions {
  margin-top: 8px;
  margin-left: 40px;
}

.notif-actions button {
  padding: 4px 8px;
  font-size: 11px;
  border: 1px solid #ddd;
  border-radius: 3px;
  background: #fff;
  cursor: pointer;
}

.notif-actions button:hover {
  background: #f0f0f0;
}

.notif-pagination {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 12px;
  padding: 12px;
  background: #fff;
  border-top: 1px solid #eee;
}

#notif-page-info {
  font-size: 12px;
  color: #666;
}

.notif-loading,
.notif-error,
.notif-empty {
  padding: 40px 20px;
  text-align: center;
  color: #888;
}

.notif-error {
  color: #c00;
}
```

**Step 2: Commit**

```bash
git add sidebar/sidebar.css
git commit -m "feat: add sidebar notifications styles"
```

---

## Task 9: Add Sidebar Notifications JavaScript

**Files:**
- Modify: `sidebar/sidebar.js`

**Step 1: Add notifications state variables**

At the top of the file, after the existing state variables, add:

```javascript
let notifCurrentType = 'mention';
let notifShowUnreadOnly = true;
let notifPage = 1;
let notifTotalPages = 1;
let notificationsCache = [];
```

**Step 2: Add notifications setup to DOMContentLoaded**

In the `DOMContentLoaded` event handler, add after `loadItems();`:

```javascript
  setupNotifications();
```

**Step 3: Add the setupNotifications function**

Add this function after the existing setup functions:

```javascript
// Notifications panel setup
function setupNotifications() {
  // Type tabs
  document.querySelectorAll('.notif-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelector('.notif-tab.active').classList.remove('active');
      tab.classList.add('active');
      notifCurrentType = tab.dataset.type;
      renderNotifications();
    });
  });

  // Unread/All filter
  document.querySelectorAll('input[name="notif-filter"]').forEach(radio => {
    radio.addEventListener('change', (e) => {
      notifShowUnreadOnly = e.target.value === 'unread';
      renderNotifications();
    });
  });

  // Mark all read button
  document.getElementById('mark-all-read-btn').addEventListener('click', handleMarkAllRead);

  // Pagination
  document.getElementById('notif-prev').addEventListener('click', () => {
    if (notifPage > 1) {
      notifPage--;
      loadNotifications();
    }
  });

  document.getElementById('notif-next').addEventListener('click', () => {
    if (notifPage < notifTotalPages) {
      notifPage++;
      loadNotifications();
    }
  });
}
```

**Step 4: Add loadNotifications function**

```javascript
async function loadNotifications() {
  const list = document.getElementById('notifications-list');
  list.innerHTML = '<li class="notif-loading">Loading notifications...</li>';

  try {
    const response = await browser.runtime.sendMessage({
      action: 'getNotifications',
      page: notifPage,
      perPage: 20
    });

    notificationsCache = response.notifications;
    notifTotalPages = Math.ceil(response.totalResults / response.perPage) || 1;

    updatePaginationUI();
    renderNotifications();
  } catch (error) {
    console.error('Error loading notifications:', error);
    list.innerHTML = `<li class="notif-error">Error: ${escapeHtml(error.message)}</li>`;
  }
}

function updatePaginationUI() {
  document.getElementById('notif-page-info').textContent = `Page ${notifPage} of ${notifTotalPages}`;
  document.getElementById('notif-prev').disabled = notifPage <= 1;
  document.getElementById('notif-next').disabled = notifPage >= notifTotalPages;
}
```

**Step 5: Add renderNotifications function**

```javascript
function renderNotifications() {
  const list = document.getElementById('notifications-list');

  let filtered = notificationsCache.filter(n => n.category === notifCurrentType);
  if (notifShowUnreadOnly) {
    filtered = filtered.filter(n => !n.viewed);
  }

  if (filtered.length === 0) {
    list.innerHTML = '<li class="notif-empty">No notifications</li>';
    return;
  }

  list.innerHTML = filtered.map(n => renderNotificationItem(n)).join('');

  // Attach click handlers
  list.querySelectorAll('.notif-item').forEach(el => {
    el.addEventListener('click', (e) => {
      if (e.target.tagName === 'BUTTON') return;
      handleNotificationClick(el.dataset.id, el.dataset.url);
    });

    const markBtn = el.querySelector('.mark-read-btn');
    if (markBtn) {
      markBtn.addEventListener('click', () => handleMarkRead(el.dataset.id));
    }
  });
}

function renderNotificationItem(n) {
  const timeAgo = formatTimeAgo(n.createdAt);

  let action = '';
  if (n.category === 'mention') action = 'mentioned you';
  else if (n.category === 'comment') action = 'commented';
  else if (n.category === 'identification') {
    const taxon = n.taxon ? `<span class="notif-taxon">${escapeHtml(n.taxon.name)}</span>` : 'something';
    action = `identified as ${taxon}`;
  }

  const bodyHtml = n.body ? `<div class="notif-body">${escapeHtml(n.body)}</div>` : '';

  return `
    <li class="notif-item ${n.viewed ? '' : 'unread'}" data-id="${n.id}" data-url="${n.observationUrl}">
      <div class="notif-item-header">
        ${!n.viewed ? '<span class="notif-unread-dot"></span>' : ''}
        ${n.user.iconUrl ? `<img class="notif-user-icon" src="${n.user.iconUrl}" alt="">` : '<div class="notif-user-icon"></div>'}
        <span class="notif-user">${escapeHtml(n.user.name)}</span>
        <span class="notif-time">${timeAgo}</span>
      </div>
      <div class="notif-body">${action}</div>
      ${bodyHtml}
      <div class="notif-actions">
        ${!n.viewed ? '<button class="mark-read-btn">Mark read</button>' : ''}
      </div>
    </li>
  `;
}

function formatTimeAgo(dateString) {
  const date = new Date(dateString);
  const now = new Date();
  const seconds = Math.floor((now - date) / 1000);

  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
  return date.toLocaleDateString();
}
```

**Step 6: Add notification action handlers**

```javascript
async function handleNotificationClick(id, url) {
  // Mark as read
  try {
    await browser.runtime.sendMessage({
      action: 'markNotificationRead',
      notificationId: id
    });
    // Update local cache
    const notif = notificationsCache.find(n => n.id === id);
    if (notif) notif.viewed = true;
    renderNotifications();
  } catch (error) {
    console.error('Error marking notification read:', error);
  }

  // Open observation
  browser.tabs.create({ url });
}

async function handleMarkRead(id) {
  try {
    await browser.runtime.sendMessage({
      action: 'markNotificationRead',
      notificationId: id
    });
    const notif = notificationsCache.find(n => n.id === id);
    if (notif) notif.viewed = true;
    renderNotifications();
  } catch (error) {
    console.error('Error marking notification read:', error);
  }
}

async function handleMarkAllRead() {
  try {
    await browser.runtime.sendMessage({ action: 'markAllNotificationsRead' });
    notificationsCache.forEach(n => n.viewed = true);
    renderNotifications();
  } catch (error) {
    console.error('Error marking all read:', error);
  }
}
```

**Step 7: Update tab switching to load notifications**

Find the existing `setupTabs` function and update the click handler to load notifications when that tab is selected:

```javascript
      currentTab = tab.dataset.tab;
      if (currentTab === 'notifications') {
        loadNotifications();
      } else {
        loadItems();
      }
```

**Step 8: Verify syntax**

Run: `node --check sidebar/sidebar.js`
Expected: No output (no syntax errors)

**Step 9: Commit**

```bash
git add sidebar/sidebar.js
git commit -m "feat: add notifications panel to sidebar"
```

---

## Task 10: Add Open Sidebar Handler to Background

**Files:**
- Modify: `background/background.js`

**Step 1: Add handler for opening sidebar to notifications**

Add this case to the message handler switch statement:

```javascript
    case 'openSidebarNotifications':
      browser.sidebarAction.open();
      // Note: We can't directly switch tabs in the sidebar from background
      // The sidebar will need to check for a flag or the user switches manually
      return true;
```

**Step 2: Commit**

```bash
git add background/background.js
git commit -m "feat: add open sidebar handler"
```

---

## Task 11: Manual Testing

**No files to modify - testing only**

**Step 1: Load the extension in Firefox**

Run: `cd /Users/jeff/dev/inat-extension/.worktrees/notifications && npx web-ext run`

**Step 2: Test checklist**

1. Navigate to inaturalist.org and log in
2. Click the notification bell - should show custom dropdown instead of native
3. Verify tabs show Mentions | Comments | IDs
4. Click a notification - should open observation and mark as read
5. Click "Mark all read" - should mark all visible as read
6. Click "Open in sidebar" - should open extension sidebar
7. In sidebar, click Notifications tab - should show notifications with pagination
8. Test Unread/All filter toggle
9. Test pagination (Prev/Next buttons)
10. Test "Mark read" button on individual notifications

**Step 3: Note any issues for follow-up**

Document any bugs or improvements needed in a follow-up task.

---

## Task 12: Final Commit and Summary

**Step 1: Verify all changes are committed**

Run: `git status`
Expected: Clean working tree

**Step 2: Review commit history**

Run: `git log --oneline -10`

Should show commits for each task.

---

## Summary

This plan implements:
1. **API client** for iNaturalist notifications (lib/notifications-api.js)
2. **Dropdown UI** that replaces native notification bell (content/dropdown.js, dropdown.css)
3. **Sidebar panel** with full pagination (sidebar/sidebar.js, sidebar.html, sidebar.css)
4. **Message passing** between content scripts, background, and sidebar

The implementation keeps all existing functionality intact and follows the existing codebase patterns.
