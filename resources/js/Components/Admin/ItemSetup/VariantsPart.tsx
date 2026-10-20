import * as React from "react";
import axios from "axios";
import { router } from "@inertiajs/react";
import { Alert, Autocomplete, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, Stack, TextField, Tooltip, Typography } from "@mui/material";
import AddPhotoAlternateOutlined from "@mui/icons-material/AddPhotoAlternateOutlined";
import Close from "@mui/icons-material/Close";
import DeleteOutlineRounded from "@mui/icons-material/DeleteOutlineRounded";
import QrCodeScannerRounded from "@mui/icons-material/QrCodeScannerRounded";

import BarcodeScannerDialog from "@/Components/Seller/BarcodeScannerDialog";
import { useDraft } from "@/hooks/useDraft";
import type { ItemSetupProps } from "@/types/itemSetup";

type Opt = { id: number | null; name: string };
type PackRow = { id: number | null; name: string; quantity: string };
type Options = { colors: Opt[]; sizes: Opt[]; packaging: PackRow[] };
type Preview = { add: number; restore: number; keep: number; remove: number; removing: string[] };

/** Everything the page reloads after a save here (the variants feed the score, the stores and the stock). */
export const RELOAD = ["item", "options", "catalog", "readiness", "stores", "warehouses", "stock", "history", "flash", "errors"];

const idOrNew = (o: { id: number | null; name: string }) => (o.id ?? `new:${o.name}`);

/** A typed name that matches a known option takes its id; anything else is a new option. */
function pick(values: Array<string | Opt>, catalog: Array<{ id: number; name: string }>): Opt[] {
    const seen = new Set<string>();

    return values
        .map((v) => (typeof v === "string" ? v.trim() : v))
        .filter((v) => (typeof v === "string" ? v !== "" : true))
        .map((v): Opt => {
            if (typeof v !== "string") return v;
            const known = catalog.find((c) => c.name.toLowerCase() === v.toLowerCase());

            return known ? { id: known.id, name: known.name } : { id: null, name: v };
        })
        .filter((o) => {
            const key = o.name.toLowerCase();
            if (seen.has(key)) return false;
            seen.add(key);

            return true;
        });
}

