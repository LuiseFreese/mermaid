/**
 * Dataverse Global Choices Service
 * Handles global choice set creation, management, and deletion
 */

const { DataverseAuthenticationService } = require('./dataverse-authentication-service');

class DataverseGlobalChoicesService extends DataverseAuthenticationService {
  constructor(config = {}, parentClient = null) {
    super(config);
    
    // If parent client is provided, use its makeRequest method
    if (parentClient && typeof parentClient.makeRequest === 'function') {
      this.makeRequest = parentClient.makeRequest.bind(parentClient);
      console.log('🔗 GlobalChoicesService using parent client makeRequest');
    }
  }

  /**
   * Get all global choice sets
   * @returns {Promise<object>} Global choices with categorization
   */
  async getGlobalChoiceSets() {
    this._log('🎯 Getting global choice sets from Dataverse...');
    
    try {
      // Check if we have valid authentication configuration before making any calls
      if (!this._isAuthConfigured()) {
        this._log('⚠️ No Dataverse authentication configured, returning empty choice sets for now');
        return {
          all: [],
          grouped: { custom: [], builtIn: [] },
          summary: { total: 0, custom: 0, builtIn: 0 }
        };
      }
      
      // Query for global choice sets (OptionSets in Dataverse)
      // Get both managed and unmanaged choice sets, limit to 500 for performance
      const oDataQuery = 'GlobalOptionSetDefinitions?$select=Name,DisplayName,Description,IsManaged&$top=500&$orderby=DisplayName';
      const choiceSets = await this.get(oDataQuery);
      
      this._log(`🎯 Retrieved choice sets: ${choiceSets.value?.length || 0}`);
      
      if (!choiceSets.value) {
        return {
          all: [],
          grouped: { custom: [], builtIn: [] },
          summary: { total: 0, custom: 0, builtIn: 0 }
        };
      }
      
      // Process and categorize choice sets
      const processedChoices = choiceSets.value.map(choice => ({
        id: choice.Name,
        name: choice.Name,
        displayName: choice.DisplayName?.UserLocalizedLabel?.Label || choice.DisplayName?.LocalizedLabels?.[0]?.Label || choice.Name,
        description: choice.Description?.UserLocalizedLabel?.Label || choice.Description?.LocalizedLabels?.[0]?.Label || '',
        isManaged: choice.IsManaged,
        isCustom: !choice.IsManaged,
        prefix: choice.Name.includes('_') ? choice.Name.split('_')[0] : ''
      }));
      
      // Group by custom vs built-in
      const custom = processedChoices.filter(c => !c.isManaged);
      const builtIn = processedChoices.filter(c => c.isManaged);
      
      const result = {
        all: processedChoices,
        grouped: { custom, builtIn },
        summary: { 
          total: processedChoices.length, 
          custom: custom.length, 
          builtIn: builtIn.length 
        }
      };
      
      this._log(`🎯 Global choices summary: ${JSON.stringify(result.summary)}`);
      return result;
      
    } catch (error) {
      this._err(`❌ Error fetching global choice sets: ${error.message}`);
      // Return empty structure instead of throwing - this allows the UI to work with uploaded files
      return {
        all: [],
        grouped: { custom: [], builtIn: [] },
        summary: { total: 0, custom: 0, builtIn: 0 }
      };
    }
  }

