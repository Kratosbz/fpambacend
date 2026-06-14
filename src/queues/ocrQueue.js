'use strict';
const ocrService = require('../services/ocrService');

// In-memory fallback
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
    _bull = new Bull('ocr', { createClient: () => getRedis() });
    _bull.process(async (job) => {
      const buf         = Buffer.from(job.data.buffer, 'base64');
      const text        = await ocrService.extractText(buf, job.data.mimeType);
      const suggestions = ocrService.suggestFields(text);
      return { text, suggestions };
    });
    _bull.on('error', (err) => { console.error('[OCR Queue]', err.message); });
    return _bull;
  } catch (e) {
    console.warn('[OCR Queue] Bull unavailable, using sync fallback:', e.message);
    _bullFailed = true;
    return null;
  }
}

async function enqueueOCR(buffer, mimeType) {
  const q = await _getBull();
  if (q) {
    const job = await q.add(
      { buffer: buffer.toString('base64'), mimeType },
      { attempts: 2, backoff: { type: 'exponential', delay: 3000 } }
    );
    return String(job.id);
  }

  // Synchronous in-memory fallback
  const jobId = String(_jobCtr++);
  _memJobs.set(jobId, { state: 'active' });
  setImmediate(async () => {
    try {
      const text        = await ocrService.extractText(buffer, mimeType);
      const suggestions = ocrService.suggestFields(text);
      _memJobs.set(jobId, { state: 'completed', result: { text, suggestions } });
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
    return {
      jobId,
      state,
      result:     state === 'completed' ? job.returnvalue  : null,
      failReason: state === 'failed'    ? job.failedReason : null,
    };
  }
  const job = _memJobs.get(jobId);
  return job ? { jobId, ...job } : null;
}

module.exports = { enqueueOCR, getJobStatus };
