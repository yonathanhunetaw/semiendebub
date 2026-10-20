import * as React from "react";
import axios from "axios";
import { router } from "@inertiajs/react";
import { Alert, Autocomplete, Box, Button, MenuItem, Stack, TextField, Typography } from "@mui/material";

import { useDraft } from "@/hooks/useDraft";
import type { CustomerEntry, PriceLine, SellerEntry, StoreSetup, TierLine } from "@/types/itemSetup";
import { RELOAD } from "@/Components/Admin/ItemSetup/VariantsPart";

type Row = { price: string; discount_price: string; discount_ends_at: string };
type Party = { key: string; kind: "seller" | "customer"; id: number; name: string; type: "business" | "individual"; lines: TierLine[] };

const toRows = (lines: TierLine[]): Row[] =>
    lines.map((l) => ({
        price: l.price === null ? "" : String(l.price),
        discount_price: l.discount_price === null ? "" : String(l.discount_price),
        discount_ends_at: l.discount_ends_at ?? "",
    }));

/** One seller's (or customer's) prices: a row per variant, saved or removed on its own. */
function PartyCard({ itemId, store, party, saved }: { itemId: number; store: StoreSetup; party: Party; saved: boolean }) {
    const base = React.useMemo(() => toRows(party.lines), [party.lines]);
    const draft = useDraft<Row[]>(`duka.itemSetup.${itemId}.${party.key}.${store.id}`, base);
    const [errors, setErrors] = React.useState<Record<string, string>>({});
    const [busy, setBusy] = React.useState(false);
    const set = (i: number, field: keyof Row, value: string) => draft.setValue((rows) => rows.map((r, n) => (n === i ? { ...r, [field]: value } : r)));

    const body = {
        ...(party.kind === "seller" ? { seller_id: party.id, customer_type: party.type } : { customer_id: party.id }),
        variants: store.lines.map((l: PriceLine, i) => ({ store_variant_id: l.store_variant_id, ...(draft.value[i] ?? { price: "", discount_price: "", discount_ends_at: "" }) })),
    };
    const options = {
        preserveScroll: true,
        preserveState: true,
        only: RELOAD,
        onSuccess: () => {
            draft.clear();
            setErrors({});
        },
        onError: (e: Record<string, string>) => setErrors(e),
        onFinish: () => setBusy(false),
    };

    const save = () => {
        setBusy(true);
        router.put(route(party.kind === "seller" ? "admin.items.setup.seller-prices" : "admin.items.setup.customer-prices", [itemId, store.id]), body, options);
    };
    const remove = () => {
        setBusy(true);
        party.kind === "seller"
            ? router.delete(route("admin.items.setup.seller-prices.destroy", [itemId, store.id, party.id]), { data: { customer_type: party.type }, ...options })
            : router.delete(route("admin.items.setup.customer-prices.destroy", [itemId, store.id, party.id]), options);
    };

    return (
        <Box sx={{ border: "1px solid", borderColor: "divider", borderRadius: 2, p: 1.5 }}>
            <Stack direction="row" spacing={1} sx={{ alignItems: "baseline", flexWrap: "wrap" }}>
                <Typography sx={{ fontWeight: 700 }}>{party.name}</Typography>
                <Typography variant="caption" color="text.secondary">{party.kind === "seller" ? `${party.type} price` : `${party.type} customer`}{saved ? "" : " · not saved yet"}</Typography>
            </Stack>
            {draft.restored && <Alert severity="info" variant="outlined" sx={{ my: 1 }} action={<Button size="small" onClick={draft.discard}>Discard</Button>}>Your unsaved changes were kept from last time.</Alert>}
            {Object.values(errors).length > 0 && <Alert severity="error" sx={{ my: 1 }}>{Object.values(errors).join(" ")}</Alert>}
            <Stack spacing={1} sx={{ my: 1 }}>
                {store.lines.map((l, i) => (
                    <Stack key={l.store_variant_id} direction="row" spacing={1} sx={{ alignItems: "center", flexWrap: "wrap", rowGap: 1 }}>
                        <Typography variant="body2" sx={{ width: 150 }}>{l.variant}</Typography>
                        <TextField size="small" type="number" label="Price ETB" value={draft.value[i]?.price ?? ""} onChange={(e) => set(i, "price", e.target.value)} sx={{ width: 120 }} inputProps={{ min: 0, step: "0.01", "aria-label": `${party.name} price ${l.variant}` }} />
                        <TextField size="small" type="number" label="Discount" value={draft.value[i]?.discount_price ?? ""} onChange={(e) => set(i, "discount_price", e.target.value)} sx={{ width: 110 }} inputProps={{ min: 0, step: "0.01", "aria-label": `${party.name} discount ${l.variant}` }} />
                        <TextField size="small" type="date" label="Ends" value={draft.value[i]?.discount_ends_at ?? ""} onChange={(e) => set(i, "discount_ends_at", e.target.value)} InputLabelProps={{ shrink: true }} sx={{ width: 150 }} inputProps={{ "aria-label": `${party.name} discount ends ${l.variant}` }} />
                    </Stack>
                ))}
            </Stack>
            <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                <Button variant="contained" size="small" onClick={save} disabled={busy || (saved && !draft.dirty)}>Save {party.kind} prices</Button>
                {saved && <Button size="small" color="error" onClick={remove} disabled={busy}>Remove all</Button>}
                {draft.dirty && <Typography variant="caption" color="warning.main">Unsaved changes (kept if you leave)</Typography>}
            </Stack>
        </Box>
    );
}