  /**
   * Get a single global choice set by name
   * @param {string} choiceName - Name of the choice set to retrieve
   * @returns {Promise<object|null>} Single choice set data
   */
  async getGlobalChoiceSet(choiceName) {
    this._log(`🎯 Getting single global choice set: ${choiceName}`);
    
    try {
      // Check if we have valid authentication configuration before making any calls
      if (!this._isAuthConfigured()) {
        this._log('⚠️ No Dataverse authentication configured');
        return null;
      }
      
      // Since $filter is not supported on GlobalOptionSetDefinitions, 
      // we need to fetch all and filter client-side
      const oDataQuery = `GlobalOptionSetDefinitions?$select=Name,DisplayName,Description,IsManaged`;
      const result = await this.get(oDataQuery);
      
      if (!result.value || result.value.length === 0) {
        this._log('❌ No global choice sets found');
        return null;
      }
      
      // Filter client-side for the specific choice we want
      const choice = result.value.find(c => c.Name === choiceName);
      if (!choice) {
        this._log(`❌ Choice set not found: ${choiceName}`);
        return null;
      }

      const processedChoice = {
        id: choice.Name,
        name: choice.Name,
        displayName: choice.DisplayName?.UserLocalizedLabel?.Label || choice.DisplayName?.LocalizedLabels?.[0]?.Label || choice.Name,
        description: choice.Description?.UserLocalizedLabel?.Label || choice.Description?.LocalizedLabels?.[0]?.Label || '',
        isManaged: choice.IsManaged,
        isCustom: !choice.IsManaged,
        prefix: choice.Name.includes('_') ? choice.Name.split('_')[0] : ''
      };
      
      this._log(`✅ Found choice set: ${processedChoice.name} (${processedChoice.displayName})`);
      return processedChoice;
      
    } catch (error) {
      this._err(`❌ Error fetching single global choice set: ${error.message}`);
      return null;
    }
  }

  /**
   * Create a new global choice set
   * @param {object} choiceData - Choice set data
   * @param {string} publisherPrefix - Publisher prefix for naming
   * @returns {Promise<object>} Created choice response
   */
  async createGlobalChoice(choiceData, publisherPrefix = '') {
    const choiceName = choiceData.name || choiceData.logicalName;
    const displayName = choiceData.displayName || choiceData.name;
    const description = choiceData.description || '';
    const finalChoiceName = publisherPrefix ? `${publisherPrefix}_${choiceName}` : choiceName;

    // Build options array
    const options = (choiceData.options || []).map((option, index) => ({
      "Value": option.value || (100000000 + index),
      "Label": this._label(option.label || option.name),
      "Description": this._label(option.description || "")
    }));

    const globalChoiceBody = {
      "@odata.type": "Microsoft.Dynamics.CRM.OptionSetMetadata",
      "Name": finalChoiceName,
      "DisplayName": this._label(displayName),
      "Description": this._label(description),
      "Options": options,
      "IsGlobal": true
    };

    this._log(`🎨 Creating global choice set: ${finalChoiceName}`);
    return this.post('/GlobalOptionSetDefinitions', globalChoiceBody);
  }

