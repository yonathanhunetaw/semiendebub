import * as React from "react";
import { Alert, Box, Button, Stack, Switch, TextField, Typography } from "@mui/material";
import { router } from "@inertiajs/react";

import type { PriceLine, StoreSetup } from "@/types/itemSetup";
import PartyPrices from "@/Components/Admin/ItemSetup/PartyPrices";
import { RELOAD } from "@/Components/Admin/ItemSetup/VariantsPart";
import { useDraft } from "@/hooks/useDraft";

type Row = { store_variant_id: number; price: string; discount_price: string; discount_ends_at: string; individual_price: string; on_sale: boolean; business_pool: string };

const toRows = (lines: PriceLine[]): Row[] =>
    lines.map((l) => ({
        store_variant_id: l.store_variant_id,
        price: l.price === null || Number(l.price) === 0 ? "" : String(l.price),
        discount_price: l.discount_price === null ? "" : String(l.discount_price),
        discount_ends_at: l.discount_ends_at ?? "",
        individual_price: l.individual_price === null ? "" : String(l.individual_price),
        // On unless an admin forced it off: a variant waiting for its price is not "off", it just has no price yet.
        on_sale: !l.forced_off,
        business_pool: l.business_pool === null ? "" : String(l.business_pool),
    }));

/** One store's prices for the item: every variant's price, discount and individual price, saved together. */
export default function PricesPart({ itemId, store }: { itemId: number; store: StoreSetup }) {
    const saved = React.useMemo(() => toRows(store.lines), [store.lines]);
    const draft = useDraft<Row[]>(`duka.itemSetup.${itemId}.prices.${store.id}`, saved);
    const [busy, setBusy] = React.useState(false);
    const [errors, setErrors] = React.useState<Record<string, string>>({});

    const set = (i: number, field: keyof Row, value: string | boolean) => draft.setValue((rows) => rows.map((r, n) => (n === i ? { ...r, [field]: value } : r)));

    const save = () => {
        setBusy(true);
        router.put(
            route("admin.items.setup.prices", [itemId, store.id]),
            { variants: draft.value.map((r) => ({ ...r, price: r.price === "" ? 0 : r.price })) },
            {
                preserveScroll: true,
                preserveState: true,
                only: RELOAD,
                onSuccess: () => {
                    draft.clear();
                    setErrors({});
                },
                onError: (e) => setErrors(e),
                onFinish: () => setBusy(false),
            },
        );
    };

    return (
        <Stack spacing={1.5}>
            {draft.restored && (
                <Alert severity="info" variant="outlined" action={<Button size="small" onClick={draft.discard}>Discard</Button>}>
                    Your unsaved changes were kept from last time.
                </Alert>
            )}
            {Object.values(errors).length > 0 && <Alert severity="error">{Object.values(errors).join(" ")}</Alert>}

            <Box sx={{ overflowX: "auto" }}>
                <Box component="table" sx={{ width: "100%", minWidth: 900, borderCollapse: "collapse", "& td, & th": { p: 0.5, textAlign: "left" } }}>
                    <thead>
                        <tr>
                            <th><Typography variant="caption" color="text.secondary">Variant</Typography></th>
                            <th><Typography variant="caption" color="text.secondary">Price (business) ETB</Typography></th>
                            <th><Typography variant="caption" color="text.secondary">Discount ETB</Typography></th>
                            <th><Typography variant="caption" color="text.secondary">Discount ends</Typography></th>
                            <th><Typography variant="caption" color="text.secondary">Individual ETB (optional)</Typography></th>
                            <th><Typography variant="caption" color="text.secondary">Kept for business (units)</Typography></th>
                            <th><Typography variant="caption" color="text.secondary">On sale</Typography></th>
                        </tr>
                    </thead>
                    <tbody>
                        {store.lines.map((line, i) => {
                            const r = draft.value[i];
                            if (!r) return null;

                            return (
                                <tr key={line.store_variant_id}>
                                    <td><Typography variant="body2">{line.variant}</Typography></td>
                                    <td><TextField size="small" type="number" value={r.price} onChange={(e) => set(i, "price", e.target.value)} inputProps={{ min: 0, step: "0.01", "aria-label": `Price ${line.variant}` }} /></td>
                                    <td><TextField size="small" type="number" value={r.discount_price} onChange={(e) => set(i, "discount_price", e.target.value)} inputProps={{ min: 0, step: "0.01", "aria-label": `Discount ${line.variant}` }} /></td>
                                    <td><TextField size="small" type="date" value={r.discount_ends_at} onChange={(e) => set(i, "discount_ends_at", e.target.value)} InputLabelProps={{ shrink: true }} inputProps={{ "aria-label": `Discount ends ${line.variant}` }} /></td>
                                    <td><TextField size="small" type="number" value={r.individual_price} onChange={(e) => set(i, "individual_price", e.target.value)} inputProps={{ min: 0, step: "0.01", "aria-label": `Individual ${line.variant}` }} /></td>
                                    <td><TextField size="small" type="number" value={r.business_pool} onChange={(e) => set(i, "business_pool", e.target.value)} inputProps={{ min: 0, "aria-label": `Business pool ${line.variant}` }} sx={{ width: 110 }} /></td>
                                    <td><Switch checked={r.on_sale && r.price !== "" && Number(r.price) > 0} disabled={r.price === "" || Number(r.price) <= 0} onChange={(e) => set(i, "on_sale", e.target.checked)} slotProps={{ input: { "aria-label": `On sale ${line.variant}` } }} /></td>
                                </tr>
                            );
                        })}
                    </tbody>
                </Box>
            </Box>

            <Stack direction="row" spacing={1} sx={{ alignItems: "center", flexWrap: "wrap" }}>
                <Button variant="contained" onClick={save} disabled={busy || !draft.dirty}>Save prices</Button>
                <Button size="small" onClick={() => draft.setValue((rows) => rows.map((r) => ({ ...r, price: rows[0]?.price ?? "" })))} disabled={draft.value.length < 2}>
                    Same price on every variant
                </Button>
                <Button size="small" onClick={() => draft.setValue((rows) => rows.map((r) => ({ ...r, on_sale: false })))}>Take all off sale</Button>
                {draft.dirty && <Typography variant="caption" color="warning.main">Unsaved changes (kept if you leave)</Typography>}
            </Stack>

            <PartyPrices itemId={itemId} store={store} />
        </Stack>
    );
}
