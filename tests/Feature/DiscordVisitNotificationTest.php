<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Jobs\SendPublicVisitNotification;
use App\Models\Auth\User;
use App\Services\DiscordVisitNotificationService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Request as HttpRequest;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Queue;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

/**
 * Public-visit pings to Discord: who triggers one, the 10-minute throttle, the
 * geo lookup, and the 24-hour digest.
 */
class DiscordVisitNotificationTest extends TestCase
{
    use RefreshDatabase;

    private const VISIT_HOOK = 'https://discord.test/visit';

    private const DAILY_HOOK = 'https://discord.test/daily';

    protected function setUp(): void
    {
        parent::setUp();

        config([
            'services.discord.visit_webhook_url' => self::VISIT_HOOK,
            'services.discord.daily_visit_webhook_url' => self::DAILY_HOOK,
        ]);
    }

    private function service(): DiscordVisitNotificationService
    {
        return app(DiscordVisitNotificationService::class);
    }

    private function fakeGeo(array $geo = ['status' => 'success', 'country' => 'Ethiopia', 'countryCode' => 'ET', 'city' => 'Addis Ababa']): void
    {
        Http::fake([
            'ip-api.com/*' => Http::response($geo),
            'discord.test/*' => Http::response('', 204),
        ]);
    }

    /** @return array<int, HttpRequest> */
    private function postsTo(string $url): array
    {
        return Http::recorded(fn (HttpRequest $r) => $r->url() === $url)->map(fn ($pair) => $pair[0])->values()->all();
    }

    // ---- notify(): who is worth a ping -------------------------------------

    #[Test]
    public function a_guest_page_view_queues_a_notification_with_the_visit_details(): void
    {
        Queue::fake();

        $request = Request::create('http://duka.test/shop/item-1', 'GET', server: [
            'HTTP_ACCEPT' => 'text/html', 'REMOTE_ADDR' => '196.188.1.2', 'HTTP_USER_AGENT' => 'Firefox',
        ]);
        $this->service()->notify($request);

        Queue::assertPushed(SendPublicVisitNotification::class, fn ($job) => $job->ip === '196.188.1.2'
            && $job->host === 'duka.test' && $job->path === '/shop/item-1' && $job->userAgent === 'Firefox');
    }

    #[Test]
    public function signed_in_users_posts_and_non_html_requests_are_not_reported(): void
    {
        Queue::fake();

        $signedIn = Request::create('http://duka.test/', 'GET', server: ['HTTP_ACCEPT' => 'text/html']);
        $signedIn->setUserResolver(fn () => User::factory()->make());
        $this->service()->notify($signedIn);

        $this->service()->notify(Request::create('http://duka.test/login', 'POST', server: ['HTTP_ACCEPT' => 'text/html']));
        $this->service()->notify(Request::create('http://duka.test/api/thing', 'GET', server: ['HTTP_ACCEPT' => 'application/json']));

        Queue::assertNothingPushed();
    }

    #[Test]
    public function the_job_hands_its_details_to_deliver(): void
    {
        $this->fakeGeo();

        (new SendPublicVisitNotification('1.2.3.4', 'duka.test', '/', 'Safari'))->handle($this->service());

        $this->assertCount(1, $this->postsTo(self::VISIT_HOOK));
    }

    // ---- deliver(): the instant alert --------------------------------------

    #[Test]
    public function a_visit_posts_an_alert_with_the_location_and_flag(): void
    {
        $this->fakeGeo();

        $this->service()->deliver('196.188.1.2', 'duka.test', '/shop', 'Firefox');

        $posts = $this->postsTo(self::VISIT_HOOK);
        $this->assertCount(1, $posts);
        $fields = collect($posts[0]['embeds'][0]['fields'])->pluck('value', 'name');
        $this->assertSame('duka.test', $fields['Host']);
        $this->assertSame('/shop', $fields['Path']);
        $this->assertSame('`196.188.1.2`', $fields['IP']);
        $this->assertSame('🇪🇹 Addis Ababa, Ethiopia', $fields['Location']);
        $this->assertSame('Firefox', $fields['User Agent']);
    }

    #[Test]
    public function the_same_visitor_on_the_same_page_is_reported_once_per_ten_minutes(): void
    {
        $this->fakeGeo();

        $this->service()->deliver('1.2.3.4', 'duka.test', '/shop', 'Firefox');
        $this->service()->deliver('1.2.3.4', 'duka.test', '/shop', 'Firefox');
        $this->service()->deliver('1.2.3.4', 'duka.test', '/other', 'Firefox');

        $this->assertCount(2, $this->postsTo(self::VISIT_HOOK));

        $this->travel(11)->minutes();
        $this->service()->deliver('1.2.3.4', 'duka.test', '/shop', 'Firefox');
        $this->assertCount(3, $this->postsTo(self::VISIT_HOOK));
    }

    #[Test]
    public function the_geo_lookup_is_cached_per_ip(): void
    {
        $this->fakeGeo();

        $this->service()->deliver('1.2.3.4', 'duka.test', '/a', '');
        $this->service()->deliver('1.2.3.4', 'duka.test', '/b', '');

        Http::assertSentCount(3); // one lookup, two alerts
        $this->assertSame('Unknown', collect($this->postsTo(self::VISIT_HOOK)[0]['embeds'][0]['fields'])->firstWhere('name', 'User Agent')['value']);
    }