/** Colours, sizes and packaging, and the variants they make: preview, apply, barcodes, pictures, delete. */
export default function VariantsPart({ itemId, item, options, catalog }: { itemId: number; item: ItemSetupProps["item"]; options: ItemSetupProps["options"]; catalog: ItemSetupProps["catalog"] }) {
    const saved = React.useMemo<Options>(
        () => ({
            colors: options.colors,
            sizes: options.sizes,
            packaging: options.packaging.map((p) => ({ id: p.id, name: p.name, quantity: String(p.quantity) })),
        }),
        [options],
    );
    const draft = useDraft<Options>(`duka.itemSetup.${itemId}.options`, saved);
    const [preview, setPreview] = React.useState<Preview | null>(null);
    const [busy, setBusy] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);

    const payload = () => ({
        color_ids: draft.value.colors.map(idOrNew),
        size_ids: draft.value.sizes.map(idOrNew),
        packaging: draft.value.packaging.filter((p) => p.name.trim() !== "").map((p) => ({ item_packaging_type_id: idOrNew(p), quantity: p.quantity === "" ? 1 : Number(p.quantity) })),
    });

    const apply = () => {
        setBusy(true);
        router.put(route("admin.items.setup.options", itemId), payload(), {
            preserveScroll: true,
            preserveState: true,
            only: RELOAD,
            onSuccess: () => {
                draft.clear();
                setPreview(null);
                setError(null);
            },
            onError: (e) => setError(Object.values(e).join(" ")),
            onFinish: () => setBusy(false),
        });
    };

    /** Ask what applying would do; when it removes variants, say which and wait for a yes. */
    const check = async () => {
        setBusy(true);
        setError(null);
        try {
            const { data } = await axios.post<Preview>(route("admin.items.setup.options.preview", itemId), payload());
            if (data.remove > 0) {
                setPreview(data);
                setBusy(false);
            } else {
                apply();
            }
        } catch {
            setError("Could not work out what would change. Check the options and try again.");
            setBusy(false);
        }
    };

    const setPackaging = (i: number, patch: Partial<PackRow>) => draft.setValue((v) => ({ ...v, packaging: v.packaging.map((p, n) => (n === i ? { ...p, ...patch } : p)) }));

    return (
        <Stack spacing={2.5}>
            {draft.restored && (
                <Alert severity="info" variant="outlined" action={<Button size="small" onClick={draft.discard}>Discard</Button>}>
                    Your unsaved changes were kept from last time.
                </Alert>
            )}
            {error && <Alert severity="error">{error}</Alert>}

            <Box>
                <Typography sx={{ fontWeight: 700, mb: 0.5 }}>Options</Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
                    Every colour × size × packaging makes one variant. Type a new name and press Enter to add it.
                </Typography>
                <Stack spacing={1.5}>
                    <Autocomplete<Opt, true, false, true>
                        multiple
                        freeSolo
                        size="small"
                        options={catalog.colors}
                        getOptionLabel={(o) => (typeof o === "string" ? o : o.name)}
                        isOptionEqualToValue={(a, b) => a.name.toLowerCase() === b.name.toLowerCase()}
                        value={draft.value.colors}
                        onChange={(_, v) => draft.setValue((d) => ({ ...d, colors: pick(v, catalog.colors) }))}
                        renderInput={(params) => <TextField {...params} label="Colours" inputProps={{ ...params.inputProps, "aria-label": "Colours" }} />}
                    />
                    <Autocomplete<Opt, true, false, true>
                        multiple
                        freeSolo
                        size="small"
                        options={catalog.sizes}
                        getOptionLabel={(o) => (typeof o === "string" ? o : o.name)}
                        isOptionEqualToValue={(a, b) => a.name.toLowerCase() === b.name.toLowerCase()}
                        value={draft.value.sizes}
                        onChange={(_, v) => draft.setValue((d) => ({ ...d, sizes: pick(v, catalog.sizes) }))}
                        renderInput={(params) => <TextField {...params} label="Sizes" inputProps={{ ...params.inputProps, "aria-label": "Sizes" }} />}
                    />
                    <Box>
                        <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.75 }}>Packaging (pieces in one pack)</Typography>
                        <Stack spacing={1}>
                            {draft.value.packaging.map((row, i) => (
                                <Stack key={i} direction="row" spacing={1} sx={{ alignItems: "center" }}>
                                    <Autocomplete<{ id: number; name: string }, false, false, true>
                                        freeSolo
                                        size="small"
                                        sx={{ flex: 1 }}
                                        options={catalog.packaging}
                                        getOptionLabel={(o) => (typeof o === "string" ? o : o.name)}
                                        inputValue={row.name}
                                        onInputChange={(_, text) => {
                                            const known = catalog.packaging.find((c) => c.name.toLowerCase() === text.trim().toLowerCase());
                                            setPackaging(i, { name: text, id: known?.id ?? null });
                                        }}
                                        renderInput={(params) => <TextField {...params} label="Packaging type" inputProps={{ ...params.inputProps, "aria-label": `Packaging type ${i + 1}` }} />}
                                    />
                                    <TextField size="small" type="number" label="Pieces" value={row.quantity} onChange={(e) => setPackaging(i, { quantity: e.target.value })} sx={{ width: 110 }} inputProps={{ min: 1, "aria-label": `Pieces in packaging ${i + 1}` }} />
                                    <IconButton aria-label={`Remove packaging ${i + 1}`} onClick={() => draft.setValue((d) => ({ ...d, packaging: d.packaging.filter((_, n) => n !== i) }))}>
                                        <Close fontSize="small" />
                                    </IconButton>
                                </Stack>
                            ))}
                            <Box>
                                <Button size="small" onClick={() => draft.setValue((d) => ({ ...d, packaging: [...d.packaging, { id: null, name: "", quantity: "1" }] }))}>Add packaging</Button>
                            </Box>
                        </Stack>
                    </Box>
                </Stack>
                <Stack direction="row" spacing={1} sx={{ mt: 1.5, alignItems: "center" }}>
                    <Button variant="contained" onClick={check} disabled={busy || !draft.dirty}>Apply options</Button>
                    {draft.dirty && <Typography variant="caption" color="warning.main">Unsaved changes (kept if you leave)</Typography>}
                </Stack>
            </Box>

            <Dialog open={preview !== null} onClose={() => setPreview(null)}>
                <DialogTitle>Remove {preview?.remove} variant{preview?.remove === 1 ? "" : "s"}?</DialogTitle>
                <DialogContent>
                    <Typography variant="body2" sx={{ mb: 1 }}>
                        Applying these options adds {preview?.add}, brings back {preview?.restore} and removes the variants below. They go off sale in every store; their history stays.
                    </Typography>
                    <Stack direction="row" spacing={0.5} sx={{ flexWrap: "wrap", rowGap: 0.5 }}>
                        {preview?.removing.map((sku) => <Chip key={sku} size="small" label={sku} />)}
                    </Stack>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setPreview(null)}>Cancel</Button>
                    <Button color="error" variant="contained" onClick={apply}>Remove and apply</Button>
                </DialogActions>
            </Dialog>

            <VariantRows itemId={itemId} variants={item.variants} />
        </Stack>
    );
}

