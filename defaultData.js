// Function to read data from file
async function readDataFromFile() {
  try {
    const response = await fetch(chrome.runtime.getURL('data.json'));
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error reading data file:', error);
    return null;
  }
}

// Function to write data to storage
async function writeDataToStorage(data) {
  try {
    await chrome.storage.local.set({ personalInfo: data.personalInfo });
    console.log('Data written to storage:', data);
  } catch (error) {
    console.error('Error writing data to storage:', error);
  }
}

// Initialize data from file
async function initializeData() {
  const data = await readDataFromFile();
  if (data) {
    await writeDataToStorage(data);
    return data;
  }
  return null;
}

// Functions to manage personal data
window.getPersonalInfo = async function() {
  const result = await chrome.storage.local.get('personalInfo');
  if (!result.personalInfo) {
    const data = await initializeData();
    return data?.personalInfo;
  }
  return result.personalInfo;
};

window.updatePersonalInfo = async function(newData) {
  await chrome.storage.local.set({ personalInfo: newData });
  return newData;
};

// Message listener for other scripts
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'getDefaultData') {
    readDataFromFile().then(data => {
      sendResponse(data);
    });
    return true;
  }
});
 