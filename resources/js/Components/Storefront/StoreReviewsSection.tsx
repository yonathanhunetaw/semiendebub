import React from "react";
import { useForm } from "@inertiajs/react";
import { STOREFRONT_BRAND } from "@/Components/Storefront/storefrontConstants";
import { dayDate } from "@/utils/dates";

export interface StoreReviewsProps {
    average: number | null;
    count: number;
    latest: Array<{ id: number; rating: number; comment: string | null; by: string; at: string | null }>;
    /** Signed in and received an order from this store. */
    can_review: boolean;
    mine: { rating: number; comment: string | null } | null;
}

function Stars({ value, size = 16 }: { value: number; size?: number }) {
    return (
        <span aria-label={`${value} out of 5`} className="inline-flex">
            {[1, 2, 3, 4, 5].map((n) => (
                <span key={n} className={`material-symbols-outlined ${n <= Math.round(value) ? "text-warning" : "text-outline-variant"}`} style={{ fontSize: size, fontVariationSettings: "'FILL' 1" }}>
                    star
                </span>
            ))}
        </span>
    );
}

/** A store's reviews on its page: the average, the latest, and a form for someone who received an order from it. */
export default function StoreReviewsSection({ slug, reviews }: { slug: string; reviews: StoreReviewsProps }) {
    const { data, setData, post, processing, errors } = useForm({ rating: reviews.mine?.rating ?? 0, comment: reviews.mine?.comment ?? "" });

    return (
        <section aria-label="Reviews" className="mt-8 rounded-2xl border border-outline-variant bg-surface-container-lowest p-4">
            <div className="flex items-center justify-between gap-3">
                <h2 className="text-[15px] font-black text-on-surface">Reviews</h2>
                {reviews.average !== null ? (
                    <div className="flex items-center gap-1.5 text-[12px] text-on-surface-variant">
                        <Stars value={reviews.average} />
                        <span className="font-bold text-on-surface">{reviews.average.toFixed(1)}</span>
                        <span>· {reviews.count} review{reviews.count === 1 ? "" : "s"}</span>
                    </div>
                ) : (
                    <span className="text-[12px] text-outline">No reviews yet</span>
                )}
            </div>

            {reviews.can_review ? (
                <form
                    className="mt-3 space-y-2 rounded-xl bg-surface-container-low p-3"
                    onSubmit={(e) => { e.preventDefault(); post(route("storefront.store.reviews.store", slug), { preserveScroll: true }); }}
                >
                    <p className="text-[12px] font-bold text-on-surface">{reviews.mine ? "Your review" : "You bought here: how was it?"}</p>
                    <div className="flex gap-1" role="radiogroup" aria-label="Your rating">
                        {[1, 2, 3, 4, 5].map((n) => (
                            <button key={n} type="button" role="radio" aria-checked={data.rating === n} aria-label={`${n} star${n === 1 ? "" : "s"}`} onClick={() => setData("rating", n)}>
                                <span className={`material-symbols-outlined ${n <= data.rating ? "text-warning" : "text-outline-variant"}`} style={{ fontSize: 26, fontVariationSettings: "'FILL' 1" }}>star</span>
                            </button>
                        ))}
                    </div>
                    <textarea
                        value={data.comment}
                        onChange={(e) => setData("comment", e.target.value)}
                        rows={2}
                        maxLength={1000}
                        placeholder="A few words for other shoppers (optional)"
                        aria-label="Your review"
                        className="w-full rounded-lg border border-outline-variant bg-surface-container-lowest p-2 text-[13px]"
                    />
                    {errors.rating && <p className="text-[11px] text-error">{errors.rating}</p>}
                    <button
                        type="submit"
                        disabled={processing || data.rating === 0}
                        className="rounded-xl px-4 py-2 text-[12px] font-bold text-on-primary disabled:opacity-40"
                        style={{ backgroundColor: STOREFRONT_BRAND }}
                    >
                        {reviews.mine ? "Update review" : "Post review"}
                    </button>
                </form>
            ) : null}

            <ul className="mt-3 divide-y divide-outline-variant/60">
                {reviews.latest.map((r) => (
                    <li key={r.id} className="py-2.5">
                        <div className="flex items-center justify-between gap-2">
                            <Stars value={r.rating} size={14} />
                            <span className="text-[11px] text-outline">{r.by} · {dayDate(r.at)}</span>
                        </div>
                        {r.comment ? <p className="mt-1 text-[13px] text-on-surface">{r.comment}</p> : null}
                    </li>
                ))}
            </ul>
        </section>
    );
}
