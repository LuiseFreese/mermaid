/**
 * CDM Integrator
 * Adds existing Common Data Model (CDM) entities to a Dataverse solution.
 * Robust against case differences in solution unique names and avoids the
 * legacy AddSolutionComponent action by posting to /solutioncomponents with
 * a solutionid@odata.bind payload.
 */

class CDMIntegrator {
  /**
   * @param {object} client DataverseClient instance exposing makeRequest(method, url, body?)
   */
  constructor(client) {
    this.client = client;
  }

  /**
   * Resolve a solution reference from a string (unique/friendly name) or an object.
   * @param {string|object} solutionRef
   * @returns {Promise<{id:string, uniqueName:string, friendlyName?:string}>}
   */
  async resolveSolution(solutionRef) {
    if (!solutionRef) throw new Error("No solution reference provided");

    // If caller passed the object, trust it.
    if (typeof solutionRef === "object") {
      const id = solutionRef.id || solutionRef.solutionid || (solutionRef.solution && (solutionRef.solution.solutionid || solutionRef.solution.id));
      const uniqueName = solutionRef.uniqueName || solutionRef.uniquename || (solutionRef.solution && (solutionRef.solution.uniquename || solutionRef.solution.uniqueName));
      const friendlyName = solutionRef.friendlyName || solutionRef.friendlyname || (solutionRef.solution && (solutionRef.solution.friendlyname || solutionRef.solution.friendlyName));
      if (id && uniqueName) return { id, uniqueName, friendlyName };
    }

    const name = String(solutionRef).trim();
    if (!name) throw new Error("Empty solution name");

    const enc = (s) => s.replace(/'/g, "''");
    const select = "$select=solutionid,uniquename,friendlyname";

    // 1) exact unique name
    let resp = await this.client.makeRequest("GET", `/solutions?${select}&$filter=uniquename eq '${enc(name)}'`);
    let arr = resp && (resp.value || resp.Value || []);
    if (!Array.isArray(arr)) arr = [];

    // 2) case-insensitive unique name
    if (arr.length === 0) {
      resp = await this.client.makeRequest("GET", `/solutions?${select}&$filter=tolower(uniquename) eq '${enc(name.toLowerCase())}'`);
      arr = resp && (resp.value || resp.Value || []);
      if (!Array.isArray(arr)) arr = [];
    }

    // 3) exact friendly name
    if (arr.length === 0) {
      resp = await this.client.makeRequest("GET", `/solutions?${select}&$filter=friendlyname eq '${enc(name)}'`);
      arr = resp && (resp.value || resp.Value || []);
      if (!Array.isArray(arr)) arr = [];
    }

    // 4) fallback: fetch a page and match locally
    if (arr.length === 0) {
      resp = await this.client.makeRequest("GET", `/solutions?${select}&$top=200`);
      const all = (resp && (resp.value || resp.Value)) || [];
      const found = all.find(s => {
        const uniq = (s.uniquename || s.uniqueName || "").toLowerCase();
        const fr = (s.friendlyname || s.friendlyName || "").toLowerCase();
        const target = name.toLowerCase();
        return uniq === target || fr === target;
      });
      if (found) arr = [found];
    }

    if (arr.length === 0) {
      throw new Error(`Solution '${name}' not found (after robust lookup).`);
    }

    const sol = arr[0];
    const id = sol.solutionid || sol.SolutionId || sol.solutionid_guid;
    const uniqueName = sol.uniquename || sol.uniqueName;
    const friendlyName = sol.friendlyname || sol.friendlyName;

    if (!id || !uniqueName) {
      throw new Error(`Solution lookup returned incomplete data for '${name}'.`);
    }

    return { id, uniqueName, friendlyName };
  }

  /**
   * Add a single CDM entity (by logical name) to the given solution.
   * @param {string} logicalName e.g. 'contact'
   * @param {string|object} solutionRef unique name or solution object {id, uniqueName}
   * @returns {Promise<{added:boolean, alreadyPresent:boolean, metadataId?:string}>}
   */
  async addCDMEntityToSolution(logicalName, solutionRef) {
    const name = (logicalName || "").trim().toLowerCase();
    if (!name) throw new Error("cdm logical name is empty");

    // Resolve solution once
    const solution = await this.resolveSolution(solutionRef);
    console.log(`🔍 addCDMEntityToSolution('${name}') into solution '${solution.uniqueName}' (${solution.id})`);

    // 1) fetch entity MetadataId
    const metaResp = await this.client.makeRequest("GET", `/EntityDefinitions(LogicalName='${name}')?$select=MetadataId`);
    const metadataId = metaResp && (metaResp.MetadataId || metaResp.metadataid);
    if (!metadataId) {
      throw new Error(`Could not resolve MetadataId for entity '${name}'.`);
    }

    // 2) check if this exact component is already in the *target* solution
    const existing = await this.client.makeRequest(
      "GET",
      `/solutioncomponents?$select=solutioncomponentid,componenttype,componentid&` +
      `$filter=componenttype eq 1 and componentid eq ${metadataId.toString().startsWith("guid'") ? metadataId : `guid'${metadataId}'`} and solutionid/solutionid eq ${`guid'${solution.id}'`}`
    );
    const items = (existing && (existing.value || existing.Value)) || [];
    if (Array.isArray(items) && items.length > 0) {
      console.log(`ℹ️ Entity '${name}' already present in solution '${solution.uniqueName}'.`);
      return { added: false, alreadyPresent: true, metadataId };
    }

    // 3) create solutioncomponent row (componenttype 1 = Entity)
    const payload = {
      // NOTE: property names must be lower-case with Web API
      componenttype: 1,
      componentid: metadataId,
      "solutionid@odata.bind": `/solutions(${solution.id})`
    };

    await this.client.makeRequest("POST", "/solutioncomponents", payload);
    console.log(`✅ Added '${name}' (MetadataId ${metadataId}) to solution '${solution.uniqueName}'.`);

    return { added: true, alreadyPresent: false, metadataId };
  }

  /**
   * Integrate a set of CDM matches into a solution.
   * @param {Array} cdmMatches array of { cdmEntity: { logicalName }, originalEntity: {...} }
   * @param {string|object} solutionRef unique name or solution object
   * @returns {Promise<{success:boolean, integratedEntities:Array, summary:Object, errors:Array}>}
   */
  async integrateCDMEntities(cdmMatches, solutionRef) {
    if (!Array.isArray(cdmMatches) || cdmMatches.length === 0) {
      return { success: false, integratedEntities: [], summary: { successfulIntegrations: 0, failedIntegrations: 0, relationshipsCreated: 0 }, errors: ["No CDM matches provided"] };
    }

    // Resolve once and reuse
    let solution;
    try {
      solution = await this.resolveSolution(solutionRef);
      console.log(`📦 Target solution: ${solution.uniqueName} (${solution.id})`);
    } catch (e) {
      return { success: false, integratedEntities: [], summary: { successfulIntegrations: 0, failedIntegrations: cdmMatches.length, relationshipsCreated: 0 }, errors: [e.message] };
    }

    const integrated = [];
    const errors = [];

    for (const match of cdmMatches) {
      const logical = match?.cdmEntity?.logicalName || match?.logicalName || match?.cdm?.logicalName;
      if (!logical) {
        errors.push("Match missing cdmEntity.logicalName");
        continue;
      }
      try {
        const r = await this.addCDMEntityToSolution(logical, solution);
        integrated.push({ logicalName: logical, added: r.added, alreadyPresent: r.alreadyPresent, metadataId: r.metadataId });
      } catch (err) {
        console.error(`❌ Failed to add '${logical}': ${err.message}`);
        errors.push(`${logical}: ${err.message}`);
      }
    }

    // No automatic relationship creation for now
    const summary = {
      successfulIntegrations: integrated.filter(x => x.added || x.alreadyPresent).length,
      failedIntegrations: errors.length,
      relationshipsCreated: 0
    };

    return { success: errors.length === 0, integratedEntities: integrated, summary, errors };
  }
}

module.exports = CDMIntegrator;
