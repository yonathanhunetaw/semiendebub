#!/usr/bin/env node
/**
 * `npm run check:colors` (run inside the container): the hex-drift guard.
 *
 * Fails when a hard-coded color appears in resources/js/**\/*.{ts,tsx,jsx}
 * outside resources/js/theme/ (where token values are defined):
 *   - hex literals: #rgb, #rgba, #rrggbb, #rrggbbaa
 *   - rgb( / rgba( / hsl( / hsla( calls, except rgb(var(--token) ...) which
 *     reads a theme token and is therefore allowed
 * Comments count too: the check is textual on purpose.
 *
 * Existing violations are grandfathered in scripts/color-allowlist.txt, one
 * `<path> <count>` line per file. The count is a ratchet:
 *   - a file not listed, or over its count            -> FAIL (new colors)
 *   - a listed file now under its count, or gone      -> FAIL (stale entry; lower it)
 * so the allowlist can only shrink. Use a token class instead of a new color
 * (see docs/DESIGN.md).
 *
 *   npm run check:colors                 check
 *   npm run check:colors -- --update     lower/remove stale entries (never raises or adds)
 *   npm run check:colors -- --seed       write the allowlist from scratch (only if it does not exist)
 *   npm run check:colors -- --reseed     rewrite the whole allowlist from the current scan (raises too).
 *                                        Only for when the CHECK itself got stricter and surfaced colors
 *                                        that were always there; refuses unless the allowlist is committed,
 *                                        so the raise shows up as its own reviewable diff. Say why in the commit.
 *
 * Matching boundaries: a literal counts when it is not glued to a letter or digit, so it is also caught
 * inside Tailwind arbitrary values, where `_` stands for a space and `[` `,` `:` `(` start a value:
 * `shadow-[0_4px_rgba(0,0,0,.1)]`, `bg-[#fff]`, `ring-[0_0_0_1px_#e2e8f0]`. (`\b` does not match
 * between `_` and a letter, which used to hide those.)
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const root = process.cwd();
const SCAN_DIR = 'resources/js';
const EXCLUDE_DIRS = ['resources/js/theme'];
const EXTENSIONS = ['.ts', '.tsx', '.jsx'];
const ALLOWLIST = 'scripts/color-allowlist.txt';

// Not preceded by a letter/digit (`_` is allowed: it is a space in Tailwind arbitrary values).
const HEX = /(?<![A-Za-z0-9$&#])#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})(?![\w-])/g;
const COLOR_FN = /(?<![A-Za-z0-9$])(?:rgba?|hsla?)\((?!\s*var\()/gi;

const args = new Set(process.argv.slice(2));
const toPosix = (p) => p.split(sep).join('/');

function walk(dir, files = []) {
    for (const entry of readdirSync(join(root, dir), { withFileTypes: true })) {
        const rel = `${dir}/${entry.name}`;
        if (entry.isDirectory()) {
            if (!EXCLUDE_DIRS.includes(rel) && entry.name !== 'node_modules') walk(rel, files);
        } else if (EXTENSIONS.some((ext) => entry.name.endsWith(ext))) {
            files.push(rel);
        }
    }
    return files;
}

/** path -> [{ line, match }] */
function scan() {
    const found = new Map();
    for (const file of walk(SCAN_DIR).sort()) {
        const hits = [];
        readFileSync(join(root, file), 'utf8')
            .split('\n')
            .forEach((text, i) => {
                for (const re of [HEX, COLOR_FN]) {
                    re.lastIndex = 0;
                    for (const m of text.matchAll(re)) hits.push({ line: i + 1, match: m[0].trim() });
                }
            });
        if (hits.length) found.set(toPosix(relative(root, join(root, file))), hits);
    }
    return found;
}

function readAllowlist() {
    const allowed = new Map();
    if (!existsSync(join(root, ALLOWLIST))) return allowed;
    readFileSync(join(root, ALLOWLIST), 'utf8')
        .split('\n')
        .forEach((raw, i) => {
            const line = raw.trim();
            if (!line || line.startsWith('#')) return;
            const m = line.match(/^(\S+)\s+(\d+)$/);
            if (!m) {
                console.error(`${ALLOWLIST}:${i + 1}: expected "<path> <count>", got: ${raw}`);
                process.exit(2);
            }
            allowed.set(m[1], Number(m[2]));
        });
    return allowed;
}

