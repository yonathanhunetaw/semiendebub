import React from "react";
import { Head, Link, router } from "@inertiajs/react";
import { Box, Button, Container, InputAdornment, Paper, Stack, TextField, Typography } from "@mui/material";
import SearchRounded from "@mui/icons-material/SearchRounded";
import StorefrontOutlined from "@mui/icons-material/StorefrontOutlined";
import ArrowForwardRounded from "@mui/icons-material/ArrowForwardRounded";
import ItemCard from "@/Components/Storefront/ItemCard";
import type { StorefrontItemCard } from "@/types/storefront";

interface MarketStore {
    id: number;
    name: string;
    slug: string;
    description: string | null;
    location: string | null;
    url: string;
    /** On the directory: how many items it lists. */
    item_count?: number;
}

interface StoreResult extends MarketStore {
    total: number;
    items: StorefrontItemCard[];
}

interface Props {
    query?: string;
    stores?: MarketStore[];
    results?: StoreResult[];
}

/** /stores: every store on Duka (a vendor is a store), and one search across all of them. */
export default function StoresIndex({ query = "", stores = [], results = [] }: Props): React.ReactElement {
    const [q, setQ] = React.useState(query);
    const searching = query.length >= 2;
    const search = (event: React.FormEvent) => {
        event.preventDefault();
        router.get(route("storefront.stores"), q.trim() ? { q: q.trim() } : {}, { preserveState: true });
    };

    return (
        <Box sx={{ minHeight: "100vh", bgcolor: "background.default", py: { xs: 2, md: 4 } }}>
            <Head title={searching ? `"${query}" in every store` : "All stores"} />
            <Container maxWidth="lg">
                <Stack spacing={3}>
                    <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={2}>
                        <Box>
                            <Typography variant="h4" sx={{ fontWeight: 900 }}>All stores</Typography>
                            <Typography color="text.secondary">Search every store on Duka at once.</Typography>
                        </Box>
                        <Button component={Link} href={route("storefront.index")} variant="outlined">Back to the shop</Button>
                    </Stack>

                    <Paper component="form" onSubmit={search} variant="outlined" sx={{ p: 1.5, borderRadius: 3 }}>
                        <TextField
                            fullWidth
                            value={q}
                            onChange={(e) => setQ(e.target.value)}
                            placeholder="What are you looking for?"
                            inputProps={{ "aria-label": "Search every store" }}
                            slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchRounded /></InputAdornment> } }}
                        />
                    </Paper>

                    {searching ? (
                        results.length === 0 ? (
                            <Typography color="text.secondary" sx={{ textAlign: "center", py: 6 }}>No store has anything matching &ldquo;{query}&rdquo;.</Typography>
                        ) : (
                            results.map((store) => (
                                <Box key={store.id} component="section" aria-label={store.name}>
                                    <Stack direction="row" alignItems="baseline" justifyContent="space-between" sx={{ mb: 1.5 }}>
                                        <Typography variant="h6" sx={{ fontWeight: 800 }}>
                                            {store.name} <Typography component="span" color="text.secondary">· {store.total} found</Typography>
                                        </Typography>
                                        <Button component={Link} href={route("storefront.store", { store: store.slug, search: query })} endIcon={<ArrowForwardRounded />}>
                                            See all in {store.name}
                                        </Button>
                                    </Stack>
                                    <Box className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
                                        {store.items.map((item) => (
                                            <ItemCard key={item.id} item={item} href={route("storefront.store.items.show", { store: store.slug, item: item.id })} />
                                        ))}
                                    </Box>
                                </Box>
                            ))
                        )
                    ) : (
                        <Box sx={{ display: "grid", gap: 1.5, gridTemplateColumns: { xs: "1fr", sm: "repeat(2, minmax(0, 1fr))", md: "repeat(3, minmax(0, 1fr))" } }}>
                            {stores.map((store) => (
                                <Paper key={store.id} component={Link} href={store.url} variant="outlined" sx={{ p: 2, borderRadius: 3, textDecoration: "none", color: "inherit", "&:hover": { borderColor: "primary.main" } }}>
                                    <Stack direction="row" spacing={1.5} alignItems="center">
                                        <StorefrontOutlined color="primary" />
                                        <Box sx={{ minWidth: 0 }}>
                                            <Typography noWrap sx={{ fontWeight: 800 }}>{store.name}</Typography>
                                            <Typography noWrap variant="body2" color="text.secondary">
                                                {[store.location, store.item_count !== undefined ? `${store.item_count} items` : null].filter(Boolean).join(" · ")}
                                            </Typography>
                                        </Box>
                                    </Stack>
                                    {store.description && <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>{store.description}</Typography>}
                                </Paper>
                            ))}
                        </Box>
                    )}
                </Stack>
            </Container>
        </Box>
    );
}
