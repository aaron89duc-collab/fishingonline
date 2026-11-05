"""Copy + clean vendor assets (E:\\game\\Fish\\asset\\*.zip, unzipped to assets_raw) into public/assets.
- opaque backgrounds -> JPG
- fish art: remove stray fragments, face LEFT, max width 1000
- generates fish shadow silhouettes (blurred) per species
Run: python3 tools/build_assets.py <assets_raw_dir>
"""
import sys, os, json, shutil
import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage

RAW = sys.argv[1] if len(sys.argv) > 1 else "/home/claude/assets_raw"
OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "public", "assets")
M2 = f"{RAW}/fwo_moc2_rig_phao_fixed/export/2x"
M3 = f"{RAW}/fwo_moc3_bg_fx/export"
M4 = f"{RAW}/fwo_moc4_ca_ui/export"
M5 = f"{RAW}/fwo_moc5_goi1_ban_giao/export"
M6 = f"{RAW}/fwo_moc6_khu_moi/export"
M8 = f"{RAW}/fwo_moc8_ca_goi2/export"
M9 = f"{RAW}/fwo_moc9_can_may_phao_skin/export"
PX = f"{RAW}/fwo_parallax_splash/export"
manifest = {}

def out(rel):
    p = os.path.join(OUT, rel); os.makedirs(os.path.dirname(p), exist_ok=True); return p

def cp(src, rel, maxw=None, scale=None):
    im = Image.open(src)
    if scale: im = im.resize((max(1, round(im.width * scale)), max(1, round(im.height * scale))), Image.LANCZOS)
    if maxw and im.width > maxw:
        im = im.resize((maxw, round(im.height * maxw / im.width)), Image.LANCZOS)
    if rel.endswith(".jpg"):
        im.convert("RGB").save(out(rel), quality=84, optimize=True, progressive=True)
    else:
        im.save(out(rel), optimize=True)
    manifest[rel] = list(im.size)
    return im

def clean_fish(src, rel, flip, maxw=1000, keep_ratio=0.04):
    im = Image.open(src).convert("RGBA")
    a = np.array(im)[:, :, 3]
    lab, n = ndimage.label(a > 24, structure=np.ones((3, 3)))
    if n > 1:
        sizes = ndimage.sum(np.ones_like(a), lab, range(1, n + 1))
        main = int(np.argmax(sizes)) + 1
        near = ndimage.binary_dilation(lab == main, iterations=10)
        H, W = a.shape
        keep = np.zeros(n + 1, bool); keep[main] = True
        for i in range(1, n + 1):
            if i == main or sizes[i - 1] < 40: continue
            comp = lab == i
            border = comp[0].any() or comp[-1].any() or comp[:, 0].any() or comp[:, -1].any()
            if (comp & near).any() and not border and sizes[i - 1] < 0.15 * sizes[main - 1]:
                keep[i] = True
        mask = keep[lab]
        arr = np.array(im); arr[:, :, 3] = np.where(mask | (lab == 0) & (a <= 24), arr[:, :, 3], 0)
        arr[:, :, 3] = np.where(mask, arr[:, :, 3], 0)
        im = Image.fromarray(arr)
    bb = im.getbbox(); im = im.crop(bb)
    if flip: im = im.transpose(Image.FLIP_LEFT_RIGHT)
    if im.width > maxw: im = im.resize((maxw, round(im.height * maxw / im.width)), Image.LANCZOS)
    im.save(out(rel), optimize=True)
    manifest[rel] = list(im.size)
    return im

def shadow_from(im, rel, w=360):
    a = im.split()[3]
    h = round(im.height * w / im.width)
    a = a.resize((w, h), Image.LANCZOS)
    pad = 24
    canvas = Image.new("L", (w + pad * 2, h + pad * 2), 0); canvas.paste(a, (pad, pad))
    canvas = canvas.filter(ImageFilter.GaussianBlur(7)).point(lambda v: int(v * 0.85))
    sh = Image.new("RGBA", canvas.size, (12, 40, 46, 0)); sh.putalpha(canvas)
    sh.save(out(rel), optimize=True); manifest[rel] = list(sh.size)

