/**
 * Dataverse Client
 * Main orchestrator for Dataverse operations using specialized services
 */

const { DataverseAuthenticationService } = require('./dataverse-authentication-service');

class DataverseClient extends DataverseAuthenticationService {
  constructor(config = {}) {
    super(config);
    
    console.log(`🌐 DataverseClient constructor - Using URL: ${this.baseUrl}`);
    console.log(`   - From config.dataverseUrl: ${config.dataverseUrl}`);
    console.log(`   - From process.env.DATAVERSE_URL: ${process.env.DATAVERSE_URL}`);
    
    // Initialize specialized services
    this._initializeServices(config);
  }

  /**
   * Initialize all specialized services
   * @private
   */
  _initializeServices(config) {
    // Import services dynamically to avoid circular dependencies
    const { DataversePublisherService } = require('./dataverse-publisher-service');
    const { DataverseSolutionService } = require('./dataverse-solution-service');
    const { DataverseEntityService } = require('./dataverse-entity-service');
    const { DataverseRelationshipService } = require('./dataverse-relationship-service');
    const { DataverseGlobalChoicesService } = require('./dataverse-global-choices-service');

    // Create service instances that share this client's configuration and auth
    // Pass this client instance so services can use its makeRequest method
    this.publisherService = new DataversePublisherService(config, this);
    this.solutionService = new DataverseSolutionService(config, this);
    this.entityService = new DataverseEntityService(config, this);
    this.relationshipService = new DataverseRelationshipService(config, this);
    this.globalChoicesService = new DataverseGlobalChoicesService(config, this);
    console.log('🔧 Services initialized with parent client reference');
  }

  // Publisher methods - delegate to publisher service
  async getPublishers() {
    return this.publisherService.getPublishers();
  }

  async createPublisher(publisherData) {
    return this.publisherService.createPublisher(publisherData);
  }

  async getPublisher(identifier) {
    return this.publisherService.getPublisher(identifier);
  }

  async updatePublisher(identifier, updateData) {
    return this.publisherService.updatePublisher(identifier, updateData);
  }

  async ensurePublisher(publisherConfig) {
    return this.publisherService.ensurePublisher(publisherConfig);
  }

  // Solution methods - delegate to solution service
  async getSolutions(options) {
    return this.solutionService.getSolutions(options);
  }

  async createSolution(solutionData, publisherPrefix, publisherName) {
    return this.solutionService.createSolution(solutionData, publisherPrefix, publisherName);
  }

  async updateSolution(solutionName, updateData) {
    return this.solutionService.updateSolution(solutionName, updateData);
  }

  async deleteSolution(solutionName, options) {
    return this.solutionService.deleteSolution(solutionName, options);
  }

  async ensureSolution(solutionConfig, publisherPrefix, publisherDisplayName) {
    return this.solutionService.ensureSolution(solutionConfig, publisherPrefix, publisherDisplayName);
  }

  async getSolutionComponents(solutionName) {
    return this.solutionService.getSolutionComponents(solutionName);
  }

  async exportSolution(solutionName, options) {
    return this.solutionService.exportSolution(solutionName, options);
  }

  // Global Choices methods - delegate to global choices service
  async getGlobalChoiceSets(options) {
    return this.globalChoicesService.getGlobalChoiceSets(options);
  }

  async createGlobalChoiceSet(choiceData) {
    return this.globalChoicesService.createGlobalChoiceSet(choiceData);
  }

  async getGlobalChoiceSet(choiceName) {
    return this.globalChoicesService.getGlobalChoiceSet(choiceName);
  }

  async updateGlobalChoiceSet(choiceName, updateData) {
    return this.globalChoicesService.updateGlobalChoiceSet(choiceName, updateData);
  }

  async deleteGlobalChoiceSet(choiceName, options) {
    return this.globalChoicesService.deleteGlobalChoiceSet(choiceName, options);
  }

  async addGlobalChoicesToSolution(choiceNames, solutionName) {
    return this.globalChoicesService.addGlobalChoicesToSolution(choiceNames, solutionName);
  }

  async createAndAddCustomGlobalChoices(globalChoicesData, solutionName, publisherPrefix) {
    return this.globalChoicesService.createAndAddCustomGlobalChoices(globalChoicesData, solutionName, publisherPrefix);
  }

  // Rollback method - Note: For new code, use RollbackService directly
  async rollbackDeployment(...args) {
    // This method exists for backward compatibility
    // For new implementations, use the RollbackService directly
    console.log('⚠️ rollbackDeployment called with args:', args.length);
    throw new Error('rollbackDeployment should now use RollbackService directly. The DataverseClient no longer handles rollback operations - they are managed by a specialized RollbackService.');
  }

  /**
   * Make authenticated HTTP request to Dataverse
   * @param {string} method - HTTP method
   * @param {string} url - Relative URL (without base URL)
   * @param {*} data - Request body data
   * @param {object} options - Additional request options
   * @returns {Promise<object>} Response data
   */
  async makeRequest(method, url, data, options = {}) {
    await this.ensureToken();
    
    const fullUrl = url.startsWith('http') ? url : `${this.baseUrl}/api/data/v9.2${url}`;
    
    const requestConfig = {
      method: method.toUpperCase(),
      url: fullUrl,
      headers: {
        'Authorization': `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'OData-MaxVersion': '4.0',
        'OData-Version': '4.0',
        'If-None-Match': 'null',
        ...options.headers
      },
      ...options
    };

    if (data && (method.toUpperCase() === 'POST' || method.toUpperCase() === 'PUT' || method.toUpperCase() === 'PATCH')) {
      requestConfig.data = data;
    }

    this._log(`${method.toUpperCase()}`, fullUrl);
    
    try {
      const response = await this.httpClient.request(requestConfig);
      
      if (response.status >= 400) {
        const errorMessage = response.data?.error?.message || `HTTP ${response.status}: ${response.statusText}`;
        throw new Error(errorMessage);
      }
      
      return response.data;
    } catch (error) {
      if (error.response) {
        const errorData = error.response.data;
        const errorMessage = errorData?.error?.message || `HTTP ${error.response.status}: ${error.response.statusText}`;
        throw new Error(errorMessage);
      } else {
        throw error;
      }
    }
  }

  // Legacy method aliases for backward compatibility
  async _req(method, url, data, options = {}) {
    return this.makeRequest(method, url, data, options);
  }

  async _get(url) {
    return this.get(url);
  }

  async _post(url, body) {
    return this.post(url, body);
  }

  async _delete(url, options = {}) {
    return this.delete(url, options);
  }

  /**
   * Get organization info and user details
   * @returns {Promise<object>} Organization and user information
   */
  async whoAmI() {
    const data = await this.get('/WhoAmI()');
    return data;
  }

  /**
   * Get organization information
   * @returns {Promise<object>} Organization details
   */
  async getOrganizationInfo() {
    const orgData = await this.get('/organizations');
    return orgData.value?.[0] || null;
  }

  /**
   * Test connection to Dataverse with WhoAmI call
   * @returns {Promise<object>} Connection test result
   */
  async testConnection() {
    try {
      await this.ensureToken();
      await this.whoAmI();
      return { success: true, message: 'Connected to Dataverse' };
    } catch (error) {
      return { success: false, message: error.message };
    }
  }
}

module.exports = { DataverseClient };