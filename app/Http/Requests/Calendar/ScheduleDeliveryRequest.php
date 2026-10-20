<?php

declare(strict_types=1);

namespace App\Http\Requests\Calendar;

use App\Services\Workforce\LocalTime;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Http\FormRequest;

/** Set or move a delivery's day and time, typed on the shops' clock. */
class ScheduleDeliveryRequest extends FormRequest
{
    public function authorize(): bool
    {
        // Who may move which run is DeliverySource::canSchedule, checked by the controller.
        return true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'scheduled_for' => ['required', 'date_format:Y-m-d\TH:i'],
        ];
    }

    /** @return array<int, \Closure> */
    public function after(): array
    {
        return [
            function ($validator): void {
                if ($validator->errors()->isEmpty() && LocalTime::dateText((string) $this->input('scheduled_for')) < LocalTime::dateOf()) {
                    $validator->errors()->add('scheduled_for', 'Pick today or a later day.');
                }
            },
        ];
    }

    /** The moment, from the shops' wall clock. */
    public function moment(): CarbonImmutable
    {
        return LocalTime::parse((string) $this->validated('scheduled_for'));
    }
}
