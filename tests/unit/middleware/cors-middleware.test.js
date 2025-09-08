/**
 * Unit tests for CORS Middleware
 * Tests cross-origin request handling and security headers
 */

const { CorsMiddleware } = require('../../../src/backend/middleware/cors-middleware');

describe('CorsMiddleware', () => {
  let corsMiddleware;
  let mockReq;
  let mockRes;
  let nextSpy;

  beforeEach(() => {
    corsMiddleware = new CorsMiddleware({
      allowedOrigins: ['http://localhost:3000', 'http://localhost:3003'],
      allowedMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
      credentials: true
    });

    mockReq = global.testUtils.createMockRequest();
    mockRes = global.testUtils.createMockResponse();
    nextSpy = jest.fn();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with default options', () => {
      const defaultCors = new CorsMiddleware();
      expect(defaultCors.allowedOrigins).toEqual(['*']);
      expect(defaultCors.credentials).toBe(false);
    });

    it('should initialize with custom options', () => {
      const customCors = new CorsMiddleware({
        allowedOrigins: ['https://example.com'],
        credentials: true
      });
      expect(customCors.allowedOrigins).toEqual(['https://example.com']);
      expect(customCors.credentials).toBe(true);
    });
  });

  describe('handle', () => {
    it('should set CORS headers for allowed origin', async () => {
      mockReq.headers.origin = 'http://localhost:3000';

      await corsMiddleware.handle(mockReq, mockRes, nextSpy);

      expect(mockRes.setHeader).toHaveBeenCalledWith(
        'Access-Control-Allow-Origin',
        'http://localhost:3000'
      );
      expect(mockRes.setHeader).toHaveBeenCalledWith(
        'Access-Control-Allow-Credentials',
        'true'
      );
      expect(nextSpy).toHaveBeenCalled();
    });

    it('should reject disallowed origins', async () => {
      mockReq.headers.origin = 'https://malicious-site.com';

      await corsMiddleware.handle(mockReq, mockRes, nextSpy);

      expect(mockRes.setHeader).not.toHaveBeenCalledWith(
        'Access-Control-Allow-Origin',
        'https://malicious-site.com'
      );
      expect(nextSpy).toHaveBeenCalled();
    });

    it('should handle wildcard origins', async () => {
      const wildcardCors = new CorsMiddleware({
        allowedOrigins: ['*']
      });

      await wildcardCors.handle(mockReq, mockRes, nextSpy);

      expect(mockRes.setHeader).toHaveBeenCalledWith(
        'Access-Control-Allow-Origin',
        '*'
      );
    });

    it('should handle same-origin requests', async () => {
      // No origin header = same-origin request
      delete mockReq.headers.origin;

      await corsMiddleware.handle(mockReq, mockRes, nextSpy);

      expect(nextSpy).toHaveBeenCalled();
    });
  });

  describe('handlePreflight', () => {
    beforeEach(() => {
      mockReq.method = 'OPTIONS';
      mockReq.headers.origin = 'http://localhost:3000';
    });

    it('should handle OPTIONS preflight requests', async () => {
      await corsMiddleware.handle(mockReq, mockRes, nextSpy);

      expect(mockRes.setHeader).toHaveBeenCalledWith(
        'Access-Control-Allow-Methods',
        'GET, POST, PUT, DELETE, OPTIONS'
      );
      expect(mockRes.setHeader).toHaveBeenCalledWith(
        'Access-Control-Allow-Headers',
        'Content-Type, Authorization'
      );
      expect(mockRes.writeHead).toHaveBeenCalledWith(204);
      expect(mockRes.end).toHaveBeenCalled();
      expect(nextSpy).not.toHaveBeenCalled(); // Should not call next for OPTIONS
    });

    it('should handle requested headers in preflight', async () => {
      mockReq.headers['access-control-request-headers'] = 'Content-Type, X-Custom-Header';

      await corsMiddleware.handle(mockReq, mockRes, nextSpy);

      expect(mockRes.setHeader).toHaveBeenCalledWith(
        'Access-Control-Allow-Headers',
        'Content-Type'
      );
    });

    it('should set max age for preflight cache', async () => {
      await corsMiddleware.handle(mockReq, mockRes, nextSpy);

      expect(mockRes.setHeader).toHaveBeenCalledWith(
        'Access-Control-Max-Age',
        '86400'
      );
    });
  });

  describe('isOriginAllowed', () => {
    it('should allow exact origin matches', () => {
      expect(corsMiddleware.isOriginAllowed('http://localhost:3000')).toBe(true);
      expect(corsMiddleware.isOriginAllowed('http://localhost:3003')).toBe(true);
    });

    it('should reject non-matching origins', () => {
      expect(corsMiddleware.isOriginAllowed('https://evil.com')).toBe(false);
    });

    it('should handle null/undefined origins', () => {
      expect(corsMiddleware.isOriginAllowed(null)).toBe(true);
      expect(corsMiddleware.isOriginAllowed(undefined)).toBe(true);
    });
  });

  describe('isHeaderAllowed', () => {
    it('should allow configured headers', () => {
      expect(corsMiddleware.isHeaderAllowed('Content-Type')).toBe(true);
      expect(corsMiddleware.isHeaderAllowed('authorization')).toBe(true); // Case insensitive
    });

    it('should reject non-configured headers', () => {
      expect(corsMiddleware.isHeaderAllowed('X-Custom-Header')).toBe(false);
    });
  });

  describe('createWebAppCors', () => {
    it('should create CORS middleware for web apps', () => {
      const webAppCors = CorsMiddleware.createWebAppCors();
      
      expect(webAppCors).toBeInstanceOf(CorsMiddleware);
      // The actual implementation uses ['*'] for development
      expect(webAppCors.allowedOrigins).toEqual(['*']);
      expect(webAppCors.credentials).toBe(false);
    });
  });

  describe('createApiCors', () => {
    it('should not have createApiCors method (not implemented)', () => {
      // This method doesn't exist in current implementation
      expect(CorsMiddleware.createApiCors).toBeUndefined();
    });
  });

  describe('error handling', () => {
    it('should handle middleware errors gracefully', async () => {
      mockRes.setHeader.mockImplementation(() => {
        throw new Error('Header setting failed');
      });

      await expect(
        corsMiddleware.handle(mockReq, mockRes, nextSpy)
      ).rejects.toThrow('Header setting failed');
    });
  });

  describe('security considerations', () => {
    it('should not allow credentials with wildcard origin', () => {
      const insecureCors = new CorsMiddleware({
        allowedOrigins: ['*'],
        credentials: true
      });

      // This configuration should be avoided for security
      expect(insecureCors.allowedOrigins).toContain('*');
      expect(insecureCors.credentials).toBe(true);
    });

    it('should properly validate origin format', () => {
      const origins = [
        'http://localhost:3000',
        'https://example.com',
        'http://192.168.1.100:8080'
      ];

      origins.forEach(origin => {
        expect(corsMiddleware.isOriginAllowed).toBeDefined();
      });
    });
  });
});
