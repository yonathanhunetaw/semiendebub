<?php

declare(strict_types=1);

namespace App\Http\Requests\Item;

use Illuminate\Foundation\Http\FormRequest;

/**
 * Query string of the admin item list. Every key is optional; anything
 * missing or out of range falls back to the defaults in filters().
 */
class ItemIndexRequest extends FormRequest
{
    public const STATUSES = ['draft', 'active', 'inactive', 'archived'];

    public const SORTS = ['name', 'updated', 'created', 'variants', 'live'];

    public const PER_PAGE = [25, 50, 100];

    public function authorize(): bool
    {
        return true;
    }

    /**
     * @return array<string, array<int, string>|string>
     */
    public function rules(): array
    {
        return [
            'q' => 'nullable|string|max:100',
            // `filter` is the old name of `status`; bookmarked links still use it.
            'status' => 'nullable|string',
            'filter' => 'nullable|string',
            'category' => 'nullable|integer',
            'needs_photos' => 'nullable|boolean',
            'sort' => 'nullable|string',
            'direction' => 'nullable|string',
            'per_page' => 'nullable|integer',
            'page' => 'nullable|integer|min:1',
        ];
    }

    /**
     * The list's filters with defaults applied and unknown values dropped,
     * so a hand-edited URL narrows the list instead of failing.
     *
     * @return array{q: string, status: string, category: int|null, needs_photos: bool, sort: string, direction: string, per_page: int}
     */
    public function filters(): array
    {
        $status = (string) ($this->input('status') ?? $this->input('filter') ?? 'all');
        $sort = (string) $this->input('sort', 'name');
        $direction = strtolower((string) $this->input('direction', ''));
        $perPage = (int) $this->input('per_page', self::PER_PAGE[0]);

        $sort = in_array($sort, self::SORTS, true) ? $sort : 'name';

        if (! in_array($direction, ['asc', 'desc'], true)) {
            // Names read A-Z; dates and counts read biggest first.
            $direction = $sort === 'name' ? 'asc' : 'desc';
        }

        return [
            'q' => trim((string) $this->input('q', '')),
            'status' => in_array($status, self::STATUSES, true) ? $status : 'all',
            'category' => $this->filled('category') ? (int) $this->input('category') : null,
            'needs_photos' => $this->boolean('needs_photos'),
            'sort' => $sort,
            'direction' => $direction,
            'per_page' => in_array($perPage, self::PER_PAGE, true) ? $perPage : self::PER_PAGE[0],
        ];
    }
}
