// Background script for iNaturalist Link Manager

// Handle browser action button click
browser.browserAction.onClicked.addListener(async (tab) => {
  // Check if we're on an iNaturalist observation page
  if (!tab.url || !tab.url.match(/inaturalist\.org\/observations\/\d+/)) {
    // Not on an observation page - open sidebar instead
    browser.sidebarAction.open();
    return;
  }

  // On an observation page - show popup to choose type
  // For now, default to TODO. We'll add a popup later.
  try {
    await Storage.addTodo(tab.url);
    showNotification('Added to TODOs', tab.url);
  } catch (error) {
    showNotification('Error', error.message);
  }
});

// Handle keyboard shortcuts
browser.commands.onCommand.addListener(async (command) => {
  const tabs = await browser.tabs.query({ active: true, currentWindow: true });
  const tab = tabs[0];

  if (!tab?.url?.match(/inaturalist\.org\/observations\/\d+/)) {
    showNotification('Error', 'Not on an iNaturalist observation page');
    return;
  }

  try {
    // Get metadata from content script for both types
    const metadata = await browser.tabs.sendMessage(tab.id, { action: 'getMetadata' });

    if (command === 'quick-add-todo') {
      await Storage.addTodo(tab.url, '', metadata);
      showNotification('Added to TODOs', metadata.species || tab.url);
    } else if (command === 'quick-add-research') {
      await Storage.addResearch(tab.url, metadata);
      showNotification('Added to Research', metadata.species || tab.url);
    }
  } catch (error) {
    showNotification('Error', error.message);
  }
});

// Handle messages from content scripts and sidebar
browser.runtime.onMessage.addListener(async (message, sender) => {
  switch (message.action) {
    case 'addTodo':
      return Storage.addTodo(message.url, message.note, message.metadata || {});

    case 'addResearch':
      return Storage.addResearch(message.url, message.metadata);

    case 'markComplete':
      return Storage.markComplete(message.id);

    case 'deleteItem':
      return Storage.deleteItem(message.id);

    case 'updateNote':
      return Storage.updateNote(message.id, message.note);

    case 'getData':
      return Storage.getData();

    case 'getByType':
      return Storage.getByType(message.type);

    case 'search':
      return Storage.search(message.query);

    case 'exportData':
      return Storage.exportData();

    case 'importData':
      return Storage.importData(message.jsonString);

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

    default:
      console.warn('Unknown message action:', message.action);
  }
});

// Simple notification helper
function showNotification(title, message) {
  // Use a brief console log for now
  // Could enhance with browser.notifications API later
  console.log(`[iNat Links] ${title}: ${message}`);
}
