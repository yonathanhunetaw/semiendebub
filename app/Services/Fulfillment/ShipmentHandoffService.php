<?php

declare(strict_types=1);

namespace App\Services\Fulfillment;

use App\Models\Auth\User;
use App\Models\Fulfillment\Shipment;
use App\Models\Fulfillment\ShipmentItem;
use App\Models\Inventory\StockLocation;
use App\Services\ShipmentWorkflowService as Workflow;
use Illuminate\Support\Facades\DB;

/**
 * What happens after every party agreed and the run is scheduled.
 *
 * Each hand-off is two steps, so nobody signs for goods they have not looked
 * at:
 *
 *   origin keeper   1. pick the lines            scheduled → picking
 *                   2. prepare in the pickup bay picking   → ready
 *   driver             start the trip to the origin (any time once scheduled)
 *                   1. check the load at the bay
 *                   2. sign for it               ready     → dispatched → in_transit
 *                      arrive at the destination in_transit → delivered
 *   receiver        1. check the goods
 *                   2. sign them in              delivered → received (finished)
 *
 * Stock leaves the origin when the driver signs and lands when the receiver
 * signs — the same two ledger moves as before, now tied to a signature.
 */
class ShipmentHandoffService
{
    public const START_PICKING = 'start_picking';

    public const PICK_LINE = 'pick_line';

    public const PREPARED = 'prepared';

    public const COURIER_START = 'courier_start';

    public const COURIER_CHECK = 'courier_check';

    public const COURIER_SIGN = 'courier_sign';

    public const COURIER_ARRIVE = 'courier_arrive';

    public const RECEIVER_CHECK = 'receiver_check';

    public const RECEIVER_SIGN = 'receiver_sign';

    /** @var array<int, string> */
    public const STEPS = [
        self::START_PICKING,
        self::PICK_LINE,
        self::PREPARED,
        self::COURIER_START,
        self::COURIER_CHECK,
        self::COURIER_SIGN,
        self::COURIER_ARRIVE,
        self::RECEIVER_CHECK,
        self::RECEIVER_SIGN,
    ];

    /** Who performs each step. */
    private const ACTOR = [
        self::START_PICKING => 'origin',
        self::PICK_LINE => 'origin',
        self::PREPARED => 'origin',
        self::COURIER_START => 'courier',
        self::COURIER_CHECK => 'courier',
        self::COURIER_SIGN => 'courier',
        self::COURIER_ARRIVE => 'courier',
        self::RECEIVER_CHECK => 'destination',
        self::RECEIVER_SIGN => 'destination',
    ];

    /** Copy for the button that performs each step. */
    public const LABELS = [
        self::START_PICKING => 'Start picking',
        self::PICK_LINE => 'Pick line',
        self::PREPARED => 'Mark prepared',
        self::COURIER_START => 'Start trip to pickup',
        self::COURIER_CHECK => 'Check the load',
        self::COURIER_SIGN => 'Sign & take the load',
        self::COURIER_ARRIVE => 'Arrived at destination',
        self::RECEIVER_CHECK => 'Check the goods',
        self::RECEIVER_SIGN => 'Sign & receive',
    ];

    /** A signature PNG data URL may not exceed this many bytes. */
    private const MAX_SIGNATURE_BYTES = 400_000;

    public function __construct(private readonly Workflow $workflow)
    {
    }

