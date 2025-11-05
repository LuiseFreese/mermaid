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