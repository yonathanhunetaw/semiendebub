<?php

declare(strict_types=1);

namespace App\Services\DataExchange\Datasets;

use App\Models\Auth\User;
use App\Models\Finance\Expense;
use App\Models\Fulfillment\Vehicle;
use App\Models\Store\Store;
use App\Services\DataExchange\Dataset;
use App\Services\DataExchange\ImportPlan;
use App\Services\Finance\ExpenseService;
use App\Services\Shared\CsvTable;

/**
 * Money that went out. Importing only ever ADDS expenses, each one claimed by the person importing; it never
 * changes or confirms one, so a second person (finance or a global admin) still confirms every line in the
 * normal Expenses screen. No receipts through a file. A line that matches an expense already recorded (same
 * date, kind, amount, note and store) is refused, so loading the same sheet twice cannot double the books.
 *
 * The download has more columns than the import takes (who recorded and decided it, its status), so a
 * downloaded file is for reading and the template is for adding.
 */
final class ExpensesDataset extends Dataset
{
    public function __construct(private readonly ExpenseService $expenses)
    {
    }

    public function key(): string
    {
        return 'expenses';
    }

    public function label(): string
    {
        return 'Expenses';
    }

    public function group(): string
    {
        return 'Finance';
    }

    public function description(): string
    {
        return 'Money spent. Importing adds expenses as claimed; a second person still confirms each one. It never changes existing ones.';
    }

    public function columns(): array
    {
        return ['id', 'spent_on', 'category', 'amount', 'description', 'store', 'vehicle_plate', 'litres', 'status', 'recorded_by', 'decided_by', 'reject_reason'];
    }

    public function importColumns(): array
    {
        return ['spent_on', 'category', 'amount', 'description', 'store', 'vehicle_plate', 'litres'];
    }

    public function required(): array
    {
        return ['spent_on', 'category', 'amount'];
    }

    public function example(): array
    {
        return ['2026-10-20', 'fuel', '2500', 'Diesel for the delivery van', 'Main Store', 'AA 12345', '38.5'];
    }

    public function importable(): bool
    {
        return true;
    }

    public function rows(): iterable
    {
        $name = fn (?User $user): ?string => $user === null ? null : trim($user->first_name.' '.$user->last_name);

        foreach (Expense::query()->with(['store', 'vehicle', 'recorder', 'decider'])->lazyById(300) as $e) {
            yield [
                $e->id,
                $e->spent_on?->toDateString(),
                $e->category,
                $e->amount,
                $e->description,
                $e->store?->name,
                $e->vehicle?->plate,
                $e->litres,
                $e->status,
                $name($e->recorder),
                $name($e->decider),
                $e->reject_reason,
            ];
        }
    }

    public function plan(CsvTable $table, User $by, array $options = []): ImportPlan
    {
        $plan = new ImportPlan();
        $have = array_flip($table->header);

        $stores = Store::query()->orderBy('name')->get(['id', 'name']);
        $storeMap = $stores->mapWithKeys(fn (Store $s): array => [mb_strtolower($s->name) => (int) $s->id])->all();
        $storeKnown = $stores->pluck('name')->all();
        $vehicles = Vehicle::query()->whereNotNull('plate')->get(['id', 'plate']);
        $vehicleMap = $vehicles->mapWithKeys(fn (Vehicle $v): array => [mb_strtolower(trim((string) $v->plate)) => (int) $v->id])->all();
        $vehicleKnown = $vehicles->pluck('plate')->all();

        $parsed = [];
        foreach ($table->rows as $row) {
            $d = $row['data'];
            $errorsBefore = count($table->errors());

            $spentOn = $table->date($row, 'spent_on', true);
            $amount = $table->decimal($row, 'amount', true);
            $category = mb_strtolower($d['category']);
            $storeId = isset($have['store']) ? $table->lookup($row, 'store', $storeMap, $storeKnown) : null;
            $vehicleId = isset($have['vehicle_plate']) ? $table->lookup($row, 'vehicle_plate', $vehicleMap, $vehicleKnown) : null;
            $litres = isset($have['litres']) ? $table->decimal($row, 'litres') : null;
            if ($litres !== null && $litres < 0) {
                $table->error('litres may not be negative', $row['line']);
            }

            if ($amount !== null && $spentOn !== null) {
                $problem = $this->expenses->problem(['category' => $category, 'amount' => $amount, 'spent_on' => $spentOn]);
                if ($problem !== null) {
                    $table->error($category === '' || ! in_array($category, Expense::CATEGORIES, true)
                        ? "category '{$d['category']}' must be one of ".implode(', ', Expense::CATEGORIES)
                        : $problem, $row['line']);
                }
            }
            if (count($table->errors()) > $errorsBefore) {
                continue;
            }

            $parsed[] = [
                'line' => $row['line'],
                'data' => [
                    'category' => $category,
                    'amount' => $amount,
                    'spent_on' => $spentOn,
                    'description' => ($d['description'] ?? '') === '' ? null : $d['description'],
                    'store_id' => $storeId,
                    'vehicle_id' => $vehicleId,
                    'litres' => $litres,
                ],
            ];
        }

        $existing = $this->recorded($parsed);
        $seen = [];
        $total = 0.0;

        foreach ($parsed as $entry) {
            $data = $entry['data'];
            $key = $this->fingerprint($data);
            if (isset($existing[$key])) {
                $table->error("{$data['spent_on']} {$data['category']} ".$this->money($data['amount']).' is already recorded (expense '.$existing[$key].')', $entry['line']);

                continue;
            }
            if (isset($seen[$key])) {
                $table->error("the same expense is already on line {$seen[$key]} (add a note to tell two apart)", $entry['line']);

                continue;
            }
            $seen[$key] = $entry['line'];
            $total += $data['amount'];

            $plan->add('create', "{$data['spent_on']} {$data['category']} ".$this->money($data['amount']), fn (): int => (int) $this->expenses->record($by, $data)->id);
        }

        if ($plan->created > 0) {
            $plan->warn("{$plan->created} expenses worth ".$this->money($total).' ETB are recorded as claimed: another person still has to confirm each one');
        }

        return $plan;
    }

    /**
     * The expenses already in the books on the dates of the file (a rejected one may be recorded again).
     *
     * @param  list<array{line: int, data: array<string, mixed>}>  $parsed
     * @return array<string, int> match key => expense id
     */
    private function recorded(array $parsed): array
    {
        if ($parsed === []) {
            return [];
        }

        $dates = array_column(array_column($parsed, 'data'), 'spent_on');
        $found = [];
        $expenses = Expense::query()->where('status', '!=', Expense::STATUS_REJECTED)
            ->whereDate('spent_on', '>=', min($dates))->whereDate('spent_on', '<=', max($dates))->get();
        foreach ($expenses as $e) {
            $found[$this->fingerprint([
                'spent_on' => $e->spent_on?->toDateString(),
                'category' => $e->category,
                'amount' => (float) $e->amount,
                'description' => $e->description,
                'store_id' => $e->store_id,
            ])] = (int) $e->id;
        }

        return $found;
    }

    /** @param array<string, mixed> $data */
    private function fingerprint(array $data): string
    {
        return implode('|', [$data['spent_on'], $data['category'], number_format((float) $data['amount'], 2, '.', ''), mb_strtolower(trim((string) ($data['description'] ?? ''))), (int) ($data['store_id'] ?? 0)]);
    }

    private function money(float $amount): string
    {
        return number_format($amount, 2, '.', ',');
    }
}