    /**
     * Perform one step as this user.
     *
     * @param  array<string, mixed>  $payload  variant_id + picked for pick_line,
     *                                         bay for prepared, signature for the sign steps
     *
     * @throws \InvalidArgumentException on bad input
     * @throws \RuntimeException when the step does not apply right now
     * @throws \Illuminate\Auth\Access\AuthorizationException when the user may not
     */
    public function perform(Shipment $shipment, string $step, User $user, array $payload = []): Shipment
    {
        if (! in_array($step, self::STEPS, true)) {
            throw new \InvalidArgumentException("Unknown step [{$step}].");
        }

        if (! $this->mayAct($shipment, $step, $user)) {
            throw new \Illuminate\Auth\Access\AuthorizationException(match (self::ACTOR[$step]) {
                'origin' => 'Only the origin dock picks and prepares this shipment.',
                'destination' => 'Only the receiving dock checks and signs this shipment in.',
                default => 'Only the driver carrying this run can do that.',
            });
        }

        if (! $this->isAvailable($shipment, $step)) {
            throw new \RuntimeException($this->whyNot($shipment, $step));
        }

        return match ($step) {
            self::START_PICKING => $this->workflow->transition($shipment, Workflow::PICKING),
            self::PICK_LINE => $this->pickLine($shipment, $payload),
            self::PREPARED => $this->prepare($shipment, $user, $payload),
            self::COURIER_START => $this->stamp($shipment, ['courier_started_at' => now()]),
            self::COURIER_CHECK => $this->stamp($shipment, ['courier_checked_at' => now()]),
            self::COURIER_SIGN => $this->courierSign($shipment, $payload),
            self::COURIER_ARRIVE => $this->workflow->transition($shipment, Workflow::DELIVERED),
            self::RECEIVER_CHECK => $this->stamp($shipment, ['receiver_checked_at' => now()]),
            self::RECEIVER_SIGN => $this->receiverSign($shipment, $user, $payload),
        };
    }

    /** Is this step open on the shipment as it stands, whoever asks? */
    public function isAvailable(Shipment $shipment, string $step): bool
    {
        $status = (string) $shipment->status;

        return match ($step) {
            self::START_PICKING => $status === Workflow::SCHEDULED,
            self::PICK_LINE => $status === Workflow::PICKING,
            self::PREPARED => $status === Workflow::PICKING && $this->allPicked($shipment),
            self::COURIER_START => in_array($status, [Workflow::SCHEDULED, Workflow::PICKING, Workflow::READY], true)
                && $shipment->courier_started_at === null,
            self::COURIER_CHECK => $status === Workflow::READY
                && $shipment->courier_started_at !== null
                && $shipment->courier_checked_at === null,
            self::COURIER_SIGN => $status === Workflow::READY && $shipment->courier_checked_at !== null,
            self::COURIER_ARRIVE => $status === Workflow::IN_TRANSIT,
            self::RECEIVER_CHECK => $status === Workflow::DELIVERED && $shipment->receiver_checked_at === null,
            self::RECEIVER_SIGN => $status === Workflow::DELIVERED && $shipment->receiver_checked_at !== null,
            default => false,
        };
    }

    /** May this user perform this step on this shipment at all? */
    public function mayAct(Shipment $shipment, string $step, User $user): bool
    {
        if (in_array($user->roleKey(), ['admin', 'dev'], true)) {
            return true;
        }

        return match (self::ACTOR[$step] ?? null) {
            'courier' => $shipment->courier_id !== null && (int) $shipment->courier_id === (int) $user->id,
            'origin' => in_array(Workflow::PARTY_ORIGIN, $this->workflow->partiesFor($shipment, $user), true)
                && $this->operates($this->workflow->originLeaf($shipment), $user),
            'destination' => in_array(Workflow::PARTY_DESTINATION, $this->workflow->partiesFor($shipment, $user), true)
                && $this->operates($this->workflow->destinationLeaf($shipment), $user),
            default => false,
        };
    }

    /**
     * Steps this user can take right now, in order.
     *
     * @return array<int, string>
     */
    public function stepsFor(Shipment $shipment, ?User $user): array
    {
        if ($user === null) {
            return [];
        }

        return array_values(array_filter(
            self::STEPS,
            fn (string $step): bool => $this->isAvailable($shipment, $step) && $this->mayAct($shipment, $step, $user),
        ));
    }