  /**
   * Delete a global choice set by name or display name
   * @param {string} choiceNameOrDisplay - Global choice logical name or display name
   * @returns {Promise<object>} Deletion response
   */
  async deleteGlobalChoice(choiceNameOrDisplay) {
    try {
      this._log(`🗑️ Deleting global choice: ${choiceNameOrDisplay}`);
      
      // Get all global choice sets (API doesn't support $filter on GlobalOptionSetDefinitions)
      const choiceQuery = `/GlobalOptionSetDefinitions`;
      const choiceResponse = await this.get(choiceQuery);
      
      if (!choiceResponse.value || choiceResponse.value.length === 0) {
        throw new Error(`No global choices found`);
      }
      
      // Try to find by logical name first, then by display name
      let choice = choiceResponse.value.find(c => c.Name === choiceNameOrDisplay);
      
      if (!choice) {
        // Try by display name
        choice = choiceResponse.value.find(c => 
          c.DisplayName?.UserLocalizedLabel?.Label === choiceNameOrDisplay
        );
        
        if (choice) {
          this._log(`   Found by display name "${choiceNameOrDisplay}", logical name: ${choice.Name}`);
        }
      }
      
      if (!choice) {
        throw new Error(`Global choice '${choiceNameOrDisplay}' not found`);
      }
      
      const response = await this.delete(`/GlobalOptionSetDefinitions(${choice.MetadataId})`);
      this._log(`✅ Global choice deleted successfully: ${choice.Name}`);
      return response;
    } catch (error) {
      this._err(`❌ Failed to delete global choice ${choiceNameOrDisplay}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Add existing global choices to a solution
   * @param {Array} selectedChoices - Array of choice names to add
   * @param {string} solutionUniqueName - Target solution unique name
   * @returns {Promise<object>} Addition results
   */
  async addGlobalChoicesToSolution(selectedChoices, solutionUniqueName) {
    this._log(`🎨 Adding ${selectedChoices.length} existing global choices to solution: ${solutionUniqueName}`);
    
    let added = 0;
    let failed = 0;
    const errors = [];
    
    for (const choice of selectedChoices) {
      let choiceName;
      try {
        // Extract the choice name - handle both string and object formats
        choiceName = typeof choice === 'string' ? choice : (choice.name || choice.value || choice);
        
        // Get the MetadataId of the global choice set by name
        // Since $filter is not supported, we'll get all and find the matching one
        const allChoices = await this.get(`GlobalOptionSetDefinitions?$select=MetadataId,Name`);
        
        const matchingChoice = allChoices.value.find(option => option.Name === choiceName);
        if (!matchingChoice) {
          throw new Error(`Global choice set '${choiceName}' not found`);
        }
        
        const metadataId = matchingChoice.MetadataId;
        
        // Add global choice set to solution using AddSolutionComponent action
        const componentBody = {
          ComponentId: metadataId,
          ComponentType: 9, // OptionSet component type
          SolutionUniqueName: solutionUniqueName,
          AddRequiredComponents: false,
          DoNotIncludeSubcomponents: false
        };
        
        // Use the correct action endpoint
        await this.post('/AddSolutionComponent', componentBody);
        added++;
        this._log(`✅ Added global choice set '${choiceName}' to solution`);
      } catch (error) {
        failed++;
        const errorMsg = `Failed to add global choice set '${choiceName}': ${error.message}`;
        errors.push(errorMsg);
        this._err(`❌ ${errorMsg}`);
      }
    }
    
    return { added, failed, errors };
  }

  /**
   * Create custom global choices and add them to a solution
   * @param {Array} customChoices - Array of choice definitions
   * @param {string} solutionUniqueName - Target solution unique name
   * @param {string} publisherPrefix - Publisher prefix for naming
   * @param {Function} progressCallback - Progress callback function
   * @returns {Promise<object>} Creation results
   */
  async createAndAddCustomGlobalChoices(customChoices, solutionUniqueName, publisherPrefix, progressCallback = null) {
    if (progressCallback) {
      progressCallback('global-choices', 'Creating Global Choices...', { choiceCount: customChoices.length });
    }
    
    this._log(`🎨 Creating ${customChoices.length} custom global choices and adding to solution: ${solutionUniqueName}`);
    
    let created = 0;
    let skipped = 0;
    let failed = 0;
    const errors = [];
    
    // Get existing global choices first to check for duplicates
    let existingChoices = [];
    try {
      const allChoices = await this.get(`GlobalOptionSetDefinitions?$select=Name`);
      existingChoices = allChoices.value?.map(c => c.Name.toLowerCase()) || [];
      this._log(`🔍 Found ${existingChoices.length} existing global choices for duplicate checking`);
    } catch (error) {
      this._warn(`⚠️ Could not fetch existing choices for duplicate checking: ${error.message}`);
    }
    
    for (const choice of customChoices) {
      try {
        // Create the global choice set
        const choiceName = choice.name || choice.logicalName;
        const displayName = choice.displayName || choice.name;
        const description = choice.description || '';
        const finalChoiceName = publisherPrefix ? `${publisherPrefix}_${choiceName}` : choiceName;
        
        // Check for duplicates before attempting creation
        if (existingChoices.includes(finalChoiceName.toLowerCase())) {
          skipped++;
          const warnMsg = `Global choice set '${choiceName}' already exists as '${finalChoiceName}' - skipping creation but will try to add to solution`;
          this._warn(`⚠️ ${warnMsg}`);
          
          // Try to add existing choice to solution
          try {
            await this._addExistingChoiceToSolution(finalChoiceName, solutionUniqueName);
            this._log(`✅ Added existing global choice set '${finalChoiceName}' to solution`);
          } catch (addError) {
            this._warn(`⚠️ Could not add existing choice '${finalChoiceName}' to solution: ${addError.message}`);
          }
          
          continue;
        }
        
        // Build options array
        const options = (choice.options || []).map((option, index) => ({
          "Value": option.value || (100000000 + index),
          "Label": this._label(option.label || option.name),
          "Description": this._label(option.description || "")
        }));
        
        const globalChoiceBody = {
          "@odata.type": "Microsoft.Dynamics.CRM.OptionSetMetadata",
          "Name": finalChoiceName,
          "DisplayName": this._label(displayName),
          "Description": this._label(description),
          "Options": options,
          "IsGlobal": true
        };
        
        // Create the global choice set
        await this.post('/GlobalOptionSetDefinitions', globalChoiceBody);
        
        // Wait for the choice set to be created and find it
        const createdChoice = await this._waitForChoiceCreation(finalChoiceName);
        
        if (createdChoice) {
          // Add to solution
          await this._addExistingChoiceToSolution(finalChoiceName, solutionUniqueName);
          created++;
          this._log(`✅ Created and added global choice set '${finalChoiceName}' to solution`);
        } else {
          throw new Error(`Could not verify creation of global choice set '${finalChoiceName}'`);
        }
        
      } catch (error) {
        failed++;
        const errorMsg = `Failed to create global choice '${choice.name}': ${error.message}`;
        errors.push(errorMsg);
        this._err(`❌ ${errorMsg}`);
      }
    }
    
    return { created, skipped, failed, errors };
  }

  /**
   * Check if authentication is configured
   * @returns {boolean} True if auth is configured
   */
  _isAuthConfigured() {
    // Basic check for auth configuration
    return !!(this.config?.clientId || this.config?.dataverseUrl || process.env.DATAVERSE_URL);
  }

  /**
   * Create localized label object
   * @param {string} text - Label text
   * @returns {object} Localized label object
   */
  _label(text) {
    return {
      "@odata.type": "Microsoft.Dynamics.CRM.Label",
      "LocalizedLabels": [
        {
          "@odata.type": "Microsoft.Dynamics.CRM.LocalizedLabel",
          "Label": text,
          "LanguageCode": 1033
        }
      ]
    };
  }

  /**
   * Add an existing global choice to a solution
   * @param {string} choiceName - Name of the choice to add
   * @param {string} solutionUniqueName - Target solution
   * @returns {Promise<void>}
   */
  async _addExistingChoiceToSolution(choiceName, solutionUniqueName) {
    // Find the existing choice to get its MetadataId
    const allChoices = await this.get(`GlobalOptionSetDefinitions?$select=MetadataId,Name`);
    const existingChoice = allChoices.value?.find(choice => choice.Name === choiceName);
    
    if (!existingChoice) {
      throw new Error(`Global choice '${choiceName}' not found`);
    }
    
    const componentBody = {
      ComponentId: existingChoice.MetadataId,
      ComponentType: 9, // OptionSet component type
      SolutionUniqueName: solutionUniqueName,
      AddRequiredComponents: false,
      DoNotIncludeSubcomponents: false
    };
    
    await this.post('/AddSolutionComponent', componentBody);
  }

  /**
   * Wait for global choice creation and find it
   * @param {string} choiceName - Name of the choice to find
   * @returns {Promise<object|null>} Found choice or null
   */
  async _waitForChoiceCreation(choiceName) {
    let createdChoice = null;
    let attempts = 0;
    const maxAttempts = 5;
    
    while (!createdChoice && attempts < maxAttempts) {
      attempts++;
      const waitTime = Math.min(3000 + (attempts * 2000), 10000); // Progressive wait: 3s, 5s, 7s, 9s, 10s
      await this.sleep(waitTime);
      
      this._log(`🔍 Attempt ${attempts}/${maxAttempts}: Looking for created global choice set '${choiceName}'`);
      
      // Get the MetadataId of the newly created global choice set
      const allChoices = await this.get(`GlobalOptionSetDefinitions?$select=MetadataId,Name`);
      createdChoice = allChoices.value.find(choice => choice.Name === choiceName);
      
      if (!createdChoice && attempts < maxAttempts) {
        this._log(`Global choice set '${choiceName}' not found yet, waiting longer...`);
      }
    }
    
    return createdChoice;
  }
}

module.exports = { DataverseGlobalChoicesService };