/**
 * Material Symbol for a category, picked from keywords in its name so new
 * categories get a sensible icon without a code change. First match wins,
 * so specific words come before general ones.
 */
const CATEGORY_ICONS: [RegExp, string][] = [
    [/sticky|post-?it/i, "sticky_note_2"],
    [/note ?book|diar|journal/i, "menu_book"],
    [/copy|printer|paper|a4|ream/i, "description"],
    // Art subcategories before the catch-all "art" below.
    [/canvas/i, "crop_original"],
    [/brush/i, "brush"],
    [/oil/i, "format_paint"],
    [/water ?colou?r/i, "water_drop"],
    [/acrylic/i, "colors"],
    [/sketch|drawing/i, "draw"],
    [/easel|board|stand/i, "developer_board"],
    [/palette|knife|knives/i, "hardware"],
    [/art|paint|colou?r|craft/i, "palette"],
    [/pen\b|pens\b|pencil|writing|marker/i, "edit"],
    [/highlight/i, "ink_highlighter"],
    [/desk/i, "desk"],
    [/file|folder|binder|archive/i, "folder_open"],
    [/packag|tape|box/i, "inventory_2"],
    [/kid|child|toy/i, "child_friendly"],
    [/school|student/i, "school"],
    [/measur|ruler|scale/i, "straighten"],
    [/calculat/i, "calculate"],
    [/office|business/i, "business_center"],
    [/adhesive|glue|bind|fasten|clip|staple/i, "attach_file"],
];

export function categoryIcon(name: string | null | undefined): string {
    if (!name) return "category";
    return CATEGORY_ICONS.find(([pattern]) => pattern.test(name))?.[1] ?? "category";
}