    /**
     * The whole hand-off as the screens show it.
     *
     * @return array<string, mixed>
     */
    public function present(Shipment $shipment, ?User $viewer): array
    {
        $shipment->loadMissing('items');

        $asked = (int) $shipment->items->sum('quantity');
        $picked = (int) $shipment->items->sum(fn (ShipmentItem $i) => min((int) $i->picked_quantity, (int) $i->quantity));
        $linesPicked = $shipment->items->filter(fn (ShipmentItem $i) => (int) $i->picked_quantity >= (int) $i->quantity)->count();

        $names = User::query()
            ->whereIn('id', array_filter([$shipment->prepared_by, $shipment->received_by, $shipment->courier_id]))
            ->get()
            ->mapWithKeys(fn (User $u) => [$u->id => trim($u->first_name.' '.$u->last_name) ?: (string) $u->email]);

        $at = fn ($value): ?string => $value?->toIso8601String();

        return [
            'stage' => $this->stage($shipment),
            'preparation' => [
                'units_asked' => $asked,
                'units_picked' => $picked,
                'lines' => $shipment->items->count(),
                'lines_picked' => $linesPicked,
                'percent' => $asked > 0 ? (int) round($picked / $asked * 100) : 0,
                'bay' => $shipment->slot,
            ],
            'times' => [
                'scheduled_for' => $at($shipment->agreed_scheduled_for ?? $shipment->scheduled_for),
                'picking_started' => $at($shipment->picked_at),
                'prepared' => $at($shipment->prepared_at),
                'courier_started' => $at($shipment->courier_started_at),
                'courier_checked' => $at($shipment->courier_checked_at),
                'courier_signed' => $at($shipment->courier_signed_at),
                'arrived' => $at($shipment->delivered_at),
                'receiver_checked' => $at($shipment->receiver_checked_at),
                'received' => $at($shipment->received_at),
            ],
            'people' => [
                'prepared_by' => $shipment->prepared_by ? ($names[$shipment->prepared_by] ?? null) : null,
                'courier' => $shipment->courier_id ? ($names[$shipment->courier_id] ?? null) : null,
                'received_by' => $shipment->received_by ? ($names[$shipment->received_by] ?? null) : null,
            ],
            'signatures' => [
                'courier' => $shipment->courier_signature,
                'receiver' => $shipment->receiver_signature,
            ],
            'available_steps' => $this->stepsFor($shipment, $viewer),
            'labels' => self::LABELS,
        ];
    }

    /**
     * One word for where the hand-off is, for chips and progress bars.
     */
    public function stage(Shipment $shipment): string
    {
        return match ((string) $shipment->status) {
            Workflow::SCHEDULED => $shipment->courier_started_at ? 'driver_on_way' : 'awaiting_picking',
            Workflow::PICKING => 'picking',
            Workflow::READY => match (true) {
                $shipment->courier_checked_at !== null => 'driver_checked',
                $shipment->courier_started_at !== null => 'driver_on_way',
                default => 'prepared',
            },
            Workflow::DISPATCHED, Workflow::IN_TRANSIT => 'en_route',
            Workflow::DELIVERED => $shipment->receiver_checked_at ? 'receiver_checked' : 'arrived',
            Workflow::RECEIVED => 'finished',
            default => (string) $shipment->status,
        };
    }

    /**
     * The people who work a dock, for the agreement gate: the location's own
     * managers and stock keepers, plus its store's.
     *
     * @return array<int, array{name: string, as: string}>
     */
    public function dockPeople(?StockLocation $location): array
    {
        if ($location === null) {
            return [];
        }

        $nodes = array_filter([$location, $location->storeNode()]);
        $people = [];

        foreach ($nodes as $node) {
            foreach ($node->managerAssignments()->with('user')->get() as $assignment) {
                if ($assignment->user !== null) {
                    $people[$assignment->user->id] = ['name' => $this->nameOf($assignment->user), 'as' => 'Manager'];
                }
            }

            foreach ($node->staffAssignments()->with('user')->get() as $staff) {
                if ($staff->user !== null && ! isset($people[$staff->user->id])) {
                    $people[$staff->user->id] = ['name' => $this->nameOf($staff->user), 'as' => 'Stock keeper'];
                }
            }
        }

        return array_values($people);
    }

    private function nameOf(User $user): string
    {
        return trim($user->first_name.' '.$user->last_name) ?: (string) $user->email;
    }

    private function operates(StockLocation $location, User $user): bool
    {
        return $location->canBeOperatedBy($user);
    }

    private function allPicked(Shipment $shipment): bool
    {
        $items = $shipment->items()->get();

        return $items->isNotEmpty()
            && $items->every(fn (ShipmentItem $i) => (int) $i->picked_quantity >= (int) $i->quantity);
    }

