import React from "react";
import AppLayout from "@/Layouts/AppLayout";
import { Head, Link, router } from "@inertiajs/react";
import { Alert, Box, Button, Dialog, FormControlLabel, Switch, DialogActions, DialogContent, DialogTitle, IconButton, Paper, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField, Tooltip, Typography } from "@mui/material";
import ContentCopyRounded from "@mui/icons-material/ContentCopyRounded";
import OpenInNewRounded from "@mui/icons-material/OpenInNewRounded";
import StorefrontOutlined from "@mui/icons-material/StorefrontOutlined";
import { ADMIN_PAGE_SX as ROOT } from "@/Components/Admin/adminPage";
import { FigureRow, FigureTile, PageBand, PanelHead, Pill, adminTableSx, densePanelSx, tinySx, type PillTone } from "@/Components/Admin/adminUi";
import { dayDateTime } from "@/utils/dates";
import VendorPayoutsPanel, { etb, type VendorPayoutRow } from "@/Components/Vendor/VendorPayoutsPanel";

interface Application {
    id: number;
    business_name: string;
    contact: string;
    email: string;
    phone_number: string;
    city: string | null;
    tin_number: string | null;
    description: string | null;
    status: "pending" | "approved" | "rejected";
    reject_reason: string | null;
    reviewed_by: string | null;
    reviewed_at: string | null;
    created_at: string | null;
    store: { id: number; name: string; slug: string | null } | null;
}

interface VendorStoreRow {
    id: number;
    name: string;
    slug: string | null;
    status: string | null;
    public_url: string | null;
    /** Duka's own stores always; a vendor's store under contract. */
    uses_main_hubs: boolean;
    /** What Duka owes a vendor's store; null for Duka's own. */
    balance: number | null;
    owner: { id: number; name: string; email: string } | null;
}


interface Props {
    applications?: Application[];
    stores?: VendorStoreRow[];
    payouts?: VendorPayoutRow[];
    reviews?: Array<{ id: number; store: string | null; rating: number; comment: string | null; by: string | null; hidden: boolean; at: string | null }>;
    /** Duka's share of each paid vendor order. */
    commission_pct?: number;
    /** Right after an approval (or a new link): the owner's one-time set-password link. */
    handover?: { store: string; owner: string; email: string; url: string } | null;
}

const STATUS_TONE: Record<Application["status"], PillTone> = { pending: "warning", approved: "success", rejected: "error" };

/**
 * Settings → Vendors (global admins). A vendor is a store: businesses apply on
 * vendor.<domain>; approving opens their store with its owner as its admin.
 */