function writeAllowlist(entries) {
    const header = [
        '# Grandfathered hard-coded colors, checked by `npm run check:colors` (scripts/check-colors.mjs).',
        '# One "<path> <count>" per file. Counts may only go DOWN: when you clean a file, lower or delete its',
        '# line (`npm run check:colors -- --update` does it for you). Never raise a count or add a file;',
        '# use a token class instead (docs/DESIGN.md, section 3).',
        '',
    ];
    const body = [...entries].sort(([a], [b]) => a.localeCompare(b)).map(([p, n]) => `${p} ${n}`);
    writeFileSync(join(root, ALLOWLIST), [...header, ...body, ''].join('\n'));
}

const found = scan();
const totalFound = [...found.values()].reduce((n, h) => n + h.length, 0);

if (args.has('--seed')) {
    if (existsSync(join(root, ALLOWLIST))) {
        console.error(`${ALLOWLIST} already exists; --seed only creates it. Use --update to lower counts.`);
        process.exit(2);
    }
    writeAllowlist(new Map([...found].map(([p, h]) => [p, h.length])));
    console.log(`Seeded ${ALLOWLIST}: ${found.size} files, ${totalFound} colors.`);
    process.exit(0);
}

if (args.has('--reseed')) {
    let dirty;
    try {
        dirty = execFileSync('git', ['status', '--porcelain', '--', ALLOWLIST], { cwd: root, encoding: 'utf8' }).trim();
    } catch (e) {
        console.error(`--reseed needs git to confirm ${ALLOWLIST} is committed: ${e.message}`);
        process.exit(2);
    }
    if (dirty) {
        console.error(`${ALLOWLIST} has uncommitted changes; commit or discard them before --reseed.`);
        process.exit(2);
    }
    const before = readAllowlist();
    const beforeTotal = [...before.values()].reduce((a, b) => a + b, 0);
    writeAllowlist(new Map([...found].map(([p, h]) => [p, h.length])));
    console.log(`Reseeded ${ALLOWLIST}: ${beforeTotal} in ${before.size} files -> ${totalFound} in ${found.size} files.`);
    console.log('Review the diff; a reseed is only for a stricter check, never to admit new colors.');
    process.exit(0);
}

let allowed = readAllowlist();
const over = []; // [path, allowed, hits]
const stale = []; // [path, allowed, actual]
for (const [path, hits] of found) {
    const limit = allowed.get(path) ?? 0;
    if (hits.length > limit) over.push([path, limit, hits]);
}
for (const [path, limit] of allowed) {
    const actual = found.get(path)?.length ?? 0;
    if (actual < limit) stale.push([path, limit, actual]);
}

if (args.has('--update')) {
    const next = new Map(allowed);
    for (const [path, , actual] of stale) {
        if (actual === 0) next.delete(path);
        else next.set(path, actual);
    }
    writeAllowlist(next);
    allowed = next;
    console.log(`Updated ${ALLOWLIST}: lowered/removed ${stale.length} entr${stale.length === 1 ? 'y' : 'ies'}.`);
    if (over.length) console.log(`(${over.length} file(s) are still OVER their allowance; --update never raises a count.)`);
    stale.length = 0;
}

const allowedTotal = [...allowed.values()].reduce((a, b) => a + b, 0);

if (over.length) {
    console.log(`\nNEW hard-coded colors (use a token class from docs/DESIGN.md instead):\n`);
    for (const [path, limit, hits] of over) {
        console.log(`  ${path}: ${hits.length} found, ${limit} allowed (+${hits.length - limit})`);
        for (const h of hits) console.log(`    ${path}:${h.line}  ${h.match}`);
    }
}
if (stale.length) {
    console.log(`\nStale allowlist entries (good: colors were removed). Lower them, or run \`npm run check:colors -- --update\`:\n`);
    for (const [path, limit, actual] of stale) {
        console.log(`  ${path}: allowed ${limit}, now ${actual} -> ${actual === 0 ? 'delete the line' : `set to ${actual}`}`);
    }
}

console.log(
    `\ncheck:colors: ${totalFound} hard-coded colors in ${found.size} files (allowlist: ${allowedTotal} in ${allowed.size} files); ` +
        `${over.length} file(s) over allowance, ${stale.length} stale entr${stale.length === 1 ? 'y' : 'ies'}.`,
);
if (over.length || stale.length) {
    console.log('check:colors: FAIL');
    process.exit(1);
}
console.log('check:colors: OK');
