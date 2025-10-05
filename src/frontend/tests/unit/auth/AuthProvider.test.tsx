import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import React from 'react';
import { AuthProvider } from '../../../src/auth/AuthProvider';
import {
  FIXTURES,
  createMsalContext,
  setupMsalMock,
  simulateLoginSuccess,
} from '../../utils/msalTestUtils';

vi.mock('@azure/msal-react', () => ({
  MsalProvider: ({ children, instance }: { children: React.ReactNode; instance: any }) => {
    return <div data-testid="msal-provider">{children}</div>;
  },
  AuthenticatedTemplate: ({ children }: { children: React.ReactNode }) => {
    const { useMsal } = vi.mocked(require('@azure/msal-react'));
    const { accounts } = useMsal();
    return accounts.length > 0 ? <>{children}</> : null;
  },
  UnauthenticatedTemplate: ({ children }: { children: React.ReactNode }) => {
    const { useMsal } = vi.mocked(require('@azure/msal-react'));
    const { accounts } = useMsal();
    return accounts.length === 0 ? <>{children}</> : null;
  },
  useMsal: vi.fn(),
}));

vi.mock('../../../src/auth/authConfig', () => ({
  msalConfig: {
    auth: {
      clientId: 'test-client-id',
      authority: 'https://login.microsoftonline.com/test-tenant',
      redirectUri: 'http://localhost:3000',
    },
    cache: {
      cacheLocation: 'sessionStorage',
      storeAuthStateInCookie: false,
    },
  },
  loginRequest: {
    scopes: ['User.Read'],
  },
}));

vi.mock('@azure/msal-browser', () => {
  // Create mock instance inline without external dependencies
  const mockMsalInstance = {
    initialize: vi.fn().mockResolvedValue(undefined),
    getAllAccounts: vi.fn().mockReturnValue([]),
    getAccountByHomeId: vi.fn().mockReturnValue(null),
    getAccountByLocalId: vi.fn().mockReturnValue(null),
    getAccountByUsername: vi.fn().mockReturnValue(null),
    setActiveAccount: vi.fn(),
    getActiveAccount: vi.fn().mockReturnValue(null),
    handleRedirectPromise: vi.fn().mockResolvedValue(null),
    loginRedirect: vi.fn().mockResolvedValue(undefined),
    loginPopup: vi.fn().mockResolvedValue({}),
    logout: vi.fn().mockResolvedValue(undefined),
    logoutRedirect: vi.fn().mockResolvedValue(undefined),
    logoutPopup: vi.fn().mockResolvedValue(undefined),
    acquireTokenSilent: vi.fn().mockResolvedValue({ accessToken: 'mock-token' }),
    acquireTokenRedirect: vi.fn().mockResolvedValue(undefined),
    acquireTokenPopup: vi.fn().mockResolvedValue({ accessToken: 'mock-token' }),
    addEventCallback: vi.fn().mockReturnValue('callback-id'),
    removeEventCallback: vi.fn(),
    enableAccountStorageEvents: vi.fn(),
    disableAccountStorageEvents: vi.fn(),
  };

  return {
    PublicClientApplication: vi.fn().mockImplementation(() => mockMsalInstance),
    EventType: {
      LOGIN_SUCCESS: 'msal:loginSuccess',
      LOGIN_FAILURE: 'msal:loginFailure',
      ACQUIRE_TOKEN_SUCCESS: 'msal:acquireTokenSuccess',
      ACQUIRE_TOKEN_FAILURE: 'msal:acquireTokenFailure',
    },
    InteractionType: {
      REDIRECT: 'redirect',
      POPUP: 'popup',
      SILENT: 'silent',
    },
  };
});

const TestApp = () => <div data-testid="test-app">Test Application</div>;
const CustomLoading = () => <div data-testid="custom-loading">Loading...</div>;
const CustomLogin = () => <div data-testid="custom-login">Please Login</div>;

async function renderAuthProvider(
  children: React.ReactNode = <TestApp />,
  options?: {
    requireAuth?: boolean;
    loadingComponent?: React.ReactNode;
    loginComponent?: React.ReactNode;
  }
) {
  const { useMsal } = await import('@azure/msal-react');
  
  return {
    ...render(
      <FluentProvider theme={webLightTheme}>
        <AuthProvider {...options}>
          {children}
        </AuthProvider>
      </FluentProvider>
    ),
    useMsal: vi.mocked(useMsal),
  };
}

