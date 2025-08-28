const http = require('http');
const url = require('url');
const fs = require('fs');
const path = require('path');

// Load environment variables from .env file
require('dotenv').config();

// Configure logging - Linux-friendly approach
// Prefer App Service log volume on Linux; fall back to stdout-only
const APP_LOG_BASE = process.env.WEBSITE_LOG_DIR || '/home/LogFiles';
const LOG_DIR = path.join(APP_LOG_BASE, 'mermaid-to-dataverse');
let logStream = null;

try {
  fs.mkdirSync(LOG_DIR, { recursive: true });
  const LOG_FILE = path.join(LOG_DIR, `server-${new Date().toISOString().replace(/:/g, '-')}.log`);
  logStream = fs.createWriteStream(LOG_FILE, { flags: 'a' });
  console.log(`File logging enabled at: ${LOG_DIR}`);
} catch (e) {
  console.warn(`File logging disabled (using stdout only): ${e.message}`);
}

// Custom console logger that writes to both console and log file
const originalConsoleLog = console.log;
const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;

// Store recent logs for streaming to client
const recentLogs = [];
const MAX_RECENT_LOGS = 200; // Keep last 200 log entries

// Add getLastLogs method to console
console.getLastLogs = function() {
  return [...recentLogs]; // Return a copy to prevent mutation
};

console.log = function() {
  const args = Array.from(arguments);
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] [INFO] ${args.join(' ')}`;
  
  // Store the log message for streaming
  recentLogs.push(args.join(' '));
  
  // Trim the log buffer if it gets too large
  if (recentLogs.length > MAX_RECENT_LOGS) {
    recentLogs.shift(); // Remove oldest log
  }
  
  // Log to terminal
  originalConsoleLog.apply(console, args);
  
  // Log to file safely
  if (logStream) try { logStream.write(logMessage + '\n'); } catch {}
};

console.error = function() {
  const args = Array.from(arguments);
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] [ERROR] ${args.join(' ')}`;
  
  // Log to terminal
  originalConsoleError.apply(console, args);
  
  // Log to file safely
  if (logStream) try { logStream.write(logMessage + '\n'); } catch {}
};

console.warn = function() {
  const args = Array.from(arguments);
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] [WARN] ${args.join(' ')}`;
  
  // Log to terminal
  originalConsoleWarn.apply(console, args);
  
  // Log to file safely
  if (logStream) try { logStream.write(logMessage + '\n'); } catch {}
};

// Global variables for caching
let cachedPublishers = null;
let publishersCacheTime = null;
const PUBLISHERS_CACHE_DURATION = 10 * 60 * 1000; // 10 minutes

let cachedGlobalChoices = null;
let globalChoicesCacheTime = null;
const GLOBAL_CHOICES_CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

// Azure SDK and Key Vault integration
let azureSDKLoaded = false;
let keyVaultConfig = null;

// Mermaid processing components
let MermaidERDParser = null;
let DataverseClient = null;

try {
  // Load Azure SDK
  const { DefaultAzureCredential, ManagedIdentityCredential, ChainedTokenCredential } = require("@azure/identity");
  const { SecretClient } = require("@azure/keyvault-secrets");
  
  // Load CommonJS Key Vault config
  const kvConfig = require('./azure-keyvault.js');
  keyVaultConfig = kvConfig;
  
  azureSDKLoaded = true;
  console.log('Azure SDK and Key Vault config loaded successfully');
} catch (error) {
  console.error('❌ Failed to load Azure SDK:', error.message);
  azureSDKLoaded = false;
}

// Load Mermaid processing modules
try {
  const { MermaidERDParser: Parser } = require('./mermaid-parser.js');
  const { DataverseClient: Client } = require('./dataverse-client.js');
  
  MermaidERDParser = Parser;
  DataverseClient = Client;
  
  console.log('Mermaid processing modules loaded successfully');
} catch (error) {
  console.error('❌ Failed to load Mermaid processing modules:', error.message);
}

// Simple MSI test function
async function testManagedIdentityDirect() {
  try {
    const clientId = process.env.MANAGED_IDENTITY_CLIENT_ID;
    const msiEndpoint = process.env.MSI_ENDPOINT;
    const msiSecret = process.env.MSI_SECRET;
    
    if (!msiEndpoint || !msiSecret) {
      return {
        success: false,
        message: 'MSI endpoint not available',
        available: false
      };
    }
    
    const tokenUrl = `${msiEndpoint}?resource=https://vault.azure.net/&api-version=2017-09-01${clientId ? `&clientid=${clientId}` : ''}`;
    
    return new Promise((resolve) => {
      const protocol = require('http');
      const req = protocol.request(tokenUrl, {
        headers: { 'Secret': msiSecret },
        timeout: 10000
      }, (res) => {
        let data = '';
        res.on('data', (chunk) => data += chunk);
        res.on('end', () => {
          resolve({
            success: res.statusCode === 200,
            message: res.statusCode === 200 ? 'MSI token retrieved successfully' : `MSI request failed: ${res.statusCode}`,
            statusCode: res.statusCode,
            hasToken: res.statusCode === 200,
            clientId: clientId || 'system-assigned',
            msiEndpoint: msiEndpoint
          });
        });
      });
      
      req.on('error', (error) => {
        resolve({
          success: false,
          message: `MSI request failed: ${error.message}`,
          error: error.message,
          msiEndpoint: msiEndpoint
        });
      });
      
      req.end();
    });
  } catch (error) {
    return {
      success: false,
      message: `MSI test failed: ${error.message}`,
      error: error.message
    };
  }
}

