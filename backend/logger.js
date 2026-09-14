'use strict';

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };

function createLogger(level = 'info') {
  const min = LEVELS[level] || LEVELS.info;
  function write(name, payload) {
    if ((LEVELS[name] || LEVELS.info) < min) return;
    const entry = {
      ts: new Date().toISOString(),
      level: name,
      ...payload
    };
    const line = JSON.stringify(entry);
    if (name === 'error') console.error(line);
    else console.log(line);
  }
  return {
    debug: (payload) => write('debug', payload),
    info: (payload) => write('info', payload),
    warn: (payload) => write('warn', payload),
    error: (payload) => write('error', payload)
  };
}

module.exports = { createLogger };
