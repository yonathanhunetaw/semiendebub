import SellerLayout from "@/Layouts/SellerLayout";
import { Head, Link } from "@inertiajs/react";
import {
    Box,
    Button,
    Paper,
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableRow,
    Typography,
} from "@mui/material";
import React from "react";

interface Customer {
    id: number;
    first_name?: string;
    last_name?: string;
    email?: string;
    phone_number?: string;
    city?: string;
    creator?: {
        first_name?: string;
        last_name?: string;
    } | null;
}

const fullName = (customer: Customer) =>
    [customer.first_name, customer.last_name].filter(Boolean).join(" ");

export default function Index({ customers = [] }: { customers?: Customer[] }) {
    return (
        <>
            <Head title="Customers" />

            <Box sx={{ mb: 4, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 2 }}>
                <Box>
                    <Typography variant="h4" sx={{ fontWeight: 800 }}>
                        Customers
                    </Typography>
                    <Typography variant="body1" color="text.secondary">
                        Relationship records created from the seller workspace.
                    </Typography>
                </Box>
                <Button component={Link} href={route("seller.customers.create")} variant="contained" sx={{ borderRadius: 3, textTransform: "none" }}>
                    New Customer
                </Button>
            </Box>

            <Paper elevation={0} sx={{ borderRadius: 3, border: "1px solid", borderColor: "divider", overflow: "hidden" }}>
                <Table>
                    <TableHead>
                        <TableRow>
                            <TableCell>Name</TableCell>
                            <TableCell>Email</TableCell>
                            <TableCell>Phone</TableCell>
                            <TableCell>City</TableCell>
                            <TableCell align="right">Actions</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {customers.map((customer) => (
                            <TableRow key={customer.id} hover>
                                <TableCell>{fullName(customer) || "Unnamed customer"}</TableCell>
                                <TableCell>{customer.email || "N/A"}</TableCell>
                                <TableCell>{customer.phone_number || "N/A"}</TableCell>
                                <TableCell>{customer.city || "N/A"}</TableCell>
                                <TableCell align="right">
                                    <Button component={Link} href={route("seller.customers.show", customer.id)} size="small" sx={{ textTransform: "none" }}>
                                        View
                                    </Button>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </Paper>
        </>
    );
}

Index.layout = (page: React.ReactNode) => <SellerLayout>{page}</SellerLayout>;
