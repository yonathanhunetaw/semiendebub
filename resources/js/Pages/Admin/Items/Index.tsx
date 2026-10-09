import {
    defaultDirection,
    fullDate,
    Icon,
    ItemCard,
    ItemThumbs,
    NeedsPhotos,
    SORT_OPTIONS,
    STATUS_OPTIONS,
    timeAgo,
    VariantMeter,
} from "@/Components/Admin/Items/itemsIndexUi";
import { EmptyState, PageHeader, StatusPill } from "@/Components/Shared/ui";
import AdminLayout from "@/Layouts/AppLayout";
import type { ItemCategoryOption, ItemCounts, ItemFilters, ItemPage, ItemRow, ItemSort, ItemStatus } from "@/types/adminItems";
import { Head, Link, router } from "@inertiajs/react";
import {
    Autocomplete,
    Box,
    Button,
    Checkbox,
    Chip,
    Divider,
    IconButton,
    InputAdornment,
    LinearProgress,
    ListItemIcon,
    ListItemText,
    ListSubheader,
    Menu,
    MenuItem,
    Paper,
    Tab,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TablePagination,
    TableRow,
    TableSortLabel,
    Tabs,
    TextField,
    ToggleButton,
    ToggleButtonGroup,
    Tooltip,
    Typography,
    useMediaQuery,
    useTheme,
} from "@mui/material";
import React, { useEffect, useMemo, useRef, useState } from "react";

interface Props {
    items: ItemPage;
    counts?: Partial<ItemCounts>;
    categories?: ItemCategoryOption[];
    filters: ItemFilters;
}

/** Everything the list URL can carry; `undefined` drops the key. */
type Query = Partial<Omit<ItemFilters, "category">> & { category?: number | null; page?: number };

type View = "table" | "grid";

const VIEW_KEY = "duka.admin.items.view";
const SEARCH_DEBOUNCE_MS = 300;
const number = new Intl.NumberFormat();

const readView = (): View => {
    try {
        return window.localStorage.getItem(VIEW_KEY) === "grid" ? "grid" : "table";
    } catch {
        return "table";
    }
};

const saveView = (view: View): void => {
    try {
        window.localStorage.setItem(VIEW_KEY, view);
    } catch {
        // Private mode or blocked storage: the choice just isn't remembered.
    }
};

/** Leave defaults out of the URL so shared links stay short. */
function toParams(query: Query): Record<string, string | number> {
    const params: Record<string, string | number> = {};
    const sort = query.sort ?? "name";

    if (query.q) params.q = query.q;
    if (query.status && query.status !== "all") params.status = query.status;
    if (query.category) params.category = query.category;
    if (query.needs_photos) params.needs_photos = 1;
    if (sort !== "name") params.sort = sort;
    if (query.direction && query.direction !== defaultDirection(sort)) params.direction = query.direction;
    if (query.per_page && query.per_page !== 25) params.per_page = query.per_page;
    if (query.page && query.page > 1) params.page = query.page;

    return params;
}

const isTyping = (target: EventTarget | null): boolean =>
    target instanceof HTMLElement && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));

const headCellSx = {
    bgcolor: "rgb(var(--surface-container-low))",
    color: "text.secondary",
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: "0.05em",
    textTransform: "uppercase",
    whiteSpace: "nowrap",
    borderBottomColor: "divider",
} as const;

/**
 * The item catalogue: physical product templates and their variant sets.
 *
 * Built for a large catalogue: search, filters, sorting and paging all run on
 * the server (App\Services\Admin\ItemCatalogue), and every change is a partial
 * reload of `items`, `counts` and `filters` only.
 */
