// Shared notification loading/enrichment logic
// Used by both the dropdown (content script) and sidebar

class NotificationController {
  constructor({ onUpdate, onError }) {
    this.store = new Notifications.NotificationStore();
    this.isLoading = false;
    this.error = null;
    this.debugData = null;
    this.totalPages = 1;
    this.onUpdate = onUpdate || (() => {});
    this.onError = onError || (() => {});
  }

  async load({ page = 1, perPage = 50 } = {}) {
    if (this.isLoading) return { needsAuth: false };

    this.isLoading = true;
    this.error = null;
    this.store.clear();

    try {
      const [apiResult, jsonResult, htmlResult] = await Promise.allSettled([
        new Notifications.ApiV1Fetcher().fetch({ page, perPage }),
        new Notifications.JsonFetcher().fetch(),
        new Notifications.HtmlFetcher().fetch()
      ]);

      this.debugData = { apiResult, jsonResult, htmlResult };

      // Add API v1 results (best data for IDs/comments)
      if (apiResult.status === 'fulfilled') {
        this.store.add(apiResult.value.notifications);
        this.totalPages = Math.ceil((apiResult.value.total || 0) / perPage) || 1;
      }

      // Try JSON for mentions
      if (jsonResult.status === 'fulfilled') {
        const jsonMentions = jsonResult.value.notifications.filter(n => n.category === 'mention');
        this.store.add(jsonMentions);
      }

      // Add HTML mentions as fallback
      if (htmlResult.status === 'fulfilled') {
        const htmlMentions = htmlResult.value.notifications.filter(n => n.category === 'mention');
        this.store.add(htmlMentions);
      }

      // Check auth
      if (this.store.size === 0 && apiResult.status === 'rejected' &&
          apiResult.reason?.message?.includes('Not authenticated')) {
        this.isLoading = false;
        this.onError('auth');
        return { needsAuth: true };
      }

      this.onUpdate();

      // Kick off enrichment in background
      this.enrich();

      return { needsAuth: false };
    } catch (err) {
      console.error('[iNat Ext] Failed to load notifications:', err);
      this.error = err.message;
      this.onUpdate();
      return { needsAuth: false };
    } finally {
      this.isLoading = false;
    }
  }

  async enrich() {
    // Resolve comment IDs to observation IDs for mentions
    const mentions = this.store.getByCategory('mention');
    const commentIds = mentions
      .filter(m => m.observationId?.startsWith('comment_'))
      .map(m => m.observationId.replace('comment_', ''));

    if (commentIds.length > 0) {
      const commentMapping = await Notifications.resolveCommentIds(commentIds);

      for (const m of mentions) {
        if (m.observationId?.startsWith('comment_')) {
          const commentId = m.observationId.replace('comment_', '');
          const obsId = commentMapping[commentId];
          if (obsId) {
            m.observationId = obsId;
            m.observationUrl = `https://www.inaturalist.org/observations/${obsId}#activity_comment_${commentId}`;
          }
        }
      }
    }

    // Fetch observation data for all notifications
    const obsIds = this.store.getObservationIds();
    if (obsIds.length === 0) return;

    const observationsMap = await Notifications.fetchObservations(obsIds);

    if (Object.keys(observationsMap).length > 0) {
      this.store.enrichWithObservations(observationsMap);
      this.onUpdate();
    }
  }
}
