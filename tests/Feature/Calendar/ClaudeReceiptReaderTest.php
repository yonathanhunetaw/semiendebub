<?php

declare(strict_types=1);

namespace Tests\Feature\Calendar;

use Anthropic\Client;
use App\Services\Documents\ClaudeReceiptReader;
use App\Services\Documents\ReceiptReaderException;
use GuzzleHttp\Client as Guzzle;
use GuzzleHttp\Handler\MockHandler;
use GuzzleHttp\HandlerStack;
use GuzzleHttp\Middleware;
use GuzzleHttp\Psr7\Response;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

/** The real reader against a fake Anthropic API: what it sends, and how each answer or failure comes back. */
class ClaudeReceiptReaderTest extends TestCase
{
    /** @var array<int, array{request: \Psr\Http\Message\RequestInterface}> */
    private array $sent = [];

    protected function setUp(): void
    {
        parent::setUp();

        config(['services.anthropic.key' => 'test-key', 'services.anthropic.model' => 'claude-test']);
    }

    /** A reader whose client answers with these responses, in order. */
    private function reader(Response ...$responses): ClaudeReceiptReader
    {
        $stack = HandlerStack::create(new MockHandler($responses));
        $stack->push(Middleware::history($this->sent));
        $transporter = new Guzzle(['handler' => $stack, 'http_errors' => false]);

        return new class($transporter) extends ClaudeReceiptReader {
            public function __construct(private readonly Guzzle $transporter)
            {
            }

            protected function client(): Client
            {
                return new Client(apiKey: 'test-key', requestOptions: ['transporter' => $this->transporter, 'maxRetries' => 0]);
            }
        };
    }

    /** @param array<int, array<string, mixed>> $content */
    private function message(array $content, string $stopReason = 'end_turn'): Response
    {
        return new Response(200, ['Content-Type' => 'application/json'], (string) json_encode([
            'id' => 'msg_1', 'type' => 'message', 'role' => 'assistant', 'model' => 'claude-test',
            'content' => $content, 'stop_reason' => $stopReason, 'stop_sequence' => null,
            'usage' => ['input_tokens' => 10, 'output_tokens' => 10],
        ]));
    }

    private function error(int $status, string $type): Response
    {
        return new Response($status, ['Content-Type' => 'application/json'], (string) json_encode([
            'type' => 'error', 'error' => ['type' => $type, 'message' => 'nope'],
        ]));
    }

    #[Test]
    public function it_is_off_without_a_key_and_sends_nothing(): void
    {
        config(['services.anthropic.key' => '']);
        $reader = $this->reader();

        $this->assertFalse($reader->enabled());
        $this->expectExceptionObject(new ReceiptReaderException('Reading documents is not set up.'));
        $reader->read('x', 'image/png', '2026-10-22');
    }

    #[Test]
    public function a_pdf_goes_as_a_document_and_the_json_answer_is_the_reading(): void
    {
        $answer = [
            'kind' => 'bill', 'is_paid' => false, 'date' => '2026-11-05', 'date_as_printed' => '26/02/2019', 'amount' => 1250.5,
            'currency' => 'etb', 'payee' => 'Ethio Telecom', 'title' => 'Internet: Ethio Telecom', 'recurring' => true,
            'repeat' => 'monthly', 'repeat_every' => 1, 'summary' => 'The monthly internet bill.',
        ];
        $reading = $this->reader($this->message([['type' => 'text', 'text' => json_encode($answer)]]))
            ->read('%PDF-1.4', 'application/pdf', '2026-10-22');

        $this->assertSame('bill', $reading->kind);
        $this->assertSame(1250.5, $reading->amount);
        $this->assertSame('ETB', $reading->currency);
        $this->assertTrue($reading->recurring);

        $request = $this->sent[0]['request'];
        $body = json_decode((string) $request->getBody(), true);
        $this->assertSame('test-key', $request->getHeaderLine('x-api-key'));
        $this->assertStringContainsString('server-side-fallback-2026-07-01', $request->getHeaderLine('anthropic-beta'));
        $this->assertSame('claude-test', $body['model']);
        $this->assertSame('document', $body['messages'][0]['content'][0]['type']);
        $this->assertSame(base64_encode('%PDF-1.4'), $body['messages'][0]['content'][0]['source']['data']);
        $this->assertStringContainsString('Today is 2026-10-22', $body['messages'][0]['content'][1]['text']);
        $this->assertSame('json_schema', $body['output_config']['format']['type']);
    }

    #[Test]
    public function a_photo_goes_as_an_image(): void
    {
        $this->reader($this->message([['type' => 'text', 'text' => '{"kind":"receipt","is_paid":true,"title":"Shop rent"}']]))
            ->read('png-bytes', 'image/png', '2026-10-22');

        $body = json_decode((string) $this->sent[0]['request']->getBody(), true);
        $this->assertSame('image', $body['messages'][0]['content'][0]['type']);
        $this->assertSame('image/png', $body['messages'][0]['content'][0]['source']['media_type']);
    }

    /** @return array<string, array{0: int, 1: string, 2: string}> */
    public static function failures(): array
    {
        return [
            'key refused' => [401, 'authentication_error', 'The document reader is not set up correctly (the API key was refused).'],
            'rate limited' => [429, 'rate_limit_error', 'The document reader is busy. Try again in a minute.'],
            'bad request' => [400, 'invalid_request_error', 'This file could not be read. Try a clearer photo or a PDF.'],
            'server error' => [500, 'api_error', 'The document reader could not be reached. Try again.'],
        ];
    }

    #[Test]
    #[DataProvider('failures')]
    public function an_api_failure_becomes_a_message_the_person_can_act_on(int $status, string $type, string $message): void
    {
        $this->expectExceptionObject(new ReceiptReaderException($message));
        $this->reader($this->error($status, $type))->read('x', 'image/png', '2026-10-22');
    }

    #[Test]
    public function a_refusal_running_out_of_room_or_no_json_is_reported(): void
    {
        foreach ([
            [$this->message([], 'refusal'), 'The reader would not read this document.'],
            [$this->message([['type' => 'text', 'text' => '{"kind":']], 'max_tokens'), 'The reader ran out of room on this document.'],
            [$this->message([['type' => 'text', 'text' => 'Sorry, no.']]), 'The reader gave no answer for this document.'],
        ] as [$response, $expected]) {
            try {
                $this->reader($response)->read('x', 'image/png', '2026-10-22');
                $this->fail("No error for: {$expected}");
            } catch (ReceiptReaderException $e) {
                $this->assertSame($expected, $e->getMessage());
            }
        }
    }
}
