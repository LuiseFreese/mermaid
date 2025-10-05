/**
 * Unit tests for security middleware
 * 
 * Tests security headers, factory methods, and configuration options.
 */

const { SecurityMiddleware } = require('../../../src/backend/middleware/security-middleware');

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Creates a mock request object
 */
function createMockRequest(url = '/') {
  return {
    url,
    method: 'GET',
    headers: {},
  };
}

/**
 * Creates a mock response object with spies
 */
function createMockResponse() {
  const headers = {};
  return {
    setHeader: jest.fn((name, value) => {
      headers[name] = value;
    }),
    getHeader: jest.fn((name) => headers[name]),
    _headers: headers, // For testing purposes
  };
}

/**
 * Creates a mock next function
 */
function createMockNext() {
  return jest.fn();
}

/**
 * Assert that security header was set
 */
function assertHeaderSet(res, headerName, expectedValue) {
  expect(res.setHeader).toHaveBeenCalledWith(headerName, expectedValue);
  expect(res._headers[headerName]).toBe(expectedValue);
}

/**
 * Assert that header was not set
 */
function assertHeaderNotSet(res, headerName) {
  const calls = res.setHeader.mock.calls.filter(call => call[0] === headerName);
  expect(calls.length).toBe(0);
}

// ============================================================================
// TEST SUITE
// ============================================================================

