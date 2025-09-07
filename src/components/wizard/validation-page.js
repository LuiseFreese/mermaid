import { Component } from '../base/component.js';
import { FileUpload } from '../ui/file-upload.js';

/**
 * Validation Page Component
 * Handles ERD file upload and validation
 */
export class ValidationPage extends Component {
    constructor(wizardState, apiClient) {
        super();
        this.wizardState = wizardState;
        this.apiClient = apiClient;
        this.fileUpload = null;
        this.element = this.createElement();
        this.init();
    }

    /**
     * Create the validation page element
     * @returns {HTMLElement} - Page element
     */
    createElement() {
        const template = `
            <div class="page active" id="page-validation">
                <div class="page-header">
                    <h2 class="page-title">ERD Validation & Upload</h2>
                    <p class="page-description">Upload your Mermaid ERD file and validate its structure for Dataverse compatibility.</p>
                </div>

                <div id="erdStatusIndicator" class="hidden" style="background: #107c10; color: white; padding: 12px 16px; border-radius: 6px; margin-bottom: 20px; text-align: center; font-weight: bold;">
                    ✅ ERD file successfully uploaded and validated
                </div>

                <div class="section">
                    <!-- File upload component will be inserted here -->
                    <div id="file-upload-container"></div>
                    
                    <div id="validationResults" class="validation-results hidden">
                        <!-- Validation results will be displayed here -->
                    </div>
                </div>

                <div class="actions-bar">
                    <div></div> <!-- Spacer -->
                    <div>
                        <button type="button" id="nextBtn" class="btn btn-primary" disabled>
                            Next: Solution & Publisher
                            <i class="fas fa-arrow-right"></i>
                        </button>
                    </div>
                </div>
            </div>
        `;
        return this.createFromTemplate(template);
    }

    /**
     * Initialize the component
     */
    onInit() {
        this.setupFileUpload();
        this.setupEventListeners();
    }

    /**
     * Setup file upload component
     */
    setupFileUpload() {
        this.fileUpload = new FileUpload({
            accept: '.mmd,.txt',
            label: 'Upload Mermaid ERD File (.mmd)',
            buttonText: 'Choose File'
        });

        const container = this.find('#file-upload-container');
        if (container) {
            container.appendChild(this.fileUpload.element);
        }

        // Listen for file selection
        this.fileUpload.element.addEventListener('file-selected', (e) => {
            this.handleFileSelected(e.detail.file);
        });

        this.fileUpload.element.addEventListener('file-error', (e) => {
            this.showError(e.detail.message);
        });
    }

    /**
     * Setup event listeners
     */
    setupEventListeners() {
        const nextBtn = this.find('#nextBtn');
        if (nextBtn) {
            this.addEventListener(nextBtn, 'click', () => {
                this.emit('navigate-next', { step: 'publisher' });
            });
        }
    }

    /**
     * Handle file selection
     * @param {File} file - Selected file
     */
    async handleFileSelected(file) {
        try {
            this.setLoading(true);
            
            // Read file content
            const content = await this.readFileContent(file);
            
            // Validate with API
            const validationResult = await this.apiClient.validateERD(content);
            
            // Store validation result for later use
            this.currentValidationResult = validationResult;
            
            // Update wizard state with file content
            this.wizardState.setFileContent(content);
            
            // Check for CDM entities and show choice dialog if needed
            const cdmEntities = this.getCDMEntitiesFromResult(validationResult);
            
            if (cdmEntities.length > 0) {
                this.showCDMChoiceDialog(cdmEntities);
            } else {
                // No CDM entities, proceed directly to show validation results
                this.processFinalValidation('custom');
            }
            
            this.setLoading(false);
            
        } catch (error) {
            console.error('Validation failed:', error);
            this.showError('Failed to validate ERD file. Please check the file format and try again.');
        }
    }

