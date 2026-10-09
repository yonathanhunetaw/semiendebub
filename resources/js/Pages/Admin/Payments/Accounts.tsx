import { Head, router, useForm } from "@inertiajs/react";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import DeleteRoundedIcon from "@mui/icons-material/DeleteRounded";
import EditRoundedIcon from "@mui/icons-material/EditRounded";
import {
    Alert,
    Box,
    Button,
    Chip,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    FormControlLabel,
    Grid,
    IconButton,
    MenuItem,
    Paper,
    Snackbar,
    Stack,
    Switch,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    TextField,
    Tooltip,
    Typography,
} from "@mui/material";
import React from "react";

import AdminLayout from "@/Layouts/AdminLayout";
import type { SharedProps } from "@/types/shipment";

type AccountType = "bank" | "wallet";
type Purpose = "collection" | "settlement";

/** One payment account, as PaymentAccountController::index shapes it. */
interface Account {
    id: number;
    store_id: number;
    store: string | null;
    type: AccountType;
    provider: string;
    provider_name: string;
    account_number: string;
    account_name: string;
    owner_user_id: number;
    owner: string | null;
    purpose: Purpose;
    is_active: boolean;
    /** Parts customers say they paid in, waiting on the owner. */
    waiting: number;
    /** For a settlement account: the sellers who hand money over to it. */
    remitter_ids: number[];
}

interface Option {
    id: number;
    name: string;
}

interface Props extends SharedProps {
    accounts?: Account[];
    stores?: Option[];
    owners?: Array<Option & { store_id: number | null }>;
    providers?: Array<{ id: string; name: string; type: AccountType }>;
}

/**
 * The accounts customers pay into, per store, and the seller who owns each.
 *
 * Sellers at a store see its active collection accounts at checkout. When a
 * customer says they paid, the owner checks the account and confirms it in
 * the seller app.
 */