describe('Security Middleware', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ==========================================================================
  // CONSTRUCTOR AND DEFAULT OPTIONS
  // ==========================================================================

  describe('Constructor', () => {
    it('should create instance with default options', () => {
      const middleware = new SecurityMiddleware();
      
      expect(middleware.options.contentTypeOptions).toBe('nosniff');
      expect(middleware.options.frameOptions).toBe('DENY');
      expect(middleware.options.xssProtection).toBe('1; mode=block');
      expect(middleware.options.cacheControl).toBe('no-cache, no-store, must-revalidate');
    });

    it('should accept custom options', () => {
      const customOptions = {
        contentTypeOptions: 'custom-nosniff',
        frameOptions: 'SAMEORIGIN',
        xssProtection: '0',
        cacheControl: 'public, max-age=3600',
      };
      
      const middleware = new SecurityMiddleware(customOptions);
      
      expect(middleware.options.contentTypeOptions).toBe('custom-nosniff');
      expect(middleware.options.frameOptions).toBe('SAMEORIGIN');
      expect(middleware.options.xssProtection).toBe('0');
      expect(middleware.options.cacheControl).toBe('public, max-age=3600');
    });

    it('should merge custom options with defaults', () => {
      const middleware = new SecurityMiddleware({ frameOptions: 'SAMEORIGIN' });
      
      expect(middleware.options.contentTypeOptions).toBe('nosniff');
      expect(middleware.options.frameOptions).toBe('SAMEORIGIN'); // Custom
      expect(middleware.options.xssProtection).toBe('1; mode=block');
      expect(middleware.options.cacheControl).toBe('no-cache, no-store, must-revalidate');
    });

    it('should handle empty options object', () => {
      const middleware = new SecurityMiddleware({});
      
      expect(middleware.options.contentTypeOptions).toBe('nosniff');
      expect(middleware.options.frameOptions).toBe('DENY');
      expect(middleware.options.xssProtection).toBe('1; mode=block');
      expect(middleware.options.cacheControl).toBe('no-cache, no-store, must-revalidate');
    });

    it('should support additional custom options via spread', () => {
      const middleware = new SecurityMiddleware({
        contentTypeOptions: 'nosniff',
        customHeader: 'custom-value',
      });
      
      expect(middleware.options.contentTypeOptions).toBe('nosniff');
      expect(middleware.options.customHeader).toBe('custom-value');
    });
  });

  // ==========================================================================
  // HANDLE METHOD - SECURITY HEADERS
  // ==========================================================================

  describe('handle() - Security Headers', () => {
    it('should set X-Content-Type-Options header', () => {
      const middleware = new SecurityMiddleware();
      const req = createMockRequest('/');
      const res = createMockResponse();
      const next = createMockNext();
      
      middleware.handle(req, res, next);
      
      assertHeaderSet(res, 'X-Content-Type-Options', 'nosniff');
    });

    it('should set X-Frame-Options header', () => {
      const middleware = new SecurityMiddleware();
      const req = createMockRequest('/');
      const res = createMockResponse();
      const next = createMockNext();
      
      middleware.handle(req, res, next);
      
      assertHeaderSet(res, 'X-Frame-Options', 'DENY');
    });

    it('should set X-XSS-Protection header', () => {
      const middleware = new SecurityMiddleware();
      const req = createMockRequest('/');
      const res = createMockResponse();
      const next = createMockNext();
      
      middleware.handle(req, res, next);
      
      assertHeaderSet(res, 'X-XSS-Protection', '1; mode=block');
    });

    it('should set all three security headers', () => {
      const middleware = new SecurityMiddleware();
      const req = createMockRequest('/');
      const res = createMockResponse();
      const next = createMockNext();
      
      middleware.handle(req, res, next);
      
      expect(res.setHeader).toHaveBeenCalledTimes(3); // No Cache-Control for non-API
      assertHeaderSet(res, 'X-Content-Type-Options', 'nosniff');
      assertHeaderSet(res, 'X-Frame-Options', 'DENY');
      assertHeaderSet(res, 'X-XSS-Protection', '1; mode=block');
    });

    it('should call next() after setting headers', () => {
      const middleware = new SecurityMiddleware();
      const req = createMockRequest('/');
      const res = createMockResponse();
      const next = createMockNext();
      
      middleware.handle(req, res, next);
      
      expect(next).toHaveBeenCalledTimes(1);
      expect(next).toHaveBeenCalledWith();
    });
  });

  // ==========================================================================
  // HANDLE METHOD - CACHE CONTROL FOR API ENDPOINTS
  // ==========================================================================

  describe('handle() - Cache-Control for API Endpoints', () => {
    it('should set Cache-Control header for /api/ endpoints', () => {
      const middleware = new SecurityMiddleware();
      const req = createMockRequest('/api/publishers');
      const res = createMockResponse();
      const next = createMockNext();
      
      middleware.handle(req, res, next);
      
      assertHeaderSet(res, 'Cache-Control', 'no-cache, no-store, must-revalidate');
    });

    it('should set Cache-Control for nested API routes', () => {
      const middleware = new SecurityMiddleware();
      const req = createMockRequest('/api/solutions/test');
      const res = createMockResponse();
      const next = createMockNext();
      
      middleware.handle(req, res, next);
      
      assertHeaderSet(res, 'Cache-Control', 'no-cache, no-store, must-revalidate');
    });

    it('should set Cache-Control for API root', () => {
      const middleware = new SecurityMiddleware();
      const req = createMockRequest('/api/');
      const res = createMockResponse();
      const next = createMockNext();
      
      middleware.handle(req, res, next);
      
      assertHeaderSet(res, 'Cache-Control', 'no-cache, no-store, must-revalidate');
    });

    it('should NOT set Cache-Control for non-API endpoints', () => {
      const middleware = new SecurityMiddleware();
      const req = createMockRequest('/index.html');
      const res = createMockResponse();
      const next = createMockNext();
      
      middleware.handle(req, res, next);
      
      assertHeaderNotSet(res, 'Cache-Control');
    });

    it('should NOT set Cache-Control for root path', () => {
      const middleware = new SecurityMiddleware();
      const req = createMockRequest('/');
      const res = createMockResponse();
      const next = createMockNext();
      
      middleware.handle(req, res, next);
      
      assertHeaderNotSet(res, 'Cache-Control');
    });

    it('should NOT set Cache-Control for static files', () => {
      const middleware = new SecurityMiddleware();
      const req = createMockRequest('/static/app.js');
      const res = createMockResponse();
      const next = createMockNext();
      
      middleware.handle(req, res, next);
      
      assertHeaderNotSet(res, 'Cache-Control');
    });

    it('should be case-sensitive for /api/ check', () => {
      const middleware = new SecurityMiddleware();
      const req = createMockRequest('/API/test');
      const res = createMockResponse();
      const next = createMockNext();
      
      middleware.handle(req, res, next);
      
      // Should NOT match because it's uppercase
      assertHeaderNotSet(res, 'Cache-Control');
    });

    it('should NOT match /api in the middle of URL', () => {
      const middleware = new SecurityMiddleware();
      const req = createMockRequest('/test/api/endpoint');
      const res = createMockResponse();
      const next = createMockNext();
      
      middleware.handle(req, res, next);
      
      // Should NOT match because /api/ is not at the start
      assertHeaderNotSet(res, 'Cache-Control');
    });
  });

  // ==========================================================================
  // HANDLE METHOD - CUSTOM OPTIONS
  // ==========================================================================

  describe('handle() - Custom Options', () => {
    it('should use custom X-Content-Type-Options value', () => {
      const middleware = new SecurityMiddleware({ contentTypeOptions: 'custom-value' });
      const req = createMockRequest('/');
      const res = createMockResponse();
      const next = createMockNext();
      
      middleware.handle(req, res, next);
      
      assertHeaderSet(res, 'X-Content-Type-Options', 'custom-value');
    });

    it('should use custom X-Frame-Options value', () => {
      const middleware = new SecurityMiddleware({ frameOptions: 'SAMEORIGIN' });
      const req = createMockRequest('/');
      const res = createMockResponse();
      const next = createMockNext();
      
      middleware.handle(req, res, next);
      
      assertHeaderSet(res, 'X-Frame-Options', 'SAMEORIGIN');
    });

    it('should use custom X-XSS-Protection value', () => {
      const middleware = new SecurityMiddleware({ xssProtection: '0' });
      const req = createMockRequest('/');
      const res = createMockResponse();
      const next = createMockNext();
      
      middleware.handle(req, res, next);
      
      assertHeaderSet(res, 'X-XSS-Protection', '0');
    });

    it('should use custom Cache-Control value', () => {
      const middleware = new SecurityMiddleware({ cacheControl: 'public, max-age=3600' });
      const req = createMockRequest('/api/test');
      const res = createMockResponse();
      const next = createMockNext();
      
      middleware.handle(req, res, next);
      
      assertHeaderSet(res, 'Cache-Control', 'public, max-age=3600');
    });

    it('should support multiple custom options', () => {
      const middleware = new SecurityMiddleware({
        contentTypeOptions: 'custom-nosniff',
        frameOptions: 'ALLOW-FROM https://example.com',
        xssProtection: '1; report=https://example.com/xss-report',
        cacheControl: 'private, max-age=600',
      });
      const req = createMockRequest('/api/test');
      const res = createMockResponse();
      const next = createMockNext();
      
      middleware.handle(req, res, next);
      
      assertHeaderSet(res, 'X-Content-Type-Options', 'custom-nosniff');
      assertHeaderSet(res, 'X-Frame-Options', 'ALLOW-FROM https://example.com');
      assertHeaderSet(res, 'X-XSS-Protection', '1; report=https://example.com/xss-report');
      assertHeaderSet(res, 'Cache-Control', 'private, max-age=600');
    });
  });

  // ==========================================================================
  // HANDLE METHOD - EDGE CASES
  // ==========================================================================

  describe('handle() - Edge Cases', () => {
    it('should handle missing req.url gracefully', () => {
      const middleware = new SecurityMiddleware();
      const req = { method: 'GET', headers: {} }; // No url property
      const res = createMockResponse();
      const next = createMockNext();
      
      // Should not throw
      expect(() => middleware.handle(req, res, next)).not.toThrow();
      
      // Should still set security headers
      assertHeaderSet(res, 'X-Content-Type-Options', 'nosniff');
      assertHeaderSet(res, 'X-Frame-Options', 'DENY');
      assertHeaderSet(res, 'X-XSS-Protection', '1; mode=block');
      
      // Should not set Cache-Control (no url to check)
      assertHeaderNotSet(res, 'Cache-Control');
      
      expect(next).toHaveBeenCalled();
    });

    it('should handle empty string URL', () => {
      const middleware = new SecurityMiddleware();
      const req = createMockRequest('');
      const res = createMockResponse();
      const next = createMockNext();
      
      middleware.handle(req, res, next);
      
      assertHeaderSet(res, 'X-Content-Type-Options', 'nosniff');
      assertHeaderNotSet(res, 'Cache-Control');
      expect(next).toHaveBeenCalled();
    });

    it('should handle URL with query parameters', () => {
      const middleware = new SecurityMiddleware();
      const req = createMockRequest('/api/test?param=value');
      const res = createMockResponse();
      const next = createMockNext();
      
      middleware.handle(req, res, next);
      
      assertHeaderSet(res, 'Cache-Control', 'no-cache, no-store, must-revalidate');
      expect(next).toHaveBeenCalled();
    });

    it('should handle URL with hash', () => {
      const middleware = new SecurityMiddleware();
      const req = createMockRequest('/api/test#section');
      const res = createMockResponse();
      const next = createMockNext();
      
      middleware.handle(req, res, next);
      
      assertHeaderSet(res, 'Cache-Control', 'no-cache, no-store, must-revalidate');
      expect(next).toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // FACTORY METHOD - createWebAppSecurity()
  // ==========================================================================

  describe('createWebAppSecurity()', () => {
    it('should create middleware instance with default options', () => {
      const middleware = SecurityMiddleware.createWebAppSecurity();
      
      expect(middleware).toBeInstanceOf(SecurityMiddleware);
      expect(middleware.options.contentTypeOptions).toBe('nosniff');
      expect(middleware.options.frameOptions).toBe('DENY');
      expect(middleware.options.xssProtection).toBe('1; mode=block');
      expect(middleware.options.cacheControl).toBe('no-cache, no-store, must-revalidate');
    });

    it('should accept custom options', () => {
      const middleware = SecurityMiddleware.createWebAppSecurity({
        frameOptions: 'SAMEORIGIN',
      });
      
      expect(middleware).toBeInstanceOf(SecurityMiddleware);
      expect(middleware.options.frameOptions).toBe('SAMEORIGIN');
      expect(middleware.options.contentTypeOptions).toBe('nosniff'); // Still uses default
    });

    it('should create functional middleware', () => {
      const middleware = SecurityMiddleware.createWebAppSecurity();
      const req = createMockRequest('/');
      const res = createMockResponse();
      const next = createMockNext();
      
      middleware.handle(req, res, next);
      
      assertHeaderSet(res, 'X-Content-Type-Options', 'nosniff');
      assertHeaderSet(res, 'X-Frame-Options', 'DENY');
      assertHeaderSet(res, 'X-XSS-Protection', '1; mode=block');
      expect(next).toHaveBeenCalled();
    });

    it('should support method chaining with handle', () => {
      const req = createMockRequest('/api/test');
      const res = createMockResponse();
      const next = createMockNext();
      
      SecurityMiddleware.createWebAppSecurity().handle(req, res, next);
      
      expect(res.setHeader).toHaveBeenCalled();
      expect(next).toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // FACTORY METHOD - createApiSecurity()
  // ==========================================================================

  describe('createApiSecurity()', () => {
    it('should create middleware instance with default options', () => {
      const middleware = SecurityMiddleware.createApiSecurity();
      
      expect(middleware).toBeInstanceOf(SecurityMiddleware);
      expect(middleware.options.contentTypeOptions).toBe('nosniff');
      expect(middleware.options.frameOptions).toBe('DENY');
      expect(middleware.options.xssProtection).toBe('1; mode=block');
      expect(middleware.options.cacheControl).toBe('no-cache, no-store, must-revalidate');
    });

    it('should accept custom options', () => {
      const middleware = SecurityMiddleware.createApiSecurity({
        cacheControl: 'private, max-age=300',
      });
      
      expect(middleware).toBeInstanceOf(SecurityMiddleware);
      expect(middleware.options.cacheControl).toBe('private, max-age=300');
      expect(middleware.options.contentTypeOptions).toBe('nosniff'); // Still uses default
    });

    it('should create functional middleware', () => {
      const middleware = SecurityMiddleware.createApiSecurity();
      const req = createMockRequest('/api/test');
      const res = createMockResponse();
      const next = createMockNext();
      
      middleware.handle(req, res, next);
      
      assertHeaderSet(res, 'X-Content-Type-Options', 'nosniff');
      assertHeaderSet(res, 'X-Frame-Options', 'DENY');
      assertHeaderSet(res, 'X-XSS-Protection', '1; mode=block');
      assertHeaderSet(res, 'Cache-Control', 'no-cache, no-store, must-revalidate');
      expect(next).toHaveBeenCalled();
    });

    it('should support method chaining with handle', () => {
      const req = createMockRequest('/api/test');
      const res = createMockResponse();
      const next = createMockNext();
      
      SecurityMiddleware.createApiSecurity().handle(req, res, next);
      
      expect(res.setHeader).toHaveBeenCalled();
      expect(next).toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // FACTORY METHODS - COMPARISON
  // ==========================================================================

  describe('Factory Methods - Comparison', () => {
    it('should have identical default behavior for createWebAppSecurity and createApiSecurity', () => {
      const webMiddleware = SecurityMiddleware.createWebAppSecurity();
      const apiMiddleware = SecurityMiddleware.createApiSecurity();
      
      expect(webMiddleware.options).toEqual(apiMiddleware.options);
    });

    it('should allow different configurations for web and API', () => {
      const webMiddleware = SecurityMiddleware.createWebAppSecurity({
        frameOptions: 'SAMEORIGIN',
      });
      const apiMiddleware = SecurityMiddleware.createApiSecurity({
        cacheControl: 'public, max-age=3600',
      });
      
      expect(webMiddleware.options.frameOptions).toBe('SAMEORIGIN');
      expect(apiMiddleware.options.frameOptions).toBe('DENY');
      expect(webMiddleware.options.cacheControl).toBe('no-cache, no-store, must-revalidate');
      expect(apiMiddleware.options.cacheControl).toBe('public, max-age=3600');
    });
  });

  // ==========================================================================
  // INTEGRATION - MULTIPLE REQUESTS
  // ==========================================================================

  describe('Integration - Multiple Requests', () => {
    it('should handle multiple sequential requests', () => {
      const middleware = new SecurityMiddleware();
      
      // Request 1: API endpoint
      const req1 = createMockRequest('/api/test1');
      const res1 = createMockResponse();
      const next1 = createMockNext();
      middleware.handle(req1, res1, next1);
      
      // Request 2: Non-API endpoint
      const req2 = createMockRequest('/index.html');
      const res2 = createMockResponse();
      const next2 = createMockNext();
      middleware.handle(req2, res2, next2);
      
      // Request 3: Another API endpoint
      const req3 = createMockRequest('/api/test2');
      const res3 = createMockResponse();
      const next3 = createMockNext();
      middleware.handle(req3, res3, next3);
      
      // Verify headers for each response
      assertHeaderSet(res1, 'Cache-Control', 'no-cache, no-store, must-revalidate');
      assertHeaderNotSet(res2, 'Cache-Control');
      assertHeaderSet(res3, 'Cache-Control', 'no-cache, no-store, must-revalidate');
      
      // Verify next was called for all
      expect(next1).toHaveBeenCalled();
      expect(next2).toHaveBeenCalled();
      expect(next3).toHaveBeenCalled();
    });

    it('should not leak state between requests', () => {
      const middleware = new SecurityMiddleware();
      
      const req1 = createMockRequest('/api/test');
      const res1 = createMockResponse();
      const next1 = createMockNext();
      middleware.handle(req1, res1, next1);
      
      const req2 = createMockRequest('/other');
      const res2 = createMockResponse();
      const next2 = createMockNext();
      middleware.handle(req2, res2, next2);
      
      // Each response should have independent headers
      expect(res1._headers).not.toBe(res2._headers);
      expect(res1.setHeader).not.toBe(res2.setHeader);
    });
  });
});
