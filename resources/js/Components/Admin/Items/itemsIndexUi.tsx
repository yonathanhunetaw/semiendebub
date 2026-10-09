import { StatusPill } from "@/Components/Shared/ui";
import type { ItemRow, ItemSort, ItemStatus } from "@/types/adminItems";
import { Link } from "@inertiajs/react";
import {
    Avatar,
    AvatarGroup,
    Box,
    Card,
    CardActionArea,
    Checkbox,
    LinearProgress,
    Tooltip,
    Typography,
} from "@mui/material";
import React from "react";

/**
 * Pieces of the admin item list (Pages/Admin/Items/Index): thumbnails, the
 * live-variant meter, the grid card and the option lists both views share.
 */

/** A Material Symbols glyph, sized by `className` (e.g. `text-[18px]`). */
export function Icon({ name, className = "text-[20px]" }: { name: string; className?: string }): React.ReactElement {
    return (
        <span aria-hidden className={`material-symbols-outlined leading-none ${className}`}>
            {name}
        </span>
    );
}

export const STATUS_OPTIONS: ReadonlyArray<{ value: ItemStatus; label: string; icon: string; hint: string }> = [
    { value: "active", label: "Active", icon: "check_circle", hint: "Sellers can list it" },
    { value: "draft", label: "Draft", icon: "edit_note", hint: "Still being set up" },
    { value: "inactive", label: "Inactive", icon: "pause_circle", hint: "Hidden from sellers" },
    { value: "archived", label: "Archived", icon: "inventory", hint: "Kept for history" },
];

export const SORT_OPTIONS: ReadonlyArray<{ sort: ItemSort; direction: "asc" | "desc"; label: string }> = [
    { sort: "name", direction: "asc", label: "Name, A to Z" },
    { sort: "name", direction: "desc", label: "Name, Z to A" },
    { sort: "updated", direction: "desc", label: "Recently updated" },
    { sort: "created", direction: "desc", label: "Newest first" },
    { sort: "created", direction: "asc", label: "Oldest first" },
    { sort: "variants", direction: "desc", label: "Most variants" },
    { sort: "live", direction: "desc", label: "Most live variants" },
];

/** Names read A-Z; dates and counts read biggest first (ItemIndexRequest). */
export const defaultDirection = (sort: ItemSort): "asc" | "desc" => (sort === "name" ? "asc" : "desc");

const relative = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });

const STEPS: ReadonlyArray<[Intl.RelativeTimeFormatUnit, number]> = [
    ["year", 31_536_000],
    ["month", 2_592_000],
    ["week", 604_800],
    ["day", 86_400],
    ["hour", 3_600],
    ["minute", 60],
];

/** "3 days ago", "yesterday", "just now". */
export function timeAgo(iso: string | null): string {
    if (!iso) return "—";
    const seconds = (new Date(iso).getTime() - Date.now()) / 1000;
    for (const [unit, size] of STEPS) {
        if (Math.abs(seconds) >= size) return relative.format(Math.round(seconds / size), unit);
    }
    return "just now";
}

export const fullDate = (iso: string | null): string => (iso ? new Date(iso).toLocaleString() : "");

/** Overlapping photo stack; a faded glyph when the item has none. */
export function ItemThumbs({ images, size = 40 }: { images: string[]; size?: number }): React.ReactElement {
    const tile = {
        width: size,
        height: size,
        borderRadius: "10px",
        bgcolor: "rgb(var(--surface-container))",
        color: "text.secondary",
    } as const;

    if (images.length === 0) {
        return (
            <Avatar variant="rounded" sx={{ ...tile, border: "1px dashed", borderColor: "divider" }}>
                <Icon name="image" className="text-[18px] text-on-surface-variant/50" />
            </Avatar>
        );
    }

    return (
        <AvatarGroup
            max={3}
            spacing={size * 0.55}
            sx={{
                justifyContent: "flex-end",
                "& .MuiAvatar-root": {
                    ...tile,
                    fontSize: 11,
                    fontWeight: 700,
                    border: "2px solid",
                    borderColor: "background.paper",
                },
            }}
        >
            {images.map((src) => (
                <Avatar key={src} variant="rounded" src={src} alt="" slotProps={{ img: { loading: "lazy" } }} />
            ))}
        </AvatarGroup>
    );
}

