const { DeploymentHistoryService } = require('./deployment-history-service');

// Lazy-initialize deployment history service to avoid heavy initialization during module load
let _dhs = null;
function getDhs() {
  if (!_dhs) {
    _dhs = new DeploymentHistoryService();
  }
  return _dhs;
}

// Helper function to determine if a deployment is a rollback operation
function isRollbackOperation(deployment) {
  const status = String(deployment.status || '').toLowerCase();
  const operationType = String(deployment.summary?.operationType || '').toLowerCase();
  const deploymentMethod = String(deployment.metadata?.deploymentMethod || '').toLowerCase();
  
  // Check for rollback status OR rollback operation type
  return status === 'rolled-back' || 
         status === 'rolled back' || 
         status === 'rollback' ||
         operationType === 'rollback' ||
         deploymentMethod === 'rollback';
}

async function getDeploymentTrends() {
  // Query deployment history and return aggregated counts per day (last 30 days)
  const all = await getDhs().getAllDeploymentsFromAllEnvironments();
  // Filter out rollback entries - only count actual deployments
  const deployments = all.filter(d => !isRollbackOperation(d));
  
  const byDay = {};
  const now = Date.now();
  const msPerDay = 24 * 60 * 60 * 1000;

  deployments.forEach(d => {
    const ts = new Date(d.timestamp || d.createdAt || now).toISOString().slice(0, 10);
    byDay[ts] = (byDay[ts] || 0) + 1;
  });

  // Build last 30 days array
  const result = [];
  for (let i = 29; i >= 0; i--) {
    const day = new Date(now - i * msPerDay).toISOString().slice(0, 10);
    result.push({ date: day, deployments: byDay[day] || 0 });
  }

  return result;
}

async function getSuccessRates() {
  const all = await getDhs().getAllDeploymentsFromAllEnvironments();
  // Filter out rollback entries - only count actual deployments
  const deployments = all.filter(d => !isRollbackOperation(d));
  const total = deployments.length;
  const success = deployments.filter(d => String(d.status).toLowerCase() === 'success').length;
  return { total, success, successRate: total === 0 ? 0 : success / total };
}

async function getRollbackFrequency() {
  const all = await getDhs().getAllDeploymentsFromAllEnvironments();
  // Filter out rollback entries for total count - only count actual deployments
  const deployments = all.filter(d => !isRollbackOperation(d));
  // Count rollback operations separately
  const rollbacks = all.filter(d => isRollbackOperation(d)).length;
  return { total: deployments.length, rollbacks, rollbackRate: deployments.length === 0 ? 0 : rollbacks / deployments.length };
}

module.exports = {
  getDeploymentTrends,
  getSuccessRates,
  getRollbackFrequency
};
