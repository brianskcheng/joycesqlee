"""One-off: render Mosaics portfolio PDF pages and extract hero render."""
import fitz
import os

PDF = r"D:\Architecture Portfolio\Joyce Lee Portfolio - Full Print.pdf"
OUT = os.path.join(os.path.dirname(__file__), "..", "projects", "mosaics-of-urban-giardino")
DPI = 200
ZOOM = DPI / 72.0
MATRIX = fitz.Matrix(ZOOM, ZOOM)

PAGE_MAP = {
    22: "programme-spatial-strategy.png",
    23: "retrofitting-piazza-adda.png",
    24: "terraced-giardino-section.png",
    25: "growth-exchange-regeneration.png",
    26: "inhabiting-the-facade.png",
    27: "inhabiting-the-biome.png",
    28: "the-drying-tower.png",
    29: "creative-process.png",
}

os.makedirs(OUT, exist_ok=True)
doc = fitz.open(PDF)

for page_num, filename in PAGE_MAP.items():
    page = doc[page_num - 1]
    pix = page.get_pixmap(matrix=MATRIX, alpha=False)
    path = os.path.join(OUT, filename)
    pix.save(path)
    print(f"saved {filename} ({pix.width}x{pix.height})")

# Page 20: extract largest embedded image for hero/thumbnail
page20 = doc[19]
images = page20.get_images(full=True)
best = None
best_area = 0
for img in images:
    xref = img[0]
    try:
        base = doc.extract_image(xref)
        w, h = base["width"], base["height"]
        area = w * h
        if area > best_area and w > 400 and h > 300:
            best_area = area
            best = base
    except Exception:
        continue

hero_path = os.path.join(OUT, "hero-understorey-giardino.png")
if best:
    with open(hero_path, "wb") as f:
        f.write(best["image"])
    print(f"saved hero from embedded image ({best['width']}x{best['height']})")
else:
    # Fallback: render top portion of page 20 (main visual area)
    rect = page20.rect
    clip = fitz.Rect(rect.x0, rect.y0 + rect.height * 0.12, rect.x1, rect.y0 + rect.height * 0.62)
    pix = page20.get_pixmap(matrix=MATRIX, clip=clip, alpha=False)
    pix.save(hero_path)
    print(f"saved hero from page crop ({pix.width}x{pix.height})")

doc.close()
print("done")