// Get Dataverse configuration from environment or Key Vault
async function getDataverseConfig() {
  console.log('Getting Dataverse configuration...');
  
  // Check if we should use local environment variables
  if (process.env.USE_LOCAL_ENV === 'true') {
    console.log('📍 Using local environment variables');
    return {
      source: 'local_env',
      serverUrl: process.env.DATAVERSE_SERVER_URL,
      tenantId: process.env.DATAVERSE_TENANT_ID,
      clientId: process.env.DATAVERSE_CLIENT_ID,
      clientSecret: process.env.DATAVERSE_CLIENT_SECRET ? '***' : undefined
    };
  }
  
  // Try to get from Key Vault if Azure SDK is loaded
  if (azureSDKLoaded && keyVaultConfig) {
    try {
      const config = await keyVaultConfig.getDataverseConfig();
      console.log('Retrieved Dataverse config from Key Vault');
      console.log('Config details:', {
        hasServerUrl: !!config.serverUrl,
        hasTenantId: !!config.tenantId,
        hasClientId: !!config.clientId,
        hasClientSecret: !!config.clientSecret,
        clientSecretLength: config.clientSecret ? config.clientSecret.length : 0
      });
      return {
        source: 'key_vault',
        ...config
      };
    } catch (error) {
      console.error('❌ Failed to get Dataverse config from Key Vault:', error.message);
      throw error;
    }
  }
  
  throw new Error('No Dataverse configuration available');
}

// Serve wizard UI
function serveWizardUI(res) {
  try {
    const wizardPath = path.join(__dirname, 'wizard-ui.html');
    
    if (!fs.existsSync(wizardPath)) {
      console.error(`❌ Wizard UI file not found at: ${wizardPath}`);
      res.writeHead(404, { 'Content-Type': 'text/html' });
      res.end(`
        <!DOCTYPE html>
        <html>
        <head><title>Wizard UI Not Available</title></head>
        <body style="font-family: 'Segoe UI', sans-serif; padding: 40px; text-align: center;">
          <h1>Wizard UI Temporarily Unavailable</h1>
          <p>The wizard interface is currently not available.</p>
          <p>Please check that the wizard-ui.html file exists.</p>
        </body>
        </html>
      `);
      return;
    }
    
    const html = fs.readFileSync(wizardPath, 'utf8');
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(html);
  } catch (error) {
    console.error('❌ Error serving wizard UI:', error);
    res.writeHead(500, { 'Content-Type': 'text/html' });
    res.end(`
      <!DOCTYPE html>
      <html>
      <head><title>Error Loading Wizard UI</title></head>
      <body style="font-family: 'Segoe UI', sans-serif; padding: 40px; text-align: center;">
        <h1>❌ Error Loading Wizard UI</h1>
        <p>There was an error loading the wizard interface.</p>
        <p><small>Error: ${error.message}</small></p>
      </body>
      </html>
    `);
  }
}

