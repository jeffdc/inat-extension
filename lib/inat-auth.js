// Simple authentication for iNaturalist API
// Gets JWT from active session when user is logged into iNaturalist.org

const iNatAuth = {
  JWT_STORAGE_KEY: 'inat_jwt',
  JWT_EXPIRY_KEY: 'inat_jwt_expiry',

  // JWT tokens expire after 24 hours, refresh after 23 hours
  JWT_LIFETIME_MS: 23 * 60 * 60 * 1000,

  // Get JWT from iNaturalist session (must be called from content script on iNat domain)
  async fetchJWTFromSession() {
    const response = await fetch('https://www.inaturalist.org/users/api_token', {
      credentials: 'include'
    });

    if (!response.ok) {
      throw new Error('Not logged in to iNaturalist');
    }

    const data = await response.json();
    if (!data.api_token) {
      throw new Error('No API token in response');
    }

    return data.api_token;
  },

  // Store JWT in extension storage
  async storeJWT(jwt) {
    await browser.storage.local.set({
      [this.JWT_STORAGE_KEY]: jwt,
      [this.JWT_EXPIRY_KEY]: Date.now() + this.JWT_LIFETIME_MS
    });
  },

  // Get stored JWT (if still valid)
  async getStoredJWT() {
    const result = await browser.storage.local.get([this.JWT_STORAGE_KEY, this.JWT_EXPIRY_KEY]);
    const jwt = result[this.JWT_STORAGE_KEY];
    const expiry = result[this.JWT_EXPIRY_KEY];

    if (jwt && expiry && Date.now() < expiry) {
      return jwt;
    }
    return null;
  },

  // Clear stored JWT
  async clearJWT() {
    await browser.storage.local.remove([this.JWT_STORAGE_KEY, this.JWT_EXPIRY_KEY]);
  },

  // Get valid JWT - tries stored first, then fetches new one
  // Must be called from content script on iNat domain for fresh fetch
  async getJWT(canFetchFresh = true) {
    // Try stored JWT first
    let jwt = await this.getStoredJWT();
    if (jwt) {
      return jwt;
    }

    // Need to fetch fresh - only works from content script on iNat domain
    if (!canFetchFresh) {
      return null;
    }

    jwt = await this.fetchJWTFromSession();
    await this.storeJWT(jwt);
    return jwt;
  }
};
