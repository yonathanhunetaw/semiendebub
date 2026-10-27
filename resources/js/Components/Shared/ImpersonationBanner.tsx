import React, { useEffect, useState } from "react";
import { ListItemButton, ListItemText } from "@mui/material";
import { router } from "@inertiajs/react";
import { AppsMenu } from "@/Components/Navigation/Admin/RoleSwitcher";
import { useRole } from "@/theme";

interface Impersonator {
    id: number;
    name: string;
    /** The admin's own account in another app, not someone else's. */
    self?: boolean;
}

interface PageProps {
    impersonating?: Impersonator | null;
    auth?: { user?: { first_name?: string; last_name?: string | null } | null };
}

const nameOf = (props: PageProps): string => `${props.auth?.user?.first_name ?? ""} ${props.auth?.user?.last_name ?? ""}`.trim();

/**
 * The Apps menu inside an app an admin has switched into
 * (ImpersonationController): a small round button above the guide's, shown
 * only while switched in, so it never appears for normal staff. Its menu says
 * who you are right now and who opened this app, lets the admin move on to another app without going back
 * first, and has Back to admin. Mounted once in app.tsx, outside the page
 * layouts, so it follows the shared `impersonating` prop by listening to
 * Inertia navigations.
 */
export default function ImpersonationBanner({ initial }: { initial: PageProps }) {
    // Outside the page tree: no usePage here, so follow the page props from navigations.
    const [props, setProps] = useState<PageProps>(initial);
    const role = useRole();
    const impersonator = props.impersonating ?? null;

    useEffect(() => router.on("navigate", (event) => setProps(event.detail.page.props as PageProps)), []);

    if (!impersonator) {
        return null;
    }

    return (
        <AppsMenu
            roleKey="admin"
            accountName={nameOf(props)}
            current={role}
            variant="fab"
            meHere={Boolean(impersonator.self)}
            header={impersonator.self ? "You" : `Opened by ${impersonator.name}`}
            footer={(close) => (
                <ListItemButton
                    onClick={() => {
                        close();
                        router.post("/impersonate/stop");
                    }}
                    sx={{ borderRadius: 2 }}
                >
                    <ListItemText primary="Back to admin" slotProps={{ primary: { sx: { fontWeight: 700, fontSize: "0.875rem" } } }} />
                </ListItemButton>
            )}
        />
    );
}
