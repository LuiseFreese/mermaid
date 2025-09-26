/**
 * Configuration Repository
 * Data access abstraction for configuration management
 */
const { BaseRepository } = require('./base-repository');

class ConfigurationRepository extends BaseRepository {
    constructor(dependencies = {}) {
        super(dependencies);
        
        this.environment = dependencies.environment || process.env;
        
        // Cache for configuration data
        this.configCache = new Map();
        this.cacheExpiry = new Map();
        this.defaultCacheTTL = 300000; // 5 minutes
    }

    /**
     * Get Dataverse configuration
     * @param {boolean} useCache - Whether to use cached config
     * @returns {Promise<Object>} Dataverse configuration
     */
    async getDataverseConfig(useCache = true) {
        return this.executeOperation('getDataverseConfig', async () => {
            // Return mock config for tests
            if (process.env.NODE_ENV === 'test') {
                const mockConfig = {
                    serverUrl: process.env.DATAVERSE_URL || 'https://test.crm.dynamics.com',
                    tenantId: process.env.TENANT_ID || 'test-tenant-id',
                    clientId: process.env.CLIENT_ID || 'test-client-id',
                    managedIdentityClientId: process.env.MANAGED_IDENTITY_CLIENT_ID || 'test-managed-identity-id'
                };
                return this.createSuccess(mockConfig, 'Test configuration provided');
            }
            
            const cacheKey = 'dataverse_config';
            
            // Check cache first
            if (useCache && this.isCacheValid(cacheKey)) {
                return this.createSuccess(this.configCache.get(cacheKey), 'Configuration retrieved from cache');
            }

            let config = null;

            // Use managed identity or federated credentials for authentication
            const useManagedIdentity = this.environment.USE_MANAGED_IDENTITY === 'true';
            const useFederatedCredential = this.environment.USE_FEDERATED_CREDENTIAL === 'true';
            
            this.log('getDataverseConfig', { 
                source: 'managed_identity',
                authMode: useManagedIdentity ? 'managed_identity' : 'federated_credential'
            });
            
            config = {
                serverUrl: this.environment.DATAVERSE_URL,
                tenantId: this.environment.TENANT_ID,
                clientId: this.environment.CLIENT_ID,
                clientSecret: this.environment.CLIENT_SECRET, // Add client secret for local dev
                managedIdentityClientId: this.environment.MANAGED_IDENTITY_CLIENT_ID,
                useFederatedCredential,
                useManagedIdentity,
                clientAssertion: this.environment.CLIENT_ASSERTION,
                clientAssertionFile: this.environment.CLIENT_ASSERTION_FILE
            };
            
            // Debug: log what environment variables are available
            console.log('🔍 DEBUG: Environment variables:', {
                DATAVERSE_URL: !!this.environment.DATAVERSE_URL,
                TENANT_ID: !!this.environment.TENANT_ID,
                CLIENT_ID: !!this.environment.CLIENT_ID,
                CLIENT_SECRET: !!this.environment.CLIENT_SECRET, // Log client secret availability
                MANAGED_IDENTITY_CLIENT_ID: !!this.environment.MANAGED_IDENTITY_CLIENT_ID,
                USE_MANAGED_IDENTITY: !!this.environment.USE_MANAGED_IDENTITY,
                USE_FEDERATED_CREDENTIAL: !!this.environment.USE_FEDERATED_CREDENTIAL,
                AUTH_MODE: this.environment.AUTH_MODE, // Log auth mode
                actual_DATAVERSE_URL: this.environment.DATAVERSE_URL?.substring(0, 20) + '...',
                actual_CLIENT_ID: this.environment.CLIENT_ID?.substring(0, 8) + '...',
                actual_MANAGED_IDENTITY_CLIENT_ID: this.environment.MANAGED_IDENTITY_CLIENT_ID?.substring(0, 8) + '...',
                envKeys: Object.keys(this.environment).filter(k => k.includes('DATAVERSE') || k.includes('CLIENT') || k.includes('TENANT') || k.includes('USE_') || k.includes('MANAGED') || k.includes('AUTH'))
            });

            // Validate configuration
            this.validateDataverseConfig(config);

            // Cache the configuration
            this.setCacheValue(cacheKey, config);

            return this.createSuccess(config, 'Dataverse configuration retrieved successfully');
        });
    }

