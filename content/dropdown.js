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
  totalResults: 0,

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
    this.totalResults = 0;
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

      this.totalResults = response.totalResults;
      this.hasMore = this.notifications.length < this.totalResults;
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
      <div class="inat-ext-notification ${n.viewed ? '' : 'unread'}" data-id="${n.id}" data-url="${this.escapeHtml(n.observationUrl)}">
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
