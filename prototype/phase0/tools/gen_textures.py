"""우주마을 PHASE 0 시안용 절차적 텍스처 생성기.

- 지구 육지 윤곽: Natural Earth 1:50m land (퍼블릭 도메인, npm world-atlas 재배포본)
- 색상·구름·도시 불빛·달 표면: 전부 이 스크립트가 만든 절차적 노이즈 (외부 이미지 사용 없음)
출력: public/textures/*.jpg|png
"""
import json
import math
import os
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'public', 'textures')
os.makedirs(OUT, exist_ok=True)

W, H = 4096, 2048          # 지구 낮·밤 텍스처
NW, NH = 2048, 1024        # 노이즈 계산 해상도 (업샘플)

# ---------------------------------------------------------------- noise
GRADS = np.array([[1, 1, 0], [-1, 1, 0], [1, -1, 0], [-1, -1, 0], [1, 0, 1], [-1, 0, 1], [1, 0, -1], [-1, 0, -1],
                  [0, 1, 1], [0, -1, 1], [0, 1, -1], [0, -1, -1]], dtype=np.float32)


def make_perm(seed):
    p = np.random.default_rng(seed).permutation(256).astype(np.int32)
    return np.concatenate([p, p])


def fade(t):
    return t * t * t * (t * (t * 6 - 15) + 10)


def perlin3(x, y, z, perm):
    xi0 = np.floor(x).astype(np.int32)
    yi0 = np.floor(y).astype(np.int32)
    zi0 = np.floor(z).astype(np.int32)
    xf, yf, zf = x - xi0, y - yi0, z - zi0
    xi, yi, zi = xi0 & 255, yi0 & 255, zi0 & 255
    u, v, w = fade(xf), fade(yf), fade(zf)

    def g(ix, iy, iz, dx, dy, dz):
        h = perm[perm[perm[ix] + iy] + iz] % 12
        gr = GRADS[h]
        return gr[..., 0] * dx + gr[..., 1] * dy + gr[..., 2] * dz

    x1, y1, z1 = (xi + 1) & 255, (yi + 1) & 255, (zi + 1) & 255
    n000 = g(xi, yi, zi, xf, yf, zf)
    n100 = g(x1, yi, zi, xf - 1, yf, zf)
    n010 = g(xi, y1, zi, xf, yf - 1, zf)
    n110 = g(x1, y1, zi, xf - 1, yf - 1, zf)
    n001 = g(xi, yi, z1, xf, yf, zf - 1)
    n101 = g(x1, yi, z1, xf - 1, yf, zf - 1)
    n011 = g(xi, y1, z1, xf, yf - 1, zf - 1)
    n111 = g(x1, y1, z1, xf - 1, yf - 1, zf - 1)
    nx00 = n000 + u * (n100 - n000)
    nx10 = n010 + u * (n110 - n010)
    nx01 = n001 + u * (n101 - n001)
    nx11 = n011 + u * (n111 - n011)
    nxy0 = nx00 + v * (nx10 - nx00)
    nxy1 = nx01 + v * (nx11 - nx01)
    return nxy0 + w * (nxy1 - nxy0)


def fbm(P, octaves, seed, lac=2.0, gain=0.5):
    perm = make_perm(seed)
    amp, freq, tot, norm = 1.0, 1.0, 0.0, 0.0
    for o in range(octaves):
        tot = tot + amp * perlin3(P[0] * freq + o * 17.1, P[1] * freq + o * 9.7, P[2] * freq + o * 3.3, perm)
        norm += amp
        amp *= gain
        freq *= lac
    return tot / norm  # 대략 -0.6..0.6


def sphere_grid(w, h):
    lon = (np.arange(w, dtype=np.float32) + 0.5) / w * 360.0 - 180.0
    lat = 90.0 - (np.arange(h, dtype=np.float32) + 0.5) / h * 180.0
    LON, LAT = np.meshgrid(np.radians(lon), np.radians(lat))
    P = np.stack([np.cos(LAT) * np.cos(LON), np.sin(LAT), np.cos(LAT) * np.sin(LON)]).astype(np.float32)
    return P, np.degrees(LON), np.degrees(LAT)


def norm01(a):
    lo, hi = np.percentile(a, 1), np.percentile(a, 99)
    return np.clip((a - lo) / (hi - lo + 1e-9), 0, 1)


def smoothstep(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1)
    return t * t * (3 - 2 * t)


