import React from "react";
import StorefrontRoundedIcon from "@mui/icons-material/StorefrontRounded";
import { EmptyState, VendorCard } from "@/Components/Vendor/vendorUi";

/** A vendor account with no store yet (an old supplier login, or an application still open). */
export default function NoStore(): React.ReactElement {
    return (
        <VendorCard>
            <EmptyState
                icon={<StorefrontRoundedIcon />}
                title="You do not run a store on Duka yet"
                hint="A vendor is a store. When your application to sell is approved, your store appears here."
            />
        </VendorCard>
    );
}
