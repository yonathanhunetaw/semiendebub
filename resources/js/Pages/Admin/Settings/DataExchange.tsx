import * as React from "react";
import AdminLayout from "@/Layouts/AdminLayout";
import { Head, router } from "@inertiajs/react";
import {
    Accordion,
    AccordionDetails,
    AccordionSummary,
    Alert,
    Box,
    Button,
    Card,
    Checkbox,
    Chip,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    FormControlLabel,
    MenuItem,
    Radio,
    RadioGroup,
    Stack,
    TextField,
    Typography,
} from "@mui/material";
import Download from "@mui/icons-material/Download";
import ExpandMore from "@mui/icons-material/ExpandMore";
import FolderZip from "@mui/icons-material/FolderZip";
import Upload from "@mui/icons-material/Upload";

interface DatasetInfo {
    key: string;
    label: string;
    description: string;
    importable: boolean;
    reason: string | null;
    columns: string[];
    required: string[];
    options: Record<string, string>;
    max_rows: number;
}

interface Group {
    name: string;
    datasets: DatasetInfo[];
}

interface Summary {
    created: number;
    updated: number;
    unchanged: number;
    samples: string[];
    warnings: string[];
}

interface Preview {
    dataset: string;
    summary: Summary | null;
    errors: string[];
    more: number;
}

interface Props {
    groups?: Group[];
    stores?: { id: number; name: string }[];
    preview?: Preview | null;
}

const cardSx = { borderRadius: 2, border: "1px solid", borderColor: "divider", boxShadow: "none" } as const;

/** What the server said about a file: its problems, or what it would do (and anything worth a second look). */
function PreviewAlerts({ shown, checked }: { shown: Preview | null; checked: boolean }) {
    return (
        <>
            {shown?.errors.length ? (
                <Alert severity="error">
                    <Stack component="ul" sx={{ m: 0, pl: 2 }}>
                        {shown.errors.map((message) => (
                            <li key={message}>{message}</li>
                        ))}
                    </Stack>
                    {shown.more > 0 && <Typography variant="caption">… and {shown.more} more</Typography>}
                </Alert>
            ) : null}

            {checked && shown?.summary && (
                <Alert severity="info">
                    <Typography sx={{ fontWeight: 700 }}>
                        {shown.summary.created} to add, {shown.summary.updated} to change, {shown.summary.unchanged} already up to date.
                    </Typography>
                    {shown.summary.samples.map((line) => (
                        <Typography key={line} variant="caption" sx={{ display: "block" }}>
                            {line}
                        </Typography>
                    ))}
                    <Typography variant="caption" sx={{ display: "block", mt: 0.5 }}>
                        Nothing is saved yet. Press Apply to save.
                    </Typography>
                </Alert>
            )}

            {checked && shown?.summary?.warnings.length ? (
                <Alert severity="warning">
                    <Stack component="ul" sx={{ m: 0, pl: 2 }}>
                        {shown.summary.warnings.map((message) => (
                            <li key={message}>{message}</li>
                        ))}
                    </Stack>
                </Alert>
            ) : null}
        </>
    );
}

/**
 * Settings → Import / Export: every module's data as CSV. Importing is two steps: "Check file" shows what
 * would change (nothing is written), then "Apply" sends the same file again and saves it, all or nothing.
 * Apply is only offered for the exact file and ticks that were checked.
 */
