const { BaseController } = require('./base-controller');
const AnalyticsService = require('../services/analytics-service');

class AnalyticsController extends BaseController {
  constructor(deps = {}) {
    super();
    this.analyticsService = deps.analyticsService || AnalyticsService;
  }

  async getDeploymentTrends(req, res) {
    try {
      const result = await this.analyticsService.getDeploymentTrends();
      this.sendSuccess(res, { data: result });
    } catch (err) {
      console.error('Analytics error:', err);
      this.sendInternalError(res, 'Failed to get deployment trends', err);
    }
  }

  async getSuccessRates(req, res) {
    try {
      const result = await this.analyticsService.getSuccessRates();
      this.sendSuccess(res, { data: result });
    } catch (err) {
      console.error('Analytics error:', err);
      this.sendInternalError(res, 'Failed to get success rates', err);
    }
  }

  async getRollbackFrequency(req, res) {
    try {
      const result = await this.analyticsService.getRollbackFrequency();
      this.sendSuccess(res, { data: result });
    } catch (err) {
      console.error('Analytics error:', err);
      this.sendInternalError(res, 'Failed to get rollback frequency', err);
    }
  }
}

module.exports = { AnalyticsController };
