<?php

declare(strict_types=1);

namespace App\Http\Requests\Admin;

use App\Services\Admin\BusinessRules;
use Illuminate\Foundation\Http\FormRequest;

/** Settings → Business rules (BusinessRules::save). An empty value puts a rule back to its default. */
class SaveBusinessRulesRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return collect(BusinessRules::RULES)->mapWithKeys(fn (array $rule, string $key) => [
            $key => match ($rule['type']) {
                'int' => ['nullable', 'integer', 'min:'.$rule['min'], 'max:'.$rule['max']],
                'bool' => ['nullable', 'boolean'],
                default => ['nullable', 'string', 'max:'.$rule['max']],
            },
        ])->all();
    }

    /** @return array<string, string> */
    public function attributes(): array
    {
        return collect(BusinessRules::RULES)->mapWithKeys(fn (array $rule, string $key) => [$key => strtolower($rule['label'])])->all();
    }
}
