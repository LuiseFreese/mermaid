// src/dataverse-client.js
// Dataverse Client – CDM integration + Custom entities + Relationships (mixed CDM↔custom)
// Node 18+/Axios

const axios = require('axios');

class DataverseClient {
  constructor(cfg = {}) {
    this.baseUrl = (cfg.dataverseUrl || cfg.DATAVERSE_URL || process.env.DATAVERSE_URL || '').replace(/\/$/, '');
    this.tenantId = cfg.tenantId || cfg.TENANT_ID || process.env.TENANT_ID;
    this.clientId = cfg.clientId || cfg.CLIENT_ID || process.env.CLIENT_ID;
    this.clientSecret = cfg.clientSecret || cfg.CLIENT_SECRET || process.env.CLIENT_SECRET;
    this.managedIdentityClientId = cfg.managedIdentityClientId || cfg.MANAGED_IDENTITY_CLIENT_ID || process.env.MANAGED_IDENTITY_CLIENT_ID;
    
    // Support for client secret authentication (local development)
    this.useClientSecret = cfg.useClientSecret || 
                           process.env.USE_CLIENT_SECRET === 'true' ||
                           (this.clientSecret && this.clientId && this.tenantId);
    
    // Support for federated credentials and managed identity
    this.useFederatedCredential = cfg.useFederatedCredential || 
                                  process.env.USE_FEDERATED_CREDENTIAL === 'true';
    
    // Support for managed identity (Azure App Service, Container Instances, VMs, etc.)
    this.useManagedIdentity = cfg.useManagedIdentity || 
                              process.env.USE_MANAGED_IDENTITY === 'true' ||
                              (!this.useClientSecret && !this.useFederatedCredential);
    
    // For federated credentials, we need the assertion token or file path
    this.clientAssertion = cfg.clientAssertion || process.env.CLIENT_ASSERTION;
    this.clientAssertionFile = cfg.clientAssertionFile || process.env.CLIENT_ASSERTION_FILE;
    
    this.verbose = !!cfg.verbose;

    this._http = axios.create({
      baseURL: `${this.baseUrl}/api/data/v9.2`,
      timeout: 120000,
      validateStatus: s => s >= 200 && s < 300
    });

    this._token = null;
    this._tokenExp = 0;
  }

  // ------------------------
  // Utilities
  // ------------------------
  sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

  _log(...a)  { console.log(...a); }
  _warn(...a) { console.warn(...a); }
  _err(...a)  { console.error(...a); }

  async _ensureToken() {
    const now = Math.floor(Date.now() / 1000);
    if (this._token && now < (this._tokenExp - 60)) return this._token;

    // Determine authentication method based on configuration
    if (this.useClientSecret) {
      // Use client secret authentication (local development)
      this._log('🔐 AUTHENTICATION: Using Client Secret');
      if (!this.tenantId || !this.clientId || !this.clientSecret) {
        throw new Error('Missing tenantId/clientId/clientSecret for client secret authentication.');
      }
      this._token = await this._getTokenWithClientSecret();
    } else if (this.useManagedIdentity && this.useFederatedCredential) {
      // Use managed identity WITH federated credentials (workload identity pattern)
      this._log('🔐 AUTHENTICATION: Using Managed Identity + Federated Credentials');
      this._token = await this._getManagedIdentityWithFederatedCredentials();
    } else if (this.useManagedIdentity) {
      // Use managed identity (Azure App Service, VM, Container Instance, etc.)
      this._log('🔐 AUTHENTICATION: Using Managed Identity Only');
      if (!this.baseUrl) {
        throw new Error('Missing Dataverse URL for managed identity authentication.');
      }
      this._token = await this._getManagedIdentityToken();
    } else if (this.useFederatedCredential) {
      // Use federated credentials with client assertion (direct)
      this._log('🔐 AUTHENTICATION: Using Federated Credentials Only');
      if (!this.tenantId || !this.clientId) {
        throw new Error('Missing tenantId/clientId for federated credential authentication.');
      }
      this._token = await this._getTokenWithClientAssertion();
    } else {
      throw new Error('Authentication method not configured. Must use client secret, managed identity, or federated credentials.');
    }

    // Set expiration time for all authentication methods
    this._tokenExp = Math.floor(Date.now() / 1000) + 3599; // 1 hour default
    return this._token;
  }

  /**
   * Get managed identity token from Azure IMDS endpoint
   */
  async _getManagedIdentityToken() {
    this._log(' Requesting token from managed identity...');
    
    try {
      // Azure Instance Metadata Service (IMDS) endpoint for managed identity
      const response = await axios.get('http://169.254.169.254/metadata/identity/oauth2/token', {
        params: {
          'api-version': '2018-02-01',
          'resource': this.baseUrl
        },
        headers: {
          'Metadata': 'true'
        },
        timeout: 5000 // Short timeout for IMDS
      });
      
      this._log(' OK   Managed identity token acquired.');
      return response.data.access_token;
      
    } catch (error) {
      this._err(' Failed to get managed identity token:', error.message);
      throw new Error(`Managed identity authentication failed: ${error.message}`);
    }
  }

  /**
   * Get token using managed identity with federated credentials (Azure App Service pattern)
   * Two-step process: 1) Get Azure token via managed identity, 2) Exchange for Dataverse token
   */
  async _getManagedIdentityWithFederatedCredentials() {
    this._log(' Requesting token via managed identity with federated credentials (App Service)...');
    
    try {
      // Step 1: Get Azure token from managed identity using App Service endpoint
      this._log(' Step 1: Getting Azure token from managed identity (App Service)...');
      
      // Azure App Service provides managed identity through these environment variables
      const identityEndpoint = process.env.IDENTITY_ENDPOINT;
      const identityHeader = process.env.IDENTITY_HEADER;
      
      if (!identityEndpoint || !identityHeader) {
        throw new Error('App Service managed identity not configured. Missing IDENTITY_ENDPOINT or IDENTITY_HEADER.');
      }
      
      // For user-assigned managed identity, we need to specify the managed identity client ID
      const clientIdParam = this.managedIdentityClientId ? `&client_id=${this.managedIdentityClientId}` : '';
      const managedIdentityUrl = `${identityEndpoint}?resource=api://AzureADTokenExchange&api-version=2019-08-01${clientIdParam}`;
      
      this._log(` Making request to: ${managedIdentityUrl}`);
      
      const managedIdentityRes = await axios.get(managedIdentityUrl, {
        headers: { 
          'X-IDENTITY-HEADER': identityHeader
        }
      });
      
      const azureToken = managedIdentityRes.data.access_token;
      this._log(' OK   Azure token acquired from managed identity.');
      
      // Step 2: Exchange Azure token for Dataverse token using federated credentials
      this._log(' Step 2: Exchanging Azure token for Dataverse token...');
      const tokenRes = await axios.post(
        `https://login.microsoftonline.com/${this.tenantId}/oauth2/v2.0/token`,
        new URLSearchParams({
          client_id: this.clientId,
          client_assertion: azureToken,
          client_assertion_type: 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer',
          grant_type: 'client_credentials',
          scope: `${this.baseUrl}/.default` // Dataverse specific scope
        }).toString(),
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
      );

      this._log(' OK   Dataverse token acquired via federated credentials.');
      return tokenRes.data.access_token;
      
    } catch (error) {
      // Log detailed error information for debugging
      const errorDetails = {
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data,
        message: error.message
      };
      
      this._err(' Failed to get managed identity with federated credentials token:');
      this._err(' Error details:', JSON.stringify(errorDetails, null, 2));
      
      throw new Error(`Managed identity with federated credentials failed: ${error.message}`);
    }
  }

  /**
   * Get client assertion token for federated credentials
   */
  async _getClientAssertion() {
    if (this.clientAssertion) {
      // Direct assertion token provided
      return this.clientAssertion;
    }
    
    if (this.clientAssertionFile) {
      // Read assertion from file
      const fs = require('fs');
      try {
        const assertion = fs.readFileSync(this.clientAssertionFile, 'utf8').trim();
        this._log(' Client assertion loaded from file.');
        return assertion;
      } catch (error) {
        throw new Error(`Failed to read client assertion file: ${error.message}`);
      }
    }
    
    // Check for Azure App Service federated credential token
    // Azure App Service provides the JWT token via environment variable or file
    if (process.env.AZURE_FEDERATED_TOKEN_FILE) {
      const fs = require('fs');
      try {
        const assertion = fs.readFileSync(process.env.AZURE_FEDERATED_TOKEN_FILE, 'utf8').trim();
        this._log(' Client assertion loaded from Azure federated token file.');
        return assertion;
      } catch (error) {
        this._log(' Failed to read Azure federated token file:', error.message);
      }
    }
    
    if (process.env.AZURE_FEDERATED_TOKEN) {
      this._log(' Client assertion loaded from Azure federated token environment variable.');
      return process.env.AZURE_FEDERATED_TOKEN;
    }
    
    // Check standard GitHub Actions OIDC token (for reference)
    if (process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN && process.env.ACTIONS_ID_TOKEN_REQUEST_URL) {
      this._log(' GitHub Actions OIDC token detected (not applicable for App Service).');
    }
    
    throw new Error('No client assertion token or file provided for federated credential authentication.');
  }

  /**
   * Exchange client assertion for access token using federated credentials
   */
  async _getTokenWithClientAssertion() {
    this._log(' Requesting token with client assertion (federated credentials)...');
    
    const clientAssertion = await this._getClientAssertion();
    
    const tokenRes = await axios.post(
      `https://login.microsoftonline.com/${this.tenantId}/oauth2/v2.0/token`,
      new URLSearchParams({
        client_id: this.clientId,
        client_assertion: clientAssertion,
        client_assertion_type: 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer',
        grant_type: 'client_credentials',
        scope: 'api://AzureADTokenExchange/.default'
      }).toString(),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );

    this._log(' OK   Federated credential token acquired.');
    return tokenRes.data.access_token;
  }

  /**
   * Get access token using client secret (local development)
   */
  async _getTokenWithClientSecret() {
    this._log(' Requesting token with client secret (local development)...');
    
    try {
      const tokenRes = await axios.post(
        `https://login.microsoftonline.com/${this.tenantId}/oauth2/v2.0/token`,
        new URLSearchParams({
          client_id: this.clientId,
          client_secret: this.clientSecret,
          grant_type: 'client_credentials',
          scope: `${this.baseUrl}/.default`
        }).toString(),
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
      );

      this._log(' OK   Client secret token acquired.');
      return tokenRes.data.access_token;
      
    } catch (error) {
      // Log detailed error information for debugging
      const errorDetails = {
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data,
        message: error.message
      };
      
      this._err(' Failed to get client secret token:');
      this._err(' Error details:', JSON.stringify(errorDetails, null, 2));
      
      throw new Error(`Client secret authentication failed: ${error.message}`);
    }
  }

  async _req(method, url, data, options = {}) {
    await this._ensureToken();
    const headers = {
      Authorization: `Bearer ${this._token}`,
      'OData-Version': '4.0',
      'OData-MaxVersion': '4.0',
      Accept: 'application/json',
      'Content-Type': 'application/json'
    };

    try {
      if (this.verbose) this._log(method.toUpperCase(), `${this.baseUrl}/api/data/v9.2${url}`);
      const requestConfig = { method, url, data, headers, ...options };
      const resp = await this._http.request(requestConfig);
      return resp.data;
    } catch (e) {
      let dataStr = '';
      try { dataStr = JSON.stringify(e.response?.data || { message: e.message }); } catch { dataStr = String(e.message); }
      this._err(' Request failed:', dataStr);
      const err = new Error(e.response?.data?.error?.message || e.response?.data?.message || e.message || 'HTTP error');
      err.status = e.response?.status;
      throw err;
    }
  }

  // Convenience alias
  makeRequest(method, url, body) { return this._req(method, url, body); }

  // ------------------------
  // Diagnosis helpers
  // ------------------------
  async testConnection() {
    try {
      await this._ensureToken();
      await this._req('get', '/WhoAmI()');
      return { success: true, message: 'Connected to Dataverse' };
    } catch (e) {
      return { success: false, message: e.message };
    }
  }

  // ------------------------
  // Publisher
  // ------------------------
  async checkPublisherExists(uniqueName) {
    const q = `/publishers?$filter=uniquename eq '${uniqueName}'&$select=publisherid,uniquename,friendlyname,customizationprefix`;
    this._log(' GET', `${this.baseUrl}/api/data/v9.2${q}`);
    const d = await this._req('get', q);
    const list = d.value || [];
    return list[0] || null;
  }

  async checkPublisherByPrefix(prefix) {
    const q = `/publishers?$filter=customizationprefix eq '${prefix}'&$select=publisherid,uniquename,friendlyname,customizationprefix`;
    this._log(' GET', `${this.baseUrl}/api/data/v9.2${q}`);
    const d = await this._req('get', q);
    const list = d.value || [];
    return list[0] || null;
  }

