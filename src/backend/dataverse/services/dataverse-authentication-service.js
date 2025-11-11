/**
 * Dataverse Authentication Service
 * Handles all authentication methods: Client Secret, Managed Identity, Federated Credentials
 */

const fs = require('fs');
const { BaseDataverseService } = require('./base-dataverse-service');

class DataverseAuthenticationService extends BaseDataverseService {
  constructor(config = {}) {
    super(config);
    
    this.tenantId = config.tenantId || config.TENANT_ID || process.env.TENANT_ID;
    this.clientId = config.clientId || config.CLIENT_ID || process.env.CLIENT_ID;
    this.clientSecret = config.clientSecret || config.CLIENT_SECRET || process.env.CLIENT_SECRET;
    this.managedIdentityClientId = config.managedIdentityClientId || config.MANAGED_IDENTITY_CLIENT_ID || process.env.MANAGED_IDENTITY_CLIENT_ID;
    
    // Authentication strategy selection
    this.useClientSecret = config.useClientSecret || 
                           process.env.USE_CLIENT_SECRET === 'true' ||
                           (this.clientSecret && this.clientId && this.tenantId);
    
    this.useFederatedCredential = config.useFederatedCredential || 
                                  process.env.USE_FEDERATED_CREDENTIAL === 'true';
    
    this.useManagedIdentity = config.useManagedIdentity || 
                              process.env.USE_MANAGED_IDENTITY === 'true' ||
                              (!this.useClientSecret && !this.useFederatedCredential);
    
    // For federated credentials
    this.clientAssertion = config.clientAssertion || process.env.CLIENT_ASSERTION;
    this.clientAssertionFile = config.clientAssertionFile || process.env.CLIENT_ASSERTION_FILE;
    
    // Token state
    this.accessToken = null;
    this.tokenExpiry = null;
    
    this._logAuthenticationMode();
  }

  _logAuthenticationMode() {
    console.log(`🔐 Authentication mode:`);
    console.log(`   - useClientSecret: ${this.useClientSecret} (clientId: ${this.clientId ? 'SET' : 'NOT SET'}, secret: ${this.clientSecret ? 'SET' : 'NOT SET'}, tenant: ${this.tenantId ? 'SET' : 'NOT SET'})`);
    console.log(`   - useFederatedCredential: ${this.useFederatedCredential}`);
    console.log(`   - useManagedIdentity: ${this.useManagedIdentity}`);
  }

  /**
   * Ensure a valid access token is available
   * @returns {Promise<string>} Valid access token
   */
  async ensureToken() {
    if (this.accessToken && this.tokenExpiry && Date.now() < this.tokenExpiry - 60000) {
      return this.accessToken;
    }

    // Determine authentication method based on configuration
    if (this.useClientSecret) {
      // Use client secret authentication (local development)
      return await this._getTokenWithClientSecret();
    } else if (this.useFederatedCredential) {
      // Use federated credentials with client assertion (direct)
      return await this._getTokenWithClientAssertion();
    } else {
      // Use managed identity WITH federated credentials (workload identity pattern)
      if (this.useFederatedCredential || process.env.AZURE_FEDERATED_TOKEN_FILE) {
        return await this._getManagedIdentityWithFederatedCredentials();
      }
      // Use managed identity (Azure App Service, VM, Container Instance, etc.)
      return await this._getManagedIdentityToken();
    }
  }

