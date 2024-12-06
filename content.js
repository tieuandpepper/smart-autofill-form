chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('Message received:', request);
  
  if (request.action === 'fillForm') {
    console.log('Starting form fill process...');
    getFormContext().then(formData => {
      if (formData) {
        console.log('Form data collected:', formData);
        fillFormWithGPT4(formData);
      } else {
        console.warn('No form data was collected');
      }
    }).catch(error => {
      console.error('Error in form fill process:', error);
    });
    return true;
  }
  
  if (request.action === 'learnNewInfo') {
    console.log('Starting learn new info process...');
    getFormContext().then(formData => {
      if (formData) {
        const filledData = {};
        formData.fields.forEach(field => {
          if (field.element) {
            filledData[field.label || field.name] = field.element.value;
          }
        });
        learnNewInformation(formData, filledData);
      } else {
        console.warn('No form data was collected for learning');
      }
    }).catch(error => {
      console.error('Error in learn new info process:', error);
    });
    return true;
  }
  
  if (request.action === 'processPdf') {
    console.log('Processing PDF content:', request.pdfText);
    processPdfContent(request.pdfText);
    return true;
  }
});

async function UpdatePersonalInfo() {
  try {
    // First try to get existing data from storage
    const { personalInfo } = await chrome.storage.local.get('personalInfo');
    
    if (!personalInfo) {
      // Only initialize default data if nothing exists in storage
      await chrome.runtime.sendMessage({ action: 'initializeDefaultData' });
      const { personalInfo: newInfo } = await chrome.storage.local.get('personalInfo');
      console.log('Personal info initialized with default data:', newInfo);
      return newInfo;
    }
    
    console.log('Using existing personal info from storage:', personalInfo);
    return personalInfo;
  } catch (error) {
    console.error('Error updating personal info:', error);
    return null;
  }
}

// Add a queue for OpenAI requests
let isProcessing = false;

