import * as React from "react";
import { Head, Link, useForm } from "@inertiajs/react";
import {
    Box,
    Button,
    Card,
    InputAdornment,
    ListItemButton,
    ListItemText,
    Stack,
    Switch,
    TextField,
    Typography,
} from "@mui/material";
import TuneRounded from "@mui/icons-material/TuneRounded";
import ChevronRight from "@mui/icons-material/ChevronRight";
import RestartAltRounded from "@mui/icons-material/RestartAltRounded";
import AdminLayout from "@/Layouts/AdminLayout";
import { PageBand, Pill } from "@/Components/Admin/adminUi";
import { dayDateTime } from "@/utils/dates";

type RuleValue = number | boolean | string | null;

interface Rule {
    key: string;
    group: string;
    type: "int" | "bool" | "text";
    label: string;
    help: string;
    unit: string | null;
    min: number | null;
    max: number | null;
    value: RuleValue;
    default: RuleValue;
    /** Saved in the app (not the .env default). */
    saved: boolean;
}

interface Elsewhere {
    label: string;
    value: string;
    route: string;
}

interface Props {
    rules?: Rule[];
    groups?: Record<string, string>;
    lastSaved?: { at: string; by: string | null } | null;
    elsewhere?: Elsewhere[];
}

const cardSx = { borderRadius: 2, border: "1px solid", borderColor: "divider", boxShadow: "none" } as const;

const shown = (rule: Rule, value: RuleValue): string =>
    rule.type === "bool" ? (value ? "on" : "off") : `${value ?? "—"}${rule.unit ? ` ${rule.unit}` : ""}`;

/** "2880 minutes" reads better as "2 days". */
function minutesHint(minutes: number): string | null {
    if (!Number.isFinite(minutes) || minutes < 60) return null;
    const days = Math.floor(minutes / 1440);
    const hours = Math.floor((minutes % 1440) / 60);
    const rest = minutes % 60;
    return [days ? `${days} day${days === 1 ? "" : "s"}` : "", hours ? `${hours} h` : "", rest ? `${rest} min` : ""].filter(Boolean).join(" ");
}

/**
 * Settings → Business rules: the rules that used to need a .env change and a
 * redeploy. Each shows its default; changing one back to the default (or
 * Reset) lets it follow .env again. Saved rules apply on every app from the
 * next page load.
 */
