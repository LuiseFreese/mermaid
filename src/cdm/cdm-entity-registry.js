/**
 * CDM Entity Registry
 * Main module for CDM entity detection and integration
 */

const CDMDetector = require('./cdm-detector');
const CDMIntegrator = require('./cdm-integrator');

class CDMEntityRegistry {
  constructor(dataverseClient = null) {
    this.detector = new CDMDetector();
    this.integrator = dataverseClient ? new CDMIntegrator(dataverseClient) : null;
    this.verbose = true;
  }

  /**
   * Process Mermaid entities for CDM detection and integration
   * @param {Array} mermaidEntities - Array of parsed Mermaid entities
   * @param {Object} options - Processing options
   * @returns {Object} Processing results
   */
  async processMermaidEntities(mermaidEntities, options = {}) {
    const {
      solutionName = null,
      autoIntegrate = false,
      generateReport = true,
      updateDiagram = false
    } = options;

    const results = {
      detection: null,
      integration: null,
      diagram: null,
      summary: null,
      recommendations: []
    };

    try {
      // Phase 1: Detect CDM entities
      if (this.verbose) {
        console.log(`🔍 Analyzing ${mermaidEntities.length} entities for CDM matches...`);
      }

      results.detection = this.detector.detectCDMEntities(mermaidEntities);

      if (this.verbose) {
        console.log(`📊 CDM Detection Results:`);
        console.log(`   • Total entities: ${results.detection.summary.totalEntities}`);
        console.log(`   • CDM matches: ${results.detection.summary.cdmMatches}`);
        console.log(`   • Custom entities: ${results.detection.summary.customEntities}`);
        console.log(`   • Confidence: ${results.detection.summary.confidenceLevel}`);
      }

      // Phase 2: Integration (if requested and integrator available)
      if (autoIntegrate && this.integrator && solutionName && results.detection.detectedCDM.length > 0) {
        if (this.verbose) {
          console.log(`🔄 Auto-integrating ${results.detection.detectedCDM.length} CDM entities...`);
        }

        results.integration = await this.integrator.integrateCDMEntities(
          results.detection.detectedCDM,
          solutionName
        );
      }

      // Phase 3: Generate summary report
      if (generateReport) {
        results.summary = this.generateProcessingSummary(results);
      }

      // Phase 4: Generate diagram updates (if requested)
      if (updateDiagram && results.detection.detectedCDM.length > 0) {
        results.diagram = this.generateDiagramUpdates(results.detection);
      }

      // Phase 5: Generate overall recommendations
      results.recommendations = this.generateOverallRecommendations(results);

    } catch (error) {
      console.error('❌ CDM processing failed:', error);
      throw error;
    }

    return results;
  }

  /**
   * Get CDM detection results only (no integration)
   * @param {Array} mermaidEntities - Array of parsed Mermaid entities
   * @returns {Object} Detection results
   */
  detectCDMEntities(mermaidEntities) {
    return this.detector.detectCDMEntities(mermaidEntities);
  }

  /**
   * Integrate specific CDM entities
   * @param {Array} cdmMatches - Array of CDM matches to integrate
   * @param {string} solutionName - Target solution name
   * @returns {Object} Integration results
   */
  async integrateCDMEntities(cdmMatches, solutionName) {
    if (!this.integrator) {
      throw new Error('CDM Integrator not available - Dataverse client required');
    }

    return await this.integrator.integrateCDMEntities(cdmMatches, solutionName);
  }

  /**
   * Generate processing summary
   * @param {Object} results - Processing results
   * @returns {Object} Summary
   */
  generateProcessingSummary(results) {
    const summary = {
      timestamp: new Date().toISOString(),
      processing: {
        entitiesAnalyzed: results.detection.summary.totalEntities,
        cdmEntitiesDetected: results.detection.summary.cdmMatches,
        customEntities: results.detection.summary.customEntities,
        confidenceLevel: results.detection.summary.confidenceLevel
      },
      detection: {
        exactMatches: results.detection.detectedCDM.filter(d => d.matchType === 'exact').length,
        aliasMatches: results.detection.detectedCDM.filter(d => d.matchType === 'alias').length,
        fuzzyMatches: results.detection.detectedCDM.filter(d => d.matchType === 'fuzzy').length
      },
      integration: results.integration ? {
        attempted: results.integration.summary.totalCDMEntities,
        successful: results.integration.summary.successfulIntegrations,
        failed: results.integration.summary.failedIntegrations,
        relationshipsAvailable: results.integration.summary.relationshipsCreated
      } : null,
      cdmEntitiesFound: results.detection.detectedCDM.map(d => ({
        original: d.originalEntity.name,
        cdm: d.cdmEntity.displayName,
        logicalName: d.cdmEntity.logicalName,
        matchType: d.matchType,
        confidence: d.confidence,
        category: d.cdmEntity.category
      }))
    };

    return summary;
  }

