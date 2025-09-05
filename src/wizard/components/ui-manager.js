/**
 * UI Component Manager - Handles DOM manipulation and component lifecycle
 * Extracted from wizard-ui.html to centralize UI management
 */
class UIComponentManager {
    constructor(stateService) {
        this.state = stateService;
        this.components = new Map();
        this.initialized = false;
    }

    /**
     * Initialize the UI component manager
     */
    initialize() {
        if (this.initialized) return;
        
        this.setupEventListeners();
        this.initialized = true;
    }

    /**
     * Setup global event listeners
     */
    setupEventListeners() {
        // File upload handling
        const fileInput = document.getElementById('erdFile');
        if (fileInput) {
            fileInput.addEventListener('change', this.handleFileUpload.bind(this));
        }

        // Step navigation
        document.querySelectorAll('.step-button').forEach(button => {
            button.addEventListener('click', this.handleStepNavigation.bind(this));
        });

        // Form submissions
        document.querySelectorAll('form').forEach(form => {
            form.addEventListener('submit', this.handleFormSubmission.bind(this));
        });
    }

    /**
     * Handle file upload
     * @param {Event} event - File input change event
     */
    async handleFileUpload(event) {
        const file = event.target.files[0];
        if (!file) return;

        try {
            this.showProgress('Reading file...');
            const content = await this.readFileContent(file);
            
            this.state.setFileContent(file, content);
            this.hideProgress();
            
            // Auto-trigger validation
            await this.triggerValidation();
            
        } catch (error) {
            this.hideProgress();
            this.showError('Failed to read file: ' + error.message);
        }
    }

