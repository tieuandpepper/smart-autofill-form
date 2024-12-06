class StorageManager {
  static async get(key) {
    try {
      const result = await chrome.storage.local.get(key);
      return result[key];
    } catch (error) {
      console.error('Error getting from storage:', error);
      return null;
    }
  }

  static async set(key, value) {
    try {
      await chrome.storage.local.set({ [key]: value });
      return true;
    } catch (error) {
      console.error('Error setting storage:', error);
      return false;
    }
  }

  static async getOpenAIKey() {
    return await this.get('openai_api_key');
  }

  static async setOpenAIKey(key) {
    return await this.set('openai_api_key', key);
  }

  static async addFormData(formData) {
    // Save form data for learning
    const savedForms = await this.get('savedForms') || [];
    savedForms.push({
      timestamp: new Date().toISOString(),
      data: formData
    });
    return await this.set('savedForms', savedForms);
  }
} 