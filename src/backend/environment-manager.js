/**
 * Multi-Environment Configuration Manager
 * 
 * This module manages multiple Dataverse environments and provides
 * environment-specific client instances and configuration.
 */

const fs = require('fs').promises;
const path = require('path');

class EnvironmentManager {
  constructor() {
    this.environments = new Map();
    this.defaultEnvironmentId = null;
    
    // Try multiple possible paths for environments.json
    // 1. Development: project_root/data/environments.json (when cwd is project root)
    // 2. Azure deployment: /home/site/wwwroot/data/environments.json (absolute Azure path)
    // 3. Relative to backend: ../data/environments.json (one level up from backend folder)
    // 4. Same directory as this file: ./data/environments.json (if deployed flat)
    const possiblePaths = [
      path.join(process.cwd(), 'data', 'environments.json'),  // Current working directory
      '/home/site/wwwroot/data/environments.json',  // Azure App Service absolute path
      path.join(__dirname, '..', 'data', 'environments.json'),  // One level up from backend folder
      path.join(__dirname, 'data', 'environments.json')  // Same directory as backend
    ];
    
    this.configPath = possiblePaths[0];  // Default to first path, will try all in loadConfiguration
    this.possibleConfigPaths = possiblePaths;
    this.initialized = false;
    
    console.log('🔍 EnvironmentManager: Initialized with possible config paths:', possiblePaths);
  }

  /**
   * Initialize the environment manager with configuration
   */
  async initialize() {
    if (this.initialized) return;

    try {
      // Try to load existing configuration
      await this.loadConfiguration();
    } catch (error) {
      console.log('No existing environment configuration found, creating default...');
      // Create default configuration from environment variables
      await this.createDefaultConfiguration();
    }

    this.initialized = true;
  }

  /**
   * Load environment configuration from file
   */
  async loadConfiguration() {
    let lastError = null;
    
    // Try all possible configuration paths
    for (const configPath of this.possibleConfigPaths) {
      try {
        console.log(`🔍 EnvironmentManager: Trying to load config from: ${configPath}`);
        const configData = await fs.readFile(configPath, 'utf8');
        const config = JSON.parse(configData);

        this.environments.clear();
        config.environments.forEach(env => {
          this.environments.set(env.id, {
            ...env,
            lastConnected: env.lastConnected ? new Date(env.lastConnected) : null
          });
        });

        this.defaultEnvironmentId = config.defaultEnvironmentId;
        this.configPath = configPath;  // Remember the successful path
        
        console.log(`✅ EnvironmentManager: Successfully loaded config from: ${configPath}`);
        console.log(`   └─ Loaded ${this.environments.size} environment(s)`);
        return;  // Success! Exit the function
        
      } catch (error) {
        lastError = error;
        console.log(`⚠️  EnvironmentManager: Config not found at ${configPath}: ${error.message}`);
        // Continue trying next path
      }
    }
    
    // If we get here, all paths failed
    throw new Error(`Failed to load environment configuration from any path. Last error: ${lastError?.message}`);
  }

  /**
   * Save environment configuration to file
   */
  async saveConfiguration() {
    try {
      // Ensure data directory exists
      await fs.mkdir(path.dirname(this.configPath), { recursive: true });

      const config = {
        version: '1.0.0',
        defaultEnvironmentId: this.defaultEnvironmentId,
        environments: Array.from(this.environments.values()).map(env => ({
          ...env,
          lastConnected: env.lastConnected ? env.lastConnected.toISOString() : null
        }))
      };

      await fs.writeFile(this.configPath, JSON.stringify(config, null, 2));
    } catch (error) {
      throw new Error(`Failed to save environment configuration: ${error.message}`);
    }
  }

  /**
   * Create default configuration from environment variables
   */
  async createDefaultConfiguration() {
    const defaultEnv = {
      id: 'default',
      name: 'Default Environment',
      url: process.env.DATAVERSE_URL || '',
      description: 'Default environment from environment variables',
      color: 'blue',
      metadata: {
        organizationName: process.env.DATAVERSE_ORG_NAME || '',
        organizationDisplayName: process.env.DATAVERSE_ORG_DISPLAY_NAME || '',
        region: process.env.DATAVERSE_REGION || 'Unknown'
      }
    };

    // Only add default environment if DATAVERSE_URL is configured
    if (defaultEnv.url) {
      this.environments.set('default', defaultEnv);
      this.defaultEnvironmentId = 'default';
      await this.saveConfiguration();
    }
  }

  /**
   * Get all environments
   */
  getEnvironments() {
    return Array.from(this.environments.values());
  }

