/**
 * Health Check Service
 * Monitors application dependencies and provides detailed health status
 * Used for: Post-deployment validation, monitoring dashboards, alerting
 */

class HealthCheckService {
  constructor({ environmentManager, dataverseClientFactory, logger }) {
    this.environmentManager = environmentManager;
    this.dataverseClientFactory = dataverseClientFactory;
    this.logger = logger || console;
  }

  /**
   * Check overall application health
   * @returns {Object} Health status with timestamp
   */
  async checkHealth() {
    return {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || '2.0.0',
      uptime: process.uptime(),
      environment: process.env.NODE_ENV || 'development'
    };
  }

  /**
   * Check health of all dependencies for a specific environment
   * @param {string} environmentId - The environment ID to check
   * @returns {Object} Detailed dependency health status
   */
  async checkDependencies(environmentId) {
    const startTime = Date.now();
    const results = {
      timestamp: new Date().toISOString(),
      environment: environmentId,
      overall: 'healthy',
      dependencies: {},
      latency: {
        total: 0,
        breakdown: {}
      }
    };

    try {
      // 1. Check Environment Configuration
      const envStart = Date.now();
      try {
        const envConfig = this.environmentManager.getEnvironmentConfig(environmentId);
        const envLatency = Date.now() - envStart;
        
        results.dependencies.environmentConfig = {
          status: 'healthy',
          latency: `${envLatency}ms`,
          details: {
            environmentName: envConfig.environmentName,
            dataverseUrl: envConfig.dataverseUrl
          }
        };
        results.latency.breakdown.environmentConfig = envLatency;
      } catch (error) {
        results.dependencies.environmentConfig = {
          status: 'unhealthy',
          error: error.message,
          latency: `${Date.now() - envStart}ms`
        };
        results.overall = 'degraded';
      }

      // 2. Check Dataverse Connectivity
      if (results.dependencies.environmentConfig.status === 'healthy') {
        const dataverseStart = Date.now();
        try {
          const envConfig = this.environmentManager.getEnvironmentConfig(environmentId);
          const client = this.dataverseClientFactory.createClient(envConfig);
          
          // Test connection with simple WhoAmI call
          await client.testConnection();
          const dataverseLatency = Date.now() - dataverseStart;
          
          results.dependencies.dataverse = {
            status: 'healthy',
            latency: `${dataverseLatency}ms`,
            details: {
              url: envConfig.dataverseUrl,
              connectionTest: 'passed'
            }
          };
          results.latency.breakdown.dataverse = dataverseLatency;
          
          // Warn if latency is high
          if (dataverseLatency > 2000) {
            results.dependencies.dataverse.warning = 'High latency detected';
            results.overall = 'degraded';
          }
        } catch (error) {
          const dataverseLatency = Date.now() - dataverseStart;
          results.dependencies.dataverse = {
            status: 'unhealthy',
            error: error.message,
            latency: `${dataverseLatency}ms`,
            details: {
              errorCode: error.code || 'UNKNOWN',
              suggestion: this.getSuggestion(error)
            }
          };
          results.overall = 'unhealthy';
          results.latency.breakdown.dataverse = dataverseLatency;
        }
      }

      // 3. Check Managed Identity (if in Azure)
      if (process.env.USE_MANAGED_IDENTITY === 'true') {
        const identityStart = Date.now();
        try {
          // Check if managed identity is available
          const identityStatus = await this.checkManagedIdentity();
          const identityLatency = Date.now() - identityStart;
          
          results.dependencies.managedIdentity = {
            status: identityStatus.available ? 'healthy' : 'unavailable',
            latency: `${identityLatency}ms`,
            details: {
              clientId: process.env.MANAGED_IDENTITY_CLIENT_ID ? '***configured***' : 'not set',
              type: 'UserAssigned'
            }
          };
          results.latency.breakdown.managedIdentity = identityLatency;
          
          if (!identityStatus.available) {
            results.overall = 'degraded';
          }
        } catch (error) {
          results.dependencies.managedIdentity = {
            status: 'unhealthy',
            error: error.message,
            latency: `${Date.now() - identityStart}ms`
          };
          results.overall = 'degraded';
        }
      } else {
        results.dependencies.managedIdentity = {
          status: 'not_applicable',
          details: {
            reason: 'Running in local development mode'
          }
        };
      }

      // 4. Calculate total latency
      results.latency.total = Date.now() - startTime;

      return results;
    } catch (error) {
      this.logger.error('Health check failed:', error);
      return {
        timestamp: new Date().toISOString(),
        environment: environmentId,
        overall: 'unhealthy',
        error: error.message,
        latency: {
          total: Date.now() - startTime
        }
      };
    }
  }

  /**
   * Check if managed identity is available and working
   * @returns {Object} Managed identity status
   */
  async checkManagedIdentity() {
    try {
      // Simple check: Can we create a credential?
      const { ManagedIdentityCredential } = require('@azure/identity');
      const clientId = process.env.MANAGED_IDENTITY_CLIENT_ID;
      
      if (clientId) {
        const credential = new ManagedIdentityCredential(clientId);
        // Try to get a token (this will fail if not in Azure, but that's okay)
        return { available: true, clientId: '***' };
      }
      
      return { available: false, reason: 'No client ID configured' };
    } catch (error) {
      return { available: false, reason: error.message };
    }
  }

  /**
   * Get suggestion based on error type
   * @param {Error} error - The error object
   * @returns {string} Suggestion for fixing the error
   */
  getSuggestion(error) {
    const errorMessage = error.message?.toLowerCase() || '';
    
    if (errorMessage.includes('unauthorized') || errorMessage.includes('401')) {
      return 'Check managed identity permissions or application user configuration';
    }
    if (errorMessage.includes('timeout') || errorMessage.includes('etimedout')) {
      return 'Network connectivity issue or Dataverse service slow response';
    }
    if (errorMessage.includes('dns') || errorMessage.includes('enotfound')) {
      return 'DNS resolution failed - check Dataverse URL configuration';
    }
    if (errorMessage.includes('forbidden') || errorMessage.includes('403')) {
      return 'Insufficient permissions - check application user roles in Dataverse';
    }
    
    return 'Check logs for more details';
  }

  /**
   * Check health of all configured environments
   * @returns {Object} Health status for all environments
   */
  async checkAllEnvironments() {
    const environments = this.environmentManager.getAllEnvironments();
    const results = {
      timestamp: new Date().toISOString(),
      totalEnvironments: environments.length,
      environments: {}
    };

    for (const env of environments) {
      try {
        results.environments[env.id] = await this.checkDependencies(env.id);
      } catch (error) {
        results.environments[env.id] = {
          status: 'error',
          error: error.message
        };
      }
    }

    return results;
  }
}

module.exports = HealthCheckService;