export default function ItemIndex({ items, counts = {}, categories = [], filters }: Props): React.ReactElement {
    const theme = useTheme();
    const isDesktop = useMediaQuery(theme.breakpoints.up("md"));

    const [search, setSearch] = useState(filters.q);
    const [view, setView] = useState<View>(readView);
    const [loading, setLoading] = useState(false);
    const [selected, setSelected] = useState<Set<number>>(() => new Set());
    const [rowMenu, setRowMenu] = useState<{ anchor: HTMLElement; item: ItemRow } | null>(null);
    const [bulkMenu, setBulkMenu] = useState<HTMLElement | null>(null);

    const searchRef = useRef<HTMLInputElement>(null);
    const tableRef = useRef<HTMLDivElement>(null);

    const rows = items.data ?? [];
    const shownView: View = isDesktop ? view : "grid";
    const category = useMemo(() => categories.find((c) => c.id === filters.category) ?? null, [categories, filters.category]);
    const hasFilters = filters.q !== "" || filters.status !== "all" || filters.category !== null || filters.needs_photos;
    const count = (key: keyof ItemCounts): number => counts[key] ?? 0;

    const go = (patch: Query, { toTop = false }: { toTop?: boolean } = {}): void => {
        const next: Query = { ...filters, page: items.current_page, ...patch };
        // Anything but paging starts again from the first page.
        if (!("page" in patch)) next.page = undefined;

        router.get(route("admin.items.index"), toParams(next), {
            only: ["items", "counts", "filters"],
            preserveState: true,
            preserveScroll: !toTop,
            replace: true,
            onSuccess: () => {
                if (toTop) tableRef.current?.scrollTo({ top: 0 });
            },
        });
    };

    const clearAll = (): void => {
        setSearch("");
        go({ q: "", status: "all", category: null, needs_photos: false });
    };

    // Search as you type, once typing pauses.
    useEffect(() => {
        const term = search.trim();
        if (term === filters.q) return;

        const timer = window.setTimeout(() => go({ q: term }), SEARCH_DEBOUNCE_MS);
        return () => window.clearTimeout(timer);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [search]);

    // "/" jumps to search from anywhere on the page.
    useEffect(() => {
        const onKey = (event: KeyboardEvent): void => {
            if (event.key === "/" && !isTyping(event.target)) {
                event.preventDefault();
                searchRef.current?.focus();
            }
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, []);

    useEffect(() => {
        const offStart = router.on("start", () => setLoading(true));
        const offFinish = router.on("finish", () => setLoading(false));
        return () => {
            offStart();
            offFinish();
        };
    }, []);

    // A new page of rows is a new selection.
    useEffect(() => setSelected(new Set()), [items.data]);

    const toggle = (id: number): void =>
        setSelected((current) => {
            const next = new Set(current);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });

    const allOnPage = rows.length > 0 && rows.every((row) => selected.has(row.id));
    const toggleAll = (): void => setSelected(allOnPage ? new Set() : new Set(rows.map((row) => row.id)));

    const setStatus = (ids: number[], status: ItemStatus): void => {
        setRowMenu(null);
        setBulkMenu(null);
        router.patch(route("admin.items.bulkStatus"), { ids, status }, { preserveScroll: true, preserveState: true });
    };

    const sortBy = (sort: ItemSort): void => {
        const direction = filters.sort === sort ? (filters.direction === "asc" ? "desc" : "asc") : defaultDirection(sort);
        go({ sort, direction }, { toTop: true });
    };

    const changeView = (next: View | null): void => {
        if (!next) return;
        setView(next);
        saveView(next);
    };

    const sortLabel = (sort: ItemSort, label: string, align: "left" | "right" = "left"): React.ReactElement => (
        <TableSortLabel
            active={filters.sort === sort}
            direction={filters.sort === sort ? filters.direction : defaultDirection(sort)}
            onClick={() => sortBy(sort)}
            sx={{ flexDirection: align === "right" ? "row-reverse" : "row" }}
        >
            {label}
        </TableSortLabel>
    );

    const pagination = (
        <TablePagination
            component="div"
            count={items.total}
            page={Math.max(0, items.current_page - 1)}
            rowsPerPage={filters.per_page}
            rowsPerPageOptions={[25, 50, 100]}
            onPageChange={(_event, page) => go({ page: page + 1 }, { toTop: true })}
            onRowsPerPageChange={(event) => go({ per_page: Number(event.target.value) }, { toTop: true })}
            showFirstButton
            showLastButton
            labelRowsPerPage={isDesktop ? "Rows per page" : "Rows"}
            sx={{ borderTop: "1px solid", borderColor: "divider", "& .MuiTablePagination-toolbar": { minHeight: 52 } }}
        />
    );

    const empty =
        count("all") === 0 && !hasFilters ? (
            <EmptyState
                icon="inventory_2"
                title="No items yet"
                description="Create the first product template; its variants are generated from colours, sizes and packaging."
                action={
                    <Button component={Link} href={route("admin.items.create")} variant="contained" startIcon={<Icon name="add" />}>
                        New item
                    </Button>
                }
                className="py-16"
            />
        ) : (
            <EmptyState
                icon="search_off"
                title="No items match"
                description={filters.q ? `Nothing found for “${filters.q}” with these filters.` : "Nothing matches these filters."}
                action={
                    <Button onClick={clearAll} variant="outlined" startIcon={<Icon name="filter_alt_off" />}>
                        Clear filters
                    </Button>
                }
                className="py-16"
            />
        );

    return (
        <Box sx={{ p: { xs: 2, md: 3 }, pb: { xs: 12, md: 4 }, maxWidth: 1440, mx: "auto" }}>
            <Head title="Items" />

            <PageHeader
                icon="inventory_2"
                title="Items"
                subtitle="Physical product templates and their generated variant sets"
                className="mb-4"
                actions={
                    <Button
                        component={Link}
                        href={route("admin.items.create")}
                        variant="contained"
                        startIcon={<Icon name="add" />}
                        sx={{ borderRadius: "10px", px: { xs: 1.5, sm: 2 }, whiteSpace: "nowrap" }}
                    >
                        New item
                    </Button>
                }
            />

            {/* ── Status tabs + filters ───────────────────────────────── */}
            <Paper variant="outlined" sx={{ borderRadius: "16px", mb: 2, overflow: "hidden" }}>
                <Tabs
                    value={filters.status}
                    onChange={(_event, status: ItemFilters["status"]) => go({ status }, { toTop: true })}
                    variant="scrollable"
                    scrollButtons="auto"
                    allowScrollButtonsMobile
                    sx={{
                        px: 1,
                        minHeight: 48,
                        borderBottom: "1px solid",
                        borderColor: "divider",
                        "& .MuiTab-root": { minHeight: 48, textTransform: "none", fontWeight: 600, fontSize: 13, gap: 0.75 },
                    }}
                >
                    {[{ value: "all" as const, label: "All", icon: "apps" }, ...STATUS_OPTIONS].map((option) => (
                        <Tab
                            key={option.value}
                            value={option.value}
                            iconPosition="start"
                            icon={<Icon name={option.icon} className="text-[18px]" />}
                            label={
                                <Box component="span" sx={{ display: "inline-flex", alignItems: "center", gap: 0.75 }}>
                                    {option.label}
                                    <Box
                                        component="span"
                                        className={
                                            filters.status === option.value
                                                ? "bg-primary-container text-on-primary-container"
                                                : "bg-surface-container text-on-surface-variant"
                                        }
                                        sx={{ px: 0.75, borderRadius: 999, fontSize: 11, fontWeight: 700, fontVariantNumeric: "tabular-nums", lineHeight: "18px" }}
                                    >
                                        {number.format(count(option.value))}
                                    </Box>
                                </Box>
                            }
                        />
                    ))}
                </Tabs>

                <Box sx={{ p: 1.5, display: "flex", flexWrap: "wrap", alignItems: "center", gap: 1.5 }}>
                    <TextField
                        inputRef={searchRef}
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                        onKeyDown={(event) => {
                            if (event.key === "Escape") setSearch("");
                        }}
                        placeholder="Search name, SKU, barcode or #id"
                        size="small"
                        sx={{ flex: "1 1 280px", minWidth: 0 }}
                        slotProps={{
                            htmlInput: { "aria-label": "Search items" },
                            input: {
                                startAdornment: (
                                    <InputAdornment position="start">
                                        <Icon name="search" className="text-[20px] text-on-surface-variant" />
                                    </InputAdornment>
                                ),
                                endAdornment: search ? (
                                    <InputAdornment position="end">
                                        <IconButton size="small" aria-label="Clear search" onClick={() => setSearch("")} edge="end">
                                            <Icon name="close" className="text-[18px]" />
                                        </IconButton>
                                    </InputAdornment>
                                ) : isDesktop ? (
                                    <InputAdornment position="end">
                                        <Box
                                            component="kbd"
                                            className="border border-outline-variant bg-surface-container-low text-on-surface-variant"
                                            sx={{ px: 0.75, borderRadius: "6px", fontSize: 11, fontFamily: "inherit", lineHeight: "18px" }}
                                        >
                                            /
                                        </Box>
                                    </InputAdornment>
                                ) : null,
                            },
                        }}
                    />

                    <Autocomplete
                        size="small"
                        options={categories}
                        value={category}
                        onChange={(_event, value) => go({ category: value?.id ?? null }, { toTop: true })}
                        getOptionLabel={(option) => option.name}
                        isOptionEqualToValue={(option, value) => option.id === value.id}
                        sx={{ flex: "0 1 240px", minWidth: 180 }}
                        renderOption={({ key, ...props }, option) => (
                            <li key={key} {...props}>
                                <Box sx={{ display: "flex", alignItems: "center", width: "100%", gap: 1 }}>
                                    <Box sx={{ minWidth: 0, flex: 1 }}>
                                        <Typography noWrap sx={{ fontSize: 14 }}>
                                            {option.name}
                                        </Typography>
                                        {option.parent ? (
                                            <Typography noWrap sx={{ fontSize: 11, color: "text.secondary" }}>
                                                in {option.parent}
                                            </Typography>
                                        ) : null}
                                    </Box>
                                    <Typography sx={{ fontSize: 12, color: "text.secondary", fontVariantNumeric: "tabular-nums" }}>
                                        {number.format(option.items)}
                                    </Typography>
                                </Box>
                            </li>
                        )}
                        renderInput={(params) => (
                            <TextField
                                {...params}
                                placeholder="All categories"
                                InputProps={{
                                    ...params.InputProps,
                                    startAdornment: (
                                        <>
                                            <InputAdornment position="start">
                                                <Icon name="category" className="text-[18px] text-on-surface-variant" />
                                            </InputAdornment>
                                            {params.InputProps.startAdornment}
                                        </>
                                    ),
                                }}
                            />
                        )}
                    />

                    <TextField
                        select
                        size="small"
                        value={`${filters.sort}:${filters.direction}`}
                        onChange={(event) => {
                            const [sort, direction] = event.target.value.split(":") as [ItemSort, "asc" | "desc"];
                            go({ sort, direction }, { toTop: true });
                        }}
                        sx={{ flex: "0 1 200px", minWidth: 170 }}
                        slotProps={{
                            htmlInput: { "aria-label": "Sort items" },
                            input: {
                                startAdornment: (
                                    <InputAdornment position="start">
                                        <Icon name="sort" className="text-[18px] text-on-surface-variant" />
                                    </InputAdornment>
                                ),
                            },
                        }}
                    >
                        {SORT_OPTIONS.map((option) => (
                            <MenuItem key={`${option.sort}:${option.direction}`} value={`${option.sort}:${option.direction}`}>
                                {option.label}
                            </MenuItem>
                        ))}
                        {/* A header click can land on a pair the menu doesn't list. */}
                        {SORT_OPTIONS.some((o) => o.sort === filters.sort && o.direction === filters.direction) ? null : (
                            <MenuItem value={`${filters.sort}:${filters.direction}`} sx={{ display: "none" }}>
                                Custom
                            </MenuItem>
                        )}
                    </TextField>

                    <Chip
                        icon={<Icon name="add_a_photo" className="text-[18px]" />}
                        label={`Needs photos · ${number.format(count("needs_photos"))}`}
                        onClick={() => go({ needs_photos: !filters.needs_photos }, { toTop: true })}
                        color={filters.needs_photos ? "warning" : "default"}
                        variant={filters.needs_photos ? "filled" : "outlined"}
                        sx={{ height: 40, borderRadius: "10px", fontWeight: 600, "& .MuiChip-icon": { color: "inherit", ml: 1 } }}
                    />

                    {isDesktop ? (
                        <ToggleButtonGroup
                            exclusive
                            size="small"
                            value={view}
                            onChange={(_event, next: View | null) => changeView(next)}
                            sx={{ ml: "auto", "& .MuiToggleButton-root": { px: 1.25, borderRadius: "10px" } }}
                        >
                            <ToggleButton value="table" aria-label="Table view">
                                <Tooltip title="Table">
                                    <span className="flex">
                                        <Icon name="table_rows" />
                                    </span>
                                </Tooltip>
                            </ToggleButton>
                            <ToggleButton value="grid" aria-label="Grid view">
                                <Tooltip title="Grid">
                                    <span className="flex">
                                        <Icon name="grid_view" />
                                    </span>
                                </Tooltip>
                            </ToggleButton>
                        </ToggleButtonGroup>
                    ) : null}
                </Box>
            </Paper>

            {/* ── Result summary / bulk actions ──────────────────────── */}
            <Box
                className={selected.size > 0 ? "border border-primary-container bg-primary-container text-on-primary-container" : ""}
                sx={{
                    display: "flex",
                    alignItems: "center",
                    flexWrap: "wrap",
                    gap: 1,
                    minHeight: 44,
                    px: selected.size > 0 ? 1.5 : 0.5,
                    py: 0.5,
                    mb: 1.5,
                    borderRadius: "12px",
                    transition: "background-color .15s ease",
                }}
            >
                {selected.size > 0 ? (
                    <>
                        <Checkbox
                            size="small"
                            checked={allOnPage}
                            indeterminate={!allOnPage}
                            onChange={toggleAll}
                            slotProps={{ input: { "aria-label": "Select all on this page" } }}
                            sx={{ p: 0.5, color: "inherit", "&.Mui-checked, &.MuiCheckbox-indeterminate": { color: "inherit" } }}
                        />
                        <Typography sx={{ fontSize: 14, fontWeight: 700 }}>{selected.size} selected</Typography>
                        <Box sx={{ flex: 1 }} />
                        <Button
                            size="small"
                            variant="contained"
                            onClick={(event) => setBulkMenu(event.currentTarget)}
                            startIcon={<Icon name="published_with_changes" className="text-[18px]" />}
                            endIcon={<Icon name="expand_more" className="text-[18px]" />}
                        >
                            Set status
                        </Button>
                        <Button size="small" color="inherit" onClick={() => setSelected(new Set())}>
                            Clear
                        </Button>
                    </>
                ) : (
                    <>
                        <Typography sx={{ fontSize: 13, color: "text.secondary", fontVariantNumeric: "tabular-nums" }}>
                            {items.total > 0 ? (
                                <>
                                    Showing <b>{number.format(items.from ?? 0)}</b>–<b>{number.format(items.to ?? 0)}</b> of{" "}
                                    <b>{number.format(items.total)}</b> {items.total === 1 ? "item" : "items"}
                                </>
                            ) : (
                                "No items"
                            )}
                        </Typography>
                        {filters.q ? (
                            <Chip size="small" label={`“${filters.q}”`} onDelete={() => { setSearch(""); go({ q: "" }); }} />
                        ) : null}
                        {category ? <Chip size="small" label={category.name} onDelete={() => go({ category: null })} /> : null}
                        {hasFilters ? (
                            <Button size="small" onClick={clearAll} sx={{ ml: "auto" }} startIcon={<Icon name="filter_alt_off" className="text-[18px]" />}>
                                Clear filters
                            </Button>
                        ) : null}
                    </>
                )}
            </Box>

            {/* ── Results ─────────────────────────────────────────────── */}
            {shownView === "table" ? (
                <Paper variant="outlined" sx={{ borderRadius: "16px", overflow: "hidden", position: "relative" }}>
                    {loading ? <LinearProgress sx={{ position: "absolute", inset: "0 0 auto 0", height: 2, zIndex: 3 }} /> : null}

                    {rows.length === 0 ? (
                        empty
                    ) : (
                        <TableContainer ref={tableRef} sx={{ maxHeight: "calc(100vh - 330px)", minHeight: 320 }}>
                            <Table stickyHeader size="small" sx={{ opacity: loading ? 0.6 : 1, transition: "opacity .15s ease" }}>
                                <TableHead>
                                    <TableRow>
                                        <TableCell padding="checkbox" sx={headCellSx}>
                                            <Checkbox
                                                size="small"
                                                checked={allOnPage}
                                                indeterminate={selected.size > 0 && !allOnPage}
                                                onChange={toggleAll}
                                                slotProps={{ input: { "aria-label": "Select all on this page" } }}
                                            />
                                        </TableCell>
                                        <TableCell sx={headCellSx}>{sortLabel("name", "Item")}</TableCell>
                                        <TableCell sx={headCellSx}>Status</TableCell>
                                        <TableCell sx={headCellSx}>{sortLabel("live", "Live variants")}</TableCell>
                                        <TableCell sx={headCellSx} align="right">
                                            {sortLabel("variants", "Variants", "right")}
                                        </TableCell>
                                        <TableCell sx={headCellSx} align="right">
                                            Stores
                                        </TableCell>
                                        <TableCell sx={headCellSx}>{sortLabel("updated", "Updated")}</TableCell>
                                        <TableCell sx={{ ...headCellSx, width: 48 }} />
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {rows.map((item) => {
                                        const isSelected = selected.has(item.id);

                                        return (
                                            <TableRow
                                                key={item.id}
                                                hover
                                                selected={isSelected}
                                                onClick={() => router.visit(route("admin.items.show", item.id))}
                                                sx={{
                                                    cursor: "pointer",
                                                    "& td": { borderBottomColor: "divider", py: 1.25 },
                                                    "&:last-child td": { borderBottom: 0 },
                                                    "& .row-actions": { opacity: { md: 0 } },
                                                    "&:hover .row-actions, & .row-actions[aria-expanded='true']": { opacity: 1 },
                                                }}
                                            >
                                                <TableCell padding="checkbox" onClick={(event) => event.stopPropagation()}>
                                                    <Checkbox
                                                        size="small"
                                                        checked={isSelected}
                                                        onChange={() => toggle(item.id)}
                                                        slotProps={{ input: { "aria-label": `Select ${item.product_name}` } }}
                                                    />
                                                </TableCell>

                                                <TableCell sx={{ minWidth: 300 }}>
                                                    <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
                                                        <Box sx={{ width: 76, flexShrink: 0, display: "flex" }}>
                                                            <ItemThumbs images={item.images} />
                                                        </Box>
                                                        <Box sx={{ minWidth: 0 }}>
                                                            <Typography
                                                                component={Link}
                                                                href={route("admin.items.show", item.id)}
                                                                onClick={(event: React.MouseEvent) => event.stopPropagation()}
                                                                noWrap
                                                                sx={{
                                                                    display: "block",
                                                                    maxWidth: 360,
                                                                    fontSize: 14,
                                                                    fontWeight: 600,
                                                                    color: "text.primary",
                                                                    textDecoration: "none",
                                                                    "&:hover": { color: "primary.main", textDecoration: "underline" },
                                                                }}
                                                            >
                                                                {item.product_name}
                                                            </Typography>
                                                            <Typography noWrap sx={{ fontSize: 12, color: "text.secondary" }}>
                                                                {item.category ?? "Uncategorised"}
                                                                <Box component="span" sx={{ mx: 0.75, opacity: 0.5 }}>
                                                                    ·
                                                                </Box>
                                                                <Box component="span" sx={{ fontVariantNumeric: "tabular-nums" }}>
                                                                    #{item.id}
                                                                </Box>
                                                            </Typography>
                                                        </Box>
                                                    </Box>
                                                </TableCell>

                                                <TableCell>
                                                    <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
                                                        <StatusPill status={item.status} size="sm" />
                                                        {item.is_incomplete ? <NeedsPhotos /> : null}
                                                    </Box>
                                                </TableCell>

                                                <TableCell>
                                                    <VariantMeter live={item.live_variants_count} total={item.variants_count} />
                                                </TableCell>

                                                <TableCell align="right" sx={{ fontVariantNumeric: "tabular-nums", fontSize: 14 }}>
                                                    {number.format(item.variants_count)}
                                                </TableCell>

                                                <TableCell align="right">
                                                    {item.stores_count > 0 ? (
                                                        <Box sx={{ display: "inline-flex", alignItems: "center", gap: 0.5, fontSize: 14, fontVariantNumeric: "tabular-nums" }}>
                                                            <Icon name="storefront" className="text-[16px] text-on-surface-variant" />
                                                            {item.stores_count}
                                                        </Box>
                                                    ) : (
                                                        <Typography component="span" sx={{ fontSize: 12, color: "text.disabled" }}>
                                                            Not listed
                                                        </Typography>
                                                    )}
                                                </TableCell>

                                                <TableCell sx={{ whiteSpace: "nowrap" }}>
                                                    <Tooltip title={fullDate(item.updated_at)}>
                                                        <Typography component="span" sx={{ fontSize: 13, color: "text.secondary" }}>
                                                            {timeAgo(item.updated_at)}
                                                        </Typography>
                                                    </Tooltip>
                                                </TableCell>

                                                <TableCell align="right" onClick={(event) => event.stopPropagation()}>
                                                    <IconButton
                                                        className="row-actions"
                                                        size="small"
                                                        aria-label={`Actions for ${item.product_name}`}
                                                        aria-haspopup="menu"
                                                        aria-expanded={rowMenu?.item.id === item.id}
                                                        onClick={(event) => setRowMenu({ anchor: event.currentTarget, item })}
                                                        sx={{ color: "text.secondary", transition: "opacity .15s ease" }}
                                                    >
                                                        <Icon name="more_vert" />
                                                    </IconButton>
                                                </TableCell>
                                            </TableRow>
                                        );
                                    })}
                                </TableBody>
                            </Table>
                        </TableContainer>
                    )}

                    {rows.length > 0 ? pagination : null}
                </Paper>
            ) : (
                <Box sx={{ position: "relative" }}>
                    {loading ? <LinearProgress sx={{ position: "absolute", inset: "-8px 0 auto 0", height: 2, borderRadius: 999 }} /> : null}

                    {rows.length === 0 ? (
                        <Paper variant="outlined" sx={{ borderRadius: "16px" }}>
                            {empty}
                        </Paper>
                    ) : (
                        <>
                            <Box
                                sx={{
                                    display: "grid",
                                    gap: { xs: 1.5, md: 2 },
                                    gridTemplateColumns: {
                                        xs: "repeat(2, minmax(0, 1fr))",
                                        sm: "repeat(auto-fill, minmax(200px, 1fr))",
                                        lg: "repeat(auto-fill, minmax(220px, 1fr))",
                                    },
                                    opacity: loading ? 0.6 : 1,
                                    transition: "opacity .15s ease",
                                }}
                            >
                                {rows.map((item) => (
                                    <ItemCard key={item.id} item={item} selected={selected.has(item.id)} onToggle={() => toggle(item.id)} />
                                ))}
                            </Box>
                            <Paper variant="outlined" sx={{ borderRadius: "16px", mt: 2, overflow: "hidden", "& .MuiTablePagination-root": { borderTop: 0 } }}>
                                {pagination}
                            </Paper>
                        </>
                    )}
                </Box>
            )}

            {/* ── Menus ───────────────────────────────────────────────── */}
            <Menu
                anchorEl={rowMenu?.anchor}
                open={rowMenu !== null}
                onClose={() => setRowMenu(null)}
                anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
                transformOrigin={{ vertical: "top", horizontal: "right" }}
                slotProps={{ paper: { sx: { minWidth: 220, borderRadius: "12px" } } }}
            >
                {rowMenu ? [
                    <MenuItem key="view" component={Link} href={route("admin.items.show", rowMenu.item.id)}>
                        <ListItemIcon>
                            <Icon name="visibility" />
                        </ListItemIcon>
                        <ListItemText>Open</ListItemText>
                    </MenuItem>,
                    <MenuItem key="edit" component={Link} href={route("admin.items.edit", rowMenu.item.id)}>
                        <ListItemIcon>
                            <Icon name="edit" />
                        </ListItemIcon>
                        <ListItemText>Edit</ListItemText>
                    </MenuItem>,
                    <Divider key="divider" />,
                    <ListSubheader key="status" sx={{ lineHeight: "32px", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                        Set status
                    </ListSubheader>,
                    ...STATUS_OPTIONS.map((option) => (
                        <MenuItem
                            key={option.value}
                            selected={rowMenu.item.status === option.value}
                            disabled={rowMenu.item.status === option.value}
                            onClick={() => setStatus([rowMenu.item.id], option.value)}
                        >
                            <ListItemIcon>
                                <Icon name={option.icon} />
                            </ListItemIcon>
                            <ListItemText primary={option.label} />
                        </MenuItem>
                    )),
                ] : null}
            </Menu>

            <Menu
                anchorEl={bulkMenu}
                open={bulkMenu !== null}
                onClose={() => setBulkMenu(null)}
                anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
                transformOrigin={{ vertical: "top", horizontal: "right" }}
                slotProps={{ paper: { sx: { minWidth: 240, borderRadius: "12px" } } }}
            >
                {STATUS_OPTIONS.map((option) => (
                    <MenuItem key={option.value} onClick={() => setStatus([...selected], option.value)}>
                        <ListItemIcon>
                            <Icon name={option.icon} />
                        </ListItemIcon>
                        <ListItemText
                            primary={option.label}
                            secondary={option.hint}
                            slotProps={{ secondary: { sx: { fontSize: 12 } } }}
                        />
                    </MenuItem>
                ))}
            </Menu>
        </Box>
    );
}

ItemIndex.layout = (page: React.ReactNode) => <AdminLayout>{page}</AdminLayout>;
