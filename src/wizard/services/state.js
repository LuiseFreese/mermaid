/**
 * State Management Service - Single source of truth for wizard state
 * Extracted from wizard-ui.html to centralize state management
 */
class StateService {
    constructor() {
        this.reset();
    }

    /**
     * Reset all state to initial values
     */
    reset() {
        this.state = {
            // Current wizard step
            currentStep: 'validation',
            
            // File handling
            uploadedFile: null,
            currentERDContent: null,
            isUsingCorrectedERD: false,
            
            // Validation results
            validation: {
                valid: false,
                entities: [],
                relationships: [],
                warnings: [],
                validation: null
            },
            
            // Publisher data
            publishers: [],
            
            // Global choices
            globalChoices: [],
            selectedChoices: [],
            customChoices: [],
            
            // CDM handling
            cdmChoice: null, // 'cdm' or 'custom'
            cdmMatches: [],
            
            // Solution configuration
            solution: {
                displayName: '',
                name: '',
                publisher: null,
                createPublisher: false,
                publisherName: '',
                publisherUniqueName: '',
                publisherPrefix: ''
            },
            
            // Deployment
            isDeploying: false,
            deploymentResult: null
        };
        
        this.listeners = new Map();
    }

    /**
     * Get current state
     * @returns {Object} Current state
     */
    getState() {
        return { ...this.state };
    }

    /**
     * Get specific state property
     * @param {string} key - State property key
     * @returns {*} State property value
     */
    get(key) {
        return this.state[key];
    }

    /**
     * Set state property and notify listeners
     * @param {string} key - State property key
     * @param {*} value - New value
     */
    set(key, value) {
        const oldValue = this.state[key];
        this.state[key] = value;
        this.notifyListeners(key, value, oldValue);
    }

    /**
     * Update state properties and notify listeners
     * @param {Object} updates - Object with state updates
     */
    update(updates) {
        const changes = [];
        
        for (const [key, value] of Object.entries(updates)) {
            const oldValue = this.state[key];
            this.state[key] = value;
            changes.push({ key, value, oldValue });
        }
        
        // Notify all listeners for changed properties
        changes.forEach(({ key, value, oldValue }) => {
            this.notifyListeners(key, value, oldValue);
        });
    }

    /**
     * Subscribe to state changes
     * @param {string} key - State property to watch
     * @param {Function} callback - Called when property changes
     * @returns {Function} Unsubscribe function
     */
    subscribe(key, callback) {
        if (!this.listeners.has(key)) {
            this.listeners.set(key, new Set());
        }
        
        this.listeners.get(key).add(callback);
        
        // Return unsubscribe function
        return () => {
            const keyListeners = this.listeners.get(key);
            if (keyListeners) {
                keyListeners.delete(callback);
                if (keyListeners.size === 0) {
                    this.listeners.delete(key);
                }
            }
        };
    }

    /**
     * Notify listeners of state changes
     * @param {string} key - Changed property key
     * @param {*} newValue - New value
     * @param {*} oldValue - Previous value
     */
    notifyListeners(key, newValue, oldValue) {
        const keyListeners = this.listeners.get(key);
        if (keyListeners && keyListeners.size > 0) {
            keyListeners.forEach(callback => {
                try {
                    callback(newValue, oldValue, key);
                } catch (error) {
                    console.error(`Error in state listener for ${key}:`, error);
                }
            });
        }
    }

    /**
     * Check if can proceed to a specific step
     * @param {string} step - Target step name
     * @returns {boolean} Whether can proceed to step
     */
    canProceedToStep(step) {
        switch (step) {
            case 'validation':
                return true;
                
            case 'publisher':
                return this.state.validation.valid;
                
            case 'choices':
                return this.state.validation.valid && 
                       this.state.solution.displayName && 
                       this.state.solution.name;
                       
            case 'review':
                return this.state.validation.valid && 
                       this.state.solution.displayName && 
                       this.state.solution.name &&
                       (this.state.solution.publisher || this.state.solution.createPublisher);
                       
            default:
                return false;
        }
    }

    /**
     * Get step data for a specific step
     * @param {string} step - Step name
     * @returns {Object} Step data
     */
    getStepData(step) {
        switch (step) {
            case 'validation':
                return {
                    valid: this.state.validation.valid,
                    entities: this.state.validation.entities,
                    relationships: this.state.validation.relationships,
                    warnings: this.state.validation.warnings,
                    validation: this.state.validation.validation
                };
                
            case 'publisher':
                return {
                    solution: this.state.solution,
                    publishers: this.state.publishers
                };
                
            case 'choices':
                return {
                    globalChoices: this.state.globalChoices,
                    selectedChoices: this.state.selectedChoices,
                    customChoices: this.state.customChoices
                };
                
            case 'review':
                return {
                    validation: this.state.validation,
                    solution: this.state.solution,
                    choices: {
                        selected: this.state.selectedChoices,
                        custom: this.state.customChoices
                    },
                    cdm: {
                        choice: this.state.cdmChoice,
                        matches: this.state.cdmMatches
                    }
                };
                
            default:
                return {};
        }
    }

    /**
     * Set file content and related state
     * @param {File} file - Uploaded file
     * @param {string} content - File content
     * @param {boolean} isCorrected - Whether this is corrected content
     */
    setFileContent(file, content, isCorrected = false) {
        this.update({
            uploadedFile: file,
            currentERDContent: content,
            isUsingCorrectedERD: isCorrected
        });
    }

    /**
     * Set validation results
     * @param {Object} validationResult - Validation result from API
     */
    setValidationResults(validationResult) {
        this.set('validation', {
            valid: validationResult.validation?.isValid || false,
            entities: validationResult.entities || [],
            relationships: validationResult.relationships || [],
            warnings: validationResult.warnings || [],
            validation: validationResult.validation || null
        });
        
        // Set CDM matches if available
        if (validationResult.cdmDetection?.matches) {
            this.set('cdmMatches', validationResult.cdmDetection.matches);
        }
    }

    /**
     * Set solution configuration
     * @param {Object} solutionConfig - Solution configuration
     */
    setSolutionConfig(solutionConfig) {
        this.update({
            solution: { ...this.state.solution, ...solutionConfig }
        });
    }

    /**
     * Set deployment state
     * @param {boolean} isDeploying - Whether deployment is in progress
     * @param {Object} result - Deployment result (optional)
     */
    setDeploymentState(isDeploying, result = null) {
        this.update({
            isDeploying,
            deploymentResult: result
        });
    }

    /**
     * Debug: Log current state
     */
    debug() {
        console.log('Current Wizard State:', this.getState());
    }
}

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { StateService };
}

// Make available globally for backward compatibility
window.StateService = StateService;
