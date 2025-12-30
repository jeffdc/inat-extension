// Storage utilities for iNaturalist Link Manager

const Storage = {
  STORAGE_KEY: 'inat_links_data',

  // Generate a simple UUID
  generateId() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  },

  // Extract observation ID from URL
  extractObservationId(url) {
    const match = url.match(/inaturalist\.org\/observations\/(\d+)/);
    return match ? match[1] : null;
  },

  // Get all data from storage
  async getData() {
    const result = await browser.storage.local.get(this.STORAGE_KEY);
    return result[this.STORAGE_KEY] || { version: 1, items: [] };
  },

  // Save all data to storage
  async saveData(data) {
    await browser.storage.local.set({ [this.STORAGE_KEY]: data });
  },

  // Add a TODO item
  async addTodo(url, note = '', metadata = {}) {
    const data = await this.getData();
    const observationId = this.extractObservationId(url);

    if (!observationId) {
      throw new Error('Invalid iNaturalist observation URL');
    }

    // Check for duplicate
    if (data.items.some(item => item.observationId === observationId)) {
      throw new Error('Observation already saved');
    }

    const item = {
      id: this.generateId(),
      type: 'todo',
      url,
      observationId,
      note,
      createdAt: new Date().toISOString(),
      completed: false,
      species: metadata.species || null,
      commonName: metadata.commonName || null
    };

    data.items.push(item);
    await this.saveData(data);
    return item;
  },

  // Add a Research item
  async addResearch(url, metadata = {}) {
    const data = await this.getData();
    const observationId = this.extractObservationId(url);

    if (!observationId) {
      throw new Error('Invalid iNaturalist observation URL');
    }

    // Check for duplicate
    if (data.items.some(item => item.observationId === observationId)) {
      throw new Error('Observation already saved');
    }

    const item = {
      id: this.generateId(),
      type: 'research',
      url,
      observationId,
      note: metadata.note || '',
      createdAt: new Date().toISOString(),
      species: metadata.species || null,
      commonName: metadata.commonName || null,
      observer: metadata.observer || null,
      observationDate: metadata.observationDate || null,
      location: metadata.location || null,
      thumbnailUrl: metadata.thumbnailUrl || null
    };

    data.items.push(item);
    await this.saveData(data);
    return item;
  },

  // Mark a TODO as complete
  async markComplete(id) {
    const data = await this.getData();
    const item = data.items.find(i => i.id === id);

    if (!item) {
      throw new Error('Item not found');
    }

    if (item.type !== 'todo') {
      throw new Error('Only TODO items can be marked complete');
    }

    item.completed = true;
    item.completedAt = new Date().toISOString();
    await this.saveData(data);
    return item;
  },

  // Update note on an item
  async updateNote(id, note) {
    const data = await this.getData();
    const item = data.items.find(i => i.id === id);

    if (!item) {
      throw new Error('Item not found');
    }

    item.note = note;
    await this.saveData(data);
    return item;
  },

  // Delete an item
  async deleteItem(id) {
    const data = await this.getData();
    const index = data.items.findIndex(i => i.id === id);

    if (index === -1) {
      throw new Error('Item not found');
    }

    data.items.splice(index, 1);
    await this.saveData(data);
  },

  // Get items by type
  async getByType(type) {
    const data = await this.getData();
    return data.items.filter(item => item.type === type);
  },

  // Search items
  async search(query) {
    const data = await this.getData();
    const lowerQuery = query.toLowerCase();

    return data.items.filter(item => {
      return (
        item.note?.toLowerCase().includes(lowerQuery) ||
        item.species?.toLowerCase().includes(lowerQuery) ||
        item.commonName?.toLowerCase().includes(lowerQuery) ||
        item.observer?.toLowerCase().includes(lowerQuery) ||
        item.location?.toLowerCase().includes(lowerQuery) ||
        item.observationId.includes(query)
      );
    });
  },

  // Export data for backup
  async exportData() {
    const data = await this.getData();
    data.exportedAt = new Date().toISOString();
    return JSON.stringify(data, null, 2);
  },

  // Import data from backup
  async importData(jsonString) {
    const imported = JSON.parse(jsonString);

    if (!imported.version || !Array.isArray(imported.items)) {
      throw new Error('Invalid backup file format');
    }

    await this.saveData(imported);
    return imported;
  }
};
