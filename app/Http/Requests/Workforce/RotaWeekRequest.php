<?php

declare(strict_types=1);

namespace App\Http\Requests\Workforce;

use App\Services\Workforce\LocalTime;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Http\FormRequest;

/** A rota week, by any date in it; the week starts on Monday. */
class RotaWeekRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'week' => ['nullable', 'date_format:Y-m-d'],
        ];
    }

    public function weekStart(): CarbonImmutable
    {
        $week = $this->input('week');

        // On the shops' calendar: Monday at their midnight.
        return (is_string($week) && $week !== '' ? LocalTime::day($week) : LocalTime::today())->startOfWeek(CarbonImmutable::MONDAY);
    }
}
