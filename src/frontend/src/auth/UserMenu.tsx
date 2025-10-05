import React from 'react';
import { useMsal } from '@azure/msal-react';
import {
  Button,
  Menu,
  MenuItem,
  MenuList,
  MenuPopover,
  MenuTrigger,
  Avatar,
  Tooltip,
} from '@fluentui/react-components';
import {
  PersonRegular,
  SignOutRegular,
  PersonCircleRegular,
} from '@fluentui/react-icons';

/**
 * UserMenu component - displays user info and logout option
 */
export const UserMenu: React.FC = () => {
  const { instance, accounts } = useMsal();
  const account = accounts[0];

  const handleLogout = () => {
    instance.logoutRedirect({
      postLogoutRedirectUri: window.location.origin,
    });
  };

  if (!account) {
    return null;
  }

  const displayName = account.name || account.username;
  const initials = displayName
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .substring(0, 2);

  return (
    <Menu>
      <MenuTrigger disableButtonEnhancement>
        <Tooltip content={displayName} relationship="description">
          <Button
            appearance="subtle"
            icon={<Avatar name={displayName} initials={initials} size={32} />}
            aria-label={`User menu for ${displayName}`}
          />
        </Tooltip>
      </MenuTrigger>

      <MenuPopover>
        <MenuList>
          <MenuItem
            icon={<PersonCircleRegular />}
            disabled
            style={{ fontWeight: 'bold' }}
          >
            {displayName}
          </MenuItem>
          <MenuItem icon={<PersonRegular />} disabled>
            {account.username}
          </MenuItem>
          <MenuItem icon={<SignOutRegular />} onClick={handleLogout}>
            Sign Out
          </MenuItem>
        </MenuList>
      </MenuPopover>
    </Menu>
  );
};
