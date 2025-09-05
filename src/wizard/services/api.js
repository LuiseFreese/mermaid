/**
 * API Service - Handles all HTTP requests to the backend
 * Extracted from wizard-ui.html to improve maintainability
 */
class ApiService {
    constructor() {
        this.baseUrl = window.location.origin;
    }

    /**
     * Validate a Mermaid ERD
     * @param {string} mermaidContent - The Mermaid ERD content
     * @returns {Promise<Object>} Validation result
     */
    async validateERD(mermaidContent) {
        const response = await fetch('/api/validate-erd', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ mermaidContent })
        });

        if (!response.ok) {
            throw new Error(`Validation failed: ${response.statusText}`);
        }

        return await response.json();
    }

    /**
     * Get list of publishers from Dataverse
     * @returns {Promise<Object>} Publishers list
     */
    async getPublishers() {
        const response = await fetch('/api/publishers');
        
        if (!response.ok) {
            throw new Error(`Failed to fetch publishers: ${response.statusText}`);
        }

        return await response.json();
    }

    /**
     * Get list of global choices from Dataverse
     * @returns {Promise<Object>} Global choices list
     */
    async getGlobalChoices() {
        const response = await fetch('/api/global-choices-list');
        
        if (!response.ok) {
            throw new Error(`Failed to fetch global choices: ${response.statusText}`);
        }

        return await response.json();
    }

    /**
     * Deploy the ERD to Dataverse with streaming progress
     * @param {Object} deploymentData - The deployment configuration
     * @param {Function} progressCallback - Called with progress updates
     * @returns {Promise<Object>} Deployment result
     */
    async deployERD(deploymentData, progressCallback = null) {
        const response = await fetch('/upload', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(deploymentData)
        });

        if (!response.ok) {
            throw new Error(`Deployment failed: ${response.statusText}`);
        }

        // Handle streaming response
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let result = null;

        try {
            let reading = true;
            while (reading) {
                const { done, value } = await reader.read();
                if (done) {
                    reading = false;
                    break;
                }

                const chunk = decoder.decode(value, { stream: true });
                const lines = chunk.split('\n').filter(line => line.trim());

                for (const line of lines) {
                    try {
                        const data = JSON.parse(line);
                        
                        if (data.log && progressCallback) {
                            progressCallback({ type: 'log', message: data.log });
                        } else if (data.success !== undefined) {
                            result = data;
                            if (progressCallback) {
                                progressCallback({ type: 'result', data: result });
                            }
                        }
                    } catch (e) {
                        // Ignore malformed JSON chunks
                        console.warn('Malformed JSON chunk:', line);
                    }
                }
            }
        } finally {
            reader.releaseLock();
        }

        return result;
    }

    /**
     * Handle deployment with timeout and polling fallback
     * @param {Object} deploymentData - The deployment configuration
     * @param {Function} progressCallback - Called with progress updates
     * @returns {Promise<Object>} Deployment result
     */
    async deployERDWithTimeout(deploymentData, progressCallback = null) {
        try {
            return await this.deployERD(deploymentData, progressCallback);
        } catch (error) {
            // Check if it's a timeout (504 or fetch failure)
            if (error.message.includes('504') || error.message.includes('Failed to fetch')) {
                if (progressCallback) {
                    progressCallback({ 
                        type: 'log', 
                        message: 'Request timed out, checking deployment status...' 
                    });
                }
                
                // Start polling for solution status
                return await this.pollSolutionStatus(deploymentData.solutionName, progressCallback);
            }
            throw error;
        }
    }

    /**
     * Poll solution status after timeout
     * @param {string} solutionName - The solution name to check
     * @param {Function} progressCallback - Called with progress updates
     * @returns {Promise<Object>} Deployment result
     */
    async pollSolutionStatus(solutionName, progressCallback = null) {
        const maxAttempts = 10;
        const delayMs = 3000;

        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            try {
                if (progressCallback) {
                    progressCallback({ 
                        type: 'log', 
                        message: `Checking deployment status (attempt ${attempt}/${maxAttempts})...` 
                    });
                }

                const response = await fetch(`/api/solution-status?solution=${encodeURIComponent(solutionName)}`);
                
                if (response.ok) {
                    const result = await response.json();
                    if (result.success) {
                        if (progressCallback) {
                            progressCallback({ 
                                type: 'log', 
                                message: 'Deployment completed successfully (verified via polling)' 
                            });
                        }
                        return result;
                    }
                }

                // Wait before next attempt
                if (attempt < maxAttempts) {
                    await new Promise(resolve => setTimeout(resolve, delayMs));
                }
            } catch (pollError) {
                console.warn(`Polling attempt ${attempt} failed:`, pollError);
            }
        }

        throw new Error('Deployment status could not be verified. Please check Dataverse manually.');
    }

    /**
     * Get solution status
     * @param {string} solutionName - The solution name to check
     * @returns {Promise<Object>} Solution status
     */
    async getSolutionStatus(solutionName) {
        const response = await fetch(`/api/solution-status?solution=${encodeURIComponent(solutionName)}`);
        
        if (!response.ok) {
            throw new Error(`Failed to get solution status: ${response.statusText}`);
        }

        return await response.json();
    }
}

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { ApiService };
}

// Make available globally for backward compatibility
window.ApiService = ApiService;
