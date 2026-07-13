import base64, os

with open(r'C:\Users\ziyad\.codely\Default\necklace-animation\assets\necklace-full.png', 'rb') as f:
    necklace_b64 = base64.b64encode(f.read()).decode()

with open(r'C:\Users\ziyad\.codely\Default\necklace-animation\assets\background.gif', 'rb') as f:
    gif_b64 = base64.b64encode(f.read()).decode()

with open(r'C:\Users\ziyad\.codely\Default\necklace-animation\index.html', 'r') as f:
    html = f.read()

html = html.replace('src="assets/necklace-full.png"', f'src="data:image/png;base64,{necklace_b64}"')
html = html.replace('src="assets/background.gif"', f'src="data:image/gif;base64,{gif_b64}"')

out = r'C:\Users\ziyad\Downloads\necklace.html'
with open(out, 'w') as f:
    f.write(html)

print(f'Saved: {out} ({os.path.getsize(out)/1024/1024:.1f} MB)')
