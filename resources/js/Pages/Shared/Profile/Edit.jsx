import { Head } from '@inertiajs/react';
import SellerLayout from "@/Layouts/SellerLayout"; // Changed from Admin to Seller
import DeleteUserForm from './Partials/DeleteUserForm';
import UpdatePasswordForm from './Partials/UpdatePasswordForm';
import UpdateProfileInformationForm from './Partials/UpdateProfileInformationForm';
import { Box, Typography } from "@mui/material";

export default function Edit({ mustVerifyEmail, status }) {
    return (
        <>
            <Head title="Profile" />

            {/* Header section matching your Seller UI style */}
            <Box sx={{ px: 2, pt: 4, pb: 2 }}>
                <Typography variant="h4" sx={{ fontWeight: 900, color: "#ffffff" }}>
                    Profile
                </Typography>
            </Box>

            <div className="px-4 py-2">
                <div className="max-w-4xl mx-auto space-y-4">

                    {/* Update Profile Information */}
                    <div className="bg-[#1e293b] text-white p-6 shadow-sm rounded-2xl border border-white/5">
                        <UpdateProfileInformationForm
                            mustVerifyEmail={mustVerifyEmail}
                            status={status}
                        />
                    </div>

                    {/* Update Password */}
                    <div className="bg-[#1e293b] text-white p-6 shadow-sm rounded-2xl border border-white/5">
                        <UpdatePasswordForm />
                    </div>

                    {/* Delete User */}
                    <div className="bg-[#1e293b] text-white p-6 shadow-sm rounded-2xl border border-white/5">
                        <DeleteUserForm />
                    </div>

                </div>
            </div>
        </>
    );
}

// Fixed the layout assignment to use SellerLayout
Edit.layout = (page) => <SellerLayout>{page}</SellerLayout>;
