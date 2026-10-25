<?php

declare(strict_types=1);

namespace App\Services\DataExchange;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Schema;

/**
 * Export only: every column of a model's table, in id order, streamed in chunks. Used for ledgers,
 * statuses and money (which no import may touch) and for tables nobody needs to import yet.
 */
final class TableDataset extends Dataset
{
    /** Columns that never leave the app, whatever the table. */
    private const SECRET = '/(^|_)(password|token|secret|remember|two_factor|api_key|recovery)/i';

    /** @var list<string>|null */
    private ?array $columns = null;

    /**
     * @param  class-string<Model>  $model
     * @param  string  $why  shown on the page next to "Export only"
     */
    public function __construct(
        private readonly string $key,
        private readonly string $label,
        private readonly string $group,
        private readonly string $model,
        private readonly string $description,
        private readonly string $why = 'Export only: a record of what happened, changed only by the app itself',
    ) {
    }

    public function key(): string
    {
        return $this->key;
    }

    public function label(): string
    {
        return $this->label;
    }

    public function group(): string
    {
        return $this->group;
    }

    public function description(): string
    {
        return $this->description;
    }

    public function exportOnlyReason(): string
    {
        return $this->why;
    }

    public function columns(): array
    {
        if ($this->columns === null) {
            $table = (new $this->model())->getTable();
            $this->columns = array_values(array_filter(
                Schema::getColumnListing($table),
                fn (string $column): bool => ! preg_match(self::SECRET, $column),
            ));
        }

        return $this->columns;
    }

    public function rows(): iterable
    {
        $columns = $this->columns();
        $query = $this->model::query()->withoutGlobalScopes();
        if (in_array('deleted_at', $columns, true) && method_exists($this->model, 'withTrashed')) {
            $query = $this->model::withTrashed();
        }

        foreach ($query->select($columns)->orderBy((new $this->model())->getKeyName())->lazyById(500, (new $this->model())->getKeyName()) as $record) {
            yield array_map(function ($value) {
                return is_array($value) || is_object($value) ? json_encode($value, JSON_UNESCAPED_UNICODE) : $value;
            }, array_map(fn (string $column): mixed => $record->getAttributes()[$column] ?? null, $columns));
        }
    }
}
