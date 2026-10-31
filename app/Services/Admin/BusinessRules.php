<?php

declare(strict_types=1);

namespace App\Services\Admin;

use App\Models\Admin\BusinessSetting;
use App\Models\Auth\User;
use Illuminate\Support\Facades\Cache;

/**
 * The business rules a global admin changes in Settings → Business rules,
 * without editing .env and redeploying.
 *
 * Each rule is a config value. The value saved here (one business_settings
 * row) replaces it for every request, at boot (AppServiceProvider), so the
 * code that reads config('inventory.unpaid_reservation_minutes') and the rest
 * follows the saved value unchanged. A rule never saved, or reset, keeps its
 * config / .env value: that is its default.
 */
class BusinessRules
{
    private const CACHE_KEY = 'business_rules.saved';

    /**
     * column => what the rule is. `config` is the key it replaces.
     *
     * @var array<string, array{config: string, type: 'int'|'bool'|'text', group: string, label: string, help: string, unit?: string, min?: int, max?: int}>
     */
    public const RULES = [
        'unpaid_reservation_minutes' => [
            'config' => 'inventory.unpaid_reservation_minutes', 'type' => 'int', 'group' => 'orders',
            'label' => 'Hold stock for an unpaid order', 'unit' => 'minutes', 'min' => 15, 'max' => 20160,
            'help' => 'An order nobody has paid towards gives its stock back after this long.',
        ],
        'cash_flag_days' => [
            'config' => 'payments.cash_flag_days', 'type' => 'int', 'group' => 'money',
            'label' => 'Flag cash a seller still holds after', 'unit' => 'days', 'min' => 1, 'max' => 60,
            'help' => 'Cash not handed over by then is flagged on Payments → Balances: it has no bank record to check.',
        ],
        'archive_after_days' => [
            'config' => 'app.archive_after_days', 'type' => 'int', 'group' => 'orders',
            'label' => 'Move finished work to Archive after', 'unit' => 'days', 'min' => 7, 'max' => 3650,
            'help' => 'Finished records older than this leave the open lists for Archive. Nothing is deleted; open work is never archived.',
        ],
        'same_day_promise' => [
            'config' => 'inventory.same_day_promise', 'type' => 'text', 'group' => 'shop',
            'label' => 'Wording when it is in the store', 'max' => 60,
            'help' => 'Shown on a line the store can hand over today.',
        ],
        'delayed_promise' => [
            'config' => 'inventory.delayed_promise', 'type' => 'text', 'group' => 'shop',
            'label' => 'Wording when it comes from a hub', 'max' => 60,
            'help' => 'Shown on a line that has to come from a main warehouse first.',
        ],
        'storefront_low_stock_threshold' => [
            'config' => 'storefront.low_stock_threshold', 'type' => 'int', 'group' => 'shop',
            'label' => 'Show "low stock" at or below', 'unit' => 'units', 'min' => 0, 'max' => 10000,
            'help' => 'The online shop marks an item low on stock from this many left.',
        ],
        'storefront_per_page' => [
            'config' => 'storefront.per_page', 'type' => 'int', 'group' => 'shop',
            'label' => 'Items per page in the shop', 'unit' => 'items', 'min' => 6, 'max' => 120,
            'help' => 'How many products one page of the online shop shows.',
        ],
        'storefront_max_line_quantity' => [
            'config' => 'storefront.max_line_quantity', 'type' => 'int', 'group' => 'shop',
            'label' => 'Most of one item in a shop cart', 'unit' => 'units', 'min' => 1, 'max' => 100000,
            'help' => 'A shopper cannot put more than this of one item in the cart (the stock on hand caps it too).',
        ],
        'auto_replenishment' => [
            'config' => 'inventory.auto_replenishment.enabled', 'type' => 'bool', 'group' => 'stock',
            'label' => 'Propose restocking automatically',
            'help' => 'When a location falls below its minimum, a replenishment proposal is raised for approval.',
        ],
        'replenish_on_stock_change' => [
            'config' => 'inventory.auto_replenishment.observe_stock_changes', 'type' => 'bool', 'group' => 'stock',
            'label' => 'Check for restocking on every stock change',
            'help' => 'Off: proposals are raised only by the nightly run (02:30).',
        ],
        'shelf_refill_on_stock_change' => [
            'config' => 'inventory.shelf_refill.observe_stock_changes', 'type' => 'bool', 'group' => 'stock',
            'label' => 'Ask for a shelf refill on every stock change',
            'help' => 'When the shelf runs low, a refill from the floor is raised straight away.',
        ],
    ];

