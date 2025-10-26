/**
 * Cross-Environment Service
 * 
 * This service handles operations across multiple Dataverse environments:
 * - Import solutions from source environment
 * - Deploy solutions to target environment(s)
 * - Manage cross-environment pipelines
 * - Track deployment history across environments
 */

class CrossEnvironmentService {
  constructor({
    environmentManager,
    dataverseClientFactory,
    validationService,
    deploymentService,
    rollbackService,
    logger
  }) {
    this.environmentManager = environmentManager;
    this.dataverseClientFactory = dataverseClientFactory;
    this.validationService = validationService;
    this.deploymentService = deploymentService;
    this.rollbackService = rollbackService;
    this.logger = logger;
  }

  /**
   * Import solution from source environment
   */
  async importFromEnvironment(sourceEnvironmentId, solutionName) {
    this.logger.info(`Starting cross-environment import from ${sourceEnvironmentId}`);
    
    try {
      const sourceEnvironment = this.environmentManager.getEnvironment(sourceEnvironmentId);
      if (!sourceEnvironment) {
        throw new Error(`Source environment ${sourceEnvironmentId} not found`);
      }

      // Get client for source environment
      const sourceClient = this.dataverseClientFactory.getClient(sourceEnvironmentId);
      
      // Get solution from source environment
      const solutions = await sourceClient.getSolutions();
      const solution = solutions.find(s => s.uniquename === solutionName);
      
      if (!solution) {
        throw new Error(`Solution '${solutionName}' not found in environment ${sourceEnvironment.name}`);
      }

      // Extract solution metadata and entities
      const solutionMetadata = await this.extractSolutionMetadata(sourceClient, solution);
      
      // Generate Mermaid ERD from solution
      const mermaidContent = await this.generateMermaidFromSolution(sourceClient, solutionMetadata);
      
      // Validate the extracted content
      const validation = await this.validationService.validateERD(mermaidContent);
      
      return {
        success: true,
        sourceEnvironment,
        solution: solutionMetadata,
        mermaidContent,
        validation,
        metadata: {
          importedAt: new Date(),
          sourceEnvironmentId,
          solutionName
        }
      };
      
    } catch (error) {
      this.logger.error('Cross-environment import failed:', error);
      throw new Error(`Import from ${sourceEnvironmentId} failed: ${error.message}`);
    }
  }

  /**
   * Deploy solution to target environment
   */
  async deployToEnvironment(targetEnvironmentId, solutionData, deploymentOptions = {}) {
    this.logger.info(`Starting cross-environment deployment to ${targetEnvironmentId}`);
    
    try {
      const targetEnvironment = this.environmentManager.getEnvironment(targetEnvironmentId);
      if (!targetEnvironment) {
        throw new Error(`Target environment ${targetEnvironmentId} not found`);
      }

      // Validate deployment compatibility
      await this.validateCrossEnvironmentDeployment(solutionData, targetEnvironmentId);
      
      // Create deployment configuration for target environment
      const deploymentConfig = {
        ...deploymentOptions,
        targetEnvironment: targetEnvironment,
        sourceEnvironment: solutionData.sourceEnvironment,
        crossEnvironmentDeployment: true
      };

      // Perform deployment using existing deployment service
      const result = await this.deploymentService.deploySolution(
        solutionData.mermaidContent,
        deploymentConfig,
        targetEnvironmentId
      );

      // Track cross-environment deployment
      await this.recordCrossEnvironmentDeployment({
        sourceEnvironmentId: solutionData.metadata.sourceEnvironmentId,
        targetEnvironmentId,
        solutionName: solutionData.metadata.solutionName,
        deploymentResult: result,
        deployedAt: new Date()
      });

      return {
        success: true,
        targetEnvironment,
        deploymentResult: result,
        crossEnvironmentInfo: {
          sourceEnvironment: solutionData.sourceEnvironment.name,
          targetEnvironment: targetEnvironment.name,
          deployedAt: new Date()
        }
      };

    } catch (error) {
      this.logger.error('Cross-environment deployment failed:', error);
      throw new Error(`Deployment to ${targetEnvironmentId} failed: ${error.message}`);
    }
  }

