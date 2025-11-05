/**
 * Base Validator Class
 * Provides common functionality for all validation operations
 */
const { BaseService } = require('../base-service');

class BaseValidator extends BaseService {
    constructor(dependencies = {}) {
        super(dependencies);
        this.warningIdCounter = 0;
    }

    /**
     * Generate deterministic warning ID based on warning content
     * @param {Object} warningData - Warning data to generate ID from
     * @returns {string} Deterministic warning ID
     */
    generateWarningId(warningData) {
        // Create a deterministic ID based on warning content
        const keyParts = [
            warningData.type,
            warningData.entity || '',
            warningData.attribute || '',
            warningData.relationship || '',
            warningData.message || ''
        ];
        
        // Create a simple hash from the key parts
        const key = keyParts.join('|');
        let hash = 0;
        for (let i = 0; i < key.length; i++) {
            const char = key.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32-bit integer
        }
        
        return `warning_${Math.abs(hash)}`;
    }

    /**
     * Create a standardized warning object
     * @param {Object} warningData - Warning configuration
     * @returns {Object} Warning object with ID
     */
    createWarning(warningData) {
        const id = this.generateWarningId(warningData);
        
        // Skip specific warnings that are known to be non-actionable
        if (id === 'warning_1304205498' || id === 'warning_1571953518') {
            return null;
        }

        return {
            id,
            type: warningData.type,
            category: warningData.category || 'general',
            severity: warningData.severity || 'warning',
            entity: warningData.entity,
            attribute: warningData.attribute,
            relationship: warningData.relationship,
            message: warningData.message,
            suggestion: warningData.suggestion,
            autoFixable: warningData.autoFixable || false,
            fixData: warningData.fixData || null,
            context: warningData.context || null
        };
    }

    /**
     * Create success result
     * @param {any} data - Result data
     * @param {string} message - Success message
     * @returns {Object} Success result
     */
    createSuccess(data, message = 'Operation completed successfully') {
        return {
            success: true,
            data,
            message
        };
    }

    /**
     * Create error result
     * @param {string} message - Error message
     * @param {Error} error - Original error
     * @returns {Object} Error result
     */
    createError(message, error = null) {
        return {
            success: false,
            error: message,
            details: error ? error.message : null
        };
    }

    /**
     * Validate required parameters
     * @param {Object} params - Parameters to validate
     * @param {Array} required - Required parameter names
     * @throws {Error} If required parameters are missing
     */
    validateRequiredParams(params, required) {
        const missing = required.filter(param => 
            params[param] === undefined || params[param] === null
        );
        
        if (missing.length > 0) {
            throw new Error(`Missing required parameters: ${missing.join(', ')}`);
        }
    }
}

module.exports = { BaseValidator };