    /**
     * Extract CDM entities from validation result
     * @param {Object} result - Validation result
     * @returns {Array} - Array of CDM entity names
     */
    getCDMEntitiesFromResult(result) {
        const cdmEntities = [];
        if (result.warnings) {
            result.warnings.forEach(warning => {
                if (warning.type === 'cdm_entity_detected' && warning.message) {
                    // Extract entity name from message like "Entity 'Account' matches CDM entity 'Account'"
                    const match = warning.message.match(/Entity '([^']+)' matches CDM entity/);
                    if (match && match[1]) {
                        cdmEntities.push(match[1]);
                    }
                }
            });
        }
        return cdmEntities;
    }

    /**
     * Show CDM choice dialog
     * @param {Array} cdmEntities - Array of detected CDM entity names
     */
    showCDMChoiceDialog(cdmEntities) {
        const resultsContainer = this.find('#validationResults');
        if (!resultsContainer) return;

        const entityList = cdmEntities.map(entity => `<strong>${entity}</strong>`).join(', ');
        
        resultsContainer.innerHTML = `
            <div class="message-card info cdm-choice-dialog">
                <i class="fas fa-database message-icon"></i>
                <div class="message-content">
                    <div class="message-title">CDM Entities Detected</div>
                    <div class="message-description">
                        We detected ${cdmEntities.length} Common Data Model (CDM) entities in your ERD: ${entityList}.<br><br>
                        <strong>Choose how to proceed:</strong>
                    </div>
                    <div class="cdm-choice-buttons">
                        <button id="useCDMEntities" class="cdm-choice-btn cdm-btn">
                            <i class="fas fa-database"></i>
                            Use CDM Entities
                        </button>
                        <button id="useCustomEntities" class="cdm-choice-btn custom-btn">
                            <i class="fas fa-cog"></i>
                            Use Custom Entities
                        </button>
                    </div>
                </div>
            </div>
        `;

        // Add event listeners to buttons
        const useCDMBtn = this.find('#useCDMEntities');
        const useCustomBtn = this.find('#useCustomEntities');

        if (useCDMBtn) {
            useCDMBtn.addEventListener('click', () => this.processFinalValidation('cdm'));
        }
        if (useCustomBtn) {
            useCustomBtn.addEventListener('click', () => this.processFinalValidation('custom'));
        }

        resultsContainer.classList.remove('hidden');
    }

    /**
     * Process final validation after user choice
     * @param {string} choice - 'cdm' or 'custom'
     */
    processFinalValidation(choice) {
        if (!this.currentValidationResult) return;

        // Filter warnings based on user choice
        let filteredWarnings = this.currentValidationResult.warnings || [];
        
        if (choice === 'cdm') {
            // Exclude CDM-related info messages
            filteredWarnings = filteredWarnings.filter(warning => {
                return !(warning.type === 'cdm_entity_detected' || 
                        warning.type === 'cdm_summary' ||
                        (warning.type === 'cdm_detection_failed' && warning.severity === 'info'));
            });
        }

        // Update wizard state with final validation
        this.wizardState.updateStepData('validation', {
            valid: this.currentValidationResult.validation?.isValid || false,
            entities: this.currentValidationResult.entities || [],
            relationships: this.currentValidationResult.relationships || [],
            warnings: filteredWarnings,
            cdmChoice: choice
        });

        // Create filtered result for display
        const filteredResult = {
            ...this.currentValidationResult,
            warnings: filteredWarnings
        };

        // Show final validation results
        this.displayValidationResults(filteredResult);
        
        // Enable next button if valid
        this.updateNextButton(this.currentValidationResult.validation?.isValid || false);
    }

    /**
     * Read file content as text
     * @param {File} file - File to read
     * @returns {Promise<string>} - File content
     */
    readFileContent(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result);
            reader.onerror = () => reject(new Error('Failed to read file'));
            reader.readAsText(file);
        });
    }

    /**
     * Render a single warning with enhanced formatting
     * @param {string|Object} warning - Warning message or object
     * @returns {string} - HTML for the warning
     */
    renderWarning(warning) {
        // Handle backwards compatibility with string warnings
        if (typeof warning === 'string') {
            return `
                <div class="message-card warning">
                    <i class="fas fa-exclamation-triangle message-icon"></i>
                    <div class="message-content">
                        <div class="message-title">Warning</div>
                        <div class="message-description">${warning}</div>
                    </div>
                </div>
            `;
        }

        // Handle structured warning objects
        const severity = warning.severity || 'warning';
        const type = warning.type || 'general';
        const message = warning.message || 'Unknown warning';
        const category = warning.category || '';

        // Get appropriate icon and styling based on severity
        const severityConfig = {
            'error': { icon: 'fas fa-times-circle', class: 'error' },
            'warning': { icon: 'fas fa-exclamation-triangle', class: 'warning' },
            'info': { icon: 'fas fa-info-circle', class: 'info' },
            'success': { icon: 'fas fa-check-circle', class: 'success' }
        };

        const config = severityConfig[severity] || severityConfig['warning'];

        // Build warning HTML with enhanced information
        let warningHtml = `
            <div class="message-card ${config.class}">
                <i class="${config.icon} message-icon"></i>
                <div class="message-content">
                    <div class="message-title">${this.getWarningTitle(type, severity)}</div>
                    <div class="message-description">${message}</div>
        `;

        // Add category badge if available
        if (category) {
            warningHtml += `
                    <div class="warning-category">
                        <span class="category-badge category-${category}">${category.toUpperCase()}</span>
                    </div>
            `;
        }

        warningHtml += `
                </div>
            </div>
        `;

        return warningHtml;
    }

    /**
     * Get appropriate title for warning type
     * @param {string} type - Warning type
     * @param {string} severity - Warning severity
     * @returns {string} - Formatted title
     */
    getWarningTitle(type, severity) {
        const typeMap = {
            'cdm_entity_detected': 'CDM Entity Detected',
            'cdm_summary': 'CDM Analysis Summary',
            'missing_primary_key': 'Missing Primary Key',
            'naming_conflict': 'Naming Conflict',
            'status_column_ignored': 'Status Column Information',
            'foreign_key_naming': 'Foreign Key Convention',
            'cdm_detection_failed': 'CDM Detection Unavailable'
        };

        const title = typeMap[type] || severity.charAt(0).toUpperCase() + severity.slice(1);
        return title;
    }

    /**
     * Display validation results
     * @param {Object} result - Validation result
     */
    displayValidationResults(result) {
        const resultsContainer = this.find('#validationResults');
        const statusIndicator = this.find('#erdStatusIndicator');
        
        if (!resultsContainer) return;

        const isValid = result.validation?.isValid || false;

        if (isValid) {
            // Show success indicator
            if (statusIndicator) {
                statusIndicator.classList.remove('hidden');
            }

            // Show validation summary
            resultsContainer.innerHTML = `
                <div class="message-card success">
                    <i class="fas fa-check-circle message-icon"></i>
                    <div class="message-content">
                        <div class="message-title">ERD Validation Successful</div>
                        <div class="message-description">
                            Found ${result.entities.length} entities and ${result.relationships.length} relationships.
                        </div>
                    </div>
                </div>
            `;
        } else {
            // Show error messages
            const errors = result.validation?.errors || result.errors || ['Please check your ERD file format and try again.'];
            const errorMessage = Array.isArray(errors) ? errors.join(', ') : errors;
            
            resultsContainer.innerHTML = `
                <div class="message-card error">
                    <i class="fas fa-exclamation-triangle message-icon"></i>
                    <div class="message-content">
                        <div class="message-title">ERD Validation Failed</div>
                        <div class="message-description">
                            ${errorMessage}
                        </div>
                    </div>
                </div>
            `;
        }

        // Show warnings if any
        if (result.warnings && result.warnings.length > 0) {
            const warningsHtml = result.warnings.map(warning => this.renderWarning(warning)).join('');
            resultsContainer.innerHTML += warningsHtml;
        }

        resultsContainer.classList.remove('hidden');
    }

    /**
     * Update next button state
     * @param {boolean} enabled - Whether to enable the button
     */
    updateNextButton(enabled) {
        const nextBtn = this.find('#nextBtn');
        if (nextBtn) {
            nextBtn.disabled = !enabled;
        }
    }

    /**
     * Set loading state
     * @param {boolean} loading - Loading state
     */
    setLoading(loading) {
        if (this.fileUpload) {
            this.fileUpload.setLoading(loading);
        }
    }

    /**
     * Show error message
     * @param {string} message - Error message
     */
    showError(message) {
        const resultsContainer = this.find('#validationResults');
        if (resultsContainer) {
            resultsContainer.innerHTML = `
                <div class="message-card error">
                    <i class="fas fa-exclamation-triangle message-icon"></i>
                    <div class="message-content">
                        <div class="message-title">Error</div>
                        <div class="message-description">${message}</div>
                    </div>
                </div>
            `;
            resultsContainer.classList.remove('hidden');
        }
    }

    /**
     * Render the component
     */
    render() {
        // Update button state based on wizard state
        const validationData = this.wizardState.getStepData('validation');
        this.updateNextButton(validationData.valid);
    }
}
