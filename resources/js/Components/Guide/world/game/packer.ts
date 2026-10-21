/**
 * The freight car's hold, filled box by box. Pure: no imports, `node --test`
 * runs it.
 *
 * The hold's floor is cut into small square patches (`cell`, 10 cm), and
 * each remembers how high the stack on it reaches (a height map). A box may
 * go where it fits under the roof and at least 70% of its footprint rests on
 * what is below at that height (the floor counts): nothing floats. Of every
 * place a box could go, in either way round, it takes the one nearest the
 * cab, then the lowest, then the leftmost, so the load goes up as a wall at
 * the front and moves back towards the doors, as a loader stacks a van.
 *
 * Coordinates are metres inside the hold: x from the cab end towards the
 * doors, y up from the floor, z across from the left side; a placed box
 * gives its near-low-left corner and its size.
 */

export interface Hold {
    /** Front (cab) to doors, across, floor to roof; metres. */
    length: number;
    width: number;
    height: number;
    /** The size of a floor patch, in metres. */
    cell: number;
}

export interface PackBox {
    /** What it belongs to (a manifest line), carried through to the placed box. */
    key: number;
    /** How many units it stands for. */
    units: number;
    /** Size, metres: along the hold, up, across (it may be turned on the floor). */
    l: number;
    h: number;
    w: number;
}

export interface Placed extends PackBox {
    x: number;
    y: number;
    z: number;
}

export interface Packing {
    hold: Hold;
    cols: number;
    rows: number;
    layers: number;
    /** Top of the stack on each patch, in cells (index = col * rows + row). */
    heights: Uint16Array;
    placed: Placed[];
}

/** The share of a box's footprint that must rest on something. */
export const SUPPORT = 0.7;
/** A van's hold: this wide and high; the length follows from the volume. */
export const HOLD_WIDTH = 1.8;
export const HOLD_HEIGHT = 2.0;
/** A car with no volume recorded is taken to hold this much. */
export const DEFAULT_TRUCK_CBM = 20;

/** The hold of a car of `maxCbm` (null: the default): fixed width and height, the length to make up the volume. */
export function holdFor(maxCbm: number | null, cell = 0.1): Hold {
    const cbm = maxCbm && maxCbm > 0 ? maxCbm : DEFAULT_TRUCK_CBM;
    return { length: Math.max(1, cbm / (HOLD_WIDTH * HOLD_HEIGHT)), width: HOLD_WIDTH, height: HOLD_HEIGHT, cell };
}

export function startPacking(hold: Hold): Packing {
    const cols = Math.floor(hold.length / hold.cell + 1e-9);
    const rows = Math.floor(hold.width / hold.cell + 1e-9);
    return { hold, cols, rows, layers: Math.floor(hold.height / hold.cell + 1e-9), heights: new Uint16Array(cols * rows), placed: [] };
}

const cells = (metres: number, cell: number) => Math.max(1, Math.ceil(metres / cell - 1e-9));

/** The best spot for a footprint of `bl` × `bw` cells and `bh` tall, or null. */
function bestSpot(p: Packing, bl: number, bw: number, bh: number): { col: number; row: number; base: number } | null {
    if (bl > p.cols || bw > p.rows || bh > p.layers) return null;
    for (let col = 0; col + bl <= p.cols; col++) {
        let best: { row: number; base: number } | null = null;
        for (let row = 0; row + bw <= p.rows; row++) {
            let base = 0;
            for (let c = col; c < col + bl; c++) for (let r = row; r < row + bw; r++) base = Math.max(base, p.heights[c * p.rows + r]);
            if (base + bh > p.layers) continue;
            if (base > 0) {
                let resting = 0;
                for (let c = col; c < col + bl; c++) for (let r = row; r < row + bw; r++) if (p.heights[c * p.rows + r] === base) resting++;
                if (resting < SUPPORT * bl * bw - 1e-9) continue;
            }
            if (!best || base < best.base) best = { row, base };
        }
        // Nearest the cab wins; at that distance, the lowest (then the leftmost, found first).
        if (best) return { col, ...best };
    }
    return null;
}

/** Put a box in the hold, turned if that is the only way (or a better place); null when it fits nowhere. */
export function place(p: Packing, box: PackBox): Placed | null {
    const { cell } = p.hold;
    const bh = cells(box.h, cell);
    const ways: Array<{ l: number; w: number }> = [{ l: box.l, w: box.w }];
    if (Math.abs(box.l - box.w) > 1e-9) ways.push({ l: box.w, w: box.l });

    let chosen: { col: number; row: number; base: number; l: number; w: number } | null = null;
    for (const way of ways) {
        const spot = bestSpot(p, cells(way.l, cell), cells(way.w, cell), bh);
        if (!spot) continue;
        if (!chosen || spot.col < chosen.col || (spot.col === chosen.col && spot.base < chosen.base)) chosen = { ...spot, ...way };
    }
    if (!chosen) return null;

    const bl = cells(chosen.l, cell);
    const bw = cells(chosen.w, cell);
    for (let c = chosen.col; c < chosen.col + bl; c++) for (let r = chosen.row; r < chosen.row + bw; r++) p.heights[c * p.rows + r] = chosen.base + bh;
    // The box takes whole patches, so it is drawn at that size: what is stacked on it then sits on its top, not a hair above.
    const metres = (n: number) => Math.round(n * cell * 1000) / 1000;
    const placed: Placed = { ...box, l: metres(bl), h: metres(bh), w: metres(bw), x: metres(chosen.col), y: metres(chosen.base), z: metres(chosen.row) };
    p.placed.push(placed);
    return placed;
}

/** Pack several, biggest first (what is already in a car when it is opened); returns those that did not fit. */
export function packAll(p: Packing, boxes: PackBox[]): PackBox[] {
    const left: PackBox[] = [];
    for (const box of [...boxes].sort((a, b) => b.l * b.h * b.w - a.l * a.h * a.w)) if (!place(p, box)) left.push(box);
    return left;
}

/** The smallest side drawn and packed, in metres: anything smaller travels as at least this. */
export const MIN_SIDE = 0.15;
/** Small units travel together, about this much to a box (m³), as pieces go in a carton. */
const SMALL_BOX_CBM = 0.03;

/**
 * The boxes `units` of a unit of `unitCbm` m³ travel as: one box per unit
 * when a unit is a fair size; small units grouped, about 0.03 m³ to a box.
 * Each box is a cube of its volume, at least MIN_SIDE.
 */
export function boxesFor(key: number, units: number, unitCbm: number): PackBox[] {
    if (units <= 0) return [];
    const perBox = unitCbm >= SMALL_BOX_CBM / 3 ? 1 : Math.max(1, Math.floor(SMALL_BOX_CBM / unitCbm));
    const boxes: PackBox[] = [];
    for (let left = units; left > 0; left -= perBox) {
        const n = Math.min(perBox, left);
        const side = Math.max(MIN_SIDE, Math.cbrt(n * unitCbm));
        boxes.push({ key, units: n, l: side, h: side, w: side });
    }
    return boxes;
}
