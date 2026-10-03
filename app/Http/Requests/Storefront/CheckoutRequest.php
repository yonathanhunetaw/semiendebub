<?php

declare(strict_types=1);

namespace App\Http\Requests\Storefront;

use Illuminate\Foundation\Http\FormRequest;

/**
 * The shopper's move from cart to payment.
 *
 * `accept_delayed_items` is the buyer agreeing that lines which can only be
 * sent from a main warehouse will arrive later. It is a field rather than a
 * dismissible notice because checkout refuses to continue without it, and
 * because the acceptance is recorded on the sale.
 *
 * @see \App\Services\Fulfillment\OrderSourcingService::groupCart()
 */
class CheckoutRequest extends FormRequest
{
    public function authorize(): bool
    {
        // The storefront is public; CartController gates the signed-in part.
        return true;
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'accept_delayed_items' => ['nullable', 'boolean'],
        ];
    }

    public function acceptsDelay(): bool
    {
        return $this->boolean('accept_delayed_items');
    }
}
