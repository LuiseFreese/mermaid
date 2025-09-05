/**
 * Minimal server focused on CDM integration flow.
 * - /wizard serves the static UI (wizard-ui.html)
 * - /api/validate-erd uses MermaidERDParser to parse entities
 * - /upload executes CDM integration (adds existing Dataverse entities to a solution)
 */

const http = require('http');
const url  = require('url');
const fs   = require('fs');
const path = require('path');
require('dotenv').config();

// --- tiny rotating log buffer for streaming back to client -------------
const recentLogs = [];
const MAX_RECENT = 200;
const originalLog = console.log;
const originalErr = console.error;
function pushLog(prefix, args) {
  const msg = args.map(a => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ');
  recentLogs.push(`[${new Date().toISOString()}] ${prefix} ${msg}`);
  if (recentLogs.length > MAX_RECENT) recentLogs.shift();
}
console.log = (...args) => { pushLog('[INFO]', args); originalLog(...args); };
console.error = (...args) => { pushLog('[ERR ]', args); originalErr(...args); };
console.getLastLogs = () => [...recentLogs];

// --- load modules -------------------------------------------------------
let MermaidERDParser = null;
let DataverseClient  = null;
try {
  const { MermaidERDParser: Parser } = require('./mermaid-parser.js');
  const { DataverseClient: Client }  = require('./dataverse-client.js');
  MermaidERDParser = Parser;
  DataverseClient  = Client;
  console.log('MermaidERDParser and DataverseClient loaded');
} catch (e) {
  console.error('❌ Failed to load core modules:', e.message);
}

// optional KeyVault helper (if available in your project)
let keyVaultConfig = null;
try {
  keyVaultConfig = require('./azure-keyvault.js'); // optional
  console.log('Azure SDK + Key Vault config loaded');
} catch {
  console.log('Azure SDK not configured; falling back to env');
}

// --- helpers ------------------------------------------------------------
function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', ch => body += ch);
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

function streamLogs(res) {
  const logs = console.getLastLogs().map(l => JSON.stringify({ type: 'log', message: l }) + '\n');
  for (const line of logs) res.write(line);
}

function writeProgress(res, step, message, details = {}) {
  const progressData = {
    type: 'progress',
    step: step,
    message: message,
    timestamp: new Date().toISOString(),
    ...details
  };
  res.write(JSON.stringify(progressData) + '\n');
  console.log(`📋 ${step}: ${message}`);
}

function writeFinal(res, obj) {
  res.write(JSON.stringify({ type: 'result', ...obj }) + '\n');
  res.end();
}
function serveWizard(res) {
  const p = path.join(__dirname, 'wizard-ui.html');
  if (!fs.existsSync(p)) {
    res.writeHead(404, {'Content-Type':'text/html'});
    return res.end('<h1>Wizard UI not found</h1>');
  }
  res.writeHead(200, {'Content-Type':'text/html'});
  res.end(fs.readFileSync(p, 'utf8'));
}

async function getDataverseConfig() {
  // Prefer Key Vault when available
  if (keyVaultConfig && process.env.KEY_VAULT_URI) {
    try {
      console.log('Getting Dataverse configuration from Key Vault...');
      const cfg = await keyVaultConfig.getDataverseConfig();
      if (cfg?.serverUrl && cfg?.tenantId && cfg?.clientId && cfg?.clientSecret) {
        return { source: 'key_vault', ...cfg };
      }
      console.warn('Key Vault returned incomplete config, falling back to env');
    } catch (e) {
      console.warn('Key Vault config failed, falling back to env:', e.message);
    }
  }
  // Fallback: environment variables
  const env = {
    serverUrl:  process.env.DATAVERSE_URL || process.env.DATAVERSE_SERVER_URL,
    tenantId:   process.env.TENANT_ID || process.env.DATAVERSE_TENANT_ID,
    clientId:   process.env.CLIENT_ID || process.env.DATAVERSE_CLIENT_ID,
    clientSecret: process.env.CLIENT_SECRET || process.env.DATAVERSE_CLIENT_SECRET
  };
  console.log('Local fallback config:', {
    hasServerUrl: !!env.serverUrl,
    hasTenantId: !!env.tenantId,
    hasClientId: !!env.clientId,
    hasClientSecret: !!env.clientSecret
  });
  return { source:'env', ...env };
}

// --- API handlers -------------------------------------------------------
async function handleValidateErd(req, res) {
  let body = '';
  req.on('data', ch => body += ch);
  req.on('end', () => {
    try {
      const data = JSON.parse(body || '{}');
      if (!MermaidERDParser) throw new Error('MermaidERDParser not available');
      const parser = new MermaidERDParser();
      const result = parser.parse(data.mermaidContent || '');
      
      // Generate corrected ERD if there are warnings
      let correctedERD = null;
      if (result.warnings && result.warnings.length > 0) {
        try {
          correctedERD = parser.generateCorrectedERD();
          console.log('✅ Generated corrected ERD:', correctedERD ? 'Success' : 'Failed');
        } catch (e) {
          console.warn('⚠️ Could not generate corrected ERD:', e.message);
        }
      }
      
      const response = {
        success: true, // Request succeeded, validation details are in the validation field
        entities: result.entities || [],
        relationships: result.relationships || [],
        warnings: result.warnings || [],
        validation: result.validation || { isValid:false },
        cdmDetection: result.cdmDetection || {},
        correctedERD: correctedERD,
        summary: {
          entityCount: result.entities?.length || 0,
          relationshipCount: result.relationships?.length || 0
        }
      };
      
      console.log('🔍 Validation response:', JSON.stringify(response, null, 2));  // Debug log
      
      res.writeHead(200, {'Content-Type':'application/json'});
      res.end(JSON.stringify(response));
    } catch (e) {
      console.error('❌ Validation error:', e);
      const errorResponse = { success:false, error: e.message };
      res.writeHead(500, {'Content-Type':'application/json'});
      res.end(JSON.stringify(errorResponse));
    }
  });
}

async function handleUpload(req, res) {
  let body = '';
  req.on('data', ch => body += ch);
  req.on('end', async () => {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Transfer-Encoding': 'chunked' });
    try {
      const data = JSON.parse(body || '{}');
      console.log('POST /upload payload keys:', Object.keys(data));

 // Parse ERD if provided
      let erdEntities = [];
      let erdRelationships = []; // Add this line to store relationships

      if (data.mermaidContent && MermaidERDParser) {
        const parser = new MermaidERDParser();
        const pr = parser.parse(data.mermaidContent);
        erdEntities = pr.entities || [];
        erdRelationships = pr.relationships || []; // Extract relationships
        console.log(`Parsed ERD: ${erdEntities.length} entities, ${erdRelationships.length} relationships`);
      } else if (Array.isArray(data.entities)) {
        erdEntities = data.entities;
        // If client provided relationships directly
        erdRelationships = Array.isArray(data.relationships) ? data.relationships : [];
      }

      // Dataverse client
      const cfg = await getDataverseConfig();
      const client = new DataverseClient({
        dataverseUrl: cfg.serverUrl,
        tenantId:     cfg.tenantId,
        clientId:     cfg.clientId,
        clientSecret: cfg.clientSecret
      });

      const solutionUnique = (data.solutionName || 'MermaidSolution').trim();
      const friendly       = (data.solutionDisplayName || solutionUnique).trim();
  let publisherName    = data.publisherName || 'Mermaid Publisher';
  let publisherPrefix  = (typeof data.publisherPrefix === 'string' && data.publisherPrefix.length > 0) ? data.publisherPrefix : undefined;

      // If a publisher was selected (data.publisher), get its details
      if (data.publisher && typeof data.publisher === 'string') {
        try {
          console.log(`🔍 Looking up selected publisher: ${data.publisher}`);
          const publishers = await client.getPublishers();
          const selectedPublisher = publishers.find(p => 
            p.uniqueName === data.publisher || 
            p.id === data.publisher
          );
          
          if (selectedPublisher) {
            publisherPrefix = selectedPublisher.prefix;
            publisherName = selectedPublisher.friendlyName;
            console.log(`✅ Using selected publisher: ${publisherName} (prefix: ${publisherPrefix})`);
          } else {
            console.warn(`⚠️ Selected publisher '${data.publisher}' not found, using default prefix`);
          }
        } catch (error) {
          console.warn(`⚠️ Failed to lookup publisher '${data.publisher}':`, error.message);
        }
      }

      const cdmChoice = data.cdmChoice;
      let cdmMatches = Array.isArray(data.cdmMatches) ? data.cdmMatches : [];

      // Determine which entities are CDM vs custom (initial calculation)
      let cdmEntityNames = cdmMatches.map(m => m?.originalEntity?.name || m?.entity || '').filter(n => n);
      let customEntities = erdEntities.filter(entity => !cdmEntityNames.includes(entity.name));
      const hasCDMEntities = cdmMatches.length > 0;
      let hasCustomEntities = customEntities.length > 0;

      console.log(`📊 Deployment Analysis: ${cdmMatches.length} CDM entities, ${customEntities.length} custom entities`);

      let results = {
        success: true,
        cdmResults: null,
        customResults: null,
        summary: '',
        message: 'Deployment completed successfully',
        entitiesCreated: 0,
        relationshipsCreated: 0,
        cdmEntitiesIntegrated: [],
        error: null
      };

      // Ensure solution exists
      let solInfo;
      try {
        // First, ensure publisher exists
        writeProgress(res, 'publisher', 'Creating (or reusing) Publisher...');
        const pub = await client.ensurePublisher({
          uniqueName: (publisherName || 'MermaidPublisher').replace(/\s+/g, ''),
          friendlyName: publisherName || 'Mermaid Publisher',
          prefix: publisherPrefix || 'mmd'
        });
        
        // Then create/ensure solution with the publisher
        writeProgress(res, 'solution', 'Creating Solution...');
        solInfo = await client.ensureSolution(solutionUnique, friendly, pub);
        console.log(`Solution ready: ${solInfo.uniquename} (${solInfo.solutionid})`);
      console.log(`DEBUG: solInfo object:`, JSON.stringify(solInfo, null, 2));
      } catch (e) {
        console.warn('ensureSolution warning:', e.message);
        const check = await client.checkSolutionExists(solutionUnique);
        if (!check || !check.solutionid) {
          streamLogs(res);
          return writeFinal(res, { success:false, summary:'Failed to create or locate solution', message:'Deployment failed', error:e.message });
        }
        solInfo = check;
      }

      // Process CDM entities if any
      if (hasCDMEntities && cdmChoice === 'cdm') {
        writeProgress(res, 'cdm', 'Adding CDM Tables...');
        console.log(`🔄 Processing ${cdmMatches.length} CDM entities...`);
        
        // ensure we have matches with logicalName; fallback to server-side detection if needed
        if (!cdmMatches.length || cdmMatches.some(m => !m?.cdmEntity?.logicalName)) {
          try {
            const CDMEntityRegistry = require('./cdm/cdm-entity-registry.js');
            const reg = new CDMEntityRegistry();
            const det = reg.detectCDMEntities(erdEntities);
            cdmMatches = det.detectedCDM || det.matches || [];
            console.log(`Server-side CDM detection produced ${cdmMatches.length} matches`);
            
            // Recalculate entity separation after fallback detection
            if (cdmMatches.length > 0) {
              cdmEntityNames = cdmMatches.map(m => m?.originalEntity?.name || m?.entity || '').filter(n => n);
              customEntities = erdEntities.filter(entity => !cdmEntityNames.includes(entity.name));
              hasCustomEntities = customEntities.length > 0;
              console.log(`📊 Updated Analysis: ${cdmMatches.length} CDM entities, ${customEntities.length} custom entities`);
            }
          } catch (e) {
            console.warn('CDM detection unavailable:', e.message);
          }
        }

        if (cdmMatches.length > 0) {
          results.cdmResults = await client.integrateCDMEntities(cdmMatches, solInfo.uniquename, data.includeRelatedEntities);
          if (results.cdmResults.success) {
            results.cdmEntitiesIntegrated = results.cdmResults.integratedEntities || [];
            console.log(`✅ CDM integration: ${results.cdmResults.summary?.successfulIntegrations || 0} entities integrated`);
          } else {
            console.warn(`⚠️ CDM integration failed: ${results.cdmResults.error}`);
            results.success = false;
          }
        }
      }

      // Process custom entities if any
if (hasCustomEntities) {
  writeProgress(res, 'custom-entities', `Creating ${customEntities.length} Custom Tables...`);
  console.log(`🔄 Processing ${customEntities.length} custom entities...`);
  console.log(`DEBUG: Passing solutionUniqueName: "${solInfo.uniquename}"`);
  
  try {
    results.customResults = await client.createCustomEntities(
      customEntities, 
      { 
        publisherPrefix,
        publisherName,
        publisherUniqueName: (publisherName || '').replace(/\s+/g, ''),
        solutionUniqueName: solInfo.uniquename,  // Note: lowercase 'uniquename' from Dataverse API
        solutionFriendlyName: friendly,
        relationships: erdRelationships, // Pass relationships
        cdmEntities: cdmMatches || [],   // Pass CDM entities for mixed relationships
        includeRelatedEntities: data.includeRelatedEntities, // Pass the user choice
        progressCallback: (step, message, details) => writeProgress(res, step, message, details)
      }
    );
    
    if (results.customResults.success) {
      results.entitiesCreated += results.customResults.entitiesCreated || 0;
      results.relationshipsCreated += results.customResults.relationshipsCreated || 0;
      console.log(`✅ Custom entities: ${results.customResults.entitiesCreated} entities created, ${results.customResults.relationshipsCreated || 0} relationships created`);
    } else {
      console.warn(`⚠️ Custom entity creation failed: ${results.customResults.error}`);
      // Don't mark overall deployment as failed if CDM succeeded and custom partially failed
      if (!results.cdmResults?.success) {
        results.success = false;
      }
    }
  } catch (error) {
    console.error('Custom entity creation error:', error);
    results.customResults = {
      success: false,
      entitiesCreated: 0,
      relationshipsCreated: 0,
      error: error.message,
      customEntitiesFound: customEntities.map(e => e.name)
    };
    // Don't mark overall deployment as failed if CDM succeeded
    if (!results.cdmResults?.success) {
      results.success = false;
    }
  }
}

      // Process global choices if any selected
      if (data.selectedChoices && Array.isArray(data.selectedChoices) && data.selectedChoices.length > 0) {
        // Filter out undefined, null, and empty values
        const validChoices = data.selectedChoices.filter(choice => {
          if (!choice) return false;
          if (typeof choice === 'string' && choice.trim() === '') return false;
          if (typeof choice === 'object' && !choice.LogicalName && !choice.Name && !choice.name) return false;
          return true;
        });
        
        console.log(`🎨 Processing ${validChoices.length} selected global choices (filtered from ${data.selectedChoices.length})...`);
        console.log(`🔍 DEBUG: selectedChoices array:`, JSON.stringify(data.selectedChoices, null, 2));
        console.log(`🔍 DEBUG: validChoices array:`, JSON.stringify(validChoices, null, 2));
        
        if (validChoices.length === 0) {
          console.log('⚠️ No valid global choices to add to solution');
          results.globalChoicesAdded = 0;
          results.globalChoicesFailed = 0;
          results.globalChoicesErrors = ['No valid choices after filtering'];
        } else {
          try {
            writeProgress(res, 'global-choices-solution', 'Adding Global Choices to Solution...', { choiceCount: validChoices.length });
            
            // Resolve choice names properly
            const choiceNames = validChoices.map(choice => {
              const choiceName = choice?.LogicalName || choice?.Name || choice?.name || choice;
              console.log(`🔍 Resolved choice: ${JSON.stringify(choice)} → ${choiceName}`);
              return choiceName;
            });
            
            const choicesResult = await client.addGlobalChoicesToSolution(choiceNames, solInfo.uniquename);
            results.globalChoicesAdded = choicesResult.added || 0;
            results.globalChoicesFailed = choicesResult.failed || 0;
            results.globalChoicesErrors = choicesResult.errors || [];
            
            if (choicesResult.added > 0) {
              console.log(`✅ Global choices: ${choicesResult.added} choice sets added to solution`);
            }
            if (choicesResult.failed > 0) {
              console.warn(`⚠️ Global choices: ${choicesResult.failed} choice sets failed to add`);
            }
          } catch (error) {
            console.error('Global choices processing error:', error);
            results.globalChoicesAdded = 0;
            results.globalChoicesFailed = validChoices.length;
            results.globalChoicesErrors = [error.message];
          }
        }
      } else if (data.selectedChoices && data.selectedChoices.length > 0) {
        console.log(`⚠️ Warning: ${data.selectedChoices.length} global choices provided but no solution name - skipping`);
        results.globalChoicesAdded = 0;
        results.globalChoicesFailed = 0;
        results.globalChoicesErrors = ['No solution name provided for global choices'];
      } else {
        console.log('📋 No global choices selected to add to solution');
      }

      // Process custom uploaded global choices if any
      if (data.customChoices && Array.isArray(data.customChoices) && data.customChoices.length > 0) {
        // Filter out invalid custom choices
        const validCustomChoices = data.customChoices.filter(choice => {
          if (!choice) return false;
          if (!choice.name && !choice.logicalName) return false;
          if (!choice.options || !Array.isArray(choice.options) || choice.options.length === 0) return false;
          return true;
        });
        
        console.log(`🎨 Processing ${validCustomChoices.length} custom uploaded global choices (filtered from ${data.customChoices.length})...`);
        console.log(`🔍 DEBUG: customChoices array:`, JSON.stringify(data.customChoices, null, 2));
        console.log(`🔍 DEBUG: validCustomChoices array:`, JSON.stringify(validCustomChoices, null, 2));
        
        if (validCustomChoices.length === 0) {
          console.log('⚠️ No valid custom global choices to create');
          results.customGlobalChoicesCreated = 0;
          results.customGlobalChoicesFailed = 0;
          results.customGlobalChoicesErrors = ['No valid custom choices after filtering'];
        } else {
          try {
            const customChoicesResult = await client.createAndAddCustomGlobalChoices(
              validCustomChoices, 
              solInfo.uniquename, 
              publisherPrefix,
              (step, message, details) => writeProgress(res, step, message, details)
            );
            results.customGlobalChoicesCreated = customChoicesResult.created || 0;
            results.customGlobalChoicesFailed = customChoicesResult.failed || 0;
            results.customGlobalChoicesErrors = customChoicesResult.errors || [];
            
            if (customChoicesResult.created > 0) {
              console.log(`✅ Custom global choices: ${customChoicesResult.created} choice sets created and added to solution`);
            }
            if (customChoicesResult.failed > 0) {
              console.warn(`⚠️ Custom global choices: ${customChoicesResult.failed} choice sets failed to create`);
              console.log(`🔍 Custom choice errors:`, customChoicesResult.errors);
            }
          } catch (error) {
            console.error('Custom global choices processing error:', error);
            results.customGlobalChoicesCreated = 0;
            results.customGlobalChoicesFailed = validCustomChoices.length;
            results.customGlobalChoicesErrors = [error.message];
          }
        }
      } else {
        console.log('📋 No custom global choices to create');
      }

      // Build summary message
      const summaryParts = [];
      const warningParts = [];
      
      if (results.cdmResults?.success) {
        summaryParts.push(`${results.cdmResults.summary?.successfulIntegrations || 0} CDM entities integrated`);
      }
      
      if (results.customResults?.success) {
        summaryParts.push(`${results.customResults.entitiesCreated || 0} custom entities created`);
        
 // Add relationship summary if any were created
  if (results.customResults.relationshipsCreated && results.customResults.relationshipsCreated > 0) {
    summaryParts.push(`${results.customResults.relationshipsCreated} relationships created`);
  }

} else if (results.customResults?.customEntitiesFound?.length > 0) {
  warningParts.push(`${results.customResults.customEntitiesFound.length} custom entities failed to create: ${results.customResults.error}`);
}


      if (summaryParts.length === 0) {
        results.success = false;
        results.summary = 'No entities were processed successfully';
        results.message = 'Deployment failed';
        results.error = 'no_entities_processed';
      } else {
        results.summary = `Successfully processed: ${summaryParts.join(', ')}`;
        if (warningParts.length > 0) {
          results.summary += `. Note: ${warningParts.join(', ')}`;
        }
      }

      // Map to frontend expected field names
      results.globalChoicesCreated = (results.customGlobalChoicesCreated || 0);
      results.selectedGlobalChoicesAdded = (results.globalChoicesAdded || 0);

      // Final progress update
      writeProgress(res, 'complete', 'Finishing...', { completed: true });

      streamLogs(res);
      return writeFinal(res, results);

    } catch (e) {
      console.error('❌ /upload error:', e);
      streamLogs(res);
      return writeFinal(res, { success:false, message:'Internal error', error: e.message });
    }
  });
}

// --- cleanup endpoint handler ------------------------------------------
async function handleCleanup(req, res) {
  console.log('🧹 Starting cleanup request...');
  
  try {
    const body = await readRequestBody(req);
    const data = JSON.parse(body);
    
    if (!data) {
      console.error('❌ No cleanup data received');
      res.writeHead(400, {'Content-Type':'application/json'});
      return res.end(JSON.stringify({ success: false, error: 'No data received' }));
    }

    console.log('POST /cleanup payload keys:', Object.keys(data));
    
    // Check if we're in dry run mode
    const dryRun = data.dryRun === true;
    console.log(`🔍 Cleanup mode: ${dryRun ? 'DRY RUN' : 'ACTUAL DELETION'}`);

    // Initialize Dataverse client
    const cfg = { 
      dataverseUrl: data.dataverseUrl, 
      tenantId: data.tenantId, 
      clientId: data.clientId, 
      clientSecret: data.clientSecret,
      verbose: true 
    };
    
    const client = new DataverseClient(cfg);
    
    // Start the cleanup process
    console.log('🔍 Discovering test entities and relationships...');
    
    const cleanupOptions = {
      dryRun: dryRun,
      cleanupAll: data.cleanupAll || false,
      entityPrefixes: data.entityPrefixes || [],
      preserveCDM: data.preserveCDM !== false, // Default to true
      deleteRelationshipsFirst: data.deleteRelationshipsFirst !== false // Default to true
    };
    
    const results = await client.cleanupTestEntities(cleanupOptions);
    
    // Send results back to client
    const response = {
      success: true,
      dryRun: dryRun,
      entitiesFound: results.entitiesFound || [],
      relationshipsFound: results.relationshipsFound || [],
      entitiesDeleted: results.entitiesDeleted || 0,
      relationshipsDeleted: results.relationshipsDeleted || 0,
      errors: results.errors || [],
      warnings: results.warnings || [],
      summary: results.summary || 'Cleanup completed'
    };
    
    console.log('✅ Cleanup completed successfully');
    res.writeHead(200, {'Content-Type':'application/json'});
    res.end(JSON.stringify(response));
    
  } catch (e) {
    console.error('❌ /cleanup error:', e);
    res.writeHead(500, {'Content-Type':'application/json'});
    res.end(JSON.stringify({ 
      success: false, 
      error: e.message,
      dryRun: false
    }));
  }
}

// --- publishers endpoint handler ---------------------------------------
async function handleGetPublishers(req, res) {
  console.log('📋 Getting publishers list...');
  
  try {
    const cfg = await getDataverseConfig();
    const client = new DataverseClient({
      dataverseUrl: cfg.serverUrl,
      tenantId: cfg.tenantId,
      clientId: cfg.clientId,
      clientSecret: cfg.clientSecret
    });
    
    const publishers = await client.getPublishers();
    
    res.writeHead(200, {'Content-Type':'application/json'});
    res.end(JSON.stringify({ success: true, publishers }));
    
  } catch (error) {
    console.error('❌ Failed to get publishers:', error);
    res.writeHead(500, {'Content-Type':'application/json'});
    res.end(JSON.stringify({ 
      success: false, 
      error: error.message,
      publishers: []
    }));
  }
}

// --- global choices endpoint handler -----------------------------------
async function handleGetGlobalChoices(req, res) {
  console.log('📋 Getting global choices list...');
  
  try {
    // Get Dataverse configuration
    const cfg = await getDataverseConfig();
    const client = new DataverseClient({
      dataverseUrl: cfg.serverUrl,
      tenantId:     cfg.tenantId,
      clientId:     cfg.clientId,
      clientSecret: cfg.clientSecret
    });
    
    const choicesResult = await client.getGlobalChoiceSets();
    
    console.log('📋 Retrieved global choices:', {
      total: choicesResult.all?.length || 0,
      builtIn: choicesResult.grouped?.builtIn?.length || 0,
      custom: choicesResult.grouped?.custom?.length || 0
    });
    
    res.writeHead(200, {'Content-Type':'application/json'});
    res.end(JSON.stringify({ 
      success: true, 
      ...choicesResult
    }));
    
  } catch (error) {
    console.error('❌ Failed to get global choices:', error);
    res.writeHead(500, {'Content-Type':'application/json'});
    res.end(JSON.stringify({ 
      success: false, 
      error: error.message,
      all: [],
      grouped: { custom: [], builtIn: [] },
      summary: { total: 0, custom: 0, builtIn: 0 }
    }));
  }
}

// --- solution status endpoint handler ----------------------------------
async function handleGetSolutionStatus(req, res) {
  console.log('🔍 Getting solution status...');
  
  try {
    const urlParts = url.parse(req.url, true);
    const solutionName = urlParts.query.solution;
    
    if (!solutionName) {
      res.writeHead(400, {'Content-Type':'application/json'});
      return res.end(JSON.stringify({ 
        success: false, 
        error: 'Solution name is required as query parameter: ?solution=SolutionName'
      }));
    }

    // Get Dataverse configuration
    const cfg = await getDataverseConfig();
    const client = new DataverseClient({
      dataverseUrl: cfg.serverUrl,
      tenantId: cfg.tenantId,
      clientId: cfg.clientId,
      clientSecret: cfg.clientSecret,
      verbose: true
    });

    // Get solution components
    const result = await client.getSolutionComponents(solutionName);
    
    if (result.success) {
      console.log(`✅ Found solution '${solutionName}' with ${result.components.totalCount} components`);
      console.log(`   - ${result.components.entities.length} entities`);
      console.log(`   - ${result.components.optionSets.length} global choices`);
      console.log(`   - ${result.components.others.length} other components`);
    } else {
      console.log(`❌ Failed to get solution status: ${result.error}`);
    }

    res.writeHead(200, {'Content-Type':'application/json'});
    res.end(JSON.stringify(result));
    
  } catch (error) {
    console.error('❌ Failed to get solution status:', error);
    res.writeHead(500, {'Content-Type':'application/json'});
    res.end(JSON.stringify({ 
      success: false, 
      error: error.message
    }));
  }
}

// --- server ------------------------------------------------------------
const server = http.createServer(async (req, res) => {
  const { pathname } = url.parse(req.url, true);
  console.log(`${req.method} ${pathname}`);

  if (req.method === 'GET' && pathname === '/') {
    res.writeHead(302, { Location: '/wizard' }); res.end(); return;
  }
  if (req.method === 'GET' && pathname === '/wizard') return serveWizard(res);
  if (req.method === 'GET' && pathname === '/api/publishers') return handleGetPublishers(req, res);
  if (req.method === 'GET' && pathname === '/api/global-choices-list') return handleGetGlobalChoices(req, res);
  if (req.method === 'GET' && pathname === '/api/solution-status') return handleGetSolutionStatus(req, res);
  if (req.method === 'POST' && pathname === '/api/validate-erd') return handleValidateErd(req, res);
  if (req.method === 'POST' && pathname === '/upload') return handleUpload(req, res);
  if (req.method === 'POST' && pathname === '/cleanup') return handleCleanup(req, res);
  if (req.method === 'GET' && pathname === '/health') {
    res.writeHead(200, {'Content-Type':'application/json'});
    return res.end(JSON.stringify({ status:'healthy', time: new Date().toISOString() }));
  }

  res.writeHead(404, {'Content-Type':'application/json'});
  res.end(JSON.stringify({ error:'Not Found' }));
});

const port = Number(process.env.PORT) || 3000;
server.listen(port, '0.0.0.0', () => {
  console.log(`Mermaid to Dataverse server running on port ${port}`);
  console.log(`Access the wizard at: http://localhost:${port}/wizard`);
});

module.exports = server;