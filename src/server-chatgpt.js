
/**
 * Minimal, self-contained server for Mermaid ➜ Dataverse
 * - Streams logs back to the client ({"type":"log"} lines) and ends with {"type":"result"}
 * - Validates Mermaid ERD
 * - Deploys:
 *    - CDM entities: adds existing entities to a solution via AddSolutionComponent (no table creation)
 *    - Custom entities: creates entity, attributes and optional 1:N relationships
 *
 * Requires:
 *  - ./dataverse-client.js  (exposes class DataverseClient with methods used below)
 *  - ./mermaid-parser.js    (exposes class MermaidERDParser with parse())
 *  - Optional: ./azure-keyvault.js (if you want Key Vault, else env vars are used)
 */

const http = require('http');
const url = require('url');
const fs = require('fs');
const path = require('path');

require('dotenv').config();

// --- Lightweight log streamer ------------------------------------------------
function makeStreamer(res) {
  return (lvl, msg, obj) => {
    const line = (obj !== undefined)
      ? `[${lvl}] ${msg} ${typeof obj === 'string' ? obj : safeStringify(obj)}`
      : `[${lvl}] ${msg}`;
    try { res.write(JSON.stringify({ type: 'log', message: line }) + '\n'); } catch {}
    console[lvl === 'ERROR' ? 'error' : (lvl === 'WARN' ? 'warn' : 'log')](line);
  };
}
function safeStringify(x) {
  try { return JSON.stringify(x); } catch { return String(x); }
}

// --- Optional KV config loader (best-effort) ---------------------------------
let keyVaultLoader = null;
try { keyVaultLoader = require('./azure-keyvault.js'); } catch { /* optional */ }

// --- Load project modules (Parser + Client) ----------------------------------
let MermaidERDParser, DataverseClient;
try {
  ({ MermaidERDParser } = require('./mermaid-parser.js'));
  ({ DataverseClient }  = require('./dataverse-client.js'));
  console.log('Parser + Dataverse client loaded.');
} catch (e) {
  console.error('❌ Failed to load core modules:', e.message);
}

// --- Config resolution --------------------------------------------------------
async function getDataverseConfig(log) {
  // Prefer env; try KV if USE_KEY_VAULT truthy and loader exists
  const useKv = (process.env.USE_KEY_VAULT || '').toLowerCase() === 'true' && !!keyVaultLoader;
  if (useKv) {
    try {
      log('INFO', 'Fetching Dataverse config from Key Vault...');
      const cfg = await keyVaultLoader.getDataverseConfig();
      if (cfg && cfg.serverUrl && cfg.tenantId && cfg.clientId && cfg.clientSecret) return cfg;
      log('WARN', 'Key Vault returned incomplete config, falling back to env.');
    } catch (e) {
      log('WARN', `Key Vault config failed: ${e.message}`);
    }
  }
  // env fallback
  const cfg = {
    serverUrl: process.env.DATAVERSE_URL || process.env.DATAVERSE_SERVER_URL,
    tenantId:  process.env.TENANT_ID     || process.env.DATAVERSE_TENANT_ID,
    clientId:  process.env.CLIENT_ID     || process.env.DATAVERSE_CLIENT_ID,
    clientSecret: process.env.CLIENT_SECRET || process.env.DATAVERSE_CLIENT_SECRET
  };
  return cfg;
}

// --- Helpers -----------------------------------------------------------------
function readBody(req) {
  return new Promise((resolve, reject) => {
    let buf = '';
    req.on('data', chunk => buf += chunk);
    req.on('end', () => resolve(buf));
    req.on('error', reject);
  });
}

function serveWizard(res) {
  const file = path.join(__dirname, 'wizard-ui.html');
  if (fs.existsSync(file)) {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(fs.readFileSync(file, 'utf8'));
  } else {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(`<!doctype html><html><body style="font-family:Segoe UI,sans-serif;padding:2rem">
      <h2>Wizard UI not found</h2>
      <p>Place <code>wizard-ui.html</code> next to <code>server.js</code>.</p>
    </body></html>`);
  }
}

function okJSON(res, obj) {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(obj));
}

function badJSON(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(obj));
}

// --- Route handlers -----------------------------------------------------------
async function handleValidateErd(req, res) {
  try {
    const body = await readBody(req);
    const data = JSON.parse(body || '{}');
    const content = data.mermaidContent || '';
    if (!content.trim()) return badJSON(res, 400, { success:false, error:'Missing mermaidContent' });

    if (!MermaidERDParser) throw new Error('MermaidERDParser not available');
    const parser = new MermaidERDParser();
    const result = parser.parse(content);

    okJSON(res, {
      success: !!(result?.validation?.isValid ?? true),
      ...result
    });
  } catch (e) {
    badJSON(res, 500, { success:false, error: e.message });
  }
}

