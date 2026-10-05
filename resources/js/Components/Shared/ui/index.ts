/**
 * Shared UI components: Tailwind + theme tokens only, so each one follows
 * the module's role color (data-role) and light/dark (data-mode).
 * Showcase: dev subdomain, /design-system.
 */
export { ActionTile, type ActionTileProps } from "./ActionTile";
export { Card, type CardProps } from "./Card";
export { EmptyState, type EmptyStateProps } from "./EmptyState";
export {
    HeaderIconButton,
    headerIconButtonClass,
    PageHeader,
    type HeaderIconButtonProps,
    type PageHeaderProps,
} from "./PageHeader";
export { SectionTitle, type SectionTitleAction, type SectionTitleProps } from "./SectionTitle";
export { countBadge, StatCard, type StatCardProps } from "./StatCard";
export {
    STATUS_TONES,
    StatusPill,
    statusLabel,
    statusTone,
    type StatusPillProps,
    type StatusPillSize,
} from "./StatusPill";
export { TONE_NAMES, TONES, type Tone } from "./tones";
