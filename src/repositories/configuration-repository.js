/**
 * Configuration Repository
 * Data access abstraction for configuration management
 */
const { BaseRepository } = require('./base-repository');

class ConfigurationRepository extends BaseRepository {
    constructor(dependencies = {}) {
        super(dependencies);
        
        this.keyVaultConfig = dependencies.keyVaultConfig;
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
            const cacheKey = 'dataverse_config';
            
            // Check cache first
            if (useCache && this.isCacheValid(cacheKey)) {
                return this.createSuccess(this.configCache.get(cacheKey), 'Configuration retrieved from cache');
            }

            let config = null;

            try {
                // Try Key Vault first if available
                if (this.keyVaultConfig) {
                    this.log('getDataverseConfig', { source: 'keyVault' });
                    config = await this.keyVaultConfig.getDataverseConfig();
                }
            } catch (error) {
                this.warn('Key Vault configuration failed, falling back to environment variables', {
                    error: error.message
                });
            }

            // Fallback to environment variables
            if (!config) {
                this.log('getDataverseConfig', { source: 'environment' });
                config = {
                    serverUrl: this.environment.DATAVERSE_URL,
                    tenantId: this.environment.TENANT_ID,
                    clientId: this.environment.CLIENT_ID,
                    clientSecret: this.environment.CLIENT_SECRET
                };
            }

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
     * Get Azure Key Vault configuration
     * @returns {Promise<Object>} Key Vault configuration
     */
    async getKeyVaultConfig() {
        return this.executeOperation('getKeyVaultConfig', async () => {
            if (!this.keyVaultConfig) {
                return this.createError('Key Vault configuration not available');
            }

            const config = {
                available: true,
                vaultUrl: this.environment.AZURE_KEY_VAULT_URL,
                clientId: this.environment.AZURE_CLIENT_ID,
                tenantId: this.environment.AZURE_TENANT_ID,
                // Don't expose secrets in config
                hasClientSecret: !!this.environment.AZURE_CLIENT_SECRET
            };

            return this.createSuccess(config, 'Key Vault configuration retrieved successfully');
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
                    keyVaultConfig: false,
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

            try {
                // Check Key Vault configuration
                const keyVaultResult = await this.getKeyVaultConfig();
                health.checks.keyVaultConfig = keyVaultResult.success;
                if (!keyVaultResult.success) {
                    health.details.keyVaultError = keyVaultResult.message;
                }
            } catch (error) {
                health.checks.keyVaultConfig = false;
                health.details.keyVaultError = error.message;
            }

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
        const required = ['serverUrl', 'tenantId', 'clientId', 'clientSecret'];
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
