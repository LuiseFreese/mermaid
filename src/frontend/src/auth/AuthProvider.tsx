import React, { useEffect } from 'react';
import {
  MsalProvider,
  AuthenticatedTemplate,
  UnauthenticatedTemplate,
  useMsal,
} from '@azure/msal-react';
import { PublicClientApplication, EventType, EventMessage, AuthenticationResult } from '@azure/msal-browser';
import { msalConfig, loginRequest } from './authConfig';
import { Spinner } from '@fluentui/react-components';

/**
 * Initialize MSAL instance
 */
const msalInstance = new PublicClientApplication(msalConfig);

// Handle redirect promise
msalInstance.initialize().then(() => {
  // Account selection logic is app-dependent. Adjust as needed for different use cases.
  const accounts = msalInstance.getAllAccounts();
  if (accounts.length > 0) {
    msalInstance.setActiveAccount(accounts[0]);
  }

  msalInstance.addEventCallback((event: EventMessage) => {
    if (event.eventType === EventType.LOGIN_SUCCESS && event.payload) {
      const payload = event.payload as AuthenticationResult;
      const account = payload.account;
      msalInstance.setActiveAccount(account);
    }
  });
});

/**
 * Component that requires authentication before rendering children
 */
interface AuthGuardProps {
  children: React.ReactNode;
  loadingComponent?: React.ReactNode;
  loginComponent?: React.ReactNode;
}

const AuthGuard: React.FC<AuthGuardProps> = ({
  children,
  loadingComponent,
  loginComponent,
}) => {
  const { instance, inProgress } = useMsal();
  const [isLoggingIn, setIsLoggingIn] = React.useState(false);

  useEffect(() => {
    const accounts = instance.getAllAccounts();
    if (accounts.length === 0 && inProgress === 'none' && !isLoggingIn) {
      // No accounts and no login in progress - redirect to login
      setIsLoggingIn(true);
      instance.loginRedirect(loginRequest).catch((error) => {
        console.error('[Auth] Login redirect failed:', error);
        setIsLoggingIn(false);
      });
    }
  }, [instance, inProgress, isLoggingIn]);

  // Show loading while authentication is in progress
  if (inProgress !== 'none' || isLoggingIn) {
    return (
      <>
        {loadingComponent || (
          <div
            style={{
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              height: '100vh',
              flexDirection: 'column',
              gap: '16px',
            }}
          >
            <Spinner size="extra-large" label="Authenticating..." />
          </div>
        )}
      </>
    );
  }

  return (
    <>
      <AuthenticatedTemplate>{children}</AuthenticatedTemplate>
      <UnauthenticatedTemplate>
        {loginComponent || (
          <div
            style={{
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              height: '100vh',
              flexDirection: 'column',
              gap: '16px',
            }}
          >
            <Spinner size="extra-large" label="Redirecting to login..." />
          </div>
        )}
      </UnauthenticatedTemplate>
    </>
  );
};

/**
 * AuthProvider wraps the application with MSAL context and enforces authentication
 */
interface AuthProviderProps {
  children: React.ReactNode;
  requireAuth?: boolean;
  loadingComponent?: React.ReactNode;
  loginComponent?: React.ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({
  children,
  requireAuth = true,
  loadingComponent,
  loginComponent,
}) => {
  return (
    <MsalProvider instance={msalInstance}>
      {requireAuth ? (
        <AuthGuard loadingComponent={loadingComponent} loginComponent={loginComponent}>
          {children}
        </AuthGuard>
      ) : (
        children
      )}
    </MsalProvider>
  );
};

/**
 * Export MSAL instance for use in other parts of the app
 */
export { msalInstance };
