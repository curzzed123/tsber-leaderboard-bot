import numpy as np
from PIL import Image
import os, shutil

PNG_PATH = r'C:\Users\ziyad\Downloads\2c59c371-2fa1-41e0-8533-1d73ae9277df.png'
GIF_PATH = r'C:\Users\ziyad\Downloads\54c00e71c0e4c2f5034b3e1f4a46fe0e.gif'
OUT = r'C:\Users\ziyad\.codely\Default\necklace-animation\assets'

os.makedirs(OUT, exist_ok=True)
shutil.copy2(GIF_PATH, os.path.join(OUT, 'background.gif'))

img = np.array(Image.open(PNG_PATH).convert('RGB'), dtype=np.float32)
H, W, _ = img.shape
brightness = img.mean(axis=2)
print(f"Image: {W}x{H}")

# --- Pass 1: Percentile-based background estimation ---
small_h, small_w = 8, 12
block_h = H // small_h
block_w = W // small_w

small = np.zeros((small_h, small_w, 3), dtype=np.float32)
for sy in range(small_h):
    for sx in range(small_w):
        y0, y1 = sy * block_h, min((sy + 1) * block_h, H)
        x0, x1 = sx * block_w, min((sx + 1) * block_w, W)
        small[sy, sx, :] = np.percentile(img[y0:y1, x0:x1, :], 10, axis=(0, 1))

bg_pil = Image.fromarray(small.clip(0, 255).astype(np.uint8), 'RGB').resize((W, H), Image.BILINEAR)
bg = np.array(bg_pil, dtype=np.float32)
diff = np.sqrt(np.sum((img - bg) ** 2, axis=2))

THRESH = 38
GRAD = 12
alpha = np.full((H, W), 255.0, dtype=np.float32)
alpha[diff < THRESH] = 0
grad_mask = (diff >= THRESH) & (diff < THRESH + GRAD)
alpha[grad_mask] = ((diff[grad_mask] - THRESH) / GRAD) * 255
# Force bright metallic pixels opaque
alpha[brightness > 115] = 255

# --- Pass 2: Refinement - limited flood fill from boundary ---
# For opaque pixels adjacent to transparent ones, check similarity to transparent neighbors
REFINE_TOL = 22
for iteration in range(8):
    transp = alpha < 128
    
    # Find opaque pixels adjacent to transparent
    adj = np.zeros_like(transp)
    adj[1:, :] |= transp[:-1, :]
    adj[:-1, :] |= transp[1:, :]
    adj[:, 1:] |= transp[:, :-1]
    adj[:, :-1] |= transp[:, 1:]
    
    boundary = adj & ~transp
    if not boundary.any():
        print(f"Refinement converged at iteration {iteration}")
        break
    
    # Average color of transparent neighbors (3x3)
    padded_t = np.pad(transp, ((1,1),(1,1)), mode='constant', constant_values=False)
    t_sum = np.zeros_like(img)
    t_count = np.zeros((H, W), dtype=np.float32)
    for dy in range(3):
        for dx in range(3):
            m = padded_t[dy:dy+H, dx:dx+W]
            t_sum += img * m[:, :, None]
            t_count += m
    t_count[t_count == 0] = 1
    t_avg = t_sum / t_count[:, :, None]
    
    pixel_diff = np.sqrt(np.sum((img - t_avg) ** 2, axis=2))
    # Only remove dark pixels (avoid removing necklace)
    new_transp = boundary & (pixel_diff < REFINE_TOL) & (brightness < 110)
    
    if not new_transp.any():
        print(f"Refinement converged at iteration {iteration}")
        break
    
    # Apply with gradient
    new_alpha = np.where(new_transp, np.minimum(alpha, (1.0 - (pixel_diff / REFINE_TOL)) * 255), alpha)
    alpha = new_alpha

alpha_u8 = alpha.clip(0, 255).astype(np.uint8)
transp_pct = (alpha_u8 == 0).sum() / (H * W) * 100
opaque_pct = (alpha_u8 == 255).sum() / (H * W) * 100
semi_pct = ((alpha_u8 > 0) & (alpha_u8 < 255)).sum() / (H * W) * 100
print(f"Transparent: {transp_pct:.1f}%, Opaque: {opaque_pct:.1f}%, Semi: {semi_pct:.1f}%")

# Save RGBA
rgba = np.dstack([img.astype(np.uint8), alpha_u8])
Image.fromarray(rgba, 'RGBA').save(os.path.join(OUT, 'necklace-full.png'))

# Split into 3 parts
third = W // 3
Image.fromarray(rgba[:, :third, :], 'RGBA').save(os.path.join(OUT, 'necklace-left.png'))
Image.fromarray(rgba[:, third:2*third, :], 'RGBA').save(os.path.join(OUT, 'necklace-center.png'))
Image.fromarray(rgba[:, 2*third:, :], 'RGBA').save(os.path.join(OUT, 'necklace-right.png'))

# Verify
verify = Image.open(os.path.join(OUT, 'necklace-full.png'))
print(f"Saved mode: {verify.mode}, size: {verify.size}")
print("Done!")
