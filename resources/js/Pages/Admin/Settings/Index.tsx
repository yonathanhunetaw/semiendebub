import * as React from "react";
import AdminLayout from "@/Components/Admin/AdminLayout";
import { Head } from "@inertiajs/react";
import {
    Box,
    Button,
    Card,
    CardContent,
    Chip,
    Divider,
    FormControl,
    FormControlLabel,
    Radio,
    RadioGroup,
    Stack,
    Typography,
} from "@mui/material";
import { ThemeContext } from "@/app";

type ThemeSetting = "light" | "dark" | "system";

export default function SettingsIndex() {
    const { toggleTheme, currentSetting } = React.useContext(ThemeContext) as {
        toggleTheme: (newMode: ThemeSetting) => void;
        currentSetting: ThemeSetting;
    };

    return (
        <Box sx={{ p: 3, maxWidth: 1100 }}>
            <Head title="Settings" />

            <Stack spacing={1} mb={3}>
                <Typography variant="h5" fontWeight={800} sx={{ color: "#fff" }}>
                    Settings
                </Typography>
                <Typography variant="body2" sx={{ color: "rgba(255,255,255,0.72)" }}>
                    Layout for now. Theme settings are live so you can keep every page looking good in both modes.
                </Typography>
            </Stack>

            <Stack spacing={2.5}>
                {/* Appearance */}
                <Card
                    elevation={0}
                    sx={{
                        backgroundColor: "#272727",
                        borderRadius: "12px",
                        border: "1px solid rgba(255, 255, 255, 0.10)",
                    }}
                >
                    <CardContent>
                        <Stack direction="row" justifyContent="space-between" alignItems="center" mb={1.5}>
                            <Typography fontWeight={800} sx={{ color: "#fff" }}>
                                Appearance
                            </Typography>
                            <Chip size="small" label="Active" color="success" />
                        </Stack>

                        <Divider sx={{ borderColor: "rgba(255,255,255,0.08)", mb: 2 }} />

                        <Stack spacing={1.5}>
                            <Typography variant="subtitle2" sx={{ color: "rgba(255,255,255,0.72)" }}>
                                Theme mode
                            </Typography>

                            <FormControl>
                                <RadioGroup
                                    value={currentSetting}
                                    onChange={(e) => toggleTheme(e.target.value as ThemeSetting)}
                                >
                                    <FormControlLabel
                                        value="dark"
                                        control={<Radio />}
                                        label={<Typography sx={{ color: "#fff" }}>Dark</Typography>}
                                    />
                                    <FormControlLabel
                                        value="light"
                                        control={<Radio />}
                                        label={<Typography sx={{ color: "#fff" }}>Light</Typography>}
                                    />
                                    <FormControlLabel
                                        value="system"
                                        control={<Radio />}
                                        label={<Typography sx={{ color: "#fff" }}>System</Typography>}
                                    />
                                </RadioGroup>
                            </FormControl>

                            <Typography variant="caption" sx={{ color: "rgba(255,255,255,0.60)" }}>
                                “System” follows your device preference automatically.
                            </Typography>
                        </Stack>
                    </CardContent>
                </Card>

                {/* Layout placeholders for future */}
                <Stack direction={{ xs: "column", md: "row" }} spacing={2.5}>
                    <Card
                        elevation={0}
                        sx={{
                            flex: 1,
                            backgroundColor: "#272727",
                            borderRadius: "12px",
                            border: "1px solid rgba(255, 255, 255, 0.10)",
                        }}
                    >
                        <CardContent>
                            <Stack direction="row" justifyContent="space-between" alignItems="center" mb={1.5}>
                                <Typography fontWeight={800} sx={{ color: "#fff" }}>
                                    Notifications
                                </Typography>
                                <Chip size="small" label="Layout" variant="outlined" sx={{ color: "#fff" }} />
                            </Stack>
                            <Divider sx={{ borderColor: "rgba(255,255,255,0.08)", mb: 2 }} />
                            <Typography variant="body2" sx={{ color: "rgba(255,255,255,0.72)" }}>
                                Placeholder for delivery / payments / low-stock alerts, and admin notifications.
                            </Typography>
                            <Button disabled sx={{ mt: 2 }} variant="contained">
                                Configure
                            </Button>
                        </CardContent>
                    </Card>

                    <Card
                        elevation={0}
                        sx={{
                            flex: 1,
                            backgroundColor: "#272727",
                            borderRadius: "12px",
                            border: "1px solid rgba(255, 255, 255, 0.10)",
                        }}
                    >
                        <CardContent>
                            <Stack direction="row" justifyContent="space-between" alignItems="center" mb={1.5}>
                                <Typography fontWeight={800} sx={{ color: "#fff" }}>
                                    Admin preferences
                                </Typography>
                                <Chip size="small" label="Layout" variant="outlined" sx={{ color: "#fff" }} />
                            </Stack>
                            <Divider sx={{ borderColor: "rgba(255,255,255,0.08)", mb: 2 }} />
                            <Typography variant="body2" sx={{ color: "rgba(255,255,255,0.72)" }}>
                                Placeholder for defaults used across sidebar pages (tables density, currency, date format, etc.).
                            </Typography>
                            <Button disabled sx={{ mt: 2 }} variant="contained">
                                Configure
                            </Button>
                        </CardContent>
                    </Card>
                </Stack>
            </Stack>
        </Box>
    );
}

SettingsIndex.layout = (page: React.ReactNode) => <AdminLayout>{page}</AdminLayout>;

