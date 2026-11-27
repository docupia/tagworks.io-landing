# TagWorks logo

All logo files live in `apps/web/public/brand/` and are served at `https://tagworks.io/brand/<file>`.

| File | Use |
| --- | --- |
| `tagworks-logo.svg` | Mark + wordmark, for light backgrounds |
| `tagworks-logo-dark.svg` | Mark + wordmark, for dark backgrounds |
| `tagworks-mark.svg` | Mark only (blue square, white tag). Works on light and dark |
| `tagworks-mark-inverse.svg` | Mark on white, for blue or photo backgrounds |
| `tagworks-mark-mono.svg` | One-color tag using `currentColor` |
| `tagworks-wordmark.svg` / `tagworks-wordmark-dark.svg` | Wordmark only |
| `icon-192.png`, `icon-512.png`, `icon-maskable-512.png` | Web app manifest icons |

`app/icon.svg`, `app/favicon.ico` (16/32/48) and `app/apple-icon.png` (180) are picked up by Next.js automatically.
In React, use `<BrandMark />` from `components/marketing/brand-mark.tsx`.

Colors: blue `#2563eb`, ink `#0f172a`, white. Wordmark: Inter ExtraBold, outlined to paths.
Keep clear space of at least half the mark's height around the logo, and do not recolor or stretch it.

To change the artwork, edit `scripts/brand/generate-logo.py` and run:

```sh
pip install fonttools cairosvg pillow
python3 scripts/brand/generate-logo.py /tmp/brand-out
```

Set `INTER_FONT` to the path of `Inter-ExtraBold.otf` if it is not in `/usr/share/fonts/opentype/inter/`. Copy the outputs into the paths above.
