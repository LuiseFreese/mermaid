/**
 * Wizard State Management
 * Manages the state and navigation flow of the wizard
 */
export class WizardState {
    constructor() {
        this.currentStep = 'validation';
        this.steps = ['validation', 'publisher', 'choices', 'summary'];
        this.stepData = {
            validation: { valid: false, entities: [], relationships: [], warnings: [] },
            publisher: { type: 'existing', selectedPublisher: null, newPublisher: {} },
            cdm: { detectedEntities: [], selectedEntities: [] },
            choices: { existingChoices: [], selectedChoices: [], customChoices: null },
            summary: { ready: false }
        };
        this.fileContent = null;
        this.cdmChoice = null; // 'cdm' or 'custom'
        this.cdmMatches = null; // Array of CDM matches
        this.listeners = new Map();
    }

    /**
     * Reset the wizard to its initial state
     */
    reset() {
        this.currentStep = 'validation';
        this.stepData = {
            validation: { valid: false, entities: [], relationships: [], warnings: [] },
            publisher: { type: 'existing', selectedPublisher: null, newPublisher: {} },
            cdm: { detectedEntities: [], selectedEntities: [] },
            choices: { existingChoices: [], selectedChoices: [], customChoices: null },
            summary: { ready: false }
        };
        this.fileContent = null;
        this.cdmChoice = null;
        this.cdmMatches = null;
        this.emit('state-reset');
    }

    /**
     * Get current step index
     * @returns {number} - Current step index
     */
    getCurrentStepIndex() {
        return this.steps.indexOf(this.currentStep);
    }

    /**
     * Check if user can proceed to a specific step
     * @param {string} step - Step to check
     * @returns {boolean} - True if can proceed
     */
    canProceedToStep(step) {
        switch(step) {
            case 'validation':
                return true;
            case 'publisher':
                return this.stepData.validation.valid;
            case 'choices':
                return this.stepData.validation.valid && this.isPublisherStepComplete();
            case 'summary':
                return this.stepData.validation.valid && this.isPublisherStepComplete();
            default:
                return false;
        }
    }

    /**
     * Check if publisher step is complete
     * @returns {boolean} - True if complete
     */
    isPublisherStepComplete() {
        if (this.stepData.publisher.type === 'existing') {
            return !!(this.stepData.publisher.selectedPublisher && 
                     this.getFormFieldValue('solutionDisplayName'));
        } else {
            // For new publisher, check that all required fields are filled
            return !!(this.getFormFieldValue('publisherName') &&
                     this.getFormFieldValue('publisherUniqueName') &&
                     this.getFormFieldValue('publisherPrefix') &&
                     this.getFormFieldValue('solutionDisplayName'));
        }
    }

    /**
     * Helper to get form field value
     * @param {string} fieldId - Field ID
     * @returns {string} - Field value or empty string
     */
    getFormFieldValue(fieldId) {
        const field = document.getElementById(fieldId);
        return field ? field.value.trim() : '';
    }

    /**
     * Set current step
     * @param {string} step - Step to set as current
     */
    setCurrentStep(step) {
        if (this.steps.includes(step)) {
            const previousStep = this.currentStep;
            this.currentStep = step;
            this.emit('step-changed', { previousStep, currentStep: step });
        }
    }

    /**
     * Update step data
     * @param {string} step - Step name
     * @param {Object} data - Data to update
     */
    updateStepData(step, data) {
        if (this.stepData[step]) {
            this.stepData[step] = { ...this.stepData[step], ...data };
            this.emit('step-data-updated', { step, data: this.stepData[step] });
        }
    }

    /**
     * Get step data
     * @param {string} step - Step name
     * @returns {Object} - Step data
     */
    getStepData(step) {
        return this.stepData[step] || {};
    }

    /**
     * Set file content
     * @param {string} content - File content
     */
    setFileContent(content) {
        this.fileContent = content;
        this.emit('file-content-changed', { content });
    }

    /**
     * Get file content
     * @returns {string|null} - File content or null
     */
    getFileContent() {
        return this.fileContent;
    }

    /**
     * Update progress (0-100)
     * @returns {number} - Progress percentage
     */
    getProgress() {
        return ((this.getCurrentStepIndex() + 1) / this.steps.length) * 100;
    }

    /**
     * Add event listener
     * @param {string} event - Event name
     * @param {Function} listener - Event listener
     */
    on(event, listener) {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, []);
        }
        this.listeners.get(event).push(listener);
    }

    /**
     * Remove event listener
     * @param {string} event - Event name
     * @param {Function} listener - Event listener
     */
    off(event, listener) {
        const eventListeners = this.listeners.get(event);
        if (eventListeners) {
            const index = eventListeners.indexOf(listener);
            if (index > -1) {
                eventListeners.splice(index, 1);
            }
        }
    }

    /**
     * Emit event
     * @param {string} event - Event name
     * @param {*} data - Event data
     */
    emit(event, data = null) {
        const eventListeners = this.listeners.get(event);
        if (eventListeners) {
            eventListeners.forEach(listener => {
                try {
                    listener(data);
                } catch (error) {
                    console.error(`Error in event listener for ${event}:`, error);
                }
            });
        }
    }

    /**
     * Get next step
     * @returns {string|null} - Next step or null if at end
     */
    getNextStep() {
        const currentIndex = this.getCurrentStepIndex();
        return currentIndex < this.steps.length - 1 ? this.steps[currentIndex + 1] : null;
    }

    /**
     * Get previous step
     * @returns {string|null} - Previous step or null if at beginning
     */
    getPreviousStep() {
        const currentIndex = this.getCurrentStepIndex();
        return currentIndex > 0 ? this.steps[currentIndex - 1] : null;
    }

    /**
     * Check if current step is first
     * @returns {boolean} - True if first step
     */
    isFirstStep() {
        return this.getCurrentStepIndex() === 0;
    }

    /**
     * Check if current step is last
     * @returns {boolean} - True if last step
     */
    isLastStep() {
        return this.getCurrentStepIndex() === this.steps.length - 1;
    }

    /**
     * Get wizard state as JSON
     * @returns {Object} - Complete wizard state
     */
    toJSON() {
        return {
            currentStep: this.currentStep,
            steps: this.steps,
            stepData: this.stepData,
            fileContent: this.fileContent,
            cdmChoice: this.cdmChoice,
            cdmMatches: this.cdmMatches
        };
    }

    /**
     * Load wizard state from JSON
     * @param {Object} state - State object
     */
    fromJSON(state) {
        if (state) {
            this.currentStep = state.currentStep || 'validation';
            this.steps = state.steps || this.steps;
            this.stepData = state.stepData || this.stepData;
            this.fileContent = state.fileContent || null;
            this.cdmChoice = state.cdmChoice || null;
            this.cdmMatches = state.cdmMatches || null;
            this.emit('state-loaded', state);
        }
    }
}
