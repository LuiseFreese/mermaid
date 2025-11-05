/**
 * Dataverse Publisher Service
 * Handles publisher management operations
 */

const { DataverseClient } = require('./dataverse-client');

class DataversePublisherService extends DataverseClient {
  constructor(config = {}) {
    super(config);
  }

  /**
   * Check if a publisher exists by unique name
   * @param {string} uniqueName - Publisher unique name
   * @returns {Promise<object|null>} Publisher data or null if not found
   */
  async checkPublisherExists(uniqueName) {
    const query = `/publishers?$filter=uniquename eq '${uniqueName}'&$select=publisherid,uniquename,friendlyname,customizationprefix`;
    this._log(' GET', `${this.baseUrl}/api/data/v9.2${query}`);
    
    const response = await this.get(query);
    const publishers = response.value || [];
    return publishers[0] || null;
  }

  /**
   * Check if a publisher exists by prefix
   * @param {string} prefix - Publisher prefix
   * @returns {Promise<object|null>} Publisher data or null if not found
   */
  async checkPublisherByPrefix(prefix) {
    const query = `/publishers?$filter=customizationprefix eq '${prefix}'&$select=publisherid,uniquename,friendlyname,customizationprefix`;
    this._log(' GET', `${this.baseUrl}/api/data/v9.2${query}`);
    
    const response = await this.get(query);
    const publishers = response.value || [];
    return publishers[0] || null;
  }

  /**
   * Create a new publisher
   * @param {object} publisherData - Publisher configuration
   * @param {string} publisherData.uniqueName - Unique name
   * @param {string} publisherData.friendlyName - Display name
   * @param {string} publisherData.prefix - Customization prefix
   * @returns {Promise<object>} Created publisher data
   */
  async createPublisher({ uniqueName, friendlyName, prefix }) {
    const payload = {
      uniquename: uniqueName,
      friendlyname: friendlyName,
      customizationprefix: prefix,
      description: `Publisher for ${friendlyName}`,
      customizationoptionvalueprefix: 10000,
      isreadonly: false
    };

    this._log(`Creating publisher: ${uniqueName} (${friendlyName}) with prefix: ${prefix}`);
    
    try {
      const response = await this.post('/publishers', payload);
      
      // The response typically contains the publisher ID in the header
      const publisherId = response.publisherid || 
                         (response['@odata.context'] && response['@odata.context'].match(/publishers\\(([^)]+)\\)/)?.[1]);
      
      if (publisherId) {
        this._log(`✅ Publisher created successfully with ID: ${publisherId}`);
        return {
          publisherid: publisherId,
          uniquename: uniqueName,
          friendlyname: friendlyName,
          customizationprefix: prefix
        };
      } else {
        throw new Error('Publisher created but ID not returned in response');
      }
    } catch (error) {
      if (error.message.includes('duplicate')) {
        this._warn(`Publisher ${uniqueName} already exists`);
        // Try to retrieve the existing publisher
        return await this.checkPublisherExists(uniqueName);
      }
      throw new Error(`Failed to create publisher: ${error.message}`);
    }
  }

  /**
   * Ensure a publisher exists, create if it doesn't
   * @param {object} publisherData - Publisher configuration
   * @param {string} publisherData.uniqueName - Unique name
   * @param {string} publisherData.friendlyName - Display name
   * @param {string} publisherData.prefix - Customization prefix
   * @returns {Promise<object>} Publisher data
   */
  async ensurePublisher({ uniqueName, friendlyName, prefix }) {
    // Check if publisher already exists
    let publisher = await this.checkPublisherExists(uniqueName);
    
    if (publisher) {
      this._log(`✅ Publisher '${uniqueName}' already exists`);
      return publisher;
    }

    // Check if prefix is already in use
    const existingWithPrefix = await this.checkPublisherByPrefix(prefix);
    if (existingWithPrefix) {
      this._warn(`⚠️ Prefix '${prefix}' is already in use by publisher '${existingWithPrefix.uniquename}'`);
      if (existingWithPrefix.uniquename !== uniqueName) {
        throw new Error(`Prefix '${prefix}' is already in use by another publisher: ${existingWithPrefix.uniquename}`);
      }
      return existingWithPrefix;
    }

    // Create new publisher
    return await this.createPublisher({ uniqueName, friendlyName, prefix });
  }

  /**
   * Get all publishers
   * @returns {Promise<Array>} List of publishers
   */
  async getPublishers() {
    const query = '/publishers?$select=publisherid,uniquename,friendlyname,customizationprefix,description';
    const response = await this.get(query);
    return response.value || [];
  }

  /**
   * Delete a publisher
   * @param {string} publisherIdOrPrefix - Publisher ID or prefix
   * @returns {Promise<boolean>} Success status
   */
  async deletePublisher(publisherIdOrPrefix) {
    try {
      // First try to find by ID
      let publisherId = publisherIdOrPrefix;
      
      // If it looks like a prefix (short string), find by prefix
      if (publisherIdOrPrefix.length < 10) {
        const publisher = await this.checkPublisherByPrefix(publisherIdOrPrefix);
        if (!publisher) {
          throw new Error(`Publisher with prefix '${publisherIdOrPrefix}' not found`);
        }
        publisherId = publisher.publisherid;
      }

      await this.delete(`/publishers(${publisherId})`);
      this._log(`✅ Publisher deleted successfully`);
      return true;
    } catch (error) {
      throw new Error(`Failed to delete publisher: ${error.message}`);
    }
  }
}

module.exports = { DataversePublisherService };