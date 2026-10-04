<?php

declare(strict_types=1);

namespace App\Http\Requests\Inventory;

use App\Models\Inventory\RefillRequest;
use Illuminate\Foundation\Http\FormRequest;

/**
 * Put refill suggestions on a manifest — the Replenishment Manifest panel above
 * the shipment builder, or "Build shipment" on the refill list. Each line may
 * carry a different amount than was asked; that also needs the adjust tick.
 *
 * `lines: [{id, quantity|null}]`.
 */
class AddRefillsToManifestRequest extends FormRequest
{
    public function authorize(): bool
    {
        $user = $this->user();

        if ($user === null) {
            return false;
        }

        $lines = collect((array) $this->input('lines', []));
        $legs = RefillRequest::query()->whereIn('id', $lines->pluck('id')->map(fn ($id): int => (int) $id))->get()->keyBy('id');

        foreach ($lines as $line) {
            $leg = $legs->get((int) ($line['id'] ?? 0));

            if ($leg === null) {
                continue; // rules() reports it
            }

            if (! $user->can('addToManifest', $leg)) {
                return false;
            }

            $quantity = $line['quantity'] ?? null;

            if ($quantity !== null && $quantity !== '' && (int) $quantity !== $leg->quantity && ! $user->can('update', $leg)) {
                return false;
            }
        }

        return true;
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'lines' => ['required', 'array', 'min:1'],
            'lines.*.id' => ['required', 'integer', 'distinct', 'exists:refill_requests,id'],
            'lines.*.quantity' => ['nullable', 'integer', 'min:1', 'max:1000000'],
        ];
    }

    /** @return array<int, int|null> refill request id → amount (null = as asked) */
    public function quantities(): array
    {
        $quantities = [];

        foreach ((array) $this->validated('lines') as $line) {
            $quantities[(int) $line['id']] = isset($line['quantity']) && $line['quantity'] !== '' ? (int) $line['quantity'] : null;
        }

        return $quantities;
    }
}