    public const GROUPS = [
        'orders' => 'Orders',
        'money' => 'Money',
        'shop' => 'Online shop',
        'stock' => 'Stock',
    ];

    /** @var array<string, mixed>|null the config values before the saved ones were applied */
    private ?array $defaults = null;

    /**
     * Put the saved rules over config for this request. Safe before the table
     * exists (a fresh install, migrations): then nothing is replaced.
     */
    public function apply(): void
    {
        $this->defaults ??= collect(self::RULES)->mapWithKeys(fn (array $rule, string $key) => [$key => config($rule['config'])])->all();

        $saved = $this->saved();

        foreach (self::RULES as $key => $rule) {
            $value = $saved[$key] ?? null;
            config([$rule['config'] => $value === null ? $this->defaults[$key] : $this->cast($rule['type'], $value)]);
        }
    }

    /**
     * Every rule as the Settings page shows it.
     *
     * @return list<array<string, mixed>>
     */
    public function present(): array
    {
        $this->apply();
        $saved = $this->saved();

        return collect(self::RULES)->map(fn (array $rule, string $key) => [
            'key' => $key,
            'group' => $rule['group'],
            'type' => $rule['type'],
            'label' => $rule['label'],
            'help' => $rule['help'],
            'unit' => $rule['unit'] ?? null,
            'min' => $rule['min'] ?? null,
            'max' => $rule['max'] ?? null,
            'value' => $this->cast($rule['type'], config($rule['config'])),
            'default' => $this->cast($rule['type'], $this->defaults[$key]),
            'saved' => ($saved[$key] ?? null) !== null,
        ])->values()->all();
    }

    /** When the rules were last saved, and by whom. */
    public function lastSaved(): ?array
    {
        $row = BusinessSetting::query()->with('updater:id,first_name,last_name')->first();

        if ($row === null || $row->updated_at === null) {
            return null;
        }

        return [
            'at' => $row->updated_at->toIso8601String(),
            'by' => $row->updater ? trim($row->updater->first_name.' '.$row->updater->last_name) : null,
        ];
    }

    /**
     * Save the rules. A value equal to its default is stored as null, so the
     * rule goes on following .env if that changes later.
     *
     * @param  array<string, mixed>  $values  column => value (validated)
     */
    public function save(User $by, array $values): void
    {
        $this->apply();
        $row = BusinessSetting::query()->first() ?? new BusinessSetting();
        $changes = ['updated_by' => $by->id];

        foreach (self::RULES as $key => $rule) {
            if (! array_key_exists($key, $values)) {
                continue;
            }

            $value = $values[$key] === null || $values[$key] === '' ? null : $this->cast($rule['type'], $values[$key]);
            $changes[$key] = $value === $this->cast($rule['type'], $this->defaults[$key]) ? null : $value;
        }

        $row->fill($changes)->save();
        Cache::forget(self::CACHE_KEY);
        $this->apply();
    }

    /** @return array<string, mixed> */
    private function saved(): array
    {
        try {
            return Cache::rememberForever(self::CACHE_KEY, fn (): array => BusinessSetting::query()->first()?->only(array_keys(self::RULES)) ?? []);
        } catch (\Throwable) {
            // No table yet (fresh install, mid-migration) or no cache store: keep config as it is.
            return [];
        }
    }

    private function cast(string $type, mixed $value): mixed
    {
        return match ($type) {
            'int' => $value === null ? null : (int) $value,
            'bool' => $value === null ? null : filter_var($value, FILTER_VALIDATE_BOOLEAN),
            default => $value === null ? null : trim((string) $value),
        };
    }
}
