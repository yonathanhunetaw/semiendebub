import { router, useForm } from "@inertiajs/react";
import axios from "axios";
import {
    Alert,
    Autocomplete,
    Box,
    Button,
    Card,
    CardContent,
    Chip,
    Divider,
    FormHelperText,
    IconButton,
    MenuItem,
    Paper,
    Stack,
    TextField,
    Tooltip,
    Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import AddPhotoAlternateIcon from "@mui/icons-material/AddPhotoAlternate";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import ClearIcon from "@mui/icons-material/Clear";
import CloudUploadIcon from "@mui/icons-material/CloudUpload";
import DeleteIcon from "@mui/icons-material/Delete";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline";
import { useMemo, useRef, useState } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

type Option = {
    id: number | string;
    name?: string;
    category_name?: string;
};

type PackagingRow = {
    item_packaging_type_id: number | string;
    quantity: number;
};

/** One slot in a variant's 5-image strip */
type ImageSlot =
    | { kind: "existing"; url: string; path: string } // already on server
    | { kind: "new"; file: File; preview: string } // freshly picked
    | { kind: "empty" }; // placeholder

/** A derived combination row shown in the matrix */
type ComboKey = string; // "colorId:sizeId:packagingId"

type VariantRecord = {
    id: number;
    sku: string | null;
    status: string;
    item_color_id?: number | null;
    item_size_id?: number | null;
    // Update these two lines:
    item_packaging_type_id?: number | null;
    images?: string[] | null;
    // Keep these for the labels
    item_packaging_type?: { id: number; name: string } | null;
    item_color?: { id: number; name: string } | null;
    item_size?: { id: number; name: string } | null;
};

type ItemPayload = {
    id: number;
    product_name?: string;
    product_description?: string;
    packaging_details?: string;
    item_category_id?: number | string | null;
    status?: string;
    general_images?: string[] | null;
    category?: Option | null;
    colors?: Option[];
    sizes?: Option[];
    packaging_types?: Array<Option & { pivot?: { quantity?: number } }>;
    packagingTypes?: Array<Option & { pivot?: { quantity?: number } }>;
    variants?: VariantRecord[];
};

type Props = {
    mode: "create" | "edit";
    item?: ItemPayload;
    categories: Option[];
    colors: Option[];
    sizes: Option[];
    packagingTypes: Option[];
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const IMAGES_PER_VARIANT = 5;
const MIN_PROOF_IMAGES = 2;

const inputStyle = {
    "& .MuiInputLabel-root": { color: "text.secondary" },
    "& .MuiOutlinedInput-root": {
        "& fieldset": { borderColor: "divider" },
        "&:hover fieldset": { borderColor: "primary.main" },
        "&.Mui-focused fieldset": { borderColor: "primary.main" },
    },
};

const categoryLabel = (option: Option | string | null) => {
    if (typeof option === "string") return option;
    if (!option) return "";
    return option.category_name || option.name || String(option.id);
};

const optionLabel = (option: Option | string | null) => {
    if (typeof option === "string") return option;
    if (!option) return "";
    return option.name || option.category_name || String(option.id);
};

const comboKey = (colorId: string, sizeId: string, packId: string) =>
    `${colorId}:${sizeId}:${packId}`;

const slotCount = (slots: ImageSlot[]) =>
    slots.filter((s) => s.kind !== "empty").length;

// ─── Component ────────────────────────────────────────────────────────────────

export default function ItemForm({
    mode,
    item,
    categories,
    colors,
    sizes,
    packagingTypes,
}: Props) {
    // ── Lookup option lists ──────────────────────────────────────────────────
    const [categoryOptions, setCategoryOptions] =
        useState<Option[]>(categories);
    const [colorOptions, setColorOptions] = useState<Option[]>(colors);
    const [sizeOptions, setSizeOptions] = useState<Option[]>(sizes);
    const [packagingOptions, setPackagingOptions] =
        useState<Option[]>(packagingTypes);

    const [activeCreator, setActiveCreator] = useState<string | null>(null);
    const [tempValue, setTempValue] = useState("");
    const [inlineError, setInlineError] = useState<string | null>(null);
    const [imageLimitError, setImageLimitError] = useState<string | null>(null);

    // ── Main form data ───────────────────────────────────────────────────────
    const packagingSource = item?.packagingTypes ?? item?.packaging_types ?? [];
    const initialPackaging: PackagingRow[] = packagingSource.length
        ? packagingSource.map((p) => ({
              item_packaging_type_id: p.id,
              quantity: Number(p.pivot?.quantity ?? 1),
          }))
        : [{ item_packaging_type_id: "", quantity: 1 }];

    const { data, setData, post, patch, processing, errors } = useForm({
        product_name: item?.product_name ?? "",
        product_description: item?.product_description ?? "",
        packaging_details: item?.packaging_details ?? "",
        item_category_id: item?.item_category_id ?? "",
        color_ids: (item?.colors ?? []).map((c) => c.id),
        size_ids: (item?.sizes ?? []).map((s) => s.id),
        packaging: initialPackaging,
        existing_images: item?.general_images ?? [],
        images: [] as File[],
        status: item?.status ?? "draft",
    });

    // ── Per-variant image matrix ─────────────────────────────────────────────
    // Map of comboKey → 5 ImageSlots
    const [variantSlots, setVariantSlots] = useState<
        Record<ComboKey, ImageSlot[]>
    >(() => {
        if (!item?.variants?.length) return {};
        const map: Record<ComboKey, ImageSlot[]> = {};

        for (const v of item.variants) {
            const key = comboKey(
                String(v.item_color_id ?? "null"),
                String(v.item_size_id ?? "null"),
                String(v.item_packaging_type_id ?? "null"), // Matches migration and new Type
            );

            // Parse the JSON images column from the variant
            // Laravel usually casts JSON to an array automatically
            // This will now work without TypeScript errors
            const existingImages = Array.isArray(v.images) ? v.images : [];

            // Create the 5-slot array
            const slots: ImageSlot[] = Array(IMAGES_PER_VARIANT).fill({
                kind: "empty",
            });

            // Fill existing slots
            // Inside your variantSlots initialization loop:
            existingImages.forEach((path: string, index: number) => {
                if (index < IMAGES_PER_VARIANT) {
                    // 1. The Regex "Power Washer"
                    const cleanPath = path.replace(
                        /^(\/)?storage(\/)+|^\//,
                        "",
                    );

                    // 2. Debug Logs - Open your browser console (F12) to see these
                    console.log(`--- Image Slot ${index} ---`);
                    console.log("Raw path from DB:", path);
                    console.log("Cleaned path:", cleanPath);
                    console.log("Final URL assigned:", `/storage/${cleanPath}`);

                    slots[index] = {
                        kind: "existing",
                        url: path.startsWith("http")
                            ? path
                            : `/storage/${cleanPath}`,
                        path: path,
                    };
                }
            });

            map[key] = slots;
        }
        return map;
    });

    // ── Derived combination matrix ───────────────────────────────────────────
    const combinations = useMemo(() => {
        const resolvedColors = data.color_ids.length
            ? data.color_ids.map((id) => {
                  const opt = colorOptions.find(
                      (o) => String(o.id) === String(id),
                  );
                  return { id: String(id), label: opt?.name ?? String(id) };
              })
            : [{ id: "null", label: "—" }];

        const resolvedSizes = data.size_ids.length
            ? data.size_ids.map((id) => {
                  const opt = sizeOptions.find(
                      (o) => String(o.id) === String(id),
                  );
                  return { id: String(id), label: opt?.name ?? String(id) };
              })
            : [{ id: "null", label: "—" }];

        const resolvedPackaging = data.packaging
            .filter((row) => row.item_packaging_type_id !== "")
            .map((row) => {
                const opt = packagingOptions.find(
                    (o) => String(o.id) === String(row.item_packaging_type_id),
                );
                return {
                    id: String(row.item_packaging_type_id),
                    label: opt?.name ?? String(row.item_packaging_type_id),
                };
            });

        const packs = resolvedPackaging.length
            ? resolvedPackaging
            : [{ id: "null", label: "—" }];

        const combos: {
            key: ComboKey;
            color: string;
            size: string;
            pack: string;
        }[] = [];
        for (const c of resolvedColors) {
            for (const s of resolvedSizes) {
                for (const p of packs) {
                    combos.push({
                        key: comboKey(c.id, s.id, p.id),
                        color: c.label,
                        size: s.label,
                        pack: p.label,
                    });
                }
            }
        }
        return combos;
    }, [
        data.color_ids,
        data.size_ids,
        data.packaging,
        colorOptions,
        sizeOptions,
        packagingOptions,
    ]);

    // Sync slot map when combinations change (add new keys, keep old data)
    useMemo(() => {
        setVariantSlots((prev) => {
            const next = { ...prev };
            for (const combo of combinations) {
                if (!next[combo.key]) {
                    next[combo.key] = Array(IMAGES_PER_VARIANT).fill({
                        kind: "empty",
                    } as ImageSlot);
                }
            }
            return next;
        });
    }, [combinations]);

    // ── Proof gate: every combo must have ≥2 images ──────────────────────────
    const proofComplete = useMemo(() => {
        return combinations.every((combo) => {
            const slots = variantSlots[combo.key] ?? [];
            return slotCount(slots) >= MIN_PROOF_IMAGES;
        });
    }, [combinations, variantSlots]);

    // ── Slot mutations ───────────────────────────────────────────────────────
    const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

    const setSlot = (key: ComboKey, slotIndex: number, slot: ImageSlot) => {
        setVariantSlots((prev) => {
            const slots = [
                ...(prev[key] ??
                    Array(IMAGES_PER_VARIANT).fill({ kind: "empty" })),
            ];
            slots[slotIndex] = slot;
            return { ...prev, [key]: slots };
        });
    };

    const clearSlot = (key: ComboKey, slotIndex: number) => {
        setSlot(key, slotIndex, { kind: "empty" });
    };

    const handleVariantFileChange = (
        key: ComboKey,
        slotIndex: number,
        files: FileList | null,
    ) => {
        if (!files?.length) return;
        const file = files[0];
        const preview = URL.createObjectURL(file);
        setSlot(key, slotIndex, { kind: "new", file, preview });
    };

    // ── General image helpers ────────────────────────────────────────────────
    const totalGeneralImages = data.existing_images.length + data.images.length;

    const handleGeneralImageFiles = (files: FileList | null) => {
        const next = Array.from(files ?? []);
        if (!next.length) return;
        if (totalGeneralImages + next.length > 10) {
            setImageLimitError(
                "You can upload a maximum of 10 general images per item.",
            );
            return;
        }
        setImageLimitError(null);
        setData("images", [...data.images, ...next]);
    };

    const removeExistingImage = (img: string) => {
        setData(
            "existing_images",
            data.existing_images.filter((v) => v !== img),
        );
        setImageLimitError(null);
    };

    const removeNewImage = (index: number) => {
        setData(
            "images",
            data.images.filter((_, i) => i !== index),
        );
        setImageLimitError(null);
    };

    // ── Inline option creator ────────────────────────────────────────────────
    const appendCreatedOption = (
        field: "category" | "color" | "size" | "packaging",
        option: Option,
        index?: number,
    ) => {
        if (field === "category") {
            setCategoryOptions((c) => [...c, option]);
            setData("item_category_id", option.id);
            return;
        }
        if (field === "color") {
            setColorOptions((c) => [...c, option]);
            setData("color_ids", [...data.color_ids, option.id]);
            return;
        }
        if (field === "size") {
            setSizeOptions((c) => [...c, option]);
            setData("size_ids", [...data.size_ids, option.id]);
            return;
        }
        setPackagingOptions((c) => [...c, option]);
        if (typeof index === "number") {
            const next = [...data.packaging];
            next[index] = { ...next[index], item_packaging_type_id: option.id };
            setData("packaging", next);
        }
    };

    const handleInlineSave = async (
        field: "category" | "color" | "size" | "packaging",
        index?: number,
    ) => {
        const name = tempValue.trim();
        if (!name) return;
        setInlineError(null);
        try {
            const res = await axios.post(route("admin.items.inline-options"), {
                type: field,
                name,
            });
            appendCreatedOption(field, res.data, index);
            setTempValue("");
            setActiveCreator(null);
        } catch (err: any) {
            setInlineError(
                err?.response?.data?.message || `Unable to create ${field}.`,
            );
        }
    };

    const InlineCreator = ({
        field,
        label,
        index,
    }: {
        field: "category" | "color" | "size" | "packaging";
        label: string;
        index?: number;
    }) => {
        const uid = typeof index === "number" ? `${field}-${index}` : field;
        return (
            <Box sx={{ mt: 1 }}>
                {activeCreator !== uid ? (
                    <Button
                        size="small"
                        startIcon={<AddIcon />}
                        sx={{ color: "primary.main", textTransform: "none" }}
                        onClick={() => {
                            setInlineError(null);
                            setActiveCreator(uid);
                        }}
                    >
                        Create New {label}
                    </Button>
                ) : (
                    <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
                        <TextField
                            size="small"
                            fullWidth
                            autoFocus
                            placeholder={`New ${label}`}
                            value={tempValue}
                            onChange={(e) => setTempValue(e.target.value)}
                            sx={inputStyle}
                        />
                        <Button
                            variant="contained"
                            onClick={() => void handleInlineSave(field, index)}
                        >
                            Save
                        </Button>
                        <Button onClick={() => setActiveCreator(null)}>
                            Cancel
                        </Button>
                    </Stack>
                )}
            </Box>
        );
    };

    // ── Submit ───────────────────────────────────────────────────────────────
    const handleSubmit = (event: React.FormEvent) => {
        event.preventDefault();

        // Build a FormData manually so we can append variant image files
        const fd = new FormData();

        fd.append("product_name", data.product_name);
        fd.append("product_description", data.product_description);
        fd.append("packaging_details", data.packaging_details);
        fd.append("item_category_id", String(data.item_category_id));
        // Status: force draft if proof is incomplete
        fd.append("status", proofComplete ? data.status : "draft");

        data.color_ids.forEach((id) => fd.append("color_ids[]", String(id)));
        data.size_ids.forEach((id) => fd.append("size_ids[]", String(id)));
        data.packaging.forEach((row, i) => {
            fd.append(
                `packaging[${i}][item_packaging_type_id]`,
                String(row.item_packaging_type_id),
            );
            fd.append(`packaging[${i}][quantity]`, String(row.quantity));
        });
        data.existing_images.forEach((img) =>
            fd.append("existing_images[]", img),
        );
        data.images.forEach((file) => fd.append("images[]", file));

        // Variant images keyed by comboKey and slot index
        for (const [key, slots] of Object.entries(variantSlots)) {
            slots.forEach((slot, slotIndex) => {
                if (slot.kind === "new") {
                    fd.append(
                        `variant_images[${key}][${slotIndex}]`,
                        slot.file,
                    );
                } else if (slot.kind === "existing") {
                    fd.append(
                        `variant_existing_images[${key}][${slotIndex}]`,
                        slot.path,
                    );
                }
            });
        }

        const targetRoute =
            mode === "create"
                ? route("admin.items.store")
                : route("admin.items.update", item?.id);

        router.post(targetRoute, fd as any, {
            forceFormData: true,
            ...(mode === "edit"
                ? {
                      method: "post",
                      headers: { "X-HTTP-Method-Override": "PATCH" },
                  }
                : {}),
        });
    };

    // ── Render ───────────────────────────────────────────────────────────────
    return (
        <Box
            sx={{
                p: 3,
                minHeight: "100vh",
                bgcolor: "background.default",
                color: "text.primary",
            }}
        >
            <Typography variant="h5" fontWeight={700} mb={3}>
                {mode === "create" ? "Register New Item" : "Edit Item"}
            </Typography>

            {/* Draft banner */}
            {!proofComplete && combinations.length > 0 && (
                <Alert severity="warning" sx={{ mb: 3 }}>
                    This item is locked to <strong>Draft</strong> until every
                    variant has at least {MIN_PROOF_IMAGES} images uploaded.
                </Alert>
            )}

            <Paper
                sx={{
                    p: 4,
                    bgcolor: "background.paper",
                    backgroundImage: "none",
                    border: "1px solid",
                    borderColor: "divider",
                }}
            >
                <Box component="form" onSubmit={handleSubmit}>
                    <Stack spacing={4}>
                        {inlineError && (
                            <Alert severity="error">{inlineError}</Alert>
                        )}
                        {imageLimitError && (
                            <Alert severity="error">{imageLimitError}</Alert>
                        )}

                        {/* ── Row 1: Name / Description / Category / Colors / Sizes ── */}
                        <Stack
                            direction={{ xs: "column", lg: "row" }}
                            spacing={4}
                            alignItems="flex-start"
                        >
                            <Stack spacing={3} sx={{ flex: 1, width: "100%" }}>
                                <TextField
                                    fullWidth
                                    label="Product Name"
                                    value={data.product_name}
                                    onChange={(e) =>
                                        setData("product_name", e.target.value)
                                    }
                                    error={Boolean(errors.product_name)}
                                    helperText={errors.product_name}
                                    sx={inputStyle}
                                />

                                <TextField
                                    fullWidth
                                    multiline
                                    minRows={3}
                                    label="Product Description"
                                    value={data.product_description}
                                    onChange={(e) =>
                                        setData(
                                            "product_description",
                                            e.target.value,
                                        )
                                    }
                                    error={Boolean(errors.product_description)}
                                    helperText={errors.product_description}
                                    sx={inputStyle}
                                />

                                <Box>
                                    <Autocomplete
                                        fullWidth
                                        freeSolo
                                        options={categoryOptions}
                                        getOptionLabel={(o) =>
                                            categoryLabel(o as Option | string)
                                        }
                                        value={
                                            categoryOptions.find(
                                                (c) =>
                                                    c.id ===
                                                    data.item_category_id,
                                            ) ||
                                            (data.item_category_id
                                                ? String(data.item_category_id)
                                                : null)
                                        }
                                        onChange={(_, v) =>
                                            setData(
                                                "item_category_id",
                                                typeof v === "string"
                                                    ? v
                                                    : v?.id || "",
                                            )
                                        }
                                        renderInput={(params) => (
                                            <TextField
                                                {...params}
                                                label="Category"
                                                error={Boolean(
                                                    errors.item_category_id,
                                                )}
                                                helperText={
                                                    errors.item_category_id
                                                }
                                                sx={inputStyle}
                                            />
                                        )}
                                    />
                                    <InlineCreator
                                        field="category"
                                        label="Category"
                                    />
                                </Box>

                                <Box>
                                    <Autocomplete
                                        multiple
                                        fullWidth
                                        freeSolo
                                        options={colorOptions}
                                        getOptionLabel={(o) =>
                                            optionLabel(o as Option | string)
                                        }
                                        value={data.color_ids.map(
                                            (id) =>
                                                colorOptions.find(
                                                    (o) => o.id === id,
                                                ) || String(id),
                                        )}
                                        onChange={(_, v) =>
                                            setData(
                                                "color_ids",
                                                v.map((e) =>
                                                    typeof e === "string"
                                                        ? e
                                                        : String(e.id ?? ""),
                                                ),
                                            )
                                        }
                                        renderInput={(params) => (
                                            <TextField
                                                {...params}
                                                label="Colors"
                                                sx={inputStyle}
                                            />
                                        )}
                                        renderTags={(v, gtp) =>
                                            v.map((e, i) => (
                                                <Chip
                                                    {...gtp({ index: i })}
                                                    key={i}
                                                    size="small"
                                                    label={optionLabel(
                                                        e as Option | string,
                                                    )}
                                                />
                                            ))
                                        }
                                    />
                                    <FormHelperText>
                                        {data.color_ids.length
                                            ? "Each color generates variant rows below."
                                            : "No Color → one 'No Color' variant."}
                                    </FormHelperText>
                                    <InlineCreator
                                        field="color"
                                        label="Color"
                                    />
                                </Box>

                                <Box>
                                    <Autocomplete
                                        multiple
                                        fullWidth
                                        freeSolo
                                        options={sizeOptions}
                                        getOptionLabel={(o) =>
                                            optionLabel(o as Option | string)
                                        }
                                        value={data.size_ids.map(
                                            (id) =>
                                                sizeOptions.find(
                                                    (o) => o.id === id,
                                                ) || String(id),
                                        )}
                                        onChange={(_, v) =>
                                            setData(
                                                "size_ids",
                                                v.map((e) =>
                                                    typeof e === "string"
                                                        ? e
                                                        : String(e.id ?? ""),
                                                ),
                                            )
                                        }
                                        renderInput={(params) => (
                                            <TextField
                                                {...params}
                                                label="Sizes"
                                                sx={inputStyle}
                                            />
                                        )}
                                        renderTags={(v, gtp) =>
                                            v.map((e, i) => (
                                                <Chip
                                                    {...gtp({ index: i })}
                                                    key={i}
                                                    size="small"
                                                    label={optionLabel(
                                                        e as Option | string,
                                                    )}
                                                />
                                            ))
                                        }
                                    />
                                    <FormHelperText>
                                        {data.size_ids.length
                                            ? "Each size generates variant rows below."
                                            : "No Size → one 'No Size' variant."}
                                    </FormHelperText>
                                    <InlineCreator field="size" label="Size" />
                                </Box>
                            </Stack>

                            {/* ── Right column: packaging / status ── */}
                            <Stack spacing={3} sx={{ flex: 1, width: "100%" }}>
                                <TextField
                                    fullWidth
                                    multiline
                                    minRows={2}
                                    label="Packaging Details"
                                    value={data.packaging_details}
                                    onChange={(e) =>
                                        setData(
                                            "packaging_details",
                                            e.target.value,
                                        )
                                    }
                                    error={Boolean(errors.packaging_details)}
                                    helperText={errors.packaging_details}
                                    sx={inputStyle}
                                />

                                <TextField
                                    select
                                    fullWidth
                                    label="Status"
                                    value={
                                        proofComplete ? data.status : "draft"
                                    }
                                    onChange={(e) =>
                                        setData("status", e.target.value)
                                    }
                                    error={Boolean(errors.status)}
                                    helperText={
                                        !proofComplete
                                            ? "Forced to Draft until all variants have ≥2 images."
                                            : errors.status ||
                                              "Use active, inactive, draft, or archived."
                                    }
                                    disabled={!proofComplete}
                                    sx={inputStyle}
                                >
                                    <MenuItem value="active">Active</MenuItem>
                                    <MenuItem value="inactive">
                                        Inactive
                                    </MenuItem>
                                    <MenuItem value="draft">Draft</MenuItem>
                                    <MenuItem value="archived">
                                        Archived
                                    </MenuItem>
                                </TextField>

                                <Box>
                                    <Typography
                                        variant="subtitle2"
                                        fontWeight={700}
                                        color="text.secondary"
                                        mb={1}
                                    >
                                        Packaging Levels
                                    </Typography>
                                    {data.packaging.map((row, index) => (
                                        <Box
                                            key={`pkg-${index}`}
                                            sx={{
                                                p: 2,
                                                border: "1px solid",
                                                borderColor: "divider",
                                                borderRadius: 2,
                                                bgcolor: "background.default",
                                                mb: 2,
                                            }}
                                        >
                                            <Stack
                                                direction={{
                                                    xs: "column",
                                                    sm: "row",
                                                }}
                                                spacing={1}
                                            >
                                                <Autocomplete
                                                    fullWidth
                                                    freeSolo
                                                    options={packagingOptions}
                                                    getOptionLabel={(o) =>
                                                        optionLabel(
                                                            o as
                                                                | Option
                                                                | string,
                                                        )
                                                    }
                                                    value={
                                                        packagingOptions.find(
                                                            (o) =>
                                                                o.id ===
                                                                row.item_packaging_type_id,
                                                        ) ||
                                                        (row.item_packaging_type_id
                                                            ? String(
                                                                  row.item_packaging_type_id,
                                                              )
                                                            : null)
                                                    }
                                                    onChange={(_, v) => {
                                                        const next = [
                                                            ...data.packaging,
                                                        ];
                                                        next[index] = {
                                                            ...next[index],
                                                            item_packaging_type_id:
                                                                typeof v ===
                                                                "string"
                                                                    ? v
                                                                    : v?.id ||
                                                                      "",
                                                        };
                                                        setData(
                                                            "packaging",
                                                            next,
                                                        );
                                                    }}
                                                    renderInput={(params) => (
                                                        <TextField
                                                            {...params}
                                                            label="Type"
                                                            size="small"
                                                            sx={inputStyle}
                                                        />
                                                    )}
                                                />
                                                <TextField
                                                    size="small"
                                                    type="number"
                                                    label="Qty"
                                                    value={row.quantity}
                                                    sx={{
                                                        ...inputStyle,
                                                        width: {
                                                            xs: "100%",
                                                            sm: 96,
                                                        },
                                                    }}
                                                    onChange={(e) => {
                                                        const next = [
                                                            ...data.packaging,
                                                        ];
                                                        next[index] = {
                                                            ...next[index],
                                                            quantity: Math.max(
                                                                1,
                                                                Number(
                                                                    e.target
                                                                        .value,
                                                                ) || 1,
                                                            ),
                                                        };
                                                        setData(
                                                            "packaging",
                                                            next,
                                                        );
                                                    }}
                                                />
                                                <IconButton
                                                    color="error"
                                                    disabled={
                                                        data.packaging
                                                            .length === 1
                                                    }
                                                    onClick={() =>
                                                        setData(
                                                            "packaging",
                                                            data.packaging.filter(
                                                                (_, i) =>
                                                                    i !== index,
                                                            ),
                                                        )
                                                    }
                                                >
                                                    <DeleteIcon />
                                                </IconButton>
                                            </Stack>
                                            <InlineCreator
                                                field="packaging"
                                                label="Packaging Type"
                                                index={index}
                                            />
                                        </Box>
                                    ))}
                                    <Button
                                        startIcon={<AddIcon />}
                                        sx={{
                                            color: "primary.main",
                                            textTransform: "none",
                                        }}
                                        onClick={() =>
                                            setData("packaging", [
                                                ...data.packaging,
                                                {
                                                    item_packaging_type_id: "",
                                                    quantity: 1,
                                                },
                                            ])
                                        }
                                    >
                                        Add Level
                                    </Button>
                                </Box>
                            </Stack>
                        </Stack>

                        <Divider />

                        {/* ── General item images ── */}
                        <Box>
                            <Typography
                                variant="subtitle2"
                                fontWeight={700}
                                color="text.secondary"
                                mb={1}
                            >
                                General Item Images (up to 10)
                            </Typography>
                            <Box
                                component="label"
                                sx={{
                                    display: "block",
                                    p: 3,
                                    borderRadius: 2,
                                    border: "2px dashed",
                                    borderColor: "divider",
                                    textAlign: "center",
                                    cursor: "pointer",
                                    "&:hover": { borderColor: "primary.main" },
                                }}
                            >
                                <input
                                    hidden
                                    multiple
                                    accept="image/*"
                                    type="file"
                                    onChange={(e) =>
                                        handleGeneralImageFiles(e.target.files)
                                    }
                                />
                                <CloudUploadIcon
                                    sx={{
                                        fontSize: 36,
                                        color: "text.secondary",
                                        mb: 1,
                                    }}
                                />
                                <Typography
                                    variant="body2"
                                    color="text.secondary"
                                >
                                    Click to upload general images
                                </Typography>
                                <Typography
                                    variant="caption"
                                    color="text.secondary"
                                >
                                    {totalGeneralImages} / 10 images
                                </Typography>
                            </Box>

                            <Stack
                                direction="row"
                                flexWrap="wrap"
                                gap={2}
                                mt={2}
                            >
                                {data.existing_images.map((img) => (
                                    <Card
                                        key={img}
                                        sx={{
                                            width: 160,
                                            bgcolor: "background.default",
                                            border: "1px solid",
                                            borderColor: "divider",
                                        }}
                                    >
                                        <Box
                                            component="img"
                                            src={
                                                img.startsWith("http")
                                                    ? img
                                                    : `/storage/${img}`
                                            }
                                            alt=""
                                            sx={{
                                                width: "100%",
                                                height: 120,
                                                objectFit: "cover",
                                            }}
                                        />
                                        <CardContent sx={{ p: 1.5 }}>
                                            <Button
                                                color="error"
                                                size="small"
                                                onClick={() =>
                                                    removeExistingImage(img)
                                                }
                                            >
                                                Remove
                                            </Button>
                                        </CardContent>
                                    </Card>
                                ))}
                                {data.images.map((img, i) => (
                                    <Card
                                        key={`${img.name}-${i}`}
                                        sx={{
                                            width: 160,
                                            bgcolor: "background.default",
                                            border: "1px solid",
                                            borderColor: "divider",
                                        }}
                                    >
                                        <Box
                                            component="img"
                                            src={URL.createObjectURL(img)}
                                            alt=""
                                            sx={{
                                                width: "100%",
                                                height: 120,
                                                objectFit: "cover",
                                            }}
                                        />
                                        <CardContent sx={{ p: 1.5 }}>
                                            <Typography
                                                variant="caption"
                                                display="block"
                                                noWrap
                                            >
                                                {img.name}
                                            </Typography>
                                            <Button
                                                color="error"
                                                size="small"
                                                onClick={() =>
                                                    removeNewImage(i)
                                                }
                                            >
                                                Remove
                                            </Button>
                                        </CardContent>
                                    </Card>
                                ))}
                            </Stack>
                            {errors.images && (
                                <FormHelperText error>
                                    {errors.images}
                                </FormHelperText>
                            )}
                        </Box>

                        <Divider />

                        {/* ── Variant image matrix ── */}
                        {combinations.length > 0 && (
                            <Box>
                                <Stack
                                    direction="row"
                                    alignItems="center"
                                    spacing={1}
                                    mb={2}
                                >
                                    <Typography variant="h6" fontWeight={700}>
                                        Variant Images
                                    </Typography>
                                    <Chip
                                        size="small"
                                        label={
                                            proofComplete
                                                ? "All variants have proof"
                                                : `${combinations.filter((c) => slotCount(variantSlots[c.key] ?? []) < MIN_PROOF_IMAGES).length} variant(s) need images`
                                        }
                                        color={
                                            proofComplete
                                                ? "success"
                                                : "warning"
                                        }
                                        icon={
                                            proofComplete ? (
                                                <CheckCircleIcon />
                                            ) : (
                                                <ErrorOutlineIcon />
                                            )
                                        }
                                    />
                                </Stack>
                                <Typography
                                    variant="body2"
                                    color="text.secondary"
                                    mb={3}
                                >
                                    Each variant needs at least{" "}
                                    {MIN_PROOF_IMAGES} images before the item
                                    can leave Draft. Upload up to{" "}
                                    {IMAGES_PER_VARIANT} per variant.
                                </Typography>

                                <Stack spacing={3}>
                                    {combinations.map((combo) => {
                                        const slots: ImageSlot[] =
                                            variantSlots[combo.key] ??
                                            Array(IMAGES_PER_VARIANT).fill({
                                                kind: "empty",
                                            });
                                        const filled = slotCount(slots);
                                        const hasProof =
                                            filled >= MIN_PROOF_IMAGES;

                                        return (
                                            <Paper
                                                key={combo.key}
                                                variant="outlined"
                                                sx={{
                                                    p: 2,
                                                    borderRadius: 2,
                                                    borderColor: hasProof
                                                        ? "success.main"
                                                        : "warning.main",
                                                    borderWidth: 1.5,
                                                }}
                                            >
                                                <Stack
                                                    direction={{
                                                        xs: "column",
                                                        sm: "row",
                                                    }}
                                                    justifyContent="space-between"
                                                    alignItems={{
                                                        sm: "center",
                                                    }}
                                                    mb={1.5}
                                                    spacing={1}
                                                >
                                                    <Box>
                                                        <Typography
                                                            variant="subtitle2"
                                                            fontWeight={700}
                                                        >
                                                            {[
                                                                combo.color !==
                                                                    "—" &&
                                                                    combo.color,
                                                                combo.size !==
                                                                    "—" &&
                                                                    combo.size,
                                                                combo.pack !==
                                                                    "—" &&
                                                                    combo.pack,
                                                            ]
                                                                .filter(Boolean)
                                                                .join(" / ") ||
                                                                "Default Variant"}
                                                        </Typography>
                                                        <Typography
                                                            variant="caption"
                                                            color="text.secondary"
                                                        >
                                                            {filled} /{" "}
                                                            {IMAGES_PER_VARIANT}{" "}
                                                            images ·{" "}
                                                            {hasProof
                                                                ? "✓ Proof complete"
                                                                : `Need ${MIN_PROOF_IMAGES - filled} more`}
                                                        </Typography>
                                                    </Box>
                                                    <Chip
                                                        size="small"
                                                        label={
                                                            hasProof
                                                                ? "Ready"
                                                                : "Draft"
                                                        }
                                                        color={
                                                            hasProof
                                                                ? "success"
                                                                : "warning"
                                                        }
                                                    />
                                                </Stack>

                                                {/* 5 image slots */}
                                                <Stack
                                                    direction="row"
                                                    spacing={1}
                                                    flexWrap="wrap"
                                                    useFlexGap
                                                >
                                                    {slots.map(
                                                        (slot, slotIndex) => {
                                                            const inputId = `vi-${combo.key}-${slotIndex}`;
                                                            return (
                                                                <Box
                                                                    key={
                                                                        slotIndex
                                                                    }
                                                                    sx={{
                                                                        position:
                                                                            "relative",
                                                                    }}
                                                                >
                                                                    {slot.kind !==
                                                                    "empty" ? (
                                                                        // Filled slot
                                                                        <Box
                                                                            sx={{
                                                                                position:
                                                                                    "relative",
                                                                                width: 80,
                                                                                height: 80,
                                                                            }}
                                                                        >
                                                                            <Box
                                                                                component="img"
                                                                                src={
                                                                                    slot.kind ===
                                                                                    "new"
                                                                                        ? slot.preview
                                                                                        : slot.url // Just use the URL we built in the loop
                                                                                }
                                                                                sx={{
                                                                                    width: 80,
                                                                                    height: 80,
                                                                                    objectFit:
                                                                                        "cover",
                                                                                    borderRadius: 1.5,
                                                                                    border: "1px solid",
                                                                                    borderColor:
                                                                                        "divider",
                                                                                }}
                                                                            />
                                                                            <IconButton
                                                                                size="small"
                                                                                onClick={() =>
                                                                                    clearSlot(
                                                                                        combo.key,
                                                                                        slotIndex,
                                                                                    )
                                                                                }
                                                                                sx={{
                                                                                    position:
                                                                                        "absolute",
                                                                                    top: -6,
                                                                                    right: -6,
                                                                                    bgcolor:
                                                                                        "error.main",
                                                                                    color: "#fff",
                                                                                    width: 20,
                                                                                    height: 20,
                                                                                    "&:hover":
                                                                                        {
                                                                                            bgcolor:
                                                                                                "error.dark",
                                                                                        },
                                                                                }}
                                                                            >
                                                                                <ClearIcon
                                                                                    sx={{
                                                                                        fontSize: 12,
                                                                                    }}
                                                                                />
                                                                            </IconButton>
                                                                        </Box>
                                                                    ) : (
                                                                        // Empty slot — click to pick file
                                                                        <Tooltip
                                                                            title={`Upload image ${slotIndex + 1}`}
                                                                        >
                                                                            <Box
                                                                                component="label"
                                                                                htmlFor={
                                                                                    inputId
                                                                                }
                                                                                sx={{
                                                                                    display:
                                                                                        "flex",
                                                                                    flexDirection:
                                                                                        "column",
                                                                                    alignItems:
                                                                                        "center",
                                                                                    justifyContent:
                                                                                        "center",
                                                                                    width: 80,
                                                                                    height: 80,
                                                                                    borderRadius: 1.5,
                                                                                    cursor: "pointer",
                                                                                    border: "2px dashed",
                                                                                    borderColor:
                                                                                        "divider",
                                                                                    bgcolor:
                                                                                        "background.default",
                                                                                    "&:hover":
                                                                                        {
                                                                                            borderColor:
                                                                                                "primary.main",
                                                                                            bgcolor:
                                                                                                "action.hover",
                                                                                        },
                                                                                }}
                                                                            >
                                                                                <AddPhotoAlternateIcon
                                                                                    sx={{
                                                                                        fontSize: 20,
                                                                                        color: "text.disabled",
                                                                                    }}
                                                                                />
                                                                                <Typography
                                                                                    variant="caption"
                                                                                    color="text.disabled"
                                                                                    sx={{
                                                                                        fontSize:
                                                                                            "0.6rem",
                                                                                    }}
                                                                                >
                                                                                    {slotIndex +
                                                                                        1}
                                                                                </Typography>
                                                                            </Box>
                                                                        </Tooltip>
                                                                    )}
                                                                    <input
                                                                        id={
                                                                            inputId
                                                                        }
                                                                        type="file"
                                                                        accept="image/*"
                                                                        hidden
                                                                        ref={(
                                                                            el,
                                                                        ) => {
                                                                            fileInputRefs.current[
                                                                                inputId
                                                                            ] =
                                                                                el;
                                                                        }}
                                                                        onChange={(
                                                                            e,
                                                                        ) =>
                                                                            handleVariantFileChange(
                                                                                combo.key,
                                                                                slotIndex,
                                                                                e
                                                                                    .target
                                                                                    .files,
                                                                            )
                                                                        }
                                                                    />
                                                                </Box>
                                                            );
                                                        },
                                                    )}
                                                </Stack>
                                            </Paper>
                                        );
                                    })}
                                </Stack>
                            </Box>
                        )}

                        {Object.keys(errors).length > 0 && (
                            <Alert severity="error">
                                Please fix the highlighted fields before saving.
                            </Alert>
                        )}

                        <Box display="flex" justifyContent="flex-end" gap={2}>
                            <Typography
                                variant="body2"
                                color="text.secondary"
                                alignSelf="center"
                            >
                                {proofComplete
                                    ? "Item will save with chosen status."
                                    : "Item will be saved as Draft (missing variant images)."}
                            </Typography>
                            <Button
                                type="submit"
                                variant="contained"
                                disabled={processing}
                                sx={{ px: 5 }}
                            >
                                {mode === "create"
                                    ? "Save Item"
                                    : "Update Item"}
                            </Button>
                        </Box>
                    </Stack>
                </Box>
            </Paper>
        </Box>
    );
}
