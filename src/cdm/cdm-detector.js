/**
 * CDM Entity Detector
 * Detects when Mermaid entities match Common Data Model entities
 */

const fs = require('fs');
const path = require('path');

class CDMDetector {
  constructor() {
    this.cdmData = null;
    this.loadCDMData();
  }

  /**
   * Load CDM entity data from JSON file
   */
  loadCDMData() {
    try {
      const cdmDataPath = path.join(__dirname, 'cdm-data.json');
      const data = fs.readFileSync(cdmDataPath, 'utf8');
      this.cdmData = JSON.parse(data);
      console.log(`📊 Loaded ${this.cdmData.metadata.totalEntities} CDM entities`);
    } catch (error) {
      console.error('❌ Failed to load CDM data:', error.message);
      this.cdmData = { cdmEntities: {}, metadata: { totalEntities: 0 } };
    }
  }

  /**
   * Detect CDM entities in a list of Mermaid entities
   * @param {Array} mermaidEntities - Array of entity objects from Mermaid parser
   * @returns {Object} Detection results
   */
  detectCDMEntities(mermaidEntities) {
    const results = {
      detectedCDM: [],
      customEntities: [],
      recommendations: [],
      summary: {
        totalEntities: mermaidEntities.length,
        cdmMatches: 0,
        customEntities: 0,
        confidenceLevel: 'low'
      }
    };

    // Process each entity
    for (const entity of mermaidEntities) {
      const detection = this.detectSingleEntity(entity);
      
      if (detection.isCDMMatch) {
        results.detectedCDM.push({
          originalEntity: entity,
          cdmEntity: detection.cdmEntity,
          matchType: detection.matchType,
          confidence: detection.confidence,
          recommendation: this.generateRecommendation(entity, detection.cdmEntity)
        });
        results.summary.cdmMatches++;
      } else {
        results.customEntities.push(entity);
        results.summary.customEntities++;
      }
    }

    // Calculate overall confidence
    results.summary.confidenceLevel = this.calculateOverallConfidence(results.detectedCDM);
    
    // Generate integration recommendations
    results.recommendations = this.generateIntegrationRecommendations(results.detectedCDM);

    return results;
  }

  /**
   * Detect if a single entity matches a CDM entity
   * @param {Object} entity - Mermaid entity object
   * @returns {Object} Detection result
   */
  detectSingleEntity(entity) {
    if (!entity) {
      return { isCDMMatch: false };
    }
    
    const entityName = entity.name || entity.logicalName || '';
    
    if (!entityName) {
      return { isCDMMatch: false };
    }
    
    const normalizedName = this.normalizeEntityName(entityName);

    // Try different matching strategies
    const exactMatch = this.findExactMatch(normalizedName);
    if (exactMatch) {
      return {
        isCDMMatch: true,
        cdmEntity: exactMatch,
        matchType: 'exact',
        confidence: 0.95
      };
    }

    const aliasMatch = this.findAliasMatch(normalizedName);
    if (aliasMatch) {
      return {
        isCDMMatch: true,
        cdmEntity: aliasMatch,
        matchType: 'alias',
        confidence: 0.85
      };
    }

    const fuzzyMatch = this.findFuzzyMatch(normalizedName, entity);
    if (fuzzyMatch && fuzzyMatch.confidence > 0.7) {
      return {
        isCDMMatch: true,
        cdmEntity: fuzzyMatch.cdmEntity,
        matchType: 'fuzzy',
        confidence: fuzzyMatch.confidence
      };
    }

    return {
      isCDMMatch: false,
      cdmEntity: null,
      matchType: 'none',
      confidence: 0
    };
  }

  /**
   * Normalize entity name for comparison
   * @param {string} name - Raw entity name
   * @returns {string} Normalized name
   */
  normalizeEntityName(name) {
    if (!name) return '';
    
    return name
      .toLowerCase()
      .trim()
      .replace(/s$/, '') // Remove trailing 's' (plural)
      .replace(/[^a-z0-9]/g, ''); // Remove special characters
  }