  async createPublisher({ uniqueName, friendlyName, prefix }) {
    const payload = {
      uniquename: uniqueName,
      friendlyname: friendlyName,
      description: 'Publisher created by Mermaid to Dataverse Converter',
      customizationprefix: prefix,
      customizationoptionvalueprefix: 10000
    };
    this._log(' POST', `${this.baseUrl}/api/data/v9.2/publishers`);
    
    // Use the raw HTTP request to get headers
    await this._ensureToken();
    const headers = {
      Authorization: `Bearer ${this._token}`,
      'OData-Version': '4.0',
      'OData-MaxVersion': '4.0',
      Accept: 'application/json',
      'Content-Type': 'application/json'
    };

    try {
      const resp = await this._http.request({ 
        method: 'post', 
        url: '/publishers', 
        data: payload, 
        headers 
      });

      // Extract publisher ID from Location header
      const locationHeader = resp.headers.location || resp.headers.Location;
      let publisherId = null;
      if (locationHeader) {
        const match = locationHeader.match(/publishers\(([^)]+)\)/);
        if (match) {
          publisherId = match[1];
        }
      }

      // Return publisher object with ID
      return {
        id: publisherId,
        publisherid: publisherId,
        uniquename: uniqueName,
        friendlyname: friendlyName,
        customizationprefix: prefix,
        description: 'Publisher created by Mermaid to Dataverse Converter'
      };
    } catch (e) {
      let dataStr = '';
      try { dataStr = JSON.stringify(e.response?.data || { message: e.message }); } catch { dataStr = String(e.message); }
      this._err(' Request failed:', dataStr);
      const err = new Error(e.response?.data?.error?.message || e.response?.data?.message || e.message || 'HTTP error');
      err.status = e.response?.status;
      throw err;
    }
  }

  async ensurePublisher({ uniqueName, friendlyName, prefix }) {
    let pub = await this.checkPublisherExists(uniqueName);
    if (pub) return pub;

    const byPref = await this.checkPublisherByPrefix(prefix);
    if (byPref) return byPref;

    this._log(` Creating publisher: ${friendlyName} (${uniqueName}, ${prefix})`);
    const createdPublisher = await this.createPublisher({ uniqueName, friendlyName, prefix });
    
    // If we got the publisher data from createPublisher, return it
    if (createdPublisher && createdPublisher.id) {
      return createdPublisher;
    }
    
    // Otherwise, poll to find the created publisher (fallback)
    for (let i = 1; i <= 5; i++) {
      await this.sleep(1000 * i);
      pub = await this.checkPublisherExists(uniqueName);
      if (pub) return pub;
    }
    throw new Error('Created publisher but could not retrieve it.');
  }

  // ------------------------
  // Solutions
  // ------------------------
  async checkSolutionExists(uniqueName) {
    // Include publisher info when checking solution existence
    const q1 = `/solutions?$select=solutionid,uniquename,friendlyname,_publisherid_value&$expand=publisherid($select=publisherid,uniquename,customizationprefix)&$filter=uniquename eq '${uniqueName}'`;
    this._log(' GET', `${this.baseUrl}/api/data/v9.2${q1}`);
    const r1 = await this._req('get', q1);
    const list1 = r1.value || [];
    if (list1.length) return list1[0];
    
    // fallback: try with different case variations (since tolower isn't supported in all environments)
    const caseVariations = [
      uniqueName.toLowerCase(),
      uniqueName.toUpperCase(),
      uniqueName.charAt(0).toUpperCase() + uniqueName.slice(1).toLowerCase()
    ];
    
    for (const variation of caseVariations) {
      if (variation === uniqueName) continue; // already tried this one
      const q = `/solutions?$select=solutionid,uniquename,friendlyname,_publisherid_value&$expand=publisherid($select=publisherid,uniquename,customizationprefix)&$filter=uniquename eq '${variation}'`;
      this._log(' GET', `${this.baseUrl}/api/data/v9.2${q}`);
      try {
        const r = await this._req('get', q);
        const list = r.value || [];
        if (list.length) return list[0];
      } catch (e) {
        // continue to next variation if this one fails
        this._log(' Case variation failed, trying next...');
      }
    }
    
    return null;
  }

  async getSolutionById(solutionId) {
    const q = `/solutions(${solutionId})?$select=solutionid,uniquename,friendlyname,_publisherid_value&$expand=publisherid($select=publisherid,uniquename,customizationprefix)`;
    this._log(' GET', `${this.baseUrl}/api/data/v9.2${q}`);
    const solution = await this._req('get', q);
    return solution;
  }

  async createSolution(uniqueName, friendlyName, { publisherId, description } = {}) {
    const payload = {
      uniquename: String(uniqueName),
      friendlyname: String(friendlyName || uniqueName),
      description: String(description || `Solution created by Mermaid to Dataverse Converter`)
    };
    
    // Include publisher reference - try both methods
    if (publisherId) {
      // Method 1: OData binding (preferred)
      payload['publisherid@odata.bind'] = `/publishers(${publisherId})`;
    } else {
      this._warn('No publisherId provided to createSolution');
    }
    
    this._log(' POST', `${this.baseUrl}/api/data/v9.2/solutions`);
    const res = await this._req('post', '/solutions', payload);
    return res;
  }

  async ensureSolution(uniqueName, friendlyName, pub) {
    let sol = await this.checkSolutionExists(uniqueName);
    if (sol) {
      this._log(`Solution ready: ${sol.uniquename} (${sol.solutionid})`);
      return sol;
    }
    this._log(` Creating solution '${uniqueName}'...`);
    await this.createSolution(uniqueName, friendlyName, { publisherId: pub.publisherid, description: `Solution for ${uniqueName}` });
    // poll
    for (let i = 1; i <= 6; i++) {
      await this.sleep(1000 * i);
      sol = await this.checkSolutionExists(uniqueName);
      if (sol) {
        this._log(`Solution ready: ${sol.uniquename} (${sol.solutionid})`);
        return sol;
      }
    }
    throw new Error('Solution creation did not materialize.');
  }

  // Get solution components to check what was actually deployed
  async getSolutionComponents(solutionUniqueName) {
    try {
      // First get the solution
      const solution = await this.checkSolutionExists(solutionUniqueName);
      if (!solution) {
        return { success: false, error: 'Solution not found' };
      }

      // Get solution components with more detailed information
      const query = `/solutioncomponents?$filter=_solutionid_value eq '${solution.solutionid}'&$select=componenttype,objectid,createdon`;
      const components = await this._req('get', query);
      
      const entities = [];
      const optionSets = [];
      const others = [];

      for (const component of components.value || []) {
        try {
          switch (component.componenttype) {
            case 1: // Entity
              if (component.objectid) {
                try {
                  // Get entity details separately
                  const entityQuery = `/EntityDefinitions(${component.objectid})?$select=LogicalName,DisplayName`;
                  const entityDetails = await this._req('get', entityQuery);
                  entities.push({
                    logicalName: entityDetails.LogicalName,
                    displayName: entityDetails.DisplayName?.UserLocalizedLabel?.Label || entityDetails.LogicalName,
                    type: 'entity',
                    createdOn: component.createdon,
                    metadataId: component.objectid
                  });
                } catch (entityError) {
                  this._log(`Warning: Could not get details for entity ${component.objectid}: ${entityError.message}`);
                  entities.push({
                    logicalName: `Entity_${component.objectid}`,
                    displayName: `Entity (${component.objectid})`,
                    type: 'entity',
                    createdOn: component.createdon,
                    metadataId: component.objectid
                  });
                }
              }
              break;
            case 9: // Option Set (Global Choice)
              if (component.objectid) {
                try {
                  // Get option set details separately
                  const optionSetQuery = `/GlobalOptionSetDefinitions(${component.objectid})?$select=Name,DisplayName,Description`;
                  const optionSetDetails = await this._req('get', optionSetQuery);
                  optionSets.push({
                    logicalName: optionSetDetails.Name,
                    displayName: optionSetDetails.DisplayName?.UserLocalizedLabel?.Label || optionSetDetails.Name,
                    description: optionSetDetails.Description?.UserLocalizedLabel?.Label,
                    type: 'optionset',
                    createdOn: component.createdon,
                    metadataId: component.objectid
                  });
                } catch (optionSetError) {
                  this._log(`Warning: Could not get details for option set ${component.objectid}: ${optionSetError.message}`);
                  optionSets.push({
                    logicalName: `OptionSet_${component.objectid}`,
                    displayName: `Global Choice (${component.objectid})`,
                    type: 'optionset',
                    createdOn: component.createdon,
                    metadataId: component.objectid
                  });
                }
              }
              break;
            default:
              others.push({
                type: 'other',
                componentType: component.componenttype,
                objectId: component.objectid,
                createdOn: component.createdon
              });
              break;
          }
        } catch (componentError) {
          this._log(`Warning: Error processing component ${component.objectid}: ${componentError.message}`);
          others.push({
            type: 'error',
            componentType: component.componenttype,
            objectId: component.objectid,
            error: componentError.message,
            createdOn: component.createdon
          });
        }
      }

      return {
        success: true,
        solution: {
          uniqueName: solution.uniquename,
          friendlyName: solution.friendlyname,
          solutionId: solution.solutionid
        },
        components: {
          entities,
          optionSets,
          others,
          totalCount: (components.value || []).length
        }
      };
    } catch (error) {
      this._log(`Error getting solution components: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  async addEntityToSolution(entityLogicalName, solutionUniqueName, addRequiredComponents = false) {
    // Resolve MetadataId
    const meta = await this._req('get', `/EntityDefinitions(LogicalName='${entityLogicalName}')?$select=MetadataId`);
    const componentId = meta.MetadataId;
    if (!componentId) throw new Error(`Could not resolve MetadataId for ${entityLogicalName}`);

    // AddSolutionComponent
    const body = {
      ComponentId: componentId,
      ComponentType: 1, // Entity
      SolutionUniqueName: solutionUniqueName,
      AddRequiredComponents: addRequiredComponents,
      DoNotIncludeSubcomponents: false
    };
    this._log(` Adding entity ${entityLogicalName} to solution (AddRequiredComponents: ${addRequiredComponents})`);
    this._log(' POST', `${this.baseUrl}/api/data/v9.2/AddSolutionComponent`);
    await this._req('post', '/AddSolutionComponent', body);
  }

  // ------------------------
  // CDM integration (no new tables)
  // ------------------------
  async integrateCDMEntities(cdmMatches, solutionUniqueName, includeRelatedEntities = false) {
    const result = {
      success: true,
      integratedEntities: [],
      errors: [],
      summary: { successfulIntegrations: 0, failedIntegrations: 0, relationshipsCreated: 0 }
    };

    if (!Array.isArray(cdmMatches) || !cdmMatches.length) {
      result.success = false;
      result.errors.push('No CDM matches to integrate');
      return result;
    }

    // ensure solution exists minimally (safe no-op if it does)
    try {
      const sol = await this.checkSolutionExists(solutionUniqueName);
      if (!sol) throw new Error(`Solution '${solutionUniqueName}' not found`);
    } catch (e) {
      result.success = false;
      result.errors.push(e.message);
      return result;
    }

    this._log(`🔄 Processing ${cdmMatches.length} CDM entities...`);
    for (const m of cdmMatches) {
      const ln = m?.cdmEntity?.logicalName;
      if (!ln) { result.summary.failedIntegrations++; continue; }
      try {
        // if it’s already on the solution, this will be idempotent because AddSolutionComponent on the same component is safe
        // For CDM entities, we use the user's choice for AddRequiredComponents
        await this.addEntityToSolution(ln, solutionUniqueName, includeRelatedEntities);
        result.integratedEntities.push(ln);
        result.summary.successfulIntegrations++;
      } catch (e) {
        this._err(` ❌ CDM add failed for ${ln}: ${e.message}`);
        result.summary.failedIntegrations++;
        result.errors.push(`${ln}: ${e.message}`);
      }
    }
    this._log(`✅ CDM integration: ${result.summary.successfulIntegrations} entities integrated`);
    result.success = result.summary.failedIntegrations === 0;
    return result;
  }

  // ------------------------
  // Entity creation (+ attributes) for custom
  // ------------------------
  // Create EntityDefinition
  async createEntity(entityPayload) {
    return this._req('post', `/EntityDefinitions`, entityPayload);
  }

  async createEntityWithRetry(entityPayload, maxRetries = 3) {
    let last;
    for (let a = 1; a <= maxRetries; a++) {
      try {
        return await this.createEntity(entityPayload);
      } catch (e) {
        last = e;
        const lockish = e.status === 503 || /customization/i.test(e.message) || /unexpected/i.test(e.message);
        if (a < maxRetries && lockish) {
          const d = 3000 * a;
          this._log(` Entity create locked/err (attempt ${a}/${maxRetries}). Retrying in ${Math.round(d/1000)}s...`);
          await this.sleep(d);
          continue;
        }
        throw e;
      }
    }
    throw last;
  }

  // Create Attribute
  async createAttribute(entityLogicalName, attributeMetadata) {
    return this._req('post', `/EntityDefinitions(LogicalName='${entityLogicalName}')/Attributes`, attributeMetadata);
  }

  async createAttributeWithRetry(entityLogicalName, attributeMetadata, maxRetries = 4) {
    let last;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await this.createAttribute(entityLogicalName, attributeMetadata);
      } catch (e) {
        last = e;
        const lockish = e.status === 503 ||
          /Customization/i.test(e.message) ||
          /unexpected error/i.test(e.message) ||
          /another user has changed/i.test(e.message);
        if (attempt < maxRetries && lockish) {
          const delay = 2500 * Math.pow(2, attempt - 1);
          this._log(` Attribute create lock/err (attempt ${attempt}/${maxRetries}). Retrying in ${Math.round(delay/1000)}s...`);
          await this.sleep(delay);
          continue;
        }
        throw e;
      }
    }
    throw last;
  }

  // Build attribute metadata
  _stringAttribute(schemaName, display, max = 200) {
    return {
      '@odata.type': 'Microsoft.Dynamics.CRM.StringAttributeMetadata',
      SchemaName: schemaName,
      RequiredLevel: { Value: 'None' },
      MaxLength: max,
      DisplayName: this._label(display)
    };
  }
  
  _memoAttribute(schemaName, display) {
    return {
      '@odata.type': 'Microsoft.Dynamics.CRM.MemoAttributeMetadata',
      SchemaName: schemaName,
      RequiredLevel: { Value: 'None' },
      MaxLength: 2000,
      DisplayName: this._label(display)
    };
  }
  
  _intAttribute(schemaName, display) {
    return {
      '@odata.type': 'Microsoft.Dynamics.CRM.IntegerAttributeMetadata',
      SchemaName: schemaName,
      RequiredLevel: { Value: 'None' },
      Format: 'None',
      DisplayName: this._label(display)
    };
  }
  
  _decimalAttribute(schemaName, display) {
    return {
      '@odata.type': 'Microsoft.Dynamics.CRM.DecimalAttributeMetadata',
      SchemaName: schemaName,
      RequiredLevel: { Value: 'None' },
      Precision: 2,
      DisplayName: this._label(display)
    };
  }
  
  _moneyAttribute(schemaName, display) {
    return {
      '@odata.type': 'Microsoft.Dynamics.CRM.MoneyAttributeMetadata',
      SchemaName: schemaName,
      RequiredLevel: { Value: 'None' },
      Precision: 2,
      DisplayName: this._label(display)
    };
  }
  
  _booleanAttribute(schemaName, display) {
    return {
      '@odata.type': 'Microsoft.Dynamics.CRM.BooleanAttributeMetadata',
      SchemaName: schemaName,
      RequiredLevel: { Value: 'None' },
      DefaultValue: false,
      OptionSet: {
        TrueOption: { Value: 1, Label: this._label('Yes') },
        FalseOption: { Value: 0, Label: this._label('No') }
      },
      DisplayName: this._label(display)
    };
  }
  
  _datetimeAttribute(schemaName, display) {
    return {
      '@odata.type': 'Microsoft.Dynamics.CRM.DateTimeAttributeMetadata',
      SchemaName: schemaName,
      RequiredLevel: { Value: 'None' },
      Format: 'DateAndTime',
      DisplayName: this._label(display)
    };
  }
  
  _dateOnlyAttribute(schemaName, display) {
    return {
      '@odata.type': 'Microsoft.Dynamics.CRM.DateTimeAttributeMetadata',
      SchemaName: schemaName,
      RequiredLevel: { Value: 'None' },
      Format: 'DateOnly',
      DisplayName: this._label(display)
    };
  }
  
  _floatAttribute(schemaName, display) {
    return {
      '@odata.type': 'Microsoft.Dynamics.CRM.DoubleAttributeMetadata',
      SchemaName: schemaName,
      RequiredLevel: { Value: 'None' },
      Precision: 5,
      DisplayName: this._label(display)
    };
  }
  
  _emailAttribute(schemaName, display) {
    return {
      '@odata.type': 'Microsoft.Dynamics.CRM.StringAttributeMetadata',
      SchemaName: schemaName,
      RequiredLevel: { Value: 'None' },
      MaxLength: 100,
      Format: 'Email',
      DisplayName: this._label(display)
    };
  }
  
  _phoneAttribute(schemaName, display) {
    return {
      '@odata.type': 'Microsoft.Dynamics.CRM.StringAttributeMetadata',
      SchemaName: schemaName,
      RequiredLevel: { Value: 'None' },
      MaxLength: 50,
      Format: 'Phone',
      DisplayName: this._label(display)
    };
  }
  
  _urlAttribute(schemaName, display) {
    return {
      '@odata.type': 'Microsoft.Dynamics.CRM.StringAttributeMetadata',
      SchemaName: schemaName,
      RequiredLevel: { Value: 'None' },
      MaxLength: 200,
      Format: 'Url',
      DisplayName: this._label(display)
    };
  }
  
  _tickerAttribute(schemaName, display) {
    return {
      '@odata.type': 'Microsoft.Dynamics.CRM.StringAttributeMetadata',
      SchemaName: schemaName,
      RequiredLevel: { Value: 'None' },
      MaxLength: 10,
      Format: 'TickerSymbol',
      DisplayName: this._label(display)
    };
  }
  
  _durationAttribute(schemaName, display) {
    return {
      '@odata.type': 'Microsoft.Dynamics.CRM.IntegerAttributeMetadata',
      SchemaName: schemaName,
      RequiredLevel: { Value: 'None' },
      Format: 'Duration',
      DisplayName: this._label(display)
    };
  }
  
  _imageAttribute(schemaName, display) {
    return {
      '@odata.type': 'Microsoft.Dynamics.CRM.ImageAttributeMetadata',
      SchemaName: schemaName,
      RequiredLevel: { Value: 'None' },
      DisplayName: this._label(display)
    };
  }
  
  _fileAttribute(schemaName, display) {
    return {
      '@odata.type': 'Microsoft.Dynamics.CRM.FileAttributeMetadata',
      SchemaName: schemaName,
      RequiredLevel: { Value: 'None' },
      MaxSizeInKB: 32768,
      DisplayName: this._label(display)
    };
  }
  
  _timezoneAttribute(schemaName, display) {
    return {
      '@odata.type': 'Microsoft.Dynamics.CRM.IntegerAttributeMetadata',
      SchemaName: schemaName,
      RequiredLevel: { Value: 'None' },
      Format: 'TimeZone',
      DisplayName: this._label(display)
    };
  }
  
  _languageAttribute(schemaName, display) {
    return {
      '@odata.type': 'Microsoft.Dynamics.CRM.IntegerAttributeMetadata',
      SchemaName: schemaName,
      RequiredLevel: { Value: 'None' },
      Format: 'Language',
      DisplayName: this._label(display)
    };
  }
  _label(text) {
    return {
      '@odata.type': 'Microsoft.Dynamics.CRM.Label',
      LocalizedLabels: [{ '@odata.type': 'Microsoft.Dynamics.CRM.LocalizedLabel', Label: text, LanguageCode: 1033 }]
    };
  }

  _safeName(s) {
    return String(s || '').trim().toLowerCase().replace(/[^a-z0-9_]/g, '_').replace(/__+/g, '_');
  }

  _generateRandomPrefix() {
    // Generate 8-character random prefix (must start with letter, then lowercase letters and numbers)
    const letters = 'abcdefghijklmnopqrstuvwxyz';
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let result = letters.charAt(Math.floor(Math.random() * letters.length)); // First char must be letter
    for (let i = 1; i < 8; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  _entityPayloadFromParser(entity, publisherPrefix) {
    const logical = `${publisherPrefix}_${this._safeName(entity.name)}`;
    const schema  = `${publisherPrefix}_${this._safeName(entity.name.charAt(0).toUpperCase() + entity.name.slice(1))}`;
    
    // CUSTOM PRIMARY COLUMN SUPPORT: Use custom primary column name if specified, otherwise default to 'name'
    let primaryColumnName, primaryDisplayName;
    
    if (entity.primaryColumnName) {
      // Custom primary column specified
      primaryColumnName = entity.primaryColumnName;
      primaryDisplayName = entity.primaryColumnDisplayName || entity.primaryColumnName;
      console.log(`🔍 Using custom primary column: ${primaryColumnName} for entity ${entity.name}`);
    } else {
      // Default behavior - look for 'name' attribute or use default
      const nameAttr = entity.attributes?.find(attr => attr.name && attr.name.toLowerCase() === 'name');
      primaryColumnName = 'name';
      primaryDisplayName = nameAttr?.displayName || `${entity.displayName || entity.name} Name`;
      console.log(`🔍 Using default primary column: name for entity ${entity.name}`);
    }
    
    const primarySchema = `${publisherPrefix}_${this._safeName(entity.name)}_${this._safeName(primaryColumnName)}`;
    const displayName = entity.displayName || entity.name;
    
    return {
      LogicalName: logical,
      SchemaName: schema,
      DisplayName: displayName,
      PrimaryAttribute: primarySchema,
      PrimaryAttributeSchema: primarySchema.charAt(0).toUpperCase() + primarySchema.slice(1),
      HasActivities: false,
      HasNotes: true,
      OwnershipType: 'UserOwned',
      PrimaryNameAttributeDisplayName: primaryDisplayName,
      CustomPrimaryColumn: entity.primaryColumnName || null // Track if custom primary column is used
    };
  }

  _attributeFromParser(entityName, attr, publisherPrefix) {
    console.log(`🔍 Processing attribute: ${attr.name} for entity: ${entityName}`);
    
    // CUSTOM PRIMARY COLUMN SUPPORT: Skip primary key attributes since Dataverse provides them automatically
    // This handles both default 'name' columns and custom primary columns
    if (attr.isPrimaryKey) {
      console.log(`🔍 Skipping primary key attribute: ${attr.name} for ${entityName} - handled by primary name column`);
      return null;
    }

    // Also skip 'name' attributes when they're not primary keys (legacy behavior)
    if (attr.name && attr.name.toLowerCase() === 'name' && !attr.isPrimaryKey) {
      console.log(`🔍 SKIPPING 'name' attribute for ${entityName} - using primary name column instead`);
      return null;
    }

    console.log(`🔍 Creating custom attribute: ${attr.name} for entity: ${entityName}`);

    // avoid conflicts on reserved/system names
    const reserved = new Set(['status', 'statecode', 'statuscode', 'description', 'createdon', 'modifiedon']);
    const base = this._safeName(attr.name);
    const entityBase = this._safeName(entityName);
    const schemaBase = reserved.has(base) ? `${publisherPrefix}_${entityBase}_${base}` : `${publisherPrefix}_${base}`;
    const display = attr.displayName || attr.name;

    switch ((attr.type || attr.originalType || '').toLowerCase()) {
      case 'int':
      case 'integer':
      case 'number':
        return this._intAttribute(this._toSchema(schemaBase), display);
        
      case 'decimal':
        return this._decimalAttribute(this._toSchema(schemaBase), display);
        
      case 'money':
      case 'currency':
        return this._moneyAttribute(this._toSchema(schemaBase), display);
        
      case 'boolean':
      case 'bool':
        return this._booleanAttribute(this._toSchema(schemaBase), display);
        
      case 'datetime':
        return this._datetimeAttribute(this._toSchema(schemaBase), display);
        
      case 'date':
      case 'dateonly':
        return this._dateOnlyAttribute(this._toSchema(schemaBase), display);
        
      case 'float':
      case 'double':
      case 'floatingpoint':
        return this._floatAttribute(this._toSchema(schemaBase), display);
        
      case 'email':
        return this._emailAttribute(this._toSchema(schemaBase), display);
        
      case 'phone':
        return this._phoneAttribute(this._toSchema(schemaBase), display);
        
      case 'url':
        return this._urlAttribute(this._toSchema(schemaBase), display);
        
      case 'ticker':
        return this._tickerAttribute(this._toSchema(schemaBase), display);
        
      case 'timezone':
        return this._timezoneAttribute(this._toSchema(schemaBase), display);
        
      case 'language':
        return this._languageAttribute(this._toSchema(schemaBase), display);
        
      case 'duration':
        return this._durationAttribute(this._toSchema(schemaBase), display);
        
      case 'text':
      case 'memo':
      case 'textarea':
        return this._memoAttribute(this._toSchema(schemaBase), display);
        
      case 'image':
        return this._imageAttribute(this._toSchema(schemaBase), display);
        
      case 'file':
        return this._fileAttribute(this._toSchema(schemaBase), display);
        
      case 'string':
      default:
        // string/fallback
        return this._stringAttribute(this._toSchema(schemaBase), display, 4000);
    }
  }

  _toSchema(s) {
    // first char upper after prefix for SchemaName
    if (!s) return s;
    const parts = s.split('_');
    if (parts.length < 2) return s.charAt(0).toUpperCase() + s.slice(1);
    const prefix = parts.shift();
    const cap = parts.map(p => p ? (p.charAt(0).toUpperCase() + p.slice(1)) : '').join('');
    return `${prefix}_${cap}`;
  }

  // ------------------------
  // Relationship creation (CDM ↔ custom supported)
  // ------------------------
  async checkRelationshipExists(referencingEntityLogical, schemaName) {
    // Best-effort generic lookup by schema name
    const q = `/RelationshipDefinitions?$select=SchemaName&$filter=SchemaName eq '${schemaName}'`;
    try {
      const d = await this._req('get', q);
      const list = d.value || [];
      return list.some(r => r.SchemaName === schemaName);
    } catch {
      // Some orgs limit RelationshipDefinitions, fallback to false => let creation try
      return false;
    }
  }

  async createRelationship(payload) {
    return this._req('post', `/RelationshipDefinitions`, payload);
  }

  async createRelationshipWithRetry(payload, maxRetries = 4) {
    let last;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        this._log(` Relationship creation attempt ${attempt}/${maxRetries} for ${payload.SchemaName}...`);
        return await this.createRelationship(payload);
      } catch (e) {
        last = e;
        // More comprehensive error detection
        const isRetryableError = 
          e.status === 503 || // Service Unavailable
          e.status === 429 || // Too Many Requests
          e.status === 409 || // Conflict
          /unexpected/i.test(e.message) || 
          /customization/i.test(e.message) ||
          /locked/i.test(e.message) ||
          /timeout/i.test(e.message) ||
          /busy/i.test(e.message) ||
          /try again/i.test(e.message);
          
        if (attempt < maxRetries && isRetryableError) {
          // Exponential backoff with jitter
          const baseDelay = 2500 * Math.pow(2, attempt - 1);
          const jitter = Math.floor(Math.random() * 1000);
          const delay = baseDelay + jitter;
          
          this._log(` ⚠️ Relationship creation failed (${e.message}). Retrying in ${Math.round(delay/1000)}s... (Attempt ${attempt}/${maxRetries})`);
          await this.sleep(delay);
          continue;
        }
        
        this._err(` ❌ Relationship creation failed with error: ${e.message}`);
        throw e;
      }
    }
    throw last;
  }

  _resolveLogicalNameForRelationship(name, { publisherPrefix, cdmMap }) {
    if (!name) return null;
    
    // Handle various input formats and normalizations
    let key = String(name).trim();
    
    // Remove quotes if present
    if (key.startsWith('"') && key.endsWith('"')) key = key.slice(1, -1);
    
    // Convert to lowercase for consistency
    key = key.toLowerCase();
    
    // Debug logging
    
    // Check if this is a CDM entity (from the map)
    const cdm = cdmMap?.[key];
    if (cdm) {
      this._log(` 🔍 Resolved CDM entity: ${key} → ${cdm}`);
      return cdm;
    }
    
    // Fallback: Check for common CDM entities that should always be CDM
    const commonCdmEntities = {
      'account': 'account',
      'contact': 'contact',
      'lead': 'lead',
      'opportunity': 'opportunity',
      'case': 'incident',
      'incident': 'incident',
      'user': 'systemuser',
      'systemuser': 'systemuser',
      'team': 'team',
      'businessunit': 'businessunit'
    };
    
    if (commonCdmEntities[key]) {
      return commonCdmEntities[key];
    }
    
    
    // If not CDM, it's a custom entity - apply prefix
    const customLogicalName = `${publisherPrefix}_${key}`;
    this._log(` 🔍 Resolved custom entity: ${key} → ${customLogicalName}`);
    return customLogicalName;
  }

  _buildRelationshipPayload({ referencingLogical, referencedLogical, schemaName, fromEntity, toEntity, publisherPrefix }) {
    const friendlyFrom = fromEntity.charAt(0).toUpperCase() + fromEntity.slice(1);
    const lookupName = `${publisherPrefix}_${fromEntity}id`;
    const lookupDisplayName = `${friendlyFrom} Reference`;
    
    // Build a more robust payload with more explicit relationship properties
    return {
      SchemaName: schemaName,
      ReferencingEntity: referencingLogical, // many side
      ReferencedEntity: referencedLogical,   // one side
      '@odata.type': 'Microsoft.Dynamics.CRM.OneToManyRelationshipMetadata',
      ReferencingEntityNavigationPropertyName: `${publisherPrefix}_${fromEntity}`,
      ReferencedEntityNavigationPropertyName: `${publisherPrefix}_${toEntity}s`,
      CascadeConfiguration: {
        Assign: "NoCascade",
        Delete: "RemoveLink", // Safe default to prevent cascade delete conflicts
        Merge: "NoCascade",
        Reparent: "NoCascade",
        Share: "NoCascade",
        Unshare: "NoCascade"
      },
      IsValidForAdvancedFind: true,
      Lookup: {
        AttributeType: 'Lookup',
        AttributeTypeName: { Value: 'LookupType' },
        SchemaName: lookupName,
        DisplayName: this._label(lookupDisplayName),
        Description: this._label(`Reference to ${fromEntity}`),
        RequiredLevel: { Value: "None" },
        '@odata.type': 'Microsoft.Dynamics.CRM.LookupAttributeMetadata'
      }
    };
  }

  async createRelationshipsSmart(parserRels, { publisherPrefix = 'mdv', cdmEntities = [] } = {}) {
    if (!Array.isArray(parserRels) || !parserRels.length) {
      this._log(' No relationships to create');
      return { created: 0, failed: 0 };
    }

    // Build a map of UI name → CDM logical name
    const cdmMap = {};
    for (const m of cdmEntities) {
      const uiName = m?.originalEntity?.name;
      const logical = m?.cdmEntity?.logicalName;
      if (uiName && logical) cdmMap[uiName.toLowerCase()] = logical.toLowerCase();
    }

    // Wait longer for entities to be fully provisioned
    this._log(' Ensuring entities are fully provisioned before creating relationships...');
    await this.sleep(20000); // Increased wait time to 20 seconds

    let created = 0, failed = 0;
    for (let i = 0; i < parserRels.length; i++) {
      const r = parserRels[i];
      const from = (r.fromEntity || '').trim(); // ONE side
      const to   = (r.toEntity   || '').trim(); // MANY side
      if (!from || !to) {
        this._warn(` ⚠️ Relationship ${i + 1} missing from/to`);
        failed++;
        continue;
      }

      // Verify both entities exist before attempting to create relationship
      const referencedLogical  = this._resolveLogicalNameForRelationship(from, { publisherPrefix, cdmMap });
      const referencingLogical = this._resolveLogicalNameForRelationship(to,   { publisherPrefix, cdmMap });
      
      try {
        // Verify the entities exist and are fully provisioned
        await this._req('get', `/EntityDefinitions(LogicalName='${referencedLogical}')?$select=MetadataId`);
        await this._req('get', `/EntityDefinitions(LogicalName='${referencingLogical}')?$select=MetadataId`);
      } catch (e) {
        this._err(` ❌ Cannot create relationship: Entity ${e.message.includes(referencedLogical) ? referencedLogical : referencingLogical} not found or not fully provisioned`);
        failed++;
        continue;
      }
      
      const schemaName = `${publisherPrefix}_${from.toLowerCase()}_${to.toLowerCase()}`;

      const exists = await this.checkRelationshipExists(referencingLogical, schemaName);
      if (exists) {
        this._log(` ⏭️ Relationship already exists: ${schemaName}`);
        created++;
        continue;
      }

      const payload = this._buildRelationshipPayload({
        referencingLogical, referencedLogical, schemaName,
        fromEntity: from.toLowerCase(), toEntity: to.toLowerCase(), publisherPrefix
      });

      try {
        this._log(` Creating relationship ${i + 1}/${parserRels.length}: ${schemaName}`);
        await this.createRelationshipWithRetry(payload, 5); // Increased retries to 5
        this._log(` ✅ Relationship created: ${schemaName}`);
        created++;
        await this.sleep(3000); // Increased wait time between relationship creations
      } catch (e) {
        this._err(` ❌ Failed to create relationship ${schemaName}: ${e.message}`);
        this._log(` 🔄 Waiting 5 seconds before continuing to next relationship...`);
        await this.sleep(5000); // Add additional delay after failure
        failed++;
      }
    }
    this._log(` Relationship creation completed: ${created} successful, ${failed} failed`);
    return { created, failed };
  }

  // ------------------------
  // Orchestrators
  // ------------------------

  /**
   * Create custom entities with attributes and optional relationships.
   * @param {Array} entities - parser entities
   * @param {Object} options - { publisherPrefix, relationships, solutionUniqueName, cdmEntities, progressCallback }
   */
  async createCustomEntities(entities, options = {}) {
    const results = {
      success: true,
      entitiesCreated: 0,
      relationshipsCreated: 0,
      relationshipsFailed: 0,
      errors: []
    };

    if (!Array.isArray(entities) || !entities.length) {
      return { success: true, entitiesCreated: 0, relationshipsCreated: 0 };
    }

    const publisherPrefix = options.publisherPrefix || this._generateRandomPrefix();
    
    if (!options.publisherPrefix) {
      this._log(`⚠️ WARNING: No publisherPrefix provided, generated random prefix: ${publisherPrefix}`);
      this._log('This should not happen in normal operation. Check frontend publisher data.');
    }
    const publisherName   = options.publisherName || 'Mermaid Publisher';
    const publisherUnique = options.publisherUniqueName || publisherName.replace(/\s+/g, '');
    const progressCallback = options.progressCallback;

    this._log(`Using publisher prefix: ${publisherPrefix}`);

    // Ensure Publisher + Solution
    const pub = await this.ensurePublisher({
      uniqueName: publisherUnique,
      friendlyName: publisherName,
      prefix: publisherPrefix
    });

    let sol = null;
    if (options.solutionUniqueName) {
      sol = await this.ensureSolution(options.solutionUniqueName, options.solutionFriendlyName || options.solutionUniqueName, pub);
    }

    // Create entities
    const logicalNames = [];
    for (const entity of entities) {
      try {
        if (progressCallback) {
          progressCallback('entity-create', `Creating Table: ${entity.displayName || entity.name}`, { entityName: entity.name });
        }
        this._log(`Creating entity: ${entity.name}`);
        const payload = this._entityPayloadFromParser(entity, publisherPrefix);
        const entityResponse = await this.createEntityWithRetry({
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
        this._log(`✅ Created entity: ${entity.name} (ID: ${entityResponse?.MetadataId || 'N/A'})`);
        logicalNames.push(payload.LogicalName);

        // Wait + verify before attributes
        await this.sleep(4000);
        try {
          await this._req('get', `/EntityDefinitions(LogicalName='${payload.LogicalName}')?$select=LogicalName`);
          this._log(` Entity ${payload.LogicalName} is reachable for attribute creation`);
        } catch (e) {
          this._warn(` Entity verify before attributes failed (continuing): ${e.message}`);
        }

        // Attributes
        if (Array.isArray(entity.attributes)) {
          // CUSTOM PRIMARY COLUMN SUPPORT: Filter out system-handled attributes
          // Foreign key attributes will be created by relationship creation
          // Primary key attributes (including custom ones) are handled by the primary name column
          // "status" attributes are system-provided in Dataverse via statecode/statuscode
          const regularAttributes = entity.attributes.filter(a => {
            const isFK = a.isForeignKey;
            const isPrimaryKey = a.isPrimaryKey; // This handles both 'name' and custom primary columns
            const isNameAttr = a.name && a.name.toLowerCase() === 'name' && !a.isPrimaryKey; // Legacy name handling
            const isEntityNameAttr = a.name && a.name.toLowerCase() === `${entity.name.toLowerCase()}_name`;
            const isStatusAttr = a.name && a.name.toLowerCase() === 'status';
            return !isFK && !isPrimaryKey && !isNameAttr && !isEntityNameAttr && !isStatusAttr;
          });
          this._log(`🔍 Processing ${regularAttributes.length} regular attributes (filtered out ${entity.attributes.length - regularAttributes.length} primary key/foreign key/name/status attributes)`);
          
          if (progressCallback && regularAttributes.length > 0) {
            progressCallback('entity-columns', `Adding columns to Table: ${entity.displayName || entity.name}`, { entityName: entity.name, columnCount: regularAttributes.length });
          }
          
          for (const a of regularAttributes) {
            const attrMeta = this._attributeFromParser(entity.name, a, publisherPrefix);
            if (!attrMeta) continue; // skipped (PK)
            try {
              const schemaN = attrMeta.SchemaName;
              this._log(` Creating attribute: ${schemaN} for entity ${payload.LogicalName}`);
              await this.createAttributeWithRetry(payload.LogicalName, attrMeta);
            } catch (e) {
              this._err(` ⚠️ Failed to create attribute ${a.name} for entity ${entity.name}: ${e.message}`);
              results.errors.push(`Attribute ${a.name} on ${entity.name}: ${e.message}`);
            }
          }
        }

        // Add entity to solution (if requested)
        if (sol) {
          this._log(`🔍 Attempting to add entity ${entity.name} to solution. Sol object:`, JSON.stringify(sol, null, 2));
          // Resolve & add; retry a couple of times because metadata id can lag
          let added = false;
          for (let t = 1; t <= 3 && !added; t++) {
            try {
              // For newly created entities, use the user's choice for AddRequiredComponents
              await this.addEntityToSolution(payload.LogicalName, sol.uniquename, options.includeRelatedEntities || false);
              added = true;
            } catch (e) {
              this._warn(` Attempt ${t}/3 to add entity ${payload.LogicalName} to solution failed: ${e.message} \n Waiting 2 seconds before retry...`);
              await this.sleep(2000);
            }
          }
          if (added) this._log(`✅ Added entity ${entity.name} to solution ${sol.uniquename}`);
          else this._err(`❌ Failed to add entity ${entity.name} to solution after 3 attempts`);
        } else {
          this._warn(`⚠️ No solution object found - entity ${entity.name} will not be added to any solution`);
        }

        results.entitiesCreated++;

      } catch (e) {
        this._err(`❌ Failed to create entity ${entity.name}: ${e.message}`);
        results.errors.push(`Entity ${entity.name}: ${e.message}`);
        results.success = false;
      }
    }

    // Relationships (supports CDM↔custom)
    if (Array.isArray(options.relationships) && options.relationships.length) {
      this._log(` Found ${options.relationships.length} relationships to create`);
      this._log(` Waiting for entities to be fully provisioned before creating relationships...`);
      
      // Wait longer for entities to be fully available in Dataverse
      await this.sleep(25000);
      
      if (progressCallback) {
        progressCallback('relationships', 'Creating Relationships...', { relationshipCount: options.relationships.length });
      }
      this._log(` Starting relationship creation: ${options.relationships.length} relationships to create...`);

      try {
        const relStats = await this.createRelationshipsSmart(options.relationships, {
          publisherPrefix,
          cdmEntities: options.cdmEntities || []
        });
        results.relationshipsCreated += relStats.created;
        results.relationshipsFailed  += relStats.failed;
        
        if (relStats.failed > 0) {
          this._log(` ⚠️ Some relationships failed to create. Check the logs for details.`);
          this._log(` 🔄 Consider running the process again to create the missing relationships.`);
        }
      } catch (e) {
        this._err(` ❌ Error during relationship creation process: ${e.message}`);
        results.errors.push(`Relationship creation error: ${e.message}`);
      }
    } else {
      this._log(' No relationships to create');
    }

    return results;
  }

  /**
   * Back-compat wrapper for older server code.
   * @param {Array} entities
   * @param {Object} options - { publisherPrefix, relationships, solutionFriendlyName, solutionName, cdmEntities }
   */
  async createEntitiesFromMermaid(entities, options = {}) {
    const solutionUniqueName = options.solutionName || options.solutionUniqueName;
    const res = await this.createCustomEntities(entities, {
      publisherName: options.publisherName || options.publisherFriendlyName || 'Mermaid Publisher',
      publisherUniqueName: options.publisherUniqueName || (options.publisherName || 'MermaidPublisher').replace(/\s+/g, ''),
      publisherPrefix: options.publisherPrefix || 'mdv',
      relationships: options.relationships || [],
      solutionUniqueName,
      solutionFriendlyName: options.solutionFriendlyName || solutionUniqueName,
      cdmEntities: options.cdmEntities || []
    });

    return {
      success: res.success,
      entitiesCreated: res.entitiesCreated || 0,
      relationshipsCreated: res.relationshipsCreated || 0,
      relationshipsFailed: res.relationshipsFailed || 0,
      errors: res.errors || []
    };
  }

  // ------------------------
  // (Optional) Publishers list, Global choices – stubs used by server
  // ------------------------
  async getPublishers() {
    const q = `/publishers?$select=publisherid,uniquename,friendlyname,customizationprefix&$orderby=friendlyname asc`;
    const d = await this._req('get', q);
    return (d.value || []).map(p => ({
      id: p.publisherid,
      uniqueName: p.uniquename,
      friendlyName: p.friendlyname,
      prefix: p.customizationprefix,
      isDefault: false
    }));
  }

  async getSolutions() {
    // Start with the most basic query possible
    const q = `/solutions?$select=solutionid,uniquename,friendlyname`;
    console.log(`GET ${this.baseUrl}${q}`);
    
    try {
      const d = await this._req('get', q);
      console.log(`✅ Solutions query successful, found ${d.value?.length || 0} solutions`);
      
      const allSolutions = (d.value || []).map(s => ({
        solutionid: s.solutionid,
        uniquename: s.uniquename,
        friendlyname: s.friendlyname,
        _publisherid_value: null,
        publisherid: null
      }));

      // Filter out Microsoft system solutions to show only user-created solutions
      const userSolutions = allSolutions.filter(solution => {
        const solutionName = solution.uniquename?.toLowerCase() || '';
        
        // Exclude system solutions by name patterns
        const isSystemSolution = solutionName.startsWith('msft_') ||
                                solutionName.startsWith('msdyn_') ||
                                solutionName.startsWith('msdynce_') ||
                                solutionName === 'default' ||
                                solutionName === 'system' ||
                                solutionName === 'basic';
        
        return !isSystemSolution;
      });

      console.log(`✅ Filtered to ${userSolutions.length} user solutions`);
      return { success: true, solutions: userSolutions };
    } catch (error) {
      console.log(`❌ Solutions query failed: ${error.message}`);
      return { success: false, message: error.message, solutions: [] };
    }
  }

  // Helper method to check if authentication is properly configured
  _isAuthConfigured() {
    // Only managed identity and federated credentials are supported
    return !!(this.tenantId && this.clientId && this.baseUrl);
  }

  async getGlobalChoiceSets() {
    console.log('🎯 Getting global choice sets from Dataverse...');
    
    try {
      // Check if we have valid authentication configuration before making any calls
      if (!this._isAuthConfigured()) {
        console.log('⚠️ No Dataverse authentication configured, returning empty choice sets for now');
        return {
          all: [],
          grouped: { custom: [], builtIn: [] },
          summary: { total: 0, custom: 0, builtIn: 0 }
        };
      }
      
      // Query for global choice sets (OptionSets in Dataverse)
      // Get both managed and unmanaged choice sets, limit to 500 for performance
      const oDataQuery = 'GlobalOptionSetDefinitions?$select=Name,DisplayName,Description,IsManaged&$top=500&$orderby=DisplayName';
      const choiceSets = await this._get(oDataQuery);
      
      console.log('🎯 Retrieved choice sets:', choiceSets.value?.length || 0);
      
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
      
      console.log('🎯 Global choices summary:', result.summary);
      return result;
      
    } catch (error) {
      console.error('❌ Error fetching global choice sets:', error);
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
   * @returns {Promise<Object>} Single choice set data
   */
  async getGlobalChoiceSet(choiceName) {
    console.log('🎯 Getting single global choice set:', choiceName);
    
    try {
      // Check if we have valid authentication configuration before making any calls
      if (!this._isAuthConfigured()) {
        console.log('⚠️ No Dataverse authentication configured');
        return null;
      }
      
      // Query for specific global choice set by name
      const oDataQuery = `GlobalOptionSetDefinitions?$filter=Name eq '${choiceName}'&$select=Name,DisplayName,Description,IsManaged`;
      const result = await this._get(oDataQuery);
      
      if (!result.value || result.value.length === 0) {
        console.log('❌ Choice set not found:', choiceName);
        return null;
      }
      
      const choice = result.value[0];
      const processedChoice = {
        id: choice.Name,
        name: choice.Name,
        displayName: choice.DisplayName?.UserLocalizedLabel?.Label || choice.DisplayName?.LocalizedLabels?.[0]?.Label || choice.Name,
        description: choice.Description?.UserLocalizedLabel?.Label || choice.Description?.LocalizedLabels?.[0]?.Label || '',
        isManaged: choice.IsManaged,
        isCustom: !choice.IsManaged,
        prefix: choice.Name.includes('_') ? choice.Name.split('_')[0] : ''
      };
      
      console.log('✅ Found choice set:', { name: processedChoice.name, displayName: processedChoice.displayName });
      return processedChoice;
      
    } catch (error) {
      console.error('❌ Error fetching single global choice set:', error);
      return null;
    }
  }

  async addGlobalChoicesToSolution(selectedChoices, solutionUniqueName) {
    console.log(`🎨 Adding ${selectedChoices.length} existing global choices to solution: ${solutionUniqueName}`);
    
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
        const allChoices = await this._get(`GlobalOptionSetDefinitions?$select=MetadataId,Name`);
        
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
        await this._req('POST', '/AddSolutionComponent', componentBody);
        added++;
        console.log(`✅ Added global choice set '${choiceName}' to solution`);
      } catch (error) {
        failed++;
        const errorMsg = `Failed to add global choice set '${choiceName}': ${error.message}`;
        errors.push(errorMsg);
        console.error(`❌ ${errorMsg}`);
      }
    }
    
    return { added, failed, errors };
  }

  async createAndAddCustomGlobalChoices(customChoices, solutionUniqueName, publisherPrefix, progressCallback = null) {
    if (progressCallback) {
      progressCallback('global-choices', 'Creating Global Choices...', { choiceCount: customChoices.length });
    }
    
    console.log(`🎨 Creating ${customChoices.length} custom global choices and adding to solution: ${solutionUniqueName}`);
    
    let created = 0;
    let skipped = 0;
    let failed = 0;
    const errors = [];
    
    // Get existing global choices first to check for duplicates
    let existingChoices = [];
    try {
      const allChoices = await this._get(`GlobalOptionSetDefinitions?$select=Name`);
      existingChoices = allChoices.value?.map(c => c.Name.toLowerCase()) || [];
      console.log(`🔍 Found ${existingChoices.length} existing global choices for duplicate checking`);
    } catch (error) {
      console.warn('⚠️ Could not fetch existing choices for duplicate checking:', error.message);
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
          console.warn(`⚠️ ${warnMsg}`);
          
          // Try to add existing choice to solution
          try {
            // Find the existing choice to get its MetadataId
            const allChoices = await this._get(`GlobalOptionSetDefinitions?$select=MetadataId,Name`);
            const existingChoice = allChoices.value?.find(choice => choice.Name === finalChoiceName);
            if (existingChoice) {
              const componentBody = {
                ComponentId: existingChoice.MetadataId,
                ComponentType: 9, // OptionSet component type
                SolutionUniqueName: solutionUniqueName,
                AddRequiredComponents: false,
                DoNotIncludeSubcomponents: false
              };
              
              await this._req('POST', '/AddSolutionComponent', componentBody);
              console.log(`✅ Added existing global choice set '${finalChoiceName}' to solution`);
            }
          } catch (addError) {
            console.warn(`⚠️ Could not add existing choice '${finalChoiceName}' to solution: ${addError.message}`);
          }
          
          continue;
        }
        
        // Build options array
        const options = (choice.options || []).map((option, index) => ({
          "Value": option.value || (100000000 + index),
          "Label": {
            "@odata.type": "Microsoft.Dynamics.CRM.Label",
            "LocalizedLabels": [
              {
                "@odata.type": "Microsoft.Dynamics.CRM.LocalizedLabel",
                "Label": option.label || option.name,
                "LanguageCode": 1033
              }
            ]
          },
          "Description": {
            "@odata.type": "Microsoft.Dynamics.CRM.Label",
            "LocalizedLabels": [
              {
                "@odata.type": "Microsoft.Dynamics.CRM.LocalizedLabel",
                "Label": option.description || "",
                "LanguageCode": 1033
              }
            ]
          }
        }));
        
        const globalChoiceBody = {
          "@odata.type": "Microsoft.Dynamics.CRM.OptionSetMetadata",
          "Name": publisherPrefix ? `${publisherPrefix}_${choiceName}` : choiceName,
          "DisplayName": {
            "@odata.type": "Microsoft.Dynamics.CRM.Label",
            "LocalizedLabels": [
              {
                "@odata.type": "Microsoft.Dynamics.CRM.LocalizedLabel",
                "Label": displayName,
                "LanguageCode": 1033
              }
            ]
          },
          "Description": {
            "@odata.type": "Microsoft.Dynamics.CRM.Label",
            "LocalizedLabels": [
              {
                "@odata.type": "Microsoft.Dynamics.CRM.LocalizedLabel",
                "Label": description,
                "LanguageCode": 1033
              }
            ]
          },
          "Options": options,
          "IsGlobal": true
        };
        
        // Create the global choice set
        await this._req('POST', '/GlobalOptionSetDefinitions', globalChoiceBody);
        
        // Wait longer for the choice set to be created and try multiple times to find it
        let createdChoice = null;
        let attempts = 0;
        const maxAttempts = 5;
        
        while (!createdChoice && attempts < maxAttempts) {
          attempts++;
          const waitTime = Math.min(3000 + (attempts * 2000), 10000); // Progressive wait: 3s, 5s, 7s, 9s, 10s
          await this.sleep(waitTime);
          
          console.log(`🔍 Attempt ${attempts}/${maxAttempts}: Looking for created global choice set '${finalChoiceName}'`);
          
          // Get the MetadataId of the newly created global choice set
          const allChoices = await this._get(`GlobalOptionSetDefinitions?$select=MetadataId,Name`);
          createdChoice = allChoices.value.find(choice => choice.Name === finalChoiceName);
          
          if (!createdChoice && attempts < maxAttempts) {
            console.log(`Global choice set '${finalChoiceName}' not found yet, waiting longer...`);
          }
        }
        
        if (!createdChoice) {
          // Try comprehensive verification using full choices list
          console.log(`🔄 Final verification using comprehensive global choices list for '${finalChoiceName}'`);
          try {
            // Get all global choices to see if our choice exists
            const allChoicesQuery = `GlobalOptionSetDefinitions?$select=MetadataId,Name,DisplayName`;
            const allChoicesResult = await this._get(allChoicesQuery);
            if (allChoicesResult.value) {
              const foundChoice = allChoicesResult.value.find(choice => 
                choice.Name === finalChoiceName || choice.Name === finalChoiceName.toLowerCase()
              );
              
              if (foundChoice) {
                createdChoice = foundChoice;
                console.log(`✅ Found '${finalChoiceName}' in comprehensive verification`);
              } else {
                console.log(`⚠️ Choice '${finalChoiceName}' not found in comprehensive list of ${allChoicesResult.value.length} choices`);
              }
            }
          } catch (altError) {
            console.log(`⚠️ Comprehensive verification failed: ${altError.message}`);
          }
          
          if (!createdChoice) {
            // Since choices often exist despite verification failures, treat as warning
            console.log(`⚠️ Verification failed for '${finalChoiceName}' but treating as non-fatal error`);
            // Even without MetadataId, we'll try to add to solution later by searching again
            createdChoice = { Name: finalChoiceName, MetadataId: null, verified: false };
          }
        }
        
        // Add to solution using AddSolutionComponent action
        if (createdChoice.MetadataId && createdChoice.verified !== false) {
          const componentBody = {
            ComponentId: createdChoice.MetadataId,
            ComponentType: 9, // OptionSet component type
            SolutionUniqueName: solutionUniqueName,
            AddRequiredComponents: false,
            DoNotIncludeSubcomponents: false
          };
          
          await this._req('POST', '/AddSolutionComponent', componentBody);
          console.log(`✅ Created and added custom global choice set '${finalChoiceName}' to solution`);
        } else {
          // Try one more time to find and add to solution
          console.log(`🔄 Attempting final solution addition for '${finalChoiceName}' after delay...`);
          await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds
          
          try {
            const allChoicesForFinalLookup = await this._get(`GlobalOptionSetDefinitions?$select=MetadataId,Name`);
            const foundChoice = allChoicesForFinalLookup.value?.find(choice => choice.Name === finalChoiceName);
            if (foundChoice) {
              const componentBody = {
                ComponentId: foundChoice.MetadataId,
                ComponentType: 9,
                SolutionUniqueName: solutionUniqueName,
                AddRequiredComponents: false,
                DoNotIncludeSubcomponents: false
              };
              
              await this._req('POST', '/AddSolutionComponent', componentBody);
              console.log(`✅ Found and added '${finalChoiceName}' to solution after final attempt`);
            } else {
              console.log(`⚠️ Final lookup also failed for '${finalChoiceName}' - choice may still exist but not be discoverable via API`);
            }
          } catch (finalError) {
            console.log(`⚠️ Final solution addition failed for '${finalChoiceName}': ${finalError.message}`);
          }
        }
        
        created++;
      } catch (error) {
        failed++;
        const errorMsg = `Failed to create custom global choice set '${choice.name}': ${error.message}`;
        errors.push(errorMsg);
        console.error(`❌ ${errorMsg}`);
      }
      
      // Add delay between processing choices to prevent overwhelming Dataverse
      if (customChoices.indexOf(choice) < customChoices.length - 1) {
        console.log(`Waiting 3 seconds before processing next global choice...`);
        await this.sleep(3000);
      }
    }
    
    return { created, failed, skipped, errors };
  }

  async addPendingGlobalChoicesToSolution() {
    // Deprecated method - functionality moved to addGlobalChoicesToSolution and createAndAddCustomGlobalChoices
    return { added: 0, failed: 0, errors: [] };
  }
  
  // --- HTTP helper methods -----------------------------------------------
  async _get(url) {
    return await this._req('GET', url);
  }
  
  async _delete(url, options = {}) {
    return await this._req('DELETE', url, undefined, options);
  }
  
  async _post(url, body) {
    return await this._req('POST', url, body);
  }
  
  // --- cleanup methods ---------------------------------------------------
  async cleanupTestEntities(options = {}) {
    const {
      cleanupAll = false,
      entityPrefixes = [],
      preserveCDM = true,
      deleteRelationshipsFirst = true
    } = options;
    
    this._log(`🧹 Starting cleanup process`);
    
    const results = {
      entitiesFound: [],
      relationshipsFound: [],
      entitiesDeleted: 0,
      relationshipsDeleted: 0,
      errors: [],
      warnings: []
    };
    
    try {
      // Get access token
      await this._ensureToken();
      
      // 1. Discover custom entities (entities with random prefixes)
      this._log('🔍 Discovering custom entities...');
      const allEntities = await this._discoverCustomEntities();
      
      // Filter entities based on criteria
      let entitiesToCleanup = allEntities.filter(entity => {
        // Skip CDM entities if preserveCDM is true
        if (preserveCDM && this._isCDMEntity(entity)) {
          return false;
        }
        
        // If specific prefixes are provided, only clean those
        if (entityPrefixes.length > 0) {
          return entityPrefixes.some(prefix => entity.LogicalName.startsWith(prefix));
        }
        
        // If cleanupAll is true, clean all custom entities
        if (cleanupAll) {
          return true;
        }
        
        // Default: clean entities that look like test entities (random prefixes)
        return this._looksLikeTestEntity(entity);
      });
      
      results.entitiesFound = entitiesToCleanup.map(e => ({
        name: e.DisplayName?.UserLocalizedLabel?.Label || e.LogicalName,
        logicalName: e.LogicalName,
        prefix: this._extractPrefix(e.LogicalName)
      }));
      
      this._log(`Found ${entitiesToCleanup.length} entities to clean up`);
      
      if (deleteRelationshipsFirst) {
        // 2. Discover relationships involving these entities
        this._log('🔍 Discovering relationships...');
        const relationships = await this._discoverRelationships(entitiesToCleanup);
        
        results.relationshipsFound = relationships.map(r => ({
          name: r.name,
          fromEntity: r.fromEntity,
          toEntity: r.toEntity,
          logicalName: r.logicalName
        }));
        
        this._log(`Found ${relationships.length} relationships to clean up`);
        
        // 3. Delete relationships first (to resolve dependencies)
        if (relationships.length > 0) {
          this._log('🗑️ Deleting relationships...');
          for (const rel of relationships) {
            try {
              await this._deleteRelationship(rel);
              results.relationshipsDeleted++;
              this._log(`✅ Deleted relationship: ${rel.name}`);
            } catch (e) {
              const error = `Failed to delete relationship ${rel.name}: ${e.message}`;
              this._err(error);
              results.errors.push(error);
            }
          }
        }
      }
      
      // 4. Delete entities
      if (entitiesToCleanup.length > 0) {
        this._log('🗑️ Deleting entities...');
        for (const entity of entitiesToCleanup) {
          try {
            await this._deleteEntity(entity);
            results.entitiesDeleted++;
            this._log(`✅ Deleted entity: ${entity.DisplayName?.UserLocalizedLabel?.Label || entity.LogicalName}`);
          } catch (e) {
            const error = `Failed to delete entity ${entity.DisplayName?.UserLocalizedLabel?.Label || entity.LogicalName}: ${e.message}`;
            this._err(error);
            results.errors.push(error);
          }
        }
      }

      results.summary = `Deleted ${results.relationshipsDeleted} relationships and ${results.entitiesDeleted} entities`;      this._log(results.summary);
      
    } catch (e) {
      this._err(`Cleanup error: ${e.message}`);
      results.errors.push(e.message);
    }
    
    return results;
  }
  
  async _discoverCustomEntities() {
    // Use the correct Dataverse Web API endpoint for entity metadata
    const query = `/EntityDefinitions?$select=LogicalName,DisplayName,IsManaged,IsCustomizable&$filter=IsManaged eq false and IsCustomizable/Value eq true`;
    const response = await this._req('GET', query);
    return response.value || [];
  }
  
  async _discoverRelationships(entities) {
    const entityNames = entities.map(e => e.LogicalName);
    const relationships = [];
    
    for (const entityName of entityNames) {
      try {
        // Get one-to-many relationships where this entity is the parent
        const oneToManyQuery = `/EntityDefinitions(LogicalName='${entityName}')/OneToManyRelationships?$select=ReferencingEntity,ReferencedEntity,SchemaName,IsCustomRelationship`;
        const oneToMany = await this._req('GET', oneToManyQuery);
        
        for (const rel of oneToMany.value || []) {
          // Only include custom relationships that we created
          if (rel.IsCustomRelationship && this._isOurCustomRelationship(rel.SchemaName)) {
            relationships.push({
              name: rel.SchemaName,
              logicalName: rel.SchemaName,
              fromEntity: rel.ReferencedEntity,
              toEntity: rel.ReferencingEntity,
              type: 'OneToMany'
            });
          }
        }
        
        // Get many-to-one relationships where this entity is the child
        const manyToOneQuery = `/EntityDefinitions(LogicalName='${entityName}')/ManyToOneRelationships?$select=ReferencingEntity,ReferencedEntity,SchemaName,IsCustomRelationship`;
        const manyToOne = await this._req('GET', manyToOneQuery);
        
        for (const rel of manyToOne.value || []) {
          // Only include custom relationships that we created
          if (rel.IsCustomRelationship && this._isOurCustomRelationship(rel.SchemaName)) {
            relationships.push({
              name: rel.SchemaName,
              logicalName: rel.SchemaName,
              fromEntity: rel.ReferencedEntity,
              toEntity: rel.ReferencingEntity,
              type: 'ManyToOne'
            });
          }
        }
        
      } catch (e) {
        this._log(`Warning: Could not get relationships for ${entityName}: ${e.message}`);
      }
    }
    
    // Remove duplicates
    const uniqueRelationships = relationships.filter((rel, index, self) => 
      index === self.findIndex(r => r.logicalName === rel.logicalName)
    );
    
    return uniqueRelationships;
  }
  
  async _deleteRelationship(relationship) {
    // Try to get the correct schema name - relationship data might have different property names
    const schemaName = relationship.schemaName || relationship.logicalName || relationship.name;
    
    if (!schemaName) {
      const errorMsg = `Cannot delete relationship - no schema name found in: ${JSON.stringify(relationship)}`;
      this._err(errorMsg);
      throw new Error(errorMsg);
    }
    
    console.log(`   🔍 Processing relationship: ${schemaName}`);
    this._log(`   🔍 Processing relationship: ${schemaName}`);
    console.log(`      From: ${relationship.fromEntity || 'Unknown'} → To: ${relationship.toEntity || 'Unknown'}`);
    this._log(`      From: ${relationship.fromEntity || 'Unknown'} → To: ${relationship.toEntity || 'Unknown'}`);
    
    // For rollback relationships, we need to construct the actual Dataverse schema name
    // The schema name pattern for custom relationships is: prefix_referencedEntity_referencingEntity
    let actualSchemaName = schemaName;
    
    // If this looks like a display name (contains spaces or no underscores), construct the schema name
    if ((schemaName.includes(' ') || !schemaName.includes('_')) && relationship.fromEntity && relationship.toEntity && relationship.publisherPrefix) {
      console.log(`   🔎 Display name detected: "${schemaName}", constructing actual schema name...`);
      this._log(`   🔎 Display name detected: "${schemaName}", constructing actual schema name...`);
      
      const prefix = relationship.publisherPrefix;
      const fromEntity = relationship.fromEntity.toLowerCase();
      const toEntity = relationship.toEntity.toLowerCase();
      
      // The schema name is typically: prefix_referencedEntity_referencingEntity
      // Try both entity orderings
      const schemaOption1 = `${prefix}_${fromEntity}_${toEntity}`;
      const schemaOption2 = `${prefix}_${toEntity}_${fromEntity}`;
      
      console.log(`   📋 Possible schema names: ${schemaOption1} or ${schemaOption2}`);
      this._log(`   📋 Possible schema names: ${schemaOption1} or ${schemaOption2}`);
      
      // Use the first option as default (we'll try both if needed)
      actualSchemaName = schemaOption1;
      this._log(`   🎯 Using schema name: ${actualSchemaName}`);
    }
    
    this._log(`   🗑️ Executing DELETE for relationship: ${actualSchemaName}`);
    const deleteQuery = `RelationshipDefinitions(SchemaName='${actualSchemaName}')`;
    this._log(`   📞 API call: DELETE ${deleteQuery}`);
    
    try {
      await this._delete(deleteQuery);
      this._log(`   ✅ Successfully deleted relationship: ${actualSchemaName}`);
    } catch (error) {
      // If first option failed and we have both entities, try the reverse
      if (relationship.fromEntity && relationship.toEntity && relationship.publisherPrefix && schemaName.includes(' ')) {
        const prefix = relationship.publisherPrefix;
        const fromEntity = relationship.fromEntity.toLowerCase();
        const toEntity = relationship.toEntity.toLowerCase();
        const schemaOption2 = `${prefix}_${toEntity}_${fromEntity}`;
        
        if (actualSchemaName !== schemaOption2) {
          this._log(`   🔄 First attempt failed, trying reverse order: ${schemaOption2}`);
          const deleteQuery2 = `RelationshipDefinitions(SchemaName='${schemaOption2}')`;
          
          try {
            await this._delete(deleteQuery2);
            this._log(`   ✅ Successfully deleted relationship: ${schemaOption2}`);
            return; // Success with second attempt
          } catch (error2) {
            // Both attempts failed
            this._err(`   ❌ Failed to delete relationship with both schema names`);
            this._err(`   Tried: ${actualSchemaName} and ${schemaOption2}`);
            throw new Error(`Could not delete relationship: ${error2.message}`);
          }
        }
      }
      
      this._err(`   ❌ Failed to delete relationship ${actualSchemaName}: ${error.message}`);
      throw error;
    }
  }
  
  async _deleteEntity(entity) {
    const logicalName = entity.LogicalName || entity.logicalName || entity.name;
    
    if (!logicalName) {
      const errorMsg = `Cannot delete entity - no logical name found in: ${JSON.stringify(entity)}`;
      this._err(errorMsg);
      throw new Error(errorMsg);
    }
    
    this._log(`   🏢 Processing entity deletion: ${logicalName}`);
    this._log(`      Display Name: ${entity.DisplayName?.UserLocalizedLabel?.Label || 'Unknown'}`);
    this._log(`      Entity Type: ${entity.OwnershipType || 'Unknown'}`);
    
    const deleteQuery = `EntityDefinitions(LogicalName='${logicalName}')`;
    this._log(`   📞 API call: DELETE ${deleteQuery}`);
    this._log(`   ⏱️ Using extended timeout (5 minutes) for entity deletion`);
    
    try {
      // Entity deletions can take a long time - use 5 minute timeout
      await this._delete(deleteQuery, { timeout: 300000 });
      this._log(`   ✅ Successfully deleted entity: ${logicalName}`);
    } catch (error) {
      // Check if it's a timeout error - the deletion might have actually succeeded
      if (error.message && error.message.includes('timeout')) {
        this._log(`   ⏱️ Timeout occurred, verifying if entity was actually deleted...`);
        
        // Wait a bit for Dataverse to complete the operation
        await this.sleep(5000);
        
        // Check if entity still exists
        try {
          const verifyQuery = `/EntityDefinitions?$filter=LogicalName eq '${logicalName}'`;
          const verifyResponse = await this._get(verifyQuery);
          
          if (!verifyResponse.value || verifyResponse.value.length === 0) {
            this._log(`   ✅ Entity ${logicalName} was successfully deleted (verified after timeout)`);
            return; // Entity was deleted, continue normally
          } else {
            this._err(`   ❌ Entity ${logicalName} still exists after timeout - deletion failed`);
            throw error;
          }
        } catch (verifyError) {
          // If verification fails, assume deletion succeeded
          this._log(`   ⚠️ Could not verify entity deletion status, assuming success: ${verifyError.message}`);
          return;
        }
      }
      
      this._err(`   ❌ Failed to delete entity ${logicalName}: ${error.message}`);
      throw error;
    }
  }
  
  _isOurCustomRelationship(schemaName) {
    // Skip system relationships that are automatically created
    const systemRelationshipPatterns = [
      '_Annotations',
      '_SyncErrors',
      '_AsyncOperations',
      '_MailboxTrackingFolders',
      '_UserEntityInstanceDatas',
      '_ProcessSession',
      '_BulkDeleteFailures',
      '_PrincipalObjectAttributeAccesses',
      '_FileAttachments',
      'lk_',
      'user_',
      'team_',
      'owner_',
      'business_unit_',
      'TransactionCurrency_'
    ];
    
    // If it matches any system pattern, it's not our custom relationship
    for (const pattern of systemRelationshipPatterns) {
      if (schemaName.includes(pattern)) {
        return false;
      }
    }
    
    return true;
  }
  
  _isCDMEntity(entity) {
    const cdmEntities = ['account', 'contact', 'lead', 'opportunity', 'systemuser', 'team', 'businessunit'];
    return cdmEntities.includes(entity.LogicalName.toLowerCase());
  }
  
  _looksLikeTestEntity(entity) {
    // Check if the entity name starts with a random-looking prefix
    const name = entity.LogicalName.toLowerCase();
    
    // Skip known system entities
    if (this._isCDMEntity(entity)) return false;
    
    // Look for patterns like: randomprefix_entityname
    const parts = name.split('_');
    if (parts.length >= 2) {
      const prefix = parts[0];
      // Random prefixes are typically 8 characters, alphanumeric
      if (prefix.length >= 6 && prefix.length <= 10 && /^[a-z0-9]+$/.test(prefix)) {
        return true;
      }
    }
    
    return false;
  }
  
  _extractPrefix(logicalName) {
    const parts = logicalName.split('_');
    return parts.length > 1 ? parts[0] : '';
  }

  // === ROLLBACK METHODS ===
  
  /**
   * Delete a solution by ID
   * @param {string} solutionId - Solution ID to delete
   */
  async deleteSolution(solutionId) {
    await this._ensureToken();
    
    try {
      this._log(`🗑️ Deleting solution: ${solutionId}`);
      const response = await this._delete(`/solutions(${solutionId})`);
      this._log(`✅ Solution deleted successfully: ${solutionId}`);
      return response;
    } catch (error) {
      this._err(`❌ Failed to delete solution ${solutionId}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Delete a publisher by ID or prefix
   * @param {string} publisherIdOrPrefix - Publisher ID (GUID) or prefix to delete
   */
  async deletePublisher(publisherIdOrPrefix) {
    await this._ensureToken();
    
    try {
      this._log(`🗑️ Deleting publisher: ${publisherIdOrPrefix}`);
      
      // Check if it's a GUID or a prefix
      const isGuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(publisherIdOrPrefix);
      
      let publisherId;
      if (isGuid) {
        publisherId = publisherIdOrPrefix;
      } else {
        // Look up publisher by prefix
        const query = `/publishers?$filter=customizationprefix eq '${publisherIdOrPrefix}'&$select=publisherid,friendlyname`;
        const response = await this._get(query);
        
        if (!response.value || response.value.length === 0) {
          throw new Error(`Publisher with prefix '${publisherIdOrPrefix}' not found`);
        }
        
        publisherId = response.value[0].publisherid;
        this._log(`   Found publisher ID: ${publisherId}`);
      }
      
      const deleteResponse = await this._delete(`/publishers(${publisherId})`);
      this._log(`✅ Publisher deleted successfully: ${publisherIdOrPrefix}`);
      return deleteResponse;
    } catch (error) {
      this._err(`❌ Failed to delete publisher ${publisherIdOrPrefix}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Delete a global choice set by logical name or display name
   * @param {string} choiceNameOrDisplay - Global choice logical name or display name
   */
  async deleteGlobalChoice(choiceNameOrDisplay) {
    await this._ensureToken();
    
    try {
      this._log(`🗑️ Deleting global choice: ${choiceNameOrDisplay}`);
      
      // Get all global choice sets (API doesn't support $filter on GlobalOptionSetDefinitions)
      const choiceQuery = `/GlobalOptionSetDefinitions`;
      const choiceResponse = await this._get(choiceQuery);
      
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
      
      const response = await this._delete(`/GlobalOptionSetDefinitions(${choice.MetadataId})`);
      this._log(`✅ Global choice deleted successfully: ${choice.Name}`);
      return response;
    } catch (error) {
      this._err(`❌ Failed to delete global choice ${choiceNameOrDisplay}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Execute a complete rollback of a deployment
   * @param {Object} deploymentData - Deployment data with component information
   * @param {Function} progressCallback - Progress update callback
   * @param {Object} config - Rollback configuration (granular options)
   * @returns {Promise<Object>} Rollback results
   */
  async rollbackDeployment(deploymentData, progressCallback = null, config = null) {
    const progress = progressCallback || (() => {});
    
    // Default config: rollback everything
    const rollbackConfig = config || {
      relationships: true,
      customEntities: true,
      cdmEntities: true,
      customGlobalChoices: true,
      addedGlobalChoices: true,
      solution: true,
      publisher: true
    };
    
    console.log('🎯 ROLLBACK CONFIG:', JSON.stringify(rollbackConfig));
    this._log(`🎯 ROLLBACK CONFIG: ${JSON.stringify(rollbackConfig)}`);
    
    const results = {
      relationshipsDeleted: 0,
      entitiesDeleted: 0,
      globalChoicesDeleted: 0,
      solutionDeleted: false,
      publisherDeleted: false,
      errors: [],
      warnings: [],
      stepDetails: []
    };

    try {
      await this._ensureToken();
      
      progress('starting', 'Starting deployment rollback...');
      this._log('🚀 ROLLBACK STARTED - Analyzing deployment data...');
      
      // Log what we're about to delete
      this._log(`📋 ROLLBACK PLAN:`);
      this._log(`   Solution: ${deploymentData.solutionInfo?.solutionName || 'N/A'} (ID: ${deploymentData.solutionInfo?.solutionId || 'N/A'})`);
      this._log(`   Publisher: ${deploymentData.solutionInfo?.publisherName || 'N/A'}`);
      
      if (deploymentData.rollbackData?.relationships) {
        this._log(`   Relationships to delete: ${deploymentData.rollbackData.relationships.length}`);
        deploymentData.rollbackData.relationships.forEach((rel, i) => {
          this._log(`     ${i+1}. ${rel.name || rel.displayName} (${rel.fromEntity} → ${rel.toEntity})`);
        });
      }
      
      if (deploymentData.rollbackData?.customEntities) {
        this._log(`   Custom entities to delete: ${deploymentData.rollbackData.customEntities.length}`);
        deploymentData.rollbackData.customEntities.forEach((ent, i) => {
          this._log(`     ${i+1}. ${ent.name || ent.logicalName} (${ent.displayName || 'No display name'})`);
        });
      }
      
      if (deploymentData.summary?.cdmEntityNames) {
        this._log(`   CDM entities to remove from solution: ${deploymentData.summary.cdmEntityNames.length}`);
        deploymentData.summary.cdmEntityNames.forEach((ent, i) => {
          this._log(`     ${i+1}. ${ent}`);
        });
      }
      
      // Step 1: Detect and delete relationships first (CRITICAL - must be first to avoid dependency issues)
      let relationshipsToDelete = [];
      
      // Check rollbackData for relationships
      if (deploymentData.rollbackData?.relationships) {
        relationshipsToDelete = [...deploymentData.rollbackData.relationships];
      }
      
      // Also check summary for any additional relationships
      if (deploymentData.summary?.relationshipsCreated) {
        relationshipsToDelete = [...relationshipsToDelete, ...deploymentData.summary.relationshipsCreated];
      }
      
      // Remove duplicates based on name/schema
      relationshipsToDelete = relationshipsToDelete.filter((rel, index, arr) => {
        const relName = rel.name || rel.schemaName || rel.logicalName;
        return arr.findIndex(r => (r.name || r.schemaName || r.logicalName) === relName) === index;
      });
      
      // STEP 1: Delete relationships first (CRITICAL - must succeed before entities can be deleted)
      if (rollbackConfig.relationships && relationshipsToDelete.length > 0) {
        progress('relationships', 'Deleting relationships...');
        this._log(`🔗 STEP 1: Deleting ${relationshipsToDelete.length} relationships...`);
        
        // Add publisher prefix to relationships for schema name construction
        const publisherPrefix = deploymentData.solutionInfo?.publisherPrefix;
        
        for (const [index, relationship] of relationshipsToDelete.entries()) {
          const relName = relationship.name || relationship.schemaName || relationship.displayName || 'Unknown';
          try {
            this._log(`🔗 Deleting relationship ${index + 1}/${relationshipsToDelete.length}: ${relName}`);
            results.stepDetails.push(`Starting deletion of relationship: ${relName}`);
            
            // Add publisher prefix if not already present
            if (publisherPrefix && !relationship.publisherPrefix) {
              relationship.publisherPrefix = publisherPrefix;
            }
            
            await this._deleteRelationship(relationship);
            results.relationshipsDeleted++;
            
            const successMsg = `✅ Deleted relationship: ${relName}`;
            this._log(successMsg);
            results.stepDetails.push(successMsg);
          } catch (error) {
            // Check if relationship not found (already deleted) vs actual error
            const isNotFound = error.message && (
              error.message.includes('Could not find') || 
              error.message.includes('not found') ||
              error.message.includes('does not exist')
            );
            
            if (isNotFound) {
              // Treat as warning - relationship already deleted
              const warningMsg = `⚠️ Relationship ${relName} not found, may have already been deleted`;
              this._warn(warningMsg);
              results.warnings.push(warningMsg);
              results.stepDetails.push(warningMsg);
            } else {
              // Real error - HARD STOP
              const errorMsg = `❌ CRITICAL: Failed to delete relationship ${relName}: ${error.message}`;
              this._err(errorMsg);
              results.errors.push(errorMsg);
              
              throw new Error(`Rollback stopped: Cannot delete relationship '${relName}'. This must succeed before entities can be deleted. Error: ${error.message}`);
            }
          }
        }
      } else {
        if (!rollbackConfig.relationships) {
          this._log('🔗 STEP 1: Skipping relationships (not selected in config)');
        } else {
          this._log('🔗 STEP 1: No relationships detected for deletion');
        }
      }

      // Step 2: Delete CUSTOM entities (tables) completely
      let customEntitiesToDelete = [];
      
      if (deploymentData.rollbackData?.customEntities) {
        customEntitiesToDelete = [...deploymentData.rollbackData.customEntities];
      }
      
      if (rollbackConfig.customEntities && customEntitiesToDelete.length > 0) {
        progress('custom-entities', 'Deleting custom entities...');
        this._log(`🏢 STEP 2: Deleting ${customEntitiesToDelete.length} custom entities...`);
        
        const publisherPrefix = deploymentData.solutionInfo?.publisherPrefix;
        this._log(`   📋 Publisher prefix: ${publisherPrefix || 'NOT FOUND'}`);
        
        for (const [index, entity] of customEntitiesToDelete.entries()) {
          let entityName = entity.logicalName || entity.name || entity.displayName || 'Unknown';
          this._log(`   📌 Original entity name from rollback data: ${entityName}`);
          
          // Always construct the proper logical name with prefix for custom entities
          if (publisherPrefix) {
            // If the name already has an underscore, assume it's already a logical name
            if (entityName.includes('_')) {
              this._log(`   ✅ Entity name already has prefix: ${entityName}`);
            } else {
              // Convert display name to logical name with prefix (lowercase)
              const logicalNamePart = entityName.toLowerCase();
              entityName = `${publisherPrefix}_${logicalNamePart}`;
              this._log(`   🔧 Constructed logical name with prefix: ${entityName}`);
            }
          } else {
            this._warn(`   ⚠️ No publisher prefix found, using entity name as-is: ${entityName}`);
          }
          
          try {
            this._log(`🗑️ Deleting custom entity ${index + 1}/${customEntitiesToDelete.length}: ${entityName}`);
            results.stepDetails.push(`Starting deletion of custom entity: ${entityName}`);
            
            // Get entity metadata first to ensure it exists
            this._log(`   🔍 Looking up metadata for entity: ${entityName}`);
            const entityQuery = `/EntityDefinitions?$filter=LogicalName eq '${entityName}'`;
            const entityResponse = await this._get(entityQuery);
            
            if (entityResponse.value && entityResponse.value.length > 0) {
              this._log(`   ✅ Found entity metadata, proceeding with deletion...`);
              await this._deleteEntity(entityResponse.value[0]);
              results.entitiesDeleted++;
              
              const successMsg = `✅ Deleted custom entity: ${entityName}`;
              this._log(successMsg);
              results.stepDetails.push(successMsg);
            } else {
              const warningMsg = `⚠️ Custom entity ${entityName} not found, may have already been deleted`;
              this._log(warningMsg);
              results.warnings.push(warningMsg);
              results.stepDetails.push(warningMsg);
            }
          } catch (error) {
            const errorMsg = `❌ CRITICAL: Failed to delete custom entity ${entityName}: ${error.message}`;
            this._err(errorMsg);
            results.errors.push(errorMsg);
            
            // HARD STOP: If custom entities can't be deleted, the rollback is incomplete
            throw new Error(`Rollback stopped: Cannot delete entity '${entityName}'. Error: ${error.message}`);
          }
        }
      } else {
        if (!rollbackConfig.customEntities) {
          this._log('🏢 STEP 2: Skipping custom entities (not selected in config)');
        } else {
          this._log('🏢 STEP 2: No custom entities to delete');
        }
      }
      
      // Step 3: Remove CDM entities from solution (DO NOT delete them - they're standard tables)
      // NOTE: This feature is currently disabled because the Dataverse Web API does not support
      // the RemoveSolutionComponent action. CDM entities can only be removed from solutions manually.
      if (rollbackConfig.cdmEntities) {
        this._log('🏢 STEP 3: CDM entity removal from solution is not supported via Web API');
        this._log('   ℹ️  To remove CDM entities: Open solution in Power Platform → Select entity → Remove');
        results.warnings.push('CDM entity removal from solution requires manual action in Power Platform UI');
      } else {
        this._log('🏢 STEP 3: Skipping CDM entities (not selected in config)');
      }

      // Step 4: Handle global choices - delete CUSTOM ones only
      let customGlobalChoicesToDelete = [];
      
      // Detect custom global choices that were created (need to be deleted)
      if (deploymentData.summary?.globalChoicesCreated) {
        customGlobalChoicesToDelete = [...deploymentData.summary.globalChoicesCreated];
      }
      
      // Delete custom global choices completely
      if (rollbackConfig.customGlobalChoices && customGlobalChoicesToDelete.length > 0) {
        progress('custom-choices', 'Deleting custom global choices...');
        this._log(`🎯 STEP 4a: Deleting ${customGlobalChoicesToDelete.length} custom global choices...`);
        
        const publisherPrefix = deploymentData.solutionInfo?.publisherPrefix;
        this._log(`   📋 Publisher prefix for choices: ${publisherPrefix || 'NOT FOUND'}`);
        
        // Get all global choices once to search by display name
        let allGlobalChoices = [];
        try {
          const choicesResponse = await this._get(`/GlobalOptionSetDefinitions`);
          if (choicesResponse.value) {
            allGlobalChoices = choicesResponse.value;
            this._log(`   📋 Retrieved ${allGlobalChoices.length} total global choices for lookup`);
          }
        } catch (error) {
          this._warn(`   ⚠️ Could not retrieve global choices list: ${error.message}`);
        }
        
        for (const [index, choiceName] of customGlobalChoicesToDelete.entries()) {
          try {
            this._log(`🗑️ Deleting custom global choice ${index + 1}/${customGlobalChoicesToDelete.length}: ${choiceName}`);
            results.stepDetails.push(`Starting deletion of custom global choice: ${choiceName}`);
            
            // Search for the choice by display name to get the actual logical name
            // CRITICAL: Only look at choices with the correct publisher prefix!
            let logicalChoiceName = choiceName;
            if (allGlobalChoices.length > 0 && publisherPrefix) {
              // STEP 1: Filter to ONLY choices with our publisher prefix
              const prefixedChoices = allGlobalChoices.filter(c => 
                c.Name?.startsWith(publisherPrefix + '_')
              );
              this._log(`   🔍 Filtered to ${prefixedChoices.length} choices with prefix "${publisherPrefix}" (out of ${allGlobalChoices.length} total)`);
              
              // STEP 2: Search within prefixed choices by display name
              const matchingChoice = prefixedChoices.find(c => 
                c.DisplayName?.UserLocalizedLabel?.Label === choiceName
              );
              
              if (matchingChoice) {
                logicalChoiceName = matchingChoice.Name;
                this._log(`   ✅ Found global choice by display name: "${choiceName}" -> "${logicalChoiceName}"`);
              } else {
                // STEP 3: Fallback - try to match by partial name within prefixed choices
                this._log(`   🔍 No exact match, trying partial match for "${choiceName}"...`);
                const partialMatch = prefixedChoices.find(c => {
                  const displayLabel = c.DisplayName?.UserLocalizedLabel?.Label;
                  return displayLabel && displayLabel.toLowerCase().includes(choiceName.toLowerCase().split(' ')[0]);
                });
                
                if (partialMatch) {
                  logicalChoiceName = partialMatch.Name;
                  this._log(`   ✅ Found global choice by partial match: "${choiceName}" -> "${logicalChoiceName}"`);
                } else {
                  this._warn(`   ⚠️ Could not find global choice "${choiceName}" with prefix "${publisherPrefix}"`);
                }
              }
            } else if (!publisherPrefix) {
              this._warn(`   ⚠️ No publisher prefix available, cannot safely identify global choice`);
            }
            
            await this.deleteGlobalChoice(logicalChoiceName);
            results.globalChoicesDeleted++;
            
            const successMsg = `✅ Deleted custom global choice: ${choiceName} (${logicalChoiceName})`;
            this._log(successMsg);
            results.stepDetails.push(successMsg);
            
          } catch (error) {
            const errorMsg = `❌ Failed to delete custom global choice ${choiceName}: ${error.message}`;
            this._warn(errorMsg);
            results.errors.push(errorMsg);
            results.stepDetails.push(errorMsg);
          }
        }
      } else {
        if (!rollbackConfig.customGlobalChoices) {
          this._log('🎯 STEP 4a: Skipping custom global choices (not selected in config)');
        } else {
          this._log('🎯 STEP 4a: No custom global choices to delete');
        }
      }
      
      // Step 5: Delete solution (must be before publisher deletion)
      if (rollbackConfig.solution && deploymentData.solutionInfo?.solutionId) {
        progress('solution', 'Deleting solution...');
        this._log('📦 STEP 5: Deleting solution...');
        
        try {
          const solutionName = deploymentData.solutionInfo.solutionName || 'Unknown';
          const solutionId = deploymentData.solutionInfo.solutionId;
          
          this._log(`🗑️ Deleting solution: ${solutionName} (ID: ${solutionId})`);
          results.stepDetails.push(`Starting deletion of solution: ${solutionName}`);
          
          await this.deleteSolution(solutionId);
          results.solutionDeleted = true;
          
          const successMsg = `✅ Deleted solution: ${solutionName}`;
          this._log(successMsg);
          results.stepDetails.push(successMsg);
          
        } catch (error) {
          const errorMsg = `❌ CRITICAL: Failed to delete solution ${deploymentData.solutionInfo.solutionName}: ${error.message}`;
          this._err(errorMsg);
          results.errors.push(errorMsg);
          
          // HARD STOP: If solution can't be deleted, publisher deletion will likely fail
          throw new Error(`Rollback stopped: Cannot delete solution '${deploymentData.solutionInfo.solutionName}'. Error: ${error.message}`);
        }
      } else {
        if (!rollbackConfig.solution) {
          this._log('📦 STEP 5: Skipping solution (not selected in config)');
        } else {
          this._log('📦 STEP 5: No solution to delete');
        }
      }

      // Step 6: Delete publisher (FINAL STEP - must be after solution is deleted)
      if (rollbackConfig.publisher && (deploymentData.solutionInfo?.publisherPrefix || deploymentData.solutionInfo?.publisherId)) {
        progress('publisher', 'Deleting publisher...');
        this._log('🏢 STEP 6: Deleting publisher (FINAL STEP)...');
        
        try {
          const publisherIdentifier = deploymentData.solutionInfo.publisherId || deploymentData.solutionInfo.publisherPrefix;
          const publisherName = deploymentData.solutionInfo.publisherName || 'Unknown';
          
          this._log(`🗑️ Deleting publisher: ${publisherName} (${publisherIdentifier})`);
          results.stepDetails.push(`Starting deletion of publisher: ${publisherName}`);
          
          await this.deletePublisher(publisherIdentifier);
          results.publisherDeleted = true;
          
          const successMsg = `✅ Deleted publisher: ${publisherName}`;
          this._log(successMsg);
          results.stepDetails.push(successMsg);
          
        } catch (error) {
          // Publisher deletion is non-critical - log as warning
          const warningMsg = `⚠️ Failed to delete publisher: ${error.message} (This is non-critical)`;
          this._warn(warningMsg);
          results.warnings.push(warningMsg);
          results.stepDetails.push(warningMsg);
        }
      } else {
        if (!rollbackConfig.publisher) {
          this._log('🏢 STEP 6: Skipping publisher (not selected in config)');
        } else {
          this._log('🏢 STEP 6: No publisher to delete');
        }
      }

      progress('completed', 'Rollback completed');
      
      // Build a descriptive summary based on what was actually done
      let summaryParts = [];
      if (results.relationshipsDeleted > 0) summaryParts.push(`${results.relationshipsDeleted} relationship(s) deleted`);
      if (results.entitiesDeleted > 0) summaryParts.push(`${results.entitiesDeleted} entity/entities deleted`);
      if (results.globalChoicesDeleted > 0) summaryParts.push(`${results.globalChoicesDeleted} global choice(s) deleted`);
      if (results.solutionDeleted) summaryParts.push('solution deleted');
      if (results.publisherDeleted) summaryParts.push('publisher deleted');
      
      let summaryText = summaryParts.length > 0 ? summaryParts.join(', ') : 'no components removed';
      
      // Add warnings/limitations note if present
      if (results.warnings.length > 0) {
        const webApiLimitations = results.warnings.filter(w => 
          w.includes('not supported') || 
          w.includes('manual removal required') || 
          w.includes('Web API')
        ).length;
        
        if (webApiLimitations > 0) {
          summaryText += ` (${webApiLimitations} operation(s) require manual completion - see warnings)`;
        } else if (results.warnings.length > 0) {
          summaryText += ` (${results.warnings.length} warning(s))`;
        }
      }
      
      results.summary = `Rollback completed: ${summaryText}`;
      
      this._log('🏁 ROLLBACK COMPLETED!');
      this._log(`   📊 Summary: ${results.summary}`);
      this._log(`   ❌ Errors: ${results.errors.length}`);
      this._log(`   ⚠️ Warnings: ${results.warnings.length}`);
      
      if (results.errors.length > 0) {
        this._log('🔴 ERRORS ENCOUNTERED:');
        results.errors.forEach((error, i) => this._log(`   ${i + 1}. ${error}`));
      }
      
      if (results.warnings.length > 0) {
        this._log('🟡 WARNINGS:');
        results.warnings.forEach((warning, i) => this._log(`   ${i + 1}. ${warning}`));
      }
      
    } catch (error) {
      this._err(`💥 ROLLBACK FATAL ERROR: ${error.message}`);
      this._err(`Stack trace: ${error.stack}`);
      results.errors.push(`Fatal error: ${error.message}`);
      results.stepDetails.push(`FATAL ERROR: ${error.message}`);
      throw error;
    }
    
    return results;
  }
}

module.exports = { DataverseClient };