// Handle deployment requests
async function handleDeployment(req, res) {
  let body = '';
  req.on('data', chunk => {
    body += chunk.toString();
  });
  
  req.on('end', async () => {
    try {
      console.log('Starting deployment process...');
      
      // Parse JSON request
      let data;
      try {
        console.log('Raw body length:', body.length);
        console.log('Body preview (first 500 chars):', body.substring(0, 500));
        
        if (!body.trim()) {
          console.error('❌ Empty request body detected');
          throw new Error('Empty request body');
        }
        
        console.log('Attempting to parse JSON...');
        data = JSON.parse(body);
        console.log('JSON parsed successfully');
        console.log('Parsed data keys:', Object.keys(data));
        
        // Debug uploaded global choices specifically
        console.log('Uploaded global choices debug:', {
          hasUploadedGlobalChoices: !!data.uploadedGlobalChoices,
          uploadedGlobalChoicesKeys: data.uploadedGlobalChoices ? Object.keys(data.uploadedGlobalChoices) : null,
          hasData: data.uploadedGlobalChoices ? !!data.uploadedGlobalChoices.data : false,
          dataType: data.uploadedGlobalChoices ? typeof data.uploadedGlobalChoices.data : 'undefined',
          dataLength: data.uploadedGlobalChoices && data.uploadedGlobalChoices.data ? 
            (Array.isArray(data.uploadedGlobalChoices.data) ? data.uploadedGlobalChoices.data.length : 'not array') : 'no data',
          count: data.uploadedGlobalChoices ? data.uploadedGlobalChoices.count : 'no count'
        });
      } catch (parseError) {
        console.error('❌ JSON Parse Error:', parseError.message);
        console.error('❌ Parse error stack:', parseError.stack);
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: false,
          message: 'Invalid JSON in request body',
          error: parseError.message
        }));
        return;
      }
      
      // Validate required fields
      const { mermaidContent, publisherName, publisherPrefix, solutionName, entities, relationships } = data;
      console.log('Validating required fields...');
      console.log('Field validation:', {
        hasMermaidContent: !!mermaidContent,
        mermaidContentLength: mermaidContent?.length || 0,
        hasEntities: !!entities,
        entitiesCount: entities?.length || 0,
        hasRelationships: !!relationships,
        relationshipsCount: relationships?.length || 0,
        hasPublisherName: !!publisherName,
        publisherName: publisherName,
        hasPublisherPrefix: !!publisherPrefix,
        publisherPrefix: publisherPrefix,
        hasSolutionName: !!solutionName,
        solutionName: solutionName
      });
      
      // Check if we have either mermaid content OR pre-parsed entities
      const hasValidInput = (mermaidContent?.trim()) || (entities && Array.isArray(entities) && entities.length > 0);
      
      if (!hasValidInput) {
        console.error('❌ Validation failed: Missing mermaid content and entities');
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: false,
          error: 'Either mermaid content or parsed entities are required'
        }));
        return;
      }
      
      if (!publisherName?.trim() || !publisherPrefix?.trim() || !solutionName?.trim()) {
        console.error('❌ Validation failed: Missing required fields');
        console.error('❌ Missing fields details:', {
          publisherName: !publisherName?.trim() ? 'MISSING' : 'OK',
          publisherPrefix: !publisherPrefix?.trim() ? 'MISSING' : 'OK',
          solutionName: !solutionName?.trim() ? 'MISSING' : 'OK'
        });
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: false,
          error: 'Publisher name, prefix, and solution name are required'
        }));
        return;
      }
      
      // Validate publisher prefix format
      console.log('Validating publisher prefix format...');
      // Dataverse allows 2-8 lowercase letters for publisher prefix
      if (!/^[a-z]{2,8}$/.test(publisherPrefix)) {
        console.error('❌ Validation failed: Invalid publisher prefix format');
        console.error('❌ Publisher prefix:', publisherPrefix);
        console.error('❌ Publisher prefix length:', publisherPrefix.length);
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: false,
          error: 'Publisher prefix must be 2-8 lowercase letters'
        }));
        return;
      }
      
      console.log(`Processing deployment for solution: ${solutionName}`);
      console.log(`Publisher: ${publisherName} (${publisherPrefix})`);
      console.log(`Dry run: ${data.dryRun ? 'Yes' : 'No'}`);
      
      let parseResult;
      
      // Check if we have pre-parsed entities or need to parse mermaid content
      if (entities && Array.isArray(entities) && entities.length > 0) {
        console.log('Using pre-parsed entities from request');
        parseResult = {
          entities: entities,
          relationships: relationships || [],
          validation: { isValid: true, summary: { errorCount: 0, warningCount: 0 } }
        };
      } else {
        console.log('Parsing mermaid content...');
        // Parse Mermaid content
        if (!MermaidERDParser) {
          throw new Error('Mermaid parser not available');
        }
        
        const parser = new MermaidERDParser();
        parseResult = parser.parse(mermaidContent);
        
        if (!parseResult.validation.isValid) {
          console.error('❌ Schema validation failed');
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            success: false,
            error: `Schema parsing failed: ${parseResult.validation.summary.errorCount} errors found`
          }));
          return;
        }
      }
      
      console.log(`Parsed ${parseResult.entities.length} entities and ${parseResult.relationships.length} relationships`);
      
      // If dry run, return validation results
      if (data.dryRun) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          message: 'Schema validation completed successfully',
          dryRun: true,
          entities: parseResult.entities,
          relationships: parseResult.relationships,
          summary: {
            entityCount: parseResult.entities.length,
            relationshipCount: parseResult.relationships.length
          }
        }));
        return;
      }
      
      // Get Dataverse configuration
      const dataverseConfig = await getDataverseConfig();
      console.log(`Using Dataverse config from: ${dataverseConfig.source}`);
      
      // Initialize Dataverse client
      if (!DataverseClient) {
        throw new Error('Dataverse client not available');
      }
      
      // Map the config properties correctly for DataverseClient
      const clientConfig = {
        dataverseUrl: dataverseConfig.serverUrl, // Map serverUrl to dataverseUrl
        tenantId: dataverseConfig.tenantId,
        clientId: dataverseConfig.clientId,
        clientSecret: dataverseConfig.clientSecret
      };
      
      const client = new DataverseClient(clientConfig);
      
      // Set publisher prefix and solution name on the client before any operations
      client.publisherPrefix = publisherPrefix;
      client.solutionName = solutionName;
      client.solutionName = solutionName;
      
      console.log('Starting Dataverse deployment...');
      
      // Store information about uploaded global choices but don't process them yet
      // We'll process them after the solution is created
      if (data.uploadedGlobalChoices && data.uploadedGlobalChoices.data) {
        console.log(`Found ${data.uploadedGlobalChoices.count} custom global choices to process later...`);
        
        try {
          // Just create the global choices but don't add them to solution yet
          console.log(' handleDeployment: Creating global choices (will add to solution later)...');
          const choicesResult = await client.createGlobalChoicesFromJson(data.uploadedGlobalChoices.data, false); // false means don't try to add to solution yet
          console.log(' handleDeployment: Global choices result:', choicesResult);
          
          if (choicesResult.success) {
            if (choicesResult.created > 0) {
              console.log(`Created ${choicesResult.created} new global choice sets`);
            }
            if (choicesResult.skipped > 0) {
              console.log(`⏭️ Skipped ${choicesResult.skipped} existing global choice sets`);
            }
          } else {
            console.warn(`⚠️ Some global choices failed to create (${choicesResult.errors.length} errors)`);
            console.log(' handleDeployment: Global choices errors:', choicesResult.errors);
          }
        } catch (choicesError) {
          console.error(' handleDeployment: Global choices processing error:', choicesError);
          console.warn(`⚠️ Custom global choices processing failed: ${choicesError.message}`);
          // Don't fail the entire deployment for global choices errors
        }
      } else {
        console.log(' handleDeployment: No uploaded global choices to process');
      }
      
      // Use simplified options like the working backup, but include required publisher/solution info
      const creationOptions = {
        publisherPrefix: publisherPrefix,
        publisherName: publisherName,
        publisherUniqueName: data.publisherUniqueName || publisherName.replace(/\s+/g, ''), // Remove spaces for unique name
        publisherFriendlyName: publisherName,
        solutionFriendlyName: solutionName,
        solutionDescription: data.solutionDescription,
        dryRun: false,
        createPublisher: data.createPublisher !== false,
        relationships: parseResult.relationships || [],
        selectedChoices: data.selectedChoices && data.selectedChoices.length > 0 ? 
          data.selectedChoices.filter(choice => choice && choice.trim() !== '') : []
      };
      
      console.log('Creation options:', JSON.stringify(creationOptions, null, 2));
      console.log('Selected choices count:', creationOptions.selectedChoices.length);
      console.log('Selected choices details:', creationOptions.selectedChoices);
      
      // Deploy to Dataverse using the same method as the working backup
      const deployResult = await client.createEntitiesFromMermaid(parseResult.entities, creationOptions);
      
      console.log(`🎉 Deployment completed: ${deployResult.success ? 'Success' : 'Failed'}`);
      console.log('Deploy result details:', {
        success: deployResult.success,
        entitiesCreated: deployResult.entitiesCreated,
        relationshipsCreated: deployResult.relationshipsCreated,
        globalChoicesProcessed: deployResult.globalChoicesProcessed || 0
      });
      
      // Process pending global choices after solution creation
      // Wait a few seconds to make sure the solution is fully provisioned
      console.log('⏳ Waiting 5 seconds for solution to be fully provisioned...');
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      if (data.uploadedGlobalChoices && data.uploadedGlobalChoices.data) {
        try {
          console.log('Adding uploaded global choices to solution...');
          console.log(' DEBUG: Processing pending global choices for solution addition...');
          
          // Verify solution exists before adding global choices to it
          console.log(`Verifying solution '${data.solutionName}' exists before adding global choices...`);
          const solutionExists = await client.checkSolutionExists(data.solutionName);
          
          if (solutionExists) {
            console.log(`Solution '${data.solutionName}' exists, adding global choices to it...`);
            const globalChoicesResult = await client.addPendingGlobalChoicesToSolution();
            
            if (globalChoicesResult && globalChoicesResult.added > 0) {
              console.log(`Successfully added ${globalChoicesResult.added} global choices to solution`);
              // Update deployment result with global choices info
              deployResult.globalChoicesAddedToSolution = globalChoicesResult.added;
            }
            if (globalChoicesResult && globalChoicesResult.failed > 0) {
              console.warn(`⚠️ ${globalChoicesResult.failed} global choices failed to be added to solution`);
              console.warn(' DEBUG: Global choice solution addition errors:', globalChoicesResult.errors);
              deployResult.globalChoicesAddedToSolution = deployResult.globalChoicesAddedToSolution || 0;
              deployResult.globalChoicesFailedToAdd = globalChoicesResult.failed;
            }
          } else {
            console.warn(`⚠️ Solution '${data.solutionName}' not found after waiting, cannot add global choices`);
            deployResult.globalChoicesAddedToSolution = 0;
            deployResult.globalChoicesError = `Solution '${data.solutionName}' not found after waiting`;
          }
        } catch (globalChoicesError) {
          console.warn(`⚠️ Failed to add global choices to solution: ${globalChoicesError.message}`);
          console.error(' DEBUG: Global choices solution addition error:', globalChoicesError);
          deployResult.globalChoicesAddedToSolution = 0;
          deployResult.globalChoicesError = globalChoicesError.message;
        }
      }
      
      // Add success message for selected choices if any
      if (creationOptions.selectedChoices && creationOptions.selectedChoices.length > 0) {
        console.log(`Added ${creationOptions.selectedChoices.length} global choices to solution`);
        deployResult.selectedGlobalChoicesAdded = creationOptions.selectedChoices.length;
      }
      
      // Ensure deployment is marked as successful if either entities or relationships were created
      const hasEntities = Array.isArray(deployResult.entitiesCreated) 
                           ? deployResult.entitiesCreated.length > 0 
                           : (deployResult.entitiesCreated > 0);
      const hasRelationships = Array.isArray(deployResult.relationshipsCreated) 
                               ? deployResult.relationshipsCreated.length > 0 
                               : (deployResult.relationshipsCreated > 0);
      
      if (!deployResult.success && 
          (hasEntities || 
           hasRelationships || 
           (deployResult.globalChoicesAddedToSolution > 0)) && 
          !deployResult.criticalError) {
        console.log('Correcting deployment success flag - components were created successfully');
        deployResult.success = true;
        // Add a warning message about partial success if needed
        if (deployResult.error) {
          deployResult.warning = deployResult.error;
          delete deployResult.error;
        }
      }
      
      // Process entity count correctly - it might be an array or a number
      let entityCount = 0;
      if (Array.isArray(deployResult.entitiesCreated)) {
        entityCount = deployResult.entitiesCreated.length;
      } else if (typeof deployResult.entitiesCreated === 'number') {
        entityCount = deployResult.entitiesCreated;
      }
      
      // Process relationship count correctly - it might be an array or a number
      let relationshipCount = 0;
      if (Array.isArray(deployResult.relationshipsCreated)) {
        relationshipCount = deployResult.relationshipsCreated.length;
        console.log(`ℹ️ Found ${relationshipCount} relationships in response array`);
      } else if (Array.isArray(deployResult.relationships)) {
        // Try to get from the relationships array if relationshipsCreated isn't available
        relationshipCount = deployResult.relationships.length;
        console.log(`ℹ️ Found ${relationshipCount} relationships in legacy array`);
      } else if (typeof deployResult.relationshipsCreated === 'number') {
        relationshipCount = deployResult.relationshipsCreated;
        console.log(`ℹ️ Found ${relationshipCount} relationships (number)`);
      }
      
      const finalStatus = {
        success: deployResult.success,
        entitiesCreated: entityCount,
        relationshipsCreated: relationshipCount,
        selectedGlobalChoicesAdded: deployResult.selectedGlobalChoicesAdded || 0,
        globalChoicesAddedToSolution: deployResult.globalChoicesAddedToSolution || 0
      };
      
      console.log('Final deployment result:', JSON.stringify(finalStatus));
      
      // Log a clear summary message
      if (finalStatus.success) {
        console.log(`DEPLOYMENT SUCCESSFUL: Created ${entityCount} entities, ${relationshipCount} relationships, and added ${finalStatus.globalChoicesAddedToSolution} global choices to solution`);
      } else {
        console.log(`❌ DEPLOYMENT FAILED: ${deployResult.error || 'Unknown error occurred'}`);
      }
      
      // Add a final status message at the end of the log
      console.log(`FINAL DEPLOYMENT STATUS: ${finalStatus.success ? 'SUCCESS' : 'FAILED'}`)
      
      // Add a human-readable summary to the result
      if (finalStatus.success) {
        deployResult.summary = `Successfully created ${entityCount} entities, ${relationshipCount} relationships, and added ${finalStatus.globalChoicesAddedToSolution} global choices to solution.`;
      } else {
        deployResult.summary = `Deployment failed: ${deployResult.error || 'Unknown error occurred'}`;
      }
      
      // Make sure the response includes the proper counts and explicitly set success
      deployResult.entitiesCreated = entityCount;
      deployResult.relationshipsCreated = relationshipCount;
      
      // Force success flag to true if we have any successful creations
      if ((entityCount > 0 || relationshipCount > 0 || 
          (deployResult.globalChoicesAddedToSolution && deployResult.globalChoicesAddedToSolution > 0)) &&
          !deployResult.criticalError) {
        deployResult.success = true;
      }
      
      // Log the final status that will be sent to the client
      console.log(`FINAL DEPLOYMENT STATUS: ${deployResult.success ? 'SUCCESS' : 'FAILURE'}`);
      
      // Set up headers for streaming response
      res.writeHead(200, { 
        'Content-Type': 'application/json',
        'Transfer-Encoding': 'chunked'
      });
      
      // First, send all the logs collected during deployment
      const logs = console.getLastLogs().map(log => {
        return JSON.stringify({ type: 'log', message: log }) + '\n';
      });
      
      // Send logs
      for (const log of logs) {
        res.write(log);
      }
      
      // Send the final result in the expected format with type: 'result'
      const resultData = JSON.stringify({ 
        type: 'result', 
        success: deployResult.success,
        summary: deployResult.summary,
        message: deployResult.success ? 'Deployment completed successfully' : 'Deployment failed',
        entities: deployResult.entitiesCreated,
        relationships: deployResult.relationshipsCreated,
        globalChoices: deployResult.globalChoicesAddedToSolution || 0,
        selectedGlobalChoices: deployResult.selectedGlobalChoicesAdded || 0,
        error: deployResult.error || null,
        // Include these properties explicitly for clear client-side handling
        entitiesCreated: deployResult.entitiesCreated,
        relationshipsCreated: deployResult.relationshipsCreated,
        globalChoicesAddedToSolution: deployResult.globalChoicesAddedToSolution || 0,
        selectedGlobalChoicesAdded: deployResult.selectedGlobalChoicesAdded || 0
      }) + '\n';
      
      // Send final result and end response
      res.write(resultData);
      res.end();
      
    } catch (error) {
      console.error('❌ Deployment error:', error);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: false,
        error: error.message,
        message: 'Deployment failed due to an internal error'
      }));
    }
  });
}

