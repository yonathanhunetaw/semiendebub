import * as React from "react";
import { Head, Link, router } from "@inertiajs/react";
import { Alert, Box, Button, Chip, LinearProgress, Stack, Tab, Table, TableBody, TableCell, TableHead, TableRow, Tabs, Typography } from "@mui/material";

import AdminLayout from "@/Layouts/AdminLayout";
import StockPart from "@/Components/Admin/ItemSetup/StockPart";
import PlacementPart from "@/Components/Admin/ItemSetup/PlacementPart";
import PricesPart from "@/Components/Admin/ItemSetup/PricesPart";
import BasicsPart from "@/Components/Admin/ItemSetup/BasicsPart";
import VariantsPart, { RELOAD } from "@/Components/Admin/ItemSetup/VariantsPart";
import { ChecksList, Section, colourOf, percentOf } from "@/Components/Admin/ItemSetup/parts";
import type { Check, HistoryRow, ItemSetupProps, StoreSetup } from "@/types/itemSetup";

const SECTIONS: Array<{ id: string; label: string }> = [
    { id: "basics", label: "Basics" },
    { id: "variants", label: "Variants & barcodes" },
    { id: "stores", label: "Stores" },
    { id: "prices", label: "Prices" },
    { id: "placement", label: "Placement" },
    { id: "stock", label: "Stock" },
    { id: "history", label: "History" },
];

const PRICE_KEYS = ["priced", "individual", "seller_prices", "customer_prices", "discount", "pool"];
const PLACEMENT_KEYS = ["bin", "levels", "route"];

