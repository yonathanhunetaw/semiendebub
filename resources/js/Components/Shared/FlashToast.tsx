import { usePage } from "@inertiajs/react";
import React from "react";

interface Flash {
    success?: string | null;
    error?: string | null;
}

/** How long a toast stays up, like Android's Toast.LENGTH_SHORT / LONG. */
const DURATION_MS = { success: 3000, error: 4500 } as const;

/**
 * The session flash (`flash.success` / `flash.error`, shared by
 * HandleInertiaRequests) as an Android-style toast: a small pill near the
 * bottom of the screen that fades out on its own; a tap dismisses it early.
 *
 * It keys on the flash *object*, which every full server response replaces,
 * so the same message twice in a row still shows twice; partial reloads keep
 * the old object and don't re-show it. Layouts render one of these; pages
 * don't need their own.
 */
export default function FlashToast({
    bottomClass = "bottom-[calc(96px+env(safe-area-inset-bottom))]",
}: {
    /** Tailwind `bottom-*` that clears the layout's bottom bar, if it has one. */
    bottomClass?: string;
}) {
    const flash = usePage<{ flash?: Flash }>().props.flash;
    const [toast, setToast] = React.useState<{ kind: "success" | "error"; text: string } | null>(null);
    const [visible, setVisible] = React.useState(false);

    React.useEffect(() => {
        const next = flash?.error
            ? { kind: "error" as const, text: flash.error }
            : flash?.success
              ? { kind: "success" as const, text: flash.success }
              : null;
        if (!next) return;

        setToast(next);
        setVisible(true);
        const hide = window.setTimeout(() => setVisible(false), DURATION_MS[next.kind]);
        return () => window.clearTimeout(hide);
    }, [flash]);

    if (!toast) return null;

    return (
        <div className={`pointer-events-none fixed inset-x-0 z-[1400] flex justify-center px-6 ${bottomClass}`}>
            <button
                type="button"
                role={toast.kind === "error" ? "alert" : "status"}
                aria-live={toast.kind === "error" ? "assertive" : "polite"}
                onClick={() => setVisible(false)}
                onTransitionEnd={() => !visible && setToast(null)}
                className={`flex max-w-[420px] items-center gap-2 rounded-[999px] px-4 py-2.5 text-left text-[13px] font-medium shadow-lg transition-all duration-300 motion-reduce:transition-none ${
                    visible ? "pointer-events-auto translate-y-0 opacity-100" : "translate-y-2 opacity-0"
                } ${toast.kind === "error" ? "bg-error text-on-error" : "bg-inverse-surface text-inverse-on-surface"}`}
            >
                <span className="material-symbols-outlined text-[18px]">{toast.kind === "error" ? "error" : "check_circle"}</span>
                <span>{toast.text}</span>
            </button>
        </div>
    );
}
