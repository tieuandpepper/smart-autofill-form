export const DEFAULT_DATA = {
  personalInfo: {
    commonFields: {
      'email': ['example@email.com', 'test@gmail.com'],
      'name': ['John Doe', 'Jane Smith'],
      'phone': ['+1234567890', '123-456-7890'],
      'address': ['123 Main St', '456 Park Avenue'],
      'city': ['New York', 'Los Angeles'],
      'country': ['United States', 'Canada'],
      'postalCode': ['10001', '90210'],
      'dob': ['1990-01-01', '1985-12-31']
    }
  }
};

// Functions to manage personal data
export async function getPersonalInfo() {
  const result = await chrome.storage.local.get('personalInfo');
  return result.personalInfo || DEFAULT_DATA.personalInfo;
}

export async function updatePersonalInfo(newData) {
  const currentData = await getPersonalInfo();
  const updatedData = {
    personalInfo: {
      commonFields: {
        ...currentData.commonFields,
        ...newData
      }
    }
  };
  await chrome.storage.local.set(updatedData);
  return updatedData;
}

export async function addNewField(fieldName, values) {
  const currentData = await getPersonalInfo();
  currentData.commonFields[fieldName] = Array.isArray(values) ? values : [values];
  await chrome.storage.local.set({ personalInfo: currentData });
  return currentData;
}

export async function removeField(fieldName) {
  const currentData = await getPersonalInfo();
  delete currentData.commonFields[fieldName];
  await chrome.storage.local.set({ personalInfo: currentData });
  return currentData;
}

// Make it available to other scripts
if (typeof chrome !== 'undefined' && chrome.runtime) {
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'getDefaultData') {
      sendResponse(DEFAULT_DATA);
    }
  });
} 