  /**
   * Get token using client secret (local development)
   * @returns {Promise<string>} Access token
   */
  async _getTokenWithClientSecret() {
    if (!this.clientId || !this.clientSecret || !this.tenantId) {
      throw new Error('Client ID, client secret, and tenant ID are required for client secret authentication');
    }

    const tokenUrl = `https://login.microsoftonline.com/${this.tenantId}/oauth2/v2.0/token`;
    const body = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: this.clientId,
      client_secret: this.clientSecret,
      scope: `${this.baseUrl}/.default`
    });

    try {
      const response = await this.httpClient.post(tokenUrl, body, {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
      });

      if (response.status !== 200) {
        throw new Error(`Token request failed: ${response.status} ${response.statusText}`);
      }

      this.accessToken = response.data.access_token;
      // Set expiration time for all authentication methods
      this.tokenExpiry = Date.now() + (response.data.expires_in * 1000);
      
      return this.accessToken;
    } catch (error) {
      throw new Error(`Failed to get token with client secret: ${error.message}`);
    }
  }

  /**
   * Get token using managed identity
   * @returns {Promise<string>} Access token
   */
  async _getManagedIdentityToken() {
    try {
      // Azure Instance Metadata Service (IMDS) endpoint for managed identity
      const tokenUrl = 'http://169.254.169.254/metadata/identity/oauth2/token';
      const params = new URLSearchParams({
        'api-version': '2018-02-01',
        resource: this.baseUrl
      });

      // For user-assigned managed identity, add client_id
      if (this.managedIdentityClientId) {
        params.append('client_id', this.managedIdentityClientId);
      }

      const response = await this.httpClient.get(`${tokenUrl}?${params}`, {
        headers: { Metadata: 'true' },
        timeout: 10000 // Shorter timeout for IMDS
      });

      if (response.status !== 200) {
        throw new Error(`Managed identity token request failed: ${response.status}`);
      }

      this.accessToken = response.data.access_token;
      this.tokenExpiry = Date.now() + (response.data.expires_in * 1000);
      
      return this.accessToken;
    } catch (error) {
      throw new Error(`Failed to get managed identity token: ${error.message}`);
    }
  }

  /**
   * Get token using managed identity with federated credentials
   * @returns {Promise<string>} Access token
   */
  async _getManagedIdentityWithFederatedCredentials() {
    try {
      // Step 1: Get Azure token from managed identity using App Service endpoint
      const identityEndpoint = process.env.IDENTITY_ENDPOINT;
      const identityHeader = process.env.IDENTITY_HEADER;
      
      // Azure App Service provides managed identity through these environment variables
      if (!identityEndpoint || !identityHeader) {
        throw new Error('IDENTITY_ENDPOINT and IDENTITY_HEADER environment variables are required for App Service managed identity');
      }

      const params = new URLSearchParams({
        'api-version': '2019-08-01',
        resource: 'https://management.azure.com/'
      });

      // For user-assigned managed identity, we need to specify the managed identity client ID
      if (this.managedIdentityClientId) {
        params.append('client_id', this.managedIdentityClientId);
      }

      const azureTokenResponse = await this.httpClient.get(`${identityEndpoint}?${params}`, {
        headers: { 
          'X-IDENTITY-HEADER': identityHeader,
          'Metadata': 'true'
        }
      });

      if (azureTokenResponse.status !== 200) {
        throw new Error(`Azure token request failed: ${azureTokenResponse.status}`);
      }

      // Step 2: Exchange Azure token for Dataverse token using federated credentials
      const dataverseTokenUrl = `https://login.microsoftonline.com/${this.tenantId}/oauth2/v2.0/token`;
      const body = new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: this.clientId,
        client_assertion_type: 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer',
        client_assertion: azureTokenResponse.data.access_token,
        scope: `${this.baseUrl}/.default`
      });

      const dataverseTokenResponse = await this.httpClient.post(dataverseTokenUrl, body, {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
      });

      if (dataverseTokenResponse.status !== 200) {
        throw new Error(`Dataverse token request failed: ${dataverseTokenResponse.status}`);
      }

      this.accessToken = dataverseTokenResponse.data.access_token;
      this.tokenExpiry = Date.now() + (dataverseTokenResponse.data.expires_in * 1000);
      
      return this.accessToken;
    } catch (error) {
      // Log detailed error information for debugging
      this._err('Failed to get token with federated credentials:', error.message);
      if (error.response) {
        this._err('Response status:', error.response.status);
        this._err('Response data:', error.response.data);
      }
      throw new Error(`Failed to get token with federated credentials: ${error.message}`);
    }
  }

  /**
   * Get client assertion for federated credentials
   * @returns {Promise<string>} Client assertion JWT
   */
  async _getClientAssertion() {
    if (this.clientAssertion) {
      // Direct assertion token provided
      return this.clientAssertion;
    }

    if (this.clientAssertionFile) {
      // Read assertion from file
      try {
        return fs.readFileSync(this.clientAssertionFile, 'utf8').trim();
      } catch (error) {
        throw new Error(`Failed to read client assertion file: ${error.message}`);
      }
    }

    // Check for Azure App Service federated credential token
    // Azure App Service provides the JWT token via environment variable or file
    const federatedTokenFile = process.env.AZURE_FEDERATED_TOKEN_FILE;
    if (federatedTokenFile) {
      try {
        return fs.readFileSync(federatedTokenFile, 'utf8').trim();
      } catch (error) {
        throw new Error(`Failed to read Azure federated token file: ${error.message}`);
      }
    }

    // Check standard GitHub Actions OIDC token (for reference)
    if (process.env.ACTIONS_ID_TOKEN_REQUEST_URL && process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN) {
      // This would require GitHub Actions OIDC token generation
      // Implementation depends on the specific CI/CD environment
      throw new Error('GitHub Actions OIDC token generation not implemented');
    }

    throw new Error('No client assertion source configured');
  }

  /**
   * Get token using client assertion (federated credentials)
   * @returns {Promise<string>} Access token
   */
  async _getTokenWithClientAssertion() {
    const assertion = await this._getClientAssertion();
    
    const tokenUrl = `https://login.microsoftonline.com/${this.tenantId}/oauth2/v2.0/token`;
    const body = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: this.clientId,
      client_assertion_type: 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer',
      client_assertion: assertion,
      scope: `${this.baseUrl}/.default`
    });

    try {
      const response = await this.httpClient.post(tokenUrl, body, {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
      });

      if (response.status !== 200) {
        throw new Error(`Token request failed: ${response.status} ${response.statusText}`);
      }

      this.accessToken = response.data.access_token;
      this.tokenExpiry = Date.now() + (response.data.expires_in * 1000);
      
      return this.accessToken;
    } catch (error) {
      throw new Error(`Failed to get token with client assertion: ${error.message}`);
    }
  }

  /**
   * Test connection to Dataverse
   * @returns {Promise<object>} Connection test result
   */
  async testConnection() {
    try {
      await this.ensureToken();
      return { success: true, message: 'Authentication successful' };
    } catch (error) {
      return { success: false, message: error.message };
    }
  }
}

module.exports = { DataverseAuthenticationService };