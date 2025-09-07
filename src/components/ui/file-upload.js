import { Component } from '../base/component.js';

/**
 * File Upload Component
 * Handles file selection and drag-and-drop functionality
 */
export class FileUpload extends Component {
    constructor(options = {}) {
        super();
        this.options = {
            accept: '.mmd,.txt',
            multiple: false,
            dragAndDrop: true,
            label: 'Upload Mermaid ERD File (.mmd)',
            buttonText: 'Choose File',
            ...options
        };
        this.selectedFile = null;
        this.element = this.createElement();
        this.init();
    }

    /**
     * Create the file upload element
     * @returns {HTMLElement} - File upload element
     */
    createElement() {
        const template = `
            <div class="form-group">
                <label class="form-label">${this.options.label}</label>
                <div class="file-upload-simple" data-upload-area>
                    <input type="file" 
                           accept="${this.options.accept}" 
                           ${this.options.multiple ? 'multiple' : ''} 
                           style="display: none;" 
                           data-file-input>
                    <button type="button" class="btn btn-secondary" style="width: 100%;" data-upload-button>
                        <i class="fas fa-upload"></i>
                        ${this.options.buttonText}
                    </button>
                    <span class="file-name-display" data-file-display>No file selected</span>
                </div>
            </div>
        `;
        return this.createFromTemplate(template);
    }

    /**
     * Bind event listeners
     */
    bindEvents() {
        const uploadArea = this.find('[data-upload-area]');
        const uploadButton = this.find('[data-upload-button]');
        const fileInput = this.find('[data-file-input]');

        // Button click to trigger file input
        this.addEventListener(uploadButton, 'click', () => {
            fileInput.click();
        });

        // File input change
        this.addEventListener(fileInput, 'change', (e) => {
            this.handleFileSelection(e.target.files);
        });

        if (this.options.dragAndDrop) {
            // Drag and drop events
            this.addEventListener(uploadArea, 'dragover', (e) => {
                e.preventDefault();
                uploadArea.classList.add('dragover');
            });

            this.addEventListener(uploadArea, 'dragleave', (e) => {
                e.preventDefault();
                uploadArea.classList.remove('dragover');
            });

            this.addEventListener(uploadArea, 'drop', (e) => {
                e.preventDefault();
                uploadArea.classList.remove('dragover');
                this.handleFileSelection(e.dataTransfer.files);
            });
        }
    }

    /**
     * Handle file selection
     * @param {FileList} files - Selected files
     */
    handleFileSelection(files) {
        if (files.length === 0) return;

        const file = files[0];
        
        // Validate file type
        if (!this.validateFile(file)) {
            this.emit('file-error', { 
                error: 'Invalid file type', 
                file,
                message: `Please select a file with extension: ${this.options.accept}` 
            });
            return;
        }

        this.selectedFile = file;
        this.updateDisplay();
        
        this.emit('file-selected', { file });
    }

    /**
     * Validate file type
     * @param {File} file - File to validate
     * @returns {boolean} - True if valid
     */
    validateFile(file) {
        if (!this.options.accept) return true;
        
        const acceptedTypes = this.options.accept.split(',').map(type => type.trim());
        const fileExtension = '.' + file.name.split('.').pop().toLowerCase();
        
        return acceptedTypes.some(type => {
            if (type.startsWith('.')) {
                return type === fileExtension;
            }
            return file.type === type;
        });
    }

    /**
     * Update display with selected file
     */
    updateDisplay() {
        const fileDisplay = this.find('[data-file-display]');
        if (fileDisplay && this.selectedFile) {
            fileDisplay.textContent = this.selectedFile.name;
        }
    }

    /**
     * Get selected file
     * @returns {File|null} - Selected file or null
     */
    getFile() {
        return this.selectedFile;
    }

    /**
     * Clear selected file
     */
    clear() {
        const fileInput = this.find('[data-file-input]');
        const fileDisplay = this.find('[data-file-display]');
        
        if (fileInput) fileInput.value = '';
        if (fileDisplay) fileDisplay.textContent = 'No file selected';
        
        this.selectedFile = null;
        this.emit('file-cleared');
    }

    /**
     * Set loading state
     * @param {boolean} loading - Loading state
     */
    setLoading(loading) {
        const uploadButton = this.find('[data-upload-button]');
        if (uploadButton) {
            uploadButton.disabled = loading;
            if (loading) {
                uploadButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing...';
            } else {
                uploadButton.innerHTML = `<i class="fas fa-upload"></i> ${this.options.buttonText}`;
            }
        }
    }

    /**
     * Render the component
     */
    render() {
        this.updateDisplay();
    }
}
