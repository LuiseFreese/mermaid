/**
 * Dataverse Solution Service
 * Handles solution creation, management, and component operations
 */

const { DataverseAuthenticationService } = require('./dataverse-authentication-service');

class DataverseSolutionService extends DataverseAuthenticationService {
  constructor(config = {}) {
    super(config);
  }

  /**
   * Check if a solution exists by unique name
   * @param {string} uniqueName - Solution unique name
   * @returns {Promise<object|null>} Solution data or null if not found
   */
  async checkSolutionExists(uniqueName) {
    // Include publisher info when checking solution existence
    const query = `/solutions?$select=solutionid,uniquename,friendlyname,_publisherid_value&$expand=publisherid($select=publisherid,uniquename,customizationprefix)&$filter=uniquename eq '${uniqueName}'`;
    this._log(' GET', `${this.baseUrl}/api/data/v9.2${query}`);
    
    const response = await this.get(query);
    const solutions = response.value || [];
    if (solutions.length) return solutions[0];
    
    // Fallback: try with different case variations (since tolower isn't supported in all environments)
    const caseVariations = [
      uniqueName.toLowerCase(),
      uniqueName.toUpperCase(),
      uniqueName.charAt(0).toUpperCase() + uniqueName.slice(1).toLowerCase()
    ];
    
    for (const variation of caseVariations) {
      if (variation === uniqueName) continue; // already tried this one
      const variationQuery = `/solutions?$select=solutionid,uniquename,friendlyname,_publisherid_value&$expand=publisherid($select=publisherid,uniquename,customizationprefix)&$filter=uniquename eq '${variation}'`;
      this._log(' GET', `${this.baseUrl}/api/data/v9.2${variationQuery}`);
      
      try {
        const variationResponse = await this.get(variationQuery);
        const variationSolutions = variationResponse.value || [];
        if (variationSolutions.length) return variationSolutions[0];
      } catch (error) {
        // continue to next variation if this one fails
        this._log(' Case variation failed, trying next...');
      }
    }
    
    return null;
  }

  /**
   * Get solution by ID
   * @param {string} solutionId - Solution ID
   * @returns {Promise<object>} Solution data
   */
  async getSolutionById(solutionId) {
    const query = `/solutions(${solutionId})?$select=solutionid,uniquename,friendlyname,_publisherid_value&$expand=publisherid($select=publisherid,uniquename,customizationprefix)`;
    this._log(' GET', `${this.baseUrl}/api/data/v9.2${query}`);
    
    const solution = await this.get(query);
    return solution;
  }

  /**
   * Create a new solution
   * @param {string} uniqueName - Solution unique name
   * @param {string} friendlyName - Solution display name
   * @param {object} options - Additional options
   * @param {string} options.publisherId - Publisher ID
   * @param {string} options.description - Solution description
   * @returns {Promise<object>} Created solution data
   */
  async createSolution(uniqueName, friendlyName, { publisherId, description } = {}) {
    const payload = {
      uniquename: String(uniqueName),
      friendlyname: String(friendlyName || uniqueName),
      description: String(description || `Solution created by Mermaid to Dataverse Converter`)
    };
    
    // Include publisher reference - OData binding (preferred)
    if (publisherId) {
      payload['publisherid@odata.bind'] = `/publishers(${publisherId})`;
    } else {
      this._warn('No publisherId provided to createSolution');
    }
    
    this._log(' POST', `${this.baseUrl}/api/data/v9.2/solutions`);
    const response = await this.post('/solutions', payload);
    return response;
  }

  /**
   * Ensure a solution exists, create if it doesn't
   * @param {string} uniqueName - Solution unique name
   * @param {string} friendlyName - Solution display name
   * @param {object} publisher - Publisher object with publisherid
   * @returns {Promise<object>} Solution data
   */
  async ensureSolution(uniqueName, friendlyName, publisher) {
    let solution = await this.checkSolutionExists(uniqueName);
    if (solution) {
      this._log(`Solution ready: ${solution.uniquename} (${solution.solutionid})`);
      return solution;
    }
    
    this._log(` Creating solution '${uniqueName}'...`);
    await this.createSolution(uniqueName, friendlyName, { 
      publisherId: publisher.publisherid, 
      description: `Solution for ${uniqueName}` 
    });
    
    // Poll for solution creation completion
    for (let i = 1; i <= 6; i++) {
      await this.sleep(1000 * i);
      solution = await this.checkSolutionExists(uniqueName);
      if (solution) {
        this._log(`Solution ready: ${solution.uniquename} (${solution.solutionid})`);
        return solution;
      }
    }
    throw new Error('Solution creation did not materialize.');
  }