export default function BusinessRules({ rules = [], groups = {}, lastSaved = null, elsewhere = [] }: Props) {
    const initial = React.useMemo(() => Object.fromEntries(rules.map((r) => [r.key, r.value])) as Record<string, RuleValue>, [rules]);
    const form = useForm<Record<string, RuleValue>>(initial);
    const errors = form.errors as Record<string, string | undefined>;
    const byGroup = Object.keys(groups).map((group) => ({ group, label: groups[group], rules: rules.filter((r) => r.group === group) })).filter((g) => g.rules.length > 0);

    const save = (event: React.FormEvent) => {
        event.preventDefault();
        // What was saved becomes the form's new starting point, so "unsaved changes" clears.
        form.put(route("admin.settings.rules.update"), { preserveScroll: true, onSuccess: () => form.setDefaults() });
    };

    return (
        <Box component="form" onSubmit={save} sx={{ maxWidth: 1100, mx: "auto", pb: 10 }}>
            <Head title="Business rules" />

            <Box sx={{ mb: 1.5 }}>
                <PageBand
                    icon={<TuneRounded />}
                    title="Business rules"
                    subtitle={lastSaved ? `Last saved ${dayDateTime(lastSaved.at)}${lastSaved.by ? ` by ${lastSaved.by}` : ""}` : "Every rule is at its default."}
                />
            </Box>

            <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "minmax(0, 1fr)", md: "repeat(2, minmax(0, 1fr))" } }}>
                {byGroup.map(({ group, label, rules: list }) => (
                    <Card key={group} sx={{ ...cardSx, p: 2 }}>
                        <Typography sx={{ fontWeight: 800, mb: 1.5 }}>{label}</Typography>
                        <Stack spacing={2.25}>
                            {list.map((rule) => {
                                const value = form.data[rule.key];
                                const changed = value !== rule.default;
                                const hint = rule.unit === "minutes" ? minutesHint(Number(value)) : null;
                                const reset = changed ? (
                                    <Button size="small" startIcon={<RestartAltRounded fontSize="small" />} onClick={() => form.setData(rule.key, rule.default)} sx={{ flexShrink: 0 }}>
                                        Default
                                    </Button>
                                ) : null;

                                return (
                                    <Box key={rule.key}>
                                        {rule.type === "bool" ? (
                                            <Stack direction="row" spacing={1} alignItems="flex-start">
                                                <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                                                    <Typography sx={{ fontWeight: 700, fontSize: "0.9rem" }}>{rule.label}</Typography>
                                                    <Typography variant="caption" color="text.secondary" component="p">{rule.help}</Typography>
                                                </Box>
                                                {reset}
                                                <Switch
                                                    checked={Boolean(value)}
                                                    onChange={(e) => form.setData(rule.key, e.target.checked)}
                                                    slotProps={{ input: { "aria-label": rule.label } }}
                                                />
                                            </Stack>
                                        ) : (
                                            <Stack direction="row" spacing={1} alignItems="flex-start">
                                                <TextField
                                                    fullWidth
                                                    size="small"
                                                    label={rule.label}
                                                    type={rule.type === "int" ? "number" : "text"}
                                                    value={value ?? ""}
                                                    onChange={(e) => form.setData(rule.key, rule.type === "int" ? (e.target.value === "" ? null : Number(e.target.value)) : e.target.value)}
                                                    error={Boolean(errors[rule.key])}
                                                    helperText={errors[rule.key] ?? [rule.help, hint ? `(${hint})` : null].filter(Boolean).join(" ")}
                                                    slotProps={{
                                                        htmlInput: rule.type === "int" ? { min: rule.min ?? undefined, max: rule.max ?? undefined, inputMode: "numeric" } : { maxLength: rule.max ?? undefined },
                                                        input: rule.unit ? { endAdornment: <InputAdornment position="end">{rule.unit}</InputAdornment> } : undefined,
                                                    }}
                                                />
                                                {reset}
                                            </Stack>
                                        )}
                                        <Stack direction="row" spacing={0.75} alignItems="center" sx={{ mt: 0.5 }}>
                                            <Typography variant="caption" color="text.secondary">Default: {shown(rule, rule.default)}</Typography>
                                            {rule.saved ? <Pill tone="info" label="Set here" /> : null}
                                        </Stack>
                                    </Box>
                                );
                            })}
                        </Stack>
                    </Card>
                ))}

                {elsewhere.length > 0 ? (
                    <Card sx={{ ...cardSx, p: 2 }}>
                        <Typography sx={{ fontWeight: 800 }}>Set on their own screens</Typography>
                        <Typography variant="caption" color="text.secondary" component="p" sx={{ mb: 1 }}>
                            These rules already live in the app, next to the work they govern.
                        </Typography>
                        {elsewhere.map((item) => (
                            <ListItemButton key={item.label} component={Link} href={route(item.route)} sx={{ borderRadius: 2, px: 1, mx: -1 }}>
                                <ListItemText primary={item.label} secondary={item.value} slotProps={{ primary: { sx: { fontWeight: 700, fontSize: "0.9rem" } } }} />
                                <ChevronRight sx={{ color: "text.disabled" }} />
                            </ListItemButton>
                        ))}
                    </Card>
                ) : null}
            </Box>

            {/* Saving sits above the bottom edge so it is in reach on a long page. */}
            <Card sx={{ ...cardSx, position: "sticky", bottom: 16, mt: 2, p: 1.5, display: "flex", alignItems: "center", gap: 1.5, bgcolor: "background.paper" }}>
                <Typography variant="body2" color="text.secondary" sx={{ flexGrow: 1 }}>
                    {form.isDirty ? "You have unsaved changes." : "Saved rules apply on every app from the next page load."}
                </Typography>
                <Button onClick={() => form.reset()} disabled={!form.isDirty || form.processing}>Undo</Button>
                <Button type="submit" variant="contained" disabled={!form.isDirty || form.processing}>
                    {form.processing ? "Saving…" : "Save rules"}
                </Button>
            </Card>
        </Box>
    );
}

BusinessRules.layout = (page: React.ReactNode) => <AdminLayout flashToast>{page}</AdminLayout>;