  /**
   * Find exact match in CDM entities
   * @param {string} normalizedName - Normalized entity name
   * @returns {Object|null} CDM entity or null
   */
  findExactMatch(normalizedName) {
    const cdmEntities = this.cdmData.cdmEntities;
    
    for (const [key, cdmEntity] of Object.entries(cdmEntities)) {
      if (this.normalizeEntityName(cdmEntity.logicalName) === normalizedName ||
          this.normalizeEntityName(cdmEntity.displayName) === normalizedName) {
        return cdmEntity;
      }
    }
    
    return null;
  }

  /**
   * Find alias match in CDM entities
   * @param {string} normalizedName - Normalized entity name
   * @returns {Object|null} CDM entity or null
   */
  findAliasMatch(normalizedName) {
    const cdmEntities = this.cdmData.cdmEntities;
    
    for (const [key, cdmEntity] of Object.entries(cdmEntities)) {
      if (cdmEntity.commonAliases) {
        for (const alias of cdmEntity.commonAliases) {
          if (this.normalizeEntityName(alias) === normalizedName) {
            return cdmEntity;
          }
        }
      }
    }
    
    return null;
  }

  /**
   * Find fuzzy match based on attributes and context
   * @param {string} normalizedName - Normalized entity name
   * @param {Object} entity - Full entity object with attributes
   * @returns {Object|null} Match result with confidence
   */
  findFuzzyMatch(normalizedName, entity) {
    const cdmEntities = this.cdmData.cdmEntities;
    let bestMatch = null;
    let bestConfidence = 0;

    for (const [key, cdmEntity] of Object.entries(cdmEntities)) {
      const confidence = this.calculateFuzzyConfidence(normalizedName, entity, cdmEntity);
      
      if (confidence > bestConfidence) {
        bestConfidence = confidence;
        bestMatch = cdmEntity;
      }
    }

    return bestConfidence > 0.7 ? { cdmEntity: bestMatch, confidence: bestConfidence } : null;
  }

  /**
   * Calculate fuzzy match confidence
   * @param {string} normalizedName - Normalized entity name
   * @param {Object} entity - Mermaid entity
   * @param {Object} cdmEntity - CDM entity
   * @returns {number} Confidence score (0-1)
   */
  calculateFuzzyConfidence(normalizedName, entity, cdmEntity) {
    let confidence = 0;

    // Name similarity (using Levenshtein distance)
    const nameDistance = this.levenshteinDistance(
      normalizedName, 
      this.normalizeEntityName(cdmEntity.logicalName)
    );
    const maxLength = Math.max(normalizedName.length, cdmEntity.logicalName.length);
    const nameSimilarity = 1 - (nameDistance / maxLength);
    confidence += nameSimilarity * 0.4; // 40% weight on name

    // Attribute similarity
    if (entity.attributes && entity.attributes.length > 0) {
      const attributeMatches = this.countAttributeMatches(entity.attributes, cdmEntity.keyAttributes);
      const attributeSimilarity = attributeMatches / Math.max(entity.attributes.length, cdmEntity.keyAttributes.length);
      confidence += attributeSimilarity * 0.6; // 60% weight on attributes
    }

    return Math.min(confidence, 1); // Cap at 1.0
  }

  /**
   * Count matching attributes between entity and CDM entity
   * @param {Array} entityAttributes - Mermaid entity attributes
   * @param {Array} cdmAttributes - CDM entity key attributes
   * @returns {number} Number of matches
   */
  countAttributeMatches(entityAttributes, cdmAttributes) {
    let matches = 0;
    
    for (const attr of entityAttributes) {
      const normalizedAttr = this.normalizeEntityName(attr.name || attr);
      
      for (const cdmAttr of cdmAttributes) {
        const normalizedCDMAttr = this.normalizeEntityName(cdmAttr);
        
        if (normalizedAttr === normalizedCDMAttr || 
            this.levenshteinDistance(normalizedAttr, normalizedCDMAttr) <= 2) {
          matches++;
          break;
        }
      }
    }
    
    return matches;
  }

