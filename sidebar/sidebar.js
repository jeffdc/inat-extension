// Sidebar UI for iNaturalist Link Manager

let currentTab = 'todo';
let showCompleted = false;
let searchQuery = '';

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  setupTabs();
  setupSearch();
  setupAddButton();
  setupExportImport();
  setupStorageListener();
  loadItems();
});

// Listen for storage changes (e.g., from keyboard shortcuts)
function setupStorageListener() {
  browser.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'local' && changes.inat_links_data) {
      loadItems();
    }
  });
}

// Tab switching
function setupTabs() {
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelector('.tab.active').classList.remove('active');
      tab.classList.add('active');

      document.querySelector('.panel.active').classList.remove('active');
      const panelId = tab.dataset.tab + '-panel';
      document.getElementById(panelId).classList.add('active');

      currentTab = tab.dataset.tab;
      loadItems();
    });
  });

  // Show completed filter
  document.getElementById('show-completed').addEventListener('change', (e) => {
    showCompleted = e.target.checked;
    loadItems();
  });
}

// Search functionality
function setupSearch() {
  const searchInput = document.getElementById('search');
  let debounceTimer;

  searchInput.addEventListener('input', (e) => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      searchQuery = e.target.value.trim();
      loadItems();
    }, 300);
  });
}

// Load and render items
async function loadItems() {
  try {
    let items;

    if (searchQuery) {
      items = await browser.runtime.sendMessage({ action: 'search', query: searchQuery });
      items = items.filter(item => item.type === currentTab);
    } else {
      items = await browser.runtime.sendMessage({ action: 'getByType', type: currentTab });
    }

    if (currentTab === 'todo' && !showCompleted) {
      items = items.filter(item => !item.completed);
    }

    // Sort: incomplete first, then by date
    items.sort((a, b) => {
      if (currentTab === 'todo') {
        if (a.completed !== b.completed) return a.completed ? 1 : -1;
      }
      return new Date(b.createdAt) - new Date(a.createdAt);
    });

    renderItems(items);
  } catch (error) {
    console.error('Error loading items:', error);
  }
}

// Render item list
function renderItems(items) {
  const listId = currentTab === 'todo' ? 'todo-list' : 'research-list';
  const list = document.getElementById(listId);

  if (items.length === 0) {
    list.innerHTML = `
      <li class="empty-state">
        <p>No ${currentTab === 'todo' ? 'TODOs' : 'research items'} yet</p>
        <p>Use the button below or keyboard shortcuts to add observations</p>
      </li>
    `;
    return;
  }

  list.innerHTML = items.map(item => {
    if (item.type === 'todo') {
      return renderTodoItem(item);
    } else {
      return renderResearchItem(item);
    }
  }).join('');

  // Attach event listeners
  list.querySelectorAll('.item').forEach(el => {
    const id = el.dataset.id;

    // Open link on click (but not on buttons/checkbox/notes/links)
    el.addEventListener('click', (e) => {
      if (e.target.tagName === 'BUTTON' || e.target.tagName === 'INPUT') return;
      if (e.target.tagName === 'A') return;
      if (e.target.classList.contains('item-note')) return;
      const item = items.find(i => i.id === id);
      if (item) browser.tabs.create({ url: item.url });
    });

    // Handle note links - open in new tab
    el.querySelectorAll('.note-link').forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        browser.tabs.create({ url: link.href });
      });
    });

    // Checkbox for completing TODOs
    const checkbox = el.querySelector('.item-checkbox');
    if (checkbox) {
      checkbox.addEventListener('change', () => markComplete(id));
    }

    // Edit button
    const editBtn = el.querySelector('.edit-btn');
    if (editBtn) {
      editBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const item = items.find(i => i.id === id);
        if (item) showEditDialog(item);
      });
    }

    // Delete button
    const deleteBtn = el.querySelector('.delete-btn');
    if (deleteBtn) {
      deleteBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        deleteItem(id);
      });
    }
  });
}

function renderTodoItem(item) {
  const date = new Date(item.createdAt).toLocaleDateString();
  const title = item.species || `Observation #${item.observationId}`;
  return `
    <li class="item ${item.completed ? 'completed' : ''}" data-id="${item.id}">
      <div class="item-header">
        <input type="checkbox" class="item-checkbox" ${item.completed ? 'checked disabled' : ''}>
        <div class="item-content">
          <div class="item-title">${escapeHtml(title)}</div>
          ${item.note ? `<div class="item-note">${linkifyUrls(item.note)}</div>` : ''}
          <div class="item-meta">
            <span>Added ${date}</span>
            ${item.completedAt ? `<span>Completed ${new Date(item.completedAt).toLocaleDateString()}</span>` : ''}
          </div>
        </div>
      </div>
      <div class="item-actions">
        <button class="edit-btn">Edit</button>
        <button class="delete-btn">Delete</button>
      </div>
    </li>
  `;
}

function renderResearchItem(item) {
  const date = new Date(item.createdAt).toLocaleDateString();
  const title = item.species || item.commonName || `Observation #${item.observationId}`;

  return `
    <li class="item" data-id="${item.id}">
      <div class="item-header">
        ${item.thumbnailUrl ? `<img src="${item.thumbnailUrl}" class="item-thumbnail" alt="">` : ''}
        <div class="item-content">
          <div class="item-title">${escapeHtml(title)}</div>
          ${item.commonName && item.species ? `<div class="item-meta"><span>${escapeHtml(item.commonName)}</span></div>` : ''}
          <div class="item-meta">
            ${item.observer ? `<span>by ${escapeHtml(item.observer)}</span>` : ''}
            ${item.location ? `<span>${escapeHtml(item.location)}</span>` : ''}
            <span>Added ${date}</span>
          </div>
          ${item.note ? `<div class="item-note">${linkifyUrls(item.note)}</div>` : ''}
        </div>
      </div>
      <div class="item-actions">
        <button class="delete-btn">Delete</button>
      </div>
    </li>
  `;
}

