import * as React from 'react';
import {
    Box,
    Chip,
    List,
    ListItemButton,
    ListItemText,
    Paper,
    Stack,
    Tooltip,
    Typography,
} from '@mui/material';

import {
    classBasename,
    ControllerNode,
    methodColor,
    ModelNode,
    PageNode,
    RouteNode,
} from '@/types/architecture';

const MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';

const NODE_W = 220;
const NODE_H = 44;
const NODE_GAP = 12;
const COL_GAP = 78;
const PADDING = 16;

const CLOSURE_KEY = '__closures__';

type NodeKind = 'route' | 'action' | 'model' | 'service' | 'request' | 'page';

interface GraphNode {
    id: string;
    kind: NodeKind;
    column: number;
    title: string;
    subtitle?: string;
    tooltip: string;
    accent: string;
    x: number;
    y: number;
}

interface GraphEdge {
    id: string;
    from: string;
    to: string;
}

const KIND_ACCENT: Record<NodeKind, string> = {
    route: '#0ea5e9',
    action: '#6366f1',
    model: '#8b5cf6',
    service: '#10b981',
    request: '#f59e0b',
    page: '#38bdf8',
};

const COLUMN_TITLES = ['Routes', 'Controller actions', 'Models · Services · Requests', 'TSX pages'];

interface ModuleGraphProps {
    routes: RouteNode[];
    controllers: ControllerNode[];
    models: Record<string, ModelNode>;
    pages: Record<string, PageNode>;
    domainColor: (domain: string) => string;
}

/**
 * Module map: pick a controller inside the current domain and see its whole
 * fan-out drawn as a directed graph —
 * routes → actions → models/services/requests → TSX pages.
 *
 * Node positions are computed deterministically, so the SVG connector layer and
 * the HTML node layer share one coordinate system without measuring the DOM.
 */