def up(a, w=W, h=H):
    """노이즈 필드를 지구 텍스처 해상도로 업샘플"""
    img = Image.fromarray(np.clip(a * 65535, 0, 65535).astype(np.uint16))
    return np.asarray(img.resize((w, h), Image.BICUBIC), dtype=np.float32) / 65535.0


def save_rgb(arr, name, q=90):
    Image.fromarray(np.clip(arr * 255 + 0.5, 0, 255).astype(np.uint8), 'RGB').save(os.path.join(OUT, name), quality=q, optimize=True)


def hexrgb(h):
    h = h.lstrip('#')
    return np.array([int(h[i:i + 2], 16) / 255.0 for i in (0, 2, 4)], dtype=np.float32)


def lerp(a, b, t):
    t = t[..., None] if np.ndim(t) == 2 else t
    return a + (b - a) * t


# ---------------------------------------------------------------- land mask
def land_mask():
    gj = json.load(open(os.path.join(ROOT, 'tools', 'out', 'land-50m.geojson')))
    SW, SH = W * 2, H * 2
    img = Image.new('L', (SW, SH), 0)
    d = ImageDraw.Draw(img)

    def unwrap(ring):
        """날짜변경선(±180°)을 넘는 고리는 경도를 이어 붙여 긴 가로줄이 생기지 않게 한다"""
        out, off, prev = [], 0.0, None
        for lon, lat in ring:
            if prev is not None and abs(lon - prev) > 180:
                off += -360.0 if lon > prev else 360.0
            out.append((lon + off, lat))
            prev = lon
        span = max(p[0] for p in out) - min(p[0] for p in out)
        return (ring if span >= 359 else out), span >= 359

    def draw(ring, fill):
        r, polar = unwrap(ring)
        shifts = [0.0] if polar else [0.0, -360.0, 360.0]
        for sh in shifts:
            pts = [((lon + sh + 180.0) / 360.0 * SW, (90.0 - lat) / 180.0 * SH) for lon, lat in r]
            xs = [p[0] for p in pts]
            if max(xs) < 0 or min(xs) > SW:
                continue
            d.polygon(pts, fill=fill)

    for f in gj['features']:
        g = f['geometry']
        polys = g['coordinates'] if g['type'] == 'MultiPolygon' else [g['coordinates']]
        for poly in polys:
            draw(poly[0], 255)
            for hole in poly[1:]:
                draw(hole, 0)
    return np.asarray(img.resize((W, H), Image.LANCZOS), dtype=np.float32) / 255.0


def box(LON, LAT, lon0, lon1, lat0, lat1, soft=5.0):
    return (smoothstep(lon0 - soft, lon0 + soft, LON) * (1 - smoothstep(lon1 - soft, lon1 + soft, LON)) *
            smoothstep(lat0 - soft, lat0 + soft, LAT) * (1 - smoothstep(lat1 - soft, lat1 + soft, LAT)))