def seq(pattern, n, rel_pattern):
    for i in range(n):
        cp(pattern.format(i=i), rel_pattern.format(i=i))

if os.path.exists(OUT): shutil.rmtree(OUT)

# ---------- backgrounds: Bờ cỏ parallax ----------
cp(f"{PX}/bg/fwo_bg_sky_2880.png", "bg/boco/sky.jpg")
cp(f"{PX}/bg/fwo_bg_mountains_far_2880.png", "bg/boco/mtn_far.png")
cp(f"{PX}/bg/fwo_bg_mountains_near_2880.png", "bg/boco/mtn_near.png")
cp(f"{PX}/bg/fwo_bg_treeline_2880.png", "bg/boco/treeline.png")
cp(f"{PX}/bg/fwo_bg_water_2880.png", "bg/boco/water.jpg")
cp(f"{PX}/bg/fwo_bg_reflection_2880.png", "bg/boco/reflection.png")
for i, nm in enumerate(["large_01", "medium_05", "medium_06", "small_01", "small_02", "small_03", "small_04"]):
    cp(f"{PX}/bg/fwo_bg_cloud_{nm}.png", f"bg/clouds/cloud_{i}.png")
cp(f"{M3}/bg/fwo_bg_lake_boco_full.png", "bg/menu_boco.jpg", maxw=1920)
# ---------- props ----------
for f in ["lotus_leaf_01", "lotus_leaf_02", "lotus_leaf_03", "lotus_leaf_04", "lotus_leaf_05", "lotus_leaf_06",
          "lotus_flower_01", "lotus_flower_02", "lotus_bud_01", "lotus_bud_02", "hyacinth_01", "hyacinth_02", "hyacinth_03",
          "reed_01", "reed_02", "reed_03", "reed_04", "rock", "tackle_box", "bait_box"]:
    cp(f"{M3}/bg/fwo_bg_{f}.png", f"props/{f}.png")
for f in ["angler_sitting", "angler_standing", "creature_heron", "creature_dragonfly", "creature_butterfly", "creature_frog"]:
    cp(f"{M4}/pr/fwo_pr_{f}.png", f"props/{f}.png", maxw=520)
# ---------- FX ----------
seq(f"{M3}/fx/fwo_fx_ripple_{{i:02d}}.png", 12, "fx/ripple_{i:02d}.png")
seq(f"{M3}/fx/fwo_fx_ripple_small_{{i:02d}}.png", 8, "fx/ripple_small_{i:02d}.png")
seq(f"{M3}/fx/fwo_fx_bubbles_{{i:02d}}.png", 8, "fx/bubbles_{i:02d}.png")
seq(f"{M3}/fx/fwo_fx_line_wake_{{i:02d}}.png", 8, "fx/line_wake_{i:02d}.png")
seq(f"{M3}/fx/fwo_fx_fish_wake_{{i:02d}}.png", 8, "fx/fish_wake_{i:02d}.png")
seq(f"{PX}/fx/fwo_fx_splash_light_{{i:02d}}.png", 10, "fx/splash_light_{i:02d}.png")
seq(f"{PX}/fx/fwo_fx_splash_strong_{{i:02d}}.png", 12, "fx/splash_strong_{i:02d}.png")
for i in range(1, 7): cp(f"{M3}/fx/fwo_fx_sparkle_{i:02d}.png", f"fx/sparkle_{i}.png")
cp(f"{M3}/fx/fwo_fx_target_ring.png", "fx/target_ring.png")
cp(f"{M3}/fx/fwo_fx_trajectory_dot.png", "fx/trajectory_dot.png")
# ---------- rig (2x art, scaled in game) ----------
for f in ["hand_right_grip", "forearm_sleeve", "rod_blank", "reel_spinning", "net"]:
    cp(f"{M2}/rig/fwo_rig_{f}.png", f"rig/{f}.png")
