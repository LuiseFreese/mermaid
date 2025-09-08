/**
 * Unit tests for Logger utility
 * Tests logging functionality and levels
 */

const { Logger, createLogger } = require('../../../src/backend/utils/logger');

describe('Logger', () => {
  let originalLogLevel;

  beforeEach(() => {
    // Save original LOG_LEVEL
    originalLogLevel = process.env.LOG_LEVEL;
  });

  afterEach(() => {
    // Restore original LOG_LEVEL
    process.env.LOG_LEVEL = originalLogLevel;
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    test('should initialize with name and level', () => {
      // Temporarily override LOG_LEVEL
      process.env.LOG_LEVEL = 'info';
      
      const logger = new Logger('Test', 'info');
      expect(logger.name).toBe('Test');
      expect(logger.level).toBe('info');
    });

    test('should use default values', () => {
      process.env.LOG_LEVEL = 'info';
      
      const defaultLogger = new Logger();
      expect(defaultLogger.name).toBe('App');
      expect(defaultLogger.level).toBe('info');
    });

    test('should respect LOG_LEVEL environment variable', () => {
      process.env.LOG_LEVEL = 'debug';
      
      const envLogger = new Logger('EnvTest', 'info');
      expect(envLogger.level).toBe('debug');
    });

    test('should fall back to constructor level when LOG_LEVEL is undefined', () => {
      delete process.env.LOG_LEVEL;
      
      const logger = new Logger('Test', 'warn');
      expect(logger.level).toBe('warn');
    });
  });

  describe('formatMessage', () => {
    test('should format message with timestamp and level', () => {
      process.env.LOG_LEVEL = 'info';
      const logger = new Logger('Test', 'info');
      
      const message = logger.formatMessage('info', 'Test message');
      
      expect(message).toMatch(/^\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\] INFO \[Test\]: Test message$/);
    });

    test('should include context when provided', () => {
      process.env.LOG_LEVEL = 'info';
      const logger = new Logger('Test', 'info');
      
      const message = logger.formatMessage('info', 'Test message', { userId: 123 });
      
      expect(message).toContain('Test message {"userId":123}');
    });

    test('should handle empty context', () => {
      process.env.LOG_LEVEL = 'info';
      const logger = new Logger('Test', 'info');
      
      const message = logger.formatMessage('info', 'Test message', {});
      
      expect(message).not.toContain('{}');
      expect(message).toContain('Test message');
    });
  });

  describe('shouldLog', () => {
    test('should respect log levels - debug level', () => {
      process.env.LOG_LEVEL = 'debug';
      const debugLogger = new Logger('Debug', 'debug');
      
      expect(debugLogger.shouldLog('error')).toBe(true);
      expect(debugLogger.shouldLog('warn')).toBe(true);
      expect(debugLogger.shouldLog('info')).toBe(true);
      expect(debugLogger.shouldLog('debug')).toBe(true);
    });

    test('should respect log levels - info level', () => {
      process.env.LOG_LEVEL = 'info';
      const infoLogger = new Logger('Info', 'info');
      
      expect(infoLogger.shouldLog('error')).toBe(true);
      expect(infoLogger.shouldLog('warn')).toBe(true);
      expect(infoLogger.shouldLog('info')).toBe(true);
      expect(infoLogger.shouldLog('debug')).toBe(false);
    });

    test('should respect log levels - error level', () => {
      process.env.LOG_LEVEL = 'error';
      const errorLogger = new Logger('Error', 'debug'); // Constructor level ignored when LOG_LEVEL is set
      
      expect(errorLogger.shouldLog('error')).toBe(true);
      expect(errorLogger.shouldLog('warn')).toBe(false);
      expect(errorLogger.shouldLog('info')).toBe(false);
      expect(errorLogger.shouldLog('debug')).toBe(false);
    });
  });

  describe('logging methods', () => {
    let mockConsole;

    beforeEach(() => {
      // Mock console methods
      mockConsole = {
        error: jest.fn(),
        warn: jest.fn(),
        info: jest.fn(),
        debug: jest.fn()
      };
      global.console = mockConsole;
    });

    test('should log error messages', () => {
      process.env.LOG_LEVEL = 'debug';
      const logger = new Logger('Test', 'debug');
      
      logger.error('Error message', { code: 'ERR001' });
      
      expect(mockConsole.error).toHaveBeenCalledWith(
        expect.stringContaining('ERROR [Test]: Error message {"code":"ERR001"}')
      );
    });

    test('should log warning messages', () => {
      process.env.LOG_LEVEL = 'debug';
      const logger = new Logger('Test', 'debug');
      
      logger.warn('Warning message');
      
      expect(mockConsole.warn).toHaveBeenCalledWith(
        expect.stringContaining('WARN [Test]: Warning message')
      );
    });

    test('should log info messages', () => {
      process.env.LOG_LEVEL = 'debug';
      const logger = new Logger('Test', 'debug');
      
      logger.info('Info message');
      
      expect(mockConsole.info).toHaveBeenCalledWith(
        expect.stringContaining('INFO [Test]: Info message')
      );
    });

    test('should log debug messages', () => {
      process.env.LOG_LEVEL = 'debug';
      const logger = new Logger('Test', 'debug');
      
      logger.debug('Debug message');
      
      expect(mockConsole.debug).toHaveBeenCalledWith(
        expect.stringContaining('DEBUG [Test]: Debug message')
      );
    });

    test('should use log as alias for info', () => {
      process.env.LOG_LEVEL = 'debug';
      const logger = new Logger('Test', 'debug');
      
      logger.log('Log message');
      
      expect(mockConsole.info).toHaveBeenCalledWith(
        expect.stringContaining('INFO [Test]: Log message')
      );
    });
  });

  describe('log level filtering', () => {
    let mockConsole;

    beforeEach(() => {
      mockConsole = {
        error: jest.fn(),
        warn: jest.fn(),
        info: jest.fn(),
        debug: jest.fn()
      };
      global.console = mockConsole;
    });

    test('should not log messages below threshold', () => {
      process.env.LOG_LEVEL = 'warn';
      const warnLogger = new Logger('Warn', 'warn');
      
      warnLogger.debug('Debug message');
      warnLogger.info('Info message');
      
      expect(mockConsole.debug).not.toHaveBeenCalled();
      expect(mockConsole.info).not.toHaveBeenCalled();
    });

    test('should log messages at or above threshold', () => {
      process.env.LOG_LEVEL = 'warn';
      const warnLogger = new Logger('Warn', 'warn');
      
      warnLogger.warn('Warn message');
      warnLogger.error('Error message');
      
      expect(mockConsole.warn).toHaveBeenCalled();
      expect(mockConsole.error).toHaveBeenCalled();
    });
  });

  describe('createLogger function', () => {
    test('should create logger instance', () => {
      process.env.LOG_LEVEL = 'error';
      const customLogger = createLogger('Custom', 'error');
      
      expect(customLogger).toBeInstanceOf(Logger);
      expect(customLogger.name).toBe('Custom');
      expect(customLogger.level).toBe('error');
    });
  });

  describe('edge cases', () => {
    test('should handle unknown log level', () => {
      process.env.LOG_LEVEL = 'invalid';
      const unknownLogger = new Logger('Unknown', 'invalid');
      
      // Should default to info level
      expect(unknownLogger.shouldLog('info')).toBe(true);
      expect(unknownLogger.shouldLog('debug')).toBe(false);
    });

    test('should handle null/undefined context', () => {
      process.env.LOG_LEVEL = 'debug';
      const logger = new Logger('Test', 'debug');
      
      expect(() => {
        logger.info('Test message', null);
      }).not.toThrow();
      
      expect(() => {
        logger.info('Test message', undefined);
      }).not.toThrow();
    });
  });
});