/** One row per variant: barcode (type, scan, generate), pictures, delete. */
function VariantRows({ itemId, variants }: { itemId: number; variants: ItemSetupProps["item"]["variants"] }) {
    const saved = React.useMemo(() => Object.fromEntries(variants.map((v) => [String(v.id), v.barcode])) as Record<string, string>, [variants]);
    const draft = useDraft<Record<string, string>>(`duka.itemSetup.${itemId}.barcodes`, saved);
    const [errors, setErrors] = React.useState<Record<string, string>>({});
    const [scanFor, setScanFor] = React.useState<number | null>(null);
    const [removeId, setRemoveId] = React.useState<number | null>(null);
    const [busy, setBusy] = React.useState(false);
    const inputs = React.useRef<Record<number, HTMLInputElement | null>>({});
    const fileInput = React.useRef<HTMLInputElement>(null);
    const [target, setTarget] = React.useState<{ variant: number; slot: number } | null>(null);

    const saveBarcodes = () => {
        const changed = Object.fromEntries(Object.entries(draft.value).filter(([id, code]) => code !== saved[id]));
        setBusy(true);
        router.put(route("admin.items.setup.barcodes", itemId), { barcodes: changed }, {
            preserveScroll: true,
            preserveState: true,
            only: RELOAD,
            onSuccess: () => {
                draft.clear();
                setErrors({});
            },
            onError: (e) => setErrors(e),
            onFinish: () => setBusy(false),
        });
    };

    const generate = (variantId: number) =>
        router.post(route("admin.items.setup.barcode.generate", [itemId, variantId]), {}, { preserveScroll: true, preserveState: true, only: RELOAD });

    const upload = (file: File) => {
        if (!target) return;
        router.post(route("admin.items.setup.image", [itemId, target.variant, target.slot]), { image: file }, { forceFormData: true, preserveScroll: true, preserveState: true, only: RELOAD });
        setTarget(null);
    };

    const removeImage = (variantId: number, slot: number) =>
        router.delete(route("admin.items.setup.image.destroy", [itemId, variantId, slot]), { preserveScroll: true, preserveState: true, only: RELOAD });

    const deleteVariant = (variantId: number) => {
        router.delete(route("admin.items.variants.destroy", [itemId, variantId]), { preserveScroll: true, preserveState: true, only: RELOAD });
        setRemoveId(null);
    };

    if (variants.length === 0) {
        return <Alert severity="info" variant="outlined">No variants yet. Add a packaging type (and colours or sizes if it comes in them), then Apply options.</Alert>;
    }

    return (
        <Box>
            <Typography sx={{ fontWeight: 700, mb: 1 }}>Variants</Typography>
            <input ref={fileInput} type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = ""; }} />
            <Stack spacing={1.5}>
                {variants.map((v, index) => (
                    <Box key={v.id} sx={{ border: "1px solid", borderColor: "divider", borderRadius: 2, p: 1.5 }}>
                        <Stack direction="row" spacing={1} sx={{ alignItems: "center", flexWrap: "wrap", rowGap: 1 }}>
                            <Box sx={{ flex: 1, minWidth: 180 }}>
                                <Typography sx={{ fontWeight: 600 }}>{v.label || "Plain"}</Typography>
                                <Typography variant="caption" color="text.secondary">{v.sku}</Typography>
                            </Box>
                            <TextField
                                size="small"
                                label="Barcode"
                                value={draft.value[String(v.id)] ?? ""}
                                onChange={(e) => draft.setValue((d) => ({ ...d, [String(v.id)]: e.target.value }))}
                                // A USB scanner types the code and presses Enter: move on to the next variant.
                                onKeyDown={(e) => {
                                    if (e.key === "Enter") {
                                        e.preventDefault();
                                        inputs.current[variants[index + 1]?.id ?? -1]?.focus();
                                    }
                                }}
                                inputRef={(el) => { inputs.current[v.id] = el; }}
                                error={Boolean(errors[`barcodes.${v.id}`])}
                                helperText={errors[`barcodes.${v.id}`]}
                                inputProps={{ "aria-label": `Barcode ${v.sku}` }}
                                sx={{ width: 230 }}
                            />
                            <Tooltip title="Scan with the camera"><IconButton aria-label={`Scan barcode ${v.sku}`} onClick={() => setScanFor(v.id)}><QrCodeScannerRounded /></IconButton></Tooltip>
                            <Button size="small" onClick={() => generate(v.id)} disabled={Boolean(v.barcode)} aria-label={`Generate barcode ${v.sku}`}>Generate</Button>
                            <Tooltip title="Delete this variant"><IconButton aria-label={`Delete variant ${v.sku}`} onClick={() => setRemoveId(v.id)}><DeleteOutlineRounded /></IconButton></Tooltip>
                        </Stack>
                        <Stack direction="row" spacing={1} sx={{ mt: 1.25 }}>
                            {v.slots.map((slot, i) =>
                                slot ? (
                                    <Box key={i} sx={{ position: "relative", width: 64, height: 64, borderRadius: 1.5, overflow: "hidden", border: "1px solid", borderColor: "divider" }}>
                                        <Box component="img" src={slot.url} alt={`${v.sku} picture ${i + 1}`} sx={{ width: "100%", height: "100%", objectFit: "cover" }} />
                                        <IconButton size="small" aria-label={`Remove picture ${i + 1} of ${v.sku}`} onClick={() => removeImage(v.id, i)} sx={{ position: "absolute", top: 0, right: 0, bgcolor: "background.paper", p: 0.25 }}>
                                            <Close sx={{ fontSize: 14 }} />
                                        </IconButton>
                                    </Box>
                                ) : (
                                    <IconButton key={i} aria-label={`Add picture ${i + 1} to ${v.sku}`} onClick={() => { setTarget({ variant: v.id, slot: i }); fileInput.current?.click(); }} sx={{ width: 64, height: 64, borderRadius: 1.5, border: "1px dashed", borderColor: "divider" }}>
                                        <AddPhotoAlternateOutlined />
                                    </IconButton>
                                ),
                            )}
                        </Stack>
                    </Box>
                ))}
            </Stack>

            <Stack direction="row" spacing={1} sx={{ mt: 1.5, alignItems: "center" }}>
                <Button variant="contained" onClick={saveBarcodes} disabled={busy || !draft.dirty}>Save barcodes</Button>
                {draft.restored && <Button size="small" onClick={draft.discard}>Discard kept changes</Button>}
                {draft.dirty && <Typography variant="caption" color="warning.main">Unsaved changes (kept if you leave)</Typography>}
            </Stack>

            <BarcodeScannerDialog
                open={scanFor !== null}
                onClose={() => setScanFor(null)}
                onScan={(text) => {
                    if (scanFor !== null) draft.setValue((d) => ({ ...d, [String(scanFor)]: text }));
                    setScanFor(null);
                }}
            />

            <Dialog open={removeId !== null} onClose={() => setRemoveId(null)}>
                <DialogTitle>Delete this variant?</DialogTitle>
                <DialogContent><Typography variant="body2">It goes off sale in every store. Its sales and stock history stay. Applying the options again can bring it back.</Typography></DialogContent>
                <DialogActions>
                    <Button onClick={() => setRemoveId(null)}>Cancel</Button>
                    <Button color="error" variant="contained" onClick={() => removeId !== null && deleteVariant(removeId)}>Delete variant</Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
}
