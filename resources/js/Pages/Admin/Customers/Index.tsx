import AdminLayout from "@/Layouts/AppLayout";
import { Head, useForm, usePage } from "@inertiajs/react";
import {
    Box,
    Paper,
    Typography,
    Button,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    TextField,
    MenuItem,
    IconButton,
    useMediaQuery,
    useTheme,
    Card,
    CardContent,
    CardActions,
    Stack,
    Grid,
    Fab,
    Snackbar,
    Alert,
    Chip,
    Avatar,
    Divider,
    Tooltip
} from "@mui/material";
import {
    Delete,
    Edit,
    Add,
    Email,
    Phone,
    LocationOn,
    Business,
    Person,
    PeopleAltOutlined
} from "@mui/icons-material";
import { useState, useEffect } from "react";

const getInitials = (first: string, last: string) => {
    const a = (first || "").trim().charAt(0);
    const b = (last || "").trim().charAt(0);
    return (a + b).toUpperCase() || "?";
};

export default function Customers({ customers }: { customers: any[] }) {
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
    const isDesktop = useMediaQuery(theme.breakpoints.up("lg"));

    const { flash } = usePage().props as { flash?: { success?: string; error?: string } };
    const [snackbar, setSnackbar] = useState({ open: false, message: "", severity: "success" as "success" | "error" });

    useEffect(() => {
        if (flash?.success) {
            setSnackbar({ open: true, message: flash.success, severity: "success" });
        } else if (flash?.error) {
            setSnackbar({ open: true, message: flash.error, severity: "error" });
        }
    }, [flash]);

    const handleCloseSnackbar = () => {
        setSnackbar(prev => ({ ...prev, open: false }));
    };

    const [openModal, setOpenModal] = useState(false);
    const [customerType, setCustomerType] = useState<"individual" | "business">("individual");
    const [editingId, setEditingId] = useState<number | null>(null);

    const { data, setData, post, put, delete: destroy, processing, errors, reset, clearErrors } = useForm({
        first_name: "",
        last_name: "",
        email: "",
        phone_number: "",
        city: "",
        tin_number: "",
    });

    const handleOpen = () => {
        setEditingId(null);
        setCustomerType("individual");
        reset();
        clearErrors();
        setOpenModal(true);
    };

    const handleEdit = (customer: any) => {
        setEditingId(customer.id);
        setCustomerType(customer.tin_number ? "individual" : "business");
        setData({
            first_name: customer.first_name || "",
            last_name: customer.last_name || "",
            email: customer.email || "",
            phone_number: customer.phone_number || "",
            city: customer.city || "",
            tin_number: customer.tin_number || "",
        });
        clearErrors();
        setOpenModal(true);
    };

    const handleClose = () => {
        setOpenModal(false);
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        // If business, ensure tin_number is cleared
        const payload = { ...data };
        if (customerType === "business") {
            payload.tin_number = "";
            setData("tin_number", "");
        }

        if (editingId) {
            put(route("admin.customers.update", editingId), {
                onSuccess: () => setOpenModal(false),
            });
        } else {
            post(route("admin.customers.store"), {
                onSuccess: () => setOpenModal(false),
            });
        }
    };

    const handleDelete = (id: number) => {
        if (confirm("Are you sure you want to delete this customer?")) {
            destroy(route("admin.customers.destroy", id));
        }
    };

    const EmptyState = () => (
        <Paper
            variant="outlined"
            sx={{
                p: { xs: 4, sm: 6 },
                textAlign: "center",
                borderStyle: "dashed",
                borderRadius: 3,
                bgcolor: "grey.50",
            }}
        >
            <PeopleAltOutlined sx={{ fontSize: 40, color: "text.disabled", mb: 1 }} />
            <Typography variant="subtitle1" fontWeight={600} color="text.secondary">
                No customers yet
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Add your first customer to see them listed here.
            </Typography>
            <Button variant="contained" startIcon={<Add />} onClick={handleOpen} disableElevation>
                Add Customer
            </Button>
        </Paper>
    );

    return (
        <Box sx={{ p: { xs: 2, sm: 3, lg: 4 }, pb: { xs: 12, sm: 3 }, maxWidth: 1400, mx: "auto" }}>
            <Box
                sx={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: { xs: "flex-start", sm: "center" },
                    flexDirection: { xs: "column", sm: "row" },
                    gap: 1.5,
                    mb: { xs: 3, sm: 4 },
                }}
            >
                <Box>
                    <Typography variant="h4" fontWeight={700} sx={{ fontSize: { xs: "1.6rem", sm: "2rem" }, letterSpacing: "-0.02em" }}>
                        Customers
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                        {customers.length} {customers.length === 1 ? "customer" : "customers"} on file
                    </Typography>
                </Box>
                {!isMobile && (
                    <Button
                        variant="contained"
                        startIcon={<Add />}
                        onClick={handleOpen}
                        disableElevation
                        sx={{ borderRadius: 2, textTransform: "none", fontWeight: 600, px: 2.5, py: 1 }}
                    >
                        Add Customer
                    </Button>
                )}
            </Box>

            {customers.length === 0 ? (
                <EmptyState />
            ) : isDesktop ? (
                // Desktop View: refined table
                <TableContainer
                    component={Paper}
                    variant="outlined"
                    sx={{ borderRadius: 3, overflow: "hidden" }}
                >
                    <Table>
                        <TableHead>
                            <TableRow sx={{ "& th": { bgcolor: "grey.50", fontWeight: 700, color: "text.secondary", fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.04em", borderBottom: "2px solid", borderColor: "divider" } }}>
                                <TableCell>Customer</TableCell>
                                <TableCell>Type</TableCell>
                                <TableCell>Contact</TableCell>
                                <TableCell>City</TableCell>
                                <TableCell align="right">Actions</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {customers.map((customer) => (
                                <TableRow
                                    key={customer.id}
                                    hover
                                    sx={{
                                        "&:last-child td": { borderBottom: 0 },
                                        transition: "background-color 0.15s ease",
                                    }}
                                >
                                    <TableCell sx={{ py: 1.75 }}>
                                        <Stack direction="row" spacing={1.5} alignItems="center">
                                            <Avatar
                                                sx={{
                                                    width: 38,
                                                    height: 38,
                                                    fontSize: "0.85rem",
                                                    fontWeight: 700,
                                                    bgcolor: customer.tin_number ? "primary.main" : "secondary.main",
                                                }}
                                            >
                                                {getInitials(customer.first_name, customer.last_name)}
                                            </Avatar>
                                            <Typography variant="body2" fontWeight={600}>
                                                {customer.first_name} {customer.last_name}
                                            </Typography>
                                        </Stack>
                                    </TableCell>
                                    <TableCell>
                                        {customer.tin_number ? (
                                            <Chip
                                                icon={<Person sx={{ fontSize: "0.9rem !important" }} />}
                                                label={`Individual · TIN ${customer.tin_number}`}
                                                size="small"
                                                variant="outlined"
                                                sx={{ fontWeight: 500, borderColor: "divider" }}
                                            />
                                        ) : (
                                            <Chip
                                                icon={<Business sx={{ fontSize: "0.9rem !important" }} />}
                                                label="Business"
                                                size="small"
                                                color="secondary"
                                                sx={{ fontWeight: 500 }}
                                            />
                                        )}
                                    </TableCell>
                                    <TableCell>
                                        <Stack spacing={0.25}>
                                            <Typography variant="body2" color="text.secondary">{customer.email}</Typography>
                                            <Typography variant="caption" color="text.disabled">{customer.phone_number}</Typography>
                                        </Stack>
                                    </TableCell>
                                    <TableCell>
                                        <Typography variant="body2" color="text.secondary">{customer.city || "—"}</Typography>
                                    </TableCell>
                                    <TableCell align="right">
                                        <Tooltip title="Edit">
                                            <IconButton onClick={() => handleEdit(customer)} size="small" sx={{ color: "text.secondary", "&:hover": { color: "primary.main", bgcolor: "primary.50" } }}>
                                                <Edit fontSize="small" />
                                            </IconButton>
                                        </Tooltip>
                                        <Tooltip title="Delete">
                                            <IconButton onClick={() => handleDelete(customer.id)} size="small" sx={{ color: "text.secondary", "&:hover": { color: "error.main", bgcolor: "error.50" } }}>
                                                <Delete fontSize="small" />
                                            </IconButton>
                                        </Tooltip>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </TableContainer>
            ) : (
                // Mobile & Tablet View: responsive card grid (1 col mobile, 2-3 cols tablet)
                <Grid container spacing={2}>
                    {customers.map((customer) => (
                        <Grid item xs={12} sm={6} md={4} key={customer.id}>
                            <Card
                                variant="outlined"
                                sx={{
                                    borderRadius: 3,
                                    height: "100%",
                                    display: "flex",
                                    flexDirection: "column",
                                    transition: "box-shadow 0.15s ease, transform 0.15s ease",
                                    "&:hover": { boxShadow: 3, transform: "translateY(-1px)" },
                                }}
                            >
                                <CardContent sx={{ pb: 1, flexGrow: 1 }}>
                                    <Stack direction="row" spacing={1.5} alignItems="flex-start">
                                        <Avatar
                                            sx={{
                                                width: 44,
                                                height: 44,
                                                fontWeight: 700,
                                                bgcolor: customer.tin_number ? "primary.main" : "secondary.main",
                                            }}
                                        >
                                            {getInitials(customer.first_name, customer.last_name)}
                                        </Avatar>
                                        <Box sx={{ minWidth: 0, flex: 1 }}>
                                            <Typography variant="subtitle1" fontWeight={700} noWrap>
                                                {customer.first_name} {customer.last_name}
                                            </Typography>
                                            {customer.tin_number ? (
                                                <Chip
                                                    icon={<Person sx={{ fontSize: "0.85rem !important" }} />}
                                                    label="Individual"
                                                    size="small"
                                                    variant="outlined"
                                                    sx={{ mt: 0.5, fontWeight: 500, borderColor: "divider" }}
                                                />
                                            ) : (
                                                <Chip
                                                    icon={<Business sx={{ fontSize: "0.85rem !important" }} />}
                                                    label="Business"
                                                    size="small"
                                                    color="secondary"
                                                    sx={{ mt: 0.5, fontWeight: 500 }}
                                                />
                                            )}
                                        </Box>
                                    </Stack>

                                    <Divider sx={{ my: 1.5 }} />

                                    <Stack spacing={0.75}>
                                        <Stack direction="row" spacing={1} alignItems="center" color="text.secondary">
                                            <Email sx={{ fontSize: 16 }} />
                                            <Typography variant="body2" noWrap>{customer.email || "—"}</Typography>
                                        </Stack>
                                        <Stack direction="row" spacing={1} alignItems="center" color="text.secondary">
                                            <Phone sx={{ fontSize: 16 }} />
                                            <Typography variant="body2">{customer.phone_number || "—"}</Typography>
                                        </Stack>
                                        <Stack direction="row" spacing={1} alignItems="center" color="text.secondary">
                                            <LocationOn sx={{ fontSize: 16 }} />
                                            <Typography variant="body2">{customer.city || "—"}</Typography>
                                        </Stack>
                                        {customer.tin_number && (
                                            <Typography variant="caption" color="text.disabled" sx={{ pt: 0.25 }}>
                                                TIN: {customer.tin_number}
                                            </Typography>
                                        )}
                                    </Stack>
                                </CardContent>
                                <Divider />
                                <CardActions sx={{ justifyContent: "flex-end", py: 0.5 }}>
                                    <IconButton onClick={() => handleEdit(customer)} size="small" sx={{ color: "text.secondary", "&:hover": { color: "primary.main" } }}>
                                        <Edit fontSize="small" />
                                    </IconButton>
                                    <IconButton onClick={() => handleDelete(customer.id)} size="small" sx={{ color: "text.secondary", "&:hover": { color: "error.main" } }}>
                                        <Delete fontSize="small" />
                                    </IconButton>
                                </CardActions>
                            </Card>
                        </Grid>
                    ))}
                </Grid>
            )}

            {/* Mobile Floating Action Button */}
            {isMobile && (
                <Fab
                    color="primary"
                    aria-label="add"
                    onClick={handleOpen}
                    sx={{ position: "fixed", bottom: 20, right: 20, boxShadow: 4 }}
                >
                    <Add />
                </Fab>
            )}

            <Dialog
                open={openModal}
                onClose={handleClose}
                maxWidth="sm"
                fullWidth
                fullScreen={isMobile}
                PaperProps={{ sx: { borderRadius: isMobile ? 0 : 3 } }}
            >
                <DialogTitle sx={{ fontWeight: 700 }}>{editingId ? "Edit Customer" : "Add Customer"}</DialogTitle>
                <form onSubmit={handleSubmit}>
                    <DialogContent dividers sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
                        <TextField
                            select
                            fullWidth
                            label="Customer Type"
                            value={customerType}
                            onChange={(e) => setCustomerType(e.target.value as any)}
                        >
                            <MenuItem value="individual">Individual</MenuItem>
                            <MenuItem value="business">Business</MenuItem>
                        </TextField>

                        {customerType === "individual" && (
                            <TextField
                                fullWidth
                                label="TIN Number"
                                value={data.tin_number}
                                onChange={(e) => setData("tin_number", e.target.value)}
                                error={!!errors.tin_number}
                                helperText={errors.tin_number}
                            />
                        )}

                        <Box sx={{ display: "flex", flexDirection: { xs: 'column', sm: 'row' }, gap: 2 }}>
                            <TextField
                                fullWidth
                                label="First Name"
                                value={data.first_name}
                                onChange={(e) => setData("first_name", e.target.value)}
                                error={!!errors.first_name}
                                helperText={errors.first_name}
                            />
                            <TextField
                                fullWidth
                                label="Last Name"
                                value={data.last_name}
                                onChange={(e) => setData("last_name", e.target.value)}
                                error={!!errors.last_name}
                                helperText={errors.last_name}
                            />
                        </Box>

                        <TextField
                            fullWidth
                            label="Email"
                            type="email"
                            value={data.email}
                            onChange={(e) => setData("email", e.target.value)}
                            error={!!errors.email}
                            helperText={errors.email}
                        />

                        <TextField
                            fullWidth
                            label="Phone Number"
                            value={data.phone_number}
                            onChange={(e) => setData("phone_number", e.target.value)}
                            error={!!errors.phone_number}
                            helperText={errors.phone_number}
                        />

                        <TextField
                            fullWidth
                            label="City"
                            value={data.city}
                            onChange={(e) => setData("city", e.target.value)}
                            error={!!errors.city}
                            helperText={errors.city}
                        />
                    </DialogContent>
                    <DialogActions sx={{ p: { xs: 2, sm: 1.5 } }}>
                        <Button onClick={handleClose} color="inherit" sx={{ textTransform: "none" }}>Cancel</Button>
                        <Button type="submit" variant="contained" disabled={processing} fullWidth={isMobile} disableElevation sx={{ textTransform: "none", fontWeight: 600, borderRadius: 2 }}>
                            {editingId ? "Update" : "Save"}
                        </Button>
                    </DialogActions>
                </form>
            </Dialog>

            <Snackbar
                open={snackbar.open}
                autoHideDuration={4000}
                onClose={handleCloseSnackbar}
                anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
            >
                <Alert onClose={handleCloseSnackbar} severity={snackbar.severity} sx={{ width: '100%' }}>
                    {snackbar.message}
                </Alert>
            </Snackbar>
        </Box>
    );
}

Customers.layout = (page: React.ReactNode) => (
    <AdminLayout>
        <Head title="Customers" />
        {page}
    </AdminLayout>
);