/** Seller prices and customer prices for the item in this store: add, edit, remove. */
export default function PartyPrices({ itemId, store }: { itemId: number; store: StoreSetup }) {
    const empty = (): TierLine[] => store.lines.map((l) => ({ store_variant_id: l.store_variant_id, price: null, discount_price: null, discount_ends_at: null }));

    const fromServer: Party[] = [
        ...store.seller_prices.map((e: SellerEntry): Party => ({ key: `seller-${e.seller_id}-${e.customer_type}`, kind: "seller", id: e.seller_id, name: e.name, type: e.customer_type, lines: e.lines })),
        ...store.customer_prices.map((e: CustomerEntry): Party => ({ key: `customer-${e.customer_id}`, kind: "customer", id: e.customer_id, name: e.name, type: e.customer_type, lines: e.lines })),
    ];
    const [added, setAdded] = React.useState<Party[]>([]);
    const [sellerId, setSellerId] = React.useState("");
    const [tier, setTier] = React.useState<"business" | "individual">("business");
    const [found, setFound] = React.useState<Array<{ id: number; name: string; phone: string; type: "business" | "individual" }>>([]);

    // An entry the server now has is no longer "added, unsaved".
    const known = new Set(fromServer.map((p) => p.key));
    const pending = added.filter((p) => !known.has(p.key));

    const search = async (q: string) => {
        try {
            const { data } = await axios.get(route("admin.items.setup.customers", store.id), { params: { q } });
            setFound(data);
        } catch {
            setFound([]);
        }
    };

    const addSeller = () => {
        const seller = store.sellers.find((s) => String(s.id) === sellerId);
        if (!seller) return;
        const key = `seller-${seller.id}-${tier}`;
        if (!known.has(key) && !added.some((p) => p.key === key)) setAdded((a) => [...a, { key, kind: "seller", id: seller.id, name: seller.name, type: tier, lines: empty() }]);
        setSellerId("");
    };

    return (
        <Stack spacing={2.5}>
            <Box>
                <Typography sx={{ fontWeight: 700, mb: 0.5 }}>Seller prices</Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>A price only one seller gets, for business or individual customers.</Typography>
                <Stack spacing={1.5}>
                    {[...fromServer.filter((p) => p.kind === "seller"), ...pending.filter((p) => p.kind === "seller")].map((p) => (
                        <PartyCard key={p.key} itemId={itemId} store={store} party={p} saved={known.has(p.key)} />
                    ))}
                    <Stack direction="row" spacing={1} sx={{ alignItems: "center", flexWrap: "wrap", rowGap: 1 }}>
                        <TextField select size="small" label="Seller" value={sellerId} onChange={(e) => setSellerId(e.target.value)} sx={{ minWidth: 200 }}>
                            {store.sellers.map((s) => <MenuItem key={s.id} value={String(s.id)}>{s.name}</MenuItem>)}
                        </TextField>
                        <TextField select size="small" label="For" value={tier} onChange={(e) => setTier(e.target.value as "business" | "individual")} sx={{ width: 140 }}>
                            <MenuItem value="business">Business</MenuItem>
                            <MenuItem value="individual">Individual</MenuItem>
                        </TextField>
                        <Button onClick={addSeller} disabled={sellerId === ""}>Add seller price</Button>
                    </Stack>
                </Stack>
            </Box>

            <Box>
                <Typography sx={{ fontWeight: 700, mb: 0.5 }}>Customer prices</Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>A price agreed with one customer of this store.</Typography>
                <Stack spacing={1.5}>
                    {[...fromServer.filter((p) => p.kind === "customer"), ...pending.filter((p) => p.kind === "customer")].map((p) => (
                        <PartyCard key={p.key} itemId={itemId} store={store} party={p} saved={known.has(p.key)} />
                    ))}
                    <Autocomplete
                        size="small"
                        options={found}
                        getOptionLabel={(o) => `${o.name} · ${o.phone} · ${o.type}`}
                        filterOptions={(x) => x}
                        onOpen={() => search("")}
                        onInputChange={(_, text, reason) => reason === "input" && search(text)}
                        onChange={(_, c) => {
                            if (!c) return;
                            const key = `customer-${c.id}`;
                            if (!known.has(key) && !added.some((p) => p.key === key)) setAdded((a) => [...a, { key, kind: "customer", id: c.id, name: c.name, type: c.type, lines: empty() }]);
                        }}
                        value={null}
                        blurOnSelect
                        clearOnBlur
                        renderInput={(params) => <TextField {...params} label="Add a customer price: search name, phone or TIN" inputProps={{ ...params.inputProps, "aria-label": "Find a customer" }} />}
                    />
                </Stack>
            </Box>
        </Stack>
    );
}
