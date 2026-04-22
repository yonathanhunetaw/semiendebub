<?php

$baseDomain = env('APP_SYSTEM_DOMAIN', 'duka.local');

$separatedSessionHosts = in_array(env('APP_ENV', 'production'), ['local', 'testing'], true)
    && env('SESSION_DOMAIN') === null;

$subdomains = [
    'admin' => [
        'role' => 'admin',
        'login_component' => 'Admin/Login/index',
        'welcome_component' => 'Welcome/Admin',
    ],
    'delivery' => [
        'role' => 'delivery',
        'login_component' => 'Delivery/Login/index',
        'welcome_component' => 'Welcome/Delivery',
    ],
    'dev' => [
        'role' => 'dev',
        'login_component' => 'Dev/Login/index',
        'welcome_component' => 'Welcome/Dev',
    ],
    'finance' => [
        'role' => 'finance',
        'login_component' => 'Finance/Login/index',
        'welcome_component' => 'Welcome/Finance',
    ],
    'guest' => [
        'role' => 'guest',
        'login_component' => 'Guest/Login/index',
        'welcome_component' => 'Welcome/Guest',
    ],
    'marketing' => [
        'role' => 'marketing',
        'login_component' => 'Marketing/Login/index',
        'welcome_component' => 'Welcome/Marketing',
    ],
    'procurement' => [
        'role' => 'procurement',
        'login_component' => 'Procurement/Login/index',
        'welcome_component' => 'Welcome/Procurement',
    ],
    'seller' => [
        'role' => 'seller',
        'login_component' => 'Seller/Login/index',
        'welcome_component' => 'Welcome/Seller',
    ],
    'shared' => [
        'role' => 'shared',
        'login_component' => 'Shared/Login/index',
        'welcome_component' => 'Welcome/Shared',
    ],
    'stockkeeper' => [
        'role' => 'stock_keeper',
        'login_component' => 'StockKeeper/Login/index',
        'welcome_component' => 'Welcome/StockKeeper',
    ],
    'vendor' => [
        'role' => 'vendor',
        'login_component' => 'Vendor/Login/index',
        'welcome_component' => 'Welcome/Vendor',
    ],
];

$aliases = [
    'stock' => 'stockkeeper',
];

$hostRoleMap = [];
$hostComponentMap = [];

foreach ($subdomains as $subdomain => $settings) {
    $host = "{$subdomain}.{$baseDomain}";
    $hostRoleMap[$host] = $settings['role'];
    $hostComponentMap[$host] = $settings['login_component'];
}

foreach ($aliases as $alias => $target) {
    $host = "{$alias}.{$baseDomain}";
    $hostRoleMap[$host] = $subdomains[$target]['role'];
    $hostComponentMap[$host] = $subdomains[$target]['login_component'];
}

return [
    'base_domain' => $baseDomain,
    'separated_session_hosts' => $separatedSessionHosts,
    'subdomains' => $subdomains,
    'aliases' => $aliases,
    'host_role_map' => $hostRoleMap,
    'host_component_map' => $hostComponentMap,
];
