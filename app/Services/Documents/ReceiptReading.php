<?php

declare(strict_types=1);

namespace App\Services\Documents;

/**
 * What a reader made of an uploaded document: whether it is a receipt (paid)
 * or a bill (to pay), its date, amount and payee, and whether it looks like
 * something paid again and again (rent, internet, electricity).
 */
final class ReceiptReading
{
    public const KINDS = ['receipt', 'bill', 'other'];

    public const REPEATS = ['none', 'weekly', 'monthly', 'yearly'];

    public function __construct(
        /** receipt (money already paid) | bill (money to pay) | other */
        public readonly string $kind,
        public readonly bool $isPaid,
        /** Y-m-d, Gregorian: the day paid (receipt) or due (bill). */
        public readonly ?string $date,
        /** The date as printed, e.g. an Ethiopian-calendar date. */
        public readonly ?string $dateAsPrinted,
        public readonly ?float $amount,
        public readonly ?string $currency,
        public readonly ?string $payee,
        /** A short calendar title: "Internet", "Shop rent". */
        public readonly string $title,
        public readonly bool $recurring,
        public readonly string $repeat,
        public readonly int $repeatEvery,
        /** One sentence for the person: what this document is. */
        public readonly string $summary,
    ) {
    }

    /** @param array<string, mixed> $data */
    public static function fromArray(array $data): self
    {
        $kind = in_array($data['kind'] ?? null, self::KINDS, true) ? (string) $data['kind'] : 'other';
        $repeat = in_array($data['repeat'] ?? null, self::REPEATS, true) ? (string) $data['repeat'] : 'none';
        $date = is_string($data['date'] ?? null) && preg_match('/^\d{4}-\d{2}-\d{2}$/', $data['date']) === 1 ? $data['date'] : null;
        $currency = is_string($data['currency'] ?? null) && preg_match('/^[A-Za-z]{3}$/', $data['currency']) === 1 ? strtoupper($data['currency']) : null;

        return new self(
            kind: $kind,
            isPaid: (bool) ($data['is_paid'] ?? false),
            date: $date,
            dateAsPrinted: self::text($data['date_as_printed'] ?? null, 60),
            amount: is_numeric($data['amount'] ?? null) && (float) $data['amount'] >= 0 ? round((float) $data['amount'], 2) : null,
            currency: $currency,
            payee: self::text($data['payee'] ?? null, 160),
            title: self::text($data['title'] ?? null, 160) ?? 'Bill',
            recurring: (bool) ($data['recurring'] ?? false) && $repeat !== 'none',
            repeat: (bool) ($data['recurring'] ?? false) ? $repeat : 'none',
            repeatEvery: max(1, min(12, (int) ($data['repeat_every'] ?? 1))),
            summary: self::text($data['summary'] ?? null, 300) ?? '',
        );
    }

    /** @return array<string, mixed> */
    public function toArray(): array
    {
        return [
            'kind' => $this->kind,
            'is_paid' => $this->isPaid,
            'date' => $this->date,
            'date_as_printed' => $this->dateAsPrinted,
            'amount' => $this->amount,
            'currency' => $this->currency,
            'payee' => $this->payee,
            'title' => $this->title,
            'recurring' => $this->recurring,
            'repeat' => $this->repeat,
            'repeat_every' => $this->repeatEvery,
            'summary' => $this->summary,
        ];
    }

    private static function text(mixed $value, int $max): ?string
    {
        if (! is_string($value)) {
            return null;
        }
        $value = trim($value);

        return $value === '' ? null : mb_substr($value, 0, $max);
    }
}
