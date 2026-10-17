<?php

declare(strict_types=1);

namespace App\Http\Requests\Workforce;

use App\Models\Workforce\StaffingRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Validator;

/** A site's staffing rules, replaced as a whole. */
class SaveStaffingRulesRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'rules' => ['present', 'array', 'max:20'],
            'rules.*.weekdays' => ['required', 'array', 'min:1'],
            'rules.*.weekdays.*' => ['integer', 'between:0,6'],
            'rules.*.starts_at' => ['required', 'date_format:H:i'],
            'rules.*.ends_at' => ['required', 'date_format:H:i'],
            'rules.*.role' => ['required', Rule::in(StaffingRule::ROLES)],
            'rules.*.min_people' => ['required', 'integer', 'between:1,20'],
        ];
    }

    public function after(): array
    {
        return [function (Validator $validator): void {
            foreach ((array) $this->input('rules', []) as $i => $rule) {
                if (($rule['ends_at'] ?? '') <= ($rule['starts_at'] ?? '')) {
                    $validator->errors()->add("rules.$i.ends_at", 'The end is after the start.');
                }
            }
        }];
    }
}
