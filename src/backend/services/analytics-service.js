const { DeploymentHistoryService } = require('./deployment-history-service');

// Lazy-initialize deployment history service to avoid heavy initialization during module load
let _dhs = null;
function getDhs() {
  if (!_dhs) {
    _dhs = new DeploymentHistoryService();
  }
  return _dhs;
}

async function getDeploymentTrends() {
  // Query deployment history and return aggregated counts per day (last 30 days)
  const all = await getDhs().getAllDeploymentsFromAllEnvironments();
  const byDay = {};
  const now = Date.now();
  const msPerDay = 24 * 60 * 60 * 1000;

  all.forEach(d => {
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
  const total = all.length;
  const success = all.filter(d => String(d.status).toLowerCase() === 'succeeded').length;
  return { total, success, successRate: total === 0 ? 0 : success / total };
}

async function getRollbackFrequency() {
  const all = await getDhs().getAllDeploymentsFromAllEnvironments();
  const rollbacks = all.filter(d => String(d.status).toLowerCase() === 'rolled-back' || String(d.status).toLowerCase() === 'rolled back').length;
  return { total: all.length, rollbacks, rollbackRate: all.length === 0 ? 0 : rollbacks / all.length };
}

module.exports = {
  getDeploymentTrends,
  getSuccessRates,
  getRollbackFrequency
};
