import { Configuration, LogLevel, RedirectRequest } from '@azure/msal-browser';

/**
 * Azure AD Configuration for MSAL
 * 
 * Environment Variables Required:
 * - VITE_AZURE_AD_CLIENT_ID: Application (client) ID from Azure AD App Registration
 * - VITE_AZURE_AD_TENANT_ID: Directory (tenant) ID from Azure AD
 * - VITE_AZURE_AD_REDIRECT_URI: Redirect URI configured in Azure AD (defaults to current origin)
 */

// Get configuration from environment variables
const clientId = import.meta.env.VITE_AZURE_AD_CLIENT_ID;
const tenantId = import.meta.env.VITE_AZURE_AD_TENANT_ID;
const redirectUri = import.meta.env.VITE_AZURE_AD_REDIRECT_URI || window.location.origin;

// Validate required configuration
// Validate required configuration (log errors but do not throw)
if (!clientId) {
  console.error(
    'VITE_AZURE_AD_CLIENT_ID is not configured. Please set this environment variable or create a .env.local file. See docs/AZURE-AD-SETUP.md for setup instructions.'
  );
}

if (!tenantId) {
  console.error(
    'VITE_AZURE_AD_TENANT_ID is not configured. Please set this environment variable or create a .env.local file. See docs/AZURE-AD-SETUP.md for setup instructions.'
  );
}
/**
 * MSAL Configuration
 * https://learn.microsoft.com/en-us/azure/active-directory/develop/msal-js-initializing-client-applications
 */
export const msalConfig: Configuration = {
  auth: {
    clientId,
    authority: `https://login.microsoftonline.com/${tenantId}`,
    redirectUri,
    postLogoutRedirectUri: redirectUri,
    navigateToLoginRequestUrl: true,
  },
  cache: {
    cacheLocation: 'sessionStorage', // Use sessionStorage for security (cleared on browser close)
    storeAuthStateInCookie: false,   // Set to true if you have issues on IE11 or Edge
  },
  system: {
    loggerOptions: {
      loggerCallback: (level: LogLevel, message: string, containsPii: boolean) => {
        if (containsPii) return;

        switch (level) {
          case LogLevel.Error:
            console.error('[MSAL]', message);
            break;
          case LogLevel.Info:
            console.info('[MSAL]', message);
            break;
          case LogLevel.Verbose:
            console.debug('[MSAL]', message);
            break;
          case LogLevel.Warning:
            console.warn('[MSAL]', message);
            break;
        }
      },
      logLevel: import.meta.env.DEV ? LogLevel.Verbose : LogLevel.Warning,
    },
    windowHashTimeout: 60000,
    iframeHashTimeout: 6000,
    loadFrameTimeout: 0,
  },
};

/**
 * Scopes to request during login
 * https://learn.microsoft.com/en-us/azure/active-directory/develop/v2-permissions-and-consent
 */
export const loginRequest: RedirectRequest = {
  scopes: ['User.Read'], // Minimal permission - read user profile
};

/**
 * Scopes to request for API access
 * The access token will include these scopes and can be sent to the backend API
 */
export const apiRequest: RedirectRequest = {
  scopes: [`api://${clientId}/access_as_user`], // Custom API scope (optional)
};

/**
 * Graph API endpoint
 * https://learn.microsoft.com/en-us/graph/api/overview
 */
export const graphConfig = {
  graphMeEndpoint: 'https://graph.microsoft.com/v1.0/me',
};

/**
 * Configuration summary for debugging
 */
export const authConfigSummary = {
  clientId,
  tenantId,
  redirectUri,
  authority: msalConfig.auth.authority,
  cacheLocation: msalConfig.cache?.cacheLocation || 'sessionStorage',
  environment: import.meta.env.MODE,
};

// Log configuration in development
if (import.meta.env.DEV) {
  console.log('[Auth Config]', authConfigSummary);
}
