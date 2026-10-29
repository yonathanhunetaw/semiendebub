import React from "react";
import { Link, usePage } from "@inertiajs/react";
import { Box, Button, Fab, Tooltip } from "@mui/material";
import HelpOutlineRounded from "@mui/icons-material/HelpOutlineRounded";
import AppIcon from "@/Components/Visual/AppIcon";
import type { GuideApp } from "./chapters";
import { guideHrefFor } from "./guideLinks";

/**
 * The one way into the guide from any page: it opens the step that explains
 * this page. A small chip on the admin app, a small round button above the
 * bottom bar on the phone-first apps. Hidden on the guide itself.
 */
export default function GuideButton({ app, variant = "chip" }: { app: GuideApp; variant?: "chip" | "fab" }) {
    const { url } = usePage();
    const path = url.split("?")[0];

    if (path.startsWith("/guide")) return null;

    const href = guideHrefFor(app, path);

    if (variant === "fab") {
        return (
            <Tooltip title="How this works" placement="left">
                {/* `dock-float` keeps it above the bottom nav, and follows the nav down when it hides (app.css). */}
                <Fab component={Link} href={href} size="small" color="primary" aria-label="How this works" className="dock-float guide-fab"
                    sx={{ position: "fixed", right: 16, zIndex: (theme) => theme.zIndex.appBar - 1, boxShadow: 4, "--dock-gap": "14px", transition: "bottom 0.25s ease" }}>
                    <HelpOutlineRounded />
                </Fab>
            </Tooltip>
        );
    }

    return (
        <Box sx={{ display: "flex", justifyContent: "flex-end", mb: 1, mt: { xs: -0.5, sm: -1 } }}>
            <Button component={Link} href={href} size="small" variant="text" startIcon={<AppIcon role={app} size={22} />} endIcon={<HelpOutlineRounded fontSize="small" />}
                sx={{ borderRadius: 999, fontWeight: 700, px: 1.25, color: "text.secondary", "& .MuiButton-startIcon": { mr: 1 } }}>
                How this works
            </Button>
        </Box>
    );
}
