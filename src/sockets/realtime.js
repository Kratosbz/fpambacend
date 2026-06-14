'use strict';
const jwt = require('jsonwebtoken');
const env = require('../config/env');

let _io = null;

function initRealtime(server) {
  const { Server } = require('socket.io');
  _io = new Server(server, {
    cors: { origin: env.CLIENT_URL, methods: ['GET', 'POST'] },
  });

  // Auth middleware
  _io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error('No token'));
    try {
      const payload = jwt.verify(token, env.JWT_SECRET);
      socket.userId = payload.sub;
      socket.role   = payload.role;
      next();
    } catch {
      next(new Error('Invalid token'));
    }
  });

  _io.on('connection', (socket) => {
    socket.join(`user:${socket.userId}`);
    if (socket.role === 'System Admin' || socket.role === 'GIS Analyst') {
      socket.join('dashboard');
    }
    socket.on('disconnect', () => {});
  });

  return _io;
}

function getIO() { return _io; }

// Helper emitters
function emitNewAsset(asset) {
  _io?.to('dashboard').emit('asset:created', {
    assetId: asset.assetId, name: asset.name, type: asset.type, state: asset.state,
  });
}

function emitJobProgress(userId, jobId, progress) {
  _io?.to(`user:${userId}`).emit('job:progress', { jobId, progress });
}

function emitJobComplete(userId, jobId, result) {
  _io?.to(`user:${userId}`).emit('job:complete', { jobId, result });
}

module.exports = { initRealtime, getIO, emitNewAsset, emitJobProgress, emitJobComplete };