  /**
   * Generate diagram updates for CDM entities
   * @param {Object} detectionResults - CDM detection results
   * @returns {Object} Diagram update instructions
   */
  generateDiagramUpdates(detectionResults) {
    const updates = {
      entityReplacements: [],
      attributeEnhancements: [],
      relationshipSuggestions: [],
      visualIndicators: []
    };

    for (const match of detectionResults.detectedCDM) {
      const { originalEntity, cdmEntity } = match;

      // Entity replacement
      updates.entityReplacements.push({
        original: originalEntity.name,
        cdm: {
          name: cdmEntity.displayName,
          logicalName: cdmEntity.logicalName,
          description: cdmEntity.description,
          icon: this.getCDMEntityIcon(cdmEntity.category),
          color: this.getCDMEntityColor(cdmEntity.category)
        }
      });

      // Attribute enhancements
      const enhancedAttributes = this.getEnhancedAttributes(originalEntity, cdmEntity);
      if (enhancedAttributes.length > 0) {
        updates.attributeEnhancements.push({
          entity: cdmEntity.logicalName,
          attributes: enhancedAttributes
        });
      }

      // Visual indicators
      updates.visualIndicators.push({
        entity: cdmEntity.logicalName,
        indicator: {
          type: 'cdm',
          label: 'CDM',
          icon: '🏢',
          description: 'Common Data Model Entity'
        }
      });
    }

    // Relationship suggestions
    updates.relationshipSuggestions = this.generateRelationshipSuggestions(detectionResults.detectedCDM);

    return updates;
  }

  /**
   * Get enhanced attributes for diagram display
   * @param {Object} originalEntity - Original Mermaid entity
   * @param {Object} cdmEntity - CDM entity
   * @returns {Array} Enhanced attributes
   */
  getEnhancedAttributes(originalEntity, cdmEntity) {
    const enhanced = [];
    const originalAttrs = originalEntity.attributes || [];
    const cdmAttrs = cdmEntity.keyAttributes || [];

    // Show original attributes that match CDM attributes
    for (const origAttr of originalAttrs) {
      const attrName = origAttr.name || origAttr;
      const matchingCDMAttr = cdmAttrs.find(cdmAttr => 
        this.detector.normalizeEntityName(attrName) === this.detector.normalizeEntityName(cdmAttr)
      );

      if (matchingCDMAttr) {
        enhanced.push({
          name: matchingCDMAttr,
          type: origAttr.type || 'string',
          source: 'matched',
          description: `Mapped to CDM attribute: ${matchingCDMAttr}`
        });
      }
    }

    // Add key CDM attributes not in original
    const keyAttributesToShow = ['name', 'statuscode', 'statecode', 'createdon', 'modifiedon'];
    for (const keyAttr of keyAttributesToShow) {
      if (cdmAttrs.includes(keyAttr) && !enhanced.some(e => e.name === keyAttr)) {
        enhanced.push({
          name: keyAttr,
          type: this.getCDMAttributeType(keyAttr),
          source: 'cdm',
          description: `Standard CDM attribute`
        });
      }
    }

    return enhanced.slice(0, 10); // Limit to 10 attributes for readability
  }

  /**
   * Generate relationship suggestions between CDM entities
   * @param {Array} cdmMatches - Detected CDM entities
   * @returns {Array} Relationship suggestions
   */
  generateRelationshipSuggestions(cdmMatches) {
    const suggestions = [];
    const entityNames = cdmMatches.map(m => m.cdmEntity.logicalName);

    // Standard CDM relationships
    const standardRelationships = [
      { from: 'account', to: 'contact', name: 'Primary Contact', type: 'one-to-many' },
      { from: 'account', to: 'opportunity', name: 'Account Opportunities', type: 'one-to-many' },
      { from: 'contact', to: 'opportunity', name: 'Contact Opportunities', type: 'one-to-many' },
      { from: 'opportunity', to: 'quote', name: 'Opportunity Quotes', type: 'one-to-many' },
      { from: 'quote', to: 'salesorder', name: 'Quote Orders', type: 'one-to-many' },
      { from: 'salesorder', to: 'invoice', name: 'Order Invoices', type: 'one-to-many' }
    ];

    for (const rel of standardRelationships) {
      if (entityNames.includes(rel.from) && entityNames.includes(rel.to)) {
        suggestions.push({
          from: rel.from,
          to: rel.to,
          name: rel.name,
          type: rel.type,
          standard: true,
          description: `Standard CDM relationship between ${rel.from} and ${rel.to}`
        });
      }
    }

    return suggestions;
  }

