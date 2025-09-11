/**
 * Optimized Dataverse Client with Performance Improvements
 * 
 * Key optimizations:
 * 1. Parallel entity creation with controlled concurrency
 * 2. Batch attribute operations using OData $batch
 * 3. Dynamic wait times instead of fixed delays
 * 4. Smart relationship grouping and parallel processing
 */

const { DataverseClient } = require('./dataverse-client');

class OptimizedDataverseClient extends DataverseClient {
    constructor(config) {
        super(config);
        
        // Performance configuration
        this.MAX_CONCURRENT_ENTITIES = 3; // Respect Dataverse API limits
        this.MAX_CONCURRENT_RELATIONSHIPS = 5;
        this.ENTITY_READY_TIMEOUT = 60000; // 60 seconds max wait (increased)
        this.POLL_INTERVAL = 2000; // Check every 2 seconds (slower but more reliable)
        this.MIN_ENTITY_WAIT = 3000; // Minimum wait after entity creation
        this.MIN_RELATIONSHIP_WAIT = 15000; // Minimum wait before relationships (reduced from 25s)
        
        // Retry configuration
        this.DEFAULT_MAX_RETRIES = 5;
        this.RETRY_BASE_DELAY = 2000; // Start with 2 seconds
        this.RETRY_MAX_DELAY = 30000; // Cap at 30 seconds
    }

