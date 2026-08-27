# Pykes logo — sprout tile

The mark is a pixel seedling on a rounded green tile. Geometry lives on a **12×12 pixel grid**;
every coordinate is an integer. Never scale by a non-integer factor at small sizes and never
add curves, gradients, or strokes to the sprout.

## Colors

| token | hex | oklch (source of truth) |
| --- | --- | --- |
| tile green | `#3ec27a` | `oklch(0.72 0.16 150)` |
| sprout ink | `#0d2618` | `oklch(0.2 0.03 150)` |

Hex values are sRGB approximations of the oklch tokens already used in the app; prefer the
oklch values anywhere CSS is doing the painting.

## Files

- `pykes-mark.svg` — full lockup mark: green tile + dark sprout. Default everywhere.
- `pykes-glyph-green.svg` — sprout only, green, transparent background. Use on the dark app chrome when a tile would feel heavy.
- `favicon.svg` — same as the tile, sized for the tab.
- `PykesMark.tsx` — React component, `variant="tile" | "glyph"`.

## Drop into the repo

```
public/
  favicon.svg
  logo/pykes-mark.svg
  logo/pykes-glyph-green.svg
src/components/PykesMark.tsx
```

Head tags:

```html
<link rel="icon" type="image/svg+xml" href="/favicon.svg" />
<link rel="apple-touch-icon" href="/logo/pykes-mark.svg" />
```

Header lockup:

```tsx
<a href="/" className="flex items-center gap-[9px]">
  <PykesMark size={20} />
  <span className="text-[17px] font-extrabold tracking-[-0.01em]">Pykes</span>
</a>
```

## Rules

- Minimum size 16px. Below that, drop the tile and use the glyph.
- Tile corner radius is `7/32` of the tile width (≈22%). Scale it with the tile.
- Clear space around the tile: one quarter of the tile width.
- Wordmark is Inter 800, letter-spacing `-0.01em`, sitting at 9px gap from the tile.
- Do not recolor the tile per project or per theme. One green.

## PNG / ICO

SVG covers browsers and app manifests. If a raster is needed (store listings, OG images),
export `pykes-mark.svg` at 512×512 and 1024×1024 with no antialiasing on the sprout edges.
