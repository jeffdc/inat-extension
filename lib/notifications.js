// Notifications module - normalized data structures and fetchers
// ============================================================

/**
 * Normalized notification structure
 * All fetchers produce this format
 *
 * @typedef {Object} Notification
 * @property {string} id - Unique identifier (source-specific)
 * @property {string} source - 'api_v1' | 'json' | 'html'
 * @property {string} category - 'mention' | 'comment' | 'identification'
 * @property {boolean} viewed - Read/unread state (null if unknown)
 * @property {Date|null} createdAt - Timestamp (null if unparseable)
 * @property {string} observationId - iNat observation ID
 * @property {string} observationUrl - Full URL to observation
 * @property {Object} user - User who created the notification
 * @property {string} user.login - Username
 * @property {string} user.name - Display name
 * @property {string|null} user.iconUrl - Profile image URL
 * @property {string|null} body - Comment/ID body text
 * @property {Object|null} taxon - Taxon info (for IDs)
 * @property {number} taxon.id - Taxon ID
 * @property {string} taxon.name - Scientific name
 * @property {string|null} taxon.commonName - Common name
 * @property {string|null} observationThumbnail - Observation photo URL
 * @property {Object} raw - Original data for debugging
 */

/**
 * Create a normalized notification object
 */
function createNotification(data) {
  return {
    id: data.id || null,
    source: data.source || 'unknown',
    category: data.category || 'identification',
    viewed: data.viewed ?? null,
    createdAt: data.createdAt instanceof Date ? data.createdAt : parseDate(data.createdAt),
    observationId: String(data.observationId || ''),
    observationUrl: data.observationUrl || '',
    user: {
      login: data.user?.login || 'unknown',
      name: data.user?.name || data.user?.login || 'Unknown',
      iconUrl: data.user?.iconUrl || null
    },
    body: data.body || null,
    taxon: data.taxon ? {
      id: data.taxon.id || null,
      name: data.taxon.name || null,
      commonName: data.taxon.commonName || null
    } : null,
    // Observation details (populated by enrichWithObservations)
    observation: data.observation ? {
      taxon: data.observation.taxon ? {
        id: data.observation.taxon.id || null,
        name: data.observation.taxon.name || null,
        commonName: data.observation.taxon.commonName || null
      } : null,
      thumbnail: data.observation.thumbnail || null,
      mediumPhoto: data.observation.mediumPhoto || null,
      observer: data.observation.observer || null,
      observedOn: data.observation.observedOn || null,
      placeGuess: data.observation.placeGuess || null,
      qualityGrade: data.observation.qualityGrade || null,
      identificationsCount: data.observation.identificationsCount || 0
    } : null,
    raw: data.raw || null
  };
}

/**
 * Parse various date formats into Date object
 */
function parseDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;

  // Try ISO format first
  const isoDate = new Date(value);
  if (!isNaN(isoDate.getTime())) return isoDate;

  // Try relative time patterns like "3 hours ago", "2 days ago"
  const relativeMatch = String(value).match(/(\d+)\s*(second|minute|hour|day|week|month|year)s?\s*ago/i);
  if (relativeMatch) {
    const amount = parseInt(relativeMatch[1], 10);
    const unit = relativeMatch[2].toLowerCase();
    const now = new Date();
    const multipliers = {
      second: 1000,
      minute: 60 * 1000,
      hour: 60 * 60 * 1000,
      day: 24 * 60 * 60 * 1000,
      week: 7 * 24 * 60 * 60 * 1000,
      month: 30 * 24 * 60 * 60 * 1000,
      year: 365 * 24 * 60 * 60 * 1000
    };
    return new Date(now.getTime() - amount * multipliers[unit]);
  }

  return null;
}

/**
 * Generate a unique key for deduplication
 * Based on observation + category + approximate time (not user, since that's unreliable)
 */
function getNotificationKey(notif) {
  // Use 10-minute buckets for time to handle slight differences between sources
  const timeKey = notif.createdAt ? Math.floor(notif.createdAt.getTime() / 600000) : 'unknown';
  const userKey = notif.user?.login || 'unknown';
  return `${notif.observationId}-${notif.category}-${userKey}-${timeKey}`;
}


// ============================================================
// NotificationStore - holds and manages notifications
// ============================================================

class NotificationStore {
  constructor() {
    this.notifications = new Map(); // keyed by dedup key
    this.sourceStats = {}; // track what sources we've loaded from
  }

