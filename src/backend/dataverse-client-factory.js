/**
 * Dataverse Client Factory for Multi-Environment Support
 * 
 * This module provides factory functions for creating DataverseClient instances
 * configured for specific environments.
 */

const { DataverseClient } = require('./dataverse-client');

class DataverseClientFactory {
  constructor(environmentManager) {
    this.environmentManager = environmentManager;
    this.clientCache = new Map();
  }

  /**
   * Get or create a DataverseClient for the specified environment
   */
  getClient(environmentId = null) {
    const environment = environmentId ? 
      this.environmentManager.getEnvironment(environmentId) : 
      this.environmentManager.getDefaultEnvironment();

    if (!environment) {
      throw new Error(`Environment ${environmentId || 'default'} not found`);
    }

    // Check cache first
    if (this.clientCache.has(environment.id)) {
      return this.clientCache.get(environment.id);
    }

    // Create new client with environment-specific configuration
    const config = this.environmentManager.getEnvironmentConfig(environment.id);
    const client = new DataverseClient(config);

    // Cache the client
    this.clientCache.set(environment.id, client);

    return client;
  }

  /**
   * Get client for specific environment URL (for backward compatibility)
   */
  getClientByUrl(url) {
    // Find environment by URL
    const environments = this.environmentManager.getEnvironments();
    const environment = environments.find(env => env.url === url);
    
    if (!environment) {
      // Create temporary client for the URL
      const config = {
        dataverseUrl: url,
        tenantId: process.env.TENANT_ID || '',
        clientId: process.env.CLIENT_ID || '',
        clientSecret: process.env.CLIENT_SECRET || '',
        managedIdentityClientId: process.env.MANAGED_IDENTITY_CLIENT_ID || '',
        useClientSecret: process.env.USE_CLIENT_SECRET === 'true',
        useFederatedCredential: process.env.USE_FEDERATED_CREDENTIAL === 'true',
        useManagedIdentity: process.env.USE_MANAGED_IDENTITY === 'true'
      };
      return new DataverseClient(config);
    }

    return this.getClient(environment.id);
  }

  /**
   * Clear cached client for environment (useful after configuration changes)
   */
  clearClientCache(environmentId = null) {
    if (environmentId) {
      this.clientCache.delete(environmentId);
    } else {
      this.clientCache.clear();
    }
  }

  /**
   * Test connection for an environment
   */
  async testConnection(environmentId) {
    try {
      const client = this.getClient(environmentId);
      
      // Try to call WhoAmI to test the connection
      const result = await client.whoAmI();
      
      // Update connection status
      await this.environmentManager.updateConnectionStatus(environmentId, true);
      
      return {
        success: true,
        user: result,
        timestamp: new Date()
      };
    } catch (error) {
      // Update connection status
      await this.environmentManager.updateConnectionStatus(environmentId, false);
      
      return {
        success: false,
        error: error.message,
        timestamp: new Date()
      };
    }
  }

  /**
   * Get environment metadata from Dataverse
   */
  async getEnvironmentMetadata(environmentId) {
    try {
      const client = this.getClient(environmentId);
      
      // Get organization info
      const whoAmI = await client.whoAmI();
      const orgInfo = await client.getOrganizationInfo();
      
      return {
        organizationId: whoAmI.OrganizationId,
        organizationName: orgInfo.UniqueName,
        organizationDisplayName: orgInfo.FriendlyName,
        version: orgInfo.Version,
        region: orgInfo.Geo || 'Unknown',
        user: {
          userId: whoAmI.UserId,
          businessUnitId: whoAmI.BusinessUnitId
        }
      };
    } catch (error) {
      throw new Error(`Failed to get environment metadata: ${error.message}`);
    }
  }
}

module.exports = DataverseClientFactory;