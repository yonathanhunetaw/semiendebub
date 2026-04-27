import {
    SELLER_BRAND_DARK,
    SellerCard,
    SellerHeader,
    sellerAvatarText,
    sellerName,
} from "@/Components/Seller/sellerUi";
import SellerLayout from "@/Layouts/SellerLayout";
import { Head, Link, useForm, usePage } from "@inertiajs/react";
import { Avatar, Box, Button, FormControlLabel, Stack, Switch, TextField, Typography } from "@mui/material";
import React from "react";

interface AuthUser {
    id: number;
    first_name?: string;
    email?: string;
}

export default function Index() {
    const { auth } = usePage().props as { auth?: { user?: AuthUser } };
    const user = auth?.user;

    const { data, setData, patch, processing } = useForm({
        notification_email: user?.email ?? "",
        notes: "",
        email_notifications: true,
        push_notifications: false,
    });

    const submit = (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        patch(route("seller.settings.update"));
    };

    return (
        <>
            <Head title="Seller Settings" />

            <SellerHeader title="Settings" />

            <Box component="form" onSubmit={submit} sx={{ px: 2, pt: 2 }}>
                <Stack spacing={1.5}>
                    <SellerCard>
                        <Stack direction="row" spacing={2} alignItems="center">
                            <Avatar sx={{ width: 52, height: 52, bgcolor: SELLER_BRAND_DARK }}>
                                {sellerAvatarText(user?.first_name)}
                            </Avatar>
                            <Box>
                                <Typography sx={{ fontWeight: 800 }}>
                                    {sellerName([user?.first_name]) || "Seller"}
                                </Typography>
                                <Typography variant="body2" color="text.secondary">
                                    {user?.email || "No email on file"}
                                </Typography>
                            </Box>
                        </Stack>
                    </SellerCard>

                    <SellerCard>
                        <Typography sx={{ fontWeight: 800, mb: 1 }}>Notifications</Typography>
                        <FormControlLabel
                            control={(
                                <Switch
                                    checked={data.email_notifications}
                                    onChange={(event) => setData("email_notifications", event.target.checked)}
                                />
                            )}
                            label="Email notifications"
                        />
                        <FormControlLabel
                            control={(
                                <Switch
                                    checked={data.push_notifications}
                                    onChange={(event) => setData("push_notifications", event.target.checked)}
                                />
                            )}
                            label="Push notifications"
                        />
                    </SellerCard>

                    <SellerCard>
                        <Stack spacing={2}>
                            <Typography sx={{ fontWeight: 800 }}>Profile Notes</Typography>
                            <TextField
                                fullWidth
                                label="Notification email"
                                value={data.notification_email}
                                onChange={(event) => setData("notification_email", event.target.value)}
                            />
                            <TextField
                                fullWidth
                                label="Selling notes"
                                multiline
                                minRows={4}
                                value={data.notes}
                                onChange={(event) => setData("notes", event.target.value)}
                                placeholder="Opening notes, reminder messages, or customer follow-ups."
                            />
                            <Button
                                type="submit"
                                variant="contained"
                                disabled={processing}
                                sx={{
                                    borderRadius: 3,
                                    textTransform: "none",
                                    bgcolor: SELLER_BRAND_DARK,
                                    "&:hover": { bgcolor: SELLER_BRAND_DARK },
                                }}
                            >
                                Save Settings
                            </Button>
                        </Stack>
                    </SellerCard>

                    <Button
                        component={Link}
                        href={route("logout")}
                        method="post"
                        as="button"
                        variant="contained"
                        color="error"
                        sx={{ borderRadius: 3, textTransform: "none", mb: 1 }}
                    >
                        Sign Out
                    </Button>
                </Stack>
            </Box>
        </>
    );
}

Index.layout = (page: React.ReactNode) => <SellerLayout>{page}</SellerLayout>;
