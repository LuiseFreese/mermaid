/**
 * Logger Utility
 * Centralized logging for the backend services
 */

const logLevels = {
    error: 0,
    warn: 1,
    info: 2,
    debug: 3
};

class Logger {
    constructor(name = 'App', level = 'info') {
        this.name = name;
        this.level = process.env.LOG_LEVEL || level;
        this.levelValue = this.level in logLevels ? logLevels[this.level] : logLevels.info;
    }

    /**
     * Format log message with timestamp and context
     */
    formatMessage(level, message, context = {}) {
        const timestamp = new Date().toISOString();
        const safeContext = context && typeof context === 'object' ? context : {};
        const contextStr = Object.keys(safeContext).length > 0 ? ` ${JSON.stringify(safeContext)}` : '';
        return `[${timestamp}] ${level.toUpperCase()} [${this.name}]: ${message}${contextStr}`;
    }

    /**
     * Check if log level should be output
     */
    shouldLog(level) {
        return logLevels[level] <= this.levelValue;
    }

    /**
     * Log error messages
     */
    error(message, context = {}) {
        if (this.shouldLog('error')) {
            console.error(this.formatMessage('error', message, context));
        }
    }

    /**
     * Log warning messages
     */
    warn(message, context = {}) {
        if (this.shouldLog('warn')) {
            console.warn(this.formatMessage('warn', message, context));
        }
    }

    /**
     * Log info messages
     */
    info(message, context = {}) {
        if (this.shouldLog('info')) {
            console.info(this.formatMessage('info', message, context));
        }
    }

    /**
     * Log debug messages
     */
    debug(message, context = {}) {
        if (this.shouldLog('debug')) {
            console.debug(this.formatMessage('debug', message, context));
        }
    }

    /**
     * General log method (alias for info)
     */
    log(message, context = {}) {
        this.info(message, context);
    }
}

/**
 * Create a logger instance
 */
function createLogger(name, level) {
    return new Logger(name, level);
}

// Export default logger instance
const defaultLogger = new Logger();

module.exports = {
    Logger,
    createLogger,
    default: defaultLogger,
    // For CommonJS compatibility
    error: defaultLogger.error.bind(defaultLogger),
    warn: defaultLogger.warn.bind(defaultLogger),
    info: defaultLogger.info.bind(defaultLogger),
    debug: defaultLogger.debug.bind(defaultLogger),
    log: defaultLogger.log.bind(defaultLogger)
};
