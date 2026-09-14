'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { WebSocketServer } = require('ws');
const { createConfig } = require('./config');
const { createLogger } = require('./logger');
const { toPublicError, AppError } = require('./errors');
const { SessionManager } = require('./session/sessionManager');
const { ConversationManager } = require('./conversation/conversationManager');
const { createProviders } = require('./providers');
const { VoiceAgent } = require('./pipeline/voiceAgent');

const PUBLIC_DIR = path.join(process.cwd(), 'frontend');

function createApp() {
  const config = createConfig();
  const logger = createLogger(config.logLevel);
  const sessions = new SessionManager();
  const conversation = new ConversationManager({ maxHistoryMessages: config.maxHistoryMessages });
  const providers = createProviders(config);
  const agent = new VoiceAgent({ sessions, conversation, providers, logger });

  async function route(req, res) {
    try {
      const url = new URL(req.url, `http://${req.headers.host}`);
      if (req.method === 'GET' && url.pathname === '/api/health') {
        return sendJson(res, 200, { ok: true, providers: config.providers });
      }
      if (req.method === 'POST' && url.pathname === '/api/sessions') {
        const body = await readJson(req);
        const session = sessions.create({ voiceGender: body.voiceGender || config.defaultVoiceGender });
        logger.info({ event: 'session_created', sessionId: session.id });
        return sendJson(res, 201, { session });
      }
      if (req.method === 'POST' && url.pathname === '/api/turns') {
        const body = await readJson(req, 25 * 1024 * 1024);
        const audioBuffer = Buffer.from(body.audioBase64 || '', 'base64');
        const result = await agent.processTurn({
          sessionId: body.sessionId,
          audioBuffer,
          mimeType: body.mimeType,
          voiceGender: body.voiceGender
        });
        return sendJson(res, 200, result);
      }
      if (req.method === 'POST' && url.pathname === '/api/text-turns') {
        const body = await readJson(req);
        const result = await agent.processTextTurn({
          sessionId: body.sessionId,
          transcript: body.transcript,
          voiceGender: body.voiceGender,
          synthesize: body.synthesize === true
        });
        return sendJson(res, 200, result);
      }
      if (req.method === 'POST' && url.pathname === '/api/interrupt') {
        const body = await readJson(req);
        const session = sessions.require(body.sessionId);
        sessions.interrupt(session);
        logger.info({ event: 'session_interrupted', sessionId: session.id });
        return sendJson(res, 200, { session });
      }
      if (req.method === 'DELETE' && url.pathname.startsWith('/api/sessions/')) {
        const id = decodeURIComponent(url.pathname.split('/').pop());
        sessions.end(id);
        return sendJson(res, 200, { ok: true });
      }
      return serveStatic(req, res);
    } catch (error) {
      const status = error.statusCode || (error instanceof AppError ? error.statusCode : 500);
      logger.error({ event: 'request_failed', path: req.url, error: error.message });
      return sendJson(res, status, toPublicError(error));
    }
  }

  return { route, config, logger, sessions, agent };
}

function readJson(req, maxBytes = 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > maxBytes) {
        reject(new AppError('Request body is too large.', 413, 'BODY_TOO_LARGE'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        reject(new AppError('Invalid JSON body.', 400, 'BAD_JSON'));
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res, status, body) {
  const json = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(json),
    'Cache-Control': 'no-store'
  });
  res.end(json);
}

function serveStatic(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const requestPath = url.pathname === '/' ? '/index.html' : url.pathname;
  const filePath = path.normalize(path.join(PUBLIC_DIR, requestPath));
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    return res.end('Forbidden');
  }
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    res.writeHead(404);
    return res.end('Not found');
  }
  const ext = path.extname(filePath);
  const type = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.svg': 'image/svg+xml'
  }[ext] || 'application/octet-stream';
  res.writeHead(200, {
    'Content-Type': type,
    'Cache-Control': 'no-store'
  });
  fs.createReadStream(filePath).pipe(res);
}

if (require.main === module) {
  const app = createApp();
  const server = http.createServer(app.route);
  
  const wss = new WebSocketServer({ server });
  
  wss.on('connection', (ws) => {
    let session = null;
    let audioChunks = [];
    let currentMimeType = null;
    
    ws.on('message', async (message, isBinary) => {
      if (isBinary) {
        if (session) audioChunks.push(message);
        return;
      }
      
      try {
        const data = JSON.parse(message.toString());
        if (data.type === 'init') {
          session = app.sessions.require(data.sessionId);
        } else if (data.type === 'start_turn') {
          audioChunks = [];
          currentMimeType = data.mimeType;
        } else if (data.type === 'end_turn') {
          if (!session) return;
          const finalBuffer = Buffer.concat(audioChunks);
          audioChunks = [];
          
          try {
            const result = await app.agent.processTurn({
              sessionId: session.id,
              audioBuffer: finalBuffer,
              mimeType: currentMimeType,
              voiceGender: session.voiceGender
            });
            ws.send(JSON.stringify({ type: 'turn_result', result }));
          } catch (err) {
            ws.send(JSON.stringify({ type: 'error', error: err.message }));
          }
        } else if (data.type === 'text_turn') {
          if (!session) return;
          try {
            const result = await app.agent.processTextTurn({
              sessionId: session.id,
              transcript: data.transcript,
              voiceGender: session.voiceGender,
              synthesize: data.synthesize
            });
            ws.send(JSON.stringify({ type: 'turn_result', result }));
          } catch (err) {
            ws.send(JSON.stringify({ type: 'error', error: err.message }));
          }
        }
      } catch (err) {
        app.logger.error({ event: 'ws_error', error: err.message });
      }
    });
  });

  server.listen(app.config.port, app.config.host, () => {
    app.logger.info({
      event: 'server_started',
      url: `http://${app.config.host}:${app.config.port}`
    });
  });
}

module.exports = { createApp, readJson };
