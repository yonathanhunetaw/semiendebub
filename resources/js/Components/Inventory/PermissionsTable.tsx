import type { PermissionAbility, StorePerson } from "@/types/refills";
import CheckCircleRoundedIcon from "@mui/icons-material/CheckCircleRounded";
import RemoveCircleOutlineRoundedIcon from "@mui/icons-material/RemoveCircleOutlineRounded";
import { Box, Chip, Paper, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography } from "@mui/material";
import React from "react";

const WHO: Array<{ key: keyof PermissionAbility["who"]; label: string }> = [
    { key: "seller", label: "Seller" },
    { key: "stock_keeper", label: "Stock keeper" },
    { key: "location_manager", label: "Location manager" },
    { key: "store_manager", label: "Store manager" },
    { key: "admin", label: "Admin / dev" },
];

const cellSx = { verticalAlign: "top", py: 1.25 } as const;

function Verdict({ value }: { value: boolean | string }): React.ReactElement {
    if (value === false) {
        return <RemoveCircleOutlineRoundedIcon fontSize="small" sx={{ color: "text.disabled" }} aria-label="No" />;
    }

    return (
        <Stack direction="row" spacing={0.5} alignItems="center">
            <CheckCircleRoundedIcon fontSize="small" sx={{ color: "success.main" }} aria-label="Yes" />
            {typeof value === "string" ? (
                <Typography variant="caption" color="text.secondary">
                    {value}
                </Typography>
            ) : null}
        </Stack>
    );
}

/**
 * Who may do what with shelves and refills, read-only. Built from
 * StockPermissions::catalogue(), the same definition the policies enforce.
 * "Location manager" means a user assigned to that location in Admin →
 * Inventory → Locations — whatever their role.
 */
export default function PermissionsTable({
    abilities,
    people = [],
    ticks = {},
}: {
    abilities: PermissionAbility[];
    /** Who runs the viewer's store, and what each manager has ticked. */
    people?: StorePerson[];
    /** Tick key → label. */
    ticks?: Record<string, string>;
}): React.ReactElement {
    return (
        <Stack spacing={2.5}>
        <Paper variant="outlined" sx={{ borderRadius: 3, overflow: "hidden" }}>
            <TableContainer sx={{ maxWidth: "100%", overflowX: "auto" }}>
                <Table size="small" aria-label="Who may do what">
                    <TableHead>
                        <TableRow>
                            <TableCell sx={{ fontWeight: 700, minWidth: 220 }}>Action</TableCell>
                            {WHO.map((who) => (
                                <TableCell key={who.key} sx={{ fontWeight: 700, whiteSpace: "nowrap" }}>
                                    {who.label}
                                </TableCell>
                            ))}
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {abilities.map((ability) => (
                            <TableRow key={ability.key}>
                                <TableCell sx={cellSx}>
                                    <Typography variant="body2" sx={{ fontWeight: 700 }}>
                                        {ability.label}
                                    </Typography>
                                    <Typography variant="caption" color="text.secondary">
                                        {ability.description}
                                    </Typography>
                                </TableCell>
                                {WHO.map((who) => (
                                    <TableCell key={who.key} sx={cellSx}>
                                        <Verdict value={ability.who[who.key]} />
                                    </TableCell>
                                ))}
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </TableContainer>
            <Box sx={{ px: 2, py: 1.5, borderTop: 1, borderColor: "divider" }}>
                <Typography variant="caption" color="text.secondary">
                    A location manager is whoever is assigned to that shelf, floor or Remote Hub in Admin → Inventory → Locations, whether a seller or a
                    stock keeper. &quot;If ticked&quot; means only managers whose tick box for it is on. A store&apos;s managers and stock keepers also run its
                    shelf, floor and Remote Hub. A shelf with no manager is edited by admin/dev only. This page is read-only.
                </Typography>
            </Box>
        </Paper>

        {people.length > 0 ? (
            <Paper variant="outlined" sx={{ borderRadius: 3, overflow: "hidden" }}>
                <Box sx={{ px: 2, pt: 2 }}>
                    <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>
                        Who runs your store
                    </Typography>
                </Box>
                <TableContainer sx={{ maxWidth: "100%", overflowX: "auto" }}>
                    <Table size="small" aria-label="Who runs your store">
                        <TableHead>
                            <TableRow>
                                <TableCell sx={{ fontWeight: 700 }}>Person</TableCell>
                                <TableCell sx={{ fontWeight: 700 }}>Where</TableCell>
                                <TableCell sx={{ fontWeight: 700 }}>May</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {people.map((person, index) => (
                                <TableRow key={`${person.name}-${person.where}-${index}`}>
                                    <TableCell sx={cellSx}>
                                        <Typography variant="body2" sx={{ fontWeight: 700 }}>
                                            {person.name}
                                        </Typography>
                                        <Typography variant="caption" color="text.secondary">
                                            {person.role}
                                        </Typography>
                                    </TableCell>
                                    <TableCell sx={cellSx}>{person.where}</TableCell>
                                    <TableCell sx={cellSx}>
                                        {person.role === "Stock keeper" ? (
                                            <Typography variant="caption" color="text.secondary">
                                                Suggest refills, shelve
                                            </Typography>
                                        ) : person.ticks.length === 0 ? (
                                            <Typography variant="caption" color="text.secondary">
                                                Nothing ticked
                                            </Typography>
                                        ) : (
                                            <Stack direction="row" flexWrap="wrap" useFlexGap gap={0.5}>
                                                {person.ticks.map((tick) => (
                                                    <Chip key={tick} size="small" label={ticks[tick] ?? tick} />
                                                ))}
                                            </Stack>
                                        )}
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </TableContainer>
            </Paper>
        ) : null}
        </Stack>
    );
}
