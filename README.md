# smart-autofill-form
Chrome extension to autofill forms using LLMs

## How does it work?
Clone this repo. Load the extension via ```chrome:\\extensions```.

After adding the extension, activate it by clicking on it.

The UI will ask to enter the OpenAI API key. The key will be saved in Chrome Storage.

To fill in forms, click AutoFill Form using the available information.

To add more information, you can upload a PDF containing the new information, or manually input to the forms and click Learn New Information (the extension will read the form and update existing information).

GPT-4 is used in several steps. First, it determines which information in the uploaded PDF is useful or unavailable and converts the data to JSON format to save in Chrome Storage. Secondly, GPT-4 determines which information goes into which input fields. Lastly, it reads completed forms and updates current information.

## Installation
To get the required files, create the lib directory:
```
mkdir lib
cd lib
```
Download the files:
# Download PDF.js files (if you haven't already)
```
curl -O https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.js
curl -O https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.worker.js
```

