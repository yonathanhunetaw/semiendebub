import * as React from "react";
import QRCode from "qrcode";
import { Head, Link } from "@inertiajs/react";
import {
    Alert,
    Box,
    Button,
    Card,
    Checkbox,
    FormControlLabel,
    IconButton,
    Stack,
    Switch,
    TextField,
    ToggleButton,
    ToggleButtonGroup,
    Typography,
} from "@mui/material";
import QrCode2Rounded from "@mui/icons-material/QrCode2Rounded";
import PrintRounded from "@mui/icons-material/PrintRounded";
import RemoveRounded from "@mui/icons-material/RemoveRounded";
import AddRounded from "@mui/icons-material/AddRounded";
import AdminLayout from "@/Layouts/AdminLayout";
import { PageBand } from "@/Components/Admin/adminUi";

interface LabelVariant {
    id: number;
    label: string;
    sku: string | null;
    barcode: string | null;
    /** What the QR holds: the barcode, else the SKU. */
    code: string;
    price: number | null;
    sold_here: boolean;
}

interface LabelItem {
    id: number;
    name: string;
    variants: LabelVariant[];
}

interface Props {
    store?: { id: number; name: string } | null;
    items?: LabelItem[];
}

/** Common sticker sizes, in millimetres (width × height). */
const SIZES = {
    small: { w: 38, h: 25, qr: 18, name: 2.6, line: 2.1 },
    medium: { w: 50, h: 30, qr: 22, name: 3.0, line: 2.4 },
    large: { w: 70, h: 40, qr: 30, name: 3.8, line: 2.9 },
} as const;
type SizeKey = keyof typeof SIZES;

const birr = (n: number) => `ETB ${new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)}`;