  /**
   * Get environment by ID
   */
  getEnvironment(environmentId) {
    return this.environments.get(environmentId);
  }

  /**
   * Get environment by URL
   * @param {string} url - Environment URL to search for
   * @returns {Object|null} Environment object or null if not found
   */
  getEnvironmentByUrl(url) {
    if (!url) return null;
    
    // Normalize URL for comparison (remove trailing slash)
    const normalizedUrl = url.replace(/\/$/, '').toLowerCase();
    
    for (const env of this.environments.values()) {
      const envUrl = env.url.replace(/\/$/, '').toLowerCase();
      if (envUrl === normalizedUrl) {
        return env;
      }
    }
    
    return null;
  }

  /**
   * Get default environment
   */
  getDefaultEnvironment() {
    if (this.defaultEnvironmentId) {
      return this.environments.get(this.defaultEnvironmentId);
    }
    
    // Fallback to first environment if no default is set
    const envs = Array.from(this.environments.values());
    return envs.length > 0 ? envs[0] : null;
  }

  /**
   * Add or update environment
   */
  async setEnvironment(environment) {
    // Validate required fields
    if (!environment.id || !environment.name || !environment.url) {
      throw new Error('Environment must have id, name, and url');
    }

    // Validate URL format
    try {
      new URL(environment.url);
    } catch (error) {
      throw new Error('Invalid environment URL format');
    }

    this.environments.set(environment.id, {
      ...environment,
      lastConnected: environment.lastConnected || null
    });

    // Set as default if it's the first environment
    if (this.environments.size === 1 && !this.defaultEnvironmentId) {
      this.defaultEnvironmentId = environment.id;
    }

    await this.saveConfiguration();
  }

  /**
   * Remove environment
   */
  async removeEnvironment(environmentId) {
    if (!this.environments.has(environmentId)) {
      throw new Error(`Environment ${environmentId} not found`);
    }

    this.environments.delete(environmentId);

    // Update default if we removed it
    if (this.defaultEnvironmentId === environmentId) {
      const envs = Array.from(this.environments.values());
      this.defaultEnvironmentId = envs.length > 0 ? envs[0].id : null;
    }

    await this.saveConfiguration();
  }

  /**
   * Set default environment
   */
  async setDefaultEnvironment(environmentId) {
    if (!this.environments.has(environmentId)) {
      throw new Error(`Environment ${environmentId} not found`);
    }

    this.defaultEnvironmentId = environmentId;
    await this.saveConfiguration();
  }

  /**
   * Update environment connection status
   */
  async updateConnectionStatus(environmentId, connected = true) {
    const environment = this.environments.get(environmentId);
    if (!environment) {
      throw new Error(`Environment ${environmentId} not found`);
    }

    environment.lastConnected = connected ? new Date() : null;
    await this.saveConfiguration();
  }

  /**
   * Get environment configuration for DataverseClient
   */
  getEnvironmentConfig(environmentId = null) {
    const environment = environmentId ? 
      this.getEnvironment(environmentId) : 
      this.getDefaultEnvironment();

    if (!environment) {
      throw new Error('No environment configuration available');
    }

    return {
      serverUrl: environment.url,  // DataverseClient expects 'serverUrl', not 'dataverseUrl'
      dataverseUrl: environment.url,  // Keep for backward compatibility
      tenantId: process.env.TENANT_ID || '',
      clientId: process.env.CLIENT_ID || '',
      clientSecret: process.env.CLIENT_SECRET || '',
      managedIdentityClientId: process.env.MANAGED_IDENTITY_CLIENT_ID || '',
      useClientSecret: process.env.USE_CLIENT_SECRET === 'true',
      useFederatedCredential: process.env.USE_FEDERATED_CREDENTIAL === 'true',
      useManagedIdentity: process.env.USE_MANAGED_IDENTITY === 'true'
    };
  }

  /**
   * Validate environment configuration
   */
  async validateEnvironment(environmentId) {
    const environment = this.getEnvironment(environmentId);
    if (!environment) {
      throw new Error(`Environment ${environmentId} not found`);
    }

    try {
      // Basic URL validation
      const url = new URL(environment.url);
      
      // Check if it looks like a Dataverse URL
      if (!url.hostname.includes('.dynamics.com') && !url.hostname.includes('.crm')) {
        return {
          isValid: false,
          error: 'URL does not appear to be a valid Dataverse environment'
        };
      }

      return {
        isValid: true,
        isReachable: true // We'll implement actual connectivity check later
      };
    } catch (error) {
      return {
        isValid: false,
        error: error.message
      };
    }
  }
}

module.exports = EnvironmentManager;