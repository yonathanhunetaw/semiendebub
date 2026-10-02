import { Head, Link, usePage } from '@inertiajs/react';
import AccountLayout from "@/Layouts/AccountLayout";
import DeleteUserForm from './Partials/DeleteUserForm';
import UpdatePasswordForm from './Partials/UpdatePasswordForm';
import UpdateProfileInformationForm from './Partials/UpdateProfileInformationForm';
import { Box, Button, Typography } from "@mui/material";
import ArrowBackRoundedIcon from "@mui/icons-material/ArrowBackRounded";

/**
 * `/profile` is served to every signed-in role, so the chrome is picked from
 * the viewer (see AccountLayout) rather than hard-coded to the seller
 * workspace. The surface itself is unchanged — the same dark cards the seller
 * pages use.
 */
/**
 * The card is dark and sets `text-white`, which cascades into the form
 * controls — whose own surface is white. Every value a user typed was
 * therefore white on white and invisible, so the inputs are pinned back to a
 * dark ink here rather than in each of the three partials.
 */
const CARD =
    "bg-[#1e293b] text-white p-6 shadow-sm rounded-2xl border border-white/5 " +
    "[&_input]:!text-gray-900 [&_input]:placeholder:!text-slate-400";

export default function Edit({ mustVerifyEmail, status }) {
    const { auth } = usePage().props;
    const isSeller = auth?.user?.role_key === 'seller';

    return (
        <>
            <Head title="Profile" />

            {/* Header section matching your Seller UI style */}
            <Box
                sx={{
                    px: 2,
                    pt: 4,
                    pb: 2,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 2,
                }}
            >
                <Typography variant="h4" sx={{ fontWeight: 900, color: "#ffffff" }}>
                    Profile
                </Typography>

                {/*
                  The buyer bar is hidden on desktop, so without this a shopper
                  who opened their account from a wide screen had no way back to
                  the catalogue short of the browser's own back button.
                */}
                {!isSeller ? (
                    <Button
                        component={Link}
                        href={route('storefront.index')}
                        startIcon={<ArrowBackRoundedIcon />}
                        sx={{
                            color: "rgba(255,255,255,0.75)",
                            textTransform: "none",
                            fontWeight: 700,
                            "&:hover": { color: "#ffffff" },
                        }}
                    >
                        Back to shop
                    </Button>
                ) : null}
            </Box>

            <div className="px-4 py-2">
                <div className="max-w-4xl mx-auto space-y-4">

                    {/* Update Profile Information */}
                    <div className={CARD}>
                        <UpdateProfileInformationForm
                            mustVerifyEmail={mustVerifyEmail}
                            status={status}
                        />
                    </div>

                    {/* Update Password */}
                    <div className={CARD}>
                        <UpdatePasswordForm />
                    </div>

                    {/* Delete User */}
                    <div className={CARD}>
                        <DeleteUserForm />
                    </div>

                </div>
            </div>
        </>
    );
}

Edit.layout = (page) => <AccountLayout>{page}</AccountLayout>;
