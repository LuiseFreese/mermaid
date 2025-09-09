/**
 * CDM Entity Registry for Tests
 * Mock implementation for testing
 */

class CDMEntityRegistry {
    constructor() {
        this.entities = new Map();
        this.loadMockEntities();
    }

    loadMockEntities() {
        // Load mock CDM entities for testing
        const mockEntities = [
            {
                logicalName: 'account',
                displayName: 'Account',
                description: 'Business that represents a customer or potential customer.',
                keyAttributes: ['accountid', 'name', 'primarycontactid'],
                commonAliases: ['Account', 'Customer', 'Company', 'Organization']
            },
            {
                logicalName: 'contact',
                displayName: 'Contact',
                description: 'Person with whom a business unit has a relationship.',
                keyAttributes: ['contactid', 'fullname', 'firstname', 'lastname'],
                commonAliases: ['Contact', 'Person', 'Individual']
            },
            {
                logicalName: 'lead',
                displayName: 'Lead',
                description: 'Prospect or potential customer for products or services.',
                keyAttributes: ['leadid', 'fullname', 'companyname'],
                commonAliases: ['Lead', 'Prospect']
            },
            {
                logicalName: 'opportunity',
                displayName: 'Opportunity',
                description: 'Potential revenue-generating event.',
                keyAttributes: ['opportunityid', 'name', 'estimatedvalue'],
                commonAliases: ['Opportunity', 'Deal', 'Sale']
            }
        ];

        mockEntities.forEach(entity => {
            this.entities.set(entity.logicalName, entity);
        });
    }

    /**
     * Detect CDM entities from parsed ERD entities
     * @param {Array} erdEntities - Parsed ERD entities
     * @returns {Object} CDM detection results
     */
    detectCDMEntities(erdEntities) {
        const matches = [];
        
        erdEntities.forEach(entity => {
            // Simple name matching
            const cdmEntity = this.findCDMEntityByName(entity.name);
            if (cdmEntity) {
                matches.push({
                    originalEntity: entity,
                    cdmEntity: cdmEntity,
                    matchType: 'exact',
                    confidence: 1.0,
                    matchReasons: ['Name match'],
                    attributes: cdmEntity.keyAttributes
                });
            }
        });

        return {
            matches,
            detectedCDM: matches,
            recommendations: [],
            report: {
                totalEntitiesAnalyzed: erdEntities.length,
                cdmMatchesFound: matches.length,
                customEntities: erdEntities.length - matches.length
            }
        };
    }

    /**
     * Find CDM entity by name (case-insensitive)
     * @param {string} name - Entity name
     * @returns {Object|null} CDM entity or null
     */
    findCDMEntityByName(name) {
        const lowercaseName = name.toLowerCase();
        
        // Direct match
        if (this.entities.has(lowercaseName)) {
            return this.entities.get(lowercaseName);
        }

        // Alias match
        for (const [, entity] of this.entities) {
            if (entity.commonAliases.some(alias => 
                alias.toLowerCase() === lowercaseName
            )) {
                return entity;
            }
        }

        return null;
    }

    /**
     * Get all CDM entities
     * @returns {Array} All CDM entities
     */
    getAllEntities() {
        return Array.from(this.entities.values());
    }
}

module.exports = {
    CDMEntityRegistry
};