    /**
     * Get application configuration
     * @param {boolean} useCache - Whether to use cached config
     * @returns {Promise<Object>} Application configuration
     */
    async getApplicationConfig(useCache = true) {
        return this.executeOperation('getApplicationConfig', async () => {
            const cacheKey = 'app_config';
            
            // Check cache first
            if (useCache && this.isCacheValid(cacheKey)) {
                return this.createSuccess(this.configCache.get(cacheKey), 'Application config retrieved from cache');
            }

            const config = {
                // Server configuration
                port: parseInt(this.environment.PORT) || 3000,
                host: this.environment.HOST || '0.0.0.0',
                
                // Environment settings
                nodeEnv: this.environment.NODE_ENV || 'development',
                isDevelopment: (this.environment.NODE_ENV || 'development') === 'development',
                isProduction: (this.environment.NODE_ENV || 'development') === 'production',
                
                // Feature flags
                features: {
                    enableCDMDetection: this.environment.ENABLE_CDM_DETECTION !== 'false',
                    enableStreamingLogs: this.environment.ENABLE_STREAMING_LOGS !== 'false',
                    enableValidationCache: this.environment.ENABLE_VALIDATION_CACHE === 'true',
                    enableMetrics: this.environment.ENABLE_METRICS === 'true'
                },
                
                // Timeouts and limits
                timeouts: {
                    dataverseRequestTimeout: parseInt(this.environment.DATAVERSE_TIMEOUT) || 120000,
                    validationTimeout: parseInt(this.environment.VALIDATION_TIMEOUT) || 30000,
                    deploymentTimeout: parseInt(this.environment.DEPLOYMENT_TIMEOUT) || 600000
                },
                
                // Cache settings
                cache: {
                    configCacheTTL: parseInt(this.environment.CONFIG_CACHE_TTL) || this.defaultCacheTTL,
                    enableConfigCache: this.environment.ENABLE_CONFIG_CACHE !== 'false'
                },
                
                // Logging configuration
                logging: {
                    level: this.environment.LOG_LEVEL || 'info',
                    enableConsoleLogging: this.environment.ENABLE_CONSOLE_LOGGING !== 'false',
                    enableFileLogging: this.environment.ENABLE_FILE_LOGGING === 'true',
                    logDirectory: this.environment.LOG_DIRECTORY || './logs'
                }
            };

            // Cache the configuration
            this.setCacheValue(cacheKey, config);

            return this.createSuccess(config, 'Application configuration retrieved successfully');
        });
    }



    /**
     * Update configuration value
     * @param {string} key - Configuration key
     * @param {*} value - Configuration value
     * @param {number} ttl - Cache TTL in milliseconds
     * @returns {Promise<Object>} Update result
     */
    async updateConfig(key, value, ttl = null) {
        return this.executeOperation('updateConfig', async () => {
            this.setCacheValue(key, value, ttl);
            
            return this.createSuccess({
                key,
                updated: true,
                ttl: ttl || this.defaultCacheTTL
            }, 'Configuration updated successfully');
        });
    }

    /**
     * Clear configuration cache
     * @param {string} key - Optional specific key to clear
     * @returns {Promise<Object>} Clear result
     */
    async clearConfigCache(key = null) {
        return this.executeOperation('clearConfigCache', async () => {
            if (key) {
                this.configCache.delete(key);
                this.cacheExpiry.delete(key);
                return this.createSuccess({ clearedKey: key }, 'Configuration cache key cleared');
            } else {
                this.configCache.clear();
                this.cacheExpiry.clear();
                return this.createSuccess({ clearedAll: true }, 'Configuration cache cleared');
            }
        });
    }