    /**
     * Read file content as text
     * @param {File} file - File to read
     * @returns {Promise<string>} File content
     */
    readFileContent(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = e => resolve(e.target.result);
            reader.onerror = () => reject(new Error('Failed to read file'));
            reader.readAsText(file);
        });
    }

    /**
     * Handle step navigation
     * @param {Event} event - Button click event
     */
    handleStepNavigation(event) {
        const targetStep = event.target.dataset.step;
        if (!targetStep) return;

        if (this.state.canProceedToStep(targetStep)) {
            this.showStep(targetStep);
        } else {
            this.showError('Please complete the current step before proceeding.');
        }
    }

    /**
     * Handle form submissions
     * @param {Event} event - Form submit event
     */
    async handleFormSubmission(event) {
        event.preventDefault();
        
        const form = event.target;
        const formData = new FormData(form);
        const formType = form.dataset.formType;

        try {
            switch (formType) {
                case 'publisher':
                    await this.handlePublisherForm(formData);
                    break;
                case 'choices':
                    await this.handleChoicesForm(formData);
                    break;
                default:
                    console.warn('Unknown form type:', formType);
            }
        } catch (error) {
            this.showError('Form submission failed: ' + error.message);
        }
    }

    /**
     * Handle publisher form submission
     * @param {FormData} formData - Form data
     */
    async handlePublisherForm(formData) {
        const solutionConfig = {
            displayName: formData.get('solutionDisplayName'),
            name: formData.get('solutionName'),
            createPublisher: formData.get('createPublisher') === 'true',
            publisher: formData.get('publisherId') || null,
            publisherName: formData.get('publisherName') || '',
            publisherUniqueName: formData.get('publisherUniqueName') || '',
            publisherPrefix: formData.get('publisherPrefix') || ''
        };

        this.state.setSolutionConfig(solutionConfig);
        
        if (this.state.canProceedToStep('choices')) {
            this.showStep('choices');
        }
    }

    /**
     * Handle choices form submission
     * @param {FormData} formData - Form data
     */
    async handleChoicesForm(formData) {
        const selectedChoices = [];
        const customChoices = [];

        // Collect selected global choices
        formData.getAll('selectedChoices').forEach(choiceId => {
            selectedChoices.push(choiceId);
        });

        // Collect custom choices (if any)
        // This would need to be implemented based on the specific UI structure

        this.state.update({
            selectedChoices,
            customChoices
        });

        if (this.state.canProceedToStep('review')) {
            this.showStep('review');
        }
    }

    /**
     * Show a specific wizard step
     * @param {string} stepName - Name of step to show
     */
    showStep(stepName) {
        // Hide all steps
        document.querySelectorAll('.wizard-step').forEach(step => {
            step.style.display = 'none';
        });

        // Show target step
        const targetStep = document.getElementById(`step-${stepName}`);
        if (targetStep) {
            targetStep.style.display = 'block';
            this.state.set('currentStep', stepName);
            this.updateStepProgress(stepName);
        }
    }

    /**
     * Update step progress indicator
     * @param {string} currentStep - Current active step
     */
    updateStepProgress(currentStep) {
        const steps = ['validation', 'publisher', 'choices', 'review'];
        const currentIndex = steps.indexOf(currentStep);

        steps.forEach((step, index) => {
            const stepElement = document.querySelector(`[data-step="${step}"]`);
            if (stepElement) {
                stepElement.classList.toggle('completed', index < currentIndex);
                stepElement.classList.toggle('active', index === currentIndex);
            }
        });
    }

    /**
     * Show progress indicator
     * @param {string} message - Progress message
     */
    showProgress(message = 'Processing...') {
        let progress = document.getElementById('globalProgress');
        if (!progress) {
            progress = document.createElement('div');
            progress.id = 'globalProgress';
            progress.className = 'progress-overlay';
            progress.innerHTML = `
                <div class="progress-content">
                    <div class="spinner"></div>
                    <div class="progress-message">${message}</div>
                </div>
            `;
            document.body.appendChild(progress);
        } else {
            progress.querySelector('.progress-message').textContent = message;
        }
        progress.style.display = 'flex';
    }

    /**
     * Hide progress indicator
     */
    hideProgress() {
        const progress = document.getElementById('globalProgress');
        if (progress) {
            progress.style.display = 'none';
        }
    }

    /**
     * Show error message
     * @param {string} message - Error message
     */
    showError(message) {
        let errorDiv = document.getElementById('globalError');
        if (!errorDiv) {
            errorDiv = document.createElement('div');
            errorDiv.id = 'globalError';
            errorDiv.className = 'error-message';
            document.body.appendChild(errorDiv);
        }
        
        errorDiv.textContent = message;
        errorDiv.style.display = 'block';
        
        // Auto-hide after 5 seconds
        setTimeout(() => {
            errorDiv.style.display = 'none';
        }, 5000);
    }

    /**
     * Show success message
     * @param {string} message - Success message
     */
    showSuccess(message) {
        let successDiv = document.getElementById('globalSuccess');
        if (!successDiv) {
            successDiv = document.createElement('div');
            successDiv.id = 'globalSuccess';
            successDiv.className = 'success-message';
            document.body.appendChild(successDiv);
        }
        
        successDiv.textContent = message;
        successDiv.style.display = 'block';
        
        // Auto-hide after 3 seconds
        setTimeout(() => {
            successDiv.style.display = 'none';
        }, 3000);
    }

    /**
     * Update validation results display
     * @param {Object} validation - Validation results
     */
    updateValidationDisplay(validation) {
        const validationDiv = document.getElementById('validationResults');
        if (!validationDiv) return;

        if (validation.valid) {
            validationDiv.innerHTML = `
                <div class="validation-success">
                    <h3>✅ ERD Validation Successful</h3>
                    <p>Found ${validation.entities.length} entities and ${validation.relationships.length} relationships.</p>
                    ${validation.warnings.length > 0 ? `
                        <div class="warnings">
                            <h4>⚠️ Warnings:</h4>
                            <ul>
                                ${validation.warnings.map(w => `<li>${w}</li>`).join('')}
                            </ul>
                        </div>
                    ` : ''}
                </div>
            `;
        } else {
            validationDiv.innerHTML = `
                <div class="validation-error">
                    <h3>❌ ERD Validation Failed</h3>
                    ${validation.validation?.errors ? `
                        <ul>
                            ${validation.validation.errors.map(e => `<li>${e}</li>`).join('')}
                        </ul>
                    ` : ''}
                </div>
            `;
        }
    }

    /**
     * Update publishers dropdown
     * @param {Array} publishers - Available publishers
     */
    updatePublishersDropdown(publishers) {
        const select = document.getElementById('publisherSelect');
        if (!select) return;

        select.innerHTML = '<option value="">Select a publisher...</option>';
        publishers.forEach(pub => {
            const option = document.createElement('option');
            option.value = pub.publisherid;
            option.textContent = `${pub.friendlyname} (${pub.uniquename})`;
            select.appendChild(option);
        });
    }

    /**
     * Update global choices display
     * @param {Array} choices - Available global choices
     */
    updateGlobalChoicesDisplay(choices) {
        const container = document.getElementById('globalChoicesContainer');
        if (!container) return;

        container.innerHTML = choices.map(choice => `
            <div class="choice-item">
                <input type="checkbox" id="choice-${choice.id}" name="selectedChoices" value="${choice.id}">
                <label for="choice-${choice.id}">
                    <strong>${choice.displayName}</strong>
                    <div class="choice-options">
                        ${choice.options.map(opt => `<span class="option-tag">${opt.label}</span>`).join('')}
                    </div>
                </label>
            </div>
        `).join('');
    }

    /**
     * Trigger validation (would connect to API service)
     */
    async triggerValidation() {
        // This would be implemented to connect with the API service
        // For now, just show progress
        this.showProgress('Validating ERD...');
        
        // The actual validation would be handled by the main controller
        // that coordinates between UI, State, and API services
    }
}

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { UIComponentManager };
}

// Make available globally for backward compatibility
window.UIComponentManager = UIComponentManager;
