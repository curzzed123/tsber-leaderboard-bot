from PIL import Image
import os, shutil

PNG_PATH = r'C:\Users\ziyad\Downloads\2c59c371-2fa1-41e0-8533-1d73ae9277df.png'
GIF_PATH = r'C:\Users\ziyad\Downloads\54c00e71c0e4c2f5034b3e1f4a46fe0e.gif'
OUT = r'C:\Users\ziyad\.codely\Default\necklace-animation\assets'

os.makedirs(OUT, exist_ok=True)
shutil.copy2(GIF_PATH, os.path.join(OUT, 'background.gif'))

img = Image.open(PNG_PATH).convert('RGB')
W, H = img.size
print(f"Image: {W}x{H}")

# Split into 3 equal parts - keep original pixels, no background removal
# mix-blend-mode: screen in CSS will make dark backgrounds invisible
third = W // 3

img.crop((0, 0, third, H)).save(os.path.join(OUT, 'necklace-left.png'))
img.crop((third, 0, third * 2, H)).save(os.path.join(OUT, 'necklace-center.png'))
img.crop((third * 2, 0, W, H)).save(os.path.join(OUT, 'necklace-right.png'))
img.save(os.path.join(OUT, 'necklace-full.png'))

print("Done! Split original image into 3 parts (no bg removal - screen blend will handle it).")
