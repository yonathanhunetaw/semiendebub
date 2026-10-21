<?php

declare(strict_types=1);

namespace App\Http\Controllers\Procurement;

use App\Http\Controllers\Controller;
use App\Http\Requests\Procurement\ImportTariffsRequest;
use App\Http\Requests\Procurement\SaveTariffRequest;
use App\Models\Procurement\Tariff;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Inertia\Inertia;
use Inertia\Response;

/**
 * The government's tax rates per HS code, as the owner keeps them: edit one
 * row, or paste the list as CSV. No rate is built into the app.
 */
class TariffController extends Controller
{
    /** The CSV columns, in order. */
    private const COLUMNS = ['hs_code', 'description', 'duty_pct', 'excise_pct', 'vat_pct', 'surtax_pct', 'withholding_pct', 'other_pct'];

    public function index(Request $request): Response
    {
        $search = trim((string) $request->string('search'));
        $digits = Tariff::normalise($search);

        $tariffs = Tariff::query()
            ->when($search !== '', fn (Builder $q) => $q->where(fn (Builder $w) => $w
                ->where('description', 'like', "%{$search}%")
                ->when($digits !== null, fn (Builder $d) => $d->orWhere('hs_code', 'like', "{$digits}%"))))
            ->orderBy('hs_code')
            ->paginate(50)
            ->withQueryString();

        return Inertia::render('Procurement/Tariffs/Index', [
            'tariffs' => collect($tariffs->items())->map(fn (Tariff $t): array => [
                'id' => (int) $t->id,
                'hs_code' => (string) $t->hs_code,
                'description' => $t->description,
                'effective_from' => $t->effective_from?->toDateString(),
                'notes' => $t->notes,
            ] + array_combine(Tariff::RATES, array_map(fn (string $k): float => (float) $t->{$k}, Tariff::RATES)))->values()->all(),
            'filters' => ['search' => $search],
            'pagination' => ['current_page' => $tariffs->currentPage(), 'last_page' => $tariffs->lastPage(), 'total' => $tariffs->total()],
        ]);
    }

    public function store(SaveTariffRequest $request): RedirectResponse
    {
        $tariff = Tariff::query()->create($request->validated() + ['updated_by' => $request->user()->id]);

        return back()->with('success', "HS {$tariff->hs_code} added.");
    }

    public function update(SaveTariffRequest $request, Tariff $tariff): RedirectResponse
    {
        $tariff->update($request->validated() + ['updated_by' => $request->user()->id]);

        return back()->with('success', "HS {$tariff->hs_code} saved. Existing quotes keep their estimate until recalculated.");
    }

    public function destroy(Tariff $tariff): RedirectResponse
    {
        $tariff->delete();

        return back()->with('success', "HS {$tariff->hs_code} removed.");
    }

    /**
     * Add or replace rows from pasted CSV. A header row is skipped; a row
     * whose HS code is not digits or whose rates are not numbers is reported,
     * not guessed; nothing is saved unless every row is good.
     */
    public function import(ImportTariffsRequest $request): RedirectResponse
    {
        $rows = [];
        $problems = [];

        foreach (preg_split('/\r\n|\r|\n/', trim((string) $request->validated('csv'))) as $n => $line) {
            if (trim($line) === '') {
                continue;
            }

            $cells = array_map('trim', str_getcsv($line));
            $code = Tariff::normalise($cells[0] ?? '');

            if ($n === 0 && $code === null) {
                continue; // a header row
            }

            $rates = array_slice(array_pad($cells, count(self::COLUMNS), '0'), 2, 6);

            if ($code === null || array_filter($rates, fn (string $v): bool => $v !== '' && ! is_numeric($v)) !== []) {
                $problems[] = 'Line '.($n + 1).': '.mb_strimwidth($line, 0, 60, '…');

                continue;
            }

            $rows[$code] = array_combine(self::COLUMNS, [$code, ($cells[1] ?? '') !== '' ? $cells[1] : null, ...array_map(fn (string $v): float => (float) ($v === '' ? 0 : $v), $rates)]);
        }

        if ($problems !== []) {
            return back()->with('error', 'Nothing imported. Fix these lines first: '.implode('; ', array_slice($problems, 0, 5)).(count($problems) > 5 ? ' …' : ''));
        }

        if ($rows === []) {
            return back()->with('error', 'No rows found.');
        }

        DB::transaction(function () use ($rows, $request): void {
            foreach ($rows as $row) {
                Tariff::query()->updateOrCreate(['hs_code' => $row['hs_code']], $row + ['updated_by' => $request->user()->id]);
            }
        });

        return back()->with('success', count($rows).' HS codes imported.');
    }
}
