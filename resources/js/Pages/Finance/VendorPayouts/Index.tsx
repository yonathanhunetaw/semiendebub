import React from "react";
import { Head } from "@inertiajs/react";
import { Box } from "@mui/material";
import PaymentsOutlined from "@mui/icons-material/PaymentsOutlined";
import FinanceLayout from "@/Layouts/FinanceLayout";
import FlashToast from "@/Components/Shared/FlashToast";
import { PageBand } from "@/Components/Admin/adminUi";
import VendorPayoutsPanel, { type VendorBalanceRow, type VendorPayoutRow } from "@/Components/Vendor/VendorPayoutsPanel";

interface Props {
    stores?: VendorBalanceRow[];
    payouts?: VendorPayoutRow[];
}

/** Finance → Vendor payouts: what Duka owes vendors' stores; record a payout, or confirm one someone else recorded. */
export default function FinanceVendorPayouts({ stores = [], payouts = [] }: Props) {
    return (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
            <Head title="Vendor payouts" />
            <FlashToast />
            <PageBand icon={<PaymentsOutlined />} title="Vendor payouts" subtitle="What Duka owes vendors' stores after its commission. Two people: one records, another confirms." />
            <VendorPayoutsPanel stores={stores} payouts={payouts} routes={{ record: "finance.vendor_payouts.store", confirm: "finance.vendor_payouts.confirm", reject: "finance.vendor_payouts.reject" }} />
        </Box>
    );
}

FinanceVendorPayouts.layout = (page: React.ReactNode) => <FinanceLayout>{page}</FinanceLayout>;
