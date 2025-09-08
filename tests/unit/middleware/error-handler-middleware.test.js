/**
 * Unit tests for ErrorHandlerMiddleware
 * Tests centralized error handling functionality
 */

const { ErrorHandlerMiddleware } = require('../../../src/backend/middleware/error-handler-middleware');

describe('ErrorHandlerMiddleware', () => {
  let errorHandler;
  let mockLogger;
  let mockReq;
  let mockRes;

  beforeEach(() => {
    mockLogger = {
      error: jest.fn(),
      warn: jest.fn(),
      info: jest.fn()
    };

    mockReq = {
      method: 'POST',
      url: '/api/test',
      requestId: 'test-123'
    };

    mockRes = {
      headersSent: false,
      writeHead: jest.fn(),
      end: jest.fn()
    };

    errorHandler = new ErrorHandlerMiddleware({
      logger: mockLogger,
      environment: 'test'
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with default values', () => {
      const handler = new ErrorHandlerMiddleware();
      expect(handler.logger).toBe(console);
      expect(handler.includeStack).toBe(false);
      expect(handler.environment).toBe('production');
    });

    it('should initialize with custom dependencies', () => {
      const customLogger = { error: jest.fn() };
      const handler = new ErrorHandlerMiddleware({
        logger: customLogger,
        includeStack: true,
        environment: 'development'
      });

      expect(handler.logger).toBe(customLogger);
      expect(handler.includeStack).toBe(true);
      expect(handler.environment).toBe('development');
    });
  });

  describe('handle', () => {
    it('should handle generic errors with 500 status', async () => {
      const error = new Error('Something went wrong');

      await errorHandler.handle(error, mockReq, mockRes);

      expect(mockRes.writeHead).toHaveBeenCalledWith(500, {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache'
      });

      expect(mockRes.end).toHaveBeenCalled();
      const response = JSON.parse(mockRes.end.mock.calls[0][0]);
      
      expect(response.error.message).toBe('Something went wrong');
      expect(response.error.code).toBe('INTERNAL_ERROR');
      expect(response.error.requestId).toBe('test-123');
      expect(response.error.timestamp).toBeDefined();
    });

    it('should handle ValidationError with 400 status', async () => {
      const error = new Error('Invalid input');
      error.name = 'ValidationError';

      await errorHandler.handle(error, mockReq, mockRes);

      expect(mockRes.writeHead).toHaveBeenCalledWith(400, expect.any(Object));
    });

    it('should handle UnauthorizedError with 401 status', async () => {
      const error = new Error('Not authorized');
      error.name = 'UnauthorizedError';

      await errorHandler.handle(error, mockReq, mockRes);

      expect(mockRes.writeHead).toHaveBeenCalledWith(401, expect.any(Object));
    });

    it('should handle NotFoundError with 404 status', async () => {
      const error = new Error('Resource not found');
      error.name = 'NotFoundError';

      await errorHandler.handle(error, mockReq, mockRes);

      expect(mockRes.writeHead).toHaveBeenCalledWith(404, expect.any(Object));
    });

    it('should use custom status code when provided', async () => {
      const error = new Error('Custom error');
      error.statusCode = 422;

      await errorHandler.handle(error, mockReq, mockRes);

      expect(mockRes.writeHead).toHaveBeenCalledWith(422, expect.any(Object));
    });

    it('should not send response if headers already sent', async () => {
      mockRes.headersSent = true;
      const error = new Error('Test error');

      await errorHandler.handle(error, mockReq, mockRes);

      expect(mockRes.writeHead).not.toHaveBeenCalled();
      expect(mockRes.end).not.toHaveBeenCalled();
      expect(mockLogger.warn).toHaveBeenCalledWith(
        '[test-123] Cannot send error response - headers already sent'
      );
    });

    it('should handle missing request ID', async () => {
      mockReq.requestId = undefined;
      const error = new Error('Test error');

      await errorHandler.handle(error, mockReq, mockRes);

      expect(mockLogger.error).toHaveBeenCalledWith(
        '[unknown] ERROR: Test error',
        expect.any(Object)
      );
    });

    it('should log error details', async () => {
      const error = new Error('Test error');
      error.code = 'TEST_ERROR';

      await errorHandler.handle(error, mockReq, mockRes);

      expect(mockLogger.error).toHaveBeenCalledWith(
        '[test-123] ERROR: Test error',
        expect.objectContaining({
          requestId: 'test-123',
          method: 'POST',
          url: '/api/test',
          error: expect.objectContaining({
            message: 'Test error',
            name: 'Error',
            code: 'TEST_ERROR',
            statusCode: 500
          })
        })
      );
    });

    it('should include additional details in development environment', async () => {
      const devHandler = new ErrorHandlerMiddleware({
        logger: mockLogger,
        environment: 'development'
      });

      const error = new Error('Test error');
      await devHandler.handle(error, mockReq, mockRes);

      const response = JSON.parse(mockRes.end.mock.calls[0][0]);
      expect(response.error.details).toBeDefined();
      expect(response.error.details.name).toBe('Error');
      expect(response.error.details.originalMessage).toBe('Test error');
    });

    it('should include stack trace when enabled', async () => {
      const stackHandler = new ErrorHandlerMiddleware({
        logger: mockLogger,
        environment: 'development',
        includeStack: true
      });

      const error = new Error('Test error');
      await stackHandler.handle(error, mockReq, mockRes);

      const response = JSON.parse(mockRes.end.mock.calls[0][0]);
      expect(response.error.stack).toBeDefined();
      expect(Array.isArray(response.error.stack)).toBe(true);
    });

    it('should handle response sending errors gracefully', async () => {
      mockRes.end.mockImplementation(() => {
        throw new Error('Response sending failed');
      });

      const error = new Error('Original error');
      await errorHandler.handle(error, mockReq, mockRes);

      expect(mockLogger.error).toHaveBeenCalledWith(
        '[test-123] Failed to send error response:',
        expect.any(Error)
      );
    });
  });

  describe('error status code mapping', () => {
    const testCases = [
      { name: 'ValidationError', expectedStatus: 400 },
      { name: 'UnauthorizedError', expectedStatus: 401 },
      { name: 'ForbiddenError', expectedStatus: 403 },
      { name: 'NotFoundError', expectedStatus: 404 },
      { name: 'ConflictError', expectedStatus: 409 },
      { name: 'TooManyRequestsError', expectedStatus: 429 }
    ];

    testCases.forEach(({ name, expectedStatus }) => {
      it(`should map ${name} to ${expectedStatus} status`, async () => {
        const error = new Error('Test error');
        error.name = name;

        await errorHandler.handle(error, mockReq, mockRes);

        expect(mockRes.writeHead).toHaveBeenCalledWith(expectedStatus, expect.any(Object));
      });
    });
  });

  describe('safe error messages', () => {
    it('should sanitize error messages for production', async () => {
      const prodHandler = new ErrorHandlerMiddleware({
        logger: mockLogger,
        environment: 'production'
      });

      const error = new Error('Database connection failed with credentials xyz');
      await prodHandler.handle(error, mockReq, mockRes);

      const response = JSON.parse(mockRes.end.mock.calls[0][0]);
      expect(response.error.message).toBe('An internal server error occurred');
    });

    it('should preserve error messages in development', async () => {
      const devHandler = new ErrorHandlerMiddleware({
        logger: mockLogger,
        environment: 'development'
      });

      const error = new Error('Detailed error message');
      await devHandler.handle(error, mockReq, mockRes);

      const response = JSON.parse(mockRes.end.mock.calls[0][0]);
      expect(response.error.details.originalMessage).toBe('Detailed error message');
    });
  });
});
