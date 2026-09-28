"""
Builds the data that lets the browser synthesise real in-between frames when the camera travels from one
room angle to the next (far -> mid -> desk -> close) — so the move reads as a camera, not a cross-fade.

For each consecutive pair (A, B):
  1. H    homography A -> B for the dominant plane (the back wall). Fitted to thousands of dense RAFT
          correspondences after a rough pre-alignment on the monitor, which is far more stable on these
          AI-rendered images than sparse features.
  2. F01  dense optical flow  (A warped by H) -> B      RAFT, at 801px
     F10  dense optical flow   B -> (A warped by H)
     = the parallax the plane can't explain (chair, desk, monitor…).

At runtime (src/room/gl) both images become GPU grid meshes in B's image frame. A virtual camera moves from
A's framing to B's (interpolating H), while A's vertices slide along t·F01 and B's along (1-t)·F10, nearer
surfaces on top, stretched triangles at occlusion edges handing over to the other image. Every scroll
position is a newly synthesised frame.

Outputs
  public/room/morph/<A>-<B>.f01.png, .f10.png   flow on a 400px grid, 12-bit fixed point packed in RGB
  src/room/morphs.json                          { pairs: [{ from, to, H, Hinv, scale, size, bboxA }] }
                                                H maps normalised A coords (u,v in 0..1) to normalised B coords

  python scripts/build-morphs.py [--preview] [desk-close ...]
      --preview    also writes source/_morph-preview.png
      <from>-<to>  only rebuild these pairs (others are kept from morphs.json)
Requires: opencv-python-headless, numpy, torch, torchvision (RAFT weights download once, ~20 MB).
"""
import json
import sys
from pathlib import Path

import cv2
import numpy as np
import torch
import torch.nn.functional as TF
from torchvision.models.optical_flow import Raft_Large_Weights, raft_large

ROOT = Path(__file__).resolve().parent.parent
ROOM = ROOT / 'public' / 'room'
OUT = ROOM / 'morph'
OUT.mkdir(parents=True, exist_ok=True)
META = ROOT / 'src' / 'room' / 'morphs.json'
PREVIEW = ROOT / 'source' / '_morph-preview.png'

PAIRS = [('far', 'mid'), ('mid', 'desk'), ('desk', 'close')]
# monitor-glass anchors (u, v, height) — must match ANGLES[..].anchor in src/room/angles.ts
ANCHORS = {
    'far': (0.551, 0.514, 0.078),
    'mid': (0.5556, 0.4835, 0.1104),
    'desk': (0.5397, 0.4628, 0.1477),
    'close': (0.5954, 0.4514, 0.2435),
}
# Which correspondences define the plane the virtual camera follows. None = whole frame (the back wall wins);
# a box (in B coords) = the subject, so the monitor/lamp/desk move precisely and the textureless wall takes the parallax.
FIT_REGION = {
    ('far', 'mid'): None,
    ('mid', 'desk'): None,
    ('desk', 'close'): None,
}
WORK_W = 801  # flow is solved at half resolution
GRID_W = 400  # and stored on a 400-wide grid (one mesh vertex per sample)

_raft = None


def load(name):
    img = cv2.imread(str(ROOM / f'{name}.webp'), cv2.IMREAD_COLOR)
    if img is None:
        raise SystemExit(f'missing {name}.webp — run `npm run assets` first')
    return img


def raft_flow(a, b):
    """RAFT (Teed & Deng 2020): robust to the large parallax between room angles."""
    global _raft
    if _raft is None:
        torch.set_grad_enabled(False)
        _raft = raft_large(weights=Raft_Large_Weights.DEFAULT, progress=False).eval()
    h, w = a.shape[:2]
    ph, pw = (8 - h % 8) % 8, (8 - w % 8) % 8

    def tens(img):
        t = torch.from_numpy(cv2.cvtColor(img, cv2.COLOR_BGR2RGB)).permute(2, 0, 1).float()[None] / 127.5 - 1
        return TF.pad(t, (0, pw, 0, ph), mode='replicate')

    flow = _raft(tens(a), tens(b), num_flow_updates=24)[-1][0]
    return flow[:, :h, :w].permute(1, 2, 0).numpy().astype(np.float32)


def anchor_similarity(an, bn, w, h):
    ua, va, ha = ANCHORS[an]
    ub, vb, hb = ANCHORS[bn]
    k = hb / ha
    return np.float64([[k, 0, ub * w - k * ua * w], [0, k, vb * h - k * va * h], [0, 0, 1]])


def dense_homography(A, B, H0, region=None):
    h, w = B.shape[:2]
    Aw = cv2.warpPerspective(A, H0, (w, h), borderMode=cv2.BORDER_REPLICATE)
    valid = cv2.warpPerspective(np.ones(A.shape[:2], np.uint8), H0, (w, h)) > 0
    f = raft_flow(Aw, B)
    ys, xs = np.mgrid[4:h - 4:6, 4:w - 4:6]
    ys, xs = ys.ravel(), xs.ravel()
    keep = valid[ys, xs]
    if region:
        x0, y0, x1, y1 = region
        keep &= (xs >= x0 * w) & (xs <= x1 * w) & (ys >= y0 * h) & (ys <= y1 * h)
    xs, ys = xs[keep], ys[keep]
    q = np.float32(np.stack([xs, ys], 1))
    src = cv2.perspectiveTransform(q[None], np.linalg.inv(H0))[0]
    H, inl = cv2.findHomography(src, q + f[ys, xs], cv2.USAC_MAGSAC, 2.5, maxIters=20000, confidence=0.999)
    return H, int(inl.sum()), len(q)


