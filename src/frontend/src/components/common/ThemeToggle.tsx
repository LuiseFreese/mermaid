import React from 'react';
import { Button, Menu, MenuTrigger, MenuPopover, MenuList, MenuItem } from '@fluentui/react-components';
import { WeatherSunnyRegular, WeatherMoonRegular, DesktopRegular, HeartRegular, FlashRegular } from '@fluentui/react-icons';
import { useTheme } from '../../context/ThemeContext';
import styles from './ThemeToggle.module.css';

export const ThemeToggle: React.FC = () => {
  const { theme, setTheme } = useTheme();

  const themeOptions = [
    { key: 'light', label: 'Light', icon: <WeatherSunnyRegular /> },
    { key: 'dark', label: 'Dark', icon: <WeatherMoonRegular /> },
    { key: 'pink', label: 'Pink', icon: <HeartRegular /> },
    { key: 'neon', label: 'Neon', icon: <FlashRegular /> },
    { key: 'auto', label: 'System', icon: <DesktopRegular /> }
  ];

  const currentOption = themeOptions.find(opt => opt.key === theme);

  return (
    <div className={styles.themeToggle}>
      <Menu>
        <MenuTrigger disableButtonEnhancement>
          <Button 
            appearance="subtle" 
            icon={currentOption?.icon}
            aria-label="Change theme"
            title="Switch between light, dark, pink, neon, and system theme"
            className={styles.toggleButton}
          >
            {currentOption?.label}
          </Button>
        </MenuTrigger>
        <MenuPopover>
          <MenuList>
            {themeOptions.map(option => (
              <MenuItem 
                key={option.key}
                icon={option.icon}
                onClick={() => setTheme(option.key as any)}
              >
                {option.label}
              </MenuItem>
            ))}
          </MenuList>
        </MenuPopover>
      </Menu>
    </div>
  );
};
