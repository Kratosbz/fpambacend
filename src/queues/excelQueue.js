'use strict';
const excelService = require('../services/excelService');

const _memJobs  = new Map();
let   _jobCtr   = 1;
let   _bull     = null;
let   _bullFailed = false;

async function _getBull() {
  if (_bullFailed) return null;
  if (_bull) return _bull;

  const { isRedisAvailable, getRedis } = require('../config/redis');
  if (!isRedisAvailable()) return null;

  try {
    const Bull = require('bull');
    _bull = new Bull('excel', { createClient: () => getRedis() });
    _bull.process(async (job) => {
      const buf = Buffer.from(job.data.buffer, 'base64');
      return excelService.parseBuffer(buf, job.data.mimeType);
    });
    _bull.on('error', (err) => console.error('[Excel Queue]', err.message));
    return _bull;
  } catch (e) {
    console.warn('[Excel Queue] Bull unavailable:', e.message);
    _bullFailed = true;
    return null;
  }
}

async function enqueueExcel(buffer, mimeType) {
  const q = await _getBull();
  if (q) {
    const job = await q.add({ buffer: buffer.toString('base64'), mimeType }, { attempts: 1 });
    return String(job.id);
  }
  const jobId = String(_jobCtr++);
  _memJobs.set(jobId, { state: 'active' });
  setImmediate(async () => {
    try {
      const result = await excelService.parseBuffer(buffer, mimeType);
      _memJobs.set(jobId, { state: 'completed', result });
    } catch (err) {
      _memJobs.set(jobId, { state: 'failed', failReason: err.message });
    }
  });
  return jobId;
}

async function getJobStatus(jobId) {
  const q = await _getBull();
  if (q) {
    const job = await q.getJob(jobId).catch(() => null);
    if (!job) return _memJobs.get(jobId) ? { jobId, ..._memJobs.get(jobId) } : null;
    const state = await job.getState();
    return { jobId, state, result: state === 'completed' ? job.returnvalue : null };
  }
  const job = _memJobs.get(jobId);
  return job ? { jobId, ...job } : null;
}

module.exports = { enqueueExcel, getJobStatus };