    /** @param array<string, mixed> $payload */
    private function pickLine(Shipment $shipment, array $payload): Shipment
    {
        $variantId = (int) ($payload['variant_id'] ?? 0);
        $line = $shipment->items()->where('item_variant_id', $variantId)->first();

        if ($line === null) {
            throw new \InvalidArgumentException('That line is not on this manifest.');
        }

        // Ticking a line picks all of it; unticking puts it back.
        $picked = array_key_exists('picked', $payload)
            ? (bool) $payload['picked']
            : (int) $line->picked_quantity < (int) $line->quantity;

        $line->update(['picked_quantity' => $picked ? (int) $line->quantity : 0]);

        return $shipment->refresh();
    }

    /** @param array<string, mixed> $payload */
    private function prepare(Shipment $shipment, User $user, array $payload): Shipment
    {
        $bay = trim((string) ($payload['bay'] ?? ''));

        return $this->workflow->transition($shipment, Workflow::READY, array_filter([
            'prepared_by' => $user->id,
            'slot' => $bay !== '' ? mb_substr($bay, 0, 64) : null,
        ], fn ($v) => $v !== null));
    }

    /** @param array<string, mixed> $payload */
    private function courierSign(Shipment $shipment, array $payload): Shipment
    {
        $signature = $this->signature($payload);

        return DB::transaction(function () use ($shipment, $signature): Shipment {
            // Signing is the handover: the load leaves the origin into the
            // driver's custody and the run is en route.
            $shipment = $this->workflow->transition($shipment, Workflow::DISPATCHED, [
                'courier_signature' => $signature,
                'courier_signed_at' => now(),
            ]);

            return $this->workflow->transition($shipment, Workflow::IN_TRANSIT);
        });
    }

    /** @param array<string, mixed> $payload */
    private function receiverSign(Shipment $shipment, User $user, array $payload): Shipment
    {
        return $this->workflow->transition($shipment, Workflow::RECEIVED, [
            'receiver_signature' => $this->signature($payload),
            'received_by' => $user->id,
        ]);
    }

    /** @param array<string, mixed> $attributes */
    private function stamp(Shipment $shipment, array $attributes): Shipment
    {
        $shipment->update($attributes);

        return $shipment->refresh();
    }

    /** @param array<string, mixed> $payload */
    private function signature(array $payload): string
    {
        $signature = (string) ($payload['signature'] ?? '');

        if (! str_starts_with($signature, 'data:image/png;base64,') || strlen($signature) < 200) {
            throw new \InvalidArgumentException('A signature is required.');
        }

        if (strlen($signature) > self::MAX_SIGNATURE_BYTES) {
            throw new \InvalidArgumentException('That signature is too large.');
        }

        if (base64_decode(substr($signature, strlen('data:image/png;base64,')), true) === false) {
            throw new \InvalidArgumentException('That signature could not be read.');
        }

        return $signature;
    }

    private function whyNot(Shipment $shipment, string $step): string
    {
        return match ($step) {
            self::START_PICKING => 'Picking starts once every party has agreed and the run is scheduled.',
            self::PICK_LINE => 'Lines are picked while the run is in picking.',
            self::PREPARED => (string) $shipment->status === Workflow::PICKING
                ? 'Pick every line before marking the load prepared.'
                : 'The load can only be prepared while it is being picked.',
            self::COURIER_START => $shipment->courier_started_at !== null
                ? 'The trip has already started.'
                : 'The trip starts once the run is scheduled.',
            self::COURIER_CHECK => match (true) {
                $shipment->courier_started_at === null => 'Start the trip first.',
                (string) $shipment->status !== Workflow::READY => 'Wait until the origin has prepared the load.',
                default => 'The load has already been checked.',
            },
            self::COURIER_SIGN => 'Check the load before signing for it.',
            self::COURIER_ARRIVE => 'Only a run on the road can arrive.',
            self::RECEIVER_CHECK => 'Check the goods once the driver has arrived.',
            self::RECEIVER_SIGN => 'Check the goods before signing them in.',
            default => 'That step is not available right now.',
        };
    }
}