async function callOpenAI(prompt, systemMessage = 'You are a helpful assistant.') {
  while (isProcessing) {
    await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second before checking again
  }
  
  isProcessing = true;
  console.log('=== New OpenAI Request ===');
  console.log('Sending Prompt:', prompt);
  
  try {
    const { openai_api_key } = await chrome.storage.local.get('openai_api_key');
    if (!openai_api_key) {
      throw new Error('OpenAI API key not found');
    }

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${openai_api_key}`
      },
      body: JSON.stringify({
        model: 'gpt-4',
        messages: [
          {
            role: 'system',
            content: systemMessage
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.7
      })
    });

    const data = await response.json();
    console.log('GPT-4 Response:', data.choices[0].message.content);
    
    if (!response.ok) {
      throw new Error(data.error?.message || 'OpenAI API request failed');
    }

    return data;
  } finally {
    isProcessing = false;
  }
}

async function learnNewInformation(formData, filledData) {
  try {
    let { personalInfo } = await chrome.storage.local.get('personalInfo');
    console.log('=== Learning New Information ===');
    console.log('Current Personal Info:', JSON.stringify(personalInfo, null, 2));
    console.log('Form Data:', JSON.stringify(formData, null, 2));
    console.log('Filled Data:', JSON.stringify(filledData, null, 2));

    const prompt = `You are a data extraction and merging assistant. Here is the order of what you will do.
1. Compare the current personal information with the newly filled form data.
2. Extract any new or updated information.
3. Merge the new information with the current personal information if possible.
4. Return ONLY a JSON object in the exact same format as the Current Personal Information, including both existing and new data.
5. If a field has multiple values (like email or phone), make a list that keeps the existing values and adds new ones if they're different.

IMPORTANT: Your response must be ONLY a valid JSON object, with no additional text or explanation.

Current Personal Information:
${JSON.stringify(personalInfo, null, 2)}

New Form Data:
${JSON.stringify(filledData, null, 2)}

Form Fields Information:
${JSON.stringify(formData.fields.map(f => ({
  label: f.label || f.name || f.id,
  type: f.type,
  validation: f.validation
})), null, 2)}`;

    const data = await callOpenAI(prompt, 'You are a JSON-only response assistant. Return only valid JSON objects without any explanation or additional text.');
    
    const responseContent = data.choices[0].message.content.trim();
    console.log('Raw GPT Response:', responseContent);
    
    let jsonMatch = responseContent.match(/\{[\s\S]*\}/);
    let jsonStr = jsonMatch ? jsonMatch[0] : responseContent;
    
    try {
      const newPersonalInfo = JSON.parse(jsonStr);
      console.log('Extracted New Personal Info:', JSON.stringify(newPersonalInfo, null, 2));

      // Validate the structure matches our expected format
      if (!newPersonalInfo.hasOwnProperty('fullName')) {
        throw new Error('Invalid personal info format: missing required fields');
      }

      // Save to Chrome's storage with proper error handling
      try {
        await chrome.storage.local.set({ personalInfo: newPersonalInfo });
        console.log('Successfully saved to Chrome storage:', newPersonalInfo);
        
        // Verify the save was successful
        const { personalInfo: savedInfo } = await chrome.storage.local.get('personalInfo');
        if (!savedInfo) {
          throw new Error('Verification failed: Could not retrieve saved data');
        }
        
        // Send message to background script to update data.json
        await chrome.runtime.sendMessage({
          action: 'updateDataFile',
          data: newPersonalInfo
        });

        console.log('Personal information updated successfully in both storage and data.json');
        alert('Personal information has been updated successfully!');

        return newPersonalInfo;
      } catch (storageError) {
        console.error('Storage Error:', storageError);
        throw new Error(`Failed to save personal info: ${storageError.message}`);
      }
    } catch (parseError) {
      console.error('JSON Parse Error:', parseError);
      console.error('Attempted to parse:', jsonStr);
      throw new Error(`Failed to parse GPT response as JSON: ${parseError.message}`);
    }
  } catch (error) {
    console.error('Error learning new information:', error);
    alert(`Failed to learn new information: ${error.message}`);
    throw error;
  }
}

function createCompletionReminder(formData, filledData) {
  const nullFields = Object.entries(filledData)
    .filter(([_, value]) => value === null)
    .map(([key, _]) => key);

  const reminderDiv = document.createElement('div');
  reminderDiv.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    padding: 15px;
    background: white;
    border: 2px solid #2196F3;
    border-radius: 8px;
    box-shadow: 0 2px 5px rgba(0,0,0,0.2);
    z-index: 10000;
    max-width: 300px;
  `;

  if (nullFields.length > 0) {
    reminderDiv.innerHTML = `
      <h3 style="margin: 0 0 10px 0;">Form Completion Reminder</h3>
      <p>Some fields couldn't be filled automatically:</p>
      <ul style="margin: 5px 0; padding-left: 20px;">
        ${nullFields.map(field => `<li>${field}</li>`).join('')}
      </ul>
      <p>Please fill these fields and click "Learn New Information" in the extension popup to update our database.</p>
      <button onclick="this.parentElement.remove()" style="
        padding: 5px 10px;
        background: #2196F3;
        color: white;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        margin-top: 10px;
      ">Close</button>
    `;
  } else {
    reminderDiv.innerHTML = `
      <h3 style="margin: 0 0 10px 0;">Form Completed</h3>
      <p>All fields were filled successfully!</p>
      <button onclick="this.parentElement.remove()" style="
        padding: 5px 10px;
        background: #2196F3;
        color: white;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        margin-top: 10px;
      ">Close</button>
    `;
  }

  document.body.appendChild(reminderDiv);
}

async function fillFormWithGPT4(formData, previousPrompt = '', retryCount = 0) {
  const MAX_RETRIES = 2;
  
  try {
    let { personalInfo } = await chrome.storage.local.get('personalInfo');
    console.log('Current Personal Info:', JSON.stringify(personalInfo, null, 2));

    const prompt = previousPrompt || `You are a form-filling assistant. Use the following personal information to fill in the forms.
    
Personal Information Available:
${JSON.stringify(personalInfo, null, 2)}

Form Fields to Fill:
${formData.fields.map(field => {
  let fieldDesc = `- Field "${field.label || field.name || field.id}":
  Type: ${field.type}
  Required: ${field.required ? 'Yes' : 'No'}`;
  
  if (field.validation.minLength) fieldDesc += `\n  Minimum Length: ${field.validation.minLength}`;
  if (field.validation.maxLength) fieldDesc += `\n  Maximum Length: ${field.validation.maxLength}`;
  if (field.validation.pattern) fieldDesc += `\n  Pattern Required: ${field.validation.pattern}`;
  if (field.validation.min) fieldDesc += `\n  Minimum Value: ${field.validation.min}`;
  if (field.validation.max) fieldDesc += `\n  Maximum Value: ${field.validation.max}`;
  
  return fieldDesc;
}).join('\n\n')}

Return ONLY a JSON object with this exact format:
{
  "field_label_or_name_or_id": "value_or_null",
  ...
}`;

    const data = await callOpenAI(prompt, 'You are a helpful assistant that fills forms accurately based on provided information.');

    try {
      const suggestions = JSON.parse(data.choices[0].message.content);
      formData.fields.forEach(field => {
        const value = suggestions[field.label || field.name || field.id];
        if (value && field.element) {
          field.element.value = value;
          field.element.dispatchEvent(new Event('input', { bubbles: true }));
          field.element.dispatchEvent(new Event('change', { bubbles: true }));
        }
      });

      console.log('Form filled successfully with:', suggestions);
      createCompletionReminder(formData, suggestions);
      return true;
    } catch (parseError) {
      console.error('Error parsing GPT response:', parseError);
      if (retryCount < MAX_RETRIES) {
        console.log(`Retrying (${retryCount + 1}/${MAX_RETRIES})...`);
        return fillFormWithGPT4(formData, prompt, retryCount + 1);
      }
      alert('Error parsing GPT response. Please try again.');
    }
  } catch (error) {
    console.error('Error in fillFormWithGPT4:', error);
    alert(error.message);
  }
}

async function getFormContext() {
  // Get all input fields and their context
  const inputs = document.querySelectorAll('input, textarea, select');
  
  // Check if any input fields were found
  if (inputs.length === 0) {
    console.warn('No form fields were found on this page');
    return null;
  }

  const formData = {
    fields: []
  };

  inputs.forEach(input => {
    let label = '';
    let fieldType = input.type;
    let fieldName = input.name || input.id;

    // Method 1: Check for label element
    const labelElement = input.labels?.[0];
    if (labelElement) {
      label = labelElement.textContent.trim();
    }

    // Method 2: Check for aria-label
    if (!label && input.getAttribute('aria-label')) {
      label = input.getAttribute('aria-label');
    }

    // Method 3: Check for placeholder
    if (!label && input.placeholder) {
      label = input.placeholder;
    }

    // Method 4: Look for nearby text nodes
    if (!label) {
      // Look for text nodes before the input
      let node = input;
      let found = false;
      while (node && !found) {
        if (node.nodeType === Node.TEXT_NODE && node.textContent.trim()) {
          label = node.textContent.trim();
          found = true;
        }
        node = node.previousSibling || node.parentNode;
      }
    }

    // Get validation rules
    const validationRules = {
      required: input.required,
      minLength: input.minLength,
      maxLength: input.maxLength,
      pattern: input.pattern,
      min: input.min,
      max: input.max
    };

    formData.fields.push({
      type: fieldType,
      name: fieldName,
      label: label,
      required: validationRules.required,
      validation: validationRules,
      value: input.value, // current value if any
      placeholder: input.placeholder || '',
      element: input
    });
  });

  if (formData.fields.length === 0) {
    console.warn('No form fields could be processed');
    return null;
  }

  console.log('Form context collected:', formData);
  return formData;
}

async function processPdfContent(pdfText) {
  try {
    if (!pdfText || pdfText.trim().length === 0) {
      throw new Error('No text content provided from PDF');
    }

    let { personalInfo } = await chrome.storage.local.get('personalInfo');
    if (!personalInfo) {
      throw new Error('No personal information found in storage');
    }

    console.log('=== Processing PDF Content ===');
    console.log('PDF Text Length:', pdfText.length);
    console.log('First 200 characters:', pdfText.substring(0, 200));
    
    const prompt = `You are a data extraction assistant. Here is the order of what you will do:
1. Analyze the provided PDF text content
2. Compare it with the current personal information
3. Extract any new or updated information found in the PDF
4. Merge the new information with the current personal information
5. Return ONLY a JSON object in the exact same format as the Current Personal Information

IMPORTANT: Your response must be ONLY a valid JSON object, with no additional text or explanation.

Current Personal Information:
${JSON.stringify(personalInfo, null, 2)}

PDF Content:
${pdfText}`;

    const data = await callOpenAI(prompt, 'You are a JSON-only response assistant. Return only valid JSON objects without any explanation or additional text.');
    
    const responseContent = data.choices[0].message.content.trim();
    console.log('Raw GPT Response:', responseContent);
    
    let jsonMatch = responseContent.match(/\{[\s\S]*\}/);
    let jsonStr = jsonMatch ? jsonMatch[0] : responseContent;
    
    try {
      const newPersonalInfo = JSON.parse(jsonStr);
      console.log('Extracted New Personal Info:', JSON.stringify(newPersonalInfo, null, 2));

      if (!newPersonalInfo.hasOwnProperty('fullName')) {
        throw new Error('Invalid personal info format: missing required fields');
      }

      // Save to Chrome's storage
      await chrome.storage.local.set({ personalInfo: newPersonalInfo });
      console.log('Successfully saved to Chrome storage:', newPersonalInfo);
      
      // Verify the save
      const { personalInfo: savedInfo } = await chrome.storage.local.get('personalInfo');
      if (!savedInfo) {
        throw new Error('Verification failed: Could not retrieve saved data');
      }
      
      // Update data.json
      await chrome.runtime.sendMessage({
        action: 'updateDataFile',
        data: newPersonalInfo
      });

      alert('Personal information has been updated from PDF successfully!');
    } catch (parseError) {
      console.error('JSON Parse Error:', parseError);
      throw new Error(`Failed to parse GPT response as JSON: ${parseError.message}`);
    }
  } catch (error) {
    console.error('Error processing PDF:', error);
    alert(`Failed to process PDF: ${error.message}`);
  }
}
