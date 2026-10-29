import { Head, useForm } from "@inertiajs/react";
import { Alert, Button, Stack, TextField, Typography } from "@mui/material";
import React from "react";

import NoStore from "@/Components/Vendor/NoStore";
import { PageHeader, VendorCard } from "@/Components/Vendor/vendorUi";
import VendorLayout from "@/Layouts/VendorLayout";
import type { VendorStoreProfile } from "@/types/vendor";

interface Props {
    store: VendorStoreProfile | null;
}

/** The store's public face: its address on the shop, what it says about itself, how to reach it. */
export default function StoreProfile({ store }: Props): React.ReactElement {
    const { data, setData, patch, processing, errors, recentlySuccessful } = useForm({
        store_id: store?.id ?? 0,
        slug: store?.slug ?? "",
        description: store?.description ?? "",
        contact_phone: store?.contact_phone ?? "",
        contact_email: store?.contact_email ?? "",
    });

    return (
        <>
            <Head title="Store profile" />
            <PageHeader title="Store profile" subtitle="How your store appears to customers on the shop." />

            {!store ? (
                <NoStore />
            ) : (
                <VendorCard sx={{ maxWidth: 720 }}>
                    <Stack component="form" spacing={2} onSubmit={(e: React.FormEvent) => { e.preventDefault(); patch(route("vendor.store.update"), { preserveScroll: true }); }}>
                        {recentlySuccessful && <Alert severity="success">Saved.</Alert>}
                        <Typography variant="body2" color="text.secondary">
                            Store: <strong>{store.name}</strong>
                            {store.owner ? ` · owner ${store.owner}` : ""}
                        </Typography>
                        <TextField
                            label="Address on the shop"
                            value={data.slug}
                            onChange={(e) => setData("slug", e.target.value.toLowerCase())}
                            error={Boolean(errors.slug)}
                            helperText={errors.slug ?? `Customers open your store at /s/${data.slug || "your-store"}`}
                            required
                        />
                        <TextField label="About the store" value={data.description} onChange={(e) => setData("description", e.target.value)} multiline minRows={3} error={Boolean(errors.description)} helperText={errors.description} />
                        <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
                            <TextField fullWidth label="Phone" value={data.contact_phone} onChange={(e) => setData("contact_phone", e.target.value)} error={Boolean(errors.contact_phone)} helperText={errors.contact_phone} />
                            <TextField fullWidth label="Email" type="email" value={data.contact_email} onChange={(e) => setData("contact_email", e.target.value)} error={Boolean(errors.contact_email)} helperText={errors.contact_email} />
                        </Stack>
                        <Stack direction="row" spacing={1}>
                            <Button type="submit" variant="contained" disabled={processing}>Save</Button>
                            {store.public_url && <Button href={store.public_url} target="_blank" rel="noopener">See it on the shop</Button>}
                        </Stack>
                    </Stack>
                </VendorCard>
            )}
        </>
    );
}

StoreProfile.layout = (page: React.ReactNode) => <VendorLayout>{page}</VendorLayout>;