export default function Setup({ item, options, catalog, readiness, stores, warehouses, stock, history }: ItemSetupProps): React.ReactElement {
    const storeReadiness = (id: number) => (Array.isArray(readiness.stores) ? readiness.stores.find((s) => s.store.id === id) : readiness.stores[String(id)]) ?? null;
    const [storeId, setStoreId] = React.useState<number>(() => stores.find((s) => s.deployed)?.id ?? stores[0]?.id ?? 0);
    const store: StoreSetup | undefined = stores.find((s) => s.id === storeId);
    const storeChecks: Check[] = (store?.readiness?.checks ?? []) as Check[];
    const [active, setActive] = React.useState("basics");

    // The section in view lights up in the header while the page scrolls.
    React.useEffect(() => {
        const nodes = SECTIONS.map((s) => document.getElementById(s.id)).filter((n): n is HTMLElement => n !== null);
        const observer = new IntersectionObserver(
            (entries) => {
                const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
                if (visible) setActive(visible.target.id);
            },
            { rootMargin: "-160px 0px -55% 0px", threshold: 0 },
        );
        nodes.forEach((n) => observer.observe(n));

        return () => observer.disconnect();
    }, []);

    const reloadOnly = RELOAD;
    const deploy = (id: number) => router.post(route("admin.items.deploy", item.id), { store_id: id }, { preserveScroll: true, preserveState: true, only: reloadOnly });
    const goTo = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });

    return (
        <>
            <Head title={`Set up ${item.name}`} />
            <Stack spacing={2.5} sx={{ p: { xs: 1, md: 2 }, maxWidth: 1100 }}>
                {/* The score: sticky, so it stays in view while you scroll and save part by part. */}
                <Box sx={{ position: "sticky", top: 0, zIndex: 5, bgcolor: "background.paper", borderBottom: "1px solid", borderColor: "divider", py: 1.5, mx: { xs: -1, md: -2 }, px: { xs: 1, md: 2 } }}>
                    <Stack direction={{ xs: "column", md: "row" }} spacing={2} sx={{ alignItems: { md: "center" } }}>
                        <Box sx={{ flex: 1, minWidth: 0 }}>
                            <Typography variant="h6" sx={{ fontWeight: 800 }} noWrap>{item.name}</Typography>
                            <Typography variant="caption" color="text.secondary">{item.category ?? "No category"} · {item.variants.length} variant{item.variants.length === 1 ? "" : "s"}</Typography>
                        </Box>
                        <Box sx={{ minWidth: { md: 280 } }}>
                            <Stack direction="row" sx={{ justifyContent: "space-between" }}>
                                <Typography variant="body2" sx={{ fontWeight: 700 }}>Ready</Typography>
                                <Typography variant="body2" sx={{ fontWeight: 800 }} data-testid="ready-percent">{readiness.percent}%</Typography>
                            </Stack>
                            <LinearProgress variant="determinate" value={readiness.percent} color={colourOf(readiness.percent)} sx={{ height: 8, borderRadius: 4 }} />
                        </Box>
                    </Stack>
                    <Stack direction="row" spacing={1} sx={{ mt: 1, flexWrap: "wrap", rowGap: 0.75, alignItems: "center" }}>
                        {SECTIONS.map((s) => (
                            <Chip key={s.id} size="small" clickable label={s.label} variant={active === s.id ? "filled" : "outlined"} color={active === s.id ? "primary" : "default"} onClick={() => goTo(s.id)} />
                        ))}
                    </Stack>
                    <Tabs value={storeId} onChange={(_, v) => setStoreId(v)} variant="scrollable" scrollButtons="auto" sx={{ mt: 0.5, minHeight: 36 }}>
                        {stores.map((s) => (
                            <Tab key={s.id} value={s.id} sx={{ minHeight: 36, py: 0 }} label={`${s.name} ${s.readiness ? `${s.readiness.percent}%` : "· not deployed"}`} />
                        ))}
                    </Tabs>
                </Box>

                {/* 1. Basics */}
                <Section id="basics" title="Basics" hint="Name, description, category, status and pictures. Saved on their own." checks={readiness.item.checks} only={["name", "category", "picture", "description"]}>
                    <BasicsPart itemId={item.id} saved={{ product_name: item.basics.product_name, product_description: item.basics.product_description, packaging_details: item.basics.packaging_details, hs_code: item.basics.hs_code ?? "", item_category_id: item.basics.item_category_id, status: item.basics.status }} categories={catalog.categories} pictures={item.basics.pictures} />
                </Section>

                {/* 2. Variants and barcodes, edited right here */}
                <Section id="variants" title="Variants & barcodes" hint="Colours, sizes and packaging make the variants. Each variant needs its packaging and a barcode." checks={readiness.item.checks} only={["variants", "packaging", "barcode"]}>
                    <VariantsPart itemId={item.id} item={item} options={options} catalog={catalog} />
                </Section>

                {/* 3. Stores */}
                <Section id="stores" title="Stores" hint="Deploy the item to a store so it can be priced, shelved and sold there." checks={storeChecks} only={["deployed"]}>
                    <Stack spacing={1}>
                        {stores.map((s) => (
                            <Stack key={s.id} direction="row" spacing={1.5} sx={{ alignItems: "center" }}>
                                <Typography sx={{ flex: 1, fontWeight: 600 }}>{s.name}</Typography>
                                {s.readiness ? <Chip size="small" color={colourOf(s.readiness.percent)} label={`${s.readiness.percent}% ready`} /> : <Chip size="small" label="not deployed" />}
                                <Button size="small" variant={s.deployed ? "text" : "contained"} onClick={() => deploy(s.id)}>{s.deployed ? "Check all variants are deployed" : "Deploy to this store"}</Button>
                            </Stack>
                        ))}
                    </Stack>
                </Section>

                {/* 3. Prices */}
                <Section id="prices" title={`Prices${store ? ` · ${store.name}` : ""}`} hint="The store price must be above zero on every variant. Individual, seller, customer prices and discounts are optional: they count when set." checks={storeChecks} only={PRICE_KEYS}>
                    {store?.deployed ? <PricesPart key={store.id} itemId={item.id} store={store} /> : <Alert severity="info" variant="outlined">Deploy the item to {store?.name ?? "a store"} first.</Alert>}
                </Section>

                {/* 4. Placement */}
                <Section id="placement" title={`Placement${store ? ` · ${store.name}` : ""}`} hint="How full its shelf bin and Remote Hub level should be. Whoever may change a place is shown; the rest is read only." checks={storeChecks} only={PLACEMENT_KEYS}>
                    {store?.deployed ? <PlacementPart key={store.id} itemId={item.id} storeId={store.id} places={store.places} refillRoute={store.route} warehouses={warehouses} /> : <Alert severity="info" variant="outlined">Deploy the item to {store?.name ?? "a store"} first.</Alert>}
                </Section>

                {/* 5. Stock */}
                <Section id="stock" title={`Stock${store ? ` · ${store.name}` : ""}`} hint="Stock only changes through a count: figures are recorded, then approved, then booked." checks={storeChecks} only={["count"]}>
                    {store?.deployed ? <StockPart key={store.id} itemId={item.id} places={store.places} warehouses={warehouses} /> : <Alert severity="info" variant="outlined">Deploy the item to {store?.name ?? "a store"} first.</Alert>}
                    <Typography sx={{ fontWeight: 700, mt: 2, mb: 0.5 }}>Everywhere it is held</Typography>
                    <Table size="small">
                        <TableHead><TableRow><TableCell>Place</TableCell><TableCell align="right">Pieces</TableCell></TableRow></TableHead>
                        <TableBody>
                            {stock.map((row) => (
                                <TableRow key={row.location_id}><TableCell>{row.place}</TableCell><TableCell align="right">{row.pieces.toLocaleString()}</TableCell></TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </Section>

                {/* 6. History */}
                <Section id="history" title="History" hint="What has happened to this item. Read only.">
                    <HistoryTabs history={history} />
                </Section>

                <Typography variant="caption" color="text.secondary">
                    <Link href={route("admin.items.show", item.id)}>Item details</Link> · {percentOf(readiness.item.checks)}% of the item's own checks done.
                </Typography>
            </Stack>
        </>
    );
}

function HistoryTabs({ history }: { history: ItemSetupProps["history"] }) {
    const kinds = ["transfers", "shipments", "movements", "sales"] as const;
    const [tab, setTab] = React.useState<(typeof kinds)[number]>("movements");
    const rows: HistoryRow[] = history[tab];

    return (
        <>
            <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ minHeight: 36 }}>
                {kinds.map((k) => <Tab key={k} value={k} sx={{ minHeight: 36, textTransform: "capitalize" }} label={`${k} (${history[k].length})`} />)}
            </Tabs>
            {rows.length === 0 ? (
                <Typography color="text.secondary" sx={{ py: 1.5 }}>Nothing yet.</Typography>
            ) : (
                <Table size="small">
                    <TableBody>
                        {rows.map((r, i) => (
                            <TableRow key={i}>
                                <TableCell>{r.reference ?? r.type}</TableCell>
                                <TableCell>{r.status ?? r.reason ?? ""}{r.place ? ` · ${r.place}` : ""}</TableCell>
                                <TableCell align="right">{r.quantity}</TableCell>
                                <TableCell align="right">{r.at ?? ""}</TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            )}
        </>
    );
}

// flashToast: every save answers with a message ("Prices saved for …"), which this page must show.
Setup.layout = (page: React.ReactNode) => <AdminLayout flashToast>{page}</AdminLayout>;