  /**
   * Add notifications, deduplicating by key
   * Prefers structured sources (api_v1, json) over html
   */
  add(notifications, options = {}) {
    const sourcePriority = { api_v1: 3, json: 2, html: 1, unknown: 0 };

    for (const notif of notifications) {
      const key = getNotificationKey(notif);

      if (this.notifications.has(key)) {
        // Already have this notification - keep the one from better source
        const existing = this.notifications.get(key);
        const existingPriority = sourcePriority[existing.source] || 0;
        const newPriority = sourcePriority[notif.source] || 0;

        if (newPriority > existingPriority) {
          // New one is from better source, replace
          this.notifications.set(key, notif);
        }
        // Otherwise keep existing (same or better source)
      } else {
        this.notifications.set(key, notif);
      }
    }

    return this;
  }

  /**
   * Merge another store into this one
   */
  merge(otherStore, options = {}) {
    return this.add(otherStore.getAll(), options);
  }

  /**
   * Get all notifications as array, sorted by date (newest first)
   */
  getAll() {
    return Array.from(this.notifications.values())
      .sort((a, b) => {
        if (!a.createdAt && !b.createdAt) return 0;
        if (!a.createdAt) return 1;
        if (!b.createdAt) return -1;
        return b.createdAt.getTime() - a.createdAt.getTime();
      });
  }

  /**
   * Get notifications by category
   */
  getByCategory(category) {
    return this.getAll().filter(n => n.category === category);
  }

  /**
   * Get unread notifications
   */
  getUnread() {
    return this.getAll().filter(n => n.viewed === false);
  }

  /**
   * Get read notifications
   */
  getRead() {
    return this.getAll().filter(n => n.viewed === true);
  }

  /**
   * Get counts by category
   */
  getCounts() {
    const counts = { mention: 0, comment: 0, identification: 0, total: 0 };
    for (const notif of this.notifications.values()) {
      if (counts[notif.category] !== undefined) {
        counts[notif.category]++;
      }
      counts.total++;
    }
    return counts;
  }

  /**
   * Get unread counts by category
   */
  getUnreadCounts() {
    const counts = { mention: 0, comment: 0, identification: 0, total: 0 };
    for (const notif of this.notifications.values()) {
      if (notif.viewed === false) {
        if (counts[notif.category] !== undefined) {
          counts[notif.category]++;
        }
        counts.total++;
      }
    }
    return counts;
  }

  /**
   * Clear all notifications
   */
  clear() {
    this.notifications.clear();
    this.sourceStats = {};
    return this;
  }

  /**
   * Get count
   */
  get size() {
    return this.notifications.size;
  }

  /**
   * Get all unique observation IDs (extracted from URLs)
   */
  getObservationIds() {
    const ids = new Set();
    for (const notif of this.notifications.values()) {
      // Extract observation ID from the URL
      const match = notif.observationUrl?.match(/observations\/(\d+)/);
      if (match) {
        ids.add(match[1]);
      }
    }
    return Array.from(ids);
  }

  /**
   * Get comment IDs that need resolution (pending_comment_XXX)
   */
  getPendingCommentIds() {
    const ids = [];
    for (const notif of this.notifications.values()) {
      if (notif.observationId?.startsWith('pending_comment_')) {
        ids.push(notif.observationId.replace('pending_comment_', ''));
      }
    }
    return ids;
  }

  /**
   * Update notifications with resolved observation IDs and URLs
   * @param {Object} mapping - Map of commentId -> observationId
   */
  resolveCommentIds(mapping) {
    for (const [key, notif] of this.notifications) {
      if (notif.observationId?.startsWith('pending_comment_')) {
        const commentId = notif.observationId.replace('pending_comment_', '');
        const obsId = mapping[commentId];
        if (obsId) {
          notif.observationId = obsId;
          // Update URL to point to observation with comment anchor
          notif.observationUrl = `https://www.inaturalist.org/observations/${obsId}#activity_comment_${commentId}`;
        }
      }
    }
    return this;
  }

