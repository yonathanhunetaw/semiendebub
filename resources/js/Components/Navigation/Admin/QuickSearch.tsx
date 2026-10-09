import React, { useEffect, useRef, useState } from "react";
import SearchRounded from "@mui/icons-material/SearchRounded";
import { router } from "@inertiajs/react";
import axios from "axios";
import { Autocomplete, Box, CircularProgress, InputAdornment, TextField, Typography } from "@mui/material";

interface SearchHit {
    label: string;
    detail: string | null;
    href: string;
}

interface SearchOption extends SearchHit {
    group: string;
}

const GROUPS: Array<[keyof SearchResults, string]> = [
    ["orders", "Orders"],
    ["customers", "Customers"],
    ["items", "Items"],
];

type SearchResults = Record<"orders" | "customers" | "items", SearchHit[]>;

/**
 * The top bar's search over orders (reference), customers (name or phone)
 * and items (name), scoped to the active store by Admin\QuickSearchController.
 */
export default function QuickSearch({ autoFocus = false, onNavigate, fullWidth = false }: { autoFocus?: boolean; onNavigate?: () => void; fullWidth?: boolean } = {}) {
    const [input, setInput] = useState("");
    const [options, setOptions] = useState<SearchOption[]>([]);
    const [loading, setLoading] = useState(false);
    const latest = useRef(0);

    useEffect(() => {
        const term = input.trim();

        if (term.length < 2) {
            setOptions([]);
            setLoading(false);
            return;
        }

        const ticket = ++latest.current;
        setLoading(true);

        const timer = window.setTimeout(() => {
            axios
                .get<SearchResults>(route("admin.search"), { params: { q: term } })
                .then(({ data }) => {
                    if (ticket !== latest.current) return;
                    setOptions(GROUPS.flatMap(([key, group]) => (data[key] ?? []).map((hit) => ({ ...hit, group }))));
                })
                .catch(() => {
                    if (ticket === latest.current) setOptions([]);
                })
                .finally(() => {
                    if (ticket === latest.current) setLoading(false);
                });
        }, 250);

        return () => window.clearTimeout(timer);
    }, [input]);

    return (
        <Autocomplete<SearchOption, false, false, true>
            freeSolo
            size="small"
            options={options}
            groupBy={(option) => option.group}
            getOptionLabel={(option) => (typeof option === "string" ? option : option.label)}
            filterOptions={(all) => all}
            inputValue={input}
            onInputChange={(_, value, reason) => {
                if (reason !== "reset") setInput(value);
            }}
            onChange={(_, value) => {
                if (value && typeof value !== "string") {
                    setInput("");
                    setOptions([]);
                    onNavigate?.();
                    router.visit(value.href);
                }
            }}
            loading={loading}
            noOptionsText={input.trim().length < 2 ? "Type at least two letters" : "Nothing found"}
            renderOption={(props, option) => {
                const { key, ...rest } = props as React.HTMLAttributes<HTMLLIElement> & { key: string };

                return (
                    <Box component="li" key={`${option.group}-${option.href}`} {...rest}>
                        <Box sx={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
                            <Typography noWrap sx={{ fontSize: "0.875rem", fontWeight: 600 }}>
                                {option.label}
                            </Typography>
                            {option.detail && (
                                <Typography noWrap variant="caption" sx={{ color: "text.secondary" }}>
                                    {option.detail}
                                </Typography>
                            )}
                        </Box>
                    </Box>
                );
            }}
            renderInput={(params) => (
                <TextField
                    {...params}
                    autoFocus={autoFocus}
                    placeholder="Search orders, customers, items..."
                    slotProps={{
                        input: {
                            ...params.InputProps,
                            startAdornment: (
                                <InputAdornment position="start">
                                    <SearchRounded fontSize="small" sx={{ color: "text.secondary" }} />
                                </InputAdornment>
                            ),
                            endAdornment: (
                                <>
                                    {loading ? <CircularProgress color="inherit" size={16} /> : null}
                                    {params.InputProps.endAdornment}
                                </>
                            ),
                        },
                    }}
                    sx={{ "& .MuiOutlinedInput-root": { borderRadius: 999, bgcolor: "action.hover" }, "& fieldset": { borderColor: "transparent" } }}
                />
            )}
            sx={{ width: "100%", maxWidth: fullWidth ? "none" : 440 }}
        />
    );
}
