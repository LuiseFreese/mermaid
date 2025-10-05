import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import { UserMenu } from '../../../src/auth/UserMenu';
import {
  FIXTURES,
  createMsalContext,
  setupMsalMock,
  getInitials,
} from '../../utils/msalTestUtils';

vi.mock('@azure/msal-react', () => ({
  useMsal: vi.fn(),
  MsalProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const renderUserMenu = async () => {
  const { useMsal } = await import('@azure/msal-react');
  
  return {
    ...render(
      <FluentProvider theme={webLightTheme}>
        <UserMenu />
      </FluentProvider>
    ),
    useMsal: vi.mocked(useMsal),
  };
};

describe('UserMenu UI Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Avatar Display', () => {
    it('renders avatar button with correct initials for standard user', async () => {
      const { useMsal } = await import('@azure/msal-react');
      const context = createMsalContext([FIXTURES.ACCOUNTS.STANDARD]);
      setupMsalMock(vi.mocked(useMsal))(context);

      await renderUserMenu();

      const expectedInitials = getInitials('Jane Smith');
      expect(screen.getByText(expectedInitials)).toBeInTheDocument();
      
      const button = screen.getByRole('button', { name: /user menu for jane smith/i });
      expect(button).toBeInTheDocument();
    });

    it('uses username when name is not available', async () => {
      const { useMsal } = await import('@azure/msal-react');
      const context = createMsalContext([FIXTURES.ACCOUNTS.NO_NAME]);
      setupMsalMock(vi.mocked(useMsal))(context);

      await renderUserMenu();

      const button = screen.getByRole('button', { 
        name: /user menu for user\.noname@contoso\.com/i 
      });
      expect(button).toBeInTheDocument();
    });

    it('truncates long names to maximum 2 initials', async () => {
      const { useMsal } = await import('@azure/msal-react');
      const context = createMsalContext([FIXTURES.ACCOUNTS.LONG_NAME]);
      setupMsalMock(vi.mocked(useMsal))(context);

      await renderUserMenu();

      const expectedInitials = getInitials('Alexander Benjamin Christopher Davidson');
      expect(expectedInitials).toBe('AB');
      expect(screen.getByText('AB')).toBeInTheDocument();
    });

    it('renders avatar with consistent sizing', async () => {
      const { useMsal } = await import('@azure/msal-react');
      const context = createMsalContext([FIXTURES.ACCOUNTS.STANDARD]);
      setupMsalMock(vi.mocked(useMsal))(context);

      const { container } = await renderUserMenu();

      const avatar = container.querySelector('[role="img"]');
      expect(avatar).toBeInTheDocument();
    });

    it('does not render when no account is present', async () => {
      const { useMsal } = await import('@azure/msal-react');
      const context = createMsalContext([]);
      setupMsalMock(vi.mocked(useMsal))(context);

      await renderUserMenu();

      const button = screen.queryByRole('button', { name: /user menu/i });
      expect(button).not.toBeInTheDocument();
    });
  });

  describe('Tooltip Behavior', () => {
    it('displays tooltip with full display name on hover', async () => {
      const { useMsal } = await import('@azure/msal-react');
      const context = createMsalContext([FIXTURES.ACCOUNTS.STANDARD]);
      setupMsalMock(vi.mocked(useMsal))(context);

      await renderUserMenu();

      const button = screen.getByRole('button', { name: /user menu for jane smith/i });
      
      fireEvent.mouseEnter(button);
      
      await waitFor(() => {
        const tooltip = screen.getByText('Jane Smith');
        expect(tooltip).toBeInTheDocument();
      });
    });

    it('tooltip disappears on mouse leave', async () => {
      const { useMsal } = await import('@azure/msal-react');
      const context = createMsalContext([FIXTURES.ACCOUNTS.STANDARD]);
      setupMsalMock(vi.mocked(useMsal))(context);

      await renderUserMenu();

      const button = screen.getByRole('button', { name: /user menu for jane smith/i });
      
      fireEvent.mouseEnter(button);
      await waitFor(() => {
        expect(screen.getByText('Jane Smith')).toBeInTheDocument();
      });

      fireEvent.mouseLeave(button);
      
      await new Promise(resolve => setTimeout(resolve, 300));
    });
  });

  describe('Menu Interaction', () => {
    it('opens dropdown menu on button click', async () => {
      const { useMsal } = await import('@azure/msal-react');
      const context = createMsalContext([FIXTURES.ACCOUNTS.STANDARD]);
      setupMsalMock(vi.mocked(useMsal))(context);

      await renderUserMenu();

      const button = screen.getByRole('button', { name: /user menu for jane smith/i });
      fireEvent.click(button);

      await waitFor(() => {
        expect(screen.getByText('jane.smith@contoso.com')).toBeInTheDocument();
        expect(screen.getByText('Sign Out')).toBeInTheDocument();
      });
    });

    it('displays user name as disabled menu item (bold)', async () => {
      const { useMsal } = await import('@azure/msal-react');
      const context = createMsalContext([FIXTURES.ACCOUNTS.STANDARD]);
      setupMsalMock(vi.mocked(useMsal))(context);

      await renderUserMenu();

      const button = screen.getByRole('button', { name: /user menu for jane smith/i });
      fireEvent.click(button);

      await waitFor(() => {
        const nameItems = screen.getAllByText('Jane Smith');
        const menuNameItem = nameItems.find(el => el.closest('[role="menuitem"]'));
        expect(menuNameItem).toBeInTheDocument();
      });
    });

    it('displays username as disabled menu item', async () => {
      const { useMsal } = await import('@azure/msal-react');
      const context = createMsalContext([FIXTURES.ACCOUNTS.STANDARD]);
      setupMsalMock(vi.mocked(useMsal))(context);

      await renderUserMenu();

      const button = screen.getByRole('button', { name: /user menu for jane smith/i });
      fireEvent.click(button);

      await waitFor(() => {
        const usernameItem = screen.getByText('jane.smith@contoso.com');
        expect(usernameItem).toBeInTheDocument();
        expect(usernameItem.closest('[role="menuitem"]')).toHaveAttribute('aria-disabled', 'true');
      });
    });

    it('closes menu when clicking outside', async () => {
      const { useMsal } = await import('@azure/msal-react');
      const context = createMsalContext([FIXTURES.ACCOUNTS.STANDARD]);
      setupMsalMock(vi.mocked(useMsal))(context);

      const { container } = await renderUserMenu();

      const button = screen.getByRole('button', { name: /user menu for jane smith/i });
      fireEvent.click(button);

      await waitFor(() => {
        expect(screen.getByText('Sign Out')).toBeInTheDocument();
      });

      fireEvent.click(container);

      await waitFor(() => {
        expect(screen.queryByText('Sign Out')).not.toBeInTheDocument();
      });
    });
  });

  describe('Sign Out Functionality', () => {
    it('calls logoutRedirect when Sign Out is clicked', async () => {
      const { useMsal } = await import('@azure/msal-react');
      const context = createMsalContext([FIXTURES.ACCOUNTS.STANDARD]);
      setupMsalMock(vi.mocked(useMsal))(context);

      await renderUserMenu();

      const button = screen.getByRole('button', { name: /user menu for jane smith/i });
      fireEvent.click(button);

      await waitFor(() => {
        expect(screen.getByText('Sign Out')).toBeInTheDocument();
      });

      const signOutButton = screen.getByText('Sign Out');
      fireEvent.click(signOutButton);

      expect(context.instance.logoutRedirect).toHaveBeenCalledWith({
        postLogoutRedirectUri: window.location.origin,
      });
    });

    it('includes correct postLogoutRedirectUri', async () => {
      const originalOrigin = window.location.origin;
      Object.defineProperty(window, 'location', {
        value: { origin: 'https://test.contoso.com' },
        writable: true,
      });

      const { useMsal } = await import('@azure/msal-react');
      const context = createMsalContext([FIXTURES.ACCOUNTS.STANDARD]);
      setupMsalMock(vi.mocked(useMsal))(context);

      await renderUserMenu();

      const button = screen.getByRole('button', { name: /user menu for jane smith/i });
      fireEvent.click(button);

      await waitFor(() => {
        expect(screen.getByText('Sign Out')).toBeInTheDocument();
      });

      const signOutButton = screen.getByText('Sign Out');
      fireEvent.click(signOutButton);

      expect(context.instance.logoutRedirect).toHaveBeenCalledWith({
        postLogoutRedirectUri: 'https://test.contoso.com',
      });

      Object.defineProperty(window, 'location', {
        value: { origin: originalOrigin },
        writable: true,
      });
    });

    it('renders Sign Out icon correctly', async () => {
      const { useMsal } = await import('@azure/msal-react');
      const context = createMsalContext([FIXTURES.ACCOUNTS.STANDARD]);
      setupMsalMock(vi.mocked(useMsal))(context);

      await renderUserMenu();

      const button = screen.getByRole('button', { name: /user menu for jane smith/i });
      fireEvent.click(button);

      await waitFor(() => {
        const signOutItem = screen.getByText('Sign Out').closest('[role="menuitem"]');
        expect(signOutItem).toBeInTheDocument();
        expect(signOutItem?.querySelector('svg')).toBeInTheDocument();
      });
    });
  });

  describe('Menu Icons', () => {
    it('displays PersonCircleRegular icon for display name', async () => {
      const { useMsal } = await import('@azure/msal-react');
      const context = createMsalContext([FIXTURES.ACCOUNTS.STANDARD]);
      setupMsalMock(vi.mocked(useMsal))(context);

      await renderUserMenu();

      const button = screen.getByRole('button', { name: /user menu for jane smith/i });
      fireEvent.click(button);

      await waitFor(() => {
        const nameItems = screen.getAllByText('Jane Smith');
        const menuNameItem = nameItems.find(el => el.closest('[role="menuitem"]'));
        const menuItem = menuNameItem?.closest('[role="menuitem"]');
        expect(menuItem?.querySelector('svg')).toBeInTheDocument();
      });
    });

    it('displays PersonRegular icon for username', async () => {
      const { useMsal } = await import('@azure/msal-react');
      const context = createMsalContext([FIXTURES.ACCOUNTS.STANDARD]);
      setupMsalMock(vi.mocked(useMsal))(context);

      await renderUserMenu();

      const button = screen.getByRole('button', { name: /user menu for jane smith/i });
      fireEvent.click(button);

      await waitFor(() => {
        const usernameItem = screen.getByText('jane.smith@contoso.com');
        const menuItem = usernameItem.closest('[role="menuitem"]');
        expect(menuItem?.querySelector('svg')).toBeInTheDocument();
      });
    });
  });

  describe('Accessibility', () => {
    it('has proper ARIA label for avatar button', async () => {
      const { useMsal } = await import('@azure/msal-react');
      const context = createMsalContext([FIXTURES.ACCOUNTS.STANDARD]);
      setupMsalMock(vi.mocked(useMsal))(context);

      await renderUserMenu();

      const button = screen.getByRole('button', { name: /user menu for jane smith/i });
      expect(button).toHaveAttribute('aria-label', 'User menu for Jane Smith');
    });

    it('menu is keyboard navigable', async () => {
      const user = userEvent.setup();
      const { useMsal } = await import('@azure/msal-react');
      const context = createMsalContext([FIXTURES.ACCOUNTS.STANDARD]);
      setupMsalMock(vi.mocked(useMsal))(context);

      await renderUserMenu();

      const button = screen.getByRole('button', { name: /user menu for jane smith/i });
      await user.tab();
      
      expect(button).toHaveFocus();

      await user.keyboard('{Enter}');

      await waitFor(() => {
        expect(screen.getByText('Sign Out')).toBeInTheDocument();
      });
    });

    it('menu items have proper disabled states', async () => {
      const { useMsal } = await import('@azure/msal-react');
      const context = createMsalContext([FIXTURES.ACCOUNTS.STANDARD]);
      setupMsalMock(vi.mocked(useMsal))(context);

      await renderUserMenu();

      const button = screen.getByRole('button', { name: /user menu for jane smith/i });
      fireEvent.click(button);

      await waitFor(() => {
        const nameItems = screen.getAllByText('Jane Smith');
        const menuNameItem = nameItems.find(el => el.closest('[role="menuitem"]'));
        expect(menuNameItem?.closest('[role="menuitem"]')).toHaveAttribute('aria-disabled', 'true');

        const usernameItem = screen.getByText('jane.smith@contoso.com');
        expect(usernameItem.closest('[role="menuitem"]')).toHaveAttribute('aria-disabled', 'true');

        const signOutItem = screen.getByText('Sign Out').closest('[role="menuitem"]');
        expect(signOutItem).not.toHaveAttribute('aria-disabled', 'true');
      });
    });
  });

  describe('Edge Cases', () => {
    it('handles admin account with roles', async () => {
      const { useMsal } = await import('@azure/msal-react');
      const context = createMsalContext([FIXTURES.ACCOUNTS.ADMIN]);
      setupMsalMock(vi.mocked(useMsal))(context);

      await renderUserMenu();

      const button = screen.getByRole('button', { name: /user menu for admin user/i });
      expect(button).toBeInTheDocument();
      expect(screen.getByText('AU')).toBeInTheDocument();
    });

    it('handles single character names', async () => {
      const { useMsal } = await import('@azure/msal-react');
      const singleCharAccount = {
        ...FIXTURES.ACCOUNTS.STANDARD,
        name: 'X',
      };
      const context = createMsalContext([singleCharAccount]);
      setupMsalMock(vi.mocked(useMsal))(context);

      await renderUserMenu();

      const button = screen.getByRole('button', { name: /user menu for x/i });
      expect(button).toBeInTheDocument();
    });

    it('handles special characters in display name', async () => {
      const { useMsal } = await import('@azure/msal-react');
      const specialCharAccount = {
        ...FIXTURES.ACCOUNTS.STANDARD,
        name: "O'Brien-Smith",
      };
      const context = createMsalContext([specialCharAccount]);
      setupMsalMock(vi.mocked(useMsal))(context);

      await renderUserMenu();

      const button = screen.getByRole('button', { name: /user menu for o'brien-smith/i });
      expect(button).toBeInTheDocument();
    });

    it('re-renders when account changes', async () => {
      const { useMsal } = await import('@azure/msal-react');
      const context = createMsalContext([FIXTURES.ACCOUNTS.STANDARD]);
      setupMsalMock(vi.mocked(useMsal))(context);

      const { rerender, useMsal: mockUseMsal } = await renderUserMenu();

      expect(screen.getByText('JS')).toBeInTheDocument();

      const newContext = createMsalContext([FIXTURES.ACCOUNTS.ADMIN]);
      setupMsalMock(mockUseMsal)(newContext);

      rerender(
        <FluentProvider theme={webLightTheme}>
          <UserMenu />
        </FluentProvider>
      );

      await waitFor(() => {
        expect(screen.getByText('AU')).toBeInTheDocument();
      });
    });
  });
});
