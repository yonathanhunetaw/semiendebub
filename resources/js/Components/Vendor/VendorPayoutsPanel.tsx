import React from "react";
import { router } from "@inertiajs/react";
import { Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Paper, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField, Typography } from "@mui/material";
import PaymentsOutlined from "@mui/icons-material/PaymentsOutlined";
import { PanelHead, Pill, adminTableSx, densePanelSx, tinySx, type PillTone } from "@/Components/Admin/adminUi";
import { dayDateTime } from "@/utils/dates";

export interface VendorBalanceRow {
    id: number;
    name: string;
    balance: number;
}

export interface VendorPayoutRow {
    id: number;
    store: string | null;
    amount: number;
    method: string;
    reference: string | null;
    status: "recorded" | "confirmed" | "rejected";
    reject_reason: string | null;
    recorded_by: string | null;
    recorded_by_me: boolean;
    confirmed_by: string | null;
    created_at: string | null;
}

/** The route names of the app the panel sits in: admin.vendors.payouts.* or finance.vendor_payouts.*. */
export interface VendorPayoutRoutes {
    record: string;
    confirm: string;
    reject: string;
}

const TONE: Record<VendorPayoutRow["status"], PillTone> = { recorded: "warning", confirmed: "success", rejected: "error" };
const METHODS: Array<[string, string]> = [["bank_transfer", "Bank transfer"], ["telebirr", "Telebirr"], ["cash", "Cash"]];
export const etb = (n: number) => `ETB ${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * What Duka owes each vendor's store and the payouts: one person records a payout,
 * another confirms it (VendorMoney). On Settings → Vendors and in the finance app.
 */
export default function VendorPayoutsPanel({ stores, payouts, routes }: { stores: VendorBalanceRow[]; payouts: VendorPayoutRow[]; routes: VendorPayoutRoutes }) {
    const [paying, setPaying] = React.useState<VendorBalanceRow | null>(null);
    const [payout, setPayout] = React.useState({ amount: "", method: "bank_transfer", reference: "" });
    const [refusing, setRefusing] = React.useState<VendorPayoutRow | null>(null);
    const [reason, setReason] = React.useState("");

    return (
        <>
            <Paper elevation={0} sx={{ ...densePanelSx, p: 0, overflow: "hidden" }}>
                <Box sx={{ p: 1.25, pb: 0.5 }}><PanelHead icon={<PaymentsOutlined sx={{ fontSize: 16, color: "success.main" }} />} title="Owed to vendors" /></Box>
                <TableContainer>
                    <Table size="small" sx={adminTableSx}>
                        <TableHead>
                            <TableRow>
                                <TableCell>Store</TableCell>
                                <TableCell align="right">Owed</TableCell>
                                <TableCell align="right" />
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {stores.length === 0 && (
                                <TableRow><TableCell colSpan={3} align="center" sx={{ py: 3, color: "text.secondary" }}>No vendor stores yet.</TableCell></TableRow>
                            )}
                            {stores.map((s) => (
                                <TableRow key={s.id}>
                                    <TableCell sx={{ fontWeight: 700 }}>{s.name}</TableCell>
                                    <TableCell align="right" sx={{ whiteSpace: "nowrap" }}>{etb(s.balance)}</TableCell>
                                    <TableCell align="right">
                                        {s.balance > 0 && (
                                            <Button size="small" variant="outlined" onClick={() => { setPaying(s); setPayout({ amount: String(s.balance), method: "bank_transfer", reference: "" }); }}>Pay out</Button>
                                        )}
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </TableContainer>
            </Paper>

            <Paper elevation={0} sx={{ ...densePanelSx, p: 0, overflow: "hidden" }}>
                <Box sx={{ p: 1.25, pb: 0.5 }}><PanelHead icon={<PaymentsOutlined sx={{ fontSize: 16, color: "primary.main" }} />} title="Payouts" right={<Typography sx={tinySx}>One person records, another confirms</Typography>} /></Box>
                <TableContainer>
                    <Table size="small" sx={adminTableSx}>
                        <TableHead>
                            <TableRow>
                                <TableCell>Store</TableCell>
                                <TableCell align="right">Amount</TableCell>
                                <TableCell>How</TableCell>
                                <TableCell>Status</TableCell>
                                <TableCell>Recorded</TableCell>
                                <TableCell align="right">Decision</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {payouts.length === 0 && (
                                <TableRow><TableCell colSpan={6} align="center" sx={{ py: 3, color: "text.secondary" }}>No payouts yet.</TableCell></TableRow>
                            )}
                            {payouts.map((p) => (
                                <TableRow key={p.id}>
                                    <TableCell sx={{ fontWeight: 700 }}>{p.store ?? "—"}</TableCell>
                                    <TableCell align="right" sx={{ whiteSpace: "nowrap" }}>{etb(p.amount)}</TableCell>
                                    <TableCell>{METHODS.find(([k]) => k === p.method)?.[1] ?? p.method}{p.reference ? <Typography sx={tinySx}>{p.reference}</Typography> : null}</TableCell>
                                    <TableCell>
                                        <Pill tone={TONE[p.status]} label={p.status} />
                                        {p.reject_reason && <Typography sx={{ ...tinySx, color: "error.main" }}>{p.reject_reason}</Typography>}
                                        {p.confirmed_by && <Typography sx={tinySx}>by {p.confirmed_by}</Typography>}
                                    </TableCell>
                                    <TableCell sx={{ whiteSpace: "nowrap" }}>{p.recorded_by}<Typography sx={tinySx}>{dayDateTime(p.created_at)}</Typography></TableCell>
                                    <TableCell align="right">
                                        {p.status === "recorded" && (p.recorded_by_me ? (
                                            <Typography sx={tinySx}>Waiting for a second person</Typography>
                                        ) : (
                                            <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                                                <Button size="small" variant="contained" onClick={() => router.post(route(routes.confirm, p.id), {}, { preserveScroll: true })}>Confirm</Button>
                                                <Button size="small" variant="outlined" color="error" onClick={() => setRefusing(p)}>Reject</Button>
                                            </Stack>
                                        ))}
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </TableContainer>
            </Paper>

            <Dialog open={paying !== null} onClose={() => setPaying(null)} fullWidth maxWidth="xs">
                <DialogTitle>Pay out {paying?.name}</DialogTitle>
                <DialogContent>
                    <Stack spacing={1.5} sx={{ mt: 1 }}>
                        <Typography sx={tinySx}>Owed: {etb(paying?.balance ?? 0)}. It leaves the balance once a second person confirms it.</Typography>
                        <TextField label="Amount (ETB)" type="number" value={payout.amount} onChange={(e) => setPayout({ ...payout, amount: e.target.value })} />
                        <TextField select label="How" value={payout.method} onChange={(e) => setPayout({ ...payout, method: e.target.value })} SelectProps={{ native: true }}>
                            {METHODS.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
                        </TextField>
                        <TextField label="Reference (optional)" value={payout.reference} onChange={(e) => setPayout({ ...payout, reference: e.target.value })} />
                    </Stack>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setPaying(null)}>Back</Button>
                    <Button variant="contained" disabled={!(Number(payout.amount) > 0)} onClick={() => paying && router.post(route(routes.record, paying.id), payout, { preserveScroll: true, onSuccess: () => setPaying(null) })}>Record payout</Button>
                </DialogActions>
            </Dialog>

            <Dialog open={refusing !== null} onClose={() => setRefusing(null)} fullWidth maxWidth="xs">
                <DialogTitle>Reject this payout</DialogTitle>
                <DialogContent>
                    <TextField autoFocus fullWidth multiline minRows={2} label="Reason" value={reason} onChange={(e) => setReason(e.target.value)} sx={{ mt: 1 }} />
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setRefusing(null)}>Back</Button>
                    <Button color="error" variant="contained" disabled={reason.trim().length < 3} onClick={() => refusing && router.post(route(routes.reject, refusing.id), { reason }, { preserveScroll: true, onSuccess: () => { setRefusing(null); setReason(""); } })}>Reject</Button>
                </DialogActions>
            </Dialog>
        </>
    );
}
