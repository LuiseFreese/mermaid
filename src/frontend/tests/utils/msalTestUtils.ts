import { AccountInfo, IPublicClientApplication, AuthenticationResult } from '@azure/msal-browser';
import { vi } from 'vitest';

const FIXTURES = {
  ACCOUNTS: {
    STANDARD: {
      homeAccountId: 'test-home-account-id',
      environment: 'login.windows.net',
      tenantId: 'test-tenant-id',
      username: 'jane.smith@contoso.com',
      localAccountId: 'test-local-account-id',
      name: 'Jane Smith',
      idTokenClaims: {
        aud: 'test-client-id',
        iss: 'https://login.microsoftonline.com/test-tenant-id/v2.0',
        iat: Date.now() / 1000,
        exp: (Date.now() / 1000) + 3600,
        name: 'Jane Smith',
        preferred_username: 'jane.smith@contoso.com',
        oid: 'test-object-id',
        sub: 'test-subject',
        tid: 'test-tenant-id',
      },
    } as AccountInfo,

    NO_NAME: {
      homeAccountId: 'test-home-account-id-2',
      environment: 'login.windows.net',
      tenantId: 'test-tenant-id',
      username: 'user.noname@contoso.com',
      localAccountId: 'test-local-account-id-2',
      name: undefined,
      idTokenClaims: {
        aud: 'test-client-id',
        iss: 'https://login.microsoftonline.com/test-tenant-id/v2.0',
        iat: Date.now() / 1000,
        exp: (Date.now() / 1000) + 3600,
        preferred_username: 'user.noname@contoso.com',
        oid: 'test-object-id-2',
        sub: 'test-subject-2',
        tid: 'test-tenant-id',
      },
    } as AccountInfo,

    LONG_NAME: {
      homeAccountId: 'test-home-account-id-3',
      environment: 'login.windows.net',
      tenantId: 'test-tenant-id',
      username: 'alexander.christopher@contoso.com',
      localAccountId: 'test-local-account-id-3',
      name: 'Alexander Benjamin Christopher Davidson',
      idTokenClaims: {
        aud: 'test-client-id',
        iss: 'https://login.microsoftonline.com/test-tenant-id/v2.0',
        iat: Date.now() / 1000,
        exp: (Date.now() / 1000) + 3600,
        name: 'Alexander Benjamin Christopher Davidson',
        preferred_username: 'alexander.christopher@contoso.com',
        oid: 'test-object-id-3',
        sub: 'test-subject-3',
        tid: 'test-tenant-id',
      },
    } as AccountInfo,

    ADMIN: {
      homeAccountId: 'admin-home-account-id',
      environment: 'login.windows.net',
      tenantId: 'test-tenant-id',
      username: 'admin@contoso.com',
      localAccountId: 'admin-local-account-id',
      name: 'Admin User',
      idTokenClaims: {
        aud: 'test-client-id',
        iss: 'https://login.microsoftonline.com/test-tenant-id/v2.0',
        iat: Date.now() / 1000,
        exp: (Date.now() / 1000) + 3600,
        name: 'Admin User',
        preferred_username: 'admin@contoso.com',
        oid: 'admin-object-id',
        sub: 'admin-subject',
        tid: 'test-tenant-id',
        roles: ['Admin'],
      },
    } as AccountInfo,
  },

  TOKENS: {
    VALID: {
      accessToken: 'eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiIsImtpZCI6InRlc3Qta2V5In0.test-payload.test-signature',
      expiresOn: new Date(Date.now() + 3600000),
      tokenType: 'Bearer',
      scopes: ['User.Read'],
    },
    EXPIRED: {
      accessToken: 'eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiIsImtpZCI6ImV4cGlyZWQta2V5In0.expired-payload.expired-signature',
      expiresOn: new Date(Date.now() - 3600000),
      tokenType: 'Bearer',
      scopes: ['User.Read'],
    },
    ADMIN: {
      accessToken: 'eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiIsImtpZCI6ImFkbWluLWtleSJ9.admin-payload.admin-signature',
      expiresOn: new Date(Date.now() + 3600000),
      tokenType: 'Bearer',
      scopes: ['User.Read', 'User.ReadWrite.All'],
    },
  },

  IN_PROGRESS_STATES: {
    NONE: 'none' as const,
    STARTUP: 'startup' as const,
    LOGIN: 'login' as const,
    LOGOUT: 'logout' as const,
    SSO_SILENT: 'ssoSilent' as const,
    ACQUIRE_TOKEN: 'acquireToken' as const,
    HANDLE_REDIRECT: 'handleRedirect' as const,
  },
};

