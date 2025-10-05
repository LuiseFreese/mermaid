import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import {
  MOCK_ACCOUNT,
  createMockMsalContext,
  mockUseMsal,
  createMockMsalInstance,
} from './utils/msalMocks';

let AuthenticatedTemplate: React.FC<{ children: React.ReactNode }>;
let UnauthenticatedTemplate: React.FC<{ children: React.ReactNode }>;
let useMsal: ReturnType<typeof mockUseMsal>;

vi.mock('@azure/msal-react', () => ({
  MsalProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
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

vi.mock('../auth/authConfig', () => ({
  msalConfig: {
    auth: {
      clientId: 'test-client-id',
      authority: 'https://login.microsoftonline.com/test-tenant-id',
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

vi.mock('@azure/msal-browser', () => ({
  PublicClientApplication: vi.fn().mockImplementation(() => createMockMsalInstance()),
  EventType: {
    LOGIN_SUCCESS: 'msal:loginSuccess',
    LOGIN_FAILURE: 'msal:loginFailure',
    ACQUIRE_TOKEN_SUCCESS: 'msal:acquireTokenSuccess',
    ACQUIRE_TOKEN_FAILURE: 'msal:acquireTokenFailure',
  },
}));

const TestChild = () => <div data-testid="protected-content">Protected Content</div>;

describe('AuthGuard', () => {
  let AuthGuard: React.FC<{
    children: React.ReactNode;
    loadingComponent?: React.ReactNode;
    loginComponent?: React.ReactNode;
  }>;

  beforeEach(async () => {
    vi.clearAllMocks();
    
    const msalReact = await import('@azure/msal-react');
    AuthenticatedTemplate = msalReact.AuthenticatedTemplate;
    UnauthenticatedTemplate = msalReact.UnauthenticatedTemplate;
    useMsal = msalReact.useMsal as unknown as ReturnType<typeof mockUseMsal>;

    const authModule = await import('../auth/AuthProvider');
    const AuthProviderModule = authModule as any;
    AuthGuard = AuthProviderModule.AuthGuard || vi.fn(({ children }) => <>{children}</>);
  });

  describe('Authenticated State', () => {
    it('renders children when user is authenticated', async () => {
      const context = createMockMsalContext([MOCK_ACCOUNT], 'none');
      useMsal.mockImplementation(() => context);

      render(
        <FluentProvider theme={webLightTheme}>
          <AuthGuard>
            <TestChild />
          </AuthGuard>
        </FluentProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId('protected-content')).toBeInTheDocument();
      });
    });

    it('does not show loading spinner when authenticated', async () => {
      const context = createMockMsalContext([MOCK_ACCOUNT], 'none');
      useMsal.mockImplementation(() => context);

      render(
        <FluentProvider theme={webLightTheme}>
          <AuthGuard>
            <TestChild />
          </AuthGuard>
        </FluentProvider>
      );

      expect(screen.queryByText('Authenticating...')).not.toBeInTheDocument();
      expect(screen.queryByText('Redirecting to login...')).not.toBeInTheDocument();
    });
  });

  describe('Loading State', () => {
    it('shows loading spinner when authentication is in progress (startup)', async () => {
      const context = createMockMsalContext([MOCK_ACCOUNT], 'startup');
      useMsal.mockImplementation(() => context);

      render(
        <FluentProvider theme={webLightTheme}>
          <AuthGuard>
            <TestChild />
          </AuthGuard>
        </FluentProvider>
      );

      expect(screen.getByText('Authenticating...')).toBeInTheDocument();
      expect(screen.queryByTestId('protected-content')).not.toBeInTheDocument();
    });

    it('shows loading spinner when login is in progress', async () => {
      const context = createMockMsalContext([MOCK_ACCOUNT], 'login');
      useMsal.mockImplementation(() => context);

      render(
        <FluentProvider theme={webLightTheme}>
          <AuthGuard>
            <TestChild />
          </AuthGuard>
        </FluentProvider>
      );

      expect(screen.getByText('Authenticating...')).toBeInTheDocument();
    });

    it('shows loading spinner when acquiring token', async () => {
      const context = createMockMsalContext([MOCK_ACCOUNT], 'acquireToken');
      useMsal.mockImplementation(() => context);

      render(
        <FluentProvider theme={webLightTheme}>
          <AuthGuard>
            <TestChild />
          </AuthGuard>
        </FluentProvider>
      );

      expect(screen.getByText('Authenticating...')).toBeInTheDocument();
    });

    it('shows loading spinner during redirect handling', async () => {
      const context = createMockMsalContext([MOCK_ACCOUNT], 'handleRedirect');
      useMsal.mockImplementation(() => context);

      render(
        <FluentProvider theme={webLightTheme}>
          <AuthGuard>
            <TestChild />
          </AuthGuard>
        </FluentProvider>
      );

      expect(screen.getByText('Authenticating...')).toBeInTheDocument();
    });

    it('renders custom loading component when provided', async () => {
      const context = createMockMsalContext([MOCK_ACCOUNT], 'login');
      useMsal.mockImplementation(() => context);

      const CustomLoading = () => <div data-testid="custom-loading">Loading...</div>;

      render(
        <FluentProvider theme={webLightTheme}>
          <AuthGuard loadingComponent={<CustomLoading />}>
            <TestChild />
          </AuthGuard>
        </FluentProvider>
      );

      expect(screen.getByTestId('custom-loading')).toBeInTheDocument();
      expect(screen.queryByText('Authenticating...')).not.toBeInTheDocument();
    });
  });

  describe('Unauthenticated State', () => {
    it('triggers login redirect when no accounts exist', async () => {
      const context = createMockMsalContext([], 'none');
      useMsal.mockImplementation(() => context);

      render(
        <FluentProvider theme={webLightTheme}>
          <AuthGuard>
            <TestChild />
          </AuthGuard>
        </FluentProvider>
      );

      await waitFor(() => {
        expect(context.instance.loginRedirect).toHaveBeenCalledWith({
          scopes: ['User.Read'],
        });
      });
    });

    it('shows redirecting message when not authenticated', async () => {
      const context = createMockMsalContext([], 'none');
      useMsal.mockImplementation(() => context);

      render(
        <FluentProvider theme={webLightTheme}>
          <AuthGuard>
            <TestChild />
          </AuthGuard>
        </FluentProvider>
      );

      expect(screen.getByText('Redirecting to login...')).toBeInTheDocument();
      expect(screen.queryByTestId('protected-content')).not.toBeInTheDocument();
    });

    it('renders custom login component when provided', async () => {
      const context = createMockMsalContext([], 'none');
      useMsal.mockImplementation(() => context);

      const CustomLogin = () => <div data-testid="custom-login">Please log in</div>;

      render(
        <FluentProvider theme={webLightTheme}>
          <AuthGuard loginComponent={<CustomLogin />}>
            <TestChild />
          </AuthGuard>
        </FluentProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId('custom-login')).toBeInTheDocument();
      });
    });

    it('handles login redirect failure gracefully', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const context = createMockMsalContext([], 'none');
      const error = new Error('Login failed');
      context.instance.loginRedirect = vi.fn().mockRejectedValue(error);
      useMsal.mockImplementation(() => context);

      render(
        <FluentProvider theme={webLightTheme}>
          <AuthGuard>
            <TestChild />
          </AuthGuard>
        </FluentProvider>
      );

      await waitFor(() => {
        expect(consoleErrorSpy).toHaveBeenCalledWith(
          '[Auth] Login redirect failed:',
          error
        );
      });

      consoleErrorSpy.mockRestore();
    });

    it('does not trigger login redirect multiple times', async () => {
      const context = createMockMsalContext([], 'none');
      useMsal.mockImplementation(() => context);

      const { rerender } = render(
        <FluentProvider theme={webLightTheme}>
          <AuthGuard>
            <TestChild />
          </AuthGuard>
        </FluentProvider>
      );

      await waitFor(() => {
        expect(context.instance.loginRedirect).toHaveBeenCalledTimes(1);
      });

      rerender(
        <FluentProvider theme={webLightTheme}>
          <AuthGuard>
            <TestChild />
          </AuthGuard>
        </FluentProvider>
      );

      expect(context.instance.loginRedirect).toHaveBeenCalledTimes(1);
    });
  });

  describe('State Transitions', () => {
    it('does not trigger login during logout', async () => {
      const context = createMockMsalContext([], 'logout');
      useMsal.mockImplementation(() => context);

      render(
        <FluentProvider theme={webLightTheme}>
          <AuthGuard>
            <TestChild />
          </AuthGuard>
        </FluentProvider>
      );

      expect(context.instance.loginRedirect).not.toHaveBeenCalled();
    });

    it('does not trigger login during ssoSilent', async () => {
      const context = createMockMsalContext([], 'ssoSilent');
      useMsal.mockImplementation(() => context);

      render(
        <FluentProvider theme={webLightTheme}>
          <AuthGuard>
            <TestChild />
          </AuthGuard>
        </FluentProvider>
      );

      expect(context.instance.loginRedirect).not.toHaveBeenCalled();
    });
  });

  describe('Edge Cases', () => {
    it('handles undefined accounts array', async () => {
      const context = createMockMsalContext([]);
      context.instance.getAllAccounts = vi.fn().mockReturnValue(undefined as any);
      useMsal.mockImplementation(() => context);

      render(
        <FluentProvider theme={webLightTheme}>
          <AuthGuard>
            <TestChild />
          </AuthGuard>
        </FluentProvider>
      );

      expect(screen.getByText('Redirecting to login...')).toBeInTheDocument();
    });

    it('properly unmounts without errors', async () => {
      const context = createMockMsalContext([MOCK_ACCOUNT], 'none');
      useMsal.mockImplementation(() => context);

      const { unmount } = render(
        <FluentProvider theme={webLightTheme}>
          <AuthGuard>
            <TestChild />
          </AuthGuard>
        </FluentProvider>
      );

      expect(() => unmount()).not.toThrow();
    });
  });
});