  /**
   * Execute multi-environment pipeline (e.g., Dev → Test → UAT → Production)
   */
  async executePipeline(pipelineConfig) {
    this.logger.info('Starting multi-environment pipeline execution');
    
    const {
      sourceEnvironmentId,
      targetEnvironmentIds,
      solutionName,
      deploymentOptions = {},
      stopOnError = true
    } = pipelineConfig;

    const results = [];
    let solutionData = null;

    try {
      // Step 1: Import from source environment
      this.logger.info(`Pipeline Step 1: Import from ${sourceEnvironmentId}`);
      solutionData = await this.importFromEnvironment(sourceEnvironmentId, solutionName);
      
      results.push({
        step: 'import',
        environmentId: sourceEnvironmentId,
        environmentName: solutionData.sourceEnvironment.name,
        success: true,
        timestamp: new Date()
      });

      // Step 2: Deploy to each target environment in sequence
      for (let i = 0; i < targetEnvironmentIds.length; i++) {
        const targetEnvironmentId = targetEnvironmentIds[i];
        const targetEnvironment = this.environmentManager.getEnvironment(targetEnvironmentId);
        
        this.logger.info(`Pipeline Step ${i + 2}: Deploy to ${targetEnvironment?.name || targetEnvironmentId}`);
        
        try {
          const deployResult = await this.deployToEnvironment(
            targetEnvironmentId, 
            solutionData, 
            deploymentOptions
          );
          
          results.push({
            step: 'deploy',
            environmentId: targetEnvironmentId,
            environmentName: targetEnvironment?.name || targetEnvironmentId,
            success: true,
            result: deployResult,
            timestamp: new Date()
          });
          
        } catch (error) {
          this.logger.error(`Pipeline deployment to ${targetEnvironmentId} failed:`, error);
          
          results.push({
            step: 'deploy',
            environmentId: targetEnvironmentId,
            environmentName: targetEnvironment?.name || targetEnvironmentId,
            success: false,
            error: error.message,
            timestamp: new Date()
          });
          
          if (stopOnError) {
            throw new Error(`Pipeline stopped at ${targetEnvironment?.name || targetEnvironmentId}: ${error.message}`);
          }
        }
      }

      return {
        success: true,
        pipelineResults: results,
        summary: {
          totalSteps: results.length,
          successfulSteps: results.filter(r => r.success).length,
          failedSteps: results.filter(r => !r.success).length,
          completedAt: new Date()
        }
      };

    } catch (error) {
      this.logger.error('Pipeline execution failed:', error);
      
      return {
        success: false,
        error: error.message,
        pipelineResults: results,
        summary: {
          totalSteps: results.length,
          successfulSteps: results.filter(r => r.success).length,
          failedSteps: results.filter(r => !r.success).length,
          failedAt: new Date()
        }
      };
    }
  }

  /**
   * Get available solutions from an environment
   */
  async getAvailableSolutions(environmentId) {
    try {
      const client = this.dataverseClientFactory.getClient(environmentId);
      const solutions = await client.getSolutions();
      
      // Filter out system solutions and return relevant info
      return solutions
        .filter(s => !s.ismanaged && s.uniquename !== 'Default')
        .map(s => ({
          uniqueName: s.uniquename,
          displayName: s.friendlyname,
          version: s.version,
          publisher: s.publishername,
          description: s.description,
          modifiedOn: s.modifiedon
        }));
        
    } catch (error) {
      this.logger.error(`Failed to get solutions from ${environmentId}:`, error);
      throw error;
    }
  }

