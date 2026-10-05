import { SELLER_CITY_OPTIONS, SellerCard, SellerHeader } from "@/Components/Seller/sellerUi";
import SellerLayout from "@/Layouts/SellerLayout";
import { Head, useForm } from "@inertiajs/react";
import { Box, Button, MenuItem, Stack, TextField } from "@mui/material";
import React from "react";

export default function Create() {
    const { data, setData, post, processing, errors } = useForm({
        first_name: "",
        last_name: "",
        email: "",
        phone_number: "",
        city: "",
        tin_number: "",
    });

    /*
     * Customer type is the TIN, as it is everywhere else in this application:
     * a customer holding a TIN is "individual" and is priced with VAT, and one
     * without is "business". Admin\Customers\Index has offered this choice for
     * a while; the seller form collected neither the type nor the number, so
     * every customer a seller added came out as a business and could never be
     * quoted a VAT-inclusive price.
     */
    const [customerType, setCustomerType] = React.useState<"individual" | "business">("individual");

    /*
     * A business has no TIN by definition, so the field is cleared the moment
     * the type is switched rather than at submit time. useForm always posts its
     * own state, so clearing it here is what actually keeps a stale number from
     * being saved.
     */
    const changeType = (next: "individual" | "business") => {
        setCustomerType(next);

        if (next === "business") {
            setData("tin_number", "");
        }
    };

    const submit = (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        post(route("seller.customers.store"));
    };

    return (
        <>
            <Head title="Add Customer" />

            <SellerHeader title="Add Customer" backHref={route("seller.customers.index")} />

            <Box component="form" onSubmit={submit} sx={{ px: 2, pt: 2 }}>
                <SellerCard>
                    <Stack spacing={2}>
                        <TextField
                            select
                            fullWidth
                            label="Customer Type"
                            value={customerType}
                            onChange={(event) =>
                                changeType(event.target.value as "individual" | "business")
                            }
                            helperText={
                                customerType === "individual"
                                    ? "Priced with VAT — needs a TIN."
                                    : "Priced without VAT."
                            }
                        >
                            <MenuItem value="individual">Individual</MenuItem>
                            <MenuItem value="business">Business</MenuItem>
                        </TextField>

                        {customerType === "individual" && (
                            <TextField
                                fullWidth
                                label="TIN Number"
                                value={data.tin_number}
                                onChange={(event) => setData("tin_number", event.target.value)}
                                helperText={errors.tin_number}
                                error={Boolean(errors.tin_number)}
                            />
                        )}

                        <TextField
                            fullWidth
                            label="First name"
                            value={data.first_name}
                            onChange={(event) => setData("first_name", event.target.value)}
                            helperText={errors.first_name}
                            error={Boolean(errors.first_name)}
                        />
                        <TextField
                            fullWidth
                            label="Last name"
                            value={data.last_name}
                            onChange={(event) => setData("last_name", event.target.value)}
                            helperText={errors.last_name}
                            error={Boolean(errors.last_name)}
                        />
                        <TextField
                            fullWidth
                            label="Phone number"
                            value={data.phone_number}
                            onChange={(event) => setData("phone_number", event.target.value)}
                            helperText={errors.phone_number}
                            error={Boolean(errors.phone_number)}
                        />
                        <TextField
                            fullWidth
                            type="email"
                            label="Email"
                            value={data.email}
                            onChange={(event) => setData("email", event.target.value)}
                            helperText={errors.email}
                            error={Boolean(errors.email)}
                        />
                        <TextField
                            select
                            fullWidth
                            label="City"
                            value={data.city}
                            onChange={(event) => setData("city", event.target.value)}
                            helperText={errors.city}
                            error={Boolean(errors.city)}
                        >
                            {SELLER_CITY_OPTIONS.map((city) => (
                                <MenuItem key={city} value={city}>
                                    {city}
                                </MenuItem>
                            ))}
                        </TextField>
                        <Button
                            type="submit"
                            variant="contained"
                            disabled={processing}
                            sx={{
                                borderRadius: 3,
                                textTransform: "none",
                                bgcolor: "primary.main",
                                "&:hover": { bgcolor: "primary.main" },
                            }}
                        >
                            Save Customer
                        </Button>
                    </Stack>
                </SellerCard>
            </Box>
        </>
    );
}

Create.layout = (page: React.ReactNode) => <SellerLayout>{page}</SellerLayout>;
