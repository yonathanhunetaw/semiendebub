<?php

declare(strict_types=1);

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Http\Requests\Admin\DeployItemsRequest;
use App\Http\Requests\Admin\ImportCsvRequest;
use App\Models\Store\Store;
use App\Services\DataExchange\Dataset;
use App\Services\DataExchange\DatasetRegistry;
use App\Services\DataExchange\DeployTool;
use App\Services\DataExchange\ImportPlan;
use App\Services\Shared\CsvReader;
use App\Services\Shared\CsvWriter;
use App\Services\Workforce\LocalTime;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;
use Inertia\Inertia;
use Inertia\Response;
use Symfony\Component\HttpFoundation\BinaryFileResponse;
use Symfony\Component\HttpFoundation\StreamedResponse;
use ZipArchive;

/**
 * Settings → Import / Export: every module's data as CSV, and the safe ones back in. Global admins only
 * (the routes sit behind a plain admin.global). Importing is two steps: a dry run shows what would
 * change, then the same file is sent again to apply it, all or nothing.
 */
class DataExchangeController extends Controller
{
    public function __construct(
        private readonly DatasetRegistry $registry,
        private readonly CsvWriter $writer,
        private readonly CsvReader $reader,
        private readonly DeployTool $deployer,
    ) {
    }

    public function index(Request $request): Response
    {
        $groups = [];
        foreach ($this->registry->grouped() as $group => $datasets) {
            $groups[] = [
                'name' => $group,
                'datasets' => array_map(fn (Dataset $d): array => [
                    'key' => $d->key(),
                    'label' => $d->label(),
                    'description' => $d->description(),
                    'importable' => $d->importable(),
                    'reason' => $d->importable() ? null : $d->exportOnlyReason(),
                    'columns' => $d->importable() ? $d->importColumns() : $d->columns(),
                    'required' => $d->importable() ? $d->required() : [],
                    'options' => $d->importable() ? $d->options() : (object) [],
                    'max_rows' => $d->maxRows(),
                ], $datasets),
            ];
        }

        return Inertia::render('Admin/Settings/DataExchange', [
            'groups' => $groups,
            'stores' => Store::query()->orderBy('name')->get(['id', 'name'])->map(fn (Store $s): array => ['id' => (int) $s->id, 'name' => (string) $s->name])->all(),
            'preview' => $request->session()->pull('import_preview'),
        ]);
    }

    public function export(string $dataset): StreamedResponse
    {
        $set = $this->find($dataset);

        return $this->writer->download($set->key().'-'.LocalTime::dateText(now()).'.csv', $set->columns(), $set->rows());
    }

    public function template(string $dataset): StreamedResponse
    {
        $set = $this->find($dataset);
        abort_unless($set->importable(), 404);

        return $this->writer->download($set->key().'-template.csv', $set->importColumns(), $set->example() === [] ? [] : [$set->example()]);
    }

    /** One zip with a CSV per dataset and a README.csv that lists them. Each file goes through a temp file, so a big ledger is never held in memory. */
    public function everything(): BinaryFileResponse
    {
        $this->allowLongRun();
        $path = tempnam(sys_get_temp_dir(), 'duka-data-');
        $zip = new ZipArchive();
        $zip->open($path, ZipArchive::OVERWRITE);

        $readme = [];
        $temp = [];
        foreach ($this->registry->all() as $set) {
            try {
                $file = tempnam(sys_get_temp_dir(), 'duka-csv-');
                $temp[] = $file;
                $rows = $this->writer->toFile($file, $set->columns(), $set->rows());
                $zip->addFile($file, $set->key().'.csv');
                $readme[] = [$set->key().'.csv', $set->group(), $set->label(), $rows, $set->importable() ? 'yes' : 'no'];
            } catch (\Throwable $e) {
                report($e);
                $readme[] = [$set->key().'.csv', $set->group(), $set->label(), 'failed', 'no'];
            }
        }
        $zip->addFromString('README.csv', $this->writer->write(['file', 'area', 'what', 'rows', 'can be imported'], $readme));
        $zip->close();
        array_map('unlink', $temp);

        return response()->download($path, 'duka-data-'.LocalTime::dateText(now()).'.zip')->deleteFileAfterSend(true);
    }

