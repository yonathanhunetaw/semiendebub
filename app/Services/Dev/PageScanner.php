<?php

declare(strict_types=1);

namespace App\Services\Dev;

use Symfony\Component\Finder\Finder;

/**
 * Indexes every Inertia page component under resources/js/Pages, keyed by the
 * component name a controller would pass to `Inertia::render()`.
 *
 * The key has to match that string exactly — `app.tsx` resolves pages with
 * `import.meta.glob('./Pages/**\/*.{tsx,jsx}')`, so the component name is the
 * path relative to resources/js/Pages with the extension dropped, original
 * casing intact ("Seller/Shipments/index", not ".../Index"). Anything the
 * generator cannot match here is reported as a broken page link instead.
 */
final class PageScanner
{
    /**
     * Extensions `app.tsx` can resolve, in precedence order: a `.tsx` file wins
     * when both spellings of a component exist, which is what the client does.
     *
     * @var list<string>
     */
    private const EXTENSIONS = ['tsx', 'jsx'];

    /**
     * How far past a `Page.layout = ...` assignment to look for the layout tag.
     * Single-line arrows need 1; the parenthesised multi-line form puts the tag
     * on the next line or two.
     */
    private const LAYOUT_LOOKAHEAD = 5;

    public function __construct(
        private readonly string $basePath,
        private readonly DomainClassifier $classifier,
    ) {
    }

    /**
     * @return array<string, array<string, mixed>> keyed by Inertia component name
     */
    public function all(): array
    {
        $root = $this->basePath.'/resources/js/Pages';

        if (! is_dir($root)) {
            return [];
        }

        $pages = [];

        foreach ($this->pageFiles($root) as $component => $file) {
            $pages[$component] = $this->describe($component, $file);
        }

        ksort($pages);

        return $pages;
    }

    /**
     * Every resolvable page file, keyed by component name. Later extensions do
     * not clobber earlier ones, so self::EXTENSIONS order decides collisions.
     *
     * @return array<string, string> component => absolute path
     */
    private function pageFiles(string $root): array
    {
        $files = [];

        foreach (self::EXTENSIONS as $extension) {
            $finder = Finder::create()->files()->in($root)->name('*.'.$extension)->sortByName();

            foreach ($finder as $file) {
                $path = $file->getRealPath() ?: $file->getPathname();
                $component = $this->componentName($root, $path, $extension);

                if ($component === '') {
                    continue;
                }

                $files[$component] ??= $path;
            }
        }

        return $files;
    }

    /**
     * @return array<string, mixed>
     */
    private function describe(string $component, string $file): array
    {
        $source = is_readable($file) ? (string) file_get_contents($file) : '';

        return [
            'component' => $component,
            'domain' => $this->domainFor($component),
            'file' => $this->relative($file),
            'layout' => $this->layout($source),
            'lines' => $this->lines($source),
            'exists' => true,
            // Filled in by DomainMapGenerator::backfillUsage() once the routes
            // that render this component are known.
            'routes' => [],
        ];
    }

    /**
     * "…/resources/js/Pages/Seller/Shipments/index.tsx" => "Seller/Shipments/index".
     */
    private function componentName(string $root, string $path, string $extension): string
    {
        $relative = ltrim(str_replace($root, '', $path), DIRECTORY_SEPARATOR.'/');
        $relative = str_replace(DIRECTORY_SEPARATOR, '/', $relative);

        return (string) preg_replace('/\.'.preg_quote($extension, '/').'$/', '', $relative);
    }

    /**
     * Classify by walking the component's folders outward-in, so both
     * "Admin/Items/Index" and "Welcome/Admin" land on `admin` rather than
     * dumping the whole Welcome/ folder into the shared fallback.
     */
    private function domainFor(string $component): string
    {
        return $this->classifier->resolve(explode('/', $component));
    }

    /**
     * The persistent layout a page opts into with `Page.layout = …`, falling
     * back to a layout the component wraps itself in. Null when it renders bare
     * (login screens, co-located partials).
     */
    private function layout(string $source): ?string
    {
        if ($source === '') {
            return null;
        }

        // Split on real newlines only — see lines() for why \R is unsafe here.
        $lines = explode("\n", str_replace(["\r\n", "\r"], "\n", $source));

        foreach ($lines as $number => $line) {
            if (preg_match('/^\s*[A-Za-z0-9_$]+\s*\.\s*layout\s*=/', $line) !== 1) {
                continue;
            }

            $window = implode("\n", array_slice($lines, $number, self::LAYOUT_LOOKAHEAD));

            $layout = $this->firstLayoutTag($window);

            if ($layout !== null) {
                return $layout;
            }
        }

        return $this->firstLayoutTag($source);
    }

    /**
     * First `<SomethingLayout …>` (or bare `<Layout …>`) JSX tag in a chunk.
     */
    private function firstLayoutTag(string $slice): ?string
    {
        if (preg_match('/<((?:[A-Z][A-Za-z0-9_]*)?Layout)\b/', $slice, $matches) === 1) {
            return $matches[1];
        }

        return null;
    }

    /**
     * Counted on bytes rather than with `\R`, which without the /u modifier
     * also matches a bare 0x85 — the third byte of plenty of Ethiopic
     * characters, so an Amharic page would be counted a line long per
     * occurrence (and split mid-character).
     */
    private function lines(string $source): int
    {
        $normalized = rtrim(str_replace(["\r\n", "\r"], "\n", $source), "\n");

        if ($normalized === '') {
            return 0;
        }

        return substr_count($normalized, "\n") + 1;
    }

    private function relative(string $path): string
    {
        return ltrim(str_replace($this->basePath, '', $path), '/');
    }
}
