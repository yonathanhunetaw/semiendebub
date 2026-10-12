import type { Tone } from "@/Components/Shared/ui";
import type { StocktakeStatus } from "@/types/stockkeeper";

/** How a stocktake's status reads, on the list and on the count itself. */
export const STOCKTAKE_STATUS: Record<StocktakeStatus, { label: string; tone: Tone; icon: string }> = {
    counting: { label: "Counting", tone: "primary", icon: "fact_check" },
    submitted: { label: "Waiting approval", tone: "warning", icon: "hourglass_top" },
    posted: { label: "Booked", tone: "success", icon: "task_alt" },
    voided: { label: "Voided", tone: "neutral", icon: "block" },
};