export default function VendorsIndex({ applications = [], stores = [], payouts = [], reviews = [], commission_pct = 10, handover = null }: Props) {
    const [rejecting, setRejecting] = React.useState<Application | null>(null);
    const [reason, setReason] = React.useState("");
    const [commission, setCommission] = React.useState(String(commission_pct));
    const waiting = payouts.filter((p) => p.status === "recorded");
    const owed = stores.reduce((sum, s) => sum + (s.balance ?? 0), 0);
    const pending = applications.filter((a) => a.status === "pending");

    const approve = (a: Application) => {
        if (confirm(`Open a store for ${a.business_name}, with ${a.contact} (${a.email}) as its owner?`)) {
            router.post(route("admin.vendors.approve", a.id), {}, { preserveScroll: true });
        }
    };

    const reject = () => {
        if (!rejecting) return;
        router.post(route("admin.vendors.reject", rejecting.id), { reason }, {
            preserveScroll: true,
            onSuccess: () => {
                setRejecting(null);
                setReason("");
            },
        });
    };

    return (
        <Box sx={{ ...ROOT, display: "flex", flexDirection: "column", gap: 1 }}>
            <Head title="Vendors" />

            <PageBand icon={<StorefrontOutlined />} title="Vendors" subtitle="Businesses that run their own store on Duka. They apply on the vendor site." />

            {handover && (
                <Alert severity="success" sx={{ alignItems: "center" }}>
                    <Typography sx={{ fontWeight: 700, fontSize: "0.8125rem" }}>
                        Give {handover.owner} ({handover.email}) this link to set their password for {handover.store}. It works once.
                    </Typography>
                    <Stack direction="row" spacing={0.5} alignItems="center" sx={{ mt: 0.5 }}>
                        <Typography sx={{ fontFamily: "monospace", fontSize: "0.75rem", wordBreak: "break-all" }}>{handover.url}</Typography>
                        <Tooltip title="Copy">
                            <IconButton size="small" onClick={() => navigator.clipboard?.writeText(handover.url)}><ContentCopyRounded fontSize="small" /></IconButton>
                        </Tooltip>
                    </Stack>
                </Alert>
            )}

            <FigureRow>
                <FigureTile label="Waiting for review" value={pending.length} tone={pending.length > 0 ? "warning" : "default"} />
                <FigureTile label="Vendor stores" value={stores.filter((s) => s.owner).length} tone="primary" />
                <FigureTile label="Owed to vendors" value={etb(owed)} tone="success" />
                <FigureTile label="Payouts to confirm" value={waiting.length} tone={waiting.length > 0 ? "warning" : "default"} />
            </FigureRow>

            <Paper elevation={0} sx={{ ...densePanelSx, display: "flex", alignItems: "center", gap: 1.5, flexWrap: "wrap" }}>
                <Box sx={{ flexGrow: 1, minWidth: 220 }}>
                    <Typography sx={{ fontWeight: 800, fontSize: "0.8125rem" }}>Commission</Typography>
                    <Typography sx={tinySx}>Duka keeps this share of every paid order of a vendor&apos;s store; the rest is theirs. Duka delivers their orders.</Typography>
                </Box>
                <TextField size="small" type="number" label="%" value={commission} onChange={(e) => setCommission(e.target.value)} sx={{ width: 100 }} slotProps={{ htmlInput: { min: 0, max: 50, step: 0.5 } }} />
                <Button size="small" variant="contained" disabled={commission === String(commission_pct)} onClick={() => router.post(route("admin.vendors.commission"), { commission_pct: commission }, { preserveScroll: true })}>
                    Save
                </Button>
            </Paper>

            <Paper elevation={0} sx={{ ...densePanelSx, p: 0, overflow: "hidden" }}>
                <Box sx={{ p: 1.25, pb: 0.5 }}><PanelHead icon={<StorefrontOutlined sx={{ fontSize: 16, color: "primary.main" }} />} title="Applications" /></Box>
                <TableContainer>
                    <Table size="small" sx={adminTableSx}>
                        <TableHead>
                            <TableRow>
                                <TableCell>Business</TableCell>
                                <TableCell>Contact</TableCell>
                                <TableCell>Status</TableCell>
                                <TableCell>Applied</TableCell>
                                <TableCell align="right">Decision</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {applications.length === 0 && (
                                <TableRow><TableCell colSpan={5} align="center" sx={{ py: 4, color: "text.secondary" }}>No applications yet.</TableCell></TableRow>
                            )}
                            {applications.map((a) => (
                                <TableRow key={a.id}>
                                    <TableCell>
                                        <Typography sx={{ fontWeight: 700, fontSize: "0.8125rem" }}>{a.business_name}</Typography>
                                        <Typography sx={tinySx}>{[a.city, a.tin_number ? `TIN ${a.tin_number}` : null].filter(Boolean).join(" · ") || "—"}</Typography>
                                        {a.description && <Typography sx={{ ...tinySx, maxWidth: 360 }}>{a.description}</Typography>}
                                    </TableCell>
                                    <TableCell>
                                        {a.contact}
                                        <Typography sx={tinySx}>{a.email} · {a.phone_number}</Typography>
                                    </TableCell>
                                    <TableCell>
                                        <Pill tone={STATUS_TONE[a.status]} label={a.status} />
                                        {a.reject_reason && <Typography sx={{ ...tinySx, color: "error.main" }}>{a.reject_reason}</Typography>}
                                        {a.reviewed_by && <Typography sx={tinySx}>by {a.reviewed_by}{a.reviewed_at ? `, ${dayDateTime(a.reviewed_at)}` : ""}</Typography>}
                                    </TableCell>
                                    <TableCell sx={{ whiteSpace: "nowrap" }}>{dayDateTime(a.created_at)}</TableCell>
                                    <TableCell align="right">
                                        {a.status === "pending" ? (
                                            <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                                                <Button size="small" variant="contained" onClick={() => approve(a)}>Approve</Button>
                                                <Button size="small" variant="outlined" color="error" onClick={() => setRejecting(a)}>Reject</Button>
                                            </Stack>
                                        ) : a.store ? (
                                            <Typography sx={tinySx}>{a.store.name}</Typography>
                                        ) : null}
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </TableContainer>
            </Paper>

            <Paper elevation={0} sx={{ ...densePanelSx, p: 0, overflow: "hidden" }}>
                <Box sx={{ p: 1.25, pb: 0.5 }}><PanelHead icon={<StorefrontOutlined sx={{ fontSize: 16, color: "primary.main" }} />} title="Stores on the shop" /></Box>
                <TableContainer>
                    <Table size="small" sx={adminTableSx}>
                        <TableHead>
                            <TableRow>
                                <TableCell>Store</TableCell>
                                <TableCell>Address</TableCell>
                                <TableCell>Owner</TableCell>
                                <TableCell>Main hubs</TableCell>
                                <TableCell align="right">Owed</TableCell>
                                <TableCell align="right">Actions</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {stores.map((s) => (
                                <TableRow key={s.id}>
                                    <TableCell sx={{ fontWeight: 700 }}>
                                        <Box component={Link} href={route("store.show", s.id)} sx={{ color: "inherit", textDecoration: "none", "&:hover": { color: "primary.main" } }}>{s.name}</Box>
                                    </TableCell>
                                    <TableCell sx={{ fontFamily: "monospace" }}>{s.slug ? `/s/${s.slug}` : "—"}</TableCell>
                                    <TableCell>{s.owner ? <>{s.owner.name}<Typography sx={tinySx}>{s.owner.email}</Typography></> : <Box component="span" sx={{ color: "text.disabled" }}>Run by Duka</Box>}</TableCell>
                                    <TableCell>
                                        {s.owner ? (
                                            <FormControlLabel
                                                sx={{ m: 0 }}
                                                control={<Switch size="small" checked={s.uses_main_hubs} onChange={(e) => router.post(route("admin.vendors.hubs", s.id), { on: e.target.checked }, { preserveScroll: true })} />}
                                                label={s.uses_main_hubs ? "Under contract" : "No contract"}
                                            />
                                        ) : (
                                            <Typography sx={tinySx}>Always</Typography>
                                        )}
                                    </TableCell>
                                    <TableCell align="right" sx={{ fontWeight: 700, whiteSpace: "nowrap" }}>{s.balance === null ? "—" : etb(s.balance)}</TableCell>
                                    <TableCell align="right">
                                        <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                                            {s.owner && (
                                                <Button size="small" onClick={() => router.post(route("admin.vendors.link", s.id), {}, { preserveScroll: true })}>New password link</Button>
                                            )}
                                            {s.public_url && (
                                                <Tooltip title="Open on the shop">
                                                    <IconButton size="small" href={s.public_url} target="_blank" rel="noopener"><OpenInNewRounded fontSize="small" /></IconButton>
                                                </Tooltip>
                                            )}
                                        </Stack>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </TableContainer>
            </Paper>

            <VendorPayoutsPanel
                stores={stores.filter((s) => s.owner && s.balance !== null).map((s) => ({ id: s.id, name: s.name, balance: s.balance ?? 0 }))}
                payouts={payouts}
                routes={{ record: "admin.vendors.payouts.store", confirm: "admin.vendors.payouts.confirm", reject: "admin.vendors.payouts.reject" }}
            />

            <Paper elevation={0} sx={{ ...densePanelSx, p: 0, overflow: "hidden" }}>
                <Box sx={{ p: 1.25, pb: 0.5 }}><PanelHead icon={<StorefrontOutlined sx={{ fontSize: 16, color: "warning.main" }} />} title="Store reviews" right={<Typography sx={tinySx}>From shoppers who received an order</Typography>} /></Box>
                <TableContainer>
                    <Table size="small" sx={adminTableSx}>
                        <TableBody>
                            {reviews.length === 0 && (
                                <TableRow><TableCell align="center" sx={{ py: 3, color: "text.secondary" }}>No reviews yet.</TableCell></TableRow>
                            )}
                            {reviews.map((r) => (
                                <TableRow key={r.id} sx={{ opacity: r.hidden ? 0.5 : 1 }}>
                                    <TableCell sx={{ fontWeight: 700, whiteSpace: "nowrap" }}>{r.store}</TableCell>
                                    <TableCell sx={{ whiteSpace: "nowrap" }}>{"★".repeat(r.rating)}{"☆".repeat(5 - r.rating)}</TableCell>
                                    <TableCell>{r.comment ?? <Box component="span" sx={{ color: "text.disabled" }}>No words</Box>}<Typography sx={tinySx}>{r.by} · {dayDateTime(r.at)}</Typography></TableCell>
                                    <TableCell align="right">
                                        {r.hidden ? <Pill label="hidden" /> : (
                                            <Button size="small" color="error" onClick={() => confirm("Hide this review from the store's page?") && router.post(route("admin.vendors.reviews.hide", r.id), {}, { preserveScroll: true })}>Hide</Button>
                                        )}
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </TableContainer>
            </Paper>

            <Dialog open={rejecting !== null} onClose={() => setRejecting(null)} fullWidth maxWidth="xs">
                <DialogTitle>Reject {rejecting?.business_name}</DialogTitle>
                <DialogContent>
                    <TextField autoFocus fullWidth multiline minRows={2} label="Reason (kept with the application)" value={reason} onChange={(e) => setReason(e.target.value)} sx={{ mt: 1 }} />
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setRejecting(null)}>Back</Button>
                    <Button color="error" variant="contained" disabled={reason.trim().length < 3} onClick={reject}>Reject</Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
}

VendorsIndex.layout = (page: React.ReactNode) => <AppLayout>{page}</AppLayout>;
