<?php

declare(strict_types=1);

namespace App\Services\Guide\Stations;

use App\Models\Auth\User;
use App\Models\Procurement\PriceObservation;
use App\Models\Procurement\ProductIdea;
use App\Services\Procurement\PriceCheckService;
use App\Services\Procurement\ProductIdeaService;

/**
 * The Product ideas desk: what the stores think we should sell, moved along
 * its steps (suggested, price check, prices in, sourcing, approved). Seller
 * and admin apps; who may move what is ProductIdeaService's call, and each
 * idea's own `moves` (with what each step asks for) is what is offered.
 */
class IdeaStations
{
    use BuildsStations;

    public function __construct(private readonly ProductIdeaService $ideas, private readonly PriceCheckService $checks)
    {
    }

    /** @return array<int, array<string, mixed>> */
    public function __invoke(User $viewer, string $app, int $storeId, array $shelving = []): array
    {
        $this->app = $app;

        if (! in_array($app, ['seller', 'admin'], true)) {
            return [];
        }

        $prefix = "{$app}.ideas";
        $items = [];

        if ($this->ideas->canSuggest($viewer)) {
            $suggest = $this->act('suggest', 'Suggest a product', "{$prefix}.store", [], 'post', [], [
                ['name' => 'name', 'label' => 'What is the product?', 'type' => 'text', 'required' => true],
                ['name' => 'reason', 'label' => 'Why would it sell?', 'type' => 'text'],
                ['name' => 'target_price', 'label' => 'Price you expect (optional)', 'type' => 'number', 'min' => 0],
            ], 'primary');

            if ($suggest !== null) {
                $items[] = ['id' => 'suggest', 'title' => 'Suggest a product', 'subtitle' => 'Something customers ask for that the shop does not stock.', 'actions' => [$suggest]];
            }
        }

        $ideas = $this->ideas->visibleTo(ProductIdea::query(), $viewer)->whereIn('status', ProductIdea::OPEN)->latest('id')->limit(10)->get();

        foreach ($ideas as $idea) {
            $p = $this->ideas->present($idea, $viewer);
            $actions = [];

            foreach ($p['moves'] as $move) {
                $fields = [];
                if ($move['needs_note']) {
                    $fields[] = ['name' => 'note', 'label' => 'Why', 'type' => 'text', 'required' => true];
                }
                if ($move['asks_target_price']) {
                    $fields[] = ['name' => 'target_price', 'label' => 'Target price (optional)', 'type' => 'number', 'min' => 0];
                }
                if ($move['opens_check']) {
                    $fields[] = ['name' => 'shops_wanted', 'label' => 'How many shops to price', 'type' => 'number', 'default' => 3, 'min' => 1, 'max' => 50, 'required' => true];
                }
                // A first price check on an idea for every store needs a store chosen: that is the page's form.
                if ($move['needs_store']) {
                    continue;
                }

                $actions[] = $this->act('move-'.$move['to'], (string) $move['label'], "{$prefix}.move", ['idea' => $idea->id], 'post', ['to' => $move['to']], $fields, $move['to'] === ProductIdea::REJECTED ? 'inherit' : 'success');
            }

            $items[] = [
                'id' => (string) $idea->id,
                'title' => (string) $idea->name,
                'subtitle' => ($p['store']['name'] ?? 'Every store').' · suggested by '.($p['suggested_by'] ?? ''),
                'lines' => array_values(array_filter([$p['reason'], $p['target_price'] !== null ? 'Target price '.number_format((float) $p['target_price'], 2) : null])),
                'chips' => [['label' => (string) $p['status'], 'tone' => 'info']],
                'actions' => array_values(array_filter($actions)),
            ];
        }

        // Prices someone saw in a shop, waiting for a second person to verify them.
        $prices = PriceObservation::query()->whereNull('verified_at')->whereNull('rejected_at')->with(['check.idea', 'check.store', 'shop'])->latest('id')->limit(10)->get()
            ->filter(fn (PriceObservation $o): bool => $this->checks->mayVerify($viewer, $o))
            ->map(fn (PriceObservation $o): array => [
                'id' => 'price-'.$o->id,
                'title' => ($o->check?->idea?->name ?? 'Product').' · '.number_format((float) $o->price_per_piece, 2).' per piece',
                'subtitle' => ($o->shop?->name ?? 'A shop').' · '.($o->check?->store?->name ?? '').' · seen '.$o->observed_on?->toDateString(),
                'lines' => array_values(array_filter([$o->note])),
                'chips' => [['label' => 'Check the price', 'tone' => 'warning']],
                'actions' => array_values(array_filter([
                    $this->act('verify', 'The price is right', "{$app}.price_checks.verify", ['observation' => $o->id], 'post', [], [], 'success'),
                    $this->act('reject', 'Wrong', "{$app}.price_checks.reject", ['observation' => $o->id], 'post', [], [['name' => 'reason', 'label' => 'Why', 'type' => 'text', 'required' => true]], 'inherit'),
                ])),
            ])->values()->all();

        return [
            $this->station('ideas', 'Product ideas', 'desk_ideas', $items, [
                'blurb' => 'What the stores think we should sell: price-checked in shops, quoted by suppliers, approved to buy.',
                'empty' => 'No idea is open.',
                'open' => $this->open('Open Product ideas', "{$prefix}.index"),
            ]),
            $this->station('price_checks', 'Prices to verify', 'desk_ideas', $prices, [
                'blurb' => 'Prices people saw in shops: a second person confirms each before it counts.',
                'empty' => 'No price is waiting to be verified.',
                'open' => $this->open('Open Price checks', "{$app}.price_checks.index"),
            ]),
        ];
    }
}
