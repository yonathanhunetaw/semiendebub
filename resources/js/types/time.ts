/** Services\Workforce\TimeFilter::describe */
export interface TimeFilterView {
    when: string;
    date: string | null;
    options: { key: string; label: string }[];
}

/** Services\Workforce\DayBook::tag: the business day a record belongs to. */
export interface DayTagView {
    /** "2026-10-19", or "outside" when the store was not open. */
    key: string;
    /** "Today", "Yesterday", "Monday, Oct 19", "Outside open hours". */
    label: string;
    outside: boolean;
    /** The shops' calendar date of the moment. */
    date: string;
}
