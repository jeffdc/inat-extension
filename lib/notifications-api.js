// Notifications API client for iNaturalist
// Uses both the Rails website endpoints (for mentions) and API v1

const NotificationsAPI = {
  BASE_URL: 'https://api.inaturalist.org/v1',
  SITE_URL: 'https://www.inaturalist.org',

  // Make authenticated API request
  async apiRequest(url, options = {}) {
    // Get JWT - try stored first, background can't fetch fresh
    const jwt = await iNatAuth.getStoredJWT();

    if (!jwt) {
      throw new Error('Not authenticated. Please visit iNaturalist.org while logged in.');
    }

    const headers = {
      'Authorization': `Bearer ${jwt}`,
      ...options.headers
    };

    const response = await fetch(url, {
      ...options,
      headers
    });

    if (!response.ok) {
      if (response.status === 401) {
        // Token expired or invalid, clear it
        await iNatAuth.clearJWT();
        throw new Error('Session expired. Please visit iNaturalist.org while logged in.');
      }
      throw new Error(`API error: ${response.status}`);
    }

    return response;
  },

  // Fetch notifications from Rails endpoint (has mentions!)
  // This works with session cookies, must be called from content script on iNat domain
  // notification: 'activity' (IDs/comments on your obs), 'mention' (when @mentioned anywhere)
  async getUpdatesFromSite(options = {}) {
    const notificationType = options.notificationType || 'activity,mention'; // get both by default
    const params = new URLSearchParams({
      notification: notificationType,
      skip_view: '1' // don't mark as read when fetching
    });

    const url = `${this.SITE_URL}/users/new_updates.json?${params}`;
    console.log('[iNat Site] Fetching:', url);

    const response = await fetch(url, { credentials: 'include' });

    if (!response.ok) {
      if (response.status === 401 || response.status === 302) {
        throw new Error('Not logged in to iNaturalist');
      }
      throw new Error(`Site error: ${response.status}`);
    }

    const data = await response.json();
    console.log('[iNat Site] Fetched', data?.length, 'notifications');

    // Log unique notification types
    const types = [...new Set(data?.map(n => n.notification) || [])];
    console.log('[iNat Site] Notification types:', types);

    return data;
  },

  // Fetch notifications/updates from API v1 (no mentions, but paginated)
  async getUpdates(options = {}) {
    const params = new URLSearchParams({
      per_page: options.perPage || 20,
      page: options.page || 1
    });

    if (options.observationsBy) {
      params.set('observations_by', options.observationsBy);
    }

    const url = `${this.BASE_URL}/observations/updates?${params}`;
    const response = await this.apiRequest(url);
    const data = await response.json();
    console.log('[iNat API] Fetched', data.results?.length, 'notifications, total:', data.total_results);

    return data;
  },

  // Mark a notification as viewed/read
  async markViewed(notificationId) {
    await this.apiRequest(
      `${this.BASE_URL}/observations/${notificationId}/viewed`,
      { method: 'PUT' }
    );
    return true;
  },

  // Mark all notifications as viewed
  async markAllViewed() {
    await this.apiRequest(
      `${this.BASE_URL}/observations/updates/viewed`,
      { method: 'PUT' }
    );
    return true;
  },

  // Categorize notification by type
  // Note: API v1 doesn't include true "mention" notifications - those only come from
  // the JSON/HTML endpoints. So we only categorize as comment or identification here.
  categorizeNotification(notification) {
    const notifierType = notification.notifier_type || '';

    if (notifierType === 'Comment' || notification.comment) {
      return 'comment';
    }

    if (notifierType === 'Identification' || notification.identification) {
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
      observationId: raw.resource_id,
      user: {
        login: user.login || 'unknown',
        name: user.name || user.login || 'Unknown user',
        iconUrl: user.icon_url || null
      },
      body: resource.body || null,
      taxon: resource.taxon ? {
        id: resource.taxon.id || null,
        name: resource.taxon.name || null,
        commonName: resource.taxon.preferred_common_name || null
      } : null,
      observationUrl: `https://www.inaturalist.org/observations/${raw.resource_id}`
    };
  }
};
