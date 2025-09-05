/**
 * Main Wizard Controller - Orchestrates the entire wizard workflow
 * Coordinates between State, API, and UI services
 * Extracted from wizard-ui.html to centralize application logic
 */

// Import required services and components
// Note: In a module system, these would be proper imports
// For now, ensure these are loaded before this controller

class WizardController {
    constructor() {
        // Check for required dependencies
        if (typeof StateService === 'undefined') {
            throw new Error('StateService is required but not loaded');
        }
        if (typeof APIService === 'undefined') {
            throw new Error('APIService is required but not loaded');
        }
        if (typeof UIComponentManager === 'undefined') {
            throw new Error('UIComponentManager is required but not loaded');
        }

        this.stateService = new StateService();
        this.apiService = new APIService();
        this.uiManager = new UIComponentManager(this.stateService);
        
        this.setupStateSubscriptions();
        this.initialize();
    }

    /**
     * Initialize the wizard
     */
    async initialize() {
        try {
            console.log('Initializing Dataverse ERD Wizard...');
            
            // Initialize UI
            this.uiManager.initialize();
            
            // Load initial data
            await this.loadInitialData();
            
            // Show initial step
            this.uiManager.showStep('validation');
            
            console.log('Wizard initialized successfully');
        } catch (error) {
            console.error('Failed to initialize wizard:', error);
            this.uiManager.showError('Failed to initialize wizard: ' + error.message);
        }
    }

    /**
     * Setup subscriptions to state changes
     */
    setupStateSubscriptions() {
        // Subscribe to validation state changes
        this.stateService.subscribe('validation', (validation) => {
            this.uiManager.updateValidationDisplay(validation);
            
            if (validation.valid) {
                this.uiManager.showSuccess('ERD validation successful!');
                this.enableStep('publisher');
            }
        });

        // Subscribe to current step changes
        this.stateService.subscribe('currentStep', (newStep) => {
            this.onStepChange(newStep);
        });

        // Subscribe to file content changes
        this.stateService.subscribe('currentERDContent', (content) => {
            if (content) {
                this.handleERDContentChange(content);
            }
        });

        // Subscribe to deployment state changes
        this.stateService.subscribe('isDeploying', (isDeploying) => {
            if (isDeploying) {
                this.uiManager.showProgress('Deploying solution...');
            } else {
                this.uiManager.hideProgress();
            }
        });
    }

    /**
     * Load initial data (publishers, choices, etc.)
     */
    async loadInitialData() {
        try {
            // Load publishers
            const publishers = await this.apiService.getPublishers();
            this.stateService.set('publishers', publishers);
            this.uiManager.updatePublishersDropdown(publishers);

            // Load global choices
            const globalChoices = await this.apiService.getGlobalChoices();
            this.stateService.set('globalChoices', globalChoices);
            this.uiManager.updateGlobalChoicesDisplay(globalChoices);

        } catch (error) {
            console.warn('Failed to load initial data:', error);
            // Continue without initial data - user can still use wizard
        }
    }

    /**
     * Handle ERD content changes (validation)
     */
    async handleERDContentChange(content) {
        if (!content) return;

        try {
            this.uiManager.showProgress('Validating ERD...');
            
            const validationResult = await this.apiService.validateERD(content);
            this.stateService.setValidationResults(validationResult);
            
            this.uiManager.hideProgress();
            
        } catch (error) {
            this.uiManager.hideProgress();
            this.uiManager.showError('Validation failed: ' + error.message);
        }
    }

    /**
     * Handle step changes
     * @param {string} newStep - New step name
     */
    async onStepChange(newStep) {
        console.log(`Wizard step changed to: ${newStep}`);
        
        switch (newStep) {
            case 'publisher':
                await this.onPublisherStep();
                break;
            case 'choices':
                await this.onChoicesStep();
                break;
            case 'review':
                await this.onReviewStep();
                break;
        }
    }

    /**
     * Handle publisher step activation
     */
    async onPublisherStep() {
        // Ensure publishers are loaded
        if (this.stateService.get('publishers').length === 0) {
            try {
                const publishers = await this.apiService.getPublishers();
                this.stateService.set('publishers', publishers);
                this.uiManager.updatePublishersDropdown(publishers);
            } catch (error) {
                console.warn('Failed to load publishers:', error);
            }
        }
    }

    /**
     * Handle choices step activation
     */
    async onChoicesStep() {
        // Ensure global choices are loaded
        if (this.stateService.get('globalChoices').length === 0) {
            try {
                const globalChoices = await this.apiService.getGlobalChoices();
                this.stateService.set('globalChoices', globalChoices);
                this.uiManager.updateGlobalChoicesDisplay(globalChoices);
            } catch (error) {
                console.warn('Failed to load global choices:', error);
            }
        }
    }

    /**
     * Handle review step activation
     */
    async onReviewStep() {
        // Update review display with current state
        this.updateReviewDisplay();
    }

