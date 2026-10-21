import * as React from "react";
import axios from "axios";
import { router } from "@inertiajs/react";
import { Alert, Autocomplete, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, MenuItem, Stack, TextField, Typography } from "@mui/material";
import AddPhotoAlternateOutlined from "@mui/icons-material/AddPhotoAlternateOutlined";
import Close from "@mui/icons-material/Close";

import { useDraft } from "@/hooks/useDraft";

export type CategoryOption = { id: number; path: string };
type Fields = { product_name: string; product_description: string; packaging_details: string; hs_code?: string; item_category_id: number | string | null; status: string };

const STATUSES = [
    { value: "draft", label: "Draft (not for sale yet)" },
    { value: "active", label: "Active" },
    { value: "inactive", label: "Inactive" },
    { value: "archived", label: "Archived" },
];

const RELOAD = ["item", "options", "catalog", "readiness", "stores", "stock", "history", "flash", "errors"];

/** Name, description, category and status, saved on their own; pictures are added and removed at once. */
export default function BasicsPart({
    itemId,
    saved,
    categories,
    pictures = [],
}: {
    /** null while the item does not exist yet (the new-item page): saving creates it. */
    itemId: number | null;
    saved: Fields;
    categories: CategoryOption[];
    pictures?: Array<{ path: string; url: string }>;
}) {
    const draft = useDraft<Fields>(`duka.itemSetup.${itemId ?? "new"}.basics`, saved);
    const [errors, setErrors] = React.useState<Record<string, string>>({});
    const [busy, setBusy] = React.useState(false);
    const [list, setList] = React.useState<CategoryOption[]>(categories);
    const [addOpen, setAddOpen] = React.useState(false);
    const [newName, setNewName] = React.useState("");
    const [newParent, setNewParent] = React.useState<string>("");
    const [confirmDelete, setConfirmDelete] = React.useState(false);
    const fileInput = React.useRef<HTMLInputElement>(null);

    React.useEffect(() => setList(categories), [categories]);

    const category = list.find((c) => c.id === Number(draft.value.item_category_id)) ?? null;
    const set = (patch: Partial<Fields>) => draft.setValue((v) => ({ ...v, ...patch }));

    const save = () => {
        setBusy(true);
        const options = {
            preserveScroll: true,
            preserveState: itemId !== null,
            ...(itemId !== null ? { only: RELOAD } : {}),
            onSuccess: () => {
                draft.clear();
                setErrors({});
            },
            onError: (e: Record<string, string>) => setErrors(e),
            onFinish: () => setBusy(false),
        };
        itemId === null ? router.post(route("admin.items.setup.store"), draft.value, options) : router.put(route("admin.items.setup.basics", itemId), draft.value, options);
    };

    const addCategory = async () => {
        try {
            const { data } = await axios.post<{ id: number }>(route("admin.items.inline-options"), { type: "category", name: newName, parent_id: newParent === "" ? null : Number(newParent) });
            const parent = list.find((c) => c.id === Number(newParent));
            const created = { id: data.id, path: `${parent ? `${parent.path} > ` : ""}${newName.trim()}` };
            setList((l) => [...l.filter((c) => c.id !== created.id), created].sort((a, b) => a.path.localeCompare(b.path)));
            set({ item_category_id: data.id });
            setAddOpen(false);
            setNewName("");
            setNewParent("");
        } catch {
            setErrors({ category: "Could not add that category." });
        }
    };

    const reload = { preserveScroll: true, preserveState: true, only: RELOAD };

    return (
        <Stack spacing={2}>
            {draft.restored && (
                <Alert severity="info" variant="outlined" action={<Button size="small" onClick={draft.discard}>Discard</Button>}>
                    Your unsaved changes were kept from last time.
                </Alert>
            )}
            {Object.values(errors).length > 0 && <Alert severity="error">{Object.values(errors).join(" ")}</Alert>}

            <TextField label="Item name" size="small" required value={draft.value.product_name} onChange={(e) => set({ product_name: e.target.value })} error={Boolean(errors.product_name)} inputProps={{ "aria-label": "Item name" }} />
            <TextField label="Description" size="small" multiline minRows={2} value={draft.value.product_description ?? ""} onChange={(e) => set({ product_description: e.target.value })} inputProps={{ "aria-label": "Description" }} />
            <TextField label="Packaging notes" size="small" value={draft.value.packaging_details ?? ""} onChange={(e) => set({ packaging_details: e.target.value })} helperText="For example: 12 per box, 10 boxes per carton" inputProps={{ "aria-label": "Packaging notes" }} />
            <TextField label="HS code" size="small" value={draft.value.hs_code ?? ""} onChange={(e) => set({ hs_code: e.target.value })} error={Boolean(errors.hs_code)} helperText="Its customs code, for the import tax estimate (Procurement → Tariffs)" inputProps={{ "aria-label": "HS code", inputMode: "numeric" }} />

            <Stack direction="row" spacing={1} sx={{ alignItems: "flex-start" }}>
                <Autocomplete
                    sx={{ flex: 1 }}
                    size="small"
                    options={list}
                    value={category}
                    getOptionLabel={(o) => o.path}
                    onChange={(_, v) => set({ item_category_id: v?.id ?? null })}
                    renderInput={(params) => <TextField {...params} label="Category" required error={Boolean(errors.item_category_id)} inputProps={{ ...params.inputProps, "aria-label": "Category" }} />}
                />
                <Button onClick={() => setAddOpen(true)} sx={{ whiteSpace: "nowrap" }}>New category</Button>
            </Stack>

            <TextField select label="Status" size="small" value={draft.value.status} onChange={(e) => set({ status: e.target.value })}>
                {STATUSES.map((s) => <MenuItem key={s.value} value={s.value}>{s.label}</MenuItem>)}
            </TextField>

            <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                <Button variant="contained" onClick={save} disabled={busy || (itemId !== null && !draft.dirty) || draft.value.product_name.trim() === "" || draft.value.item_category_id === null}>
                    {itemId === null ? "Create item" : "Save basics"}
                </Button>
                {draft.dirty && itemId !== null && <Typography variant="caption" color="warning.main">Unsaved changes (kept if you leave)</Typography>}
            </Stack>

            {itemId !== null && (
                <>
                    <Box>
                        <Typography sx={{ fontWeight: 700, mb: 0.5 }}>Pictures</Typography>
                        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>A picture is saved the moment you add it. Up to 10.</Typography>
                        <input ref={fileInput} type="file" accept="image/*" hidden onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) router.post(route("admin.items.setup.pictures.store", itemId), { image: file }, { forceFormData: true, ...reload });
                            e.target.value = "";
                        }} />
                        <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", rowGap: 1 }}>
                            {pictures.map((p) => (
                                <Box key={p.path} sx={{ position: "relative", width: 84, height: 84, borderRadius: 1.5, overflow: "hidden", border: "1px solid", borderColor: "divider" }}>
                                    <Box component="img" src={p.url} alt="Item picture" sx={{ width: "100%", height: "100%", objectFit: "cover" }} />
                                    <IconButton size="small" aria-label={`Remove picture ${p.path}`} onClick={() => router.delete(route("admin.items.setup.pictures.destroy", itemId), { data: { path: p.path }, ...reload })} sx={{ position: "absolute", top: 0, right: 0, bgcolor: "background.paper", p: 0.25 }}>
                                        <Close sx={{ fontSize: 14 }} />
                                    </IconButton>
                                </Box>
                            ))}
                            {pictures.length < 10 && (
                                <IconButton aria-label="Add a picture" onClick={() => fileInput.current?.click()} sx={{ width: 84, height: 84, borderRadius: 1.5, border: "1px dashed", borderColor: "divider" }}>
                                    <AddPhotoAlternateOutlined />
                                </IconButton>
                            )}
                        </Stack>
                    </Box>

                    <Box>
                        <Button color="error" onClick={() => setConfirmDelete(true)}>Delete this item</Button>
                    </Box>
                </>
            )}

            <Dialog open={addOpen} onClose={() => setAddOpen(false)} fullWidth maxWidth="xs">
                <DialogTitle>New category</DialogTitle>
                <DialogContent>
                    <Stack spacing={1.5} sx={{ pt: 1 }}>
                        <TextField autoFocus label="Category name" size="small" value={newName} onChange={(e) => setNewName(e.target.value)} inputProps={{ "aria-label": "Category name" }} />
                        <TextField select label="Inside (optional)" size="small" value={newParent} onChange={(e) => setNewParent(e.target.value)}>
                            <MenuItem value="">Top level</MenuItem>
                            {list.filter((c) => !c.path.includes(">")).map((c) => <MenuItem key={c.id} value={String(c.id)}>{c.path}</MenuItem>)}
                        </TextField>
                    </Stack>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setAddOpen(false)}>Cancel</Button>
                    <Button variant="contained" onClick={addCategory} disabled={newName.trim() === ""}>Add category</Button>
                </DialogActions>
            </Dialog>

            <Dialog open={confirmDelete} onClose={() => setConfirmDelete(false)}>
                <DialogTitle>Delete this item?</DialogTitle>
                <DialogContent><Typography variant="body2">It disappears from every store and list. Its sales and stock history stay on record.</Typography></DialogContent>
                <DialogActions>
                    <Button onClick={() => setConfirmDelete(false)}>Cancel</Button>
                    <Button color="error" variant="contained" onClick={() => itemId !== null && router.delete(route("admin.items.destroy", itemId))}>Delete item</Button>
                </DialogActions>
            </Dialog>
        </Stack>
    );
}
