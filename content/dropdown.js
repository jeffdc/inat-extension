// Notifications dropdown UI for iNaturalist pages

const NotificationsDropdown = {
  dropdown: null,
  overlay: null,
  controller: null,
  debugPanel: null,
  currentTab: 'mention',
  bypassNextClick: false,

  // Initialize - find and hook the notification bell
  init() {
    this.controller = new NotificationController({
      onUpdate: () => this.render(),
      onError: (type) => {
        if (type === 'auth' && this.dropdown) {
          this.dropdown.innerHTML = this.renderLoginPrompt();
        }
      }
    });
    this.findAndHookBell();
    // Re-check periodically for SPA navigation
    setInterval(() => this.findAndHookBell(), 2000);

    // Try to refresh JWT on page load
    this.refreshJWT();
  },

  async refreshJWT() {
    try {
      if (typeof iNatAuth !== 'undefined') {
        await iNatAuth.getJWT(true);
      }
    } catch (e) {
      // Ignore JWT refresh errors
    }
  },

  findAndHookBell() {
    const selectors = [
      '#header-updates-dropdown-toggle',
      '.notifications-icon',
      '[class*="notification"] button',
      '[class*="Notification"] button',
      'a[href*="notifications"]',
      '.nav-notifications'
    ];

    for (const selector of selectors) {
      const bell = document.querySelector(selector);
      if (bell) {
        if (bell.dataset.inatExtHooked) {
          return;
        }
        bell.dataset.inatExtHooked = 'true';
        bell.addEventListener('click', (e) => this.handleBellClick(e), true);
        return;
      }
    }
  },

  handleBellClick(e) {
    if (this.bypassNextClick) {
      this.bypassNextClick = false;
      return;
    }

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
    if (this.debugPanel) {
      this.debugPanel.remove();
      this.debugPanel = null;
    }
    // Reset state
    this.controller.store.clear();
    this.controller.debugData = null;
    this.debugRawMap = null;
  },

  async loadNotifications() {
    if (this.dropdown) {
      this.dropdown.innerHTML = this.renderLoading();
    }
    await this.controller.load({ page: 1, perPage: 50 });
  },

  render() {
    if (!this.dropdown) return;

    if (this.controller.error) {
      this.dropdown.innerHTML = this.renderError();
      return;
    }

    const counts = this.controller.store.getCounts();
    const filtered = this.controller.store.getByCategory(this.currentTab);

    this.dropdown.innerHTML = `
      <div class="inat-ext-dropdown-header">
        <span class="inat-ext-dropdown-title">Notifications</span>
        <span class="inat-ext-dropdown-count">${this.controller.store.size} total</span>
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
        ${filtered.length ? filtered.map(n => NotificationUI.renderItem(n)).join('') : this.renderEmpty()}
      </div>
      <div class="inat-ext-preview" style="display:none;"></div>
      <div class="inat-ext-dropdown-footer">
        <button class="inat-ext-footer-btn show-native-btn">Native view</button>
        <button class="inat-ext-footer-btn debug-btn">Debug</button>
        <button class="inat-ext-footer-btn primary open-sidebar-btn">Open in sidebar</button>
      </div>
    `;

    this.attachEventListeners();
  },

  renderLoading() {
    return '<div class="inat-ext-loading">Loading notifications...</div>';
  },

  renderError() {
    return `<div class="inat-ext-error">Error: ${NotificationUI.escapeHtml(this.controller.error)}</div>`;
  },

  renderEmpty() {
    return '<div class="inat-ext-empty">No notifications in this category</div>';
  },

  renderLoginPrompt() {
    return `
      <div class="inat-ext-login-prompt">
        <p>Please log in to iNaturalist to view notifications.</p>
        <a href="https://www.inaturalist.org/login" class="inat-ext-login-btn">Log in</a>
      </div>
    `;
  },

  buildPreviewHtml(n) {
    if (!n.observation) return '';
    const obs = n.observation;
    const previewPhoto = obs.mediumPhoto || obs.thumbnail;
    const taxonName = obs.taxon?.name || 'Unknown taxon';
    const qualityLabel = obs.qualityGrade
      ? obs.qualityGrade.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
      : '';

    return `
      <div class="inat-ext-preview-info">
        <div class="inat-ext-preview-taxon">${NotificationUI.escapeHtml(taxonName)}</div>
        ${obs.observer ? `<div class="inat-ext-preview-field">Observer: <span class="inat-ext-preview-value">${NotificationUI.escapeHtml(obs.observer)}</span></div>` : ''}
        ${obs.observedOn ? `<div class="inat-ext-preview-field">Date: <span class="inat-ext-preview-value">${NotificationUI.escapeHtml(obs.observedOn)}</span></div>` : ''}
        <div class="inat-ext-preview-meta">
          <span class="inat-ext-preview-ids">${obs.identificationsCount} IDs</span>${qualityLabel ? ` | <span class="inat-ext-preview-grade">${NotificationUI.escapeHtml(qualityLabel)}</span>` : ''}
        </div>
        <a class="inat-ext-preview-link" href="${NotificationUI.escapeHtml(n.observationUrl)}" target="_blank">View \u00BB</a>
      </div>
      ${previewPhoto ? `<img class="inat-ext-preview-photo" src="${previewPhoto}" alt="">` : ''}
    `;
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

    // Hover preview popout
    const preview = this.dropdown.querySelector('.inat-ext-preview');
    const filtered = this.controller.store.getByCategory(this.currentTab);
    const notifMap = {};
    for (const n of filtered) {
      notifMap[n.id] = n;
    }

    this.dropdown.querySelectorAll('.inat-ext-notification[data-has-obs="true"]').forEach(el => {
      el.addEventListener('mouseenter', () => {
        const n = notifMap[el.dataset.id];
        if (!n) return;
        preview.innerHTML = this.buildPreviewHtml(n);
        // Position to the left of the dropdown, aligned with this row
        const dropdownRect = this.dropdown.getBoundingClientRect();
        const rowRect = el.getBoundingClientRect();
        preview.style.display = 'flex';
        preview.style.top = `${rowRect.top - dropdownRect.top}px`;
      });
      el.addEventListener('mouseleave', () => {
        preview.style.display = 'none';
      });
    });

    // Open in sidebar
    const sidebarBtn = this.dropdown.querySelector('.open-sidebar-btn');
    if (sidebarBtn) {
      sidebarBtn.addEventListener('click', () => {
        browser.runtime.sendMessage({ action: 'openSidebarNotifications' });
        this.close();
      });
    }

    // Show native dropdown
    const nativeBtn = this.dropdown.querySelector('.show-native-btn');
    if (nativeBtn) {
      nativeBtn.addEventListener('click', () => this.showNativeDropdown());
    }

    // Debug panel
    const debugBtn = this.dropdown.querySelector('.debug-btn');
    if (debugBtn) {
      debugBtn.addEventListener('click', () => this.toggleDebugPanel());
    }
  },

  async handleNotificationClick(el) {
    const url = el.dataset.url;

    // Open in new tab
    window.open(url, '_blank');
    this.close();
  },

  showNativeDropdown() {
    const bell = document.querySelector('[data-inat-ext-hooked="true"]');
    if (!bell) {
      this.close();
      return;
    }

    this.close();
    this.bypassNextClick = true;
    bell.click();
  },

  toggleDebugPanel() {
    if (this.debugPanel) {
      this.debugPanel.remove();
      this.debugPanel = null;
      return;
    }
    if (!this.controller.debugData) return;

    this.debugPanel = document.createElement('div');
    this.debugPanel.className = 'inat-ext-debug-panel';
    this.debugPanel.addEventListener('click', (e) => e.stopPropagation());

    // Position to the left of the dropdown
    const dropdownRect = this.dropdown.getBoundingClientRect();
    this.debugPanel.style.top = `${dropdownRect.top}px`;
    this.debugPanel.style.right = `${window.innerWidth - dropdownRect.left + 8}px`;

    this.debugRawMap = {};
    this.debugPanel.innerHTML = this.renderDebugPanel();
    document.body.appendChild(this.debugPanel);

    // Wire up expand/collapse
    this.debugPanel.querySelectorAll('.inat-ext-debug-item-header').forEach(header => {
      header.addEventListener('click', (e) => {
        if (e.target.closest('.inat-ext-debug-copy-btn')) return;
        const item = header.closest('.inat-ext-debug-item');
        item.classList.toggle('expanded');
      });
    });

    // Wire up per-item copy buttons
    this.debugPanel.querySelectorAll('.inat-ext-debug-item .inat-ext-debug-copy-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const item = btn.closest('.inat-ext-debug-item');
        const raw = this.debugRawMap[item.dataset.rawKey] || '';
        navigator.clipboard.writeText(raw).then(() => {
          btn.textContent = 'Copied!';
          setTimeout(() => { btn.textContent = 'Copy'; }, 1500);
        });
      });
    });

    // Wire up full response copy buttons
    this.debugPanel.querySelectorAll('.inat-ext-debug-copy-full').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const raw = this.debugRawMap[btn.dataset.rawKey] || '';
        navigator.clipboard.writeText(raw).then(() => {
          const orig = btn.textContent;
          btn.textContent = 'Copied!';
          setTimeout(() => { btn.textContent = orig; }, 1500);
        });
      });
    });
  },

  renderDebugPanel() {
    const { apiResult, jsonResult, htmlResult } = this.controller.debugData;

    const sources = [
      { name: 'API v1', key: 'api_v1', result: apiResult, color: '#5cb85c' },
      { name: 'JSON', key: 'json', result: jsonResult, color: '#5bc0de' },
      { name: 'HTML', key: 'html', result: htmlResult, color: '#f0ad4e' }
    ];

    let html = '<div class="inat-ext-debug-header">Raw Fetch Data</div>';

    for (const src of sources) {
      const r = src.result;
      if (r.status === 'rejected') {
        html += `
          <div class="inat-ext-debug-source">
            <div class="inat-ext-debug-source-name" style="border-left: 3px solid ${src.color}">
              ${src.name} <span class="inat-ext-debug-error">FAILED: ${NotificationUI.escapeHtml(r.reason?.message || 'Unknown')}</span>
            </div>
          </div>`;
        continue;
      }

      const notifs = r.value.notifications || [];
      const fullRawKey = `${src.key}__full`;
      const rawResponse = r.value.rawResponse;
      if (typeof rawResponse === 'string') {
        this.debugRawMap[fullRawKey] = rawResponse;
      } else {
        try { this.debugRawMap[fullRawKey] = JSON.stringify(rawResponse, null, 2); } catch { this.debugRawMap[fullRawKey] = String(rawResponse); }
      }

      html += `
        <div class="inat-ext-debug-source">
          <div class="inat-ext-debug-source-name" style="border-left: 3px solid ${src.color}">
            ${src.name} <span class="inat-ext-debug-count">${notifs.length} items</span>
            <button class="inat-ext-debug-copy-btn inat-ext-debug-copy-full" data-raw-key="${fullRawKey}" title="Copy full response">Copy Full</button>
          </div>`;

      for (const n of notifs) {
        const catLabel = n.category || '?';
        const userLabel = n.user?.login || n.user?.name || '?';
        const timeLabel = NotificationUI.formatTimeAgo(n.createdAt);
        const obsId = n.observationId || '?';
        const bodySnippet = n.body ? n.body.substring(0, 60) + (n.body.length > 60 ? '...' : '') : '(no body)';

        // Build raw data for expansion
        let rawJson;
        try {
          rawJson = JSON.stringify(n.raw, null, 2);
        } catch {
          rawJson = String(n.raw);
        }

        const rawKey = `${src.key}_${n.id}`;
        this.debugRawMap[rawKey] = rawJson;

        html += `
          <div class="inat-ext-debug-item" data-raw-key="${rawKey}">
            <div class="inat-ext-debug-item-header">
              <span class="inat-ext-debug-cat inat-ext-debug-cat-${catLabel}">${catLabel}</span>
              <span class="inat-ext-debug-summary">
                <strong>${NotificationUI.escapeHtml(userLabel)}</strong> &middot; obs:${NotificationUI.escapeHtml(String(obsId))} &middot; ${timeLabel}
              </span>
              <button class="inat-ext-debug-copy-btn" title="Copy raw data">Copy</button>
            </div>
            <div class="inat-ext-debug-item-body">
              <div class="inat-ext-debug-field"><strong>id:</strong> ${NotificationUI.escapeHtml(n.id)}</div>
              <div class="inat-ext-debug-field"><strong>category:</strong> ${NotificationUI.escapeHtml(catLabel)}</div>
              <div class="inat-ext-debug-field"><strong>source:</strong> ${NotificationUI.escapeHtml(n.source)}</div>
              <div class="inat-ext-debug-field"><strong>viewed:</strong> ${n.viewed}</div>
              <div class="inat-ext-debug-field"><strong>observationId:</strong> ${NotificationUI.escapeHtml(String(n.observationId))}</div>
              <div class="inat-ext-debug-field"><strong>observationUrl:</strong> ${NotificationUI.escapeHtml(n.observationUrl)}</div>
              <div class="inat-ext-debug-field"><strong>body:</strong> ${NotificationUI.escapeHtml(bodySnippet)}</div>
              <details class="inat-ext-debug-raw">
                <summary>Raw data</summary>
                <pre>${NotificationUI.escapeHtml(rawJson)}</pre>
              </details>
            </div>
          </div>`;
      }
      html += '</div>';
    }

    return html;
  },

};

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => NotificationsDropdown.init());
} else {
  NotificationsDropdown.init();
}
