import { DEFAULT_DATA } from './defaultData.js';

// Listen for extension installation or update
chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === 'install') {
    try {
      // Initialize storage with default data
      await chrome.storage.local.set(DEFAULT_DATA);
      
      // Verify the data was saved
      const saved = await chrome.storage.local.get('personalInfo');
      console.log('Extension installed: Default data initialized', saved);
    } catch (error) {
      console.error('Error initializing default data:', error);
    }
  }
});

// Save data whenever it's updated
chrome.storage.onChanged.addListener((changes, namespace) => {
  for (let [key, { oldValue, newValue }] of Object.entries(changes)) {
    console.log(`Storage key "${key}" changed:`, { oldValue, newValue });
  }
});

// Inject content script when extension icon is clicked
chrome.action.onClicked.addListener((tab) => {
  chrome.scripting.executeScript({
    target: { tabId: tab.id },
    files: ['content.js']
  });
});

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'injectContentScript') {
    chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
      if (tabs[0]) {
        try {
          await chrome.scripting.executeScript({
            target: { tabId: tabs[0].id },
            files: ['content.js']
          });
          sendResponse({ success: true });
        } catch (err) {
          console.error('Script injection failed:', err);
          sendResponse({ success: false, error: err.message });
        }
      }
    });
    return true; // Keep the message channel open for async response
  }
});

// Add a function to check storage contents
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'checkStorage') {
    chrome.storage.local.get(null, (data) => {
      console.log('Current storage contents:', data);
      sendResponse(data);
    });
    return true;
  }
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'initializeDefaultData') {
    chrome.storage.local.set(DEFAULT_DATA)
      .then(() => sendResponse({ success: true }))
      .catch((error) => sendResponse({ success: false, error }));
    return true;
  }
  
  if (request.action === 'updatePersonalInfo') {
    chrome.storage.local.get('personalInfo')
      .then(data => {
        const updatedData = {
          personalInfo: {
            commonFields: {
              ...(data.personalInfo?.commonFields || {}),
              ...request.data
            }
          }
        };
        return chrome.storage.local.set(updatedData);
      })
      .then(() => sendResponse({ success: true }))
      .catch((error) => sendResponse({ success: false, error }));
    return true;
  }
});