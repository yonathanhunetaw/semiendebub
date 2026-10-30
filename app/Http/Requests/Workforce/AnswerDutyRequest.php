<?php

declare(strict_types=1);

namespace App\Http\Requests\Workforce;

use App\Models\Workforce\SiteDayAnswer;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/** "Yes, I'll do it" / "I can't, because…" to a site day's duty (SiteDayService::answer). */
class AnswerDutyRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'duty' => ['required', Rule::in(SiteDayAnswer::DUTIES)],
            'answer' => ['required', Rule::in([SiteDayAnswer::YES, SiteDayAnswer::NO])],
            'note' => ['nullable', 'string', 'max:500'],
        ];
    }
}
