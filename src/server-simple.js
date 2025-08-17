// Minimal working version for testing
const express = require('express');
const multer = require('multer');
const app = express();
const upload = multer();

app.use(express.static('public'));
app.use(express.json());

function serveUploadForm(res) {
  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Mermaid to Dataverse Converter - Simple Test</title>
    <style>
        body { 
            font-family: Arial, sans-serif; 
            max-width: 800px; 
            margin: 0 auto; 
            padding: 20px; 
        }
        .file-upload {
            border: 2px dashed #ccc;
            padding: 20px;
            text-align: center;
            margin: 20px 0;
        }
        .btn {
            background: #0078d4;
            color: white;
            padding: 10px 20px;
            border: none;
            border-radius: 4px;
            cursor: pointer;
        }
        .validation-results {
            margin: 20px 0;
            padding: 15px;
            background: #f5f5f5;
            border-radius: 4px;
        }
    </style>
</head>
<body>
    <h1>Mermaid to Dataverse Converter - Test</h1>
    
    <div class="file-upload" id="fileUpload">
        <p>Click to select or drag & drop your .mmd file</p>
        <input type="file" id="mermaidFile" accept=".mmd,.md,.txt" style="display: none;">
    </div>
    
    <div id="validationResults" style="display: none;">
        <!-- Results will appear here -->
    </div>

    <script>
        const fileUpload = document.getElementById('fileUpload');
        const fileInput = document.getElementById('mermaidFile');

        fileUpload.addEventListener('click', () => fileInput.click());
        fileInput.addEventListener('change', handleFileSelect);

        async function handleFileSelect(e) {
            if (e.target.files.length > 0) {
                const file = e.target.files[0];
                const content = await file.text();
                
                document.getElementById('validationResults').innerHTML = 
                    '<h3>File Loaded Successfully</h3>' +
                    '<p><strong>File:</strong> ' + file.name + '</p>' +
                    '<p><strong>Size:</strong> ' + file.size + ' bytes</p>' +
                    '<p><strong>Content Preview:</strong></p>' +
                    '<pre style="background: #f0f0f0; padding: 10px; max-height: 200px; overflow-y: auto;">' + 
                    content.substring(0, 500) + (content.length > 500 ? '...' : '') +
                    '</pre>';
                    
                document.getElementById('validationResults').style.display = 'block';
            }
        }
    </script>
</body>
</html>
  `;
  
  res.setHeader('Content-Type', 'text/html');
  res.send(html);
}

app.get('/', (req, res) => {
  serveUploadForm(res);
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`Simple test server running on port ${PORT}`);
});
