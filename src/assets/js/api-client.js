/**
 * API Client for Wizard Backend Services
 * Handles all HTTP requests to the backend API
 */
export class ApiClient {
    constructor(baseUrl = '') {
        this.baseUrl = baseUrl;
        this.headers = {
            'Content-Type': 'application/json'
        };
    }

    /**
     * Make HTTP request
     * @param {string} method - HTTP method
     * @param {string} endpoint - API endpoint
     * @param {Object} data - Request data
     * @param {Object} options - Request options
     * @returns {Promise<Object>} - Response data
     */
    async request(method, endpoint, data = null, options = {}) {
        const url = `${this.baseUrl}${endpoint}`;
        
        const config = {
            method: method.toUpperCase(),
            headers: { ...this.headers, ...options.headers },
            ...options
        };

        if (data && method.toUpperCase() !== 'GET') {
            if (data instanceof FormData) {
                // Remove Content-Type header for FormData (browser will set it)
                delete config.headers['Content-Type'];
                config.body = data;
            } else {
                config.body = JSON.stringify(data);
            }
        }

        try {
            const response = await fetch(url, config);
            
            if (!response.ok) {
                const errorData = await this.parseResponse(response);
                throw new Error(errorData.message || `HTTP ${response.status}: ${response.statusText}`);
            }

            return await this.parseResponse(response);
        } catch (error) {
            console.error(`API request failed: ${method} ${endpoint}`, error);
            throw error;
        }
    }

    /**
     * Parse response based on content type
     * @param {Response} response - Fetch response
     * @returns {Promise<*>} - Parsed response
     */
    async parseResponse(response) {
        const contentType = response.headers.get('content-type');
        
        if (contentType && contentType.includes('application/json')) {
            return await response.json();
        } else if (contentType && contentType.includes('text/')) {
            return await response.text();
        } else {
            return await response.blob();
        }
    }

    /**
     * Validate ERD content
     * @param {string} content - ERD content
     * @returns {Promise<Object>} - Validation result
     */
    async validateERD(content) {
        return this.request('POST', '/api/validate', { mermaidContent: content });
    }

    /**
     * Upload ERD file
     * @param {File} file - ERD file
     * @returns {Promise<Object>} - Upload result
     */
    async uploadERD(file) {
        const formData = new FormData();
        formData.append('file', file);
        return this.request('POST', '/api/upload', formData);
    }

    /**
     * Get publishers list
     * @returns {Promise<Array>} - Publishers array
     */
    async getPublishers() {
        return this.request('GET', '/api/publishers');
    }

    /**
     * Create new publisher
     * @param {Object} publisherData - Publisher data
     * @returns {Promise<Object>} - Created publisher
     */
    async createPublisher(publisherData) {
        return this.request('POST', '/api/publishers', publisherData);
    }

    /**
     * Get global choices
     * @returns {Promise<Array>} - Global choices array
     */
    async getGlobalChoices() {
        return this.request('GET', '/api/global-choices');
    }

    /**
     * Upload custom choices file
     * @param {File} file - Choices file
     * @returns {Promise<Object>} - Upload result
     */
    async uploadChoices(file) {
        const formData = new FormData();
        formData.append('file', file);
        return this.request('POST', '/api/choices/upload', formData);
    }

    /**
     * Deploy solution to Dataverse
     * @param {Object} deploymentData - Deployment configuration
     * @returns {Promise<Object>} - Deployment result
     */
    async deploySolution(deploymentData) {
        return this.request('POST', '/api/deploy', deploymentData);
    }

    /**
     * Get deployment status
     * @param {string} deploymentId - Deployment ID
     * @returns {Promise<Object>} - Deployment status
     */
    async getDeploymentStatus(deploymentId) {
        return this.request('GET', `/api/deploy/${deploymentId}/status`);
    }

    /**
     * Generate solution preview
     * @param {Object} solutionData - Solution configuration
     * @returns {Promise<Object>} - Solution preview
     */
    async generatePreview(solutionData) {
        return this.request('POST', '/api/preview', solutionData);
    }

    /**
     * Detect CDM entities
     * @param {string} content - ERD content
     * @returns {Promise<Object>} - CDM detection result
     */
    async detectCDM(content) {
        return this.request('POST', '/api/cdm/detect', { content });
    }

    /**
     * Get health status
     * @returns {Promise<Object>} - Health status
     */
    async getHealth() {
        return this.request('GET', '/health');
    }

    /**
     * Set authorization header
     * @param {string} token - Authorization token
     */
    setAuthToken(token) {
        this.headers['Authorization'] = `Bearer ${token}`;
    }

    /**
     * Remove authorization header
     */
    removeAuthToken() {
        delete this.headers['Authorization'];
    }

    /**
     * Create request with timeout
     * @param {Promise} request - Request promise
     * @param {number} timeout - Timeout in milliseconds
     * @returns {Promise} - Request with timeout
     */
    withTimeout(request, timeout = 30000) {
        return Promise.race([
            request,
            new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Request timeout')), timeout)
            )
        ]);
    }
}

// Export default instance
export const apiClient = new ApiClient();
