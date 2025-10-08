/**
 * Rollback Status Tracker
 * Manages in-memory tracking of active and completed rollback operations
 */

class RollbackStatusTracker {
    constructor() {
        // In-memory storage for rollback statuses
        this.rollbacks = new Map();
        
        // Auto-cleanup completed rollbacks after 1 hour
        this.cleanupIntervalMs = 60 * 60 * 1000; // 1 hour
        this.startCleanupTimer();
    }

    /**
     * Create a new rollback tracking entry
     * @param {string} rollbackId - Unique rollback identifier
     * @param {string} deploymentId - Deployment being rolled back
     * @returns {Object} Initial rollback status
     */
    create(rollbackId, deploymentId) {
        const status = {
            rollbackId,
            deploymentId,
            status: 'pending', // pending, in-progress, completed, failed
            startTime: new Date().toISOString(),
            endTime: null,
            progress: {
                current: 0,
                total: 0,
                percentage: 0,
                message: 'Initializing rollback...'
            },
            result: null,
            error: null
        };

        this.rollbacks.set(rollbackId, status);
        console.log(`📊 Rollback tracker: Created tracking for ${rollbackId}`);
        return status;
    }

    /**
     * Get rollback status
     * @param {string} rollbackId - Rollback identifier
     * @returns {Object|null} Rollback status or null if not found
     */
    get(rollbackId) {
        return this.rollbacks.get(rollbackId) || null;
    }

    /**
     * Update rollback status
     * @param {string} rollbackId - Rollback identifier
     * @param {string} status - New status (pending, in-progress, completed, failed)
     */
    updateStatus(rollbackId, status) {
        const rollback = this.rollbacks.get(rollbackId);
        if (!rollback) {
            console.warn(`⚠️ Rollback tracker: Cannot update status for unknown rollback ${rollbackId}`);
            return;
        }

        rollback.status = status;
        
        if (status === 'completed' || status === 'failed') {
            rollback.endTime = new Date().toISOString();
        }

        console.log(`📊 Rollback tracker: Updated ${rollbackId} status to ${status}`);
    }

    /**
     * Update rollback progress
     * @param {string} rollbackId - Rollback identifier
     * @param {number} current - Current progress value
     * @param {number} total - Total progress value
     * @param {string} message - Progress message
     */
    updateProgress(rollbackId, current, total, message) {
        const rollback = this.rollbacks.get(rollbackId);
        if (!rollback) {
            console.warn(`⚠️ Rollback tracker: Cannot update progress for unknown rollback ${rollbackId}`);
            return;
        }

        rollback.progress = {
            current,
            total,
            percentage: total > 0 ? Math.round((current / total) * 100) : 0,
            message
        };

        console.log(`📊 Rollback tracker: ${rollbackId} progress: ${current}/${total} - ${message}`);
    }

    /**
     * Set rollback result (success)
     * @param {string} rollbackId - Rollback identifier
     * @param {Object} result - Rollback result data
     */
    setResult(rollbackId, result) {
        const rollback = this.rollbacks.get(rollbackId);
        if (!rollback) {
            console.warn(`⚠️ Rollback tracker: Cannot set result for unknown rollback ${rollbackId}`);
            return;
        }

        rollback.result = result;
        rollback.status = 'completed';
        rollback.endTime = new Date().toISOString();
        
        console.log(`✅ Rollback tracker: ${rollbackId} completed successfully`);
    }

    /**
     * Set rollback error (failure)
     * @param {string} rollbackId - Rollback identifier
     * @param {Error|string} error - Error object or message
     */
    setError(rollbackId, error) {
        const rollback = this.rollbacks.get(rollbackId);
        if (!rollback) {
            console.warn(`⚠️ Rollback tracker: Cannot set error for unknown rollback ${rollbackId}`);
            return;
        }

        rollback.error = error instanceof Error ? error.message : error;
        rollback.status = 'failed';
        rollback.endTime = new Date().toISOString();
        
        console.log(`❌ Rollback tracker: ${rollbackId} failed: ${rollback.error}`);
    }

    /**
     * Remove a rollback from tracking
     * @param {string} rollbackId - Rollback identifier
     */
    remove(rollbackId) {
        const deleted = this.rollbacks.delete(rollbackId);
        if (deleted) {
            console.log(`🗑️ Rollback tracker: Removed ${rollbackId}`);
        }
    }

    /**
     * Get all rollback statuses
     * @returns {Array} Array of all rollback statuses
     */
    getAll() {
        return Array.from(this.rollbacks.values());
    }

    /**
     * Start automatic cleanup of old completed rollbacks
     */
    startCleanupTimer() {
        setInterval(() => {
            this.cleanupOldRollbacks();
        }, this.cleanupIntervalMs);
    }

    /**
     * Remove completed/failed rollbacks older than 1 hour
     */
    cleanupOldRollbacks() {
        const now = Date.now();
        const maxAgeMs = 60 * 60 * 1000; // 1 hour
        let cleaned = 0;

        for (const [rollbackId, rollback] of this.rollbacks.entries()) {
            if (rollback.status === 'completed' || rollback.status === 'failed') {
                const endTime = new Date(rollback.endTime).getTime();
                if (now - endTime > maxAgeMs) {
                    this.rollbacks.delete(rollbackId);
                    cleaned++;
                }
            }
        }

        if (cleaned > 0) {
            console.log(`🧹 Rollback tracker: Cleaned up ${cleaned} old rollback(s)`);
        }
    }
}

module.exports = { RollbackStatusTracker };
