<?php

declare(strict_types=1);

namespace App\Services\Documents;

use Anthropic\Client;
use Anthropic\Core\Exceptions\APIConnectionException;
use Anthropic\Core\Exceptions\APIStatusException;
use Anthropic\Core\Exceptions\AuthenticationException;
use Anthropic\Core\Exceptions\BadRequestException;
use Anthropic\Core\Exceptions\RateLimitException;
use Illuminate\Support\Facades\Log;

/**
 * Reads a receipt or bill with Claude (`services.anthropic`): one request with
 * the image or PDF, answered as JSON in a fixed schema (structured outputs).
 *
 * Nothing is sent unless ANTHROPIC_API_KEY is set. A policy decline goes to
 * the server-side default fallback model (beta), so a receipt that trips a
 * classifier is still read.
 */
class ClaudeReceiptReader implements ReceiptReader
{
    private const FALLBACK_BETA = 'server-side-fallback-2026-07-01';

    private const SYSTEM = <<<'TXT'
        You read documents that people at a shop in Ethiopia upload to their work calendar, so they can be reminded of bills.
        Decide what the document is:
        - "receipt": proof that money was already paid (paid receipt, payment confirmation, bank or Telebirr transfer slip).
        - "bill": money still to be paid (invoice, bill, notice with a due date).
        - "other": anything else.
        Read the date that matters: the day it was paid for a receipt, the due date for a bill (the issue date if there is no due date). Ethiopian receipts often print dates in the Ethiopian calendar; convert those to the Gregorian calendar for "date", and copy the date as printed into "date_as_printed".
        Read the total amount and its currency as an ISO 4217 code ("Birr", "ብር" and "ETB" are ETB). Read who is paid (the business that issued it).
        Say it recurs only when the document itself shows a regular charge: rent, electricity, water, internet, phone, a subscription, a licence, or a stated billing period. Then give how often: weekly, monthly (repeat_every 3 for quarterly) or yearly. A one-off purchase does not recur.
        Title: two to four words a shop worker would recognise on a calendar, such as "Shop rent" or "Internet: Ethio Telecom".
        Summary: one plain sentence saying what the document is.
        Use null for anything the document does not show. Never guess an amount or a date.
        TXT;

    public function enabled(): bool
    {
        return (string) config('services.anthropic.key') !== '';
    }

    public function read(string $contents, string $mimeType, string $today): ReceiptReading
    {
        if (! $this->enabled()) {
            throw new ReceiptReaderException('Reading documents is not set up.');
        }

        try {
            $message = $this->client()->beta->messages->create(
                model: (string) config('services.anthropic.model', 'claude-opus-5-5'),
                maxTokens: 8000,
                system: self::SYSTEM,
                messages: [[
                    'role' => 'user',
                    'content' => [
                        $this->fileBlock($contents, $mimeType),
                        ['type' => 'text', 'text' => "Today is {$today}. Read this document."],
                    ],
                ]],
                // Reading one receipt is routine extraction: low effort is enough.
                outputConfig: ['effort' => 'low', 'format' => ['type' => 'json_schema', 'schema' => self::schema()]],
                fallbacks: 'default',
                betas: [self::FALLBACK_BETA],
            );
        } catch (AuthenticationException $e) {
            Log::warning('Receipt reader: the Anthropic API key was refused.', ['error' => $e->getMessage()]);
            throw new ReceiptReaderException('The document reader is not set up correctly (the API key was refused).');
        } catch (RateLimitException) {
            throw new ReceiptReaderException('The document reader is busy. Try again in a minute.');
        } catch (BadRequestException $e) {
            Log::warning('Receipt reader: request refused.', ['error' => $e->getMessage()]);
            throw new ReceiptReaderException('This file could not be read. Try a clearer photo or a PDF.');
        } catch (APIStatusException|APIConnectionException $e) {
            Log::warning('Receipt reader: the API failed.', ['error' => $e->getMessage()]);
            throw new ReceiptReaderException('The document reader could not be reached. Try again.');
        }

        if ($message->stopReason === 'refusal') {
            throw new ReceiptReaderException('The reader would not read this document.');
        }
        if ($message->stopReason === 'max_tokens') {
            throw new ReceiptReaderException('The reader ran out of room on this document.');
        }

        foreach ($message->content as $block) {
            if ($block->type === 'text') {
                $data = json_decode($block->text, true);
                if (is_array($data)) {
                    return ReceiptReading::fromArray($data);
                }
            }
        }

        throw new ReceiptReaderException('The reader gave no answer for this document.');
    }

    /** The API client (a test swaps in one with a fake transport). */
    protected function client(): Client
    {
        return new Client(apiKey: (string) config('services.anthropic.key'));
    }

    /** @return array<string, mixed> */
    private function fileBlock(string $contents, string $mimeType): array
    {
        $source = ['type' => 'base64', 'mediaType' => $mimeType, 'data' => base64_encode($contents)];

        return $mimeType === 'application/pdf'
            ? ['type' => 'document', 'source' => $source]
            : ['type' => 'image', 'source' => $source];
    }

    /** @return array<string, mixed> */
    private static function schema(): array
    {
        $nullableString = ['type' => ['string', 'null']];

        return [
            'type' => 'object',
            'properties' => [
                'kind' => ['type' => 'string', 'enum' => ReceiptReading::KINDS],
                'is_paid' => ['type' => 'boolean'],
                'date' => ['type' => ['string', 'null'], 'description' => 'Gregorian, YYYY-MM-DD'],
                'date_as_printed' => $nullableString,
                'amount' => ['type' => ['number', 'null']],
                'currency' => ['type' => ['string', 'null'], 'description' => 'ISO 4217, e.g. ETB'],
                'payee' => $nullableString,
                'title' => ['type' => 'string'],
                'recurring' => ['type' => 'boolean'],
                'repeat' => ['type' => 'string', 'enum' => ReceiptReading::REPEATS],
                'repeat_every' => ['type' => 'integer'],
                'summary' => ['type' => 'string'],
            ],
            'required' => ['kind', 'is_paid', 'date', 'date_as_printed', 'amount', 'currency', 'payee', 'title', 'recurring', 'repeat', 'repeat_every', 'summary'],
            'additionalProperties' => false,
        ];
    }
}