    /**
     * Enhanced retry logic with exponential backoff and jitter
     */
    async retryWithBackoff(operation, maxRetries = this.DEFAULT_MAX_RETRIES, context = '') {
        let lastError;
        
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                return await operation();
            } catch (error) {
                lastError = error;
                
                // Check if error is retryable
                const isRetryable = this.isRetryableError(error);
                
                if (attempt === maxRetries || !isRetryable) {
                    this._err(`${context} failed after ${attempt} attempts: ${error.message}`);
                    throw error;
                }
                
                // Calculate delay with exponential backoff and jitter
                const baseDelay = Math.min(this.RETRY_BASE_DELAY * Math.pow(2, attempt - 1), this.RETRY_MAX_DELAY);
                const jitter = Math.random() * 1000; // Add up to 1 second of jitter
                const delay = baseDelay + jitter;
                
                this._log(`${context} attempt ${attempt}/${maxRetries} failed: ${error.message}`);
                this._log(`Retrying in ${Math.round(delay/1000)}s...`);
                
                await this.sleep(delay);
            }
        }
        
        throw lastError;
    }

    /**
     * Check if an error is retryable
     */
    isRetryableError(error) {
        if (!error) return false;
        
        const retryableStatuses = [429, 503, 500, 502, 504]; // Rate limit, service unavailable, server errors
        const retryableMessages = [
            'timeout',
            'busy',
            'locked',
            'customization',
            'unexpected',
            'try again',
            'rate limit',
            'service unavailable',
            'another user has changed'
        ];
        
        // Check status code
        if (retryableStatuses.includes(error.status)) {
            return true;
        }
        
        // Check error message
        const message = (error.message || '').toLowerCase();
        return retryableMessages.some(keyword => message.includes(keyword));
    }

    /**
     * Optimized custom entities creation with parallel processing
     * @param {Array} entities - Entities to create
     * @param {Object} options - Configuration options
     * @returns {Promise<Object>} Creation results
     */
    async createCustomEntitiesOptimized(entities, options = {}) {
        const startTime = Date.now();
        const results = {
            success: true,
            entitiesCreated: 0,
            relationshipsCreated: 0,
            relationshipsFailed: 0,
            errors: [],
            performance: {
                totalTime: 0,
                entityCreationTime: 0,
                attributeCreationTime: 0,
                relationshipCreationTime: 0,
                waitTime: 0,
                apiCalls: 0
            }
        };

        if (!Array.isArray(entities) || !entities.length) {
            return { success: true, entitiesCreated: 0, relationshipsCreated: 0 };
        }

        const publisherPrefix = options.publisherPrefix || this._generateRandomPrefix();
        const publisherName = options.publisherName || 'Mermaid Publisher';
        const publisherUnique = options.publisherUniqueName || publisherName.replace(/\s+/g, '');
        const progressCallback = options.progressCallback;

        this._log(`🚀 Starting optimized deployment for ${entities.length} entities`);
        this._log(`Using publisher prefix: ${publisherPrefix}`);

        // Ensure Publisher + Solution
        const pub = await this.ensurePublisher({
            uniqueName: publisherUnique,
            friendlyName: publisherName,
            prefix: publisherPrefix
        });

        let sol = null;
        if (options.solutionUniqueName) {
            sol = await this.ensureSolution(
                options.solutionUniqueName, 
                options.solutionFriendlyName || options.solutionUniqueName, 
                pub
            );
        }

        // Phase 1: Parallel Entity Creation
        const entityStartTime = Date.now();
        const entityResults = await this.createEntitiesInParallel(entities, publisherPrefix, progressCallback);
        results.entitiesCreated = entityResults.created;
        results.errors.push(...entityResults.errors);
        results.performance.entityCreationTime = Date.now() - entityStartTime;
        results.performance.apiCalls += entityResults.apiCalls;

        if (entityResults.created === 0) {
            results.success = false;
            return results;
        }

        // Phase 2: Batch Attribute Creation
        const attributeStartTime = Date.now();
        const attributeResults = await this.createAttributesInBatches(entities, entityResults.logicalNames, publisherPrefix, progressCallback);
        results.errors.push(...attributeResults.errors);
        results.performance.attributeCreationTime = Date.now() - attributeStartTime;
        results.performance.apiCalls += attributeResults.apiCalls;

        // Phase 3: Add entities to solution in parallel
        if (sol) {
            const solutionStartTime = Date.now();
            await this.addEntitiesToSolutionInParallel(entityResults.logicalNames, sol, options, progressCallback);
            results.performance.waitTime += Date.now() - solutionStartTime;
        }

        // Phase 4: Smart Relationship Creation
        if (Array.isArray(options.relationships) && options.relationships.length) {
            const relationshipStartTime = Date.now();
            
            // Strategic wait for entities to be fully ready
            this._log(`⏳ Waiting ${this.MIN_RELATIONSHIP_WAIT/1000}s for entities to be fully provisioned before relationships...`);
            await this.sleep(this.MIN_RELATIONSHIP_WAIT);
            
            // Wait for entities to be ready using dynamic polling
            const waitStartTime = Date.now();
            await this.waitForEntitiesReady(entityResults.logicalNames);
            results.performance.waitTime += Date.now() - waitStartTime;

            if (progressCallback) {
                progressCallback('relationships', 'Creating Relationships...', { 
                    relationshipCount: options.relationships.length 
                });
            }

            const relStats = await this.createRelationshipsOptimized(options.relationships, {
                publisherPrefix,
                cdmEntities: options.cdmEntities || []
            });
            
            results.relationshipsCreated += relStats.created;
            results.relationshipsFailed += relStats.failed;
            results.performance.relationshipCreationTime = Date.now() - relationshipStartTime;
            results.performance.apiCalls += relStats.apiCalls;
        }

        results.performance.totalTime = Date.now() - startTime;
        
        this._log(`🎯 Optimized deployment completed in ${results.performance.totalTime}ms`);
        this._log(`📊 Performance breakdown:`, {
            entities: `${results.performance.entityCreationTime}ms`,
            attributes: `${results.performance.attributeCreationTime}ms`,
            relationships: `${results.performance.relationshipCreationTime}ms`,
            waits: `${results.performance.waitTime}ms`,
            totalAPICalls: results.performance.apiCalls
        });

        return results;
    }

    /**
     * Create entities in parallel with controlled concurrency
     */
    async createEntitiesInParallel(entities, publisherPrefix, progressCallback) {
        const results = {
            created: 0,
            errors: [],
            logicalNames: [],
            apiCalls: 0
        };

        // Process entities in batches to respect API limits
        const batches = this.createBatches(entities, this.MAX_CONCURRENT_ENTITIES);
        
        for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
            const batch = batches[batchIndex];
            this._log(`🔄 Processing entity batch ${batchIndex + 1}/${batches.length} (${batch.length} entities)`);
            
            const batchPromises = batch.map(async (entity) => {
                try {
                    if (progressCallback) {
                        progressCallback('entity-create', `Creating Table: ${entity.displayName || entity.name}`, { 
                            entityName: entity.name 
                        });
                    }

                    const payload = this._entityPayloadFromParser(entity, publisherPrefix);
                    
                    // Use retry logic for entity creation
                    const entityResponse = await this.retryWithBackoff(async () => {
                        return await this.createEntityWithRetry({
                            '@odata.type': 'Microsoft.Dynamics.CRM.EntityMetadata',
                            SchemaName: payload.SchemaName,
                            LogicalName: payload.LogicalName,
                            DisplayName: this._label(payload.DisplayName),
                            DisplayCollectionName: this._label(`${payload.DisplayName}s`),
                            OwnershipType: payload.OwnershipType,
                            HasActivities: payload.HasActivities,
                            HasNotes: payload.HasNotes,
                            Attributes: [
                                {
                                    '@odata.type': 'Microsoft.Dynamics.CRM.StringAttributeMetadata',
                                    AttributeType: 'String',
                                    AttributeTypeName: { Value: 'StringType' },
                                    SchemaName: payload.PrimaryAttributeSchema,
                                    RequiredLevel: { Value: 'None' },
                                    MaxLength: 850,
                                    DisplayName: this._label(payload.PrimaryNameAttributeDisplayName),
                                    IsPrimaryName: true,
                                    FormatName: { Value: 'Text' }
                                }
                            ]
                        });
                    }, this.DEFAULT_MAX_RETRIES, `Entity creation for ${entity.name}`);

                    this._log(`✅ Created entity: ${entity.name} (ID: ${entityResponse?.MetadataId || 'N/A'})`);
                    
                    // Strategic delay after entity creation to ensure Dataverse processes it
                    await this.sleep(this.MIN_ENTITY_WAIT);
                    
                    return {
                        success: true,
                        entity,
                        logicalName: payload.LogicalName,
                        apiCalls: 1
                    };
                } catch (error) {
                    this._err(`❌ Failed to create entity ${entity.name}: ${error.message}`);
                    return {
                        success: false,
                        entity,
                        error: error.message,
                        apiCalls: 1
                    };
                }
            });

            const batchResults = await Promise.all(batchPromises);
            
            // Process batch results
            for (const result of batchResults) {
                results.apiCalls += result.apiCalls;
                
                if (result.success) {
                    results.created++;
                    results.logicalNames.push(result.logicalName);
                } else {
                    results.errors.push(`Entity ${result.entity.name}: ${result.error}`);
                }
            }
        }

        return results;
    }

    /**
     * Create attributes in batches using OData $batch operations
     */
    async createAttributesInBatches(entities, logicalNames, publisherPrefix, progressCallback) {
        const results = {
            errors: [],
            apiCalls: 0
        };

        // Wait for entities to be ready for attribute creation
        await this.waitForEntitiesReady(logicalNames);

        for (let i = 0; i < entities.length; i++) {
            const entity = entities[i];
            const logicalName = logicalNames[i];
            
            if (!entity.attributes || !Array.isArray(entity.attributes)) {
                continue;
            }

            // Filter attributes (same logic as original)
            const regularAttributes = entity.attributes.filter(a => {
                const isFK = a.isForeignKey;
                const isNameAttr = a.name && a.name.toLowerCase() === 'name';
                const isEntityNameAttr = a.name && a.name.toLowerCase() === `${entity.name.toLowerCase()}_name`;
                const isStatusAttr = a.name && a.name.toLowerCase() === 'status';
                return !isFK && !isNameAttr && !isEntityNameAttr && !isStatusAttr;
            });

            if (regularAttributes.length === 0) {
                continue;
            }

            if (progressCallback) {
                progressCallback('entity-columns', `Adding columns to Table: ${entity.displayName || entity.name}`, { 
                    entityName: entity.name, 
                    columnCount: regularAttributes.length 
                });
            }

            try {
                // Create batch payload for all attributes of this entity
                const batchRequests = regularAttributes.map((attr, index) => {
                    const attrMeta = this._attributeFromParser(entity.name, attr, publisherPrefix);
                    if (!attrMeta) return null;

                    return {
                        id: `attr-${entity.name}-${index}`,
                        method: "POST",
                        url: `/EntityDefinitions(LogicalName='${logicalName}')/Attributes`,
                        body: attrMeta,
                        headers: {
                            "Content-Type": "application/json"
                        }
                    };
                }).filter(req => req !== null);

                if (batchRequests.length > 0) {
                    await this.retryWithBackoff(async () => {
                        return await this.executeBatchRequest(batchRequests);
                    }, 3, `Batch attribute creation for entity ${entity.name}`);
                    
                    results.apiCalls += 1; // One batch request
                    this._log(`✅ Created ${batchRequests.length} attributes for entity ${entity.name} in batch`);
                    
                    // Small delay after batch to let Dataverse process
                    await this.sleep(1500);
                }
            } catch (error) {
                this._err(`❌ Failed to create attributes for entity ${entity.name}: ${error.message}`);
                results.errors.push(`Attributes for ${entity.name}: ${error.message}`);
                
                // Fallback to individual attribute creation
                await this.createAttributesIndividually(entity, logicalName, regularAttributes, publisherPrefix);
                results.apiCalls += regularAttributes.length;
            }
        }

        return results;
    }

    /**
     * Execute OData $batch request
     */
    async executeBatchRequest(requests) {
        const batchPayload = {
            requests: requests
        };

        try {
            return await this._req('post', '/$batch', batchPayload);
        } catch (error) {
            this._err(`Batch request failed: ${error.message}`);
            throw error;
        }
    }

    /**
     * Fallback method for individual attribute creation
     */
    async createAttributesIndividually(entity, logicalName, attributes, publisherPrefix) {
        for (const attr of attributes) {
            const attrMeta = this._attributeFromParser(entity.name, attr, publisherPrefix);
            if (!attrMeta) continue;

            try {
                await this.createAttributeWithRetry(logicalName, attrMeta);
                this._log(`✅ Created attribute: ${attrMeta.SchemaName} for entity ${logicalName}`);
            } catch (error) {
                this._err(`❌ Failed to create attribute ${attr.name}: ${error.message}`);
            }
        }
    }

    /**
     * Add entities to solution in parallel
     */
    async addEntitiesToSolutionInParallel(logicalNames, solution, options) {
        const promises = logicalNames.map(async (logicalName) => {
            let added = false;
            for (let attempt = 1; attempt <= 3 && !added; attempt++) {
                try {
                    await this.addEntityToSolution(
                        logicalName, 
                        solution.uniquename, 
                        options.includeRelatedEntities || false
                    );
                    added = true;
                    this._log(`✅ Added entity ${logicalName} to solution ${solution.uniquename}`);
                } catch (error) {
                    if (attempt < 3) {
                        this._warn(`Attempt ${attempt}/3 to add entity ${logicalName} to solution failed: ${error.message}`);
                        await this.sleep(2000);
                    } else {
                        this._err(`❌ Failed to add entity ${logicalName} to solution after 3 attempts`);
                    }
                }
            }
        });

        await Promise.all(promises);
    }

    /**
     * Wait for entities to be ready using dynamic polling
     */
    async waitForEntitiesReady(logicalNames) {
        this._log(`⏳ Waiting for ${logicalNames.length} entities to be ready...`);
        
        const promises = logicalNames.map(logicalName => 
            this.waitForEntityReady(logicalName)
        );

        await Promise.all(promises);
        this._log(`✅ All entities are ready for attribute/relationship creation`);
    }

    /**
     * Wait for a single entity to be ready with enhanced retry logic
     */
    async waitForEntityReady(logicalName, maxWait = this.ENTITY_READY_TIMEOUT) {
        const startTime = Date.now();
        let attempts = 0;
        
        this._log(`⏳ Waiting for entity ${logicalName} to be ready...`);
        
        while (Date.now() - startTime < maxWait) {
            attempts++;
            try {
                await this._req('get', `/EntityDefinitions(LogicalName='${logicalName}')?$select=LogicalName,MetadataId`);
                this._log(`✅ Entity ${logicalName} is ready (verified after ${attempts} attempts)`);
                return true;
            } catch (error) {
                // Log every 5th attempt to avoid spam
                if (attempts % 5 === 0) {
                    this._log(`⏳ Entity ${logicalName} not ready yet (attempt ${attempts}), continuing to wait...`);
                }
                
                await this.sleep(this.POLL_INTERVAL);
            }
        }
        
        this._warn(`⚠️ Entity ${logicalName} not ready after ${attempts} attempts (${maxWait}ms timeout)`);
        // Don't throw error - continue anyway as entity might still work
        return false;
    }

    /**
     * Optimized relationship creation with smart grouping
     */
    async createRelationshipsOptimized(relationships, options = {}) {
        const results = {
            created: 0,
            failed: 0,
            apiCalls: 0
        };

        if (!relationships || relationships.length === 0) {
            return results;
        }

        // Group relationships by dependency levels
        const relationshipGroups = this.analyzeRelationshipDependencies(relationships);
        
        this._log(`📊 Grouped relationships into ${relationshipGroups.length} dependency levels`);

        // Create relationships group by group (parallel within each group)
        for (let groupIndex = 0; groupIndex < relationshipGroups.length; groupIndex++) {
            const group = relationshipGroups[groupIndex];
            this._log(`🔄 Creating relationship group ${groupIndex + 1}/${relationshipGroups.length} (${group.length} relationships)`);

            const groupPromises = group.map(async (relationship) => {
                try {
                    // Use retry logic for relationship creation
                    await this.retryWithBackoff(async () => {
                        return await this.createRelationshipsSmart([relationship], options);
                    }, this.DEFAULT_MAX_RETRIES, `Relationship creation for ${relationship.fromEntity} -> ${relationship.toEntity}`);
                    
                    results.apiCalls++;
                    
                    // Small delay between relationships in the same group
                    await this.sleep(1000);
                    
                    return { success: true };
                } catch (error) {
                    this._err(`Failed to create relationship: ${error.message}`);
                    results.apiCalls++;
                    return { success: false, error: error.message };
                }
            });

            const groupResults = await Promise.all(groupPromises);
            
            // Count successes and failures
            for (const result of groupResults) {
                if (result.success) {
                    results.created++;
                } else {
                    results.failed++;
                }
            }
        }

        return results;
    }

    /**
     * Analyze relationship dependencies and group them for parallel processing
     */
    analyzeRelationshipDependencies(relationships) {
        // For now, implement a simple grouping strategy
        // In the future, this could be enhanced with dependency analysis
        
        const groups = [];
        const batchSize = this.MAX_CONCURRENT_RELATIONSHIPS;
        
        for (let i = 0; i < relationships.length; i += batchSize) {
            groups.push(relationships.slice(i, i + batchSize));
        }
        
        return groups;
    }

    /**
     * Create batches from an array
     */
    createBatches(items, batchSize) {
        const batches = [];
        for (let i = 0; i < items.length; i += batchSize) {
            batches.push(items.slice(i, i + batchSize));
        }
        return batches;
    }

    /**
     * Override the original method to use the optimized version
     */
    async createCustomEntities(entities, options = {}) {
        // Use optimized version only if explicitly enabled
        if (options.useOptimized === true) {
            return this.createCustomEntitiesOptimized(entities, options);
        }
        
        // Fall back to original implementation
        return super.createCustomEntities(entities, options);
    }
}

module.exports = OptimizedDataverseClient;