const cardSx = { borderRadius: 2, border: "1px solid", borderColor: "divider", boxShadow: "none" } as const;
const oneLine = { whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" } as const;
const clamp2 = { display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" } as const;

/**
 * QR labels for item variants. Each QR holds the variant's barcode (or SKU),
 * which the stock keeper's scanner, a stocktake count and the seller's search
 * all find. Choose how many of each, the sticker size, then Print: only the
 * sheet is printed.
 */
export default function ItemLabels({ store = null, items = [] }: Props) {
    const all = React.useMemo(() => items.flatMap((item) => item.variants.map((v) => ({ item, variant: v }))), [items]);
    const [copies, setCopies] = React.useState<Record<number, number>>(() => Object.fromEntries(all.map(({ variant }) => [variant.id, 1])));
    const [size, setSize] = React.useState<SizeKey>("medium");
    const [showPrice, setShowPrice] = React.useState<boolean>(store !== null);
    const [showName, setShowName] = React.useState(true);
    const [qr, setQr] = React.useState<Record<string, string>>({});

    // One drawing per code, reused by every copy of it.
    React.useEffect(() => {
        let alive = true;
        const codes = [...new Set(all.map(({ variant }) => variant.code))];
        Promise.all(codes.map((code) => QRCode.toDataURL(code, { width: 320, margin: 0, errorCorrectionLevel: "M" }).then((url) => [code, url] as const)))
            .then((pairs) => alive && setQr(Object.fromEntries(pairs)))
            .catch(() => alive && setQr({}));
        return () => {
            alive = false;
        };
    }, [all]);

    const sheet = all.flatMap(({ item, variant }) => Array.from({ length: copies[variant.id] ?? 0 }, (_, i) => ({ key: `${variant.id}-${i}`, item, variant })));
    const ready = sheet.length > 0 && sheet.every(({ variant }) => qr[variant.code]);
    const s = SIZES[size];
    const setCount = (id: number, n: number) => setCopies((c) => ({ ...c, [id]: Math.max(0, Math.min(500, Math.round(n) || 0)) }));
    const setEvery = (n: number) => setCopies(Object.fromEntries(all.map(({ variant }) => [variant.id, n])));

    return (
        <Box sx={{ maxWidth: 1100, mx: "auto" }}>
            <Head title="Print labels" />
            {/* On paper: the sheet alone, from the top-left corner, no page chrome. */}
            <style>{`
                @media print {
                    @page { margin: 6mm; }
                    body * { visibility: hidden !important; }
                    .label-sheet, .label-sheet * { visibility: visible !important; }
                    .label-sheet { position: absolute; left: 0; top: 0; width: 100%; }
                }
            `}</style>

            <Box sx={{ mb: 1.5, "@media print": { display: "none" } }}>
                <PageBand
                    icon={<QrCode2Rounded />}
                    title="Print labels"
                    subtitle={`${sheet.length} label${sheet.length === 1 ? "" : "s"} · ${items.length} item${items.length === 1 ? "" : "s"}${store ? ` · prices at ${store.name}` : ""}`}
                    actions={
                        <Button variant="contained" color="inherit" startIcon={<PrintRounded />} disabled={!ready} onClick={() => window.print()} sx={{ color: "primary.main", bgcolor: "primary.contrastText" }}>
                            Print
                        </Button>
                    }
                />
            </Box>

            <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "minmax(0, 1fr)", md: "minmax(0, 360px) minmax(0, 1fr)" }, "@media print": { display: "block" } }}>
                <Stack spacing={2} sx={{ "@media print": { display: "none" } }}>
                    <Card sx={{ ...cardSx, p: 2 }}>
                        <Typography sx={{ fontWeight: 800, mb: 1 }}>Sticker</Typography>
                        <ToggleButtonGroup exclusive fullWidth size="small" value={size} onChange={(_, v: SizeKey | null) => v && setSize(v)} aria-label="Label size">
                            {(Object.keys(SIZES) as SizeKey[]).map((key) => (
                                <ToggleButton key={key} value={key}>
                                    {SIZES[key].w}×{SIZES[key].h} mm
                                </ToggleButton>
                            ))}
                        </ToggleButtonGroup>
                        <FormControlLabel sx={{ mt: 1 }} control={<Switch checked={showName} onChange={(e) => setShowName(e.target.checked)} />} label="Item name" />
                        <FormControlLabel
                            control={<Switch checked={showPrice} disabled={store === null} onChange={(e) => setShowPrice(e.target.checked)} />}
                            label={store ? `Price at ${store.name}` : "Price (choose one store first)"}
                        />
                    </Card>

                    <Card sx={{ ...cardSx, p: 2 }}>
                        <Stack direction="row" alignItems="center" sx={{ mb: 1 }}>
                            <Typography sx={{ fontWeight: 800, flexGrow: 1 }}>How many</Typography>
                            <Button size="small" onClick={() => setEvery(1)}>1 each</Button>
                            <Button size="small" onClick={() => setEvery(0)}>None</Button>
                        </Stack>
                        {all.length === 0 ? <Alert severity="info">These items have no variant with a barcode or SKU yet. Add one on the item&apos;s Setup page.</Alert> : null}
                        <Stack spacing={1.25}>
                            {items.map((item) => (
                                <Box key={item.id}>
                                    <Typography sx={{ fontWeight: 700, fontSize: "0.85rem" }} noWrap>
                                        <Link href={route("admin.items.setup", item.id)}>{item.name}</Link>
                                    </Typography>
                                    {item.variants.map((v) => (
                                        <Stack key={v.id} direction="row" alignItems="center" spacing={0.5}>
                                            <Checkbox size="small" checked={(copies[v.id] ?? 0) > 0} onChange={(e) => setCount(v.id, e.target.checked ? 1 : 0)} slotProps={{ input: { "aria-label": `Print ${item.name} ${v.label}` } }} />
                                            <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                                                <Typography variant="body2" noWrap>{v.label}</Typography>
                                                <Typography variant="caption" color="text.secondary" noWrap component="p">
                                                    {v.code}
                                                    {store && !v.sold_here ? " · not sold here" : ""}
                                                </Typography>
                                            </Box>
                                            <IconButton size="small" aria-label="One less" onClick={() => setCount(v.id, (copies[v.id] ?? 0) - 1)}><RemoveRounded fontSize="small" /></IconButton>
                                            <TextField
                                                size="small"
                                                value={copies[v.id] ?? 0}
                                                onChange={(e) => setCount(v.id, Number(e.target.value))}
                                                sx={{ width: 48, "& input": { textAlign: "center", px: 0.25, py: 0.5 } }}
                                                slotProps={{ htmlInput: { inputMode: "numeric", "aria-label": `Copies of ${item.name} ${v.label}` } }}
                                            />
                                            <IconButton size="small" aria-label="One more" onClick={() => setCount(v.id, (copies[v.id] ?? 0) + 1)}><AddRounded fontSize="small" /></IconButton>
                                        </Stack>
                                    ))}
                                </Box>
                            ))}
                        </Stack>
                    </Card>
                </Stack>

                <Card sx={{ ...cardSx, p: 2, bgcolor: "#fff", color: "#000", "@media print": { border: 0, p: 0 } }}>
                    {sheet.length === 0 ? (
                        <Typography color="text.secondary" sx={{ textAlign: "center", py: 6 }}>Choose at least one label.</Typography>
                    ) : (
                        <Box className="label-sheet" sx={{ display: "flex", flexWrap: "wrap", gap: "2mm" }}>
                            {sheet.map(({ key, item, variant }) => (
                                <Box
                                    key={key}
                                    sx={{
                                        width: `${s.w}mm`,
                                        height: `${s.h}mm`,
                                        border: "0.2mm dashed #999",
                                        borderRadius: "1.5mm",
                                        p: "1.5mm",
                                        display: "flex",
                                        gap: "1.5mm",
                                        alignItems: "center",
                                        overflow: "hidden",
                                        breakInside: "avoid",
                                        boxSizing: "border-box",
                                        bgcolor: "#fff",
                                        color: "#000",
                                        fontFamily: "Inter, Arial, sans-serif",
                                    }}
                                >
                                    {qr[variant.code] ? (
                                        <Box component="img" src={qr[variant.code]} alt={variant.code} sx={{ width: `${s.qr}mm`, height: `${s.qr}mm`, flexShrink: 0 }} />
                                    ) : (
                                        <Box sx={{ width: `${s.qr}mm`, height: `${s.qr}mm`, flexShrink: 0, bgcolor: "#eee" }} />
                                    )}
                                    <Box sx={{ minWidth: 0, flex: 1, display: "flex", flexDirection: "column", gap: "0.6mm", lineHeight: 1.15 }}>
                                        {showName ? <Box sx={{ ...clamp2, fontWeight: 800, fontSize: `${s.name}mm` }}>{item.name}</Box> : null}
                                        <Box sx={{ ...oneLine, fontSize: `${s.line}mm` }}>{variant.label}</Box>
                                        {showPrice && variant.price !== null ? <Box sx={{ fontWeight: 900, fontSize: `${s.name}mm` }}>{birr(variant.price)}</Box> : null}
                                        <Box sx={{ ...oneLine, fontFamily: "ui-monospace, Menlo, monospace", fontSize: `${s.line * 0.9}mm` }}>{variant.code}</Box>
                                    </Box>
                                </Box>
                            ))}
                        </Box>
                    )}
                </Card>
            </Box>
        </Box>
    );
}

ItemLabels.layout = (page: React.ReactNode) => <AdminLayout>{page}</AdminLayout>;
