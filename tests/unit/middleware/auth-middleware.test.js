/**
 * Unit tests for authentication middleware
 * 
 * Tests JWT token validation, Azure AD integration, and auth bypass.
 */

const jwt = require('jsonwebtoken');
const { authenticateToken, optionalAuth, requireRole } = require('../../../src/backend/middleware/auth');

// ============================================================================
// MOCKS
// ============================================================================

// Mock jwks-rsa
jest.mock('jwks-rsa', () => {
  return {
    __esModule: true,
    default: jest.fn(() => ({
      getSigningKey: jest.fn((kid, callback) => {
        // Return a mock signing key for valid tokens
        callback(null, {
          publicKey: 'mock-public-key',
          rsaPublicKey: 'mock-rsa-public-key'
        });
      })
    }))
  };
});

// Mock jsonwebtoken
jest.mock('jsonwebtoken');

// ============================================================================
// FIXTURES AND CONSTANTS
// ============================================================================

const FIXTURES = {
  // Valid environment configuration
  validEnv: {
    AUTH_ENABLED: 'true',
    AZURE_AD_TENANT_ID: 'test-tenant-id-12345',
    AZURE_AD_CLIENT_ID: 'test-client-id-67890'
  },
  
  // Mock decoded tokens
  tokens: {
    validUser: {
      oid: 'user-object-id-123',
      email: 'user@example.com',
      name: 'Test User',
      roles: ['User'],
      iat: 1234567890,
      exp: 1234571490
    },
    
    adminUser: {
      oid: 'admin-object-id-456',
      email: 'admin@example.com',
      name: 'Admin User',
      roles: ['Admin', 'PowerUser'],
      iat: 1234567890,
      exp: 1234571490
    },
    
    userWithPreferredUsername: {
      oid: 'user-789',
      preferred_username: 'preferred@example.com',
      name: 'Preferred User'
    },
    
    userWithUpn: {
      oid: 'user-999',
      upn: 'upn@example.com',
      name: 'UPN User'
    },
    
    userWithoutRoles: {
      oid: 'user-no-roles',
      email: 'noroles@example.com',
      name: 'User Without Roles'
    },
    
    fullToken: {
      oid: 'user-full-123',
      email: 'full@example.com',
      name: 'Full Token User',
      roles: ['Admin'],
      iat: 1234567890,
      exp: 1234571490,
      aud: 'test-client-id-67890',
      iss: 'https://login.microsoftonline.com/test-tenant-id-12345/v2.0',
      sub: 'user-subject-123',
      tid: 'test-tenant-id-12345'
    }
  },
  
  // Token strings
  tokenStrings: {
    valid: 'Bearer eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.valid.token',
    expired: 'Bearer eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.expired.token',
    invalid: 'Bearer eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.invalid.token',
    malformed: 'Bearer malformed.token',
    noBearer: 'token-without-bearer',
    wrongFormat: 'InvalidFormat token123'
  },
  
  // Error types
  errors: {
    expired: {
      name: 'TokenExpiredError',
      message: 'jwt expired'
    },
    invalidSignature: {
      name: 'JsonWebTokenError',
      message: 'invalid signature'
    },
    malformed: {
      name: 'JsonWebTokenError',
      message: 'jwt malformed'
    },
    generic: {
      name: 'Error',
      message: 'Verification failed'
    }
  }
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Creates a mock request object with optional headers and user
 */
function createMockRequest(options = {}) {
  return {
    headers: options.headers || {},
    user: options.user || null,
    ...options.additional
  };
}

/**
 * Creates a mock response object with spies
 */
function createMockResponse() {
  return {
    writeHead: jest.fn(),
    end: jest.fn()
  };
}

/**
 * Creates a mock next function
 */
function createMockNext() {
  return jest.fn();
}

/**
 * Setup environment variables from fixture
 */
function setupEnvironment(envFixture = FIXTURES.validEnv) {
  Object.keys(envFixture).forEach(key => {
    process.env[key] = envFixture[key];
  });
}

/**
 * Clear specific environment variables
 */
function clearEnvironment(...keys) {
  keys.forEach(key => delete process.env[key]);
}

/**
 * Mock jwt.verify to return a specific decoded token
 */
function mockJwtVerifySuccess(decodedToken) {
  jwt.verify = jest.fn((token, getKey, options, callback) => {
    callback(null, decodedToken);
  });
}

/**
 * Mock jwt.verify to return an error
 */
function mockJwtVerifyError(error) {
  jwt.verify = jest.fn((token, getKey, options, callback) => {
    callback(error);
  });
}

/**
 * Parse JSON response from res.end mock
 */
function parseResponseJson(resMock) {
  if (resMock.end.mock.calls.length === 0) {
    return null;
  }
  const responseString = resMock.end.mock.calls[0][0];
  return JSON.parse(responseString);
}

/**
 * Assert 401 response with specific message
 */
function assertUnauthorizedResponse(res, expectedMessage) {
  expect(res.writeHead).toHaveBeenCalledWith(401, { 'Content-Type': 'application/json' });
  expect(res.end).toHaveBeenCalled();
  const response = parseResponseJson(res);
  expect(response.error).toBe('Unauthorized');
  if (expectedMessage) {
    expect(response.message).toContain(expectedMessage);
  }
}

/**
 * Assert 403 response
 */
function assertForbiddenResponse(res, expectedRoles) {
  expect(res.writeHead).toHaveBeenCalledWith(403, { 'Content-Type': 'application/json' });
  expect(res.end).toHaveBeenCalled();
  const response = parseResponseJson(res);
  expect(response.error).toBe('Forbidden');
  if (expectedRoles) {
    expect(response.message).toContain(expectedRoles.join(', '));
  }
}

/**
 * Assert 500 response
 */
function assertServerErrorResponse(res, expectedError) {
  expect(res.writeHead).toHaveBeenCalledWith(500, { 'Content-Type': 'application/json' });
  expect(res.end).toHaveBeenCalled();
  const response = parseResponseJson(res);
  expect(response.error).toBe(expectedError);
}

/**
 * Assert user object has expected properties
 */
function assertUserObject(user, expectedProps) {
  expect(user).toBeDefined();
  expect(user).toHaveProperty('oid');
  expect(user).toHaveProperty('email');
  expect(user).toHaveProperty('name');
  expect(user).toHaveProperty('isAuthenticated');
  
  if (expectedProps) {
    Object.keys(expectedProps).forEach(key => {
      expect(user[key]).toEqual(expectedProps[key]);
    });
  }
}

// ============================================================================
// TEST SUITE
// ============================================================================

// ============================================================================
// TEST SUITE
// ============================================================================

describe('Authentication Middleware', () => {
  // Spy on console methods to prevent test pollution
  let consoleLogSpy, consoleErrorSpy;

  beforeAll(() => {
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
  });

  afterAll(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  beforeEach(() => {
    setupEnvironment();
    jest.clearAllMocks();
  });

  afterEach(() => {
    clearEnvironment('AUTH_ENABLED', 'AZURE_AD_TENANT_ID', 'AZURE_AD_CLIENT_ID');
  });

  // ==========================================================================
  // AUTHENTICATE TOKEN MIDDLEWARE
  // ==========================================================================

  describe('authenticateToken - Authentication Bypass Mode', () => {
    it('should bypass authentication when AUTH_ENABLED=false', async () => {
      process.env.AUTH_ENABLED = 'false';
      const req = createMockRequest();
      const res = createMockResponse();
      const next = createMockNext();
      
      await authenticateToken(req, res, next);
      
      assertUserObject(req.user, {
        oid: 'local-dev-user',
        email: 'dev@localhost',
        name: 'Local Development User',
        isAuthenticated: false
      });
      expect(next).toHaveBeenCalledTimes(1);
      expect(res.writeHead).not.toHaveBeenCalled();
      expect(res.end).not.toHaveBeenCalled();
    });

    it('should not require Authorization header in bypass mode', async () => {
      process.env.AUTH_ENABLED = 'false';
      const req = createMockRequest(); // No auth header
      const res = createMockResponse();
      const next = createMockNext();
      
      await authenticateToken(req, res, next);
      
      expect(req.user).toBeDefined();
      expect(req.user.isAuthenticated).toBe(false);
      expect(next).toHaveBeenCalled();
      expect(res.end).not.toHaveBeenCalled();
    });

    it('should log bypass message in dev mode', async () => {
      process.env.AUTH_ENABLED = 'false';
      const req = createMockRequest();
      const res = createMockResponse();
      const next = createMockNext();
      
      await authenticateToken(req, res, next);
      
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('[Auth] Authentication bypassed')
      );
    });
  });

  describe('authenticateToken - Configuration Validation', () => {
    it('should return 500 if AZURE_AD_TENANT_ID is missing', async () => {
      clearEnvironment('AZURE_AD_TENANT_ID');
      const req = createMockRequest();
      const res = createMockResponse();
      const next = createMockNext();
      
      await authenticateToken(req, res, next);
      
      assertServerErrorResponse(res, 'Authentication not configured');
      const response = parseResponseJson(res);
      expect(response.message).toContain('AZURE_AD_TENANT_ID');
      expect(next).not.toHaveBeenCalled();
    });

    it('should return 500 if AZURE_AD_CLIENT_ID is missing', async () => {
      clearEnvironment('AZURE_AD_CLIENT_ID');
      const req = createMockRequest();
      const res = createMockResponse();
      const next = createMockNext();
      
      await authenticateToken(req, res, next);
      
      assertServerErrorResponse(res, 'Authentication not configured');
      const response = parseResponseJson(res);
      expect(response.message).toContain('AZURE_AD_CLIENT_ID');
      expect(next).not.toHaveBeenCalled();
    });

    it('should return 500 if both tenant and client IDs are missing', async () => {
      clearEnvironment('AZURE_AD_TENANT_ID', 'AZURE_AD_CLIENT_ID');
      const req = createMockRequest();
      const res = createMockResponse();
      const next = createMockNext();
      
      await authenticateToken(req, res, next);
      
      assertServerErrorResponse(res, 'Authentication not configured');
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('authenticateToken - Authorization Header Validation', () => {
    it('should return 401 if Authorization header is missing', async () => {
      const req = createMockRequest();
      const res = createMockResponse();
      const next = createMockNext();
      
      await authenticateToken(req, res, next);
      
      assertUnauthorizedResponse(res, 'No authorization header provided');
      expect(next).not.toHaveBeenCalled();
    });

    it('should return 401 if Authorization header has invalid format', async () => {
      const req = createMockRequest({
        headers: { authorization: FIXTURES.tokenStrings.wrongFormat }
      });
      const res = createMockResponse();
      const next = createMockNext();
      
      await authenticateToken(req, res, next);
      
      assertUnauthorizedResponse(res, 'Invalid authorization header format');
      expect(next).not.toHaveBeenCalled();
    });

    it('should return 401 if Bearer keyword is missing', async () => {
      const req = createMockRequest({
        headers: { authorization: FIXTURES.tokenStrings.noBearer }
      });
      const res = createMockResponse();
      const next = createMockNext();
      
      await authenticateToken(req, res, next);
      
      assertUnauthorizedResponse(res, 'Invalid authorization header format');
      expect(next).not.toHaveBeenCalled();
    });

    it('should return 401 for header with multiple spaces', async () => {
      const req = createMockRequest({
        headers: { authorization: 'Bearer  token  with  spaces' }
      });
      const res = createMockResponse();
      const next = createMockNext();
      
      await authenticateToken(req, res, next);
      
      assertUnauthorizedResponse(res);
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('authenticateToken - Valid Token Processing', () => {
    it('should accept valid JWT token and populate req.user', async () => {
      mockJwtVerifySuccess(FIXTURES.tokens.validUser);
      const req = createMockRequest({
        headers: { authorization: FIXTURES.tokenStrings.valid }
      });
      const res = createMockResponse();
      const next = createMockNext();
      
      await authenticateToken(req, res, next);
      
      assertUserObject(req.user, {
        oid: FIXTURES.tokens.validUser.oid,
        email: FIXTURES.tokens.validUser.email,
        name: FIXTURES.tokens.validUser.name,
        isAuthenticated: true,
        roles: FIXTURES.tokens.validUser.roles
      });
      expect(next).toHaveBeenCalledTimes(1);
      expect(res.end).not.toHaveBeenCalled();
    });

    it('should use preferred_username if email is not present', async () => {
      mockJwtVerifySuccess(FIXTURES.tokens.userWithPreferredUsername);
      const req = createMockRequest({
        headers: { authorization: FIXTURES.tokenStrings.valid }
      });
      const res = createMockResponse();
      const next = createMockNext();
      
      await authenticateToken(req, res, next);
      
      expect(req.user.email).toBe(FIXTURES.tokens.userWithPreferredUsername.preferred_username);
      expect(next).toHaveBeenCalled();
    });

    it('should use upn if email and preferred_username are not present', async () => {
      mockJwtVerifySuccess(FIXTURES.tokens.userWithUpn);
      const req = createMockRequest({
        headers: { authorization: FIXTURES.tokenStrings.valid }
      });
      const res = createMockResponse();
      const next = createMockNext();
      
      await authenticateToken(req, res, next);
      
      expect(req.user.email).toBe(FIXTURES.tokens.userWithUpn.upn);
      expect(next).toHaveBeenCalled();
    });

    it('should set empty roles array if roles not in token', async () => {
      mockJwtVerifySuccess(FIXTURES.tokens.userWithoutRoles);
      const req = createMockRequest({
        headers: { authorization: FIXTURES.tokenStrings.valid }
      });
      const res = createMockResponse();
      const next = createMockNext();
      
      await authenticateToken(req, res, next);
      
      expect(req.user.roles).toEqual([]);
      expect(next).toHaveBeenCalled();
    });

    it('should include full token payload in req.user.tokenPayload', async () => {
      mockJwtVerifySuccess(FIXTURES.tokens.fullToken);
      const req = createMockRequest({
        headers: { authorization: FIXTURES.tokenStrings.valid }
      });
      const res = createMockResponse();
      const next = createMockNext();
      
      await authenticateToken(req, res, next);
      
      expect(req.user.tokenPayload).toEqual(FIXTURES.tokens.fullToken);
      expect(req.user.tokenPayload).toHaveProperty('iat');
      expect(req.user.tokenPayload).toHaveProperty('exp');
      expect(req.user.tokenPayload).toHaveProperty('aud');
      expect(req.user.tokenPayload).toHaveProperty('iss');
      expect(next).toHaveBeenCalled();
    });

    it('should handle admin user with multiple roles', async () => {
      mockJwtVerifySuccess(FIXTURES.tokens.adminUser);
      const req = createMockRequest({
        headers: { authorization: FIXTURES.tokenStrings.valid }
      });
      const res = createMockResponse();
      const next = createMockNext();
      
      await authenticateToken(req, res, next);
      
      expect(req.user.roles).toHaveLength(2);
      expect(req.user.roles).toContain('Admin');
      expect(req.user.roles).toContain('PowerUser');
      expect(next).toHaveBeenCalled();
    });

    it('should log successful authentication', async () => {
      mockJwtVerifySuccess(FIXTURES.tokens.validUser);
      const req = createMockRequest({
        headers: { authorization: FIXTURES.tokenStrings.valid }
      });
      const res = createMockResponse();
      const next = createMockNext();
      
      await authenticateToken(req, res, next);
      
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining(`[Auth] User authenticated: ${FIXTURES.tokens.validUser.email}`)
      );
    });
  });

  describe('authenticateToken - Token Expiration', () => {
    it('should return 401 for expired token', async () => {
      const expiredError = new Error(FIXTURES.errors.expired.message);
      expiredError.name = FIXTURES.errors.expired.name;
      mockJwtVerifyError(expiredError);
      
      const req = createMockRequest({
        headers: { authorization: FIXTURES.tokenStrings.expired }
      });
      const res = createMockResponse();
      const next = createMockNext();
      
      await authenticateToken(req, res, next);
      
      expect(res.writeHead).toHaveBeenCalledWith(401, { 'Content-Type': 'application/json' });
      expect(res.end).toHaveBeenCalled();
      const response = parseResponseJson(res);
      expect(response.error).toBe('Token Expired');
      expect(response.message).toContain('session has expired');
      expect(next).not.toHaveBeenCalled();
    });

    it('should log error for expired token', async () => {
      const expiredError = new Error(FIXTURES.errors.expired.message);
      expiredError.name = FIXTURES.errors.expired.name;
      mockJwtVerifyError(expiredError);
      
      const req = createMockRequest({
        headers: { authorization: FIXTURES.tokenStrings.expired }
      });
      const res = createMockResponse();
      const next = createMockNext();
      
      await authenticateToken(req, res, next);
      
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('[Auth] Token verification failed'),
        expect.any(String)
      );
    });
  });

  describe('authenticateToken - Invalid Tokens', () => {
    it('should return 401 for invalid token signature', async () => {
      const invalidError = new Error(FIXTURES.errors.invalidSignature.message);
      invalidError.name = FIXTURES.errors.invalidSignature.name;
      mockJwtVerifyError(invalidError);
      
      const req = createMockRequest({
        headers: { authorization: FIXTURES.tokenStrings.invalid }
      });
      const res = createMockResponse();
      const next = createMockNext();
      
      await authenticateToken(req, res, next);
      
      expect(res.writeHead).toHaveBeenCalledWith(401, { 'Content-Type': 'application/json' });
      expect(res.end).toHaveBeenCalled();
      const response = parseResponseJson(res);
      expect(response.error).toBe('Invalid Token');
      expect(response.message).toContain('invalid');
      expect(next).not.toHaveBeenCalled();
    });

    it('should return 401 for malformed token', async () => {
      const malformedError = new Error(FIXTURES.errors.malformed.message);
      malformedError.name = FIXTURES.errors.malformed.name;
      mockJwtVerifyError(malformedError);
      
      const req = createMockRequest({
        headers: { authorization: FIXTURES.tokenStrings.malformed }
      });
      const res = createMockResponse();
      const next = createMockNext();
      
      await authenticateToken(req, res, next);
      
      expect(res.writeHead).toHaveBeenCalledWith(401, { 'Content-Type': 'application/json' });
      expect(res.end).toHaveBeenCalled();
      const response = parseResponseJson(res);
      expect(response.error).toBe('Invalid Token');
      expect(next).not.toHaveBeenCalled();
    });

    it('should return 401 for generic verification errors', async () => {
      const genericError = new Error(FIXTURES.errors.generic.message);
      genericError.name = FIXTURES.errors.generic.name;
      mockJwtVerifyError(genericError);
      
      const req = createMockRequest({
        headers: { authorization: FIXTURES.tokenStrings.valid }
      });
      const res = createMockResponse();
      const next = createMockNext();
      
      await authenticateToken(req, res, next);
      
      assertUnauthorizedResponse(res, 'Authentication failed');
      expect(next).not.toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // OPTIONAL AUTH MIDDLEWARE
  // ==========================================================================

  describe('optionalAuth - Authentication Bypass Mode', () => {
    it('should bypass authentication when AUTH_ENABLED=false', async () => {
      process.env.AUTH_ENABLED = 'false';
      const req = createMockRequest();
      const res = createMockResponse();
      const next = createMockNext();
      
      await optionalAuth(req, res, next);
      
      assertUserObject(req.user, {
        oid: 'local-dev-user',
        email: 'dev@localhost',
        isAuthenticated: false
      });
      expect(next).toHaveBeenCalled();
      expect(res.end).not.toHaveBeenCalled();
    });
  });

  describe('optionalAuth - Valid Token Processing', () => {
    it('should authenticate if valid token is provided', async () => {
      mockJwtVerifySuccess(FIXTURES.tokens.validUser);
      const req = createMockRequest({
        headers: { authorization: FIXTURES.tokenStrings.valid }
      });
      const res = createMockResponse();
      const next = createMockNext();
      
      await optionalAuth(req, res, next);
      
      assertUserObject(req.user, {
        oid: FIXTURES.tokens.validUser.oid,
        email: FIXTURES.tokens.validUser.email,
        isAuthenticated: true
      });
      expect(next).toHaveBeenCalled();
      expect(res.end).not.toHaveBeenCalled();
    });

    it('should continue even if token is invalid', async () => {
      const invalidError = new Error(FIXTURES.errors.invalidSignature.message);
      invalidError.name = FIXTURES.errors.invalidSignature.name;
      mockJwtVerifyError(invalidError);
      
      const req = createMockRequest({
        headers: { authorization: FIXTURES.tokenStrings.invalid }
      });
      const res = createMockResponse();
      const next = createMockNext();
      
      await optionalAuth(req, res, next);
      
      expect(req.user).toBeNull();
      expect(next).toHaveBeenCalled();
      expect(res.end).not.toHaveBeenCalled();
    });

    it('should continue without user if no token is provided', async () => {
      const req = createMockRequest();
      const res = createMockResponse();
      const next = createMockNext();
      
      await optionalAuth(req, res, next);
      
      expect(req.user).toBeNull();
      expect(next).toHaveBeenCalled();
      expect(res.end).not.toHaveBeenCalled();
    });

    it('should log optional auth failures', async () => {
      const invalidError = new Error(FIXTURES.errors.invalidSignature.message);
      invalidError.name = FIXTURES.errors.invalidSignature.name;
      mockJwtVerifyError(invalidError);
      
      const req = createMockRequest({
        headers: { authorization: FIXTURES.tokenStrings.invalid }
      });
      const res = createMockResponse();
      const next = createMockNext();
      
      await optionalAuth(req, res, next);
      
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('[Auth] Optional authentication failed')
      );
      expect(next).toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // REQUIRE ROLE MIDDLEWARE
  // ==========================================================================

  describe('requireRole - Authentication Bypass Mode', () => {
    it('should bypass role check when AUTH_ENABLED=false', async () => {
      process.env.AUTH_ENABLED = 'false';
      const middleware = requireRole('Admin');
      const req = createMockRequest();
      req.user = { isAuthenticated: false, roles: [] };
      const res = createMockResponse();
      const next = createMockNext();
      
      middleware(req, res, next);
      
      expect(next).toHaveBeenCalled();
      expect(res.end).not.toHaveBeenCalled();
    });

    it('should log bypass message in dev mode', async () => {
      process.env.AUTH_ENABLED = 'false';
      const middleware = requireRole('Admin');
      const req = createMockRequest();
      req.user = { isAuthenticated: false };
      const res = createMockResponse();
      const next = createMockNext();
      
      middleware(req, res, next);
      
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('[Auth] Role check bypassed')
      );
    });
  });

  describe('requireRole - User Not Authenticated', () => {
    it('should return 401 if req.user is not set', () => {
      const middleware = requireRole('Admin');
      const req = createMockRequest();
      const res = createMockResponse();
      const next = createMockNext();
      
      middleware(req, res, next);
      
      assertUnauthorizedResponse(res, 'Authentication required');
      expect(next).not.toHaveBeenCalled();
    });

    it('should return 401 if user is not authenticated', () => {
      const middleware = requireRole('Admin');
      const req = createMockRequest();
      req.user = { isAuthenticated: false, roles: [] };
      const res = createMockResponse();
      const next = createMockNext();
      
      middleware(req, res, next);
      
      assertUnauthorizedResponse(res, 'Authentication required');
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('requireRole - Single Role Validation', () => {
    it('should allow access if user has exact role', () => {
      const middleware = requireRole('Admin');
      const req = createMockRequest();
      req.user = {
        isAuthenticated: true,
        roles: ['Admin', 'User'],
        email: 'admin@example.com'
      };
      const res = createMockResponse();
      const next = createMockNext();
      
      middleware(req, res, next);
      
      expect(next).toHaveBeenCalled();
      expect(res.end).not.toHaveBeenCalled();
    });

    it('should deny access if user does not have required role', () => {
      const middleware = requireRole('Admin');
      const req = createMockRequest();
      req.user = {
        isAuthenticated: true,
        roles: ['User'],
        email: 'user@example.com'
      };
      const res = createMockResponse();
      const next = createMockNext();
      
      middleware(req, res, next);
      
      assertForbiddenResponse(res);
      const response = parseResponseJson(res);
      expect(response.message).toContain('requires one of the following roles');
      expect(response.requiredRoles).toEqual(['Admin']);
      expect(response.userRoles).toEqual(['User']);
      expect(next).not.toHaveBeenCalled();
    });

    it('should deny access if user has no roles', () => {
      const middleware = requireRole('Admin');
      const req = createMockRequest();
      req.user = {
        isAuthenticated: true,
        roles: [],
        email: 'user@example.com'
      };
      const res = createMockResponse();
      const next = createMockNext();
      
      middleware(req, res, next);
      
      assertForbiddenResponse(res);
      expect(next).not.toHaveBeenCalled();
    });

    it('should log successful role check', () => {
      const middleware = requireRole('Admin');
      const req = createMockRequest();
      req.user = {
        isAuthenticated: true,
        roles: ['Admin'],
        email: 'admin@example.com'
      };
      const res = createMockResponse();
      const next = createMockNext();
      
      middleware(req, res, next);
      
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('[Auth] Role check passed for admin@example.com')
      );
    });

    it('should log failed role check', () => {
      const middleware = requireRole('Admin');
      const req = createMockRequest();
      req.user = {
        isAuthenticated: true,
        roles: ['User'],
        email: 'user@example.com'
      };
      const res = createMockResponse();
      const next = createMockNext();
      
      middleware(req, res, next);
      
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('[Auth] Role check failed for user@example.com')
      );
    });
  });

  describe('requireRole - Multiple Roles Validation', () => {
    it('should allow access if user has any of the required roles', () => {
      const middleware = requireRole(['Admin', 'PowerUser']);
      const req = createMockRequest();
      req.user = {
        isAuthenticated: true,
        roles: ['PowerUser'],
        email: 'poweruser@example.com'
      };
      const res = createMockResponse();
      const next = createMockNext();
      
      middleware(req, res, next);
      
      expect(next).toHaveBeenCalled();
      expect(res.end).not.toHaveBeenCalled();
    });

    it('should allow access if user has multiple matching roles', () => {
      const middleware = requireRole(['Admin', 'PowerUser']);
      const req = createMockRequest();
      req.user = {
        isAuthenticated: true,
        roles: ['Admin', 'PowerUser', 'User'],
        email: 'admin@example.com'
      };
      const res = createMockResponse();
      const next = createMockNext();
      
      middleware(req, res, next);
      
      expect(next).toHaveBeenCalled();
      expect(res.end).not.toHaveBeenCalled();
    });

    it('should deny access if user has none of the required roles', () => {
      const middleware = requireRole(['Admin', 'PowerUser']);
      const req = createMockRequest();
      req.user = {
        isAuthenticated: true,
        roles: ['User', 'Guest'],
        email: 'user@example.com'
      };
      const res = createMockResponse();
      const next = createMockNext();
      
      middleware(req, res, next);
      
      assertForbiddenResponse(res);
      const response = parseResponseJson(res);
      expect(response.requiredRoles).toEqual(['Admin', 'PowerUser']);
      expect(response.userRoles).toEqual(['User', 'Guest']);
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('requireRole - Case Sensitivity', () => {
    it('should perform case-sensitive role matching', () => {
      const middleware = requireRole('Admin');
      const req = createMockRequest();
      req.user = {
        isAuthenticated: true,
        roles: ['admin'], // lowercase
        email: 'user@example.com'
      };
      const res = createMockResponse();
      const next = createMockNext();
      
      middleware(req, res, next);
      
      assertForbiddenResponse(res);
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('requireRole - Edge Cases', () => {
    it('should handle empty roles array for user', () => {
      const middleware = requireRole('Admin');
      const req = createMockRequest();
      req.user = {
        isAuthenticated: true,
        roles: [],
        email: 'user@example.com'
      };
      const res = createMockResponse();
      const next = createMockNext();
      
      middleware(req, res, next);
      
      assertForbiddenResponse(res);
      expect(next).not.toHaveBeenCalled();
    });

    it('should handle undefined roles for user', () => {
      const middleware = requireRole('Admin');
      const req = createMockRequest();
      req.user = {
        isAuthenticated: true,
        // No roles property
        email: 'user@example.com'
      };
      const res = createMockResponse();
      const next = createMockNext();
      
      middleware(req, res, next);
      
      assertForbiddenResponse(res);
      expect(next).not.toHaveBeenCalled();
    });

    it('should handle special characters in role names', () => {
      const middleware = requireRole('Role.With.Dots');
      const req = createMockRequest();
      req.user = {
        isAuthenticated: true,
        roles: ['Role.With.Dots'],
        email: 'user@example.com'
      };
      const res = createMockResponse();
      const next = createMockNext();
      
      middleware(req, res, next);
      
      expect(next).toHaveBeenCalled();
      expect(res.end).not.toHaveBeenCalled();
    });
  });
});
