<?php

declare(strict_types=1);

namespace App\Http\Requests\Finance;

use App\Models\Finance\Expense;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/** Record an expense (ExpenseService::record). */
class SaveExpenseRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'category' => ['required', Rule::in(Expense::CATEGORIES)],
            'amount' => ['required', 'numeric', 'gt:0', 'max:100000000'],
            'spent_on' => ['required', 'date_format:Y-m-d'],
            'description' => ['nullable', 'string', 'max:255'],
            'store_id' => ['nullable', 'integer', 'exists:stores,id'],
            'vehicle_id' => ['nullable', 'integer', 'exists:vehicles,id'],
            'litres' => ['nullable', 'numeric', 'gt:0', 'max:100000'],
            'receipt' => ['nullable', 'file', 'mimes:jpg,jpeg,png,webp,heic,pdf', 'max:10240'],
        ];
    }
}
