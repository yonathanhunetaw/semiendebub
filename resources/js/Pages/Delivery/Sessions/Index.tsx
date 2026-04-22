import * as React from "react";
import DeliveryLayout from "@/Layouts/DeliveryLayout";
import {
    Container,
    Typography,
    Paper,
    List,
    ListItem,
    ListItemText,
    IconButton,
    Tooltip,
    Box,
    Alert,
    Stack,
} from "@mui/material";
import {
    DeleteForever,
    PhoneIphone,
    Computer,
    ArrowBack,
} from "@mui/icons-material";
import { router, Head, Link } from "@inertiajs/react";


interface Session {
    id: string;
    ip_address: string;
    is_current_device: boolean;
    agent: {
        is_desktop: boolean;
        platform: string;
        browser: string;
    };
    last_active: string;
}

interface Props {
    sessions: Session[];
}

export default function SessionsIndex({ sessions }: Props) {
    const handleRevoke = (id: string) => {
        if (confirm("Are you sure you want to log out of this device?")) {
            router.delete(route("delivery.sessions.destroy", id));
        }
    };

    return (
        <Container sx={{ mt: 3 }}>
            <Head title="Active Sessions" />

            {/* Top Navigation Bar with Back Button */}
            <Stack
                direction="row"
                alignItems="center"
                spacing={1}
                sx={{ mb: 2, ml: -1 }} // Slight negative margin to align icon with text
            >
                <IconButton
                    component={Link}
                    href={route("delivery.profile.index")}
                    aria-label="back to profile"
                >
                    <ArrowBack />
                </IconButton>
                <Typography variant="h5" fontWeight="bold">
                    Browser Sessions
                </Typography>
            </Stack>

            <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                If necessary, you may log out of all of your other browser
                sessions across all of your devices.
            </Typography>

            <Paper elevation={2} sx={{ borderRadius: 2, overflow: 'hidden' }}>
                <List disablePadding>
                    {sessions.map((session, index) => (
                        <ListItem
                            key={session.id}
                            divider={index !== sessions.length - 1}
                            secondaryAction={
                                !session.is_current_device && (
                                    <Tooltip title="Log out this device">
                                        <IconButton
                                            edge="end"
                                            color="error"
                                            onClick={() =>
                                                handleRevoke(session.id)
                                            }
                                        >
                                            <DeleteForever />
                                        </IconButton>
                                    </Tooltip>
                                )
                            }
                        >
                            <Box sx={{ mr: 2, display: 'flex', color: "text.secondary" }}>
                                {session.agent.is_desktop ? (
                                    <Computer />
                                ) : (
                                    <PhoneIphone />
                                )}
                            </Box>

                            <ListItemText
                                primary={`${session.agent.platform} - ${session.agent.browser}`}
                                secondary={
                                    <React.Fragment>
                                        <Typography
                                            component="span"
                                            variant="body2"
                                            color="text.primary"
                                        >
                                            {session.ip_address}
                                        </Typography>
                                        {session.is_current_device ? (
                                            <Typography
                                                component="span"
                                                variant="body2"
                                                color="success.main"
                                                sx={{
                                                    ml: 1,
                                                    fontWeight: "bold",
                                                }}
                                            >
                                                • This device
                                            </Typography>
                                        ) : (
                                            ` • Last active ${session.last_active}`
                                        )}
                                    </React.Fragment>
                                }
                            />
                        </ListItem>
                    ))}
                </List>
            </Paper>

            <Box sx={{ mt: 3 }}>
                <Alert severity="info" sx={{ borderRadius: 2 }}>
                    If you feel your account is compromised, you should also
                    update your password.
                </Alert>
            </Box>
        </Container>
    );
}

SessionsIndex.layout = (page: React.ReactNode) => (
    <DeliveryLayout children={page} />
);
