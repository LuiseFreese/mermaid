/**
 * Performance Monitor for Deployment Operations
 * Tracks and reports deployment performance metrics
 */

class PerformanceMonitor {
    constructor() {
        this.metrics = new Map();
        this.startTimes = new Map();
    }

    /**
     * Start tracking an operation
     * @param {string} operationId - Unique identifier for the operation
     * @param {string} operationType - Type of operation (deployment, entity-creation, etc.)
     * @param {Object} metadata - Additional metadata about the operation
     */
    startOperation(operationId, operationType, metadata = {}) {
        const startTime = Date.now();
        this.startTimes.set(operationId, {
            startTime,
            operationType,
            metadata
        });
        
        console.log(`🚀 Performance: Started ${operationType} (${operationId})`);
        return startTime;
    }

    /**
     * End tracking an operation and record metrics
     * @param {string} operationId - Unique identifier for the operation
     * @param {Object} results - Results of the operation
     */
    endOperation(operationId, results = {}) {
        const endTime = Date.now();
        const operationData = this.startTimes.get(operationId);
        
        if (!operationData) {
            console.warn(`⚠️ Performance: No start time found for operation ${operationId}`);
            return null;
        }

        const duration = endTime - operationData.startTime;
        const metrics = {
            operationId,
            operationType: operationData.operationType,
            startTime: operationData.startTime,
            endTime,
            duration,
            metadata: operationData.metadata,
            results: results ? {
                success: results.success !== undefined ? results.success : false,
                entitiesCreated: results.entitiesCreated || 0,
                relationshipsCreated: results.relationshipsCreated || 0,
                errors: results.errors?.length || 0,
                apiCalls: results.performance?.apiCalls || 0
            } : {
                success: false,
                entitiesCreated: 0,
                relationshipsCreated: 0,
                errors: 0,
                apiCalls: 0
            }
        };

        this.metrics.set(operationId, metrics);
        this.startTimes.delete(operationId);

        this.logMetrics(metrics);
        return metrics;
    }

    /**
     * Log performance metrics
     * @param {Object} metrics - Performance metrics to log
     */
    logMetrics(metrics) {
        const {
            operationType,
            duration,
            results,
            metadata
        } = metrics;

        console.log(`✅ Performance: Completed ${operationType} in ${duration}ms`);
        
        if (results.entitiesCreated > 0) {
            const avgEntityTime = duration / results.entitiesCreated;
            console.log(`   📊 Entity Performance: ${results.entitiesCreated} entities, ${avgEntityTime.toFixed(0)}ms per entity`);
        }

        if (results.relationshipsCreated > 0) {
            console.log(`   🔗 Relationships: ${results.relationshipsCreated} created`);
        }

        if (results.apiCalls > 0) {
            const avgApiTime = duration / results.apiCalls;
            console.log(`   📡 API Performance: ${results.apiCalls} calls, ${avgApiTime.toFixed(0)}ms per call`);
        }

        if (results.errors > 0) {
            console.log(`   ⚠️ Errors: ${results.errors} errors encountered`);
        }

        // Log optimization effectiveness for deployments
        if (operationType === 'deployment' && metadata.entityCount) {
            const entitiesPerMinute = (results.entitiesCreated / duration) * 60000;
            console.log(`   🎯 Deployment Rate: ${entitiesPerMinute.toFixed(1)} entities/minute`);
            
            // Compare with baseline (old sequential approach)
            const estimatedOldTime = this.estimateSequentialTime(metadata.entityCount, metadata.attributeCount);
            if (estimatedOldTime > duration) {
                const improvement = ((estimatedOldTime - duration) / estimatedOldTime * 100);
                console.log(`   🚀 Performance Improvement: ~${improvement.toFixed(0)}% faster than sequential approach`);
            }
        }
    }

