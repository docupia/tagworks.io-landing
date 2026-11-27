# Generates the TagWorks logo set. Usage: INTER_FONT=/path/Inter-ExtraBold.otf python3 generate-logo.py OUT_DIR
import io, os, sys
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
import cairosvg
from PIL import Image

OUT = sys.argv[1]
os.makedirs(OUT, exist_ok=True)
BLUE = "#2563eb"; INK = "#0f172a"; WHITE = "#ffffff"

# Mark: 64x64 rounded square, white tag pointing right with a hole.
TAG = "M17 22.5a3 3 0 0 1 3-3h17.6a3 3 0 0 1 2.2.95l9.4 10.1a2 2 0 0 1 0 2.7l-9.4 10.1a3 3 0 0 1-2.2.95H20a3 3 0 0 1-3-3Z"
T = "translate(32 32) scale(1.22) translate(-33.4 -32)"
def mark_body(bg, fg, hole):
    return (f'<rect width="64" height="64" rx="15" fill="{bg}"/>'
            f'<g transform="{T}"><path d="{TAG}" fill="{fg}"/>'
            f'<circle cx="25.5" cy="32" r="3.6" fill="{hole}"/></g>')
def svg(w, h, body, title="TagWorks"):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="{w}" height="{h}" role="img" aria-label="{title}">'
            f'<title>{title}</title>{body}</svg>\n')

# Wordmark glyphs from Inter ExtraBold, converted to paths so no font is needed.
font = TTFont(os.environ.get("INTER_FONT", "/usr/share/fonts/opentype/inter/Inter-ExtraBold.otf"))
gs = font.getGlyphSet(); cmap = font.getBestCmap(); upm = font["head"].unitsPerEm
def wordmark_path(text, size, x0, baseline, tracking=-0.02):
    s = size / upm; x = x0; d = []
    for ch in text:
        g = cmap[ord(ch)]
        pen = SVGPathPen(gs)
        gs[g].draw(TransformPen(pen, (s, 0, 0, -s, x, baseline)))
        d.append(pen.getCommands())
        x += gs[g].width * s + tracking * size
    return " ".join(d), x - tracking * size
WM_SIZE = 40
wm_d, wm_end = wordmark_path("TagWorks", WM_SIZE, 0, 38)
wm_w = round(wm_end + 1)

files = {}
files["tagworks-mark.svg"] = svg(64, 64, mark_body(BLUE, WHITE, BLUE))
files["tagworks-mark-inverse.svg"] = svg(64, 64, mark_body(WHITE, BLUE, WHITE))
files["tagworks-mark-mono.svg"] = svg(64, 64, f'<path transform="{T}" d="{TAG}" fill="currentColor" fill-rule="evenodd"/>'.replace('Z"', 'ZM25.5 28.4a3.6 3.6 0 1 0 0 7.2 3.6 3.6 0 0 0 0-7.2Z"'))
files["tagworks-wordmark.svg"] = svg(wm_w, 48, f'<path d="{wm_d}" fill="{INK}"/>')
files["tagworks-wordmark-dark.svg"] = svg(wm_w, 48, f'<path d="{wm_d}" fill="{WHITE}"/>')
gap = 14; lw = 64 + gap + wm_w
lock = lambda col: (f'{mark_body(BLUE, WHITE, BLUE)}'
                    f'<g transform="translate({64+gap} 8)"><path d="{wm_d}" fill="{col}"/></g>')
files["tagworks-logo.svg"] = svg(lw, 64, lock(INK))
files["tagworks-logo-dark.svg"] = svg(lw, 64, lock(WHITE))
for n, c in files.items():
    open(os.path.join(OUT, n), "w").write(c)

def png(svgtext, size, pad=0, bg=None):
    raw = cairosvg.svg2png(bytestring=svgtext.encode(), output_width=size - 2*pad, output_height=size - 2*pad)
    im = Image.open(io.BytesIO(raw)).convert("RGBA")
    if pad or bg:
        canvas = Image.new("RGBA", (size, size), bg or (0, 0, 0, 0))
        canvas.alpha_composite(im, (pad, pad)); im = canvas
    return im
mark = files["tagworks-mark.svg"]
# Full-bleed square for app icons (iOS and Android round the corners themselves).
square = svg(64, 64, f'<rect width="64" height="64" fill="{BLUE}"/><g transform="translate(32 32) scale(0.82) translate(-32 -32)">' + mark_body(BLUE, WHITE, BLUE).split('/>',1)[1] + '</g>')
png(square, 180).save(os.path.join(OUT, "apple-icon.png"))
png(mark, 192).save(os.path.join(OUT, "icon-192.png"))
png(mark, 512).save(os.path.join(OUT, "icon-512.png"))
png(square, 512).save(os.path.join(OUT, "icon-maskable-512.png"))
png(mark, 48).save(os.path.join(OUT, "favicon.ico"), sizes=[(16,16),(32,32),(48,48)])
for n in ["tagworks-logo.svg", "tagworks-logo-dark.svg"]:
    bg = (255,255,255,255) if "dark" not in n else (15,23,42,255)
    raw = cairosvg.svg2png(bytestring=files[n].encode(), output_height=128)
    im = Image.open(io.BytesIO(raw)).convert("RGBA")
    c = Image.new("RGBA", (im.width+64, im.height+64), bg); c.alpha_composite(im, (32,32))
    c.save(os.path.join(OUT, "preview-" + n.replace(".svg", ".png")))
print("wordmark width", wm_w, "lockup", lw)