function createMockMsalInstance(overrides?: Partial<IPublicClientApplication>): IPublicClientApplication {
  return {
    initialize: vi.fn().mockResolvedValue(undefined),
    getAllAccounts: vi.fn().mockReturnValue([FIXTURES.ACCOUNTS.STANDARD]),
    getActiveAccount: vi.fn().mockReturnValue(FIXTURES.ACCOUNTS.STANDARD),
    setActiveAccount: vi.fn(),
    acquireTokenSilent: vi.fn().mockResolvedValue({
      accessToken: FIXTURES.TOKENS.VALID.accessToken,
      account: FIXTURES.ACCOUNTS.STANDARD,
      expiresOn: FIXTURES.TOKENS.VALID.expiresOn,
      tokenType: FIXTURES.TOKENS.VALID.tokenType,
      scopes: FIXTURES.TOKENS.VALID.scopes,
    } as AuthenticationResult),
    acquireTokenPopup: vi.fn().mockResolvedValue({
      accessToken: FIXTURES.TOKENS.VALID.accessToken,
      account: FIXTURES.ACCOUNTS.STANDARD,
    } as AuthenticationResult),
    acquireTokenRedirect: vi.fn().mockResolvedValue(undefined),
    loginPopup: vi.fn().mockResolvedValue({
      accessToken: FIXTURES.TOKENS.VALID.accessToken,
      account: FIXTURES.ACCOUNTS.STANDARD,
    } as AuthenticationResult),
    loginRedirect: vi.fn().mockResolvedValue(undefined),
    logout: vi.fn().mockResolvedValue(undefined),
    logoutRedirect: vi.fn().mockResolvedValue(undefined),
    logoutPopup: vi.fn().mockResolvedValue(undefined),
    addEventCallback: vi.fn().mockReturnValue('mock-callback-id'),
    removeEventCallback: vi.fn(),
    handleRedirectPromise: vi.fn().mockResolvedValue(null),
    ...overrides,
  } as unknown as IPublicClientApplication;
}

function createMsalContext(
  accounts: AccountInfo[] = [FIXTURES.ACCOUNTS.STANDARD],
  inProgress: 'startup' | 'login' | 'logout' | 'ssoSilent' | 'acquireToken' | 'handleRedirect' | 'none' = 'none',
  instanceOverrides?: Partial<IPublicClientApplication>
) {
  return {
    instance: createMockMsalInstance(instanceOverrides),
    accounts,
    inProgress,
    logger: {
      error: vi.fn(),
      warning: vi.fn(),
      info: vi.fn(),
      verbose: vi.fn(),
    },
  };
}

function setupMsalMock(useMsalFn: ReturnType<typeof vi.fn>) {
  return (context: ReturnType<typeof createMsalContext>) => {
    useMsalFn.mockReturnValue(context);
    return context;
  };
}

function waitForAuthRedirect() {
  return new Promise((resolve) => setTimeout(resolve, 100));
}

function simulateLoginSuccess(instance: IPublicClientApplication, account: AccountInfo) {
  vi.mocked(instance.getAllAccounts).mockReturnValue([account]);
  vi.mocked(instance.getActiveAccount).mockReturnValue(account);
}

function simulateLoginFailure(instance: IPublicClientApplication, error: Error) {
  vi.mocked(instance.loginRedirect).mockRejectedValue(error);
}

function simulateLogout(instance: IPublicClientApplication) {
  vi.mocked(instance.getAllAccounts).mockReturnValue([]);
  vi.mocked(instance.getActiveAccount).mockReturnValue(null);
}

function getInitials(displayName: string): string {
  return displayName
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .substring(0, 2);
}

export {
  FIXTURES,
  createMockMsalInstance,
  createMsalContext,
  setupMsalMock,
  waitForAuthRedirect,
  simulateLoginSuccess,
  simulateLoginFailure,
  simulateLogout,
  getInitials,
};
