console.log('Content script loaded!');

async function getFormContext() {
  // Get all input fields and their context
  const inputs = document.querySelectorAll('input, textarea, select');
  
  // Check if any input fields were found
  if (inputs.length === 0) {
    alert('No form fields were found on this page. Please make sure you are on a page with a form.');
    return null;
  }

  const formData = [];

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

    formData.push({
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

  return {
    fields: formData
  };
}

async function validateGPTResponse(response) {
  try {
    const suggestions = JSON.parse(response);
    if (typeof suggestions !== 'object' || Array.isArray(suggestions)) {
      throw new Error('Response is not a JSON object');
    }
    return { isValid: true, data: suggestions };
  } catch (error) {
    return { 
      isValid: false, 
      error: `Invalid response format. Expected JSON object but got: ${response}`
    };
  }
}

async function fillFormWithGPT4(formData, previousPrompt = '', retryCount = 0) {
  const MAX_RETRIES = 5;
  
  try {
    const { openai_api_key } = await chrome.storage.local.get('openai_api_key');
    let personalInfo = await chrome.storage.local.get('personalInfo');
    
    if (!openai_api_key) {
      alert('Please set your OpenAI API key first!');
      return;
    }

    if (!personalInfo?.personalInfo?.commonFields) {
      const storage = await chrome.storage.local.get(null);
      console.log('Retrieving personal info from storage:', storage);
      
      try {
        await chrome.runtime.sendMessage({ action: 'initializeDefaultData' });
        const newStorage = await chrome.storage.local.get('personalInfo');
        personalInfo = newStorage;
      } catch (error) {
        console.error('Error initializing personal info:', error);
        personalInfo = { personalInfo: { commonFields: {} } };
      }
    }

    console.log('Using personal info:', personalInfo);

    // Construct base prompt
    let prompt = previousPrompt || `You are a form-filling assistant. Use the following personal information to fill in the forms.
    
Personal Information Available:
${JSON.stringify(personalInfo?.personalInfo?.commonFields || {}, null, 2)}

For each form field, return a JSON object where the keys are the exact field names or IDs, and the values are the appropriate responses. If the information is not available, return null for that field.

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

    console.log('Sending prompt to GPT:', prompt);

    // Make the API call to OpenAI
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
            content: 'You are a helpful assistant that fills forms accurately based on provided information. Think about the context of the form and the field types. Pay attention to the format.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.7
      })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`OpenAI API error: ${error.error?.message || 'Unknown error'}`);
    }

    const data = await response.json();
    console.log('OpenAI response:', data.choices[0].message.content);

    // Validate GPT's response
    const gptContent = data.choices[0].message.content;
    const validation = await validateGPTResponse(gptContent);

    if (!validation.isValid) {
      console.log('Invalid response format detected:', validation.error);
      
      if (retryCount >= MAX_RETRIES) {
        throw new Error('Maximum retry attempts reached. Could not get valid response from GPT.');
      }

      // Append error message to prompt and retry
      const newPrompt = `${prompt}\n\nPrevious attempt failed: ${validation.error}\nPlease ensure the response is a valid JSON object with field names as keys.`;
      return fillFormWithGPT4(formData, newPrompt, retryCount + 1);
    }

    // Fill the form with validated data
    const suggestions = validation.data;
    formData.fields.forEach(field => {
      const value = suggestions[field.label || field.name];
      if (value && field.element) {
        field.element.value = value;
        // Trigger change event
        field.element.dispatchEvent(new Event('input', { bubbles: true }));
        field.element.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });

    console.log('Form filled successfully with:', suggestions);

  } catch (error) {
    console.error('Error in fillFormWithGPT4:', error);
    alert(`Error filling form: ${error.message}`);
  }
}

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('Message received:', request);
  if (request.action === 'fillForm') {
    console.log('Starting form fill process...');
    getFormContext().then(formData => {
      if (formData) { // Only proceed if formData is not null
        console.log('Form data collected:', formData);
        fillFormWithGPT4(formData);
      }
    });
  }
});