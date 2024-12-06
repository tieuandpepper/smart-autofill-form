// Load current data
document.addEventListener('DOMContentLoaded', async () => {
  const { personalInfo } = await chrome.storage.local.get('personalInfo');
  document.getElementById('personalInfo').value = JSON.stringify(personalInfo?.commonFields || {}, null, 2);
});

// Save changes
document.getElementById('save').addEventListener('click', async () => {
  try {
    const newData = JSON.parse(document.getElementById('personalInfo').value);
    await chrome.runtime.sendMessage({
      action: 'updatePersonalInfo',
      data: newData
    });
    
    document.getElementById('status').textContent = 'Settings saved successfully!';
    setTimeout(() => {
      document.getElementById('status').textContent = '';
    }, 2000);
  } catch (error) {
    document.getElementById('status').textContent = 'Error: ' + error.message;
  }
}); 