import { describe, it, expect, vi } from 'vitest';
import { msalConfig, loginRequest, apiRequest, graphConfig, authConfigSummary } from '../../../src/auth/authConfig';

/**
 * Tests for authConfig.ts
 * 
 * Note: authConfig.ts is loaded at module initialization. These tests verify
 * the configuration structure using the already-loaded module instead of
 * dynamic imports to avoid environment variable caching issues.
 */
describe('authConfig', () => {
  describe('Configuration Structure', () => {
    it('exports msalConfig with required auth properties', () => {
      expect(msalConfig).toBeDefined();
      expect(msalConfig.auth).toBeDefined();
      expect(msalConfig.auth.clientId).toBe('test-client-id');
      expect(msalConfig.auth.authority).toContain('test-tenant-id');
      expect(msalConfig.auth.authority).toContain('login.microsoftonline.com');
      expect(msalConfig.auth.redirectUri).toBeDefined();
    });

    it('exports loginRequest with User.Read scope', () => {
      expect(loginRequest).toBeDefined();
      expect(loginRequest.scopes).toContain('User.Read');
    });

    it('exports apiRequest with custom API scope', () => {
      expect(apiRequest).toBeDefined();
      expect(apiRequest.scopes).toHaveLength(1);
      expect(apiRequest.scopes[0]).toContain('api://');
      expect(apiRequest.scopes[0]).toContain('/access_as_user');
    });

    it('exports graphConfig with Graph API endpoint', () => {
      expect(graphConfig).toBeDefined();
      expect(graphConfig.graphMeEndpoint).toBe('https://graph.microsoft.com/v1.0/me');
    });

    it('exports authConfigSummary with configuration details', () => {
      expect(authConfigSummary).toBeDefined();
      expect(authConfigSummary.clientId).toBeDefined();
      expect(authConfigSummary.tenantId).toBeDefined();
      expect(authConfigSummary.authority).toContain('login.microsoftonline.com');
      expect(authConfigSummary.cacheLocation).toBeDefined();
      expect(authConfigSummary.environment).toBeDefined();
    });
  });

  describe('MSAL Configuration Options', () => {
    it('configures cache location as sessionStorage', () => {
      expect(msalConfig.cache?.cacheLocation).toBe('sessionStorage');
    });

    it('disables storing auth state in cookie by default', () => {
      expect(msalConfig.cache?.storeAuthStateInCookie).toBe(false);
    });

    it('sets postLogoutRedirectUri to match redirectUri', () => {
      expect(msalConfig.auth.postLogoutRedirectUri).toBe(msalConfig.auth.redirectUri);
    });

    it('enables navigation to login request URL', () => {
      expect(msalConfig.auth.navigateToLoginRequestUrl).toBe(true);
    });

    it('configures logger options', () => {
      expect(msalConfig.system?.loggerOptions).toBeDefined();
      expect(msalConfig.system?.loggerOptions?.loggerCallback).toBeTypeOf('function');
    });
  });

  describe('Authority URL Construction', () => {
    it('constructs authority URL with tenant ID', () => {
      expect(msalConfig.auth.authority).toContain('login.microsoftonline.com');
      expect(msalConfig.auth.authority).toContain('test-tenant-id');
      expect(msalConfig.auth.authority).toBe('https://login.microsoftonline.com/test-tenant-id');
    });

    it('uses correct Microsoft login endpoint', () => {
      expect(msalConfig.auth.authority).toContain('login.microsoftonline.com');
      expect(msalConfig.auth.authority).toMatch(/^https:\/\/login\.microsoftonline\.com\/.+$/);
    });
  });

  describe('API Scope Configuration', () => {
    it('constructs API scope with client ID', () => {
      expect(apiRequest.scopes[0]).toContain('test-client-id');
      expect(apiRequest.scopes[0]).toBe('api://test-client-id/access_as_user');
    });

    it('uses correct API scope format', () => {
      const apiScope = apiRequest.scopes[0];
      expect(apiScope).toMatch(/^api:\/\/.+\/access_as_user$/);
    });
  });

  describe('Logger Configuration', () => {
    it('provides logger callback function', () => {
      const loggerCallback = msalConfig.system?.loggerOptions?.loggerCallback;
      expect(loggerCallback).toBeTypeOf('function');
    });

    it('filters PII from logs', () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const loggerCallback = msalConfig.system?.loggerOptions?.loggerCallback;

      if (loggerCallback) {
        // Call with PII flag true - should not log
        loggerCallback(0, 'Error message with PII', true);
        expect(consoleErrorSpy).not.toHaveBeenCalled();

        // Call with PII flag false - should log
        loggerCallback(0, 'Error message without PII', false);
        expect(consoleErrorSpy).toHaveBeenCalledWith('[MSAL]', 'Error message without PII');
      }

      consoleErrorSpy.mockRestore();
    });
  });

  describe('Configuration Summary', () => {
    it('includes all essential configuration values', () => {
      expect(authConfigSummary.clientId).toBe('test-client-id');
      expect(authConfigSummary.tenantId).toBe('test-tenant-id');
      expect(authConfigSummary.redirectUri).toBeDefined();
      expect(authConfigSummary.authority).toContain('test-tenant-id');
      expect(authConfigSummary.cacheLocation).toBe('sessionStorage');
      expect(authConfigSummary.environment).toBeDefined();
    });
  });
});