def main():
    print('noise fields…', flush=True)
    Pn, LONn, LATn = sphere_grid(NW, NH)
    n_big = norm01(fbm(Pn * 2.2, 5, 11))
    n_mid = norm01(fbm(Pn * 7.0, 5, 23))
    n_fine = norm01(fbm(Pn * 26.0, 4, 37))

    print('land mask…', flush=True)
    land = land_mask()
    m_img = Image.fromarray((land * 255).astype(np.uint8))
    near = np.asarray(m_img.filter(ImageFilter.GaussianBlur(10)), dtype=np.float32) / 255.0
    wide = np.asarray(m_img.filter(ImageFilter.GaussianBlur(42)), dtype=np.float32) / 255.0

    _, LON, LAT = sphere_grid(W, H)
    ALAT = np.abs(LAT)
    NB, NM, NF = up(n_big), up(n_mid), up(n_fine)

    print('biomes…', flush=True)
    deserts = [(-17, 35, 15, 32), (35, 58, 14, 31), (55, 73, 24, 35), (52, 66, 38, 46), (76, 112, 37, 46),
               (116, 142, -31, -20), (12, 24, -27, -18), (-71, -68, -27, -19), (-117, -104, 26, 36), (-70, -65, -48, -40)]
    des = np.zeros_like(LAT)
    for b in deserts:
        des = np.maximum(des, box(LON, LAT, *b, soft=8.0))
    sav = np.zeros_like(LAT)
    for (a, b2, c, d2) in deserts:
        sav = np.maximum(sav, box(LON, LAT, a - 6, b2 + 6, c - 5, d2 + 5, soft=7))
    desert = smoothstep(0.38, 0.78, des * 1.1 + (NB - 0.5) * 0.8 + (NM - 0.5) * 0.35)
    savanna = np.clip(sav - desert, 0, 1) * 0.8
    tropical = 1 - smoothstep(10, 22, ALAT)
    boreal = smoothstep(47, 55, LAT) * (1 - smoothstep(64, 70, LAT))
    tundra = smoothstep(63, 71, ALAT)
    green = box(LON, LAT, -75, -10, 58, 85, soft=3) * (1 - box(LON, LAT, -25.5, -12.5, 62.5, 67.5, soft=1))
    ice = np.clip(np.maximum.reduce([green * smoothstep(0.25, 0.4, land), smoothstep(-63, -66, LAT),
                                     smoothstep(77, 80, LAT) * smoothstep(0.3, 0.55, NB + 0.2)]), 0, 1)

    temperate, trop, bor, tun = hexrgb('#78b35e'), hexrgb('#3f9455'), hexrgb('#4c8257'), hexrgb('#a3a88a')
    sand, sav_c, ice_c = hexrgb('#e8cc93'), hexrgb('#b8bd68'), hexrgb('#f3f7fb')
    col = np.ones((H, W, 3), dtype=np.float32) * temperate
    col = lerp(col, trop, tropical)
    col = lerp(col, bor, boreal)
    col = lerp(col, tun, tundra)
    col = lerp(col, sav_c, savanna)
    col = lerp(col, sand, desert)
    col = col * (0.84 + 0.30 * NM)[..., None] * (0.93 + 0.14 * NF)[..., None]
    ridge = smoothstep(0.62, 0.9, NM) * (1 - desert) * 0.18
    col = lerp(col, col * 0.72, ridge)
    col = lerp(col, ice_c, ice)

    deep, mid_c, shallow = hexrgb('#0a2a57'), hexrgb('#11477f'), hexrgb('#2a8fb8')
    ocean = lerp(np.ones((H, W, 3), dtype=np.float32) * deep, mid_c, smoothstep(0.0, 0.5, wide))
    ocean = lerp(ocean, shallow, smoothstep(0.15, 0.85, near) * 0.75)
    ocean = ocean * (0.94 + 0.12 * NB)[..., None]
    seaice = (smoothstep(78, 84, LAT) * smoothstep(0.35, 0.6, NB) + smoothstep(-68, -72, LAT) * smoothstep(0.4, 0.65, NB))
    ocean = lerp(ocean, ice_c * 0.95, np.clip(seaice, 0, 1))

    day = lerp(ocean, col, land)
    save_rgb(day, 'earth_day.jpg', 88)
    Image.fromarray(((1 - land) * 255).astype(np.uint8)).resize((NW, NH), Image.BILINEAR).save(os.path.join(OUT, 'earth_ocean.png'), optimize=True)

    print('night lights…', flush=True)
    regions = [(-10, 30, 36, 60, 1.0), (30, 50, 38, 58, 0.6), (68, 90, 8, 31, 1.0), (104, 122, 22, 40, 1.1),
               (125, 130, 34, 38.5, 1.4), (129, 142, 31, 41, 1.3), (-95, -70, 28, 46, 1.0), (-123, -116, 32, 48, 0.9),
               (-106, -96, 17, 25, 0.7), (-52, -38, -25, -4, 0.7), (2, 9, 4, 13, 0.6), (29, 33, 23, 31.5, 0.9),
               (46, 58, 23, 30, 0.7), (105, 115, -8, -6, 0.9), (98, 110, 8, 22, 0.6), (35, 45, 54, 58, 0.7), (26, 45, 36, 42, 0.7),
               (-80, -73, 38, 44, 0.9), (138, 141, 34, 37, 1.5), (126.6, 127.4, 37.2, 37.8, 2.5), (-58, -45, -36, -22, 0.6)]
    reg = np.zeros_like(LAT) + 0.05
    for (a, b2, c, d2, wgt) in regions:
        reg = np.maximum(reg, box(LON, LAT, a, b2, c, d2, soft=2.5) * wgt)
    coast = smoothstep(0.35, 0.95, near) * (1 - smoothstep(0.97, 1.0, near)) * 1.6 + 0.6
    weight = land * reg * coast * (0.3 + NM) * (1 - desert * 0.85) * (1 - ice) * (1 - smoothstep(60, 68, ALAT))
    weight = np.clip(weight, 0, None).ravel()
    rng = np.random.default_rng(7)
    k = 90000
    idx = rng.choice(weight.size, size=k, p=weight / weight.sum())
    lights = np.zeros(W * H, dtype=np.float32)
    np.add.at(lights, idx, rng.uniform(0.35, 1.0, size=k).astype(np.float32))
    lights = lights.reshape(H, W)
    li = Image.fromarray(np.clip(lights * 255, 0, 255).astype(np.uint8))
    core = np.asarray(li.filter(ImageFilter.GaussianBlur(1.0)), dtype=np.float32) / 255.0
    glow = np.asarray(li.filter(ImageFilter.GaussianBlur(5.0)), dtype=np.float32) / 255.0
    lum = np.clip(core * 2.6 + glow * 3.5, 0, 1)
    night = lum[..., None] * hexrgb('#ffc27a')[None, None, :]
    night = lerp(night, np.ones_like(night) * hexrgb('#fff0d0'), smoothstep(0.6, 1.0, lum) * 0.6)
    save_rgb(night, 'earth_night.jpg', 86)

    print('clouds…', flush=True)
    P = Pn * 1.0
    wx = fbm(P * 1.7 + 3.1, 3, 41)
    wy = fbm(P * 1.7 + 7.7, 3, 43)
    wz = fbm(P * 1.7 + 1.9, 3, 47)
    Q = np.stack([P[0] + wx * 0.42, P[1] + wy * 0.42, P[2] + wz * 0.42])
    c = norm01(fbm(Q * 3.4, 7, 53))
    streak = norm01(fbm(np.stack([Q[0] * 10, Q[1] * 26, Q[2] * 10]), 4, 59))
    alat = np.abs(LATn)
    band = (0.5 + 0.28 * np.exp(-((LATn - 6) / 9.0) ** 2) + 0.22 * np.exp(-((alat - 52) / 11.0) ** 2)
            - 0.22 * np.exp(-((alat - 24) / 7.0) ** 2) - 0.15 * smoothstep(75, 90, alat))
    thick = smoothstep(0.6 - 0.2 * band, 0.9 - 0.12 * band, c)
    thin = smoothstep(0.42 - 0.14 * band, 0.8, c) * 0.38
    cl = np.maximum(thick, thin) * (0.7 + 0.3 * streak)
    cl = np.asarray(Image.fromarray(np.clip(cl * 255, 0, 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.8)), dtype=np.float32) / 255.0
    Image.fromarray(np.clip(cl * 255, 0, 255).astype(np.uint8)).save(os.path.join(OUT, 'earth_clouds.jpg'), quality=88)

    print('moon…', flush=True)
    MW, MH = 1024, 512
    Pm, LONm, LATm = sphere_grid(MW, MH)
    base = norm01(fbm(Pm * 3.0, 6, 61))
    maria = smoothstep(0.55, 0.75, norm01(fbm(Pm * 1.3, 3, 67)))
    height = base * 0.35 - maria * 0.15
    rng = np.random.default_rng(71)
    v = rng.normal(size=(260, 3))
    v /= np.linalg.norm(v, axis=1, keepdims=True)
    radii = np.exp(rng.uniform(np.log(0.012), np.log(0.11), size=260))
    flat = Pm.reshape(3, -1).T
    hflat = height.ravel().copy()
    for i in range(260):
        ang = np.arccos(np.clip(flat @ v[i], -1, 1)) / radii[i]
        bowl = -np.exp(-(ang ** 2) * 2.2) * 0.55 + np.exp(-((ang - 1.0) ** 2) * 18) * 0.3
        hflat += bowl * (radii[i] / 0.11) ** 0.5 * 0.5
    height = hflat.reshape(MH, MW)
    hn = norm01(height)
    albedo = (0.42 + 0.38 * hn - maria * 0.18)[..., None] * hexrgb('#d9d6d0')[None, None, :]
    save_rgb(albedo, 'moon.jpg', 88)
    Image.fromarray((hn * 255).astype(np.uint8)).save(os.path.join(OUT, 'moon_bump.jpg'), quality=90)
    print('done', flush=True)


if __name__ == '__main__':
    main()
