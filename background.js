// Initialize default data
const DEFAULT_DATA = {
  personalInfo: {
    fullName: "Alexander Rodriguez",
    preferredName: "Alex",
    gender: "Male",
    driverLicense: "12345678", // TX format
    occupation: "Graduate Student",
    income: "25000", // Annual income in USD
    phone: ["+1 (832) 555-1234", "832-555-1234"],
    address: "1234 Texas Ave",
    city: "College Station",
    country: "United States",
    zipcode: "77840",
    dob: "1996-08-15",
    emails: ["arodriguez23@tamu.edu", "alex.rodriguez@tamu.edu"]
  }
};

// Message handler
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'initializeDefaultData') {
    chrome.storage.local.get('personalInfo')
      .then(({ personalInfo }) => {
        if (!personalInfo) {
          return chrome.storage.local.set({ personalInfo: DEFAULT_DATA.personalInfo })
            .then(() => {
              console.log('Personal info initialized with default data:', DEFAULT_DATA.personalInfo);
              sendResponse({ success: true });
            });
        }
        console.log('Using existing personal info from storage:', personalInfo);
        sendResponse({ success: true });
      })
      .catch(error => {
        console.error('Error handling personal info:', error);
        sendResponse({ success: false, error });
      });
    return true;
  }

  if (request.action === 'getDefaultData') {
    sendResponse(DEFAULT_DATA);
    return true;
  }
});

// Optional: Add listener for extension icon click
chrome.action.onClicked.addListener((tab) => {
  chrome.storage.local.set({ personalInfo: DEFAULT_DATA.personalInfo })
    .then(() => {
      console.log('Personal info updated on extension click');
    })
    .catch(error => {
      console.error('Error updating personal info:', error);
    });
});