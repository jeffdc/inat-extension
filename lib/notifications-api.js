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
        id: resource.taxon.id || null,
        name: resource.taxon.name || null,
        commonName: resource.taxon.preferred_common_name || null
      } : null,
      observationUrl: `https://www.inaturalist.org/observations/${raw.resource_owner_id}`
    };
  }
};
