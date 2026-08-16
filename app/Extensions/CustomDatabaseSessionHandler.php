<?php

namespace App\Extensions;

use Illuminate\Session\DatabaseSessionHandler;
use Illuminate\Support\Carbon;

class CustomDatabaseSessionHandler extends DatabaseSessionHandler
{
    /**
     * Determine if the session is expired.
     *
     * @param  \stdClass  $session
     * @return bool
     */
    protected function expired($session)
    {
        return isset($session->last_activity) &&
            $session->last_activity < Carbon::now()->subMinutes($session->custom_lifetime ?? $this->minutes)->getTimestamp();
    }

    /**
     * {@inheritdoc}
     *
     * @return int
     */
    public function gc($lifetime): int
    {
        $query = $this->getQuery();
        
        return $query->whereRaw('last_activity <= ? - COALESCE(custom_lifetime * 60, ?)', [
            $this->currentTime(),
            $lifetime
        ])->delete();
    }
}
