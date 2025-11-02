const { BaseController } = require('./base-controller');
const { DeploymentHistoryService } = require('../services/deployment-history-service');

class SearchController extends BaseController {
  constructor(deps = {}) {
    super();
    // Allow injection of an existing deploymentHistoryService, otherwise create one
    this.deploymentHistoryService = deps.deploymentHistoryService || new DeploymentHistoryService();
  }

  async searchDeployments(req, res) {
    try {
      const url = new URL(req.url, 'http://localhost');
      const params = url.searchParams;
      const status = params.get('status');
      const environment = params.get('environment');
      const from = params.get('from');
      const to = params.get('to');
      const limit = parseInt(params.get('limit') || '50', 10);

      // Get all deployments across environments
      const all = await this.deploymentHistoryService.getAllDeploymentsFromAllEnvironments();
      let filtered = all;

      if (status) filtered = filtered.filter(d => String(d.status).toLowerCase() === String(status).toLowerCase());
      if (environment) filtered = filtered.filter(d => d.environmentId === environment || d.environmentSuffix === environment || d.environmentName === environment);
      if (from) filtered = filtered.filter(d => new Date(d.timestamp || d.createdAt) >= new Date(from));
      if (to) filtered = filtered.filter(d => new Date(d.timestamp || d.createdAt) <= new Date(to));

      // Sort newest first
      filtered = filtered.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

      const data = filtered.slice(0, Math.min(limit, 1000));
      this.sendSuccess(res, { count: data.length, data });
    } catch (err) {
      console.error('Search error', err);
      this.sendInternalError(res, 'Failed to search deployments', err);
    }
  }
}

module.exports = { SearchController };