  /**
   * Enrich notifications with observation data
   * @param {Object} observationsMap - Map of observationId -> observation data
   */
  enrichWithObservations(observationsMap) {
    for (const [key, notif] of this.notifications) {
      // Extract observation ID from URL
      const match = notif.observationUrl?.match(/observations\/(\d+)/);
      const obsId = match ? match[1] : null;
      const obsData = obsId ? observationsMap[obsId] : null;

      if (obsData) {
        // Update the notification with observation data
        notif.observation = {
          taxon: obsData.taxon ? {
            id: obsData.taxon.id,
            name: obsData.taxon.name,
            commonName: obsData.taxon.preferred_common_name || null
          } : null,
          thumbnail: obsData.photos?.[0]?.url?.replace('square', 'small') || null,
          mediumPhoto: obsData.photos?.[0]?.url?.replace('square', 'medium') || null,
          observer: obsData.user?.login || null,
          observedOn: obsData.observed_on_string || obsData.observed_on || null,
          placeGuess: obsData.place_guess || null,
          qualityGrade: obsData.quality_grade || null,
          identificationsCount: obsData.identifications_count || 0
        };
      }
    }
    return this;
  }
}


// ============================================================
// Comment & Observation Fetchers
// ============================================================

/**
 * Resolve comment IDs to observation IDs via API
 * @param {string[]} commentIds - Array of comment IDs
 * @returns {Promise<Object>} Map of commentId -> observationId
 */
async function resolveCommentIds(commentIds) {
  if (!commentIds || commentIds.length === 0) return {};

  const mapping = {};

  // Follow redirects from /comments/ URLs to get observation IDs
  for (const commentId of commentIds) {
    try {
      const url = `https://www.inaturalist.org/comments/${commentId}`;
      const response = await fetch(url, {
        method: 'HEAD',
        redirect: 'follow',
        credentials: 'include'
      });
      const obsMatch = response.url.match(/observations\/(\d+)/);
      if (obsMatch) {
        mapping[commentId] = obsMatch[1];
      }
    } catch (err) {
      // Silently skip failed resolutions
    }
  }

  return mapping;
}

/**
 * Fetch observation details for multiple IDs
 * @param {string[]} ids - Array of observation IDs
 * @returns {Promise<Object>} Map of observationId -> observation data
 */
async function fetchObservations(ids) {
  if (!ids || ids.length === 0) return {};

  const observationsMap = {};
  const batchSize = 30; // API limit

  // Process in batches
  for (let i = 0; i < ids.length; i += batchSize) {
    const batch = ids.slice(i, i + batchSize);
    const idsParam = batch.join(',');

    try {
      const url = `https://api.inaturalist.org/v1/observations?id=${idsParam}&per_page=${batchSize}`;
      const response = await fetch(url);
      if (!response.ok) continue;

      const data = await response.json();

      for (const obs of (data.results || [])) {
        observationsMap[String(obs.id)] = obs;
      }
    } catch (err) {
      console.warn('[ObsFetcher] Error fetching batch:', err);
    }
  }

  return observationsMap;
}


// ============================================================
// Fetcher Interface
// ============================================================

/**
 * @typedef {Object} FetchResult
 * @property {Notification[]} notifications - Normalized notifications
 * @property {number} total - Total available (for pagination)
 * @property {number} page - Current page
 * @property {boolean} hasMore - More pages available
 */

/**
 * @typedef {Object} FetcherCapabilities
 * @property {boolean} mentions - Can fetch @mentions
 * @property {boolean} comments - Can fetch comments
 * @property {boolean} identifications - Can fetch IDs
 * @property {boolean} viewedState - Provides read/unread state
 * @property {boolean} viewedNotifications - Can fetch already-read notifications
 * @property {boolean} pagination - Supports pagination
 * @property {boolean} timestamps - Provides proper timestamps
 * @property {boolean} structuredData - Returns clean structured data
 */

/**
 * Base fetcher class - implementations extend this
 */
class NotificationFetcher {
  constructor() {
    this.name = 'base';
    this.capabilities = {
      mentions: false,
      comments: false,
      identifications: false,
      viewedState: false,
      viewedNotifications: false,
      pagination: false,
      timestamps: false,
      structuredData: false
    };
  }

  /**
   * Fetch notifications
   * @param {Object} options - Fetch options
   * @param {number} options.page - Page number (1-indexed)
   * @param {number} options.perPage - Results per page
   * @returns {Promise<FetchResult>}
   */
  async fetch(options = {}) {
    throw new Error('Not implemented');
  }
}


// ============================================================
// API v1 Fetcher - /observations/updates
// ============================================================

class ApiV1Fetcher extends NotificationFetcher {
  constructor() {
    super();
    this.name = 'api_v1';
    this.capabilities = {
      mentions: false,          // API v1 doesn't include mentions
      comments: true,
      identifications: true,
      viewedState: true,
      viewedNotifications: true,
      pagination: true,
      timestamps: true,
      structuredData: true
    };
  }

