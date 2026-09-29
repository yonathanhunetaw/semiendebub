/**
 * Shape of storage/app/dev-architecture-map.json, produced by
 * `php artisan dev:generate-domain-map` (App\Services\Dev\DomainMapGenerator).
 *
 * Keep this file in sync with the generator — it is the contract between the
 * Artisan parser and the /dev/architecture visualizer.
 */

export type DomainKey =
    | 'admin'
    | 'seller'
    | 'stockkeeper'
    | 'delivery'
    | 'procurement'
    | 'finance'
    | 'marketing'
    | 'vendor'
    | 'user'
    | 'shared'
    | 'dev';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'OPTIONS' | string;

export type ActionType = 'controller' | 'invokable' | 'closure';

export interface DomainSummary {
    key: DomainKey;
    label: string;
    color: string;
    description: string;
    counts: {
        routes: number;
        controllers: number;
        models: number;
        pages: number;
    };
}

export interface RouteReference {
    id: string;
    name: string | null;
    uri: string;
    method: HttpMethod;
    domain: DomainKey;
}

export interface RouteAction {
    type: ActionType;
    class: string | null;
    short: string | null;
    method: string | null;
    label: string;
    file: string | null;
    line: number | null;
    signature: string | null;
    /** `routes/web/seller/seller.php:51` — where the route is registered. */
    source: string | null;
}

export interface RouteNode {
    id: string;
    domain: DomainKey;
    methods: HttpMethod[];
    primary_method: HttpMethod;
    uri: string;
    name: string | null;
    host: string | null;
    url: string;
    parameters: string[];
    middleware: string[];
    action: RouteAction;
    models: string[];
    services: string[];
    requests: string[];
    pages: string[];
    /** Route names referenced from the action body (redirects, `route()` calls). */
    links: string[];
}

export interface ControllerNode {
    class: string;
    short: string;
    namespace: string;
    file: string | null;
    exists: boolean;
    vendor: boolean;
    domain: DomainKey;
    traits: string[];
    middleware: string[];
    shared_dependencies: {
        models: string[];
        services: string[];
        requests: string[];
    };
    actions: Array<{
        name: string;
        line: number | null;
        signature: string;
        models: string[];
        services: string[];
        requests: string[];
        pages: string[];
    }>;
    routes: RouteReference[];
}

export interface ModelRelation {
    name: string;
    type: string;
    related: string | null;
}

export interface MigrationReference {
    file: string;
    kind: 'create' | 'alter' | 'drop' | string;
}

export interface ModelNode {
    class: string;
    short: string;
    label: string;
    domain: DomainKey;
    file: string | null;
    table: string | null;
    primary_key: string;
    fillable: string[];
    casts: Record<string, string>;
    relations: ModelRelation[];
    migrations: MigrationReference[];
    factories: string[];
    seeders: string[];
    routes: RouteReference[];
}

export interface ServiceNode {
    class: string;
    short: string;
    domain: DomainKey;
    file: string;
    methods: string[];
    routes: RouteReference[];
}

export interface PageNode {
    component: string;
    domain: DomainKey;
    file: string | null;
    layout: string | null;
    lines: number;
    exists: boolean;
    routes: RouteReference[];
}

export type PackageGroup = 'framework' | 'ui' | 'dev' | 'utility';

export interface PackageNode {
    name: string;
    constraint: string;
    version: string | null;
    dev: boolean;
    registry: 'composer' | 'npm';
    group: PackageGroup;
    docs: string;
}

export interface PackageRegistryData {
    composer: Record<PackageGroup, PackageNode[]>;
    npm: Record<PackageGroup, PackageNode[]>;
    totals: { composer: number; npm: number };
}

export interface ArchitectureMap {
    schema_version: number;
    meta: {
        generated_at: string;
        generated_by: string;
        app_name: string;
        app_env: string;
        laravel_version: string;
        php_version: string;
        duration_ms: number;
    };
    domains: DomainSummary[];
    routes: RouteNode[];
    controllers: ControllerNode[];
    models: ModelNode[];
    services: ServiceNode[];
    pages: PageNode[];
    filters: {
        methods: HttpMethod[];
        middleware: string[];
        middleware_counts: Record<string, number>;
    };
    packages: PackageRegistryData;
    stats: {
        routes: number;
        controllers: number;
        models: number;
        services: number;
        pages: number;
        orphan_pages: number;
        closure_routes: number;
    };
}

export interface ArchitecturePageProps {
    map: ArchitectureMap | null;
    error: string | null;
    endpoints: {
        regenerate: string;
        download: string;
    };
}

/** Accent colours for HTTP verbs, shared by every view. */
export const METHOD_COLORS: Record<string, string> = {
    GET: '#0ea5e9',
    POST: '#22c55e',
    PUT: '#f59e0b',
    PATCH: '#f59e0b',
    DELETE: '#ef4444',
    OPTIONS: '#94a3b8',
};

export const methodColor = (method: string): string => METHOD_COLORS[method] ?? '#94a3b8';

/** `App\Models\Fulfillment\Shipment` -> `Shipment` */
export const classBasename = (value: string): string => value.split('\\').pop() ?? value;