export default function ModuleGraph({
    routes,
    controllers,
    models,
    pages,
    domainColor,
}: ModuleGraphProps): React.ReactElement {
    const [selected, setSelected] = React.useState<string | null>(null);
    const [hovered, setHovered] = React.useState<string | null>(null);

    // Group the (already filtered) routes by the controller that serves them.
    const groups = React.useMemo(() => {
        const buckets = new Map<string, RouteNode[]>();

        routes.forEach((route) => {
            const key = route.action.class ?? CLOSURE_KEY;

            buckets.set(key, [...(buckets.get(key) ?? []), route]);
        });

        return [...buckets.entries()]
            .map(([key, items]) => ({
                key,
                label: key === CLOSURE_KEY ? 'Closure routes' : (items[0].action.short ?? classBasename(key)),
                domain: items[0].domain,
                routes: items,
            }))
            .sort((a, b) => b.routes.length - a.routes.length || a.label.localeCompare(b.label));
    }, [routes]);

    const activeKey = selected && groups.some((group) => group.key === selected) ? selected : groups[0]?.key ?? null;
    const activeGroup = groups.find((group) => group.key === activeKey) ?? null;

    const controller = React.useMemo(
        () => controllers.find((item) => item.class === activeKey) ?? null,
        [controllers, activeKey],
    );

    const { nodes, edges, width, height } = React.useMemo(
        () => buildGraph(activeGroup?.routes ?? []),
        [activeGroup],
    );

    const nodeById = React.useMemo(() => {
        const index = new Map<string, GraphNode>();
        nodes.forEach((node) => index.set(node.id, node));

        return index;
    }, [nodes]);

    // Neighbourhood of the hovered node, used to dim everything else.
    const highlighted = React.useMemo(() => {
        if (!hovered) {
            return null;
        }

        const ids = new Set<string>([hovered]);

        edges.forEach((edge) => {
            if (edge.from === hovered) ids.add(edge.to);
            if (edge.to === hovered) ids.add(edge.from);
        });

        return ids;
    }, [hovered, edges]);

    if (groups.length === 0) {
        return (
            <Typography sx={{ color: 'text.secondary', py: 6, textAlign: 'center' }}>
                No routes match the current filters, so there is nothing to draw.
            </Typography>
        );
    }

    return (
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} alignItems="stretch">
            {/* Module picker */}
            <Paper
                variant="outlined"
                sx={{ borderRadius: 2.5, width: { md: 272 }, flexShrink: 0, overflow: 'hidden', alignSelf: 'flex-start' }}
            >
                <Typography
                    variant="caption"
                    sx={{
                        display: 'block',
                        px: 1.5,
                        py: 1,
                        fontWeight: 800,
                        letterSpacing: 0.8,
                        textTransform: 'uppercase',
                        color: 'text.secondary',
                        borderBottom: '1px solid',
                        borderColor: 'divider',
                    }}
                >
                    Modules ({groups.length})
                </Typography>

                <List dense sx={{ maxHeight: 620, overflowY: 'auto', py: 0 }}>
                    {groups.map((group) => (
                        <ListItemButton
                            key={group.key}
                            selected={group.key === activeKey}
                            onClick={() => setSelected(group.key)}
                            sx={{
                                borderLeft: '3px solid',
                                borderLeftColor: group.key === activeKey ? domainColor(group.domain) : 'transparent',
                                py: 0.75,
                            }}
                        >
                            <ListItemText
                                primary={group.label}
                                secondary={`${group.routes.length} route${group.routes.length === 1 ? '' : 's'}`}
                                slotProps={{
                                    primary: { sx: { fontFamily: MONO, fontSize: 12.5, fontWeight: 600, wordBreak: 'break-word' } },
                                    secondary: { sx: { fontSize: 10.5 } },
                                }}
                            />
                        </ListItemButton>
                    ))}
                </List>
            </Paper>

            {/* Graph canvas */}
            <Paper variant="outlined" sx={{ borderRadius: 2.5, flexGrow: 1, minWidth: 0, p: 1.5 }}>
                <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1, flexWrap: 'wrap', gap: 1 }}>
                    <Typography sx={{ fontFamily: MONO, fontWeight: 800 }}>{activeGroup?.label}</Typography>
                    {controller?.file && (
                        <Typography variant="caption" sx={{ color: 'text.secondary', fontFamily: MONO }}>
                            {controller.file}
                        </Typography>
                    )}
                    <Box sx={{ flexGrow: 1 }} />
                    {(['route', 'action', 'model', 'service', 'request', 'page'] as NodeKind[]).map((kind) => (
                        <Stack key={kind} direction="row" spacing={0.5} alignItems="center">
                            <Box sx={{ width: 9, height: 9, borderRadius: '2px', bgcolor: KIND_ACCENT[kind] }} />
                            <Typography variant="caption" sx={{ color: 'text.secondary', textTransform: 'capitalize' }}>
                                {kind}
                            </Typography>
                        </Stack>
                    ))}
                </Stack>

                <Box sx={{ overflow: 'auto', pb: 1 }}>
                    <Box sx={{ position: 'relative', width, height, minWidth: width }}>
                        {/* Column headings */}
                        {COLUMN_TITLES.map((title, column) => (
                            <Typography
                                key={title}
                                variant="caption"
                                sx={{
                                    position: 'absolute',
                                    left: PADDING + column * (NODE_W + COL_GAP),
                                    top: 0,
                                    width: NODE_W,
                                    textAlign: 'center',
                                    color: 'text.secondary',
                                    fontWeight: 800,
                                    letterSpacing: 0.5,
                                    textTransform: 'uppercase',
                                    fontSize: 9.5,
                                }}
                            >
                                {title}
                            </Typography>
                        ))}

                        {/* Connector layer */}
                        <Box
                            component="svg"
                            width={width}
                            height={height}
                            sx={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'visible' }}
                        >
                            <defs>
                                <marker id="graph-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                                    <path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor" />
                                </marker>
                            </defs>

                            {edges.map((edge) => {
                                const from = nodeById.get(edge.from);
                                const to = nodeById.get(edge.to);

                                if (!from || !to) {
                                    return null;
                                }

                                const active = highlighted !== null && (edge.from === hovered || edge.to === hovered);
                                const dimmed = highlighted !== null && !active;

                                const x1 = from.x + NODE_W;
                                const y1 = from.y + NODE_H / 2;
                                const x2 = to.x;
                                const y2 = to.y + NODE_H / 2;
                                const curve = Math.max(28, (x2 - x1) / 2);

                                return (
                                    <Box
                                        key={edge.id}
                                        component="path"
                                        d={`M ${x1} ${y1} C ${x1 + curve} ${y1}, ${x2 - curve} ${y2}, ${x2} ${y2}`}
                                        fill="none"
                                        strokeWidth={active ? 2 : 1.25}
                                        markerEnd="url(#graph-arrow)"
                                        sx={{
                                            color: active ? to.accent : 'divider',
                                            stroke: active ? to.accent : 'currentColor',
                                            opacity: dimmed ? 0.18 : 1,
                                            transition: 'opacity 120ms ease, stroke-width 120ms ease',
                                        }}
                                    />
                                );
                            })}
                        </Box>

                        {/* Node layer */}
                        {nodes.map((node) => {
                            const dimmed = highlighted !== null && !highlighted.has(node.id);

                            return (
                                <Tooltip key={node.id} title={node.tooltip} placement="top">
                                    <Box
                                        onMouseEnter={() => setHovered(node.id)}
                                        onMouseLeave={() => setHovered(null)}
                                        sx={{
                                            position: 'absolute',
                                            left: node.x,
                                            top: node.y,
                                            width: NODE_W,
                                            height: NODE_H,
                                            px: 1,
                                            display: 'flex',
                                            flexDirection: 'column',
                                            justifyContent: 'center',
                                            borderRadius: 1.5,
                                            border: '1px solid',
                                            borderColor: 'divider',
                                            borderLeft: '3px solid',
                                            borderLeftColor: node.accent,
                                            bgcolor: 'background.paper',
                                            cursor: 'default',
                                            opacity: dimmed ? 0.28 : 1,
                                            boxShadow: hovered === node.id ? 3 : 0,
                                            transition: 'opacity 120ms ease, box-shadow 120ms ease',
                                        }}
                                    >
                                        <Typography
                                            sx={{
                                                fontFamily: MONO,
                                                fontSize: 11.5,
                                                fontWeight: 700,
                                                overflow: 'hidden',
                                                textOverflow: 'ellipsis',
                                                whiteSpace: 'nowrap',
                                            }}
                                        >
                                            {node.title}
                                        </Typography>
                                        {node.subtitle && (
                                            <Typography
                                                sx={{
                                                    fontFamily: MONO,
                                                    fontSize: 10,
                                                    color: 'text.secondary',
                                                    overflow: 'hidden',
                                                    textOverflow: 'ellipsis',
                                                    whiteSpace: 'nowrap',
                                                }}
                                            >
                                                {node.subtitle}
                                            </Typography>
                                        )}
                                    </Box>
                                </Tooltip>
                            );
                        })}
                    </Box>
                </Box>

                {/* Schema footnote for the models on screen */}
                {activeGroup && (
                    <Stack direction="row" spacing={0.5} sx={{ mt: 1, flexWrap: 'wrap', gap: 0.5 }}>
                        {[...new Set(activeGroup.routes.flatMap((route) => route.models))].map((model) => (
                            <Chip
                                key={model}
                                size="small"
                                label={`${classBasename(model)} → ${models[model]?.table ?? '?'}`}
                                sx={{ height: 20, fontFamily: MONO, fontSize: 10, bgcolor: 'action.selected' }}
                            />
                        ))}
                        {[...new Set(activeGroup.routes.flatMap((route) => route.pages))]
                            .filter((component) => !pages[component]?.exists)
                            .map((component) => (
                                <Chip
                                    key={component}
                                    size="small"
                                    label={`missing: ${component}`}
                                    color="error"
                                    sx={{ height: 20, fontFamily: MONO, fontSize: 10 }}
                                />
                            ))}
                    </Stack>
                )}
            </Paper>
        </Stack>
    );
}