  /**
   * Fetch via background script (needs JWT auth)
   */
  async fetch(options = {}) {
    const page = options.page || 1;
    const perPage = options.perPage || 20;

    const response = await browser.runtime.sendMessage({
      action: 'getNotifications',
      page,
      perPage
    });

    const notifications = (response.notifications || []).map(raw =>
      createNotification({
        id: `api_v1_${raw.id}`,
        source: 'api_v1',
        category: raw.category,
        viewed: raw.viewed,
        createdAt: raw.createdAt,
        observationId: raw.observationId,
        observationUrl: raw.observationUrl,
        user: raw.user,
        body: raw.body,
        taxon: raw.taxon,
        raw
      })
    );

    return {
      notifications,
      total: response.totalResults || 0,
      page: response.page || page,
      hasMore: notifications.length === perPage && (response.totalResults > page * perPage),
      rawResponse: response
    };
  }
}


// ============================================================
// JSON Fetcher - /users/new_updates.json
// ============================================================

class JsonFetcher extends NotificationFetcher {
  constructor() {
    super();
    this.name = 'json';
    this.capabilities = {
      mentions: true,           // Should include mentions (though unreliable)
      comments: true,
      identifications: true,
      viewedState: true,
      viewedNotifications: false, // Only returns unread
      pagination: false,        // Up to 200, no pagination
      timestamps: true,
      structuredData: true
    };
  }

  /**
   * Fetch directly (must be called from content script on iNat domain)
   */
  async fetch(options = {}) {
    const params = new URLSearchParams({
      notification: 'activity,mention',
      skip_view: '1'
    });

    const url = `https://www.inaturalist.org/users/new_updates.json?${params}`;
    const response = await fetch(url, { credentials: 'include' });

    if (!response.ok) {
      if (response.status === 401) {
        throw new Error('Not logged in to iNaturalist');
      }
      throw new Error(`JSON fetch failed: ${response.status}`);
    }

    const data = await response.json();

    const notifications = (data || []).map((raw, idx) => {
      const resource = raw.comment || raw.identification || {};
      // User can be in multiple places depending on notification type
      const user = resource.user || raw.notifier?.user || raw.user || {};

      // Determine category based on iNat's classification
      let category = 'identification';
      if (raw.notification === 'mention') {
        category = 'mention';
      } else if (raw.notifier_type === 'Comment' || raw.comment) {
        category = 'comment';
      }

      // For mentions, body may be nested differently
      const body = resource.body || (category === 'mention' ? (raw.notifier?.body || raw.body || null) : null);

      return createNotification({
        id: `json_${raw.id}`,
        source: 'json',
        category,
        viewed: raw.viewed === true,
        createdAt: raw.created_at,
        observationId: raw.resource_id,
        observationUrl: `https://www.inaturalist.org/observations/${raw.resource_id}`,
        user: {
          login: user.login || 'unknown',
          name: user.name || user.login || 'Unknown',
          iconUrl: user.icon_url || user.icon || user.medium_url || null
        },
        body,
        taxon: resource.taxon ? {
          id: resource.taxon.id,
          name: resource.taxon.name,
          commonName: resource.taxon.preferred_common_name || resource.taxon.common_name?.name
        } : null,
        raw
      });
    });

    return {
      notifications,
      total: notifications.length,
      page: 1,
      hasMore: false,
      rawResponse: data
    };
  }
}


// ============================================================
// HTML Fetcher - /users/new_updates (HTML)
// ============================================================

class HtmlFetcher extends NotificationFetcher {
  constructor() {
    super();
    this.name = 'html';
    this.capabilities = {
      mentions: true,
      comments: true,
      identifications: true,
      viewedState: false,       // Can't tell from HTML
      viewedNotifications: true, // Has fallback to viewed
      pagination: false,
      timestamps: false,        // Only text timestamps
      structuredData: false     // Messy parsed text
    };
  }

  /**
   * Fetch and parse HTML (must be called from content script on iNat domain)
   */
  async fetch(options = {}) {
    const url = 'https://www.inaturalist.org/users/new_updates?notification=activity,mention&skip_view=1';
    const response = await fetch(url, {
      credentials: 'include',
      headers: {
        'Accept': 'text/html',
        'X-Requested-With': 'XMLHttpRequest'
      }
    });

    if (!response.ok) {
      if (response.status === 401 || response.redirected) {
        throw new Error('Not logged in to iNaturalist');
      }
      throw new Error(`HTML fetch failed: ${response.status}`);
    }

    const html = await response.text();
    const notifications = this.parseHtml(html);

    return {
      notifications,
      total: notifications.length,
      page: 1,
      hasMore: false,
      rawResponse: html
    };
  }

