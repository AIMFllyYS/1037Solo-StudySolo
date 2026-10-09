"""Build film/assets from captured screenshots: downscales, card crops, paper texture, local fonts.

Run from promo/ after the capture scripts have filled shots/ and seq/.
"""
import concurrent.futures
import glob
import hashlib
import os
import re
import shutil
import subprocess

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

A = "film/assets"
os.makedirs(f"{A}/lo", exist_ok=True)
for name, target in [("shots", "../../shots"), ("seq", "../../seq")]:
    if not os.path.exists(f"{A}/{name}"):
        os.symlink(target, f"{A}/{name}")

# 1. downscaled stills (2048 wide) for the montage and laptop screen
for f in glob.glob("shots/*.png"):
    n = os.path.basename(f)
    if n.startswith(("sheet", "try", "crop", "_", "cards")):
        continue
    im = Image.open(f).convert("RGB")
    if im.size[0] >= 3000:
        im.resize((2048, 1152), Image.LANCZOS).save(f"{A}/lo/" + n.replace(".png", ".jpg"), quality=93)
shutil.copy("seq/agent/0168.jpg", f"{A}/lo/agent-done.jpg")

# 2. the four source cards, cropped from the final agent frame (css px × 2)
im = Image.open("seq/agent/0168.jpg")
for i, (x, y, w, h) in enumerate([[1297, 105, 281, 111], [1297, 223, 281, 95], [1297, 325, 281, 80], [1297, 412, 281, 68]]):
    im.crop((x * 2, y * 2, (x + w) * 2, (y + h) * 2)).save(f"{A}/card{i + 1}.jpg", quality=95)

# 2b. flashcard faces for the in-film 3D flip (card rect in UI css px, frames from capture/cap_new.js)
x, y, w, h = 374, 204, 660, 558
for name, (fa, fb) in {"A": (0, 11), "B": (12, 23), "C": (24, 35)}.items():
    for side, i in (("front", fa), ("back", fb)):
        Image.open(f"seq/cards/{i:04d}.jpg").crop((2 * x, 2 * y, 2 * (x + w), 2 * (y + h))).save(f"{A}/flip-{name}-{side}.jpg", quality=94)

# 3. procedural paper texture
rs = np.random.RandomState(7)
Wd, Ht = 2600, 1500


def blur_noise(scale, sigma):
    n = rs.rand(Ht // scale + 2, Wd // scale + 2)
    im = Image.fromarray((n * 255).astype("uint8")).resize((Wd, Ht), Image.BICUBIC).filter(ImageFilter.GaussianBlur(sigma))
    return np.asarray(im).astype("float32") / 255


base = np.array([239, 229, 207], dtype="float32")
low, mid = blur_noise(60, 40) - 0.5, blur_noise(12, 6) - 0.5
grain = rs.rand(Ht, Wd).astype("float32") - 0.5
img = base[None, None, :] + (low * 22 + mid * 9 + grain * 10)[..., None]
fib = Image.new("L", (Wd, Ht), 0)
d = ImageDraw.Draw(fib)
for _ in range(1400):
    x, y = rs.rand() * Wd, rs.rand() * Ht
    a, L = rs.rand() * np.pi, rs.rand() * 40 + 8
    d.line([x, y, x + np.cos(a) * L, y + np.sin(a) * L], fill=int(rs.rand() * 60 + 20), width=1)
fib = np.asarray(fib.filter(ImageFilter.GaussianBlur(0.6))).astype("float32") / 255
img -= fib[..., None] * np.array([18, 20, 26])
yy, xx = np.mgrid[0:Ht, 0:Wd]
for cx, cy, r in [(420, 1250, 160), (2200, 300, 120), (1500, 1300, 90)]:
    dd = np.sqrt((xx - cx) ** 2 + (yy - cy) ** 2)
    ring = np.exp(-((dd - r) ** 2) / (2 * 6 ** 2)) * 0.9 + np.exp(-(dd ** 2) / (2 * (r * 0.8) ** 2)) * 0.25
    img -= ring[..., None] * np.array([10, 16, 26])
v = ((xx - Wd / 2) / (Wd / 2)) ** 2 + ((yy - Ht / 2) / (Ht / 2)) ** 2
img *= (1 - 0.28 * np.clip(v, 0, 1.5) ** 1.4)[..., None]
Image.fromarray(np.clip(img, 0, 255).astype("uint8")).save(f"{A}/paper.jpg", quality=92)

# 4. fonts, mirrored locally so every frame renders identically
os.makedirs("film/fonts", exist_ok=True)
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
q = ("https://fonts.googleapis.com/css2?family=Noto+Serif+SC:wght@400;600;900&family=Noto+Sans+SC:wght@300;400;500;700;800;900"
     "&family=Inter:wght@300;400;500;600;800;900&family=JetBrains+Mono:wght@400;600&family=Long+Cang&family=Caveat:wght@500;600;700&display=block")
css = subprocess.run(["curl", "-sS", "-A", UA, q], capture_output=True, text=True, check=True).stdout
urls = sorted(set(re.findall(r"url\((https://[^)]+)\)", css)))


def dl(u):
    name = hashlib.md5(u.encode()).hexdigest()[:16] + ".woff2"
    if not os.path.exists(f"film/fonts/{name}"):
        subprocess.run(["curl", "-sS", "-o", f"film/fonts/{name}", u], check=False)
    return u, name


with concurrent.futures.ThreadPoolExecutor(16) as ex:
    for u, n in ex.map(dl, urls):
        css = css.replace(u, n)
open("film/fonts/fonts.css", "w").write(css)
print("assets ready")
