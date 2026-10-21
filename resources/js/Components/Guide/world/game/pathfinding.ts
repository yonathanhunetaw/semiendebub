/**
 * Tap-to-walk: the way round the walls from where the worker stands to
 * where they were sent. The ground is cut into small square cells, each
 * open or not (decided once, by the caller, with the worker's own size, so
 * an open cell is somewhere they fit). A* finds the cells between, and the
 * path is then pulled straight wherever a straight line is clear, so they
 * walk in lines, not grid steps. Pure: no imports, `node --test` runs it.
 */

export interface Grid {
    minX: number;
    minZ: number;
    cell: number;
    cols: number;
    rows: number;
    /** 1 where the worker fits, row by row (index = row * cols + col). */
    open: Uint8Array;
}

export type Point = [number, number];

export function makeGrid(minX: number, minZ: number, maxX: number, maxZ: number, cell: number, isOpen: (x: number, z: number) => boolean): Grid {
    const cols = Math.ceil((maxX - minX) / cell);
    const rows = Math.ceil((maxZ - minZ) / cell);
    const open = new Uint8Array(cols * rows);
    for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
            open[row * cols + col] = isOpen(minX + (col + 0.5) * cell, minZ + (row + 0.5) * cell) ? 1 : 0;
        }
    }
    return { minX, minZ, cell, cols, rows, open };
}

const colOf = (g: Grid, x: number) => Math.floor((x - g.minX) / g.cell);
const rowOf = (g: Grid, z: number) => Math.floor((z - g.minZ) / g.cell);
const centre = (g: Grid, index: number): Point => [g.minX + ((index % g.cols) + 0.5) * g.cell, g.minZ + (Math.floor(index / g.cols) + 0.5) * g.cell];

function isOpenCell(g: Grid, col: number, row: number): boolean {
    return col >= 0 && row >= 0 && col < g.cols && row < g.rows && g.open[row * g.cols + col] === 1;
}

/** The open cell nearest a point, searched in growing squares; -1 if none within `reach` cells. */
export function nearestOpen(g: Grid, x: number, z: number, reach = 40): number {
    const c0 = colOf(g, x);
    const r0 = rowOf(g, z);
    if (isOpenCell(g, c0, r0)) return r0 * g.cols + c0;
    let best = -1;
    let bestD = Infinity;
    for (let ring = 1; ring <= reach && best < 0; ring++) {
        for (let dr = -ring; dr <= ring; dr++) {
            for (let dc = -ring; dc <= ring; dc++) {
                if (Math.max(Math.abs(dr), Math.abs(dc)) !== ring || !isOpenCell(g, c0 + dc, r0 + dr)) continue;
                const index = (r0 + dr) * g.cols + c0 + dc;
                const [cx, cz] = centre(g, index);
                const d = (cx - x) ** 2 + (cz - z) ** 2;
                if (d < bestD) {
                    bestD = d;
                    best = index;
                }
            }
        }
    }
    return best;
}

/** Is the straight line from a to b open the whole way? Sampled every quarter cell. */
export function clearLine(g: Grid, a: Point, b: Point): boolean {
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const steps = Math.max(1, Math.ceil(length / (g.cell * 0.25)));
    for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        if (!isOpenCell(g, colOf(g, a[0] + (b[0] - a[0]) * t), rowOf(g, a[1] + (b[1] - a[1]) * t))) return false;
    }
    return true;
}

