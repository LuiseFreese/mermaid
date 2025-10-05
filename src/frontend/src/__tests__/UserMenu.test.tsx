import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import { UserMenu } from '../auth/UserMenu';
import {
  MOCK_ACCOUNT,
  MOCK_ACCOUNT_NO_NAME,
  MOCK_ACCOUNT_LONG_NAME,
  createMockMsalContext,
  mockUseMsal,
} from './utils/msalMocks';

vi.mock('@azure/msal-react', () => ({
  useMsal: vi.fn(),
  MsalProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const renderUserMenu = (useMsalMock: ReturnType<typeof mockUseMsal>) => {
  const { useMsal } = vi.mocked(await import('@azure/msal-react'));
  useMsal.mockImplementation(useMsalMock);

  return render(
    <FluentProvider theme={webLightTheme}>
      <UserMenu />
    </FluentProvider>
  );
};

describe('UserMenu', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Rendering', () => {
    it('renders user avatar button with initials', async () => {
      const context = createMockMsalContext([MOCK_ACCOUNT]);
      await renderUserMenu(mockUseMsal(context));

      const button = screen.getByRole('button', { name: /user menu for test user/i });
      expect(button).toBeInTheDocument();
      
      const avatar = screen.getByText('TU');
      expect(avatar).toBeInTheDocument();
    });

    it('renders avatar with username when name is not available', async () => {
      const context = createMockMsalContext([MOCK_ACCOUNT_NO_NAME]);
      await renderUserMenu(mockUseMsal(context));

      const button = screen.getByRole('button', { name: /user menu for test.user@contoso.com/i });
      expect(button).toBeInTheDocument();
    });

    it('truncates long names to 2 initials', async () => {
      const context = createMockMsalContext([MOCK_ACCOUNT_LONG_NAME]);
      await renderUserMenu(mockUseMsal(context));

      const avatar = screen.getByText('DA');
      expect(avatar).toBeInTheDocument();
    });

    it('does not render when no account is available', async () => {
      const context = createMockMsalContext([]);
      const { container } = await renderUserMenu(mockUseMsal(context));

      expect(container.firstChild).toBeNull();
    });

    it('displays tooltip with user display name on hover', async () => {
      const context = createMockMsalContext([MOCK_ACCOUNT]);
      await renderUserMenu(mockUseMsal(context));

      const button = screen.getByRole('button', { name: /user menu for test user/i });
      
      fireEvent.mouseEnter(button);
      
      await waitFor(() => {
        expect(screen.getByText('Test User')).toBeInTheDocument();
      });
    });
  });

  describe('Menu Interaction', () => {
    it('opens menu when avatar button is clicked', async () => {
      const context = createMockMsalContext([MOCK_ACCOUNT]);
      await renderUserMenu(mockUseMsal(context));

      const button = screen.getByRole('button', { name: /user menu for test user/i });
      fireEvent.click(button);

      await waitFor(() => {
        expect(screen.getByText('Test User')).toBeInTheDocument();
        expect(screen.getByText('test.user@contoso.com')).toBeInTheDocument();
        expect(screen.getByText('Sign Out')).toBeInTheDocument();
      });
    });

    it('displays user display name in menu (bold)', async () => {
      const context = createMockMsalContext([MOCK_ACCOUNT]);
      await renderUserMenu(mockUseMsal(context));

      const button = screen.getByRole('button', { name: /user menu for test user/i });
      fireEvent.click(button);

      await waitFor(() => {
        const nameItem = screen.getAllByText('Test User')[0].closest('[role="menuitem"]');
        expect(nameItem).toHaveStyle({ fontWeight: 'bold' });
        expect(nameItem).toHaveAttribute('aria-disabled', 'true');
      });
    });

    it('displays username email in menu (disabled)', async () => {
      const context = createMockMsalContext([MOCK_ACCOUNT]);
      await renderUserMenu(mockUseMsal(context));

      const button = screen.getByRole('button', { name: /user menu for test user/i });
      fireEvent.click(button);

      await waitFor(() => {
        const emailItem = screen.getByText('test.user@contoso.com').closest('[role="menuitem"]');
        expect(emailItem).toHaveAttribute('aria-disabled', 'true');
      });
    });

    it('displays sign out option with icon', async () => {
      const context = createMockMsalContext([MOCK_ACCOUNT]);
      await renderUserMenu(mockUseMsal(context));

      const button = screen.getByRole('button', { name: /user menu for test user/i });
      fireEvent.click(button);

      await waitFor(() => {
        const signOutItem = screen.getByText('Sign Out').closest('[role="menuitem"]');
        expect(signOutItem).toBeInTheDocument();
        expect(signOutItem).not.toHaveAttribute('aria-disabled');
      });
    });
  });

  describe('Logout Functionality', () => {
    it('calls logoutRedirect when sign out is clicked', async () => {
      const context = createMockMsalContext([MOCK_ACCOUNT]);
      await renderUserMenu(mockUseMsal(context));

      const button = screen.getByRole('button', { name: /user menu for test user/i });
      fireEvent.click(button);

      await waitFor(() => {
        const signOutButton = screen.getByText('Sign Out');
        fireEvent.click(signOutButton);
      });

      expect(context.instance.logoutRedirect).toHaveBeenCalledWith({
        postLogoutRedirectUri: window.location.origin,
      });
    });

    it('uses window.location.origin as postLogoutRedirectUri', async () => {
      const originalLocation = window.location.origin;
      const context = createMockMsalContext([MOCK_ACCOUNT]);
      await renderUserMenu(mockUseMsal(context));

      const button = screen.getByRole('button', { name: /user menu for test user/i });
      fireEvent.click(button);

      await waitFor(() => {
        const signOutButton = screen.getByText('Sign Out');
        fireEvent.click(signOutButton);
      });

      expect(context.instance.logoutRedirect).toHaveBeenCalledWith({
        postLogoutRedirectUri: originalLocation,
      });
    });
  });

  describe('Accessibility', () => {
    it('has proper ARIA labels for screen readers', async () => {
      const context = createMockMsalContext([MOCK_ACCOUNT]);
      await renderUserMenu(mockUseMsal(context));

      const button = screen.getByRole('button', { name: /user menu for test user/i });
      expect(button).toHaveAttribute('aria-label', 'User menu for Test User');
    });

    it('menu items have proper roles', async () => {
      const context = createMockMsalContext([MOCK_ACCOUNT]);
      await renderUserMenu(mockUseMsal(context));

      const button = screen.getByRole('button', { name: /user menu for test user/i });
      fireEvent.click(button);

      await waitFor(() => {
        const menuItems = screen.getAllByRole('menuitem');
        expect(menuItems).toHaveLength(3);
      });
    });

    it('disabled menu items are properly marked', async () => {
      const context = createMockMsalContext([MOCK_ACCOUNT]);
      await renderUserMenu(mockUseMsal(context));

      const button = screen.getByRole('button', { name: /user menu for test user/i });
      fireEvent.click(button);

      await waitFor(() => {
        const nameItem = screen.getAllByText('Test User')[0].closest('[role="menuitem"]');
        const emailItem = screen.getByText('test.user@contoso.com').closest('[role="menuitem"]');
        
        expect(nameItem).toHaveAttribute('aria-disabled', 'true');
        expect(emailItem).toHaveAttribute('aria-disabled', 'true');
      });
    });
  });

  describe('Edge Cases', () => {
    it('handles account with only username (no name property)', async () => {
      const context = createMockMsalContext([MOCK_ACCOUNT_NO_NAME]);
      await renderUserMenu(mockUseMsal(context));

      const button = screen.getByRole('button');
      fireEvent.click(button);

      await waitFor(() => {
        expect(screen.getByText('test.user@contoso.com')).toBeInTheDocument();
      });
    });

    it('handles single-word names correctly', async () => {
      const singleNameAccount = {
        ...MOCK_ACCOUNT,
        name: 'Madonna',
      };
      const context = createMockMsalContext([singleNameAccount]);
      await renderUserMenu(mockUseMsal(context));

      const avatar = screen.getByText('M');
      expect(avatar).toBeInTheDocument();
    });

    it('handles empty string name by falling back to username', async () => {
      const emptyNameAccount = {
        ...MOCK_ACCOUNT,
        name: '',
      };
      const context = createMockMsalContext([emptyNameAccount]);
      await renderUserMenu(mockUseMsal(context));

      const button = screen.getByRole('button', { name: /user menu for test.user@contoso.com/i });
      expect(button).toBeInTheDocument();
    });
  });
});
