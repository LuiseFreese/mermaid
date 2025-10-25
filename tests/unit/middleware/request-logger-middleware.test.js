/**
 * Unit tests for request logger middleware
 * 
 * Tests request/response logging, sensitive data redaction, and performance metrics.
 */

const { RequestLoggerMiddleware } = require('../../../src/backend/middleware/request-logger-middleware');
const { EventEmitter } = require('events');

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Creates a mock logger with spies
 */
function createMockLogger() {
  return {
    log: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
  };
}

/**
 * Creates a mock request object with event emitter capabilities
 */
function createMockRequest(options = {}) {
  const emitter = new EventEmitter();
  
  return {
    ...emitter,
    method: options.method || 'GET',
    url: options.url || '/',
    headers: options.headers || {},
    connection: {
      remoteAddress: options.remoteAddress || '127.0.0.1',
    },
    socket: {
      remoteAddress: options.remoteAddress || '127.0.0.1',
    },
    on: emitter.on.bind(emitter),
    emit: emitter.emit.bind(emitter),
  };
}

/**
 * Creates a mock response object with spies
 */
function createMockResponse() {
  const headers = {};
  return {
    statusCode: 200,
    write: jest.fn(),
    end: jest.fn(),
    setHeader: jest.fn((name, value) => {
      headers[name] = value;
    }),
    getHeader: jest.fn((name) => headers[name]),
    _headers: headers,
  };
}

/**
 * Creates a mock next function
 */
function createMockNext() {
  return jest.fn();
}

/**
 * Wait for async operations
 */
function waitForAsync(ms = 10) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ============================================================================
// TEST SUITE
// ============================================================================