    #[Test]
    public function a_failed_or_unreachable_geo_lookup_reads_unknown_and_still_alerts(): void
    {
        $this->fakeGeo(['status' => 'fail']);
        $this->service()->deliver('10.0.0.1', 'duka.test', '/', 'x');
        $this->assertSame('Unknown', collect($this->postsTo(self::VISIT_HOOK)[0]['embeds'][0]['fields'])->firstWhere('name', 'Location')['value']);

        Http::fake([
            'ip-api.com/*' => fn () => throw new \Illuminate\Http\Client\ConnectionException('timeout'),
            'discord.test/*' => Http::response('', 204),
        ]);
        $this->service()->deliver('10.0.0.2', 'duka.test', '/', 'x');
        $this->assertSame(['status' => 'fail'], Cache::get('geo_ip_10.0.0.2'), 'a dead lookup is remembered briefly');
        $this->assertCount(1, $this->postsTo(self::VISIT_HOOK));
    }

    #[Test]
    public function an_unknown_country_code_gets_a_white_flag(): void
    {
        $this->fakeGeo(['status' => 'success', 'country' => 'Nowhere', 'countryCode' => '', 'city' => '']);

        $this->service()->deliver('1.2.3.4', 'duka.test', '/', 'x');

        $this->assertSame('🏳️ Nowhere', collect($this->postsTo(self::VISIT_HOOK)[0]['embeds'][0]['fields'])->firstWhere('name', 'Location')['value']);
    }

    #[Test]
    public function nothing_is_posted_when_no_webhook_is_configured(): void
    {
        config(['services.discord.visit_webhook_url' => null, 'services.discord.daily_visit_webhook_url' => null]);
        $this->fakeGeo();

        $this->service()->deliver('1.2.3.4', 'duka.test', '/', 'x');

        $this->assertCount(0, $this->postsTo(self::VISIT_HOOK));
        $this->assertNull(Cache::get('discord_daily_visit_buffer'));
    }

    #[Test]
    public function a_discord_failure_never_reaches_the_visitor(): void
    {
        Http::fake([
            'ip-api.com/*' => Http::response(['status' => 'fail']),
            'discord.test/*' => fn () => throw new \RuntimeException('discord down'),
        ]);

        $this->service()->deliver('1.2.3.4', 'duka.test', '/', 'x');

        $this->addToAssertionCount(1); // no exception escaped
    }

    // ---- the 24-hour digest ------------------------------------------------

    #[Test]
    public function visits_are_buffered_and_the_digest_goes_out_once_a_day(): void
    {
        $this->fakeGeo();

        $this->service()->deliver('1.1.1.1', 'duka.test', '/one', 'x');
        $this->service()->deliver('2.2.2.2', 'duka.test', '/two', 'x');

        $this->assertCount(2, Cache::get('discord_daily_visit_buffer'));
        $this->assertCount(0, $this->postsTo(self::DAILY_HOOK), 'not due yet');

        $this->travel(25)->hours();
        $this->service()->deliver('3.3.3.3', 'duka.test', '/three', 'x');

        $digests = $this->postsTo(self::DAILY_HOOK);
        $this->assertCount(1, $digests, 'a digest is due 24 hours after the first visit');
        $embed = $digests[0]['embeds'][0];
        $this->assertSame('3', collect($embed['fields'])->firstWhere('name', 'Visit Count')['value']);
        $this->assertStringContainsString('duka.test/one', $embed['description']);
        $this->assertStringContainsString('duka.test/three', $embed['description']);
        $this->assertNull(Cache::get('discord_daily_visit_buffer'), 'the buffer is emptied once sent');

        // The next visit starts a new day's buffer, not another digest.
        $this->service()->deliver('4.4.4.4', 'duka.test', '/four', 'x');
        $this->assertCount(1, $this->postsTo(self::DAILY_HOOK));
    }

    #[Test]
    public function a_long_digest_is_cut_short_with_a_count_of_the_rest(): void
    {
        $this->fakeGeo();
        $this->service()->deliver('1.1.1.1', 'duka.test', '/', 'x');

        // 200 buffered visits overflow the 3800-character description.
        $visit = ['time' => now()->toDateTimeString(), 'host' => 'duka.test', 'path' => '/'.str_repeat('p', 40), 'ip' => '9.9.9.9', 'location' => 'Somewhere', 'user_agent' => 'x'];
        Cache::put('discord_daily_visit_buffer', array_fill(0, 250, $visit), now()->addDays(2));

        $this->travel(25)->hours();
        $this->service()->deliver('2.2.2.2', 'duka.test', '/', 'x');

        $embed = $this->postsTo(self::DAILY_HOOK)[0]['embeds'][0];
        $this->assertLessThanOrEqual(3850, strlen($embed['description']));
        $this->assertMatchesRegularExpression('/\.\.\.and \d+ more visits\./', $embed['description']);
        $this->assertSame('200', collect($embed['fields'])->firstWhere('name', 'Visit Count')['value'], 'the buffer keeps the latest 200');
    }

    // ---- the middleware ----------------------------------------------------

    #[Test]
    public function the_storefront_queues_a_ping_for_a_guest_page_view(): void
    {
        Queue::fake();

        $this->get('http://'.config('app.system_domain').'/', ['Accept' => 'text/html']);

        Queue::assertPushed(SendPublicVisitNotification::class);
    }
}
