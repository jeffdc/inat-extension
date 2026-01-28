// Shared notification card rendering for dropdown and sidebar

window.NotificationUI = {
  renderItem(n) {
    const timeAgo = this.formatTimeAgo(n.createdAt);
    const isUnread = n.viewed === false;

    // Build the action text
    let actionHtml = '';
    if (n.category === 'mention') {
      actionHtml = 'mentioned you';
    } else if (n.category === 'comment') {
      actionHtml = 'commented';
    } else if (n.category === 'identification') {
      if (n.taxon) {
        const taxonName = n.taxon.commonName
          ? `${this.escapeHtml(n.taxon.commonName)} <span class="inat-ext-notification-sciname">(${this.escapeHtml(n.taxon.name)})</span>`
          : `<span class="inat-ext-notification-sciname">${this.escapeHtml(n.taxon.name)}</span>`;
        actionHtml = `added ID: ${taxonName}`;
      } else {
        actionHtml = 'added an ID';
      }
    }

    // Observation info (taxon name from the observation itself)
    let obsInfoHtml = '';
    if (n.observation?.taxon) {
      const obsTaxon = n.observation.taxon.commonName
        ? `${this.escapeHtml(n.observation.taxon.commonName)} <span class="inat-ext-notification-sciname">(${this.escapeHtml(n.observation.taxon.name)})</span>`
        : `<span class="inat-ext-notification-sciname">${this.escapeHtml(n.observation.taxon.name)}</span>`;
      obsInfoHtml = `<div class="inat-ext-notification-obs-taxon">on ${obsTaxon}</div>`;
    }

    // Comment body preview (truncated)
    let bodyHtml = '';
    if (n.body && (n.source !== 'html' || n.category === 'mention')) {
      const truncated = n.body.length > 200 ? n.body.substring(0, 200) + '...' : n.body;
      bodyHtml = `<div class="inat-ext-notification-comment">${this.escapeHtml(truncated)}</div>`;
    }

    // Use observation thumbnail if available, otherwise user avatar
    const thumbnailUrl = n.observation?.thumbnail || n.user.iconUrl;
    const thumbnailClass = n.observation?.thumbnail ? 'inat-ext-notification-obs-thumb' : 'inat-ext-notification-avatar';

    return `
      <div class="inat-ext-notification ${isUnread ? 'unread' : ''}"
           data-id="${n.id}" data-url="${this.escapeHtml(n.observationUrl)}"
           data-has-obs="${n.observation ? 'true' : 'false'}">
        <div class="inat-ext-notification-row">
          ${thumbnailUrl
            ? `<img class="${thumbnailClass}" src="${thumbnailUrl}" alt="">`
            : '<div class="inat-ext-notification-avatar"></div>'}
          <div class="inat-ext-notification-content">
            <div class="inat-ext-notification-header">
              ${isUnread ? '<span class="inat-ext-unread-dot"></span>' : ''}
              <span class="inat-ext-notification-user">${this.escapeHtml(n.user.name)}</span>
              <span class="inat-ext-notification-time">${timeAgo}</span>
            </div>
            <div class="inat-ext-notification-action">${actionHtml}</div>
            ${obsInfoHtml}
            ${bodyHtml}
          </div>
        </div>
      </div>
    `;
  },

  formatTimeAgo(date) {
    if (!date) return '';
    if (!(date instanceof Date)) return String(date);

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
