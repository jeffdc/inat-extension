// Content script for extracting metadata from iNaturalist observation pages

// Listen for metadata requests from background script
browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'getMetadata') {
    const metadata = extractMetadata();
    console.log('[iNat Links] Extracted metadata:', metadata);
    return Promise.resolve(metadata);
  }
});

// Extract metadata from the current observation page
function extractMetadata() {
  const metadata = {
    species: null,
    commonName: null,
    observer: null,
    observationDate: null,
    location: null,
    thumbnailUrl: null
  };

  try {
    // Try to get data from embedded JSON first (most reliable)
    const jsonData = extractFromJSON();
    if (jsonData) {
      Object.assign(metadata, jsonData);
    }

    // Fall back to DOM selectors if JSON didn't work
    if (!metadata.species) {
      metadata.species = extractSpeciesFromDOM();
    }
    if (!metadata.commonName) {
      metadata.commonName = extractCommonNameFromDOM();
    }
    if (!metadata.observer) {
      metadata.observer = extractObserverFromDOM();
    }
    if (!metadata.observationDate) {
      metadata.observationDate = extractDateFromDOM();
    }
    if (!metadata.location) {
      metadata.location = extractLocationFromDOM();
    }
    if (!metadata.thumbnailUrl) {
      metadata.thumbnailUrl = extractThumbnailFromDOM();
    }

  } catch (error) {
    console.error('[iNat Links] Error extracting metadata:', error);
  }

  return metadata;
}

// Try to extract from JSON-LD or embedded data
function extractFromJSON() {
  try {
    // Look for JSON-LD
    const jsonLd = document.querySelector('script[type="application/ld+json"]');
    if (jsonLd) {
      const data = JSON.parse(jsonLd.textContent);
      if (data.name) {
        return {
          species: data.name,
          commonName: null,
          observer: data.author?.name || null,
          observationDate: data.dateCreated || null,
          location: data.contentLocation?.name || null,
          thumbnailUrl: data.image?.[0] || data.image || null
        };
      }
    }
  } catch (e) {
    console.log('[iNat Links] JSON-LD extraction failed:', e);
  }
  return null;
}

// DOM extraction functions with multiple selector fallbacks
function extractSpeciesFromDOM() {
  const selectors = [
    // React app selectors
    '[class*="SplitTaxon"] [class*="scientificName"]',
    '[class*="SplitTaxon"] [class*="sciName"]',
    '[class*="SplitTaxon"] .name',
    '[class*="SplitTaxon"] i',
    // Classic selectors
    '.taxon-name .name',
    '.taxon .name',
    '.scientificName',
    // Title/header fallbacks
    '[class*="ObservationHeader"] [class*="taxon"] i',
    '.observation-header .taxon i',
    // Generic italics in taxon area (scientific names are usually italicized)
    '.taxon i',
    '[data-taxon-id] i'
  ];

  for (const selector of selectors) {
    const el = document.querySelector(selector);
    if (el && el.textContent.trim()) {
      return el.textContent.trim();
    }
  }

  // Last resort: try to get from page title
  const title = document.title;
  const match = title.match(/^(.+?)\s+(?:observed|from|·)/i);
  if (match) {
    return match[1].trim();
  }

  return null;
}

function extractCommonNameFromDOM() {
  const selectors = [
    '[class*="SplitTaxon"] [class*="commonName"]',
    '[class*="SplitTaxon"] [class*="comName"]',
    '.taxon-name .common-name',
    '.taxon .common-name',
    '.commonName',
    '[class*="displayName"]:not(i)'
  ];

  for (const selector of selectors) {
    const el = document.querySelector(selector);
    if (el && el.textContent.trim()) {
      return el.textContent.trim();
    }
  }
  return null;
}

function extractObserverFromDOM() {
  const selectors = [
    '[class*="UserLink"] a',
    '.user-login',
    'a[href*="/people/"]',
    'a[href*="/users/"]',
    '[class*="observer"] a',
    '[class*="user"] a[href*="inaturalist"]'
  ];

  for (const selector of selectors) {
    const el = document.querySelector(selector);
    if (el && el.textContent.trim()) {
      return el.textContent.trim().replace('@', '');
    }
  }
  return null;
}

function extractDateFromDOM() {
  const selectors = [
    '[class*="observed"] time',
    '.observed-on time',
    'time[datetime]',
    '[class*="date"] time'
  ];

  for (const selector of selectors) {
    const el = document.querySelector(selector);
    if (el) {
      return el.getAttribute('datetime') || el.textContent.trim();
    }
  }
  return null;
}

function extractLocationFromDOM() {
  const selectors = [
    '.place-guess',
    '[class*="placeGuess"]',
    '[class*="location"]',
    '[class*="Place"] a'
  ];

  for (const selector of selectors) {
    const el = document.querySelector(selector);
    if (el && el.textContent.trim()) {
      return el.textContent.trim();
    }
  }
  return null;
}

function extractThumbnailFromDOM() {
  const selectors = [
    '[class*="PhotoBrowser"] img',
    '[class*="photo"] img',
    '.image-gallery img',
    '.photo-container img',
    '.photos img'
  ];

  for (const selector of selectors) {
    const el = document.querySelector(selector);
    if (el && el.src) {
      return el.src;
    }
  }
  return null;
}
