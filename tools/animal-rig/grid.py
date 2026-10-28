import sys
from PIL import Image, ImageDraw
x0,y0,x1,y1=map(int,sys.argv[2:6]); out=sys.argv[6]
im=Image.open(sys.argv[1]).convert('RGB').crop((x0,y0,x1,y1)); d=ImageDraw.Draw(im)
for v in range(0,1300,50):
    c=(230,0,0) if v%100==0 else (255,170,170)
    if x0<=v<x1: d.line([(v-x0,0),(v-x0,y1-y0)],fill=c); v%100==0 and d.text((v-x0+2,2),str(v),fill=(0,0,200))
    if y0<=v<y1: d.line([(0,v-y0),(x1-x0,v-y0)],fill=c); v%100==0 and d.text((2,v-y0+2),str(v),fill=(0,0,200))
im.save(out)