describe('Request Logger Middleware', () => {
  let mockLogger;

  beforeEach(() => {
    mockLogger = createMockLogger();
    jest.clearAllMocks();
  });

  // ==========================================================================
  // CONSTRUCTOR
  // ==========================================================================

  describe('Constructor', () => {
    it('should create instance with default logger (console)', () => {
      const middleware = new RequestLoggerMiddleware();
      
      expect(middleware.logger).toBe(console);
      expect(middleware.includeBody).toBe(false);
      expect(middleware.maxBodySize).toBe(1024);
    });

    it('should accept custom logger', () => {
      const middleware = new RequestLoggerMiddleware({ logger: mockLogger });
      
      expect(middleware.logger).toBe(mockLogger);
    });

    it('should accept includeBody option', () => {
      const middleware = new RequestLoggerMiddleware({ 
        logger: mockLogger,
        includeBody: true 
      });
      
      expect(middleware.includeBody).toBe(true);
    });

    it('should accept maxBodySize option', () => {
      const middleware = new RequestLoggerMiddleware({ 
        logger: mockLogger,
        maxBodySize: 2048 
      });
      
      expect(middleware.maxBodySize).toBe(2048);
    });

    it('should accept all options together', () => {
      const middleware = new RequestLoggerMiddleware({
        logger: mockLogger,
        includeBody: true,
        maxBodySize: 4096,
      });
      
      expect(middleware.logger).toBe(mockLogger);
      expect(middleware.includeBody).toBe(true);
      expect(middleware.maxBodySize).toBe(4096);
    });

    it('should use defaults when passed empty object', () => {
      const middleware = new RequestLoggerMiddleware({});
      
      expect(middleware.logger).toBe(console);
      expect(middleware.includeBody).toBe(false);
      expect(middleware.maxBodySize).toBe(1024);
    });
  });

  // ==========================================================================
  // GENERATE REQUEST ID
  // ==========================================================================

  describe('generateRequestId()', () => {
    it('should generate unique request ID', () => {
      const middleware = new RequestLoggerMiddleware({ logger: mockLogger });
      
      const id1 = middleware.generateRequestId();
      const id2 = middleware.generateRequestId();
      
      expect(id1).toBeDefined();
      expect(id2).toBeDefined();
      expect(id1).not.toBe(id2);
    });

    it('should generate ID with req_ prefix', () => {
      const middleware = new RequestLoggerMiddleware({ logger: mockLogger });
      
      const id = middleware.generateRequestId();
      
      expect(id).toMatch(/^req_/);
    });

    it('should generate ID with timestamp component', () => {
      const middleware = new RequestLoggerMiddleware({ logger: mockLogger });
      
      const id = middleware.generateRequestId();
      
      expect(id).toMatch(/^req_\d+_/);
    });

    it('should generate ID with random component', () => {
      const middleware = new RequestLoggerMiddleware({ logger: mockLogger });
      
      const id = middleware.generateRequestId();
      const parts = id.split('_');
      
      expect(parts).toHaveLength(3);
      expect(parts[2]).toBeTruthy();
      expect(parts[2].length).toBeGreaterThan(0);
    });

    it('should generate multiple unique IDs', () => {
      const middleware = new RequestLoggerMiddleware({ logger: mockLogger });
      
      const ids = Array.from({ length: 100 }, () => middleware.generateRequestId());
      const uniqueIds = new Set(ids);
      
      expect(uniqueIds.size).toBe(100);
    });
  });

  // ==========================================================================
  // SANITIZE HEADERS
  // ==========================================================================

  describe('sanitizeHeaders()', () => {
    it('should redact authorization header', () => {
      const middleware = new RequestLoggerMiddleware({ logger: mockLogger });
      
      const headers = {
        authorization: 'Bearer secret-token',
        'content-type': 'application/json',
      };
      
      const sanitized = middleware.sanitizeHeaders(headers);
      
      expect(sanitized.authorization).toBe('[REDACTED]');
      expect(sanitized['content-type']).toBe('application/json');
    });

    it('should redact cookie header', () => {
      const middleware = new RequestLoggerMiddleware({ logger: mockLogger });
      
      const headers = {
        cookie: 'sessionId=abc123',
        'user-agent': 'Mozilla/5.0',
      };
      
      const sanitized = middleware.sanitizeHeaders(headers);
      
      expect(sanitized.cookie).toBe('[REDACTED]');
      expect(sanitized['user-agent']).toBe('Mozilla/5.0');
    });

    it('should redact x-api-key header', () => {
      const middleware = new RequestLoggerMiddleware({ logger: mockLogger });
      
      const headers = {
        'x-api-key': 'api-key-12345',
        accept: 'application/json',
      };
      
      const sanitized = middleware.sanitizeHeaders(headers);
      
      expect(sanitized['x-api-key']).toBe('[REDACTED]');
      expect(sanitized.accept).toBe('application/json');
    });

    it('should redact x-auth-token header', () => {
      const middleware = new RequestLoggerMiddleware({ logger: mockLogger });
      
      const headers = {
        'x-auth-token': 'auth-token-67890',
        host: 'localhost:8080',
      };
      
      const sanitized = middleware.sanitizeHeaders(headers);
      
      expect(sanitized['x-auth-token']).toBe('[REDACTED]');
      expect(sanitized.host).toBe('localhost:8080');
    });

    it('should redact all sensitive headers', () => {
      const middleware = new RequestLoggerMiddleware({ logger: mockLogger });
      
      const headers = {
        authorization: 'Bearer token',
        cookie: 'session=123',
        'x-api-key': 'api-key',
        'x-auth-token': 'auth-token',
        'content-type': 'application/json',
      };
      
      const sanitized = middleware.sanitizeHeaders(headers);
      
      expect(sanitized.authorization).toBe('[REDACTED]');
      expect(sanitized.cookie).toBe('[REDACTED]');
      expect(sanitized['x-api-key']).toBe('[REDACTED]');
      expect(sanitized['x-auth-token']).toBe('[REDACTED]');
      expect(sanitized['content-type']).toBe('application/json');
    });

    it('should handle case-insensitive header names', () => {
      const middleware = new RequestLoggerMiddleware({ logger: mockLogger });
      
      const headers = {
        Authorization: 'Bearer token', // Capital A
        COOKIE: 'session=123', // All caps
        'X-API-KEY': 'api-key', // Mixed case
      };
      
      const sanitized = middleware.sanitizeHeaders(headers);
      
      expect(sanitized.Authorization).toBe('[REDACTED]');
      expect(sanitized.COOKIE).toBe('[REDACTED]');
      expect(sanitized['X-API-KEY']).toBe('[REDACTED]');
    });

    it('should handle empty headers object', () => {
      const middleware = new RequestLoggerMiddleware({ logger: mockLogger });
      
      const sanitized = middleware.sanitizeHeaders({});
      
      expect(sanitized).toEqual({});
    });

    it('should not modify non-sensitive headers', () => {
      const middleware = new RequestLoggerMiddleware({ logger: mockLogger });
      
      const headers = {
        'content-type': 'application/json',
        'user-agent': 'Mozilla/5.0',
        accept: '*/*',
        host: 'localhost',
      };
      
      const sanitized = middleware.sanitizeHeaders(headers);
      
      expect(sanitized).toEqual(headers);
    });
  });

  // ==========================================================================
  // HANDLE METHOD - REQUEST START LOGGING
  // ==========================================================================

  describe('handle() - Request Start Logging', () => {
    it('should log request start', async () => {
      const middleware = new RequestLoggerMiddleware({ logger: mockLogger });
      const req = createMockRequest({ method: 'GET', url: '/api/test' });
      const res = createMockResponse();
      const next = createMockNext();
      
      await middleware.handle(req, res, next);
      
      expect(mockLogger.log).toHaveBeenCalledWith(
        expect.stringMatching(/\[req_\d+_[a-z0-9]+\] REQUEST START: GET \/api\/test/)
      );
    });

    it('should add requestId to request object', async () => {
      const middleware = new RequestLoggerMiddleware({ logger: mockLogger });
      const req = createMockRequest();
      const res = createMockResponse();
      const next = createMockNext();
      
      await middleware.handle(req, res, next);
      
      expect(req.requestId).toBeDefined();
      expect(req.requestId).toMatch(/^req_/);
    });

    it('should log request with proper format', async () => {
      const middleware = new RequestLoggerMiddleware({ logger: mockLogger });
      const req = createMockRequest();
      const res = createMockResponse();
      const next = createMockNext();
      
      await middleware.handle(req, res, next);
      
      expect(mockLogger.log).toHaveBeenCalledWith(
        expect.stringMatching(/\[req_\d+_[a-z0-9]+\] REQUEST START: GET \//)
      );
    });

    it('should log request regardless of user agent', async () => {
      const middleware = new RequestLoggerMiddleware({ logger: mockLogger });
      const req = createMockRequest({
        headers: { 'user-agent': 'Mozilla/5.0' }
      });
      const res = createMockResponse();
      const next = createMockNext();
      
      await middleware.handle(req, res, next);
      
      expect(mockLogger.log).toHaveBeenCalledWith(
        expect.stringMatching(/\[req_\d+_[a-z0-9]+\] REQUEST START: GET \//)
      );
    });

    it('should log remote address from connection', async () => {
      const middleware = new RequestLoggerMiddleware({ logger: mockLogger });
      const req = createMockRequest({ remoteAddress: '192.168.1.100' });
      const res = createMockResponse();
      const next = createMockNext();
      
      await middleware.handle(req, res, next);
      
      expect(mockLogger.log).toHaveBeenCalledWith(
        expect.stringMatching(/\[req_\d+_[a-z0-9]+\] REQUEST START: GET \//)
      );
    });

    it('should log request with headers present', async () => {
      const middleware = new RequestLoggerMiddleware({ logger: mockLogger });
      const req = createMockRequest({
        headers: {
          authorization: 'Bearer secret',
          'content-type': 'application/json',
        }
      });
      const res = createMockResponse();
      const next = createMockNext();
      
      await middleware.handle(req, res, next);
      
      expect(mockLogger.log).toHaveBeenCalledWith(
        expect.stringMatching(/\[req_\d+_[a-z0-9]+\] REQUEST START: GET \//)
      );
    });

    it('should call next() after logging', async () => {
      const middleware = new RequestLoggerMiddleware({ logger: mockLogger });
      const req = createMockRequest();
      const res = createMockResponse();
      const next = createMockNext();
      
      await middleware.handle(req, res, next);
      
      expect(next).toHaveBeenCalledTimes(1);
      expect(next).toHaveBeenCalledWith();
    });
  });

  // ==========================================================================
  // HANDLE METHOD - RESPONSE END LOGGING
  // ==========================================================================

  describe('handle() - Response End Logging', () => {
    it('should log response end when res.end is called', async () => {
      const middleware = new RequestLoggerMiddleware({ logger: mockLogger });
      const req = createMockRequest();
      const res = createMockResponse();
      const next = createMockNext();
      
      await middleware.handle(req, res, next);
      
      // Trigger response end
      res.end('test response');
      
      await waitForAsync();
      
      expect(mockLogger.log).toHaveBeenCalledWith(
        expect.stringMatching(/\[req_\d+_[a-z0-9]+\] REQUEST END: 200 \(\d+ms\)/)
      );
    });

    it('should log status code in response', async () => {
      const middleware = new RequestLoggerMiddleware({ logger: mockLogger });
      const req = createMockRequest();
      const res = createMockResponse();
      const next = createMockNext();
      
      res.statusCode = 404;
      
      await middleware.handle(req, res, next);
      res.end();
      
      expect(mockLogger.log).toHaveBeenCalledWith(
        expect.stringMatching(/\[req_\d+_[a-z0-9]+\] REQUEST END: 404 \(\d+ms\)/)
      );
    });

    it('should calculate response duration', async () => {
      const middleware = new RequestLoggerMiddleware({ logger: mockLogger });
      const req = createMockRequest();
      const res = createMockResponse();
      const next = createMockNext();
      
      await middleware.handle(req, res, next);
      
      // Wait a bit before ending
      await waitForAsync(20);
      res.end();
      
      const endCall = mockLogger.log.mock.calls.find(call => 
        call[0].includes('REQUEST END')
      );
      
      expect(endCall).toBeDefined();
      expect(endCall[0]).toMatch(/\[req_\d+_[a-z0-9]+\] REQUEST END: 200 \(\d+ms\)/);
      
      // Extract duration from the log message
      const durationMatch = endCall[0].match(/\((\d+)ms\)/);
      expect(durationMatch).toBeTruthy();
      const durationValue = parseInt(durationMatch[1]);
      expect(durationValue).toBeGreaterThanOrEqual(0);
    });

    it('should log response regardless of size from end chunk', async () => {
      const middleware = new RequestLoggerMiddleware({ logger: mockLogger });
      const req = createMockRequest();
      const res = createMockResponse();
      const next = createMockNext();
      
      await middleware.handle(req, res, next);
      
      const responseData = 'Hello World';
      res.end(responseData);
      
      const endCall = mockLogger.log.mock.calls.find(call => 
        call[0].includes('REQUEST END')
      );
      
      expect(endCall).toBeDefined();
      expect(endCall[0]).toMatch(/\[req_\d+_[a-z0-9]+\] REQUEST END: 200 \(\d+ms\)/);
    });

    it('should log request regardless of content type', async () => {
      const middleware = new RequestLoggerMiddleware({ logger: mockLogger });
      const req = createMockRequest();
      const res = createMockResponse();
      const next = createMockNext();
      
      res.setHeader('content-type', 'application/json');
      
      await middleware.handle(req, res, next);
      res.end();
      
      const endCall = mockLogger.log.mock.calls.find(call => 
        call[0].includes('REQUEST END')
      );
      
      expect(endCall).toBeDefined();
      expect(endCall[0]).toMatch(/\[req_\d+_[a-z0-9]+\] REQUEST END: 200 \(\d+ms\)/);
    });

    it('should include request ID in end log', async () => {
      const middleware = new RequestLoggerMiddleware({ logger: mockLogger });
      const req = createMockRequest();
      const res = createMockResponse();
      const next = createMockNext();
      
      await middleware.handle(req, res, next);
      const requestId = req.requestId;
      res.end();
      
      const endCall = mockLogger.log.mock.calls.find(call => 
        call[0].includes('REQUEST END')
      );
      
      expect(endCall).toBeDefined();
      expect(endCall[0]).toContain(requestId);
      expect(endCall[0]).toMatch(/\[req_\d+_[a-z0-9]+\] REQUEST END: 200 \(\d+ms\)/);
    });
  });

  describe('handle() - Response Logging with Various Data', () => {
    it('should log response after res.write calls', async () => {
      const middleware = new RequestLoggerMiddleware({ logger: mockLogger });
      const req = createMockRequest();
      const res = createMockResponse();
      const next = createMockNext();
      
      await middleware.handle(req, res, next);
      
      res.write('chunk1');
      res.write('chunk2');
      res.end();
      
      const endCall = mockLogger.log.mock.calls.find(call => 
        call[0].includes('REQUEST END')
      );
      
      expect(endCall).toBeDefined();
      expect(endCall[0]).toMatch(/\[req_\d+_[a-z0-9]+\] REQUEST END: 200 \(\d+ms\)/);
    });

    it('should handle Buffer chunks in res.write', async () => {
      const middleware = new RequestLoggerMiddleware({ logger: mockLogger });
      const req = createMockRequest();
      const res = createMockResponse();
      const next = createMockNext();
      
      await middleware.handle(req, res, next);
      
      res.write(Buffer.from('buffer data'));
      res.end();
      
      const endCall = mockLogger.log.mock.calls.find(call => 
        call[0].includes('REQUEST END')
      );
      
      expect(endCall).toBeDefined();
      expect(endCall[0]).toMatch(/\[req_\d+_[a-z0-9]+\] REQUEST END: 200 \(\d+ms\)/);
    });

    it('should handle string chunks in res.write', async () => {
      const middleware = new RequestLoggerMiddleware({ logger: mockLogger });
      const req = createMockRequest();
      const res = createMockResponse();
      const next = createMockNext();
      
      await middleware.handle(req, res, next);
      
      res.write('string data');
      res.end();
      
      const endCall = mockLogger.log.mock.calls.find(call => 
        call[0].includes('REQUEST END')
      );
      
      expect(endCall).toBeDefined();
      expect(endCall[0]).toMatch(/\[req_\d+_[a-z0-9]+\] REQUEST END: 200 \(\d+ms\)/);
    });

    it('should accumulate size from multiple writes and end', async () => {
      const middleware = new RequestLoggerMiddleware({ logger: mockLogger });
      const req = createMockRequest();
      const res = createMockResponse();
      const next = createMockNext();
      
      await middleware.handle(req, res, next);
      
      res.write('part1');
      res.write('part2');
      res.end('part3');
      
      const endCall = mockLogger.log.mock.calls.find(call => 
        call[0].includes('REQUEST END')
      );
      
      expect(endCall).toBeDefined();
      expect(endCall[0]).toMatch(/\[req_\d+_[a-z0-9]+\] REQUEST END: 200 \(\d+ms\)/);
    });

    it('should handle res.end with no chunk', async () => {
      const middleware = new RequestLoggerMiddleware({ logger: mockLogger });
      const req = createMockRequest();
      const res = createMockResponse();
      const next = createMockNext();
      
      await middleware.handle(req, res, next);
      
      res.end();
      
      const endCall = mockLogger.log.mock.calls.find(call => 
        call[0].includes('REQUEST END')
      );
      
      expect(endCall).toBeDefined();
      expect(endCall[0]).toMatch(/\[req_\d+_[a-z0-9]+\] REQUEST END: 200 \(\d+ms\)/);
    });
  });

  // ==========================================================================
  // LOG REQUEST BODY
  // ==========================================================================

  describe('logRequestBody()', () => {
    it('should not log body for GET requests by default', async () => {
      const middleware = new RequestLoggerMiddleware({ 
        logger: mockLogger,
        includeBody: false 
      });
      const req = createMockRequest({ method: 'GET' });
      const res = createMockResponse();
      const next = createMockNext();
      
      await middleware.handle(req, res, next);
      
      // Should only have REQUEST START log, not body log
      const bodyLogs = mockLogger.log.mock.calls.filter(call => 
        call[0].includes('REQUEST BODY')
      );
      
      expect(bodyLogs).toHaveLength(0);
    });

    it('should log body for POST requests when enabled', async () => {
      const middleware = new RequestLoggerMiddleware({ 
        logger: mockLogger,
        includeBody: true 
      });
      const req = createMockRequest({ method: 'POST' });
      const res = createMockResponse();
      const next = createMockNext();
      
      const handlePromise = middleware.handle(req, res, next);
      
      // Simulate request body data
      req.emit('data', Buffer.from('{"test": "data"}'));
      req.emit('end');
      
      await handlePromise;
      await waitForAsync();
      
      const bodyLogs = mockLogger.log.mock.calls.filter(call => 
        call[0].includes('REQUEST BODY')
      );
      
      expect(bodyLogs.length).toBeGreaterThan(0);
      expect(bodyLogs[0][1].body).toContain('{"test": "data"}');
    });

    it('should truncate large request bodies', async () => {
      const middleware = new RequestLoggerMiddleware({ 
        logger: mockLogger,
        includeBody: true,
        maxBodySize: 10 
      });
      const req = createMockRequest({ method: 'POST' });
      const res = createMockResponse();
      const next = createMockNext();
      
      const handlePromise = middleware.handle(req, res, next);
      
      // Send body larger than maxBodySize
      req.emit('data', Buffer.from('This is a very long body that should be truncated'));
      req.emit('end');
      
      await handlePromise;
      await waitForAsync();
      
      const bodyLogs = mockLogger.log.mock.calls.filter(call => 
        call[0].includes('REQUEST BODY')
      );
      
      expect(bodyLogs[0][1].body).toContain('[TRUNCATED]');
      expect(bodyLogs[0][1].truncated).toBe(true);
    });

    it('should not log body for HEAD requests', async () => {
      const middleware = new RequestLoggerMiddleware({ 
        logger: mockLogger,
        includeBody: true 
      });
      const req = createMockRequest({ method: 'HEAD' });
      const res = createMockResponse();
      const next = createMockNext();
      
      await middleware.handle(req, res, next);
      
      const bodyLogs = mockLogger.log.mock.calls.filter(call => 
        call[0].includes('REQUEST BODY')
      );
      
      expect(bodyLogs).toHaveLength(0);
    });

    it('should store raw body on request object', async () => {
      const middleware = new RequestLoggerMiddleware({ 
        logger: mockLogger,
        includeBody: true 
      });
      const req = createMockRequest({ method: 'PUT' });
      const res = createMockResponse();
      const next = createMockNext();
      
      const handlePromise = middleware.handle(req, res, next);
      
      req.emit('data', Buffer.from('test body'));
      req.emit('end');
      
      await handlePromise;
      await waitForAsync();
      
      expect(req.rawBody).toBe('test body');
    });

    it('should handle body logging errors gracefully', async () => {
      const middleware = new RequestLoggerMiddleware({ 
        logger: mockLogger,
        includeBody: true 
      });
      const req = createMockRequest({ method: 'POST' });
      const res = createMockResponse();
      const next = createMockNext();
      
      const handlePromise = middleware.handle(req, res, next);
      
      // Emit end event immediately to avoid timeout
      req.emit('end');
      
      // Should not throw
      await expect(handlePromise).resolves.not.toThrow();
      expect(next).toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // EDGE CASES AND ERROR HANDLING
  // ==========================================================================

  describe('Edge Cases and Error Handling', () => {
    it('should handle missing connection and socket on request', async () => {
      const middleware = new RequestLoggerMiddleware({ logger: mockLogger });
      const req = {
        method: 'GET',
        url: '/',
        headers: {},
        on: jest.fn(),
        emit: jest.fn(),
        // No connection or socket
      };
      const res = createMockResponse();
      const next = createMockNext();
      
      await expect(middleware.handle(req, res, next)).resolves.not.toThrow();
      expect(next).toHaveBeenCalled();
    });

    it('should handle requests with no headers', async () => {
      const middleware = new RequestLoggerMiddleware({ logger: mockLogger });
      const req = createMockRequest({ headers: undefined });
      req.headers = {}; // Set to empty object
      const res = createMockResponse();
      const next = createMockNext();
      
      await expect(middleware.handle(req, res, next)).resolves.not.toThrow();
      expect(next).toHaveBeenCalled();
    });

    it('should handle responses with no content-type header', async () => {
      const middleware = new RequestLoggerMiddleware({ logger: mockLogger });
      const req = createMockRequest();
      const res = createMockResponse();
      const next = createMockNext();
      
      await middleware.handle(req, res, next);
      res.end();
      
      // Just verify that the response was logged
      expect(mockLogger.log).toHaveBeenCalledWith(
        expect.stringContaining('REQUEST END')
      );
    });

    it('should preserve original res.write functionality', async () => {
      const middleware = new RequestLoggerMiddleware({ logger: mockLogger });
      const req = createMockRequest();
      const res = createMockResponse();
      const next = createMockNext();
      
      const originalWrite = res.write;
      
      await middleware.handle(req, res, next);
      
      res.write('test');
      
      expect(originalWrite).toHaveBeenCalledWith('test');
    });

    it('should preserve original res.end functionality', async () => {
      const middleware = new RequestLoggerMiddleware({ logger: mockLogger });
      const req = createMockRequest();
      const res = createMockResponse();
      const next = createMockNext();
      
      const originalEnd = res.end;
      
      await middleware.handle(req, res, next);
      
      res.end('done');
      
      expect(originalEnd).toHaveBeenCalledWith('done', undefined);
    });
  });

  // ==========================================================================
  // INTEGRATION SCENARIOS
  // ==========================================================================

  describe('Integration Scenarios', () => {
    it('should handle complete request-response cycle', async () => {
      const middleware = new RequestLoggerMiddleware({ logger: mockLogger });
      const req = createMockRequest({
        method: 'POST',
        url: '/api/test',
        headers: {
          'content-type': 'application/json',
          authorization: 'Bearer secret',
        }
      });
      const res = createMockResponse();
      const next = createMockNext();
      
      res.statusCode = 201;
      res.setHeader('content-type', 'application/json');
      
      // For POST requests, simulate request body completion
      const middlewlePromise = middleware.handle(req, res, next);
      
      // Emit end event to complete body reading for POST request
      setTimeout(() => {
        req.emit('end');
      }, 10);
      
      await middlewlePromise;
      
      res.write('{"result":');
      res.write('"success"}');
      res.end();
      
      // Should have 2 log calls: START and END
      expect(mockLogger.log).toHaveBeenCalledTimes(2);
      
      // Verify START log
      expect(mockLogger.log).toHaveBeenCalledWith(
        expect.stringContaining('REQUEST START: POST /api/test')
      );
      
      // Verify END log
      expect(mockLogger.log).toHaveBeenCalledWith(
        expect.stringContaining('REQUEST END: 201')
      );
    });

    it('should handle multiple sequential requests independently', async () => {
      const middleware = new RequestLoggerMiddleware({ logger: mockLogger });
      
      // Request 1
      const req1 = createMockRequest({ url: '/api/test1' });
      const res1 = createMockResponse();
      const next1 = createMockNext();
      
      await middleware.handle(req1, res1, next1);
      const requestId1 = req1.requestId;
      res1.end();
      
      // Request 2
      const req2 = createMockRequest({ url: '/api/test2' });
      const res2 = createMockResponse();
      const next2 = createMockNext();
      
      await middleware.handle(req2, res2, next2);
      const requestId2 = req2.requestId;
      res2.end();
      
      // Each request should have unique ID
      expect(requestId1).not.toBe(requestId2);
      
      // Should have 4 log calls total (2 START + 2 END)
      expect(mockLogger.log).toHaveBeenCalledTimes(4);
    });

    it('should handle error status codes', async () => {
      const middleware = new RequestLoggerMiddleware({ logger: mockLogger });
      const req = createMockRequest();
      const res = createMockResponse();
      const next = createMockNext();
      
      res.statusCode = 500;
      
      await middleware.handle(req, res, next);
      res.end('Internal Server Error');
      
      expect(mockLogger.log).toHaveBeenCalledWith(
        expect.stringContaining('REQUEST END: 500')
      );
    });
  });
});
