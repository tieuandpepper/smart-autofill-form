document.getElementById('updateKey').addEventListener('click', () => {
  const container = document.getElementById('apiInputContainer');
  container.style.display = container.style.display === 'none' ? 'block' : 'none';
});

document.getElementById('saveKey').addEventListener('click', async () => {
  const apiKey = document.getElementById('apiKey').value;
  if (!apiKey.trim()) {
    alert('Please enter an API key');
    return;
  }
  
  try {
    // Validate the API key
    const response = await fetch('https://api.openai.com/v1/models', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`
      }
    });

    if (!response.ok) {
      throw new Error('Invalid API Key');
    }

    // If validation successful, save the key
    await chrome.storage.local.set({ 'openai_api_key': apiKey });
    document.getElementById('apiInputContainer').style.display = 'none';
    alert('API key saved successfully!');
  } catch (error) {
    alert('Invalid API Key. Please check and try again.');
  }
});

document.getElementById('fillForm').addEventListener('click', async () => {
  try {
    const { openai_api_key } = await chrome.storage.local.get('openai_api_key');
    console.log("Fill Form Check API Key: ", openai_api_key);
    if (!openai_api_key) {
      alert('Please set your OpenAI API key first');
      document.getElementById('apiInputContainer').style.display = 'block';
      return;
    }
    
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) {
      alert('No active tab found');
      return;
    }

    // First inject the content script
    await new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ action: 'injectContentScript' }, (response) => {
        if (response && response.success) {
          resolve();
        } else {
          reject(new Error('Failed to inject content script'));
        }
      });
    });

    // Wait a moment for the script to initialize
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Then send the fillForm message
    console.log('Sending message to tab:', tab.id);
    await chrome.tabs.sendMessage(tab.id, { action: 'fillForm' });
  } catch (error) {
    console.error('Error:', error);
    alert('Error: ' + error.message);
  }
});

// Initial check for API key
async function checkApiKey() {
  const { openai_api_key } = await chrome.storage.local.get('openai_api_key');
  console.log("InitialCheck API Key: ", openai_api_key);
  if (!openai_api_key) {
    document.getElementById('apiInputContainer').style.display = 'block';
  }
}

document.addEventListener('DOMContentLoaded', checkApiKey);

// Load saved API key when popup opens
document.addEventListener('DOMContentLoaded', async () => {
  const { openai_api_key } = await chrome.storage.local.get('openai_api_key');
  if (openai_api_key) {
    document.getElementById('apiInputContainer').style.display = 'none';
  }
});