export default function DataExchange({ groups = [], stores = [], preview = null }: Props) {
    const [open, setOpen] = React.useState<DatasetInfo | null>(null);
    const [deployOpen, setDeployOpen] = React.useState(false);
    const [csv, setCsv] = React.useState("");
    const [ticks, setTicks] = React.useState<Record<string, boolean>>({});
    const [storeId, setStoreId] = React.useState<number | "">("");
    const [scope, setScope] = React.useState<"missing" | "file">("missing");
    const [checkedWith, setCheckedWith] = React.useState<string | null>(null);
    const [busy, setBusy] = React.useState(false);

    const all = groups.flatMap((group) => group.datasets);
    const has = (key: string) => all.some((dataset) => dataset.key === key && dataset.importable);
    const byKey = (key: string) => all.find((dataset) => dataset.key === key);

    const target = deployOpen ? "deploy" : open?.key ?? null;
    const signature = JSON.stringify([target, csv, ticks, storeId, scope]);
    const shown = target && preview && preview.dataset === target ? preview : null;
    const checked = shown?.summary != null && shown.errors.length === 0 && checkedWith === signature;
    const changes = (shown?.summary?.created ?? 0) + (shown?.summary?.updated ?? 0);

    const reset = () => {
        setOpen(null);
        setDeployOpen(false);
        setCsv("");
        setTicks({});
        setCheckedWith(null);
    };

    const send = (dryRun: boolean) => {
        const url = deployOpen ? route("admin.data.deploy") : route("admin.data.import", { dataset: open?.key ?? "" });
        const data = deployOpen ? { store_id: storeId, scope, csv: scope === "file" ? csv : undefined, dry_run: dryRun } : { csv, dry_run: dryRun, ...ticks };

        setBusy(true);
        router.post(url, data, {
            preserveScroll: true,
            onFinish: () => setBusy(false),
            onSuccess: () => {
                if (dryRun) setCheckedWith(signature);
                else reset();
            },
        });
    };

    const readFile = async (file: File | undefined) => {
        if (file) setCsv(await file.text());
    };

    const steps: { title: string; hint: string; keys: string[]; deploy?: boolean }[] = [
        { title: "Categories", hint: "The tree items sit in", keys: ["categories"] },
        { title: "Colours, sizes, packaging", hint: "The names items are made from", keys: ["item_colors", "item_sizes", "item_packaging_types"] },
        { title: "Items", hint: "Basics plus colours, sizes and packaging; the variants are generated", keys: ["items"] },
        { title: "Barcodes", hint: "One code per variant, or AUTO for the shop's own", keys: ["item_variants"] },
        { title: "Put items in a store", hint: "Switched off and unpriced until a price is set", keys: [], deploy: true },
        { title: "Prices", hint: "A price above zero puts a variant on sale", keys: ["store_prices"] },
        { title: "Stock", hint: "Opening counts, approved in Admin → Counts", keys: ["stock_counts"] },
    ].filter((step) => step.deploy || step.keys.every(has));

    return (
        <Box sx={{ maxWidth: 1100, mx: "auto" }}>
            <Head title="Import / Export" />

            <Stack direction={{ xs: "column", sm: "row" }} spacing={2} sx={{ mb: 3, justifyContent: "space-between", alignItems: { sm: "center" } }}>
                <Box>
                    <Typography variant="h5" sx={{ fontWeight: 800 }}>
                        Import / Export
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                        Every module as a spreadsheet (CSV). Setup data can be edited and imported back; records of what happened, status and money are export only.
                    </Typography>
                </Box>
                <Button variant="contained" startIcon={<FolderZip />} component="a" href={route("admin.data.everything")}>
                    Download everything
                </Button>
            </Stack>

            <Card sx={{ ...cardSx, p: 2, mb: 2 }}>
                <Typography sx={{ fontWeight: 800 }}>Setting up a catalogue</Typography>
                <Typography variant="caption" color="text.secondary">
                    In this order: each step needs the one before. Download the file first for a ready-made header (or take the template).
                </Typography>
                <Stack spacing={1} sx={{ mt: 1.5 }}>
                    {steps.map((step, index) => (
                        <Stack key={step.title} direction={{ xs: "column", sm: "row" }} spacing={1} sx={{ alignItems: { sm: "center" }, justifyContent: "space-between" }}>
                            <Stack direction="row" spacing={1.25} sx={{ alignItems: "center", minWidth: 0 }}>
                                <Chip size="small" label={index + 1} color="primary" sx={{ fontWeight: 700 }} />
                                <Box sx={{ minWidth: 0 }}>
                                    <Typography sx={{ fontWeight: 700, fontSize: "0.9rem" }}>{step.title}</Typography>
                                    <Typography variant="caption" color="text.secondary">
                                        {step.hint}
                                    </Typography>
                                </Box>
                            </Stack>
                            <Stack direction="row" spacing={0.75} sx={{ flexWrap: "wrap" }}>
                                {step.keys.map((key) => (
                                    <Button key={key} size="small" variant="outlined" startIcon={<Upload />} data-testid={`step-${key}`} onClick={() => setOpen(byKey(key) ?? null)}>
                                        {step.keys.length > 1 ? byKey(key)?.label : "Import"}
                                    </Button>
                                ))}
                                {step.deploy && (
                                    <Button size="small" variant="outlined" data-testid="step-deploy" onClick={() => setDeployOpen(true)}>
                                        Put items in a store
                                    </Button>
                                )}
                            </Stack>
                        </Stack>
                    ))}
                </Stack>
            </Card>

            <Stack spacing={1.5}>
                {groups.map((group, index) => (
                    <Accordion key={group.name} defaultExpanded={index === 0} disableGutters sx={{ ...cardSx, "&:before": { display: "none" } }}>
                        <AccordionSummary expandIcon={<ExpandMore />}>
                            <Typography sx={{ fontWeight: 800 }}>{group.name}</Typography>
                            <Typography variant="caption" color="text.secondary" sx={{ ml: 1.5, alignSelf: "center" }}>
                                {group.datasets.length} {group.datasets.length === 1 ? "file" : "files"}
                            </Typography>
                        </AccordionSummary>
                        <AccordionDetails sx={{ pt: 0 }}>
                            <Stack divider={<Box sx={{ borderTop: "1px solid", borderColor: "divider" }} />}>
                                {group.datasets.map((dataset) => (
                                    <Stack
                                        key={dataset.key}
                                        direction={{ xs: "column", md: "row" }}
                                        spacing={1.5}
                                        sx={{ py: 1.25, justifyContent: "space-between", alignItems: { md: "center" } }}
                                    >
                                        <Box sx={{ minWidth: 0 }}>
                                            <Stack direction="row" spacing={1} sx={{ alignItems: "center", flexWrap: "wrap" }}>
                                                <Typography sx={{ fontWeight: 700, fontSize: "0.9rem" }}>{dataset.label}</Typography>
                                                {!dataset.importable && <Chip size="small" label="Export only" title={dataset.reason ?? ""} />}
                                            </Stack>
                                            <Typography variant="caption" color="text.secondary">
                                                {dataset.description}
                                            </Typography>
                                        </Box>
                                        <Stack direction="row" spacing={1} sx={{ flexShrink: 0 }}>
                                            <Button size="small" variant="outlined" startIcon={<Download />} component="a" href={route("admin.data.export", { dataset: dataset.key })}>
                                                Download
                                            </Button>
                                            {dataset.importable && (
                                                <>
                                                    <Button size="small" component="a" href={route("admin.data.template", { dataset: dataset.key })}>
                                                        Template
                                                    </Button>
                                                    <Button size="small" variant="outlined" startIcon={<Upload />} onClick={() => setOpen(dataset)}>
                                                        Import
                                                    </Button>
                                                </>
                                            )}
                                        </Stack>
                                    </Stack>
                                ))}
                            </Stack>
                        </AccordionDetails>
                    </Accordion>
                ))}
            </Stack>

            <Dialog open={open !== null} onClose={reset} fullWidth maxWidth="md">
                <DialogTitle sx={{ fontWeight: 800 }}>Import {open?.label}</DialogTitle>
                <DialogContent>
                    <Stack spacing={1.5} sx={{ pt: 0.5 }}>
                        <Typography variant="body2" color="text.secondary">
                            The first line must name the columns ({open?.required.join(", ")} needed; also allowed:{" "}
                            {open?.columns.filter((c) => !open.required.includes(c)).join(", ") || "none"}). Start from the template, or from a download of this file. A column you leave out
                            is not changed. If any row is wrong, nothing is saved. Up to {open?.max_rows.toLocaleString()} rows per file.
                        </Typography>
                        <Button component="label" variant="outlined" size="small" sx={{ alignSelf: "flex-start" }}>
                            Choose a CSV file
                            <input hidden type="file" accept=".csv,text/csv,text/plain" onChange={(e) => readFile(e.target.files?.[0])} />
                        </Button>
                        <TextField
                            multiline
                            minRows={6}
                            maxRows={14}
                            value={csv}
                            onChange={(e) => setCsv(e.target.value)}
                            placeholder="…or paste the CSV here"
                            slotProps={{ input: { sx: { fontFamily: "monospace", fontSize: "0.8rem" } }, htmlInput: { "data-testid": "csv-input" } }}
                        />
                        {open &&
                            Object.entries(open.options).map(([name, label]) => (
                                <FormControlLabel
                                    key={name}
                                    control={<Checkbox checked={ticks[name] ?? false} onChange={(e) => setTicks({ ...ticks, [name]: e.target.checked })} />}
                                    label={label}
                                />
                            ))}
                        <PreviewAlerts shown={shown} checked={checked} />
                    </Stack>
                </DialogContent>
                <DialogActions sx={{ px: 3, pb: 2 }}>
                    <Button onClick={reset}>Close</Button>
                    <Button variant="outlined" disabled={busy || csv.trim() === ""} onClick={() => send(true)}>
                        Check file
                    </Button>
                    <Button variant="contained" disabled={busy || !checked || changes === 0} onClick={() => send(false)}>
                        Apply
                    </Button>
                </DialogActions>
            </Dialog>

            <Dialog open={deployOpen} onClose={reset} fullWidth maxWidth="sm">
                <DialogTitle sx={{ fontWeight: 800 }}>Put items in a store</DialogTitle>
                <DialogContent>
                    <Stack spacing={1.5} sx={{ pt: 0.5 }}>
                        <Typography variant="body2" color="text.secondary">
                            Creates the store's copy of each variant. They arrive switched off with no price, so nothing sells until a price is set. Archived items are left out.
                        </Typography>
                        <TextField select size="small" label="Store" value={storeId} onChange={(e) => setStoreId(Number(e.target.value))}>
                            {stores.map((store) => (
                                <MenuItem key={store.id} value={store.id}>
                                    {store.name}
                                </MenuItem>
                            ))}
                        </TextField>
                        <RadioGroup value={scope} onChange={(e) => setScope(e.target.value as "missing" | "file")}>
                            <FormControlLabel value="missing" control={<Radio />} label="Every item that is not fully in this store yet" />
                            <FormControlLabel value="file" control={<Radio />} label="Only the items in a file (a column named item_id)" />
                        </RadioGroup>
                        {scope === "file" && (
                            <>
                                <Button component="label" variant="outlined" size="small" sx={{ alignSelf: "flex-start" }}>
                                    Choose a CSV file
                                    <input hidden type="file" accept=".csv,text/csv,text/plain" onChange={(e) => readFile(e.target.files?.[0])} />
                                </Button>
                                <TextField
                                    multiline
                                    minRows={4}
                                    maxRows={10}
                                    value={csv}
                                    onChange={(e) => setCsv(e.target.value)}
                                    placeholder={"item_id\n12\n13"}
                                    slotProps={{ input: { sx: { fontFamily: "monospace", fontSize: "0.8rem" } }, htmlInput: { "data-testid": "csv-input" } }}
                                />
                            </>
                        )}
                        <PreviewAlerts shown={shown} checked={checked} />
                    </Stack>
                </DialogContent>
                <DialogActions sx={{ px: 3, pb: 2 }}>
                    <Button onClick={reset}>Close</Button>
                    <Button variant="outlined" disabled={busy || storeId === "" || (scope === "file" && csv.trim() === "")} onClick={() => send(true)}>
                        Check
                    </Button>
                    <Button variant="contained" disabled={busy || !checked || changes === 0} onClick={() => send(false)}>
                        Apply
                    </Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
}

DataExchange.layout = (page: React.ReactNode) => <AdminLayout flashToast>{page}</AdminLayout>;