// Create HTTP server
const server = http.createServer(async (req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;

  console.log(`${req.method} ${pathname}`);

  try {
    if (pathname === '/') {
      // Redirect directly to wizard (primary interface)
      res.writeHead(302, { 'Location': '/wizard' });
      res.end();
      
    } else if (pathname === '/wizard') {
      // Serve the wizard UI
      serveWizardUI(res);
      
    } else if (pathname === '/upload' && req.method === 'POST') {
      // Handle deployment from the wizard
      await handleDeployment(req, res);
      
    } else if (pathname === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        azure: azureSDKLoaded,
        keyVault: !!process.env.KEY_VAULT_URI
      }));
      
    } else if (pathname === '/keyvault') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        configured: !!process.env.KEY_VAULT_URI,
        uri: process.env.KEY_VAULT_URI || 'Not configured',
        authMethod: process.env.AUTH_MODE || 'default'
      }));
      
    } else if (pathname === '/managed-identity') {
      const result = await testManagedIdentityDirect();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result, null, 2));
      
    } else if (pathname === '/api/dataverse-config') {
      try {
        const config = await getDataverseConfig();
        
        // Add environment and authentication method info
        const response = {
          ...config,
          environment: {
            nodeEnv: process.env.NODE_ENV || 'development',
            useLocalEnv: process.env.USE_LOCAL_ENV === 'true',
            azureSDKLoaded: azureSDKLoaded,
            keyVaultConfigured: !!keyVaultConfig
          }
        };
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(response, null, 2));
      } catch (error) {
        console.error('❌ Error getting Dataverse config:', error);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: false,
          error: error.message,
          environment: {
            nodeEnv: process.env.NODE_ENV || 'development',
            useLocalEnv: process.env.USE_LOCAL_ENV === 'true',
            azureSDKLoaded: azureSDKLoaded,
            keyVaultConfigured: !!keyVaultConfig
          }
        }, null, 2));
      }
      
    } else if (pathname === '/api/validate-erd' && req.method === 'POST') {
      // Validate ERD schema
      console.log('Starting ERD validation...');
      let body = '';
      req.on('data', chunk => {
        body += chunk.toString();
      });
      
      req.on('end', async () => {
        try {
          console.log('📄 Raw request body length:', body.length);
          console.log('📄 First 200 chars:', body.substring(0, 200));
          
          const data = JSON.parse(body);
          console.log('JSON parsed successfully');
          console.log('Mermaid content length:', data.mermaidContent?.length || 'undefined');
          console.log('First 100 chars of content:', data.mermaidContent?.substring(0, 100) || 'NO CONTENT');
          
          if (!MermaidERDParser) {
            console.error('❌ MermaidERDParser not available');
            throw new Error('Mermaid parser not available');
          }
          
          console.log('Creating parser instance...');
          const parser = new MermaidERDParser();
          
          console.log('Calling parser.parse()...');
          const result = parser.parse(data.mermaidContent);
          
          console.log('Parser returned result:', {
            success: result?.validation?.isValid,
            entitiesCount: result?.entities?.length,
            relationshipsCount: result?.relationships?.length,
            validationStatus: result?.validation?.status,
            errorCount: result?.validation?.summary?.errorCount,
            warningCount: result?.validation?.summary?.warningCount
          });
          
          // Get validation summary from parser
          const validationSummary = parser.getValidationSummary();
          console.log('Validation summary:', validationSummary);
          
          // Build response data
          let responseData = {
            success: validationSummary.isValid,
            entities: result.entities || [],
            relationships: result.relationships || [],
            warnings: result.warnings || [],
            validation: validationSummary,
            summary: {
              entityCount: result.entities ? result.entities.length : 0,
              relationshipCount: result.relationships ? result.relationships.length : 0,
              totalAttributes: result.entities ? result.entities.reduce((sum, entity) => sum + entity.attributes.length, 0) : 0
            }
          };

          // Include corrected ERD if there are warnings
          if (validationSummary.warnings && validationSummary.warnings.length > 0) {
            console.log('⚠️ Warnings found, generating corrected ERD...');
            try {
              responseData.correctedERD = parser.generateCorrectedERD();
              console.log('Corrected ERD generated');
            } catch (correctionError) {
              console.warn('⚠️ Failed to generate corrected ERD:', correctionError.message);
            }
          }
          
          // Add error message if validation failed
          if (!validationSummary.isValid) {
            responseData.error = `Validation failed: ${validationSummary.summary.errorCount} errors, ${validationSummary.summary.warningCount} warnings`;
          }
          
          console.log('Sending validation response:', {
            success: responseData.success,
            hasEntities: responseData.entities.length > 0,
            hasWarnings: responseData.warnings.length > 0,
            hasCorrectedERD: !!responseData.correctedERD,
            validationIsValid: responseData.validation.isValid
          });
          
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(responseData));
        } catch (error) {
          console.error('❌ Validation error:', error);
          console.error('❌ Error stack:', error.stack);
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            success: false,
            error: error.message
          }));
        }
      });
      
    } else if (pathname === '/api/publishers' && req.method === 'GET') {
      // Get all publishers from Dataverse
      console.log('Getting publishers...');
      
      try {
        // Check cache first
        const now = Date.now();
        const forceRefresh = url.parse(req.url, true).query.refresh === 'true';
        
        if (!forceRefresh && cachedPublishers && publishersCacheTime && (now - publishersCacheTime < PUBLISHERS_CACHE_DURATION)) {
          const remainingTime = Math.round((PUBLISHERS_CACHE_DURATION - (now - publishersCacheTime)) / 1000);
          console.log(`Returning cached publishers (${remainingTime}s remaining)`);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            success: true,
            publishers: cachedPublishers,
            cached: true,
            cacheTimeRemaining: remainingTime
          }));
          return;
        }

        console.log('Cache miss or refresh requested, fetching fresh data...');
        
        try {
          const configResult = await getDataverseConfig();
          console.log('Got Dataverse config, creating client...');
          
          if (!DataverseClient) {
            throw new Error('Dataverse client not available');
          }
          
          // Map the config properties correctly for DataverseClient
          const clientConfig = {
            dataverseUrl: configResult.serverUrl, // Map serverUrl to dataverseUrl
            tenantId: configResult.tenantId,
            clientId: configResult.clientId,
            clientSecret: configResult.clientSecret
          };
          
          console.log('Client config:', {
            hasDataverseUrl: !!clientConfig.dataverseUrl,
            dataverseUrlLength: clientConfig.dataverseUrl?.length,
            hasTenantId: !!clientConfig.tenantId,
            hasClientId: !!clientConfig.clientId,
            hasClientSecret: !!clientConfig.clientSecret
          });
          
          const client = new DataverseClient(clientConfig);
          
          // Test connection first
          console.log(' Testing Dataverse connection...');
          const connectionTest = await client.testConnection();
          
          if (!connectionTest.success) {
            throw new Error(`Connection test failed: ${connectionTest.message}`);
          }
          
          console.log('Getting publishers from Dataverse...');
          const publishers = await client.getPublishers();
          
          console.log(`Retrieved ${publishers ? publishers.length : 0} publishers`);
          
          // Cache the results
          cachedPublishers = publishers;
          publishersCacheTime = now;
          
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            success: true,
            publishers: publishers || []
          }));
          
        } catch (dataverseError) {
          console.error('❌ Dataverse connection failed:', dataverseError.message);
          
          // Return mock data when there's an error accessing Dataverse
          const mockPublishers = [
            {
              id: 'mock-default-publisher',
              uniqueName: 'DefaultPublisher',
              friendlyName: 'Default Publisher',
              description: 'Default system publisher',
              prefix: 'new',
              isDefault: true
            },
            {
              id: 'mock-custom-publisher',
              uniqueName: 'CustomPublisher',
              friendlyName: 'Custom Publisher',
              description: 'Custom publisher for custom entities',
              prefix: 'cust',
              isDefault: false
            }
          ];
          
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            success: true,
            publishers: mockPublishers,
            usingMockData: true,
            error: dataverseError.message
          }));
        }
        
      } catch (error) {
        console.error('❌ Publishers endpoint error:', error);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: false,
          error: error.message,
          message: 'Failed to retrieve publishers'
        }));
      }
      
    } else if (pathname === '/api/global-choices-list' && req.method === 'GET') {
      // Get all global choice sets from Dataverse
      console.log('Getting global choice sets...');
      
      try {
        // Check cache first
        const now = Date.now();
        const forceRefresh = url.parse(req.url, true).query.refresh === 'true';
        
        if (!forceRefresh && cachedGlobalChoices && globalChoicesCacheTime && (now - globalChoicesCacheTime < GLOBAL_CHOICES_CACHE_DURATION)) {
          const remainingTime = Math.round((GLOBAL_CHOICES_CACHE_DURATION - (now - globalChoicesCacheTime)) / 1000);
          console.log(`Returning cached global choices (${remainingTime}s remaining)`);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            success: true,
            ...cachedGlobalChoices,
            cached: true,
            cacheTimeRemaining: remainingTime
          }));
          return;
        }

        console.log('Cache miss or refresh requested, fetching fresh data...');
        
        try {
          const configResult = await getDataverseConfig();
          console.log('Got Dataverse config, creating client...');
          
          if (!DataverseClient) {
            throw new Error('Dataverse client not available');
          }
          
          // Map the config properties correctly for DataverseClient
          const clientConfig = {
            dataverseUrl: configResult.serverUrl,
            tenantId: configResult.tenantId,
            clientId: configResult.clientId,
            clientSecret: configResult.clientSecret
          };
          
          const client = new DataverseClient(clientConfig);
          
          // Test connection first
          console.log(' Testing Dataverse connection...');
          const connectionTest = await client.testConnection();
          
          if (!connectionTest.success) {
            throw new Error(`Connection test failed: ${connectionTest.message}`);
          }
          
          console.log('Getting global choice sets from Dataverse...');
          const globalChoices = await client.getGlobalChoiceSets();
          
          console.log(`Retrieved ${globalChoices?.summary?.total || 0} global choice sets`);
          
          // Cache the results
          cachedGlobalChoices = globalChoices;
          globalChoicesCacheTime = now;
          
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            success: true,
            ...globalChoices || { all: [], grouped: { custom: [], builtIn: [] }, summary: { total: 0, custom: 0, builtIn: 0 } }
          }));
          
        } catch (dataverseError) {
          console.error('❌ Dataverse connection failed for global choices:', dataverseError.message);
          
          // Return empty result when there's an error accessing Dataverse
          const emptyResult = {
            all: [],
            grouped: { custom: [], builtIn: [] },
            summary: { total: 0, custom: 0, builtIn: 0 }
          };
          
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            success: true,
            ...emptyResult,
            usingEmptyData: true,
            error: dataverseError.message
          }));
        }
        
      } catch (error) {
        console.error('❌ Global choices endpoint error:', error);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: false,
          error: error.message,
          message: 'Failed to retrieve global choice sets'
        }));
      }
      
    } else {
      // 404 handler
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        error: 'Not Found',
        message: `The requested path ${pathname} was not found`,
        availableEndpoints: [
          '/ (redirects to /wizard)',
          '/wizard (GET)',
          '/upload (POST)',
          '/health (GET)',
          '/keyvault (GET)',
          '/managed-identity (GET)',
          '/api/dataverse-config (GET)',
          '/api/validate-erd (POST)',
          '/api/publishers (GET)',
          '/api/global-choices-list (GET)'
        ]
      }));
    }
    
  } catch (error) {
    console.error('❌ Server error:', error);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      error: 'Internal Server Error',
      message: error.message
    }));
  }
});

const port = Number(process.env.PORT) || 3000;
server.listen(port, '0.0.0.0', () => {
  console.log(`Mermaid to Dataverse server running on port ${port}`);
  console.log(`Access the wizard at: http://localhost:${port}/wizard`);
});

module.exports = server;
