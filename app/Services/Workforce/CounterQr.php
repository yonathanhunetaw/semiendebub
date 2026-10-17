<?php

declare(strict_types=1);

namespace App\Services\Workforce;

use App\Models\Inventory\StockLocation;
use App\Models\Workforce\SiteSetting;
use Carbon\CarbonInterface;
use Illuminate\Support\Str;

/**
 * The QR at the counter: proof that someone is standing at the site.
 *
 * Two kinds of code, both a URL the phone's own camera opens
 * (`https://{domain}/clock/{site}/{token}`, see ClockRelayController):
 *
 *   printed  a fixed code on paper at the counter. It is valid only for
 *            opening the site (and the opener's own clock-in), because at
 *            opening time nobody is showing a moving code yet. A manager can
 *            void it by printing a new version.
 *   live     a code that changes every minute, shown on the counter screen
 *            (Work → Counter) once the site is open. Everyone else clocks in
 *            and out with it, so a photo of it is useless a few minutes later.
 *
 * Codes are HMACs of the site's secret, which never leaves the server.
 */
class CounterQr
{
    public const KIND_PRINTED = 'printed';

    public const KIND_LIVE = 'live';

    /** A live code is accepted for this many minutes after it is shown. */
    public const LIVE_WINDOWS = 3;

    public function settings(StockLocation $site): SiteSetting
    {
        return SiteSetting::query()->firstOrCreate(
            ['stock_location_id' => $site->id],
            // The column defaults too, but a fresh model would not carry them.
            ['qr_secret' => Str::random(48), 'qr_version' => 1, 'open_grace_minutes' => 15],
        );
    }

    public function printedToken(StockLocation $site): string
    {
        $settings = $this->settings($site);

        return 'p'.$this->sign($settings, "printed:{$site->id}:{$settings->qr_version}", 20);
    }

    public function liveToken(StockLocation $site, ?CarbonInterface $at = null): string
    {
        return 'l'.$this->sign($this->settings($site), "live:{$site->id}:".$this->window($at), 12);
    }

    /** Seconds until the live code on screen changes. */
    public function secondsLeft(?CarbonInterface $at = null): int
    {
        $now = ($at ?? now())->getTimestamp();

        return 60 - ($now % 60);
    }

    /** Which kind of code this is, or null if it is not (or no longer) valid. */
    public function verify(StockLocation $site, ?string $token, ?CarbonInterface $at = null): ?string
    {
        if ($token === null || $token === '') {
            return null;
        }

        if (hash_equals($this->printedToken($site), $token)) {
            return self::KIND_PRINTED;
        }

        $settings = $this->settings($site);
        $window = $this->window($at);

        for ($back = 0; $back < self::LIVE_WINDOWS; $back++) {
            if (hash_equals('l'.$this->sign($settings, "live:{$site->id}:".($window - $back), 12), $token)) {
                return self::KIND_LIVE;
            }
        }

        return null;
    }

    /** Void the printed QR (it leaked, or the paper is lost). */
    public function reprint(StockLocation $site): void
    {
        $this->settings($site)->increment('qr_version');
    }

    /** The URL inside a QR: the root domain's relay, which opens the person's own app. */
    public function url(StockLocation $site, string $token): string
    {
        $scheme = parse_url((string) config('app.url'), PHP_URL_SCHEME) ?: 'https';

        return sprintf('%s://%s/clock/%d/%s', $scheme, config('app.system_domain'), $site->id, $token);
    }

    private function window(?CarbonInterface $at): int
    {
        return intdiv(($at ?? now())->getTimestamp(), 60);
    }

    private function sign(SiteSetting $settings, string $payload, int $length): string
    {
        return substr(hash_hmac('sha256', $payload, (string) $settings->qr_secret), 0, $length);
    }
}
