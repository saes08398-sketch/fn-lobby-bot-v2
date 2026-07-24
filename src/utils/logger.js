/**
 * Simple logger with timestamps
 */
const createLogger = (prefix) => ({
  info: (...args) => console.log(`[${new Date().toISOString()}] [${prefix}] INFO:`, ...args),
  warn: (...args) => console.warn(`[${new Date().toISOString()}] [${prefix}] WARN:`, ...args),
  error: (...args) => console.error(`[${new Date().toISOString()}] [${prefix}] ERROR:`, ...args),
  debug: (...args) => console.log(`[${new Date().toISOString()}] [${prefix}] DEBUG:`, ...args)
});

module.exports = { createLogger };
