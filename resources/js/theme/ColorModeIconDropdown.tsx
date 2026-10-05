import * as React from 'react';
import DarkModeIcon from '@mui/icons-material/DarkModeRounded';
import LightModeIcon from '@mui/icons-material/LightModeRounded';
import IconButton, { IconButtonOwnProps } from '@mui/material/IconButton';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import { useTheme } from '@mui/material/styles';
import { ThemeContext } from '@/app';
import type { ThemeSetting } from '@/theme';

/**
 * Light / dark / system picker.
 *
 * Wired to ThemeContext from app.tsx (the single mode source). MUI's
 * useColorScheme() only works with a `colorSchemes` / CSS-variables theme,
 * which app.tsx does not create, so it always returned an undefined mode and
 * this rendered as an empty placeholder box.
 */
export default function ColorModeIconDropdown(props: IconButtonOwnProps) {
    const { toggleTheme, currentSetting } = React.useContext(ThemeContext);
    const mode = currentSetting as ThemeSetting;
    const setMode = toggleTheme;
    const resolvedMode = useTheme().palette.mode;
    const [anchorEl, setAnchorEl] = React.useState<null | HTMLElement>(null);
    const open = Boolean(anchorEl);
    const handleClick = (event: React.MouseEvent<HTMLElement>) => {
        setAnchorEl(event.currentTarget);
    };
    const handleClose = () => {
        setAnchorEl(null);
    };
    const handleMode = (targetMode: 'system' | 'light' | 'dark') => () => {
        setMode(targetMode);
        handleClose();
    };
    const icon = {
        light: <LightModeIcon />,
        dark: <DarkModeIcon />,
    }[resolvedMode];
    return (
        <React.Fragment>
            <IconButton
                data-screenshot="toggle-mode"
                onClick={handleClick}
                disableRipple
                size="small"
                aria-controls={open ? 'color-scheme-menu' : undefined}
                aria-haspopup="true"
                aria-expanded={open ? 'true' : undefined}
                {...props}
            >
                {icon}
            </IconButton>
            <Menu
                anchorEl={anchorEl}
                id="account-menu"
                open={open}
                onClose={handleClose}
                onClick={handleClose}
                slotProps={{
                    paper: {
                        variant: 'outlined',
                        elevation: 0,
                        sx: {
                            my: '4px',
                        },
                    },
                }}
                transformOrigin={{ horizontal: 'right', vertical: 'top' }}
                anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
            >
                <MenuItem selected={mode === 'system'} onClick={handleMode('system')}>
                    System
                </MenuItem>
                <MenuItem selected={mode === 'light'} onClick={handleMode('light')}>
                    Light
                </MenuItem>
                <MenuItem selected={mode === 'dark'} onClick={handleMode('dark')}>
                    Dark
                </MenuItem>
            </Menu>
        </React.Fragment>
    );
}