/** "12 / 20 live" with a thin bar: how much of the variant set is selling. */
export function VariantMeter({ live, total, width = 112 }: { live: number; total: number; width?: number }): React.ReactElement {
    const share = total > 0 ? Math.round((live / total) * 100) : 0;

    return (
        <Tooltip title={total > 0 ? `${live} of ${total} variants are active and listed in a store` : "No variants generated yet"}>
            <Box sx={{ width }}>
                <Box sx={{ display: "flex", alignItems: "baseline", gap: 0.5, mb: 0.5 }}>
                    <Typography component="span" sx={{ fontSize: 13, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
                        {live}
                    </Typography>
                    <Typography component="span" sx={{ fontSize: 12, color: "text.secondary", fontVariantNumeric: "tabular-nums" }}>
                        / {total} live
                    </Typography>
                </Box>
                <LinearProgress
                    variant="determinate"
                    value={share}
                    color={share === 100 ? "success" : "primary"}
                    sx={{ height: 4, borderRadius: 999, bgcolor: "rgb(var(--surface-container-high))" }}
                />
            </Box>
        </Tooltip>
    );
}

/** The amber "needs photos" hint; never blocks anything (see ItemController::applyStatus). */
export function NeedsPhotos(): React.ReactElement {
    return (
        <Tooltip title="Some variants have fewer than two photos and no packaging illustration">
            <span>
                <StatusPill tone="warning" icon="add_a_photo" label="Photos" size="xs" />
            </span>
        </Tooltip>
    );
}

interface ItemCardProps {
    item: ItemRow;
    selected: boolean;
    onToggle: () => void;
}

/** One item in the grid view (and the only view on phones). */
export function ItemCard({ item, selected, onToggle }: ItemCardProps): React.ReactElement {
    const cover = item.images[0];

    return (
        <Card
            sx={{
                position: "relative",
                borderRadius: "16px",
                height: "100%",
                display: "flex",
                flexDirection: "column",
                transition: "box-shadow .15s ease, border-color .15s ease",
                borderColor: selected ? "primary.main" : "divider",
                boxShadow: selected ? "0 0 0 1px rgb(var(--primary))" : "none",
                "&:hover": { boxShadow: 3 },
                "&:hover .item-card-check, & .item-card-check.Mui-checked": { opacity: 1 },
            }}
        >
            <CardActionArea
                component={Link}
                href={route("admin.items.show", item.id)}
                sx={{ flexGrow: 1, display: "flex", flexDirection: "column", alignItems: "stretch" }}
            >
                <Box
                    sx={{
                        aspectRatio: "4 / 3",
                        bgcolor: "rgb(var(--surface-container-low))",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        overflow: "hidden",
                        borderBottom: "1px solid",
                        borderColor: "divider",
                    }}
                >
                    {cover ? (
                        <Box
                            component="img"
                            src={cover}
                            alt=""
                            loading="lazy"
                            sx={{ width: "100%", height: "100%", objectFit: "cover" }}
                        />
                    ) : (
                        <Icon name="image" className="text-[36px] text-on-surface-variant/30" />
                    )}
                </Box>

                <Box sx={{ p: 1.5, display: "flex", flexDirection: "column", gap: 1, flexGrow: 1 }}>
                    <Box sx={{ minWidth: 0 }}>
                        <Typography
                            sx={{
                                fontSize: 14,
                                fontWeight: 700,
                                lineHeight: 1.3,
                                display: "-webkit-box",
                                WebkitLineClamp: 2,
                                WebkitBoxOrient: "vertical",
                                overflow: "hidden",
                            }}
                        >
                            {item.product_name}
                        </Typography>
                        <Typography noWrap sx={{ fontSize: 12, color: "text.secondary", mt: 0.25 }}>
                            {item.category ?? "Uncategorised"} · #{item.id}
                        </Typography>
                    </Box>

                    <Box sx={{ mt: "auto", display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 1 }}>
                        <VariantMeter live={item.live_variants_count} total={item.variants_count} width={96} />
                        <Tooltip title={`Listed in ${item.stores_count} ${item.stores_count === 1 ? "store" : "stores"}`}>
                            <Box sx={{ display: "flex", alignItems: "center", gap: 0.25, color: "text.secondary", fontSize: 12 }}>
                                <Icon name="storefront" className="text-[16px]" />
                                {item.stores_count}
                            </Box>
                        </Tooltip>
                    </Box>
                </Box>
            </CardActionArea>

            {/* Overlays sit outside the action area so they don't open the item. */}
            <Box sx={{ position: "absolute", top: 8, left: 8, right: 8, display: "flex", justifyContent: "space-between", pointerEvents: "none" }}>
                <Checkbox
                    className="item-card-check"
                    checked={selected}
                    onChange={onToggle}
                    size="small"
                    slotProps={{ input: { "aria-label": `Select ${item.product_name}` } }}
                    sx={{
                        pointerEvents: "auto",
                        p: 0.5,
                        bgcolor: "background.paper",
                        borderRadius: "8px",
                        boxShadow: 1,
                        opacity: { xs: 1, md: 0 },
                        transition: "opacity .15s ease",
                        "&:hover": { bgcolor: "background.paper" },
                    }}
                />
                <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, pointerEvents: "auto" }}>
                    {item.is_incomplete ? <NeedsPhotos /> : null}
                    <StatusPill status={item.status} size="sm" className="shadow-sm" />
                </Box>
            </Box>

        </Card>
    );
}