  /**
   * Generate overall recommendations
   * @param {Object} results - Processing results
   * @returns {Array} Recommendations
   */
  generateOverallRecommendations(results) {
    const recommendations = [];

    if (results.detection.summary.cdmMatches > 0) {
      recommendations.push({
        type: 'detection',
        priority: 'high',
        title: 'CDM Entities Detected',
        description: `Found ${results.detection.summary.cdmMatches} entities that match Common Data Model entities.`,
        action: 'Consider using CDM entities instead of creating custom ones for better integration and functionality.',
        benefits: [
          'Pre-built attributes and business logic',
          'Standard relationships with other CDM entities',
          'Microsoft-maintained schema updates',
          'Better integration with Dynamics 365 and Power Platform'
        ]
      });
    }

    if (results.integration && results.integration.summary.successfulIntegrations > 0) {
      recommendations.push({
        type: 'integration',
        priority: 'medium',
        title: 'CDM Integration Successful',
        description: `Successfully integrated ${results.integration.summary.successfulIntegrations} CDM entities.`,
        action: 'Configure security roles and business rules for the integrated CDM entities.',
        nextSteps: [
          'Set up appropriate security roles',
          'Configure business rules and workflows',
          'Customize forms and views as needed',
          'Test data integration and relationships'
        ]
      });
    }

    if (results.detection.summary.customEntities > 0) {
      recommendations.push({
        type: 'custom',
        priority: 'low',
        title: 'Custom Entities Identified',
        description: `${results.detection.summary.customEntities} entities will be created as custom entities.`,
        action: 'Review custom entities to ensure they don\'t duplicate existing functionality.',
        considerations: [
          'Check if similar CDM entities exist',
          'Consider extending CDM entities instead',
          'Plan for future data migration if needed'
        ]
      });
    }

    return recommendations;
  }

  /**
   * Get CDM entity icon based on category
   * @param {string} category - CDM entity category
   * @returns {string} Icon emoji
   */
  getCDMEntityIcon(category) {
    const icons = {
      sales: '💼',
      service: '🛠️',
      marketing: '📢',
      activity: '📅',
      default: '🏢'
    };
    return icons[category] || icons.default;
  }

  /**
   * Get CDM entity color based on category
   * @param {string} category - CDM entity category
   * @returns {string} Color hex code
   */
  getCDMEntityColor(category) {
    const colors = {
      sales: '#0078d4',      // Microsoft blue
      service: '#107c10',    // Green
      marketing: '#ff8c00',  // Orange
      activity: '#5c2d91',   // Purple
      default: '#323130'     // Gray
    };
    return colors[category] || colors.default;
  }

  /**
   * Get CDM attribute type for diagram display
   * @param {string} attributeName - CDM attribute name
   * @returns {string} Attribute type
   */
  getCDMAttributeType(attributeName) {
    const typeMap = {
      name: 'string',
      statuscode: 'choice',
      statecode: 'choice',
      createdon: 'datetime',
      modifiedon: 'datetime',
      ownerid: 'lookup'
    };
    return typeMap[attributeName] || 'string';
  }

  /**
   * Get all available CDM entities
   * @returns {Object} CDM entities
   */
  getAllCDMEntities() {
    return this.detector.getAllCDMEntities();
  }

  /**
   * Search CDM entities by name or category
   * @param {string} searchTerm - Search term
   * @param {string} category - Optional category filter
   * @returns {Array} Matching CDM entities
   */
  searchCDMEntities(searchTerm, category = null) {
    const allEntities = this.detector.getAllCDMEntities();
    const results = [];

    for (const [key, entity] of Object.entries(allEntities)) {
      // Category filter
      if (category && entity.category !== category) {
        continue;
      }

      // Search in name, display name, description, and aliases
      const searchFields = [
        entity.logicalName,
        entity.displayName,
        entity.description,
        ...(entity.commonAliases || [])
      ].join(' ').toLowerCase();

      if (searchFields.includes(searchTerm.toLowerCase())) {
        results.push(entity);
      }
    }

    return results;
  }
}

module.exports = CDMEntityRegistry;
