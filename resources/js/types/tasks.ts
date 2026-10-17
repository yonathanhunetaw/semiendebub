/** One thing the signed-in user has to do (App\Services\Tasks\TaskInbox). */
export interface UserTask {
    id: string;
    kind: "payment" | "cash" | "handover" | "warning" | "parcel" | "shelf" | "hub" | "refill" | "truck" | "key" | "shift" | "site" | string;
    title: string;
    detail: string;
    count: number;
    /** Absolute when it opens another app. */
    href: string | null;
    urgent: boolean;
}
