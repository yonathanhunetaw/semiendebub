import SellerLayout from "@/Layouts/SellerLayout";
import { Head, useForm } from "@inertiajs/react";
import { Box, Button, Paper, Stack, TextField, Typography } from "@mui/material";
import React from "react";

export default function Index() {
    const { data, setData, patch, processing } = useForm({
        notification_email: "",
        notes: "",
    });

    const submit = (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        patch(route("seller.settings.update"));
    };

    return (
        <>
            <Head title="Seller Settings" />

            <Box sx={{ mb: 4 }}>
                <Typography variant="h4" sx={{ fontWeight: 800 }}>
                    Seller Settings
                </Typography>
                <Typography variant="body1" color="text.secondary">
                    Workspace preferences for communication and day-to-day selling flow.
                </Typography>
            </Box>

            <Paper elevation={0} sx={{ p: 3, borderRadius: 3, border: "1px solid", borderColor: "divider", maxWidth: 760 }}>
                <Box component="form" onSubmit={submit}>
                    <Stack spacing={2.5}>
                        <TextField
                            fullWidth
                            label="Notification Email"
                            value={data.notification_email}
                            onChange={(event) => setData("notification_email", event.target.value)}
                        />
                        <TextField
                            fullWidth
                            label="Sales Notes"
                            multiline
                            minRows={4}
                            value={data.notes}
                            onChange={(event) => setData("notes", event.target.value)}
                        />
                        <Stack direction="row" justifyContent="flex-end">
                            <Button type="submit" variant="contained" disabled={processing} sx={{ borderRadius: 3, textTransform: "none" }}>
                                Save Settings
                            </Button>
                        </Stack>
                    </Stack>
                </Box>
            </Paper>
        </>
    );
}

Index.layout = (page: React.ReactNode) => <SellerLayout>{page}</SellerLayout>;