export default function PaymentAccounts({
    accounts = [],
    stores = [],
    owners = [],
    providers = [],
    flash,
}: Props): React.ReactElement {
    const [editing, setEditing] = React.useState<Account | "new" | null>(null);
    const [notice, setNotice] = React.useState<string | null>(null);

    React.useEffect(() => {
        const message = flash?.success ?? flash?.error ?? null;
        if (message) setNotice(message);
    }, [flash?.success, flash?.error]);

    return (
        <>
            <Head title="Payment accounts" />

            <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" alignItems={{ sm: "center" }} gap={1.5} mb={2}>
                <Box>
                    <Typography variant="h5" fontWeight={800}>Payment accounts</Typography>
                    <Typography variant="body2" color="text.secondary">
                        Accounts customers pay into. Sellers see a store&apos;s active collection accounts at checkout;
                        each account&apos;s owner confirms the deposits.
                    </Typography>
                </Box>
                <Button variant="contained" startIcon={<AddRoundedIcon />} onClick={() => setEditing("new")} sx={{ flexShrink: 0 }}>
                    Add account
                </Button>
            </Stack>

            <TableContainer component={Paper} variant="outlined">
                <Table size="small">
                    <TableHead>
                        <TableRow>
                            <TableCell sx={{ fontWeight: 800 }}>Account</TableCell>
                            <TableCell sx={{ fontWeight: 800 }}>Store</TableCell>
                            <TableCell sx={{ fontWeight: 800 }}>Owner</TableCell>
                            <TableCell sx={{ fontWeight: 800 }}>Use</TableCell>
                            <TableCell sx={{ fontWeight: 800 }}>Waiting</TableCell>
                            <TableCell sx={{ fontWeight: 800 }}>Status</TableCell>
                            <TableCell align="right" sx={{ fontWeight: 800 }}>Actions</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {accounts.map((a) => (
                            <TableRow key={a.id} hover>
                                <TableCell>
                                    <Typography variant="body2" fontWeight={700}>{a.provider_name}</Typography>
                                    <Typography variant="caption" color="text.secondary" sx={{ fontFamily: "monospace" }}>
                                        {a.account_number}
                                    </Typography>
                                    <Typography variant="caption" color="text.secondary" component="div">
                                        {a.account_name}
                                    </Typography>
                                </TableCell>
                                <TableCell>{a.store ?? "—"}</TableCell>
                                <TableCell>{a.owner ?? "—"}</TableCell>
                                <TableCell>
                                    <Chip size="small" variant="outlined" label={a.purpose === "collection" ? "Customers pay in" : "Settlement"} />
                                    {a.purpose === "settlement" ? (
                                        <Typography variant="caption" color="text.secondary" component="div">
                                            {a.remitter_ids.length} seller{a.remitter_ids.length === 1 ? "" : "s"} hand over here
                                        </Typography>
                                    ) : null}
                                </TableCell>
                                <TableCell>{a.waiting > 0 ? <Chip size="small" color="warning" label={a.waiting} /> : 0}</TableCell>
                                <TableCell>
                                    <Chip
                                        size="small"
                                        variant="outlined"
                                        label={a.is_active ? "Active" : "Off"}
                                        color={a.is_active ? "success" : "default"}
                                    />
                                </TableCell>
                                <TableCell align="right">
                                    <Tooltip title="Edit">
                                        <IconButton size="small" onClick={() => setEditing(a)}>
                                            <EditRoundedIcon fontSize="small" />
                                        </IconButton>
                                    </Tooltip>
                                    <Tooltip title="Remove">
                                        <IconButton
                                            size="small"
                                            color="error"
                                            onClick={() => router.delete(route("admin.payment-accounts.destroy", a.id), { preserveScroll: true })}
                                        >
                                            <DeleteRoundedIcon fontSize="small" />
                                        </IconButton>
                                    </Tooltip>
                                </TableCell>
                            </TableRow>
                        ))}
                        {accounts.length === 0 && (
                            <TableRow>
                                <TableCell colSpan={7} align="center" sx={{ py: 5 }}>
                                    <Typography color="text.secondary">
                                        No accounts yet. Add one so sellers can take payments into it.
                                    </Typography>
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </TableContainer>

            {editing !== null && (
                <AccountDialog
                    account={editing === "new" ? null : editing}
                    stores={stores}
                    owners={owners}
                    providers={providers}
                    onClose={() => setEditing(null)}
                />
            )}

            <Snackbar
                open={notice !== null}
                autoHideDuration={4000}
                onClose={() => setNotice(null)}
                anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
            >
                <Alert severity={flash?.error ? "error" : "success"} variant="filled">
                    {notice}
                </Alert>
            </Snackbar>
        </>
    );
}

function AccountDialog({
    account,
    stores,
    owners,
    providers,
    onClose,
}: {
    account: Account | null;
    stores: Option[];
    owners: Array<Option & { store_id: number | null }>;
    providers: Array<{ id: string; name: string; type: AccountType }>;
    onClose: () => void;
}): React.ReactElement {
    const { data, setData, post, put, processing, errors } = useForm({
        store_id: account?.store_id ?? stores[0]?.id ?? 0,
        type: account?.type ?? ("bank" as AccountType),
        provider: account?.provider ?? "",
        account_number: account?.account_number ?? "",
        account_name: account?.account_name ?? "",
        owner_user_id: account?.owner_user_id ?? 0,
        purpose: account?.purpose ?? ("collection" as Purpose),
        is_active: account?.is_active ?? true,
        remitter_ids: account?.remitter_ids ?? ([] as number[]),
    });

    // Sellers at the chosen store first; anyone else after.
    const ownerOptions = [...owners].sort(
        (a, b) => Number(b.store_id === data.store_id) - Number(a.store_id === data.store_id),
    );

    const submit = (event: React.FormEvent): void => {
        event.preventDefault();
        const options = { preserveScroll: true, onSuccess: onClose };
        if (account) {
            put(route("admin.payment-accounts.update", account.id), options);
        } else {
            post(route("admin.payment-accounts.store"), options);
        }
    };

    return (
        <Dialog open onClose={onClose} fullWidth maxWidth="sm">
            <form onSubmit={submit}>
                <DialogTitle>{account ? `Edit ${account.provider_name}` : "Add payment account"}</DialogTitle>
                <DialogContent>
                    <Grid container spacing={2} sx={{ pt: 1 }}>
                        <Grid size={{ xs: 12, sm: 6 }}>
                            <TextField fullWidth size="small" select label="Store"
                                value={data.store_id} onChange={(e) => setData("store_id", Number(e.target.value))}
                                error={Boolean(errors.store_id)} helperText={errors.store_id}>
                                {stores.map((store) => <MenuItem key={store.id} value={store.id}>{store.name}</MenuItem>)}
                            </TextField>
                        </Grid>
                        <Grid size={{ xs: 12, sm: 6 }}>
                            <TextField fullWidth size="small" select label="Kind"
                                value={data.type}
                                onChange={(e) => {
                                    setData((current) => ({ ...current, type: e.target.value as AccountType, provider: "" }));
                                }}>
                                <MenuItem value="bank">Bank account</MenuItem>
                                <MenuItem value="wallet">Mobile wallet</MenuItem>
                            </TextField>
                        </Grid>
                        <Grid size={12}>
                            <TextField fullWidth size="small" select label={data.type === "wallet" ? "Wallet" : "Bank"}
                                value={data.provider} onChange={(e) => setData("provider", e.target.value)}
                                error={Boolean(errors.provider)} helperText={errors.provider}>
                                {providers.filter((p) => p.type === data.type).map((p) => (
                                    <MenuItem key={p.id} value={p.id}>{p.name}</MenuItem>
                                ))}
                            </TextField>
                        </Grid>
                        <Grid size={{ xs: 12, sm: 6 }}>
                            <TextField fullWidth size="small" label={data.type === "wallet" ? "Phone number" : "Account number"}
                                value={data.account_number} onChange={(e) => setData("account_number", e.target.value)}
                                error={Boolean(errors.account_number)} helperText={errors.account_number} />
                        </Grid>
                        <Grid size={{ xs: 12, sm: 6 }}>
                            <TextField fullWidth size="small" label="Account name"
                                value={data.account_name} onChange={(e) => setData("account_name", e.target.value)}
                                error={Boolean(errors.account_name)} helperText={errors.account_name} />
                        </Grid>
                        <Grid size={12}>
                            <TextField fullWidth size="small" select label="Owner (confirms deposits)"
                                value={data.owner_user_id || ""} onChange={(e) => setData("owner_user_id", Number(e.target.value))}
                                error={Boolean(errors.owner_user_id)}
                                helperText={errors.owner_user_id ?? "A seller. They confirm each deposit in the seller app."}>
                                {ownerOptions.map((owner) => (
                                    <MenuItem key={owner.id} value={owner.id}>
                                        {owner.name}
                                        {owner.store_id === data.store_id ? "" : " (other store)"}
                                    </MenuItem>
                                ))}
                            </TextField>
                        </Grid>
                        <Grid size={{ xs: 12, sm: 6 }}>
                            <TextField fullWidth size="small" select label="Used for"
                                value={data.purpose} onChange={(e) => setData("purpose", e.target.value as Purpose)}>
                                <MenuItem value="collection">Customers pay in</MenuItem>
                                <MenuItem value="settlement">Settlement (sellers hand over)</MenuItem>
                            </TextField>
                        </Grid>
                        {data.purpose === "settlement" ? (
                            <Grid size={12}>
                                <TextField fullWidth size="small" select label="Sellers who hand over here"
                                    SelectProps={{
                                        multiple: true,
                                        renderValue: (selected) =>
                                            (selected as number[])
                                                .map((id) => owners.find((owner) => owner.id === id)?.name ?? id)
                                                .join(", "),
                                    }}
                                    value={data.remitter_ids}
                                    onChange={(e) => setData("remitter_ids", (e.target.value as unknown as number[]).map(Number))}
                                    error={Object.keys(errors).some((key) => key.startsWith("remitter_ids"))}
                                    helperText={
                                        Object.entries(errors).find(([key]) => key.startsWith("remitter_ids"))?.[1] ??
                                        "They send their takings to this account; the owner confirms each handover."
                                    }>
                                    {ownerOptions
                                        .filter((owner) => owner.id !== data.owner_user_id)
                                        .map((owner) => (
                                            <MenuItem key={owner.id} value={owner.id}>
                                                {owner.name}
                                            </MenuItem>
                                        ))}
                                </TextField>
                            </Grid>
                        ) : null}
                        <Grid size={{ xs: 12, sm: 6 }} sx={{ display: "flex", alignItems: "center" }}>
                            <FormControlLabel
                                control={<Switch checked={data.is_active} onChange={(e) => setData("is_active", e.target.checked)} />}
                                label={data.is_active ? "Active" : "Off"}
                            />
                        </Grid>
                    </Grid>
                </DialogContent>
                <DialogActions>
                    <Button onClick={onClose}>Cancel</Button>
                    <Button type="submit" variant="contained" disabled={processing}>
                        {account ? "Save" : "Add"}
                    </Button>
                </DialogActions>
            </form>
        </Dialog>
    );
}

PaymentAccounts.layout = (page: React.ReactNode) => <AdminLayout>{page}</AdminLayout>;