    /**
     * Estimate time for sequential approach (for comparison)
     * @param {number} entityCount - Number of entities
     * @param {number} attributeCount - Number of attributes
     * @returns {number} Estimated time in milliseconds
     */
    estimateSequentialTime(entityCount, attributeCount = 0) {
        // Based on analysis of original code:
        // - 5 seconds per entity creation
        // - 4 seconds fixed wait per entity
        // - 1 second per attribute
        // - 25 seconds fixed wait before relationships
        const entityTime = entityCount * (5000 + 4000); // Entity + wait
        const attributeTime = attributeCount * 1000;
        const relationshipWait = 25000;
        
        return entityTime + attributeTime + relationshipWait;
    }

    /**
     * Get metrics for a specific operation
     * @param {string} operationId - Operation ID
     * @returns {Object|null} Metrics object or null if not found
     */
    getMetrics(operationId) {
        return this.metrics.get(operationId) || null;
    }

    /**
     * Get all metrics
     * @returns {Array} Array of all metrics
     */
    getAllMetrics() {
        return Array.from(this.metrics.values());
    }

    /**
     * Get performance summary for recent operations
     * @param {number} limit - Number of recent operations to include
     * @returns {Object} Performance summary
     */
    getPerformanceSummary(limit = 10) {
        const recentMetrics = Array.from(this.metrics.values())
            .sort((a, b) => b.endTime - a.endTime)
            .slice(0, limit);

        if (recentMetrics.length === 0) {
            return { message: 'No performance data available' };
        }

        const summary = {
            totalOperations: recentMetrics.length,
            averageDuration: recentMetrics.reduce((sum, m) => sum + m.duration, 0) / recentMetrics.length,
            totalEntitiesCreated: recentMetrics.reduce((sum, m) => sum + m.results.entitiesCreated, 0),
            totalRelationshipsCreated: recentMetrics.reduce((sum, m) => sum + m.results.relationshipsCreated, 0),
            totalApiCalls: recentMetrics.reduce((sum, m) => sum + m.results.apiCalls, 0),
            totalErrors: recentMetrics.reduce((sum, m) => sum + m.results.errors, 0),
            operationTypes: {}
        };

        // Group by operation type
        recentMetrics.forEach(metric => {
            const type = metric.operationType;
            if (!summary.operationTypes[type]) {
                summary.operationTypes[type] = {
                    count: 0,
                    totalDuration: 0,
                    averageDuration: 0
                };
            }
            summary.operationTypes[type].count++;
            summary.operationTypes[type].totalDuration += metric.duration;
        });

        // Calculate averages
        Object.keys(summary.operationTypes).forEach(type => {
            const typeData = summary.operationTypes[type];
            typeData.averageDuration = typeData.totalDuration / typeData.count;
        });

        return summary;
    }

    /**
     * Clear old metrics to prevent memory leaks
     * @param {number} maxAge - Maximum age in milliseconds (default: 1 hour)
     */
    cleanupOldMetrics(maxAge = 3600000) {
        const now = Date.now();
        const metricsToDelete = [];

        this.metrics.forEach((metric, operationId) => {
            if (now - metric.endTime > maxAge) {
                metricsToDelete.push(operationId);
            }
        });

        metricsToDelete.forEach(operationId => {
            this.metrics.delete(operationId);
        });

        if (metricsToDelete.length > 0) {
            console.log(`🧹 Performance: Cleaned up ${metricsToDelete.length} old metrics`);
        }
    }
}

// Create global instance
const performanceMonitor = new PerformanceMonitor();

// Cleanup old metrics every 30 minutes
let cleanupInterval;
if (process.env.NODE_ENV !== 'test') {
    cleanupInterval = setInterval(() => {
        performanceMonitor.cleanupOldMetrics();
    }, 1800000);
}

module.exports = {
    PerformanceMonitor,
    clearCleanupInterval: () => {
        if (cleanupInterval) {
            clearInterval(cleanupInterval);
            cleanupInterval = null;
        }
    },
    performanceMonitor
};