def pack12(flow_n, scale):
    """normalised flow -> RGB8 holding two 12-bit fixed-point values (x: R + G.hi, y: G.lo + B)"""
    e = np.clip(np.round((flow_n / scale * 0.5 + 0.5) * 4095), 0, 4095).astype(np.uint16)
    x, y = e[..., 0], e[..., 1]
    r = (x >> 4).astype(np.uint8)
    g = (((x & 15) << 4) | (y >> 8)).astype(np.uint8)
    b = (y & 255).astype(np.uint8)
    return np.dstack([b, g, r])  # BGR for cv2.imwrite


# ---- preview helpers (CPU approximation of the GPU mesh warp) ------------------------------------------
def splat(img, flow, t):
    h, w = flow.shape[:2]
    ys, xs = np.mgrid[0:h, 0:w]
    tx, ty = xs + t * flow[..., 0], ys + t * flow[..., 1]
    order = np.argsort(np.linalg.norm(flow, axis=2).ravel())
    out, cov = np.zeros_like(img), np.zeros((h, w), np.float32)
    for dx in (0, 1):
        for dy in (0, 1):
            X = np.clip(np.floor(tx).astype(int) + dx, 0, w - 1).ravel()[order]
            Y = np.clip(np.floor(ty).astype(int) + dy, 0, h - 1).ravel()[order]
            out[Y, X] = img.reshape(-1, 3)[order]
            cov[Y, X] = 1
    return out, cov


def synth(Aw, B, F01, F10, t):
    a, ca = splat(Aw, F01, t)
    b, cb = splat(B, F10, 1 - t)
    k = np.clip((t - 0.2) / 0.6, 0, 1)
    k = k * k * (3 - 2 * k)
    wa, wb = (1 - k) * ca + 1e-4, k * cb + 1e-4
    out = (a.astype(np.float32) * wa[..., None] + b.astype(np.float32) * wb[..., None]) / (wa + wb)[..., None]
    return cv2.inpaint(out.clip(0, 255).astype(np.uint8), ((ca + cb) == 0).astype(np.uint8), 3, cv2.INPAINT_TELEA)


def main():
    preview = '--preview' in sys.argv
    meta = {'pairs': []}
    rows = []
    only = [a for a in sys.argv[1:] if not a.startswith('--')]
    if only:
        old = {(p['from'], p['to']): p for p in json.loads(META.read_text())['pairs']} if META.exists() else {}
    for an, bn in PAIRS:
        if only and f'{an}-{bn}' not in only:
            meta['pairs'].append(old[(an, bn)])
            continue
        A_full, B_full = load(an), load(bn)
        k = WORK_W / B_full.shape[1]
        A = cv2.resize(A_full, None, fx=k, fy=k, interpolation=cv2.INTER_AREA)
        B = cv2.resize(B_full, None, fx=k, fy=k, interpolation=cv2.INTER_AREA)
        h, w = B.shape[:2]

        Hm, inl, tot = dense_homography(A, B, anchor_similarity(an, bn, w, h), FIT_REGION[(an, bn)])
        Aw = cv2.warpPerspective(A, Hm, (w, h), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)
        F01 = raft_flow(Aw, B)
        F10 = raft_flow(B, Aw)

        gw, gh = GRID_W, round(GRID_W * h / w)
        n01 = cv2.resize(F01, (gw, gh), interpolation=cv2.INTER_AREA) / np.float32([w, h])
        n10 = cv2.resize(F10, (gw, gh), interpolation=cv2.INTER_AREA) / np.float32([w, h])
        scale = float(max(np.abs(n01).max(), np.abs(n10).max()) * 1.01)
        cv2.imwrite(str(OUT / f'{an}-{bn}.f01.png'), pack12(n01, scale), [cv2.IMWRITE_PNG_COMPRESSION, 9])
        cv2.imwrite(str(OUT / f'{an}-{bn}.f10.png'), pack12(n10, scale), [cv2.IMWRITE_PNG_COMPRESSION, 9])

        N = np.diag([1 / w, 1 / h, 1.0])
        Hn = N @ Hm @ np.linalg.inv(N)
        Hn /= Hn[2, 2]
        Hi = np.linalg.inv(Hn)
        Hi /= Hi[2, 2]
        corners = cv2.perspectiveTransform(np.float64([[[0, 0], [1, 0], [1, 1], [0, 1]]]), Hn)[0]
        meta['pairs'].append({
            'from': an,
            'to': bn,
            'H': [round(float(x), 10) for x in Hn.ravel()],
            'Hinv': [round(float(x), 10) for x in Hi.ravel()],
            'scale': round(scale, 7),
            'size': [gw, gh],
            'bboxA': [round(float(v), 4) for v in (*corners.min(0), *corners.max(0))],
        })
        print(f'{an}->{bn}: plane {inl}/{tot} inliers · flow max {scale * w:.0f}px @{w}w · grid {gw}x{gh}')

        if preview:
            frames = [Aw] + [synth(Aw, B, F01, F10, t) for t in (0.25, 0.5, 0.75)] + [B]
            rows.append(np.hstack([cv2.resize(f, (400, 267)) for f in frames]))

    META.write_text(json.dumps(meta, indent=1))
    print('->', META)
    if preview:
        cv2.imwrite(str(PREVIEW), np.vstack(rows))
        print('preview ->', PREVIEW)


if __name__ == '__main__':
    main()