  /**
   * Get solution components to check what was actually deployed
   * @param {string} solutionUniqueName - Solution unique name
   * @returns {Promise<Array>} List of solution components
   */
  async getSolutionComponents(solutionUniqueName) {
    try {
      // First get the solution
      const solution = await this.checkSolutionExists(solutionUniqueName);
      if (!solution) {
        throw new Error(`Solution ${solutionUniqueName} not found`);
      }

      // Get solution components
      const query = `/solutioncomponents?$filter=_solutionid_value eq ${solution.solutionid}&$select=solutioncomponentid,objectid,componenttype,rootcomponentbehavior,rootsolutioncomponentid`;
      this._log(' GET', `${this.baseUrl}/api/data/v9.2${query}`);
      
      const response = await this.get(query);
      return response.value || [];
    } catch (error) {
      this._err(`Failed to get solution components for ${solutionUniqueName}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get all solutions
   * @returns {Promise<Array>} List of solutions
   */
  async getSolutions() {
    // Start with the most basic query possible
    const query = `/solutions?$select=solutionid,uniquename,friendlyname`;
    this._log(`GET ${this.baseUrl}/api/data/v9.2${query}`);
    
    try {
      const response = await this.makeRequestWithRetry('GET', query);
      this._log(`✅ Solutions query successful, found ${response.value?.length || 0} solutions`);
      return response.value || [];
    } catch (error) {
      this._err(`Failed to get solutions: ${error.message}`);
      throw error;
    }
  }

  /**
   * Delete a solution
   * @param {string} solutionId - Solution ID to delete
   * @returns {Promise<object>} Deletion result
   */
  async deleteSolution(solutionId) {
    try {
      this._log(`🗑️ Deleting solution: ${solutionId}`);
      const response = await this.delete(`/solutions(${solutionId})`);
      this._log(`✅ Solution deleted successfully: ${solutionId}`);
      return response;
    } catch (error) {
      this._err(`❌ Failed to delete solution ${solutionId}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Add entity to solution
   * @param {string} entityLogicalName - Entity logical name
   * @param {string} solutionUniqueName - Solution unique name
   * @param {boolean} addRequiredComponents - Include required components
   * @returns {Promise<object>} Addition result
   */
  async addEntityToSolution(entityLogicalName, solutionUniqueName, addRequiredComponents = false) {
    try {
      // Get solution ID
      const solution = await this.checkSolutionExists(solutionUniqueName);
      if (!solution) {
        throw new Error(`Solution ${solutionUniqueName} not found`);
      }

      const payload = {
        ComponentType: 1, // Entity
        SolutionUniqueName: solutionUniqueName,
        ComponentId: entityLogicalName,
        AddRequiredComponents: addRequiredComponents,
        DoNotIncludeSubcomponents: false
      };

      this._log(`Adding entity ${entityLogicalName} to solution ${solutionUniqueName}`);
      const response = await this.post('/AddSolutionComponent', payload);
      this._log(`✅ Entity added to solution successfully`);
      return response;
    } catch (error) {
      this._err(`❌ Failed to add entity to solution: ${error.message}`);
      throw error;
    }
  }

  /**
   * Remove entity from solution
   * @param {string} entityLogicalName - Entity logical name
   * @param {string} solutionUniqueName - Solution unique name
   * @returns {Promise<object>} Removal result
   */
  async removeEntityFromSolution(entityLogicalName, solutionUniqueName) {
    try {
      const payload = {
        ComponentType: 1, // Entity
        SolutionUniqueName: solutionUniqueName,
        ComponentId: entityLogicalName
      };

      this._log(`Removing entity ${entityLogicalName} from solution ${solutionUniqueName}`);
      const response = await this.post('/RemoveSolutionComponent', payload);
      this._log(`✅ Entity removed from solution successfully`);
      return response;
    } catch (error) {
      this._err(`❌ Failed to remove entity from solution: ${error.message}`);
      throw error;
    }
  }

  /**
   * Export solution
   * @param {string} solutionUniqueName - Solution unique name
   * @param {object} options - Export options
   * @param {boolean} options.managed - Export as managed solution
   * @param {boolean} options.includeDependencies - Include dependencies
   * @returns {Promise<object>} Export result
   */
  async exportSolution(solutionUniqueName, { managed = false, includeDependencies = false } = {}) {
    try {
      const payload = {
        SolutionName: solutionUniqueName,
        Managed: managed,
        ExportAutoNumberingSettings: false,
        ExportCalendarSettings: false,
        ExportCustomizationSettings: false,
        ExportEmailTrackingSettings: false,
        ExportGeneralSettings: false,
        ExportMarketingSettings: false,
        ExportOutlookSynchronizationSettings: false,
        ExportRelationshipRoles: false,
        ExportIsvConfig: false,
        ExportSales: false,
        ExportExternalApplications: false,
        IncludeDependencies: includeDependencies
      };

      this._log(`Exporting solution ${solutionUniqueName} (managed: ${managed})`);
      const response = await this.post('/ExportSolution', payload);
      this._log(`✅ Solution exported successfully`);
      return response;
    } catch (error) {
      this._err(`❌ Failed to export solution: ${error.message}`);
      throw error;
    }
  }
}

module.exports = { DataverseSolutionService };