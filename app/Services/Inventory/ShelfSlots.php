<?php

declare(strict_types=1);

namespace App\Services\Inventory;

/**
 * The Main Store's racking as the server knows it: which slots exist. It mirrors the world's own layout
 * (resources/js/Components/Guide/world/storeLayout.ts RACKS): every column a to o has a number of rows,
 * and each spot ("f6") has four slots, f6a to f6d. A shelf bin is placed on one slot.
 */
final class ShelfSlots
{
    /** Rows in each column, by run: the left and back walls have six, the right wall and the front wall over the door three. */
    private const ROWS = [
        'a' => 6, 'b' => 6, 'c' => 6,
        'd' => 6, 'e' => 6, 'f' => 6, 'g' => 6, 'h' => 6,
        'i' => 3, 'j' => 3, 'k' => 3,
        'l' => 3, 'm' => 3, 'n' => 3, 'o' => 3,
    ];

    public const SLOTS_PER_SPOT = 4;

    /** A slot code in its canonical form ("F6C" → "f6c"), or null when no such slot is on the racks. */
    public static function normalise(string $code): ?string
    {
        $code = strtolower(trim($code));

        if (! preg_match('/^([a-o])([1-9])([a-d])$/', $code, $m)) {
            return null;
        }

        return (int) $m[2] <= self::ROWS[$m[1]] ? $code : null;
    }

    /** Every slot, in reading order (a1a, a1b, a1c, a1d, a2a …). @return list<string> */
    public static function all(): array
    {
        $slots = [];
        foreach (self::ROWS as $column => $rows) {
            for ($row = 1; $row <= $rows; $row++) {
                foreach (range('a', chr(ord('a') + self::SLOTS_PER_SPOT - 1)) as $slot) {
                    $slots[] = "{$column}{$row}{$slot}";
                }
            }
        }

        return $slots;
    }
}