// Mark TODO as complete
async function markComplete(id) {
  try {
    await browser.runtime.sendMessage({ action: 'markComplete', id });
    loadItems();
  } catch (error) {
    console.error('Error marking complete:', error);
  }
}

// Delete item
async function deleteItem(id) {
  if (!confirm('Delete this item?')) return;

  try {
    await browser.runtime.sendMessage({ action: 'deleteItem', id });
    loadItems();
  } catch (error) {
    console.error('Error deleting item:', error);
  }
}

// Add current page button
function setupAddButton() {
  document.getElementById('add-current').addEventListener('click', async () => {
    try {
      const tabs = await browser.tabs.query({ active: true, currentWindow: true });
      const tab = tabs[0];

      if (!tab?.url?.match(/inaturalist\.org\/observations\/\d+/)) {
        alert('Please navigate to an iNaturalist observation page first.');
        return;
      }

      showAddDialog(tab.url, tab.id);
    } catch (error) {
      console.error('Error getting current tab:', error);
    }
  });
}

// Show add dialog
function showAddDialog(url, tabId) {
  const overlay = document.createElement('div');
  overlay.className = 'dialog-overlay';
  overlay.innerHTML = `
    <div class="dialog">
      <h2>Add Observation</h2>
      <div class="form-group">
        <label for="add-type">Type</label>
        <select id="add-type">
          <option value="todo" ${currentTab === 'todo' ? 'selected' : ''}>TODO</option>
          <option value="research" ${currentTab === 'research' ? 'selected' : ''}>Research</option>
        </select>
      </div>
      <div class="form-group">
        <label for="add-note">Note (optional)</label>
        <textarea id="add-note" placeholder="Add a note..."></textarea>
      </div>
      <div class="dialog-buttons">
        <button class="btn btn-small" id="cancel-add">Cancel</button>
        <button class="btn btn-primary" id="confirm-add">Add</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  overlay.querySelector('#cancel-add').addEventListener('click', () => {
    overlay.remove();
  });

  overlay.querySelector('#confirm-add').addEventListener('click', async () => {
    const type = overlay.querySelector('#add-type').value;
    const note = overlay.querySelector('#add-note').value.trim();

    try {
      // Get metadata for both types (TODO needs species name)
      const metadata = await browser.tabs.sendMessage(tabId, { action: 'getMetadata' });
      metadata.note = note;

      if (type === 'todo') {
        await browser.runtime.sendMessage({ action: 'addTodo', url, note, metadata });
      } else {
        await browser.runtime.sendMessage({ action: 'addResearch', url, metadata });
      }

      overlay.remove();

      // Switch to the appropriate tab and reload
      document.querySelector(`.tab[data-tab="${type}"]`).click();
    } catch (error) {
      alert('Error: ' + error.message);
    }
  });

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.remove();
  });
}

// Show edit dialog for updating note
function showEditDialog(item) {
  const title = item.species || `Observation #${item.observationId}`;
  const overlay = document.createElement('div');
  overlay.className = 'dialog-overlay';
  overlay.innerHTML = `
    <div class="dialog">
      <h2>Edit Note</h2>
      <p class="dialog-subtitle">${escapeHtml(title)}</p>
      <div class="form-group">
        <label for="edit-note">Note</label>
        <textarea id="edit-note" placeholder="Add a note...">${escapeHtml(item.note || '')}</textarea>
      </div>
      <div class="dialog-buttons">
        <button class="btn btn-small" id="cancel-edit">Cancel</button>
        <button class="btn btn-primary" id="confirm-edit">Save</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  const textarea = overlay.querySelector('#edit-note');
  textarea.focus();
  textarea.setSelectionRange(textarea.value.length, textarea.value.length);

  overlay.querySelector('#cancel-edit').addEventListener('click', () => {
    overlay.remove();
  });

  overlay.querySelector('#confirm-edit').addEventListener('click', async () => {
    const note = overlay.querySelector('#edit-note').value.trim();

    try {
      await browser.runtime.sendMessage({ action: 'updateNote', id: item.id, note });
      overlay.remove();
      loadItems();
    } catch (error) {
      alert('Error: ' + error.message);
    }
  });

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.remove();
  });
}

// Export/Import
function setupExportImport() {
  document.getElementById('export-btn').addEventListener('click', async () => {
    try {
      const data = await browser.runtime.sendMessage({ action: 'exportData' });
      const blob = new Blob([data], { type: 'application/json' });
      const url = URL.createObjectURL(blob);

      const a = document.createElement('a');
      a.href = url;
      a.download = `inat-links-backup-${new Date().toISOString().split('T')[0]}.json`;
      a.click();

      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Export error:', error);
      alert('Error exporting data');
    }
  });

  document.getElementById('import-btn').addEventListener('click', () => {
    document.getElementById('import-file').click();
  });

  document.getElementById('import-file').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    try {
      const text = await file.text();
      await browser.runtime.sendMessage({ action: 'importData', jsonString: text });
      alert('Import successful!');
      loadItems();
    } catch (error) {
      console.error('Import error:', error);
      alert('Error importing data: ' + error.message);
    }

    e.target.value = '';
  });
}

// Utility
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function linkifyUrls(text) {
  const escaped = escapeHtml(text);
  const urlPattern = /(https?:\/\/[^\s<]+)/g;
  return escaped.replace(urlPattern, '<a href="$1" class="note-link">$1</a>');
}
