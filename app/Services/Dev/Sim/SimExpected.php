<?php

declare(strict_types=1);

namespace App\Services\Dev\Sim;

use RuntimeException;

/** A refusal the simulation set out to cause (an overdue customer refused credit): the rule worked. */
final class SimExpected extends RuntimeException
{
}
