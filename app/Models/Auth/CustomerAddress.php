<?php

declare(strict_types=1);

namespace App\Models\Auth;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** A place a customer takes deliveries, saved from checkout. */
class CustomerAddress extends Model
{
    protected $fillable = [
        'customer_id',
        'label',
        'address',
        'recipient_name',
        'recipient_phone',
        'times_used',
        'last_used_at',
    ];

    protected $casts = [
        'times_used' => 'integer',
        'last_used_at' => 'datetime',
    ];

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }

    /**
     * Remember where this customer's order went: the same address (ignoring
     * case and spacing) is used again rather than saved twice.
     */
    public static function remember(int $customerId, string $address, ?string $recipient, ?string $phone): self
    {
        $normalised = mb_strtolower(preg_replace('/\s+/', ' ', trim($address)) ?? '');

        $existing = self::query()->where('customer_id', $customerId)->get()
            ->first(fn (self $row): bool => mb_strtolower(preg_replace('/\s+/', ' ', trim($row->address)) ?? '') === $normalised);

        $row = $existing ?? new self(['customer_id' => $customerId, 'address' => trim($address)]);
        $row->fill(array_filter([
            'recipient_name' => $recipient,
            'recipient_phone' => $phone,
        ], fn ($value) => $value !== null && $value !== ''));
        $row->times_used = (int) $row->times_used + 1;
        $row->last_used_at = now();
        $row->save();

        return $row;
    }

    /** @return array<string, mixed> */
    public function present(): array
    {
        return [
            'id' => (int) $this->id,
            'label' => $this->label,
            'address' => (string) $this->address,
            'recipient_name' => $this->recipient_name,
            'recipient_phone' => $this->recipient_phone,
            'times_used' => (int) $this->times_used,
            'last_used_at' => $this->last_used_at?->toIso8601String(),
        ];
    }
}
