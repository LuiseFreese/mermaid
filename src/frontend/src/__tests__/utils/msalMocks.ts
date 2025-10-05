import { AccountInfo, IPublicClientApplication } from '@azure/msal-browser';
import { vi } from 'vitest';

export const MOCK_ACCOUNT: AccountInfo = {
  homeAccountId: 'test-home-account-id',
  environment: 'login.windows.net',
  tenantId: 'test-tenant-id',
  username: 'test.user@contoso.com',
  localAccountId: 'test-local-account-id',
  name: 'Test User',
  idTokenClaims: {
    aud: 'test-client-id',
    iss: 'https://login.microsoftonline.com/test-tenant-id/v2.0',
    iat: Date.now() / 1000,
    exp: (Date.now() / 1000) + 3600,
    name: 'Test User',
    preferred_username: 'test.user@contoso.com',
    oid: 'test-object-id',
    sub: 'test-subject',
    tid: 'test-tenant-id',
  },
};

export const MOCK_ACCOUNT_NO_NAME: AccountInfo = {
  ...MOCK_ACCOUNT,
  name: undefined,
};

export const MOCK_ACCOUNT_LONG_NAME: AccountInfo = {
  ...MOCK_ACCOUNT,
  name: 'Dr. Alexander Benjamin Christopher',
};

export const createMockMsalInstance = (overrides?: Partial<IPublicClientApplication>): IPublicClientApplication => {
  return {
    initialize: vi.fn().mockResolvedValue(undefined),
    getAllAccounts: vi.fn().mockReturnValue([MOCK_ACCOUNT]),
    getActiveAccount: vi.fn().mockReturnValue(MOCK_ACCOUNT),
    setActiveAccount: vi.fn(),
    acquireTokenSilent: vi.fn().mockResolvedValue({
      accessToken: 'mock-access-token',
      account: MOCK_ACCOUNT,
    }),
    acquireTokenPopup: vi.fn().mockResolvedValue({
      accessToken: 'mock-access-token',
      account: MOCK_ACCOUNT,
    }),
    acquireTokenRedirect: vi.fn().mockResolvedValue(undefined),
    loginPopup: vi.fn().mockResolvedValue({
      accessToken: 'mock-access-token',
      account: MOCK_ACCOUNT,
    }),
    loginRedirect: vi.fn().mockResolvedValue(undefined),
    logout: vi.fn().mockResolvedValue(undefined),
    logoutRedirect: vi.fn().mockResolvedValue(undefined),
    logoutPopup: vi.fn().mockResolvedValue(undefined),
    addEventCallback: vi.fn().mockReturnValue('callback-id'),
    removeEventCallback: vi.fn(),
    handleRedirectPromise: vi.fn().mockResolvedValue(null),
    ...overrides,
  } as unknown as IPublicClientApplication;
};

export const createMockMsalContext = (
  accounts: AccountInfo[] = [MOCK_ACCOUNT],
  inProgress: 'startup' | 'login' | 'logout' | 'ssoSilent' | 'acquireToken' | 'handleRedirect' | 'none' = 'none'
) => ({
  instance: createMockMsalInstance(),
  accounts,
  inProgress,
  logger: {
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
    verbose: vi.fn(),
  },
});

export const mockUseMsal = (context: ReturnType<typeof createMockMsalContext>) => {
  return vi.fn(() => context);
};
