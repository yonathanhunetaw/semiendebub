<?php

declare(strict_types=1);

namespace App\Services\Dev\Sim;

/**
 * A small signature PNG (a scribble) as a data URL, for the shipment sign
 * steps. Built by hand, so it needs no GD.
 */
final class SimSignature
{
    public static function png(string $seed): string
    {
        $width = 120;
        $height = 30;
        $wave = (crc32($seed) % 7) + 3;
        $rows = '';

        for ($y = 0; $y < $height; $y++) {
            $rows .= "\0";
            for ($x = 0; $x < $width; $x++) {
                $line = (int) round($height / 2 + sin($x / $wave) * ($height / 3));
                $rows .= abs($line - $y) <= 1 ? "\x00\x00\x00" : "\xff\xff\xff";
            }
        }

        $chunk = fn (string $type, string $data): string => pack('N', strlen($data)).$type.$data.pack('N', crc32($type.$data));
        $png = "\x89PNG\r\n\x1a\n"
            .$chunk('IHDR', pack('NNCCCCC', $width, $height, 8, 2, 0, 0, 0))
            .$chunk('IDAT', (string) gzcompress($rows))
            .$chunk('IEND', '');

        return 'data:image/png;base64,'.base64_encode($png);
    }
}