    /**
     * Update review step display
     */
    updateReviewDisplay() {
        const reviewContainer = document.getElementById('reviewContainer');
        if (!reviewContainer) return;

        const stepData = this.stateService.getStepData('review');
        
        reviewContainer.innerHTML = `
            <div class="review-section">
                <h3>📋 Review Your Configuration</h3>
                
                <div class="review-item">
                    <h4>ERD Validation</h4>
                    <p>✅ ${stepData.validation.entities.length} entities, ${stepData.validation.relationships.length} relationships</p>
                </div>
                
                <div class="review-item">
                    <h4>Solution Configuration</h4>
                    <p><strong>Display Name:</strong> ${stepData.solution.displayName}</p>
                    <p><strong>Unique Name:</strong> ${stepData.solution.name}</p>
                    <p><strong>Publisher:</strong> ${stepData.solution.createPublisher ? 
                        `${stepData.solution.publisherName} (New)` : 
                        'Existing Publisher'}</p>
                </div>
                
                <div class="review-item">
                    <h4>Global Choices</h4>
                    <p>${stepData.choices.selected.length} global choices selected</p>
                    ${stepData.choices.custom.length > 0 ? 
                        `<p>${stepData.choices.custom.length} custom choices defined</p>` : ''}
                </div>
                
                ${stepData.cdm.choice ? `
                    <div class="review-item">
                        <h4>CDM Integration</h4>
                        <p>Mode: ${stepData.cdm.choice}</p>
                        ${stepData.cdm.matches.length > 0 ? 
                            `<p>${stepData.cdm.matches.length} CDM matches found</p>` : ''}
                    </div>
                ` : ''}
            </div>
            
            <div class="review-actions">
                <button type="button" class="btn btn-primary" onclick="wizardController.startDeployment()">
                    🚀 Deploy Solution
                </button>
            </div>
        `;
    }

    /**
     * Start solution deployment
     */
    async startDeployment() {
        try {
            const stepData = this.stateService.getStepData('review');
            
            this.stateService.setDeploymentState(true);
            
            // Prepare deployment payload
            const deploymentConfig = {
                erdContent: this.stateService.get('currentERDContent'),
                solution: stepData.solution,
                choices: stepData.choices,
                cdm: stepData.cdm
            };
            
            // Start deployment with streaming
            const deploymentId = await this.apiService.deploySolution(deploymentConfig);
            
            // Start polling for deployment status
            await this.pollDeploymentStatus(deploymentId);
            
        } catch (error) {
            this.stateService.setDeploymentState(false);
            this.uiManager.showError('Deployment failed: ' + error.message);
        }
    }

    /**
     * Poll deployment status
     * @param {string} deploymentId - Deployment ID to track
     */
    async pollDeploymentStatus(deploymentId) {
        try {
            await this.apiService.pollDeploymentStatus(deploymentId, (status) => {
                // Update progress message
                this.uiManager.showProgress(`Deploying: ${status.message || 'In progress...'}`);
            });
            
            // Deployment completed
            this.stateService.setDeploymentState(false, { success: true });
            this.uiManager.showSuccess('Solution deployed successfully!');
            
        } catch (error) {
            this.stateService.setDeploymentState(false, { success: false, error: error.message });
            this.uiManager.showError('Deployment failed: ' + error.message);
        }
    }

    /**
     * Enable a wizard step
     * @param {string} stepName - Step to enable
     */
    enableStep(stepName) {
        const stepButton = document.querySelector(`[data-step="${stepName}"]`);
        if (stepButton) {
            stepButton.disabled = false;
            stepButton.classList.remove('disabled');
        }
    }

    /**
     * Go to a specific step (if allowed)
     * @param {string} stepName - Target step
     */
    goToStep(stepName) {
        if (this.stateService.canProceedToStep(stepName)) {
            this.uiManager.showStep(stepName);
        } else {
            this.uiManager.showError('Please complete the current step before proceeding.');
        }
    }

    /**
     * Reset the wizard to initial state
     */
    reset() {
        this.stateService.reset();
        this.uiManager.showStep('validation');
        this.uiManager.hideProgress();
    }

    /**
     * Get current wizard state (for debugging)
     * @returns {Object} Current state
     */
    getState() {
        return this.stateService.getState();
    }

    /**
     * Debug: Log current state
     */
    debug() {
        this.stateService.debug();
    }
}

// Auto-initialize when DOM is ready and dependencies are loaded
document.addEventListener('DOMContentLoaded', () => {
    // Check if all dependencies are available
    const checkDependencies = () => {
        return typeof StateService !== 'undefined' && 
               typeof APIService !== 'undefined' && 
               typeof UIComponentManager !== 'undefined';
    };

    if (checkDependencies()) {
        window.wizardController = new WizardController();
    } else {
        console.warn('Wizard dependencies not loaded. Please ensure all modules are loaded before initializing.');
    }
});

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { WizardController };
}

// Make available globally for backward compatibility
window.WizardController = WizardController;