  /**
   * Compare environments to show differences
   */
  async compareEnvironments(sourceEnvironmentId, targetEnvironmentId) {
    try {
      const [sourceSolutions, targetSolutions] = await Promise.all([
        this.getAvailableSolutions(sourceEnvironmentId),
        this.getAvailableSolutions(targetEnvironmentId)
      ]);

      const sourceEnv = this.environmentManager.getEnvironment(sourceEnvironmentId);
      const targetEnv = this.environmentManager.getEnvironment(targetEnvironmentId);

      // Find differences
      const sourceOnly = sourceSolutions.filter(s => 
        !targetSolutions.some(t => t.uniqueName === s.uniqueName)
      );
      
      const targetOnly = targetSolutions.filter(t => 
        !sourceSolutions.some(s => s.uniqueName === t.uniqueName)
      );
      
      const common = sourceSolutions.filter(s => 
        targetSolutions.some(t => t.uniqueName === s.uniqueName)
      ).map(s => {
        const targetVersion = targetSolutions.find(t => t.uniqueName === s.uniqueName);
        return {
          ...s,
          targetVersion: targetVersion?.version,
          versionDifference: s.version !== targetVersion?.version
        };
      });

      return {
        sourceEnvironment: sourceEnv,
        targetEnvironment: targetEnv,
        comparison: {
          sourceOnly,
          targetOnly,
          common,
          summary: {
            sourceOnlyCount: sourceOnly.length,
            targetOnlyCount: targetOnly.length,
            commonCount: common.length,
            versionDifferences: common.filter(c => c.versionDifference).length
          }
        }
      };

    } catch (error) {
      this.logger.error('Environment comparison failed:', error);
      throw error;
    }
  }

  // Private helper methods
  async extractSolutionMetadata(client, solution) {
    // Extract detailed solution metadata including entities, relationships, etc.
    const entities = await client.getEntitiesInSolution(solution.solutionid);
    const relationships = await client.getRelationshipsInSolution(solution.solutionid);
    
    return {
      ...solution,
      entities,
      relationships,
      extractedAt: new Date()
    };
  }

  async generateMermaidFromSolution(client, solutionMetadata) {
    // Convert Dataverse solution back to Mermaid ERD format
    // This would use the reverse engineering logic
    let mermaidContent = 'erDiagram\n';
    
    // Add entities
    for (const entity of solutionMetadata.entities) {
      mermaidContent += `  ${entity.logicalname} {\n`;
      
      // Add key attributes
      const attributes = await client.getEntityAttributes(entity.logicalname);
      for (const attr of attributes.slice(0, 5)) { // Limit for brevity
        mermaidContent += `    ${attr.logicalname} ${attr.attributetype}\n`;
      }
      
      mermaidContent += '  }\n';
    }
    
    // Add relationships
    for (const relationship of solutionMetadata.relationships) {
      if (relationship.referencingentity && relationship.referencedentity) {
        mermaidContent += `  ${relationship.referencingentity} ||--o{ ${relationship.referencedentity} : ${relationship.schemaname}\n`;
      }
    }
    
    return mermaidContent;
  }

  async validateCrossEnvironmentDeployment(solutionData, targetEnvironmentId) {
    const targetEnvironment = this.environmentManager.getEnvironment(targetEnvironmentId);
    
    // Check if target environment exists and is accessible
    if (!targetEnvironment) {
      throw new Error(`Target environment ${targetEnvironmentId} not found`);
    }

    // Test connectivity to target environment
    const connectionTest = await this.dataverseClientFactory.testConnection(targetEnvironmentId);
    if (!connectionTest.success) {
      throw new Error(`Cannot connect to target environment: ${connectionTest.error}`);
    }

    // Additional validation logic can be added here
    return true;
  }

  async recordCrossEnvironmentDeployment(deploymentRecord) {
    // Record the cross-environment deployment for audit and tracking
    this.logger.info('Recording cross-environment deployment:', deploymentRecord);
    
    // This could be saved to a database, file, or deployment history service
    // For now, we'll just log it
  }
}

module.exports = CrossEnvironmentService;