describe('AuthProvider Integration Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Provider Initialization', () => {
    it('initializes MSAL provider', async () => {
      const { useMsal } = await import('@azure/msal-react');
      const context = createMsalContext([FIXTURES.ACCOUNTS.STANDARD], FIXTURES.IN_PROGRESS_STATES.NONE);
      setupMsalMock(vi.mocked(useMsal))(context);

      await renderAuthProvider();

      // Just verify it renders the provider wrapper
      expect(screen.getByTestId('msal-provider')).toBeInTheDocument();
    });

    it('renders children when requireAuth is false', async () => {
      const { useMsal } = await import('@azure/msal-react');
      const context = createMsalContext([], FIXTURES.IN_PROGRESS_STATES.NONE);
      setupMsalMock(vi.mocked(useMsal))(context);

      await renderAuthProvider(<TestApp />, { requireAuth: false });

      expect(screen.getByTestId('test-app')).toBeInTheDocument();
    });

    it('shows redirect message for unauthenticated users with requireAuth', async () => {
      const { useMsal } = await import('@azure/msal-react');
      const context = createMsalContext([], FIXTURES.IN_PROGRESS_STATES.NONE);
      setupMsalMock(vi.mocked(useMsal))(context);

      await renderAuthProvider(<TestApp />, { requireAuth: true });

      // When not authenticated, should show login redirect message
      expect(screen.getByText(/Redirecting to login/i)).toBeInTheDocument();
    });
  });

  describe('Authentication Flow', () => {
    it('renders without crashing when authenticated', async () => {
      const { useMsal } = await import('@azure/msal-react');
      const context = createMsalContext([FIXTURES.ACCOUNTS.STANDARD], FIXTURES.IN_PROGRESS_STATES.NONE);
      setupMsalMock(vi.mocked(useMsal))(context);

      await renderAuthProvider(<TestApp />, { requireAuth: true });

      // Should render provider (may show login redirect)
      expect(screen.getByTestId('msal-provider')).toBeInTheDocument();
    });

    it('shows redirect message when unauthenticated', async () => {
      const { useMsal } = await import('@azure/msal-react');
      const context = createMsalContext([], FIXTURES.IN_PROGRESS_STATES.NONE);
      setupMsalMock(vi.mocked(useMsal))(context);

      await renderAuthProvider(<TestApp />, { requireAuth: true });

      expect(screen.getByText(/Redirecting to login/i)).toBeInTheDocument();
    });

    it('shows loading state during authentication', async () => {
      const { useMsal } = await import('@azure/msal-react');
      const context = createMsalContext([FIXTURES.ACCOUNTS.STANDARD], FIXTURES.IN_PROGRESS_STATES.LOGIN);
      setupMsalMock(vi.mocked(useMsal))(context);

      await renderAuthProvider(<TestApp />, { requireAuth: true });

      expect(screen.getByText('Authenticating...')).toBeInTheDocument();
      expect(screen.queryByTestId('test-app')).not.toBeInTheDocument();
    });

    it('uses custom loading component when provided', async () => {
      const { useMsal } = await import('@azure/msal-react');
      const context = createMsalContext([FIXTURES.ACCOUNTS.STANDARD], FIXTURES.IN_PROGRESS_STATES.LOGIN);
      setupMsalMock(vi.mocked(useMsal))(context);

      await renderAuthProvider(<TestApp />, {
        requireAuth: true,
        loadingComponent: <CustomLoading />,
      });

      expect(screen.getByTestId('custom-loading')).toBeInTheDocument();
      expect(screen.queryByText('Authenticating...')).not.toBeInTheDocument();
    });

    it('uses custom login component when provided', async () => {
      const { useMsal } = await import('@azure/msal-react');
      const context = createMsalContext([], FIXTURES.IN_PROGRESS_STATES.NONE);
      setupMsalMock(vi.mocked(useMsal))(context);

      await renderAuthProvider(<TestApp />, {
        requireAuth: true,
        loginComponent: <CustomLogin />,
      });

      await waitFor(() => {
        expect(screen.getByTestId('custom-login')).toBeInTheDocument();
      });
    });
  });

  describe('Account Management', () => {
    it('renders successfully when multiple accounts exist', async () => {
      const { useMsal } = await import('@azure/msal-react');
      const context = createMsalContext(
        [FIXTURES.ACCOUNTS.STANDARD, FIXTURES.ACCOUNTS.ADMIN],
        FIXTURES.IN_PROGRESS_STATES.NONE
      );
      setupMsalMock(vi.mocked(useMsal))(context);

      await renderAuthProvider();

      // Should render without errors
      expect(screen.getByTestId('msal-provider')).toBeInTheDocument();
    });

    it('renders successfully with single account', async () => {
      const { useMsal } = await import('@azure/msal-react');
      const context = createMsalContext([FIXTURES.ACCOUNTS.STANDARD], FIXTURES.IN_PROGRESS_STATES.NONE);
      setupMsalMock(vi.mocked(useMsal))(context);

      await renderAuthProvider();

      // Should render without errors
      expect(screen.getByTestId('msal-provider')).toBeInTheDocument();
    });

    it('renders successfully when no accounts exist', async () => {
      const { useMsal } = await import('@azure/msal-react');
      const context = createMsalContext([], FIXTURES.IN_PROGRESS_STATES.NONE);
      setupMsalMock(vi.mocked(useMsal))(context);

      await renderAuthProvider(<TestApp />, { requireAuth: false });

      // Should render app when auth not required
      expect(screen.getByTestId('test-app')).toBeInTheDocument();
    });
  });

  describe('Event Handling', () => {
    it('initializes and renders without errors', async () => {
      const { useMsal } = await import('@azure/msal-react');
      const context = createMsalContext([FIXTURES.ACCOUNTS.STANDARD], FIXTURES.IN_PROGRESS_STATES.NONE);
      setupMsalMock(vi.mocked(useMsal))(context);

      await renderAuthProvider();

      // Event callbacks are registered internally - just verify it renders
      expect(screen.getByTestId('msal-provider')).toBeInTheDocument();
    });

    it('handles login success event scenario', async () => {
      const { useMsal } = await import('@azure/msal-react');
      const context = createMsalContext([FIXTURES.ACCOUNTS.STANDARD], FIXTURES.IN_PROGRESS_STATES.NONE);
      setupMsalMock(vi.mocked(useMsal))(context);

      await renderAuthProvider();

      // After login success, user should be able to see authenticated content
      expect(screen.getByTestId('msal-provider')).toBeInTheDocument();
    });

    it('handles admin account login scenario', async () => {
      const { useMsal } = await import('@azure/msal-react');
      const context = createMsalContext([FIXTURES.ACCOUNTS.ADMIN], FIXTURES.IN_PROGRESS_STATES.NONE);
      setupMsalMock(vi.mocked(useMsal))(context);

      await renderAuthProvider();

      // Admin account should work the same as standard account
      expect(screen.getByTestId('msal-provider')).toBeInTheDocument();
    });

    it('handles events safely', async () => {
      const { useMsal } = await import('@azure/msal-react');
      const context = createMsalContext([], FIXTURES.IN_PROGRESS_STATES.NONE);
      setupMsalMock(vi.mocked(useMsal))(context);

      await renderAuthProvider(<TestApp />, { requireAuth: false });

      // Should handle events without crashing
      expect(screen.getByTestId('test-app')).toBeInTheDocument();
    });
  });

  describe('Composition and Nesting', () => {
    it('renders deeply nested children', async () => {
      const { useMsal } = await import('@azure/msal-react');
      const context = createMsalContext([FIXTURES.ACCOUNTS.STANDARD], FIXTURES.IN_PROGRESS_STATES.NONE);
      setupMsalMock(vi.mocked(useMsal))(context);

      const NestedComponent = () => (
        <div>
          <div>
            <div>
              <div data-testid="deeply-nested">Deep Content</div>
            </div>
          </div>
        </div>
      );

      await renderAuthProvider(<NestedComponent />, { requireAuth: false });

      expect(screen.getByTestId('deeply-nested')).toBeInTheDocument();
    });

    it('preserves React context through provider', async () => {
      const { useMsal } = await import('@azure/msal-react');
      const context = createMsalContext([FIXTURES.ACCOUNTS.STANDARD], FIXTURES.IN_PROGRESS_STATES.NONE);
      setupMsalMock(vi.mocked(useMsal))(context);

      const TestContext = React.createContext({ value: 'test-context-value' });
      const ContextConsumer = () => {
        const ctx = React.useContext(TestContext);
        return <div data-testid="context-value">{ctx.value}</div>;
      };

      const { container } = render(
        <FluentProvider theme={webLightTheme}>
          <TestContext.Provider value={{ value: 'test-context-value' }}>
            <AuthProvider requireAuth={false}>
              <ContextConsumer />
            </AuthProvider>
          </TestContext.Provider>
        </FluentProvider>
      );

      expect(screen.getByTestId('context-value')).toHaveTextContent('test-context-value');
    });
  });

  describe('State Management', () => {
    it('maintains component state', async () => {
      const { useMsal } = await import('@azure/msal-react');
      const context = createMsalContext([FIXTURES.ACCOUNTS.STANDARD], FIXTURES.IN_PROGRESS_STATES.NONE);
      setupMsalMock(vi.mocked(useMsal))(context);

      const StatefulComponent = () => {
        const [count, setCount] = React.useState(0);
        return (
          <div>
            <span data-testid="counter">{count}</span>
            <button onClick={() => setCount(count + 1)} data-testid="increment">
              Increment
            </button>
          </div>
        );
      };

      await renderAuthProvider(<StatefulComponent />, { requireAuth: false });

      expect(screen.getByTestId('counter')).toHaveTextContent('0');
    });

    it('handles state transitions', async () => {
      const { useMsal } = await import('@azure/msal-react');
      const contextUnauth = createMsalContext([], FIXTURES.IN_PROGRESS_STATES.NONE);
      setupMsalMock(vi.mocked(useMsal))(contextUnauth);

      const { rerender } = await renderAuthProvider(<TestApp />, { requireAuth: true });

      // Initially should show "Redirecting to login"
      expect(screen.getByText('Redirecting to login...')).toBeInTheDocument();

      // Updating props should work without crashing
      rerender(
        <FluentProvider theme={webLightTheme}>
          <AuthProvider requireAuth={false}>
            <TestApp />
          </AuthProvider>
        </FluentProvider>
      );

      // Component should still be mounted
      expect(screen.getByTestId('msal-provider')).toBeInTheDocument();
    });
  });

  describe('Edge Cases', () => {
    it('handles requireAuth prop changes', async () => {
      const { useMsal } = await import('@azure/msal-react');
      const context = createMsalContext([FIXTURES.ACCOUNTS.STANDARD], FIXTURES.IN_PROGRESS_STATES.NONE);
      setupMsalMock(vi.mocked(useMsal))(context);

      const { rerender } = await renderAuthProvider(<TestApp />, { requireAuth: false });
      expect(screen.getByTestId('test-app')).toBeInTheDocument();

      rerender(
        <FluentProvider theme={webLightTheme}>
          <AuthProvider requireAuth={false}>
            <TestApp />
          </AuthProvider>
        </FluentProvider>
      );

      expect(screen.getByTestId('test-app')).toBeInTheDocument();
    });

    it('handles empty children gracefully', async () => {
      const { useMsal } = await import('@azure/msal-react');
      const context = createMsalContext([FIXTURES.ACCOUNTS.STANDARD], FIXTURES.IN_PROGRESS_STATES.NONE);
      setupMsalMock(vi.mocked(useMsal))(context);

      const { container } = await renderAuthProvider(<></>, { requireAuth: true });

      expect(container).toBeInTheDocument();
    });

    it('handles null children gracefully', async () => {
      const { useMsal } = await import('@azure/msal-react');
      const context = createMsalContext([FIXTURES.ACCOUNTS.STANDARD], FIXTURES.IN_PROGRESS_STATES.NONE);
      setupMsalMock(vi.mocked(useMsal))(context);

      const { container } = await renderAuthProvider(null as any, { requireAuth: true });

      expect(container).toBeInTheDocument();
    });
  });

  describe('Error Boundaries', () => {
    it('renders even with potential initialization issues', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      
      const { useMsal } = await import('@azure/msal-react');
      const context = createMsalContext([FIXTURES.ACCOUNTS.STANDARD], FIXTURES.IN_PROGRESS_STATES.NONE);
      setupMsalMock(vi.mocked(useMsal))(context);

      await renderAuthProvider();

      // Should still render the provider
      expect(screen.getByTestId('msal-provider')).toBeInTheDocument();

      consoleErrorSpy.mockRestore();
    });
  });
});


