import React, { useState } from "react";
import AdminLayout from "@/Layouts/AppLayout";
import { Head, Link } from "@inertiajs/react";
import {
    Box, Typography, Paper, Table, TableBody, TableCell, TableContainer,
    TableHead, TableRow, Button, Stack, Chip, IconButton, Collapse
} from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import KeyboardArrowUpIcon from "@mui/icons-material/KeyboardArrowUp";

// Component for each Item Row
function Row({ item }: { item: any }) {
    const [open, setOpen] = useState(false);

    return (
        <>
            <TableRow sx={{ '& > *': { borderBottom: 'unset' } }} hover onClick={() => setOpen(!open)} style={{ cursor: 'pointer' }}>
                <TableCell width="50">
                    <IconButton size="small">
                        {open ? <KeyboardArrowUpIcon /> : <KeyboardArrowDownIcon />}
                    </IconButton>
                </TableCell>
                <TableCell sx={{ fontWeight: 700 }}>{item.item_name}</TableCell>
                <TableCell>{item.category}</TableCell>
                <TableCell align="center">
                    <Chip label={`${item.total_variants} Variants`} size="small" variant="outlined" />
                </TableCell>
                <TableCell align="right">
                    <Typography fontWeight="bold" color={item.total_stock > 0 ? "success.main" : "error.main"}>
                        {item.total_stock} Units
                    </Typography>
                </TableCell>
            </TableRow>
            <TableRow>
                <TableCell style={{ paddingBottom: 0, paddingTop: 0 }} colSpan={6}>
                    <Collapse in={open} timeout="auto" unmountOnExit>
                        <Box sx={{ margin: 2, bgcolor: 'action.hover', p: 2, borderRadius: 2 }}>
                            <Typography variant="subtitle2" gutterBottom component="div" fontWeight="bold">
                                Variant Details for {item.item_name}
                            </Typography>
                            <Table size="small">
                                <TableHead>
                                    <TableRow>
                                        <TableCell sx={{ fontWeight: 'bold' }}>SKU</TableCell>
                                        <TableCell sx={{ fontWeight: 'bold' }}>Price</TableCell>
                                        <TableCell sx={{ fontWeight: 'bold' }}>Stock</TableCell>
                                        <TableCell sx={{ fontWeight: 'bold' }}>Status</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {item.variants.map((v: any) => (
                                        <TableRow key={v.id}>
                                            <TableCell>{v.sku}</TableCell>
                                            <TableCell>${v.price}</TableCell>
                                            <TableCell>{v.stock}</TableCell>
                                            <TableCell>
                                                <Chip label={v.status} size="small" variant="outlined" />
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </Box>
                    </Collapse>
                </TableCell>
            </TableRow>
        </>
    );
}

export default function StoreShow({ store, inventory = [] }: any) {
    const items = Array.isArray(inventory) ? inventory : [];

    return (
        <Box p={3}>
            <Head title={`${store?.name} Inventory`} />

            <Stack direction="row" spacing={2} alignItems="center" mb={3}>
                <Button component={Link} href={route("store.index")} startIcon={<ArrowBackIcon />}>
                    Back
                </Button>
                <Typography variant="h4" fontWeight={800}>{store?.name} Inventory</Typography>
            </Stack>

            <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid #e0e0e0', borderRadius: 3 }}>
                <Table aria-label="collapsible table">
                    <TableHead sx={{ bgcolor: 'grey.50' }}>
                        <TableRow>
                            <TableCell />
                            <TableCell sx={{ fontWeight: 'bold' }}>Product Name</TableCell>
                            <TableCell sx={{ fontWeight: 'bold' }}>Category</TableCell>
                            <TableCell align="center" sx={{ fontWeight: 'bold' }}>Variants</TableCell>
                            <TableCell align="right" sx={{ fontWeight: 'bold' }}>Total Stock</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {items.map((item: any) => (
                            <Row key={item.item_id} item={item} />
                        ))}
                    </TableBody>
                </Table>
            </TableContainer>
        </Box>
    );
}

StoreShow.layout = (page: React.ReactNode) => <AdminLayout>{page}</AdminLayout>;
