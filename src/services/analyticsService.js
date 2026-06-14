'use strict';
const Asset = require('../models/Asset');

async function dashboardKPIs(scopeFilter = {}) {
  const [totals, byCondition, byGeom, recent] = await Promise.all([
    Asset.aggregate([
      { $match: scopeFilter },
      { $group: {
        _id: null,
        total:       { $sum: 1 },
        active:      { $sum: { $cond: [{ $eq: ['$status', 'Active'] }, 1, 0] } },
        critical:    { $sum: { $cond: [{ $eq: ['$condition', 'Critical'] }, 1, 0] } },
        poor:        { $sum: { $cond: [{ $eq: ['$condition', 'Poor'] }, 1, 0] } },
        totalValueNGN: { $sum: '$valuation.amount' },
      }},
    ]),
    Asset.aggregate([
      { $match: scopeFilter },
      { $group: { _id: '$condition', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]),
    Asset.aggregate([
      { $match: scopeFilter },
      { $group: { _id: '$geomType', count: { $sum: 1 } } },
    ]),
    Asset.find(scopeFilter).sort({ createdAt: -1 }).limit(10)
      .populate('capturedBy', 'name').lean(),
  ]);

  return {
    summary:     totals[0] || { total: 0, active: 0, critical: 0, poor: 0, totalValueNGN: 0 },
    byCondition: byCondition.map((r) => ({ condition: r._id, count: r.count })),
    byGeomType:  byGeom.map((r) => ({ geomType: r._id, count: r.count })),
    recentAssets: recent,
  };
}

async function conditionBreakdown(scopeFilter = {}) {
  return Asset.aggregate([
    { $match: scopeFilter },
    { $group: { _id: { type: '$type', condition: '$condition' }, count: { $sum: 1 } } },
    { $group: {
      _id:    '$_id.type',
      conditions: { $push: { condition: '$_id.condition', count: '$count' } },
      total: { $sum: '$count' },
    }},
    { $sort: { total: -1 } },
  ]);
}

async function byType(scopeFilter = {}) {
  return Asset.aggregate([
    { $match: scopeFilter },
    { $group: { _id: '$type', count: { $sum: 1 }, totalValue: { $sum: '$valuation.amount' } } },
    { $sort: { count: -1 } },
  ]);
}

async function byState(scopeFilter = {}) {
  return Asset.aggregate([
    { $match: scopeFilter },
    { $group: { _id: '$state', count: { $sum: 1 } } },
    { $sort: { count: -1 } },
    { $limit: 37 },  // 36 states + FCT
  ]);
}

async function capturesOverTime({ days = 30, scopeFilter = {} } = {}) {
  const since = new Date();
  since.setDate(since.getDate() - days);

  return Asset.aggregate([
    { $match: { ...scopeFilter, createdAt: { $gte: since } } },
    { $group: {
      _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
      count: { $sum: 1 },
    }},
    { $sort: { _id: 1 } },
  ]);
}

async function maintenanceSpend({ assetId } = {}) {
  const match = assetId ? { assetId } : {};
  return Asset.aggregate([
    { $match: match },
    { $unwind: '$maintenanceLogs' },
    { $group: {
      _id:       '$assetId',
      name:      { $first: '$name' },
      totalCost: { $sum: '$maintenanceLogs.cost' },
      logCount:  { $sum: 1 },
    }},
    { $sort: { totalCost: -1 } },
    { $limit: 50 },
  ]);
}

module.exports = { dashboardKPIs, conditionBreakdown, byType, byState, capturesOverTime, maintenanceSpend };