/** A binary heap of cell indexes, smallest score first. */
class Heap {
    private items: number[] = [];
    // A plain field, not a constructor parameter property: Node's type stripping cannot run those.
    private readonly score: Float64Array;
    constructor(score: Float64Array) {
        this.score = score;
    }
    get size(): number {
        return this.items.length;
    }
    push(index: number): void {
        const a = this.items;
        a.push(index);
        let i = a.length - 1;
        while (i > 0) {
            const parent = (i - 1) >> 1;
            if (this.score[a[parent]] <= this.score[a[i]]) break;
            [a[parent], a[i]] = [a[i], a[parent]];
            i = parent;
        }
    }
    pop(): number {
        const a = this.items;
        const top = a[0];
        const last = a.pop()!;
        if (a.length > 0) {
            a[0] = last;
            let i = 0;
            for (;;) {
                const l = 2 * i + 1;
                const r = l + 1;
                let m = i;
                if (l < a.length && this.score[a[l]] < this.score[a[m]]) m = l;
                if (r < a.length && this.score[a[r]] < this.score[a[m]]) m = r;
                if (m === i) break;
                [a[m], a[i]] = [a[i], a[m]];
                i = m;
            }
        }
        return top;
    }
}

const NEIGHBOURS: Array<[number, number, number]> = [
    [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
    [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2],
];

/**
 * The way from `from` to `to` as corner points to walk through, ending on
 * `to` itself when it is open (on the nearest open spot when it is not).
 * The first point is the first corner, not where the worker already stands.
 * Null when there is no way at all.
 */
export function findPath(g: Grid, from: Point, to: Point): Point[] | null {
    const start = nearestOpen(g, from[0], from[1]);
    const goal = nearestOpen(g, to[0], to[1]);
    if (start < 0 || goal < 0) return null;
    const goalOpen = goal === rowOf(g, to[1]) * g.cols + colOf(g, to[0]);
    const end: Point = goalOpen ? to : centre(g, goal);

    const n = g.cols * g.rows;
    const cost = new Float64Array(n).fill(Infinity);
    const score = new Float64Array(n).fill(Infinity);
    const came = new Int32Array(n).fill(-1);
    const closed = new Uint8Array(n);
    const gc = goal % g.cols;
    const gr = Math.floor(goal / g.cols);
    // Octile distance: never more than the true cost on an 8-way grid.
    const guess = (index: number) => {
        const dc = Math.abs((index % g.cols) - gc);
        const dr = Math.abs(Math.floor(index / g.cols) - gr);
        return Math.max(dc, dr) + (Math.SQRT2 - 1) * Math.min(dc, dr);
    };

    const heap = new Heap(score);
    cost[start] = 0;
    score[start] = guess(start);
    heap.push(start);

    while (heap.size > 0) {
        const current = heap.pop();
        if (current === goal) break;
        if (closed[current]) continue;
        closed[current] = 1;
        const col = current % g.cols;
        const row = Math.floor(current / g.cols);
        for (const [dc, dr, step] of NEIGHBOURS) {
            const nc = col + dc;
            const nr = row + dr;
            if (!isOpenCell(g, nc, nr)) continue;
            // No cutting a corner diagonally between two blocked cells.
            if (dc !== 0 && dr !== 0 && (!isOpenCell(g, col + dc, row) || !isOpenCell(g, col, row + dr))) continue;
            const next = nr * g.cols + nc;
            const tentative = cost[current] + step;
            if (tentative >= cost[next]) continue;
            cost[next] = tentative;
            came[next] = current;
            score[next] = tentative + guess(next);
            heap.push(next);
        }
    }
    if (start !== goal && came[goal] < 0) return null;

    // Cells from the goal back to the start, then forward as points.
    const cells: Point[] = [];
    for (let at = goal; at !== -1 && at !== start; at = came[at]) cells.push(centre(g, at));
    cells.reverse();
    if (cells.length === 0) cells.push(end);
    else cells[cells.length - 1] = end;

    // Pull the string tight: from each kept point, skip ahead as far as a straight line is clear.
    const path: Point[] = [];
    let anchor: Point = from;
    let i = 0;
    while (i < cells.length) {
        let j = cells.length - 1;
        while (j > i && !clearLine(g, anchor, cells[j])) j--;
        path.push(cells[j]);
        anchor = cells[j];
        i = j + 1;
    }
    return path;
}
