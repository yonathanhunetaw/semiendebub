import React, { useEffect } from "react";
import Grid from "@mui/material/Grid";
import { Checkbox, FormControlLabel, FormGroup, FormHelperText, MenuItem, TextField, Typography } from "@mui/material";

interface Props {
    /** Every role this admin may give as the main role. */
    roles: string[];
    /** The roles that can be ticked beside the main one (never admin or dev). */
    alsoOptions: string[];
    stores: Array<{ id: number; name: string }>;
    /** Only a global admin may leave a user without a store (making an admin global). */
    canAssignAnyStore: boolean;
    role: string;
    storeId: number | "";
    alsoRoles: string[];
    onRole: (role: string) => void;
    onStore: (storeId: number | "") => void;
    onAlsoRoles: (roles: string[]) => void;
    /** The dev layer: Dev can be ticked on a global admin, and a user can be hidden. */
    canDev?: boolean;
    isHidden?: boolean;
    onHidden?: (hidden: boolean) => void;
    errors: Partial<Record<"role" | "store_id" | "also_roles", string>>;
    /** Grid sizing for the two selects (the edit form puts them side by side). */
    half?: boolean;
}

const label = (role: string) => role.replace(/_/g, " ");

/**
 * The access part of the user form: the main role, where they work, and the
 * other roles they also hold. For an admin, "where" is a choice between
 * global (every store) and one store, so the difference is stated, not
 * implied by an empty dropdown.
 */
export default function UserAccessFields({ roles, alsoOptions, stores, canAssignAnyStore, role, storeId, alsoRoles, onRole, onStore, onAlsoRoles, canDev = false, isHidden = false, onHidden, errors, half = false }: Props) {
    const isAdmin = role === "admin";
    const isGlobal = isAdmin && canAssignAnyStore && storeId === "";
    const size = half ? { xs: 12, sm: 6 } : { xs: 12 };
    // Dev sits on top of a global admin only; it is not offered anywhere else.
    const ticks = alsoOptions.filter((option) => option !== role && (option !== "dev" || isGlobal));

    useEffect(() => {
        if (alsoRoles.includes("dev") && !isGlobal) onAlsoRoles(alsoRoles.filter((r) => r !== "dev"));
    }, [isGlobal]); // eslint-disable-line react-hooks/exhaustive-deps

    const toggle = (option: string, on: boolean) => onAlsoRoles(on ? [...alsoRoles, option] : alsoRoles.filter((r) => r !== option));

    return (
        <>
            <Grid size={size}>
                <TextField fullWidth select label="Main role" value={role} onChange={(e) => onRole(e.target.value)} error={!!errors.role} helperText={errors.role}>
                    {roles.map((r) => (
                        <MenuItem key={r} value={r}>{label(r)}</MenuItem>
                    ))}
                </TextField>
            </Grid>
            <Grid size={size}>
                {isAdmin && canAssignAnyStore && (
                    <FormControlLabel
                        sx={{ display: "block", mb: 1 }}
                        control={<Checkbox checked={isGlobal} onChange={(e) => onStore(e.target.checked ? "" : (stores[0]?.id ?? ""))} />}
                        label="Global admin: every store, plus users, sessions and the global zone"
                    />
                )}
                {!isGlobal && (
                    <TextField
                        fullWidth select label={isAdmin ? "Admin of store" : "Store"} value={storeId}
                        onChange={(e) => onStore(e.target.value === "" ? "" : Number(e.target.value))}
                        error={!!errors.store_id}
                        helperText={errors.store_id ?? (isAdmin ? "A store admin runs this store only." : "Sellers and stock keepers work at one store; leave empty for roles that cover all of them.")}
                    >
                        {canAssignAnyStore && !isAdmin && <MenuItem value="">No store</MenuItem>}
                        {stores.map((store) => (
                            <MenuItem key={store.id} value={store.id}>{store.name}</MenuItem>
                        ))}
                    </TextField>
                )}
            </Grid>
            {ticks.length > 0 && (
                <Grid size={{ xs: 12 }}>
                    <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>Also works as</Typography>
                    <FormHelperText sx={{ mt: 0, mb: 0.5 }}>
                        {isAdmin ? "The apps this admin can open as themself in the Apps menu." : "Other roles this person also holds."}
                    </FormHelperText>
                    <FormGroup row>
                        {ticks.map((option) => (
                            <FormControlLabel
                                key={option}
                                control={<Checkbox size="small" checked={alsoRoles.includes(option)} onChange={(e) => toggle(option, e.target.checked)} />}
                                label={label(option)}
                            />
                        ))}
                    </FormGroup>
                    {errors.also_roles && <FormHelperText error>{errors.also_roles}</FormHelperText>}
                </Grid>
            )}
            {canDev && onHidden && (
                <Grid size={{ xs: 12 }}>
                    <FormControlLabel
                        control={<Checkbox checked={isHidden} onChange={(e) => onHidden(e.target.checked)} />}
                        label="Hidden (a demo user): only a global admin with Dev sees this account"
                    />
                </Grid>
            )}
        </>
    );
}
