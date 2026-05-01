// resources/js/Pages/Settings/Index.tsx
import * as React from "react";
import AdminLayout from "@/Layouts/AppLayout";
import { Head, Link } from "@inertiajs/react";
import {
    Box,
    Card,
    CardContent,
    Divider,
    FormControl,
    RadioGroup,
    FormControlLabel,
    Radio,
    Stack,
    Typography,
    Button,
    List,
    Grid,
} from "@mui/material";
import {
    SettingsSuggest,
    Storefront,
    People,
    AccountBalance,
    Description,
    History,
    EventNote,
} from "@mui/icons-material";
import { ThemeContext } from "@/app";

type ThemeSetting = "light" | "dark" | "system";

export default function SettingsIndex() {
    const { toggleTheme, currentSetting } = React.useContext(ThemeContext) as {
        toggleTheme: (newMode: ThemeSetting) => void;
        currentSetting: ThemeSetting;
    };

    return (
        <Box sx={{ p: 3, maxWidth: 1200 }}>
            <Head title="Settings" />

            <Stack spacing={1} mb={4}>
                <Typography variant="h5" fontWeight={800}>
                    Settings
                </Typography>
                <Typography variant="body2" sx={{ color: "text.secondary" }}>
                    Configure your ERP environment and system utilities.
                </Typography>
            </Stack>

            <Grid container spacing={3}>
                {/* Slim Theme Toggle */}
                <Grid size={12}>
                    <Card
                        elevation={0}
                        sx={{
                            borderRadius: "12px",
                            border: "1px solid",
                            borderColor: "divider",
                        }}
                    >
                        <CardContent
                            sx={{ py: 1.5, "&:last-child": { pb: 1.5 } }}
                        >
                            <Stack
                                direction="row"
                                alignItems="center"
                                justifyContent="space-between"
                            >
                                <Stack
                                    direction="row"
                                    spacing={2}
                                    alignItems="center"
                                >
                                    <SettingsSuggest
                                        sx={{ color: "text.secondary" }}
                                    />
                                    <Typography
                                        variant="subtitle2"
                                        fontWeight={700}
                                    >
                                        System Appearance
                                    </Typography>
                                </Stack>

                                <FormControl>
                                    <RadioGroup
                                        row
                                        value={currentSetting}
                                        onChange={(e) =>
                                            toggleTheme(
                                                e.target.value as ThemeSetting,
                                            )
                                        }
                                    >
                                        <FormControlLabel
                                            value="dark"
                                            control={
                                                <Radio
                                                    size="small"
                                                    color="secondary"
                                                />
                                            }
                                            label="Dark"
                                        />
                                        <FormControlLabel
                                            value="light"
                                            control={
                                                <Radio
                                                    size="small"
                                                    color="secondary"
                                                />
                                            }
                                            label="Light"
                                        />
                                        <FormControlLabel
                                            value="system"
                                            control={
                                                <Radio
                                                    size="small"
                                                    color="secondary"
                                                />
                                            }
                                            label="System"
                                        />
                                    </RadioGroup>
                                </FormControl>
                            </Stack>
                        </CardContent>
                    </Card>
                </Grid>

                {/* Infrastructure Card */}
                <Grid size={{ xs: 12, md: 6 }}>
                    <Card
                        elevation={0}
                        sx={{
                            height: "100%",
                            borderRadius: "12px",
                            border: "1px solid",
                            borderColor: "divider",
                        }}
                    >
                        <CardContent>
                            <Typography
                                variant="overline"
                                fontWeight={800}
                                color="text.secondary"
                            >
                                Infrastructure
                            </Typography>
                            <List sx={{ mt: 1 }}>
                                <SettingItem
                                    icon={<Storefront />}
                                    title="Locations"
                                    desc="Manage Stores and Warehouses"
                                    href="/locations"
                                />
                                <Divider
                                    variant="inset"
                                    component="li"
                                    sx={{ my: 1 }}
                                />
                                <SettingItem
                                    icon={<People />}
                                    title="User Management"
                                    desc="Roles and staff permissions"
                                    href="/users"
                                />
                                <Divider
                                    variant="inset"
                                    component="li"
                                    sx={{ my: 1 }}
                                />
                                <SettingItem
                                    icon={<History />}
                                    title="Sessions"
                                    desc="Security logs and login history"
                                    href="/sessions"
                                />
                            </List>
                        </CardContent>
                    </Card>
                </Grid>

                {/* Operations & Logistics Card */}
                <Grid size={{ xs: 12, md: 6 }}>
                    <Card
                        elevation={0}
                        sx={{
                            height: "100%",
                            borderRadius: "12px",
                            border: "1px solid",
                            borderColor: "divider",
                        }}
                    >
                        <CardContent>
                            <Typography
                                variant="overline"
                                fontWeight={800}
                                color="text.secondary"
                            >
                                Operations Hub
                            </Typography>
                            <List sx={{ mt: 1 }}>
                                <SettingItem
                                    icon={<AccountBalance />}
                                    title="Balance"
                                    desc="Financial ledgers and currency"
                                    href="/balance"
                                />
                                <Divider
                                    variant="inset"
                                    component="li"
                                    sx={{ my: 1 }}
                                />
                                <SettingItem
                                    icon={<Description />}
                                    title="Documents"
                                    desc="Templates for invoices and labels"
                                    href="/documents"
                                />
                                <Divider
                                    variant="inset"
                                    component="li"
                                    sx={{ my: 1 }}
                                />
                                <SettingItem
                                    icon={<EventNote />}
                                    title="Calendar"
                                    desc="System scheduling and task logs"
                                    href="/calendar"
                                />
                            </List>
                        </CardContent>
                    </Card>
                </Grid>
            </Grid>
        </Box>
    );
}

// Fixed SettingItem with TypeScript href prop and Inertia Link
function SettingItem({
    icon,
    title,
    desc,
    href,
}: {
    icon: React.ReactNode;
    title: string;
    desc: string;
    href?: string;
}) {
    return (
        <Stack
            direction="row"
            spacing={2}
            alignItems="center"
            sx={{
                p: 1,
                borderRadius: 1,
                "&:hover": { bgcolor: "action.hover" },
            }}
        >
            <Box sx={{ color: "text.secondary", display: "flex" }}>{icon}</Box>
            <Box sx={{ flexGrow: 1 }}>
                <Typography variant="body2" fontWeight={700}>
                    {title}
                </Typography>
                <Typography variant="caption" sx={{ color: "text.secondary" }}>
                    {desc}
                </Typography>
            </Box>
            <Button
                component={href ? Link : "button"}
                href={href}
                size="small"
                variant="outlined"
                sx={{ borderRadius: "8px", textTransform: "none" }}
            >
                Open
            </Button>
        </Stack>
    );
}

SettingsIndex.layout = (page: React.ReactNode) => (
    <AdminLayout>{page}</AdminLayout>
);