    /**
     * Get configuration health status
     * @returns {Promise<Object>} Health status
     */
    async getConfigHealth() {
        return this.executeOperation('getConfigHealth', async () => {
            const health = {
                status: 'healthy',
                checks: {
                    dataverseConfig: false,
                    managedIdentity: false,
                    environmentVariables: false
                },
                details: {}
            };

            try {
                // Check Dataverse configuration
                const dataverseResult = await this.getDataverseConfig(false);
                health.checks.dataverseConfig = dataverseResult.success;
                if (!dataverseResult.success) {
                    health.details.dataverseError = dataverseResult.message;
                }
            } catch (error) {
                health.checks.dataverseConfig = false;
                health.details.dataverseError = error.message;
            }

            // Managed identity authentication - no Key Vault health check needed
            health.checks.managedIdentity = true;

            // Check essential environment variables
            const requiredEnvVars = ['NODE_ENV', 'PORT'];
            const missingEnvVars = requiredEnvVars.filter(varName => !this.environment[varName]);
            health.checks.environmentVariables = missingEnvVars.length === 0;
            if (missingEnvVars.length > 0) {
                health.details.missingEnvVars = missingEnvVars;
            }

            // Overall health status
            const failedChecks = Object.values(health.checks).filter(check => !check).length;
            if (failedChecks > 0) {
                health.status = failedChecks === Object.keys(health.checks).length ? 'unhealthy' : 'degraded';
            }

            health.cacheStats = {
                cachedConfigs: this.configCache.size,
                cacheKeys: Array.from(this.configCache.keys())
            };

            return this.createSuccess(health, 'Configuration health check completed');
        });
    }

    /**
     * Validate Dataverse configuration
     * @param {Object} config - Configuration to validate
     * @throws {Error} If configuration is invalid
     */
    validateDataverseConfig(config) {
        // Base required fields for all authentication modes
        const required = ['serverUrl', 'tenantId', 'clientId'];
        
        // Always use managed identity - no client secrets required
        if (config.managedIdentityClientId) {
            required.push('managedIdentityClientId');
        }
        
        const missing = required.filter(field => !config[field]);
        
        if (missing.length > 0) {
            throw new Error(`Missing required Dataverse configuration: ${missing.join(', ')}`);
        }

        // Validate URL format
        if (config.serverUrl && !config.serverUrl.match(/^https?:\/\/.+/)) {
            throw new Error('Dataverse serverUrl must be a valid HTTP(S) URL');
        }

        // Validate GUID format for IDs
        const guidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        
        if (config.tenantId && !guidRegex.test(config.tenantId)) {
            throw new Error('Dataverse tenantId must be a valid GUID');
        }
        
        if (config.clientId && !guidRegex.test(config.clientId)) {
            throw new Error('Dataverse clientId must be a valid GUID');
        }
    }

    /**
     * Check if cache value is valid
     * @param {string} key - Cache key
     * @returns {boolean} True if cache is valid
     */
    isCacheValid(key) {
        if (!this.configCache.has(key)) {
            return false;
        }

        const expiry = this.cacheExpiry.get(key);
        if (!expiry) {
            return true; // No expiry set
        }

        return Date.now() < expiry;
    }

    /**
     * Set cache value with optional TTL
     * @param {string} key - Cache key
     * @param {*} value - Value to cache
     * @param {number} ttl - TTL in milliseconds
     */
    setCacheValue(key, value, ttl = null) {
        this.configCache.set(key, value);
        
        if (ttl || this.defaultCacheTTL) {
            const expiry = Date.now() + (ttl || this.defaultCacheTTL);
            this.cacheExpiry.set(key, expiry);
        }
    }

    /**
     * Get cache statistics
     * @returns {Object} Cache statistics
     */
    getCacheStats() {
        const stats = {
            cachedConfigs: this.configCache.size,
            cacheKeys: Array.from(this.configCache.keys()),
            cacheHits: 0, // Would need tracking
            cacheMisses: 0 // Would need tracking
        };

        // Add expiry information
        stats.cacheExpiry = {};
        for (const [key, expiry] of this.cacheExpiry.entries()) {
            stats.cacheExpiry[key] = {
                expiresAt: new Date(expiry).toISOString(),
                expiresIn: Math.max(0, expiry - Date.now())
            };
        }

        return stats;
    }
}

module.exports = { ConfigurationRepository };