/**
 * Lay the four columns out on a fixed grid and wire the edges between them.
 */
function buildGraph(routes: RouteNode[]): { nodes: GraphNode[]; edges: GraphEdge[]; width: number; height: number } {
    const columns: Array<Array<Omit<GraphNode, 'x' | 'y'>>> = [[], [], [], []];
    const edges: GraphEdge[] = [];
    const seen = new Set<string>();

    const push = (column: number, node: Omit<GraphNode, 'x' | 'y'>): void => {
        if (seen.has(node.id)) {
            return;
        }

        seen.add(node.id);
        columns[column].push(node);
    };

    const connect = (from: string, to: string): void => {
        const id = `${from}->${to}`;

        if (!edges.some((edge) => edge.id === id)) {
            edges.push({ id, from, to });
        }
    };

    routes.forEach((route) => {
        const routeId = `route:${route.id}`;

        push(0, {
            id: routeId,
            kind: 'route',
            column: 0,
            title: `${route.primary_method} ${route.uri}`,
            subtitle: route.name ?? 'unnamed',
            tooltip: `${route.methods.join('|')} ${route.uri}\n${route.middleware.join(', ')}`,
            accent: methodColor(route.primary_method),
        });

        const isClosure = route.action.type === 'closure';
        const actionName = route.action.method ?? 'closure';

        // Controller actions are shared across routes; every closure is its own
        // node, otherwise unrelated inline routes would collapse into one hub.
        const actionId = isClosure ? `action:${route.id}` : `action:${actionName}`;

        push(1, {
            id: actionId,
            kind: 'action',
            column: 1,
            title: isClosure ? 'closure' : `${actionName}()`,
            subtitle: isClosure ? (route.action.file ?? 'inline') : (route.action.signature ?? route.action.type),
            tooltip: route.action.signature ?? route.action.source ?? route.action.label,
            accent: KIND_ACCENT.action,
        });

        connect(routeId, actionId);

        const dependencies: Array<[NodeKind, string]> = [
            ...route.models.map((value): [NodeKind, string] => ['model', value]),
            ...route.services.map((value): [NodeKind, string] => ['service', value]),
            ...route.requests.map((value): [NodeKind, string] => ['request', value]),
        ];

        dependencies.forEach(([kind, value]) => {
            const id = `${kind}:${value}`;

            push(2, {
                id,
                kind,
                column: 2,
                title: classBasename(value),
                subtitle: kind,
                tooltip: value,
                accent: KIND_ACCENT[kind],
            });

            connect(actionId, id);
        });

        route.pages.forEach((component) => {
            const id = `page:${component}`;

            push(3, {
                id,
                kind: 'page',
                column: 3,
                title: component.split('/').slice(-2).join('/'),
                subtitle: component,
                tooltip: component,
                accent: KIND_ACCENT.page,
            });

            connect(actionId, id);
        });
    });

    const tallest = Math.max(1, ...columns.map((column) => column.length));
    const height = PADDING * 2 + 14 + tallest * (NODE_H + NODE_GAP) - NODE_GAP;
    const width = PADDING * 2 + 4 * NODE_W + 3 * COL_GAP;

    const nodes: GraphNode[] = [];

    columns.forEach((column, index) => {
        const columnHeight = column.length * (NODE_H + NODE_GAP) - NODE_GAP;
        const top = PADDING + 14 + Math.max(0, (height - PADDING * 2 - 14 - columnHeight) / 2);

        column.forEach((node, row) => {
            nodes.push({
                ...node,
                x: PADDING + index * (NODE_W + COL_GAP),
                y: top + row * (NODE_H + NODE_GAP),
            });
        });
    });

    return { nodes, edges, width, height };
}
