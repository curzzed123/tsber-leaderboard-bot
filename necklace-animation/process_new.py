import numpy as np
from PIL import Image
import os, shutil

PNG_PATH = r'C:\Users\ziyad\Downloads\f8ae60d5-f0fd-4743-91ef-8613789a12f2.png'
GIF_PATH = r'C:\Users\ziyad\Downloads\54c00e71c0e4c2f5034b3e1f4a46fe0e.gif'
OUT = r'C:\Users\ziyad\.codely\Default\necklace-animation\assets'

os.makedirs(OUT, exist_ok=True)
shutil.copy2(GIF_PATH, os.path.join(OUT, 'background.gif'))

img = Image.open(PNG_PATH)
W, H = img.size
print(f"Image: {W}x{H}, mode={img.mode}")

# Convert to RGBA, then get RGB array
rgba = np.array(img.convert('RGBA'), dtype=np.float32)
rgb = rgba[:, :, :3]
alpha_in = rgba[:, :, 3]
brightness = rgb.mean(axis=2)

# Check if alpha channel already has transparency
existing_transp = (alpha_in < 128).sum()
print(f"Existing transparent pixels: {existing_transp} ({existing_transp/(W*H)*100:.1f}%)")

# Remove white background: white = high brightness on all channels
# The necklace is metallic silver/chrome on black - never pure white
THRESH = 235
GRAD = 15

alpha = np.full((H, W), 255.0, dtype=np.float32)

# Pure white -> transparent
alpha[brightness > THRESH] = 0

# Gradient zone for anti-aliasing
grad_mask = (brightness >= THRESH - GRAD) & (brightness < THRESH)
alpha[grad_mask] = ((THRESH - brightness[grad_mask]) / GRAD * 255).clip(0, 255)

# Also respect existing alpha if present
alpha = np.minimum(alpha, alpha_in)

alpha_u8 = alpha.astype(np.uint8)
transp_pct = (alpha_u8 == 0).sum() / (H * W) * 100
opaque_pct = (alpha_u8 == 255).sum() / (H * W) * 100
print(f"Transparent: {transp_pct:.1f}%, Opaque: {opaque_pct:.1f}%")

# Build RGBA
result = np.dstack([rgb.astype(np.uint8), alpha_u8])
Image.fromarray(result, 'RGBA').save(os.path.join(OUT, 'necklace-full.png'))

# Split into 3 parts
third = W // 3
Image.fromarray(result[:, :third, :], 'RGBA').save(os.path.join(OUT, 'necklace-left.png'))
Image.fromarray(result[:, third:2*third, :], 'RGBA').save(os.path.join(OUT, 'necklace-center.png'))
Image.fromarray(result[:, 2*third:, :], 'RGBA').save(os.path.join(OUT, 'necklace-right.png'))

print("Done!")
