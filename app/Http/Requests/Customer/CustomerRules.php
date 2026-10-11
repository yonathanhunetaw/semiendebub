<?php

declare(strict_types=1);

namespace App\Http\Requests\Customer;

use Illuminate\Support\Str;

/**
 * The contact fields every customer form shares, admin or seller.
 *
 * A blank TIN is a business, so it is stored as null rather than "": every
 * customer-type check reads `->tin_number ?`, and an empty string would still
 * collide with the unique index on the second business created.
 */
trait CustomerRules
{
    /**
     * @return array<string, mixed>
     */
    protected function contactRules(?int $ignoreId = null): array
    {
        $unique = fn (string $column): string => "unique:customers,{$column}".($ignoreId !== null ? ",{$ignoreId}" : '');

        return [
            'first_name' => ['required', 'string', 'max:255'],
            'last_name' => ['nullable', 'string', 'max:255'],
            'email' => ['required', 'email', 'max:255', $unique('email')],
            'phone_number' => ['required', 'string', 'max:20', $unique('phone_number')],
            'city' => ['nullable', 'string', 'max:255'],
            // The form's choice. An individual needs the TIN that makes them
            // one: without this an "individual" with a blank TIN was saved as
            // a business and priced as one.
            'customer_type' => ['nullable', 'in:individual,business'],
            'tin_number' => ['nullable', 'required_if:customer_type,individual', 'string', 'max:10', $unique('tin_number')],
        ];
    }

    /** @return array<string, mixed> */
    public function customerData(): array
    {
        $data = $this->validated();
        $type = $data['customer_type'] ?? null;
        unset($data['customer_type']);

        // A business holds no TIN in this app (see the trait doc).
        if ($type === 'business') {
            $data['tin_number'] = null;
        }

        if (! empty($data['city'])) {
            $data['city'] = Str::title($data['city']);
        }

        // Only when the form sent the field, so an update that omits it does
        // not silently turn an individual into a business.
        if ($this->has('tin_number') && $type !== 'business') {
            $tin = trim((string) ($data['tin_number'] ?? ''));
            $data['tin_number'] = $tin === '' ? null : $tin;
        }

        return $data;
    }
}