    public function import(ImportCsvRequest $request, string $dataset): RedirectResponse
    {
        $this->allowLongRun();
        $set = $this->find($dataset);
        abort_unless($set->importable(), 404);

        $csv = (string) $request->validated('csv');
        $required = $set->required();
        $table = $this->reader->parse(
            $csv,
            $required,
            array_values(array_diff($set->importColumns(), $required)),
            $set->unique(),
            $set->maxRows(),
        );
        $options = [];
        foreach (array_keys($set->options()) as $name) {
            $options[$name] = $request->boolean($name);
        }
        $plan = $table->ok() ? $set->plan($table, $request->user(), $options) : null;
        $dry = $request->boolean('dry_run');

        // Planning is what finds a bad value, so the table's errors are read after it.
        if (! $table->ok()) {
            return $this->preview($dataset, null, $table->errors(), 'Nothing imported. Fix the lines below and try again.');
        }
        if ($plan === null || $plan->empty()) {
            return $this->preview($dataset, null, [], 'The file has no rows.');
        }
        if ($dry) {
            return $this->preview($dataset, $plan->summary());
        }

        $log = DB::transaction(fn (): array => $plan->commit());
        $this->audit($dataset, $request->user()->id, $plan, $log, $csv);

        $message = "{$set->label()}: {$plan->created} added, {$plan->updated} changed, {$plan->unchanged} already up to date.";

        return redirect()->route('admin.data.index')->with('success', $message);
    }

    /** Puts items in a store (switched off, no price). Same two steps as an import: check, then apply. */
    public function deploy(DeployItemsRequest $request): RedirectResponse
    {
        $this->allowLongRun();
        $store = Store::query()->findOrFail((int) $request->validated('store_id'));
        [$plan, $errors] = $this->deployer->plan($store, (string) $request->validated('scope'), $request->validated('csv'));

        if ($errors !== []) {
            return $this->preview('deploy', null, $errors, 'Nothing done. Fix the lines below and try again.');
        }
        if ($plan->created === 0) {
            return $this->preview('deploy', null, [], "Every item is already in {$store->name}.");
        }
        if ($request->boolean('dry_run')) {
            return $this->preview('deploy', $plan->summary());
        }

        $log = DB::transaction(fn (): array => $plan->commit());
        $this->audit('deploy', $request->user()->id, $plan, $log, (string) $request->validated('csv'));

        return redirect()->route('admin.data.index')->with('success', "{$plan->created} items put in {$store->name}, switched off. Set their prices to put them on sale.");
    }

    /**
     * Gives a big export or import five minutes. Web requests only: the console has no limit, and setting one
     * there caps the whole process, so a PHPUnit run died 300 s after the first DataExchange test.
     */
    private function allowLongRun(): void
    {
        if (! app()->runningInConsole()) {
            set_time_limit(300);
        }
    }

    private function find(string $key): Dataset
    {
        return $this->registry->find($key) ?? abort(404);
    }

    /**
     * What an applied import did, kept on the server: who, the summary, the old values of every changed
     * record and the ids of every new one, plus the file itself. Nothing reads it back yet; it is the record.
     *
     * @param  list<array<string, mixed>>  $log
     */
    private function audit(string $dataset, int $userId, ImportPlan $plan, array $log, string $csv): void
    {
        try {
            $stamp = now()->format('Ymd_His').'_'.$dataset;
            $disk = Storage::disk('local');
            $disk->put("imports/{$stamp}.json", json_encode([
                'dataset' => $dataset,
                'by' => $userId,
                'at' => now()->toIso8601String(),
                'summary' => $plan->summary(),
                'changes' => $log,
            ], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
            $disk->put("imports/{$stamp}.csv", $csv);
        } catch (\Throwable $e) {
            report($e); // the import is already saved; a missing audit file must not undo it
        }
        Log::info('Data import', ['dataset' => $dataset, 'by' => $userId] + $plan->summary());
    }

    /**
     * @param  array<string, mixed>|null  $summary
     * @param  list<string>  $errors
     */
    private function preview(string $dataset, ?array $summary = null, array $errors = [], ?string $error = null): RedirectResponse
    {
        $back = redirect()->route('admin.data.index')
            ->with('import_preview', ['dataset' => $dataset, 'summary' => $summary, 'errors' => array_slice($errors, 0, 40), 'more' => max(0, count($errors) - 40)]);

        return $error !== null ? $back->with('error', $error) : $back;
    }
}