rb = Image.open(f"{M2}/rig/fwo_rig_rod_blank.png"); rb = rb.resize((760, round(rb.height * 760 / rb.width * 1.25)), Image.LANCZOS); rb.save(out("rig/rod_blank.png")); manifest["rig/rod_blank.png"] = list(rb.size)
# sleeve only (no fist) cut from forearm_sleeve for the right arm
fs = Image.open(f"{M2}/rig/fwo_rig_forearm_sleeve.png"); sl = fs.crop((330, 0, fs.width, fs.height)); sl.save(out("rig/sleeve_only.png")); manifest["rig/sleeve_only.png"] = list(sl.size)
# ---------- floats ----------
for v in ["basic", "contrast", "night_glow"]:
    cp(f"{M5}/float/fwo_float_long_{v}_game2x.png", f"float/long_{v}.png")
# ---------- fish ----------
FISH = [  # Phase 1: three species (Gói 1 art faces left already)
    ("ro_phi", f"{M4}/fish/fwo_fish_ro_phi", False), ("ca_tre", f"{M4}/fish/fwo_fish_ca_tre", False),
    ("ca_loc", f"{M4}/fish/fwo_fish_ca_loc", False),
    # Fish Fight System: Strategic (chép) + Heavy Puller (trắm) from Gói 2 (faces right -> flip)
    ("ca_chep", f"{M8}/fish/fwo_fish2_ca_chep", True), ("tram_co", f"{M8}/fish/fwo_fish2_tram_co", True),
]
for fid, base, flip in FISH:
    im = clean_fish(base + "_art.png", f"fish/{fid}.png", flip)
    shadow_from(im, f"fish/shadow_{fid}.png")
# ---------- UI ----------
for f in ["bar_bg", "bar_tension_full", "bar_cast_full", "bar_stamina_full", "panel_info", "panel_result", "toast", "button_round", "button_square"]:
    cp(f"{M4}/ui/fwo_ui_{f}.png", f"ui/{f}.png")
for f in ["home", "help", "close"]:
    cp(f"{M4}/ui/fwo_ui_icon_{f}.png", f"ui/icon_{f}.png", maxw=96)
for f in ["hook", "bait_worm", "bucket"]:
    cp(f"{M4}/ui/fwo_ui_gear_{f}.png", f"ui/gear_{f}.png", maxw=128)
cp(f"{M4}/ui/fwo_ui_logo.png", "ui/logo.png", maxw=520)
cp(f"{M4}/ui/fwo_ui_app_icon.png", "../favicon.png", maxw=192)

# remove black frame lines that the vendor's background removal left on image borders
def strip_border_lines(rel, margin=14):
    p = out(rel); im = Image.open(p).convert("RGBA"); a = np.array(im)
    dark = (a[:, :, 3] > 150) & (a[:, :, :3].max(axis=2) < 45)
    H, W = dark.shape
    for x in list(range(margin)) + list(range(W - margin, W)):
        if dark[:, x].sum() > 0.45 * H: a[:, x, 3] = 0
    for y in list(range(margin)) + list(range(H - margin, H)):
        if dark[y, :].sum() > 0.45 * W: a[y, :, 3] = 0
    Image.fromarray(a).save(p, optimize=True)
for r in ["rig/hand_right_grip.png", "rig/forearm_sleeve.png", "rig/sleeve_only.png", "rig/reel_spinning.png", "rig/net.png"]:
    strip_border_lines(r)

json.dump(manifest, open(out("manifest.json"), "w"), indent=1)
tot = sum(os.path.getsize(os.path.join(dp, f)) for dp, _, fs in os.walk(OUT) for f in fs)
print(len(manifest), "files", round(tot / 1e6, 1), "MB")
