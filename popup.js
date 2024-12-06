document.addEventListener('DOMContentLoaded', function() {
  // Add this at the start to log stored data
  async function logStoredData() {
    try {
      const { openai_api_key } = await chrome.storage.local.get('openai_api_key');
      const { personalInfo } = await chrome.storage.local.get('personalInfo');
      
      console.log('=== Extension Started ===');
      console.log('Stored Personal Information:', JSON.stringify(personalInfo, null, 2));
      console.log('OpenAI API Key:', openai_api_key ? '✓ Present' : '✗ Missing');
      console.log('=====================');
    } catch (error) {
      console.error('Error logging stored data:', error);
    }
  }

  // Call it immediately
  logStoredData();

  // Get references to all elements
  const apiKeyInput = document.getElementById('apiKey');
  const saveKeyButton = document.getElementById('saveKey');
  const fillButton = document.getElementById('fillButton');
  const learnButton = document.getElementById('learnButton');
  const apiInputContainer = document.getElementById('apiInputContainer');
  const uploadPdfBtn = document.getElementById('uploadPdfBtn');
  const pdfInput = document.getElementById('pdfInput');

  // Initialize the popup
  async function initializePopup() {
    try {
      // Force update personal info every time popup opens
      await chrome.runtime.sendMessage({ action: 'initializeDefaultData' });
      
      // Check for API key
      const { openai_api_key } = await chrome.storage.local.get('openai_api_key');
      if (openai_api_key) {
        apiInputContainer.style.display = 'none';
      }

      // Check if we can access the current tab
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab || !tab.url || tab.url.startsWith('chrome://')) {
        fillButton.disabled = true;
        learnButton.disabled = true;
        fillButton.title = 'Cannot access this page';
        learnButton.title = 'Cannot access this page';
      }
    } catch (error) {
      console.error('Error initializing data:', error);
    }
  }

  // Save API key
  saveKeyButton.addEventListener('click', async () => {
    const apiKey = apiKeyInput.value;
    if (!apiKey.trim()) {
      showStatus('Please enter an API key', 'error');
      return;
    }
    
    try {
      showStatus('Validating API key...', 'info', true);
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
      apiInputContainer.style.display = 'none';
      showStatus('API key saved successfully!', 'success');
      setTimeout(clearStatus, 3000);
    } catch (error) {
      showStatus('Invalid API Key. Please check and try again.', 'error');
    }
  });

  // Helper function to inject content scripts
  async function ensureContentScriptsInjected(tabId) {
    try {
      // Check if scripts are already injected
      const results = await chrome.scripting.executeScript({
        target: { tabId },
        func: () => window.formFillerIsProcessing !== undefined
      });
      
      if (results[0]?.result) {
        console.log('Content scripts already present');
        return;
      }

      // Inject scripts if not already present
      await chrome.scripting.executeScript({
        target: { tabId },
        files: ['defaultData.js', 'content.js']
      });
      console.log('Content scripts injected successfully');
    } catch (error) {
      console.error('Error injecting content scripts:', error);
      throw error;
    }
  }

  // Add these helper functions at the top level after the existing functions
  function showStatus(message, type = 'info', showSpinner = false) {
    const statusElement = document.getElementById('statusMessage');
    statusElement.className = `status-${type}`;
    statusElement.style.display = 'block';
    statusElement.innerHTML = showSpinner ? 
      `<span class="spinner"></span>${message}` : 
      message;
  }

  function clearStatus() {
    const statusElement = document.getElementById('statusMessage');
    statusElement.style.display = 'none';
    statusElement.textContent = '';
  }

  // Autofill button handler
  fillButton.addEventListener('click', async () => {
    try {
      showStatus('Starting form fill process...', 'info', true);
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab && tab.id && !tab.url.startsWith('chrome://')) {
        // Ensure content scripts are injected
        await ensureContentScriptsInjected(tab.id);
        
        // Wait a bit for scripts to initialize
        setTimeout(async () => {
          try {
            await chrome.tabs.sendMessage(tab.id, { action: 'fillForm' });
          } catch (error) {
            console.error('Error sending message:', error);
            // alert('Failed to communicate with the page. Please refresh and try again.');
          }
        }, 100);
      } else {
        alert('Cannot access this page. Please try on a regular webpage.');
      }
    } catch (error) {
      console.error('Error triggering form fill:', error);
      alert('Failed to start form filling. Please make sure you are on a webpage with a form.');
    }
  });

  // Learn button handler
  learnButton.addEventListener('click', async () => {
    try {
      showStatus('Starting learning process...', 'info', true);
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab && tab.id && !tab.url.startsWith('chrome://')) {
        // Ensure content scripts are injected
        await ensureContentScriptsInjected(tab.id);
        
        // Wait a bit for scripts to initialize
        setTimeout(async () => {
          try {
            await chrome.tabs.sendMessage(tab.id, { action: 'learnNewInfo' });
          } catch (error) {
            console.error('Error sending message:', error);
            // alert('Failed to communicate with the page. Please refresh and try again.');
          }
        }, 100);
      } else {
        alert('Cannot access this page. Please try on a regular webpage.');
      }
    } catch (error) {
      console.error('Error triggering learn action:', error);
      alert('Failed to start learning process. Please make sure you are on a webpage with a form.');
    }
  });

  uploadPdfBtn.addEventListener('click', () => {
    pdfInput.click();
  });

  pdfInput.addEventListener('change', async (event) => {
    const file = event.target.files[0];
    if (file) {
      try {
        uploadPdfBtn.classList.add('loading');
        uploadPdfBtn.disabled = true;
        uploadPdfBtn.textContent = 'Processing File...';
        showStatus('Reading file...', 'info', true);

        if (file.type !== 'application/pdf') {
          throw new Error('Please upload a PDF file');
        }

        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab) {
          throw new Error('No active tab found');
        }

        if (tab.url.startsWith('chrome://')) {
          throw new Error('Cannot process files on chrome:// pages');
        }

        await ensureContentScriptsInjected(tab.id);

        let extractedText = '';
        
        // Handle PDF processing
        showStatus('Extracting text from PDF...', 'info', true);
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;
        
        for (let i = 1; i <= pdf.numPages; i++) {
          showStatus(`Processing page ${i} of ${pdf.numPages}...`, 'info', true);
          const page = await pdf.getPage(i);
          const textContent = await page.getTextContent();
          const pageText = textContent.items.map(item => item.str).join(' ');
          extractedText += pageText + '\n';
        }

        if (extractedText.trim().length === 0) {
          throw new Error('No text could be extracted from the file');
        }

        showStatus('Analyzing extracted text...', 'info', true);
        
        // Send message and wait for response with timeout
        const response = await new Promise((resolve, reject) => {
          const timeout = setTimeout(() => {
            reject(new Error('Processing timed out'));
          }, 30000);

          chrome.tabs.sendMessage(tab.id, { 
            action: 'processPdf',
            pdfText: extractedText 
          }, (response) => {
            clearTimeout(timeout);
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message));
            } else {
              resolve(response);
            }
          });
        });

        if (!response.success) {
          throw new Error(response.error || 'Failed to process PDF');
        }

        showStatus('File processed successfully!', 'success');
        pdfInput.value = '';

      } catch (error) {
        console.error('Error processing file:', error);
        showStatus(`Error: ${error.message}`, 'error');
      } finally {
        uploadPdfBtn.classList.remove('loading');
        uploadPdfBtn.disabled = false;
        uploadPdfBtn.textContent = 'Upload PDF';
        
        if (!document.querySelector('.status-error')) {
          setTimeout(clearStatus, 3000);
        }
      }
    }
  });

  // Initialize the popup when loaded
  initializePopup();

  // Add at the top level of your popup.js file
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'showStatus') {
      showStatus(request.message, request.type, request.showSpinner);
      if (request.type !== 'error') {
        setTimeout(clearStatus, 3000);
      }
    }
  });
});