  parseHtml(html) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const items = doc.querySelectorAll('li');
    const notifications = [];

    items.forEach((li, index) => {
      try {
        const text = li.textContent.trim();
        if (!text) return;

        // Find the observation link
        let notificationUrl = '';
        let observationId = '';
        const allLinks = li.querySelectorAll('a');
        for (const a of allLinks) {
          const href = a.href || a.getAttribute('href') || '';

          // Try /observations/ID first
          const obsMatch = href.match(/observations\/(\d+)/);
          if (obsMatch) {
            notificationUrl = href;
            observationId = obsMatch[1];
            break;
          }

          // Fallback to /comments/ID
          const commentMatch = href.match(/comments\/(\d+)/);
          if (commentMatch && !notificationUrl) {
            notificationUrl = href;
            observationId = 'comment_' + commentMatch[1];
          }
        }

        // Skip if no usable link found
        if (!notificationUrl) return;

        // Determine category from text
        let category = 'identification';
        if (text.toLowerCase().includes('mentioned you')) {
          category = 'mention';
        } else if (text.toLowerCase().includes('comment')) {
          category = 'comment';
        }

        // Extract user info - try multiple strategies
        let userName = 'Unknown';
        let userImg = li.querySelector('img');

        // Strategy 1: Link to /people/ or /users/
        const userLink = li.querySelector('a[href*="/people/"]') || li.querySelector('a[href*="/users/"]');
        if (userLink?.textContent?.trim()) {
          userName = userLink.textContent.trim();
        }

        // Strategy 2: Extract from text patterns (username is before action verb)
        if (userName === 'Unknown') {
          // Patterns: "username mentioned you", "username added a comment", "username added an ID"
          const patterns = [
            /([A-Za-z0-9_-]+)\s+mentioned you/i,
            /([A-Za-z0-9_-]+)\s+added (?:a )?comment/i,
            /([A-Za-z0-9_-]+)\s+added an? (?:ID|identification)/i,
            /([A-Za-z0-9_-]+)\s+commented/i
          ];
          for (const pattern of patterns) {
            const match = text.match(pattern);
            if (match) {
              userName = match[1];
              break;
            }
          }
        }

        // Log for debugging if still unknown
        if (userName === 'Unknown') {
          console.warn('[HtmlFetcher] Could not extract user from:', text.substring(0, 150));
        }

        // Try to parse time from text - multiple formats
        let createdAt = null;

        // Format: "X ago" (relative)
        const agoMatch = text.match(/(\d+\s*(?:second|minute|hour|day|week|month|year)s?\s*ago)/i);
        if (agoMatch) {
          createdAt = agoMatch[1];
        }

        // Format: "HH:MM AM/PM" (today)
        const timeMatch = text.match(/(\d{1,2}:\d{2}\s*[AP]M)/i);
        if (!createdAt && timeMatch) {
          // Assume today
          const today = new Date();
          createdAt = `${today.toDateString()} ${timeMatch[1]}`;
        }

        // Format: "Jan 26" or "Dec 31" (this year)
        const dateMatch = text.match(/(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{1,2})/i);
        if (!createdAt && dateMatch) {
          const year = new Date().getFullYear();
          createdAt = `${dateMatch[1]} ${dateMatch[2]}, ${year}`;
        }

        notifications.push(createNotification({
          id: `html_${index}_${observationId}`,
          source: 'html',
          category,
          viewed: null, // Unknown from HTML
          createdAt,
          observationId,
          observationUrl: notificationUrl,
          user: {
            login: userName.toLowerCase().replace(/\s+/g, ''),
            name: userName,
            iconUrl: userImg?.src || null
          },
          body: text, // Full text as body (messy but all we have)
          taxon: null,
          raw: { html: li.innerHTML, text }
        }));
      } catch (e) {
        console.warn('[HtmlFetcher] Failed to parse item:', e);
      }
    });

    return notifications;
  }
}


// ============================================================
// Exports
// ============================================================

// Make available globally for browser extension context
if (typeof window !== 'undefined') {
  window.Notifications = {
    createNotification,
    parseDate,
    getNotificationKey,
    NotificationStore,
    NotificationFetcher,
    ApiV1Fetcher,
    JsonFetcher,
    HtmlFetcher,
    fetchObservations,
    resolveCommentIds
  };
}
