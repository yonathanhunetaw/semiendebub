import * as React from "react";

/**
 * Keeps what someone has typed but not saved, so leaving the page (another tab, a link, a reload)
 * and coming back loses nothing. The value is kept in localStorage under `key` only while it differs
 * from `saved`; saving calls `clear()`. Every storage call is guarded: a private window or blocked
 * storage just means no draft, never an error.
 */
export function useDraft<T>(key: string, saved: T) {
    const [restored, setRestored] = React.useState(false);
    const [value, setValue] = React.useState<T>(() => {
        try {
            const raw = window.localStorage.getItem(key);
            if (raw !== null) {
                const stored = JSON.parse(raw) as T;
                if (JSON.stringify(stored) !== JSON.stringify(saved)) {
                    return stored;
                }
            }
        } catch {
            // no storage: start from what is saved
        }

        return saved;
    });

    React.useEffect(() => {
        try {
            if (JSON.stringify(value) !== JSON.stringify(saved) && window.localStorage.getItem(key) !== null) {
                setRestored(true);
            }
        } catch {
            // ignore
        }
        // only at first render: was a draft found?
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const dirty = JSON.stringify(value) !== JSON.stringify(saved);

    React.useEffect(() => {
        try {
            if (dirty) {
                window.localStorage.setItem(key, JSON.stringify(value));
            } else {
                window.localStorage.removeItem(key);
            }
        } catch {
            // ignore
        }
    }, [key, value, dirty]);

    /** Forget the draft and go back to what is saved. */
    const discard = React.useCallback(() => {
        setValue(saved);
        setRestored(false);
        try {
            window.localStorage.removeItem(key);
        } catch {
            // ignore
        }
    }, [key, saved]);

    /** After a successful save the server's copy is the truth: drop the draft. */
    const clear = React.useCallback(() => {
        setRestored(false);
        try {
            window.localStorage.removeItem(key);
        } catch {
            // ignore
        }
    }, [key]);

    return { value, setValue, dirty, restored, discard, clear };
}