async function handleUpload(req, res) {
  res.writeHead(200, { 'Content-Type': 'application/json', 'Transfer-Encoding': 'chunked' });
  const log = makeStreamer(res);

  try {
    const raw = await readBody(req);
    let data;
    try { data = JSON.parse(raw || '{}'); }
    catch (e) { return badJSON(res, 400, { success:false, error:'Invalid JSON' }); }

    log('INFO', 'POST /upload payload keys:', Object.keys(data));

    const {
      mermaidContent,
      entities,
      relationships,
      solutionName,
      solutionDisplayName,
      publisherName,
      publisherPrefix,
      cdmChoice,
      cdmMatches
    } = data;

    // Parse ERD if entities not supplied
    let erdEntities = Array.isArray(entities) ? entities : [];
    let erdRelationships = Array.isArray(relationships) ? relationships : [];

    if (!erdEntities.length) {
      if (!MermaidERDParser) throw new Error('MermaidERDParser not available');
      const parser = new MermaidERDParser();
      const parsed = parser.parse(mermaidContent || '');
      erdEntities = parsed.entities || [];
      erdRelationships = parsed.relationships || [];
    }

    if (!solutionName || !publisherPrefix) {
      return res.end(JSON.stringify({ type:'result', success:false, message:'Missing solutionName or publisherPrefix' })+'\n');
    }

    // Get DV config + client
    const cfg = await getDataverseConfig(log);
    if (!cfg.serverUrl || !cfg.tenantId || !cfg.clientId || !cfg.clientSecret) {
      return res.end(JSON.stringify({ type:'result', success:false, message:'Dataverse config incomplete' })+'\n');
    }

    const client = new DataverseClient({
      dataverseUrl: cfg.serverUrl,
      tenantId: cfg.tenantId,
      clientId: cfg.clientId,
      clientSecret: cfg.clientSecret
    });

    // 1) Ensure publisher + solution exist; get canonical unique name
    log('INFO', `Ensuring solution '${solutionName}' (publisher ${publisherPrefix})...`);
    const solutionInfo = await client.ensureSolution({
      solutionUniqueName: solutionName,
      solutionFriendlyName: solutionDisplayName || solutionName,
      publisherName: publisherName || 'Mermaid Publisher',
      publisherUniqueName: (publisherName || 'MermaidPublisher').replace(/\s+/g, ''),
      publisherPrefix
    });
    const canonicalSolution = solutionInfo.uniqueName || solutionName;
    log('INFO', `Solution ready: ${canonicalSolution}`);

    // 2) CDM integration (only add existing entities to solution)
    let cdmIntegrated = { success:true, count:0, items:[] };
    if (cdmChoice === 'cdm') {
      log('INFO', `CDM mode: integrating entities into '${canonicalSolution}'`);
      let matches = Array.isArray(cdmMatches) ? cdmMatches : [];
      if (!matches.length || matches.some(m => !m?.cdmEntity?.logicalName)) {
        // fallback: detect server-side if registry exists in client
        if (typeof client.detectCDMEntities === 'function') {
          const det = await client.detectCDMEntities(erdEntities);
          matches = det?.detectedCDM || det?.matches || [];
          log('INFO', `Server-side CDM detection: ${matches.length} match(es)`);
        }
      }
      const onlyLogical = matches
        .map(m => m?.cdmEntity?.logicalName)
        .filter(Boolean);

      if (onlyLogical.length) {
        const resCDM = await client.integrateCDMEntities(
          onlyLogical.map(l => ({ cdmEntity: { logicalName: l }})),
          canonicalSolution
        );
        cdmIntegrated = {
          success: !!resCDM?.success,
          count: resCDM?.summary?.successfulIntegrations || 0,
          items: resCDM?.integratedEntities || []
        };
        log('INFO', `CDM integrated: ${cdmIntegrated.count}`);
      } else {
        log('WARN', 'No valid CDM matches found to integrate.');
      }
    }

    // 3) Create custom entities + attributes + relationships for the rest
    //    (If you want "CDM only", front-end should send no non-CDM entities)
    const customEntities = erdEntities.filter(e => {
      const lower = (e.name || '').toLowerCase();
      // crude filter: exclude CDM matches by name if present in matches list
      return !(cdmChoice === 'cdm' && (['task','contact','account','lead','case','opportunity','activity'].includes(lower)));
    });

    let created = { entities:0, relationships:0, errors:[] };
    if (customEntities.length) {
      log('INFO', `Creating ${customEntities.length} custom entities...`);
      const resCreate = await client.createCustomEntities(customEntities, canonicalSolution, {
        publisherPrefix,
        relationships: erdRelationships || []
      });
      created = {
        entities: resCreate?.summary?.entitiesCreated || 0,
        relationships: resCreate?.summary?.relationshipsCreated || 0,
        errors: resCreate?.errors || []
      };
      log('INFO', `Custom entities created: ${created.entities}, relationships: ${created.relationships}`);
    } else {
      log('INFO', 'No custom entities to create.');
    }

    const final = {
      type: 'result',
      success: true,
      summary: `CDM: ${cdmIntegrated.count} integrated; Custom: ${created.entities} entities, ${created.relationships} relationships`,
      entitiesCreated: created.entities,
      relationshipsCreated: created.relationships,
      cdmEntitiesIntegrated: cdmIntegrated.items || []
    };
    res.end(JSON.stringify(final) + '\n');
  } catch (e) {
    try { res.write(JSON.stringify({ type:'log', message:`[ERROR] ${e.message}` })+'\n'); } catch {}
    res.end(JSON.stringify({ type:'result', success:false, message: e.message || 'Deployment failed' })+'\n');
  }
}

// --- HTTP server --------------------------------------------------------------
const server = http.createServer(async (req, res) => {
  const { pathname } = url.parse(req.url, true);

  if (req.method === 'GET' && pathname === '/') {
    res.writeHead(302, { Location: '/wizard' }); return res.end();
  }
  if (req.method === 'GET' && pathname === '/wizard') return serveWizard(res);
  if (req.method === 'GET' && pathname === '/health') {
    return okJSON(res, { status:'healthy', time: new Date().toISOString() });
  }
  if (req.method === 'POST' && pathname === '/api/validate-erd') return handleValidateErd(req, res);
  if (req.method === 'POST' && pathname === '/upload') return handleUpload(req, res);

  badJSON(res, 404, { error:'Not Found' });
});

const port = Number(process.env.PORT || 3000);
server.listen(port, '0.0.0.0', () => {
  console.log(`Server listening on http://0.0.0.0:${port}`);
});

module.exports = server;
