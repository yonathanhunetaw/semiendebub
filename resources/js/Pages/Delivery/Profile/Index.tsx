import * as React from 'react';
import DeliveryLayout from '@/Layouts/DeliveryLayout';
import {
    Container,
    Typography,
    Box,
    Paper,
    ToggleButton,
    ToggleButtonGroup,
    Divider,
    List,
    ListItem,
    ListItemText,
    ListItemIcon,
    ListItemButton
} from '@mui/material';
import { LightMode, DarkMode, SettingsBrightness, Devices, ChevronRight } from '@mui/icons-material';
import { Link } from '@inertiajs/react';
import { ThemeContext } from '@/app';

export default function ProfileIndex() {
    const { toggleTheme, currentSetting } = React.useContext(ThemeContext);

    const handleThemeChange = (
        event: React.MouseEvent<HTMLElement>,
        newSetting: 'light' | 'dark' | 'system'
    ) => {
        if (newSetting !== null) {
            toggleTheme(newSetting);
        }
    };

    return (
        <Container sx={{ mt: 3 }}>
            <Typography variant="h5" fontWeight="bold" gutterBottom>
                Profile Settings
            </Typography>

            {/* Appearance Section */}
            <Paper sx={{ p: 3, mt: 2 }}>
                <Typography variant="subtitle1" fontWeight="bold">Appearance</Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                    Customize the app theme.
                </Typography>

                <ToggleButtonGroup
                    value={currentSetting}
                    exclusive
                    onChange={handleThemeChange}
                    fullWidth
                    color="primary"
                >
                    <ToggleButton value="light"><LightMode sx={{ mr: 1 }} /> Light</ToggleButton>
                    <ToggleButton value="system"><SettingsBrightness sx={{ mr: 1 }} /> System</ToggleButton>
                    <ToggleButton value="dark"><DarkMode sx={{ mr: 1 }} /> Dark</ToggleButton>
                </ToggleButtonGroup>
            </Paper>

            {/* Security Section */}
            <Paper sx={{ mt: 3 }}>
                <List>
                    <ListItem disablePadding>
                        <ListItemButton component={Link} href={route('delivery.sessions.index')}>
                            <ListItemIcon>
                                <Devices />
                            </ListItemIcon>
                            <ListItemText
                                primary="Browser Sessions"
                                secondary="Manage and logout of active devices"
                            />
                            <ChevronRight />
                        </ListItemButton>
                    </ListItem>
                </List>
            </Paper>

            <Divider sx={{ my: 4 }} />
        </Container>
    );
}

ProfileIndex.layout = (page: React.ReactNode) => <DeliveryLayout children={page} />;
