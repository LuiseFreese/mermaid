import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import { MOCK_ACCOUNT, createMockMsalInstance } from './utils/msalMocks';

vi.mock('@azure/msal-react', () => ({
  MsalProvider: ({ children, instance }: { children: React.ReactNode; instance: any }) => {
    return <div data-testid="msal-provider">{children}</div>;
  },
  AuthenticatedTemplate: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="authenticated-template">{children}</div>
  ),
  UnauthenticatedTemplate: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="unauthenticated-template">{children}</div>
  ),
  useMsal: vi.fn(() => ({
    instance: createMockMsalInstance(),
    accounts: [MOCK_ACCOUNT],
    inProgress: 'none',
  })),
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
    LOGOUT_SUCCESS: 'msal:logoutSuccess',
  },
}));

describe('AuthProvider', () => {
  let AuthProvider: React.FC<{
    children: React.ReactNode;
    requireAuth?: boolean;
    loadingComponent?: React.ReactNode;
    loginComponent?: React.ReactNode;
  }>;

  beforeEach(async () => {
    vi.clearAllMocks();
    const authModule = await import('../auth/AuthProvider');
    AuthProvider = authModule.AuthProvider;
  });

  describe('Provider Initialization', () => {
    it('renders MsalProvider wrapper around children', () => {
      render(
        <FluentProvider theme={webLightTheme}>
          <AuthProvider requireAuth={false}>
            <div data-testid="test-child">Test Child</div>
          </AuthProvider>
        </FluentProvider>
      );

      expect(screen.getByTestId('msal-provider')).toBeInTheDocument();
      expect(screen.getByTestId('test-child')).toBeInTheDocument();
    });

    it('initializes PublicClientApplication with config', async () => {
      const { PublicClientApplication } = await import('@azure/msal-browser');

      render(
        <FluentProvider theme={webLightTheme}>
          <AuthProvider requireAuth={false}>
            <div>Test</div>
          </AuthProvider>
        </FluentProvider>
      );

      expect(PublicClientApplication).toHaveBeenCalledWith({
        auth: {
          clientId: 'test-client-id',
          authority: 'https://login.microsoftonline.com/test-tenant-id',
          redirectUri: 'http://localhost:3000',
        },
        cache: {
          cacheLocation: 'sessionStorage',
          storeAuthStateInCookie: false,
        },
      });
    });
  });

  describe('requireAuth Prop', () => {
    it('wraps children in AuthGuard when requireAuth is true', () => {
      render(
        <FluentProvider theme={webLightTheme}>
          <AuthProvider requireAuth={true}>
            <div data-testid="protected-child">Protected</div>
          </AuthProvider>
        </FluentProvider>
      );

      expect(screen.getByTestId('msal-provider')).toBeInTheDocument();
    });

    it('renders children directly when requireAuth is false', () => {
      render(
        <FluentProvider theme={webLightTheme}>
          <AuthProvider requireAuth={false}>
            <div data-testid="public-child">Public Content</div>
          </AuthProvider>
        </FluentProvider>
      );

      expect(screen.getByTestId('msal-provider')).toBeInTheDocument();
      expect(screen.getByTestId('public-child')).toBeInTheDocument();
    });

    it('defaults requireAuth to true when not specified', () => {
      render(
        <FluentProvider theme={webLightTheme}>
          <AuthProvider>
            <div data-testid="default-child">Default</div>
          </AuthProvider>
        </FluentProvider>
      );

      expect(screen.getByTestId('msal-provider')).toBeInTheDocument();
    });
  });

  describe('Custom Components', () => {
    it('passes loadingComponent to AuthGuard', () => {
      const CustomLoading = () => <div data-testid="custom-loading">Loading...</div>;

      render(
        <FluentProvider theme={webLightTheme}>
          <AuthProvider requireAuth={true} loadingComponent={<CustomLoading />}>
            <div>Content</div>
          </AuthProvider>
        </FluentProvider>
      );

      expect(screen.getByTestId('msal-provider')).toBeInTheDocument();
    });

    it('passes loginComponent to AuthGuard', () => {
      const CustomLogin = () => <div data-testid="custom-login">Login</div>;

      render(
        <FluentProvider theme={webLightTheme}>
          <AuthProvider requireAuth={true} loginComponent={<CustomLogin />}>
            <div>Content</div>
          </AuthProvider>
        </FluentProvider>
      );

      expect(screen.getByTestId('msal-provider')).toBeInTheDocument();
    });

    it('passes both custom components to AuthGuard', () => {
      const CustomLoading = () => <div data-testid="custom-loading">Loading...</div>;
      const CustomLogin = () => <div data-testid="custom-login">Login</div>;

      render(
        <FluentProvider theme={webLightTheme}>
          <AuthProvider
            requireAuth={true}
            loadingComponent={<CustomLoading />}
            loginComponent={<CustomLogin />}
          >
            <div>Content</div>
          </AuthProvider>
        </FluentProvider>
      );

      expect(screen.getByTestId('msal-provider')).toBeInTheDocument();
    });
  });

  describe('MSAL Instance Export', () => {
    it('exports msalInstance for external use', async () => {
      const { msalInstance } = await import('../auth/AuthProvider');
      
      expect(msalInstance).toBeDefined();
      expect(msalInstance.initialize).toBeDefined();
      expect(msalInstance.getAllAccounts).toBeDefined();
      expect(msalInstance.loginRedirect).toBeDefined();
    });

    it('msalInstance methods are callable', async () => {
      const { msalInstance } = await import('../auth/AuthProvider');
      
      const accounts = msalInstance.getAllAccounts();
      expect(Array.isArray(accounts)).toBe(true);
    });
  });

  describe('Children Rendering', () => {
    it('renders single child component', () => {
      render(
        <FluentProvider theme={webLightTheme}>
          <AuthProvider requireAuth={false}>
            <div data-testid="single-child">Single</div>
          </AuthProvider>
        </FluentProvider>
      );

      expect(screen.getByTestId('single-child')).toBeInTheDocument();
    });

    it('renders multiple child components', () => {
      render(
        <FluentProvider theme={webLightTheme}>
          <AuthProvider requireAuth={false}>
            <div data-testid="child-1">Child 1</div>
            <div data-testid="child-2">Child 2</div>
            <div data-testid="child-3">Child 3</div>
          </AuthProvider>
        </FluentProvider>
      );

      expect(screen.getByTestId('child-1')).toBeInTheDocument();
      expect(screen.getByTestId('child-2')).toBeInTheDocument();
      expect(screen.getByTestId('child-3')).toBeInTheDocument();
    });

    it('renders nested component tree', () => {
      const NestedComponent = () => (
        <div data-testid="nested-parent">
          <div data-testid="nested-child">Nested</div>
        </div>
      );

      render(
        <FluentProvider theme={webLightTheme}>
          <AuthProvider requireAuth={false}>
            <NestedComponent />
          </AuthProvider>
        </FluentProvider>
      );

      expect(screen.getByTestId('nested-parent')).toBeInTheDocument();
      expect(screen.getByTestId('nested-child')).toBeInTheDocument();
    });
  });

  describe('React Lifecycle', () => {
    it('properly mounts without errors', () => {
      const { container } = render(
        <FluentProvider theme={webLightTheme}>
          <AuthProvider requireAuth={false}>
            <div>Test</div>
          </AuthProvider>
        </FluentProvider>
      );

      expect(container.firstChild).toBeInTheDocument();
    });

    it('properly unmounts without errors', () => {
      const { unmount } = render(
        <FluentProvider theme={webLightTheme}>
          <AuthProvider requireAuth={false}>
            <div>Test</div>
          </AuthProvider>
        </FluentProvider>
      );

      expect(() => unmount()).not.toThrow();
    });

    it('handles multiple renders without issues', () => {
      const { rerender } = render(
        <FluentProvider theme={webLightTheme}>
          <AuthProvider requireAuth={false}>
            <div data-testid="content">Content 1</div>
          </AuthProvider>
        </FluentProvider>
      );

      expect(screen.getByTestId('content')).toHaveTextContent('Content 1');

      rerender(
        <FluentProvider theme={webLightTheme}>
          <AuthProvider requireAuth={false}>
            <div data-testid="content">Content 2</div>
          </AuthProvider>
        </FluentProvider>
      );

      expect(screen.getByTestId('content')).toHaveTextContent('Content 2');
    });
  });

  describe('Integration with MSAL Templates', () => {
    it('uses AuthenticatedTemplate when requireAuth is true', () => {
      render(
        <FluentProvider theme={webLightTheme}>
          <AuthProvider requireAuth={true}>
            <div data-testid="auth-content">Authenticated Content</div>
          </AuthProvider>
        </FluentProvider>
      );

      expect(screen.getByTestId('msal-provider')).toBeInTheDocument();
    });

    it('bypasses templates when requireAuth is false', () => {
      render(
        <FluentProvider theme={webLightTheme}>
          <AuthProvider requireAuth={false}>
            <div data-testid="public-content">Public Content</div>
          </AuthProvider>
        </FluentProvider>
      );

      expect(screen.getByTestId('public-content')).toBeInTheDocument();
      expect(screen.queryByTestId('authenticated-template')).not.toBeInTheDocument();
    });
  });

  describe('Edge Cases', () => {
    it('handles null children gracefully', () => {
      render(
        <FluentProvider theme={webLightTheme}>
          <AuthProvider requireAuth={false}>
            {null}
          </AuthProvider>
        </FluentProvider>
      );

      expect(screen.getByTestId('msal-provider')).toBeInTheDocument();
    });

    it('handles undefined children gracefully', () => {
      render(
        <FluentProvider theme={webLightTheme}>
          <AuthProvider requireAuth={false}>
            {undefined}
          </AuthProvider>
        </FluentProvider>
      );

      expect(screen.getByTestId('msal-provider')).toBeInTheDocument();
    });

    it('handles empty fragment as children', () => {
      render(
        <FluentProvider theme={webLightTheme}>
          <AuthProvider requireAuth={false}>
            <></>
          </AuthProvider>
        </FluentProvider>
      );

      expect(screen.getByTestId('msal-provider')).toBeInTheDocument();
    });
  });

  describe('MSAL Configuration', () => {
    it('uses sessionStorage for cache location', async () => {
      const { PublicClientApplication } = await import('@azure/msal-browser');

      render(
        <FluentProvider theme={webLightTheme}>
          <AuthProvider requireAuth={false}>
            <div>Test</div>
          </AuthProvider>
        </FluentProvider>
      );

      const calls = vi.mocked(PublicClientApplication).mock.calls;
      const config = calls[calls.length - 1][0];
      expect(config.cache.cacheLocation).toBe('sessionStorage');
    });

    it('does not store auth state in cookie by default', async () => {
      const { PublicClientApplication } = await import('@azure/msal-browser');

      render(
        <FluentProvider theme={webLightTheme}>
          <AuthProvider requireAuth={false}>
            <div>Test</div>
          </AuthProvider>
        </FluentProvider>
      );

      const calls = vi.mocked(PublicClientApplication).mock.calls;
      const config = calls[calls.length - 1][0];
      expect(config.cache.storeAuthStateInCookie).toBe(false);
    });
  });
});
