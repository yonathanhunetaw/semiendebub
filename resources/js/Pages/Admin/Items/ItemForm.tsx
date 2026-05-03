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
    Switch,
    TextField,
    Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import CloudUploadIcon from "@mui/icons-material/CloudUpload";
import DeleteIcon from "@mui/icons-material/Delete";
import { useState } from "react";

type Option = {
    id: number | string;
    name?: string;
    category_name?: string;
};

type PackagingRow = {
    item_packaging_type_id: number | string;
    quantity: number;
};

type VariantRecord = {
    id: number;
    status: string;
    item_color_id?: number | null;
    item_size_id?: number | null;
    item_packaging_type?: { id: number; name: string } | null;
    item_color?: { id: number; name: string } | null;
    item_size?: { id: number; name: string } | null;
    store_variants?: Array<{
        id: number;
        active: boolean;
        computed_status?: string;
        store?: { id: number; name: string } | null;
    }>;
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
    packaging_types_count?: number;
    packaging_types_count_value?: number;
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

const inputStyle = {
    "& .MuiInputLabel-root": { color: "text.secondary" },
    "& .MuiOutlinedInput-root": {
        "& fieldset": { borderColor: "divider" },
        "&:hover fieldset": { borderColor: "primary.main" },
        "&.Mui-focused fieldset": { borderColor: "primary.main" },
    },
};

const totalImageCount = (existingImages: string[], images: File[]) => existingImages.length + images.length;

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

export default function ItemForm({ mode, item, categories, colors, sizes, packagingTypes }: Props) {
    const [categoryOptions, setCategoryOptions] = useState<Option[]>(categories);
    const [colorOptions, setColorOptions] = useState<Option[]>(colors);
    const [sizeOptions, setSizeOptions] = useState<Option[]>(sizes);
    const [packagingOptions, setPackagingOptions] = useState<Option[]>(packagingTypes);
    const [activeCreator, setActiveCreator] = useState<string | null>(null);
    const [tempValue, setTempValue] = useState("");
    const [inlineError, setInlineError] = useState<string | null>(null);
    const [imageLimitError, setImageLimitError] = useState<string | null>(null);

    const packagingSource = item?.packagingTypes ?? item?.packaging_types ?? [];

    const initialPackaging = packagingSource.length
        ? packagingSource.map((pack) => ({
            item_packaging_type_id: pack.id,
            quantity: Number(pack.pivot?.quantity ?? 1),
        }))
        : [{ item_packaging_type_id: "", quantity: 1 }];

    const { data, setData, post, patch, processing, errors } = useForm({
        product_name: item?.product_name ?? "",
        product_description: item?.product_description ?? "",
        packaging_details: item?.packaging_details ?? "",
        item_category_id: item?.item_category_id ?? "",
        color_ids: (item?.colors ?? []).map((color) => color.id),
        size_ids: (item?.sizes ?? []).map((size) => size.id),
        packaging: initialPackaging as PackagingRow[],
        existing_images: item?.general_images ?? [],
        images: [] as File[],
        status: item?.status ?? "active",
    });

    const canAddImages = (nextFileCount: number) => {
        const nextCount = totalImageCount(data.existing_images, [...data.images, ...new Array(nextFileCount)]);
        if (nextCount > 10) {
            setImageLimitError("You can upload a maximum of 10 images per item.");
            return false;
        }

        setImageLimitError(null);
        return true;
    };

    const handleImageFiles = (files: FileList | null) => {
        const nextFiles = Array.from(files ?? []);
        if (!nextFiles.length) return;
        if (!canAddImages(nextFiles.length)) return;
        setData("images", [...data.images, ...nextFiles]);
    };

    const removeExistingImage = (image: string) => {
        setData("existing_images", data.existing_images.filter((value) => value !== image));
        setImageLimitError(null);
    };

    const removeNewImage = (index: number) => {
        setData("images", data.images.filter((_, fileIndex) => fileIndex !== index));
        setImageLimitError(null);
    };

    const appendCreatedOption = (
        field: "category" | "color" | "size" | "packaging",
        option: Option,
        index?: number,
    ) => {
        if (field === "category") {
            setCategoryOptions((current) => [...current, option]);
            setData("item_category_id", option.id);
            return;
        }

        if (field === "color") {
            setColorOptions((current) => [...current, option]);
            setData("color_ids", [...data.color_ids, option.id]);
            return;
        }

        if (field === "size") {
            setSizeOptions((current) => [...current, option]);
            setData("size_ids", [...data.size_ids, option.id]);
            return;
        }

        setPackagingOptions((current) => [...current, option]);
        if (typeof index === "number") {
            const nextPackaging = [...data.packaging];
            nextPackaging[index] = {
                ...nextPackaging[index],
                item_packaging_type_id: option.id,
            };
            setData("packaging", nextPackaging);
        }
    };

    const handleInlineSave = async (field: "category" | "color" | "size" | "packaging", index?: number) => {
        const name = tempValue.trim();
        if (!name) return;

        setInlineError(null);

        try {
            const response = await axios.post(route("admin.items.inline-options"), {
                type: field,
                name,
            });

            appendCreatedOption(field, response.data, index);
            setTempValue("");
            setActiveCreator(null);
        } catch (error: any) {
            setInlineError(error?.response?.data?.message || `Unable to create ${field} right now.`);
        }
    };

    const handleSubmit = (event: React.FormEvent) => {
        event.preventDefault();

        if (totalImageCount(data.existing_images, data.images) > 10) {
            setImageLimitError("You can upload a maximum of 10 images per item.");
            return;
        }

        const targetRoute = mode === "create"
            ? route("admin.items.store")
            : route("admin.items.update", item?.id);

        if (mode === "create") {
            post(targetRoute, { forceFormData: true });
            return;
        }

        patch(targetRoute, { forceFormData: true });
    };

    const InlineCreator = ({ field, label, index }: { field: "category" | "color" | "size" | "packaging"; label: string; index?: number }) => {
        const uniqueId = typeof index === "number" ? `${field}-${index}` : field;

        return (
            <Box sx={{ mt: 1 }}>
                {activeCreator !== uniqueId ? (
                    <Button
                        size="small"
                        startIcon={<AddIcon />}
                        sx={{ color: "primary.main", textTransform: "none" }}
                        onClick={() => {
                            setInlineError(null);
                            setActiveCreator(uniqueId);
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
                            onChange={(event) => setTempValue(event.target.value)}
                            sx={inputStyle}
                        />
                        <Button variant="contained" onClick={() => void handleInlineSave(field, index)}>
                            Save
                        </Button>
                        <Button onClick={() => setActiveCreator(null)}>Cancel</Button>
                    </Stack>
                )}
            </Box>
        );
    };

    return (
        <Box sx={{ p: 3, minHeight: "100vh", bgcolor: "background.default", color: "text.primary" }}>
            <Typography variant="h5" fontWeight={700} mb={3}>
                {mode === "create" ? "Register New Item" : "Edit Item"}
            </Typography>

            <Paper sx={{ p: 4, bgcolor: "background.paper", backgroundImage: "none", border: "1px solid", borderColor: "divider" }}>
                <Box component="form" onSubmit={handleSubmit}>
                    <Stack spacing={4}>
                        {inlineError && <Alert severity="error">{inlineError}</Alert>}
                        {imageLimitError && <Alert severity="error">{imageLimitError}</Alert>}

                        <Stack direction={{ xs: "column", lg: "row" }} spacing={4} alignItems="flex-start">
                            <Stack spacing={3} sx={{ flex: 1, width: "100%" }}>
                                <TextField
                                    fullWidth
                                    label="Product Name"
                                    value={data.product_name}
                                    onChange={(event) => setData("product_name", event.target.value)}
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
                                    onChange={(event) => setData("product_description", event.target.value)}
                                    error={Boolean(errors.product_description)}
                                    helperText={errors.product_description}
                                    sx={inputStyle}
                                />

                                <Box>
                                    <Autocomplete
                                        fullWidth
                                        freeSolo
                                        options={categoryOptions}
                                        getOptionLabel={(option) => categoryLabel(option as Option | string)}
                                        value={categoryOptions.find((category) => category.id === data.item_category_id) || (data.item_category_id ? String(data.item_category_id) : null)}
                                        onChange={(_, value) => {
                                            if (typeof value === "string") {
                                                setData("item_category_id", value);
                                                return;
                                            }

                                            setData("item_category_id", value?.id || "");
                                        }}
                                        renderInput={(params) => (
                                            <TextField
                                                {...params}
                                                label="Category"
                                                error={Boolean(errors.item_category_id)}
                                                helperText={errors.item_category_id}
                                                sx={inputStyle}
                                            />
                                        )}
                                    />
                                    <InlineCreator field="category" label="Category" />
                                </Box>

                                <Box>
                                    <Autocomplete
                                        multiple
                                        fullWidth
                                        freeSolo
                                        options={colorOptions}
                                        getOptionLabel={(option) => optionLabel(option as Option | string)}
                                        value={data.color_ids.map((id) => colorOptions.find((option) => option.id === id) || String(id))}
                                        onChange={(_, value) => {
                                            setData("color_ids", value.map((entry) => typeof entry === "string" ? entry : String(entry.id ?? "")));
                                        }}
                                        renderInput={(params) => <TextField {...params} label="Colors" sx={inputStyle} />}
                                        renderTags={(value, getTagProps) => value.map((entry, index) => (
                                            <Chip {...getTagProps({ index })} key={`${optionLabel(entry as Option | string)}-${index}`} size="small" label={optionLabel(entry as Option | string)} />
                                        ))}
                                    />
                                    <FormHelperText>
                                        {data.color_ids.length ? "Selected colors will generate color-based variants." : "No Color selected. A single 'No Color' variant will be generated."}
                                    </FormHelperText>
                                    <InlineCreator field="color" label="Color" />
                                </Box>

                                <Box>
                                    <Autocomplete
                                        multiple
                                        fullWidth
                                        freeSolo
                                        options={sizeOptions}
                                        getOptionLabel={(option) => optionLabel(option as Option | string)}
                                        value={data.size_ids.map((id) => sizeOptions.find((option) => option.id === id) || String(id))}
                                        onChange={(_, value) => {
                                            setData("size_ids", value.map((entry) => typeof entry === "string" ? entry : String(entry.id ?? "")));
                                        }}
                                        renderInput={(params) => <TextField {...params} label="Sizes" sx={inputStyle} />}
                                        renderTags={(value, getTagProps) => value.map((entry, index) => (
                                            <Chip {...getTagProps({ index })} key={`${optionLabel(entry as Option | string)}-${index}`} size="small" label={optionLabel(entry as Option | string)} />
                                        ))}
                                    />
                                    <FormHelperText>
                                        {data.size_ids.length ? "Selected sizes will generate size-based variants." : "No Size selected. A single 'No Size' variant will be generated."}
                                    </FormHelperText>
                                    <InlineCreator field="size" label="Size" />
                                </Box>
                            </Stack>

                            <Stack spacing={3} sx={{ flex: 1, width: "100%" }}>
                                <TextField
                                    fullWidth
                                    multiline
                                    minRows={2}
                                    label="Packaging Details"
                                    value={data.packaging_details}
                                    onChange={(event) => setData("packaging_details", event.target.value)}
                                    error={Boolean(errors.packaging_details)}
                                    helperText={errors.packaging_details}
                                    sx={inputStyle}
                                />

                                <TextField
                                    select
                                    fullWidth
                                    label="Status"
                                    value={data.status}
                                    onChange={(event) => setData("status", event.target.value)}
                                    error={Boolean(errors.status)}
                                    helperText={errors.status || "Use active, inactive, draft, or archived."}
                                    sx={inputStyle}
                                >
                                    <MenuItem value="active">Active</MenuItem>
                                    <MenuItem value="inactive">Inactive</MenuItem>
                                    <MenuItem value="draft">Draft</MenuItem>
                                    <MenuItem value="archived">Archived</MenuItem>
                                </TextField>

                                <Box>
                                    <Typography variant="subtitle2" fontWeight={700} color="text.secondary" mb={1}>
                                        Packaging Levels
                                    </Typography>
                                    {data.packaging.map((row, index) => (
                                        <Box key={`packaging-${index}`} sx={{ p: 2, border: "1px solid", borderColor: "divider", borderRadius: 2, bgcolor: "background.default", mb: 2 }}>
                                            <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
                                                <Autocomplete
                                                    fullWidth
                                                    freeSolo
                                                    options={packagingOptions}
                                                    getOptionLabel={(option) => optionLabel(option as Option | string)}
                                                    value={packagingOptions.find((option) => option.id === row.item_packaging_type_id) || (row.item_packaging_type_id ? String(row.item_packaging_type_id) : null)}
                                                    onChange={(_, value) => {
                                                        const nextPackaging = [...data.packaging];
                                                        nextPackaging[index] = {
                                                            ...nextPackaging[index],
                                                            item_packaging_type_id: typeof value === "string" ? value : value?.id || "",
                                                        };
                                                        setData("packaging", nextPackaging);
                                                    }}
                                                    renderInput={(params) => <TextField {...params} label="Type" size="small" sx={inputStyle} />}
                                                />
                                                <TextField
                                                    size="small"
                                                    type="number"
                                                    label="Qty"
                                                    value={row.quantity}
                                                    sx={{ ...inputStyle, width: { xs: "100%", sm: 96 } }}
                                                    onChange={(event) => {
                                                        const nextPackaging = [...data.packaging];
                                                        nextPackaging[index] = {
                                                            ...nextPackaging[index],
                                                            quantity: Math.max(1, Number(event.target.value) || 1),
                                                        };
                                                        setData("packaging", nextPackaging);
                                                    }}
                                                />
                                                <IconButton
                                                    color="error"
                                                    disabled={data.packaging.length === 1}
                                                    onClick={() => setData("packaging", data.packaging.filter((_, rowIndex) => rowIndex !== index))}
                                                >
                                                    <DeleteIcon />
                                                </IconButton>
                                            </Stack>
                                            <InlineCreator field="packaging" label="Packaging Type" index={index} />
                                        </Box>
                                    ))}

                                    <Button
                                        startIcon={<AddIcon />}
                                        sx={{ color: "primary.main", textTransform: "none" }}
                                        onClick={() => setData("packaging", [...data.packaging, { item_packaging_type_id: "", quantity: 1 }])}
                                    >
                                        Add Level
                                    </Button>
                                </Box>
                            </Stack>
                        </Stack>

                        <Divider />

                        <Box>
                            <Typography variant="subtitle2" fontWeight={700} color="text.secondary" mb={1}>
                                Item Images
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
                                <input hidden multiple accept="image/*" type="file" onChange={(event) => handleImageFiles(event.target.files)} />
                                <CloudUploadIcon sx={{ fontSize: 36, color: "text.secondary", mb: 1 }} />
                                <Typography variant="body2" color="text.secondary">
                                    Click to upload images
                                </Typography>
                                <Typography variant="caption" color="text.secondary">
                                    {totalImageCount(data.existing_images, data.images)} / 10 images selected
                                </Typography>
                            </Box>

                            <Stack direction="row" flexWrap="wrap" gap={2} mt={2}>
                                {data.existing_images.map((image) => (
                                    <Card key={image} sx={{ width: 160, bgcolor: "background.default", border: "1px solid", borderColor: "divider" }}>
                                        <Box component="img" src={image.startsWith("http") ? image : `/storage/${image}`} alt="Existing item" sx={{ width: "100%", height: 120, objectFit: "cover" }} />
                                        <CardContent sx={{ p: 1.5 }}>
                                            <Button color="error" size="small" onClick={() => removeExistingImage(image)}>
                                                Remove
                                            </Button>
                                        </CardContent>
                                    </Card>
                                ))}

                                {data.images.map((image, index) => (
                                    <Card key={`${image.name}-${index}`} sx={{ width: 160, bgcolor: "background.default", border: "1px solid", borderColor: "divider" }}>
                                        <Box component="img" src={URL.createObjectURL(image)} alt={image.name} sx={{ width: "100%", height: 120, objectFit: "cover" }} />
                                        <CardContent sx={{ p: 1.5 }}>
                                            <Typography variant="caption" display="block" noWrap>
                                                {image.name}
                                            </Typography>
                                            <Button color="error" size="small" onClick={() => removeNewImage(index)}>
                                                Remove
                                            </Button>
                                        </CardContent>
                                    </Card>
                                ))}
                            </Stack>
                            {errors.images && <FormHelperText error>{errors.images}</FormHelperText>}
                        </Box>

                        {mode === "edit" && item?.variants?.length ? (
                            <>
                                <Divider />
                                <Box>
                                    <Typography variant="h6" fontWeight={700} mb={2}>
                                        Variants
                                    </Typography>

                                    <Stack spacing={2}>
                                        {item.variants.map((variant) => {
                                            const isActive = variant.status === "active";

                                            return (
                                                <Paper key={variant.id} sx={{ p: 2, bgcolor: "background.default", border: "1px solid", borderColor: "divider" }}>
                                                    <Stack direction={{ xs: "column", md: "row" }} justifyContent="space-between" spacing={2}>
                                                        <Box>
                                                            <Typography variant="subtitle1" fontWeight={700}>
                                                                {(variant.item_color?.name || "No Color")} / {(variant.item_size?.name || "No Size")}
                                                            </Typography>
                                                            <Typography variant="body2" color="text.secondary">
                                                                Variant #{variant.id} · {variant.item_packaging_type?.name || "No Packaging"} · {variant.status}
                                                            </Typography>
                                                            <Stack direction="row" flexWrap="wrap" gap={1} mt={1}>
                                                                {(variant.store_variants ?? []).map((storeVariant) => (
                                                                    <Chip
                                                                        key={storeVariant.id}
                                                                        size="small"
                                                                        label={`${storeVariant.store?.name || "Store"}: ${storeVariant.active ? "Active" : "Inactive"}`}
                                                                        color={storeVariant.active ? "success" : "default"}
                                                                        variant={storeVariant.active ? "filled" : "outlined"}
                                                                    />
                                                                ))}
                                                            </Stack>
                                                        </Box>

                                                        <Stack direction={{ xs: "column", sm: "row" }} spacing={1} alignItems={{ xs: "stretch", sm: "center" }}>
                                                            <Stack direction="row" spacing={1} alignItems="center">
                                                                <Typography variant="body2">Inactive</Typography>
                                                                <Switch
                                                                    checked={isActive}
                                                                    onChange={(_, checked) => {
                                                                        router.patch(route("admin.items.variants.status", [item.id, variant.id]), { active: checked }, { preserveScroll: true });
                                                                    }}
                                                                />
                                                                <Typography variant="body2">Active</Typography>
                                                            </Stack>
                                                            <Button
                                                                color="error"
                                                                variant="outlined"
                                                                onClick={() => {
                                                                    router.delete(route("admin.items.variants.destroy", [item.id, variant.id]), { preserveScroll: true });
                                                                }}
                                                            >
                                                                Delete Variant
                                                            </Button>
                                                        </Stack>
                                                    </Stack>
                                                </Paper>
                                            );
                                        })}
                                    </Stack>
                                </Box>
                            </>
                        ) : null}

                        {Object.keys(errors).length > 0 && (
                            <Alert severity="error">
                                Please fix the highlighted fields before saving this item.
                            </Alert>
                        )}

                        <Box display="flex" justifyContent="flex-end">
                            <Button type="submit" variant="contained" disabled={processing} sx={{ px: 5 }}>
                                {mode === "create" ? "Save Item" : "Update Item"}
                            </Button>
                        </Box>
                    </Stack>
                </Box>
            </Paper>
        </Box>
    );
}