  /**
   * Calculate Levenshtein distance between two strings
   * @param {string} a - First string
   * @param {string} b - Second string
   * @returns {number} Edit distance
   */
  levenshteinDistance(a, b) {
    const matrix = [];

    for (let i = 0; i <= b.length; i++) {
      matrix[i] = [i];
    }

    for (let j = 0; j <= a.length; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= b.length; i++) {
      for (let j = 1; j <= a.length; j++) {
        if (b.charAt(i - 1) === a.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }

    return matrix[b.length][a.length];
  }

  /**
   * Generate recommendation for CDM entity usage
   * @param {Object} originalEntity - Mermaid entity
   * @param {Object} cdmEntity - Matched CDM entity
   * @returns {Object} Recommendation
   */
  generateRecommendation(originalEntity, cdmEntity) {
    return {
      action: 'use_cdm',
      title: `Use CDM ${cdmEntity.displayName} Entity`,
      description: cdmEntity.description,
      benefits: [
        `${cdmEntity.keyAttributes.length}+ pre-built attributes`,
        'Standard business processes and workflows',
        'Integration with other CDM entities',
        'Microsoft-maintained schema updates'
      ],
      risks: originalEntity.attributes ? [
        'Some custom attributes may not be available in CDM entity',
        'CDM entity structure cannot be modified'
      ] : [],
      confidence: this.getConfidenceLabel(0.85)
    };
  }

  /**
   * Generate integration recommendations for all detected CDM entities
   * @param {Array} detectedCDM - Array of detected CDM entities
   * @returns {Array} Integration recommendations
   */
  generateIntegrationRecommendations(detectedCDM) {
    const recommendations = [];

    if (detectedCDM.length > 1) {
      // Look for common relationship patterns
      const entityNames = detectedCDM.map(d => d.cdmEntity.logicalName);
      
      if (entityNames.includes('account') && entityNames.includes('contact')) {
        recommendations.push({
          type: 'relationship',
          title: 'Leverage Account-Contact Relationship',
          description: 'CDM Account and Contact entities have built-in relationships that can be utilized',
          action: 'Enable standard CDM relationships between Account and Contact entities'
        });
      }

      if (entityNames.includes('opportunity') && (entityNames.includes('account') || entityNames.includes('contact'))) {
        recommendations.push({
          type: 'workflow',
          title: 'Sales Process Integration',
          description: 'Use CDM sales entities for complete sales pipeline management',
          action: 'Consider adding Quote and Order entities to complete the sales process'
        });
      }
    }

    return recommendations;
  }

  /**
   * Calculate overall confidence level
   * @param {Array} detectedCDM - Array of detected CDM entities
   * @returns {string} Confidence level
   */
  calculateOverallConfidence(detectedCDM) {
    if (detectedCDM.length === 0) return 'none';

    const averageConfidence = detectedCDM.reduce((sum, d) => sum + d.confidence, 0) / detectedCDM.length;

    if (averageConfidence >= 0.9) return 'high';
    if (averageConfidence >= 0.7) return 'medium';
    return 'low';
  }

  /**
   * Get confidence label
   * @param {number} confidence - Confidence score
   * @returns {string} Confidence label
   */
  getConfidenceLabel(confidence) {
    if (confidence >= 0.9) return 'High';
    if (confidence >= 0.7) return 'Medium';
    if (confidence >= 0.5) return 'Low';
    return 'Very Low';
  }

  /**
   * Get all available CDM entities
   * @returns {Object} CDM entities data
   */
  getAllCDMEntities() {
    return this.cdmData.cdmEntities;
  }

  /**
   * Get CDM entity by logical name
   * @param {string} logicalName - CDM entity logical name
   * @returns {Object|null} CDM entity or null
   */
  getCDMEntity(logicalName) {
    return this.cdmData.cdmEntities[logicalName] || null;
  }

  /**
   * Get CDM entities by category
   * @param {string} category - Category name (sales, service, marketing, activity)
   * @returns {Array} CDM entities in category
   */
  getCDMEntitiesByCategory(category) {
    const entities = [];
    
    for (const [key, entity] of Object.entries(this.cdmData.cdmEntities)) {
      if (entity.category === category) {
        entities.push(entity);
      }
    }
    
    return entities;
  }
}

module.exports = CDMDetector;
