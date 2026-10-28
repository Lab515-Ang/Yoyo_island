import sys, cv2
im=cv2.imread(sys.argv[1]); x0,y0,x1,y1,s=map(float,sys.argv[2:7]); x0,y0,x1,y1=map(int,(x0,y0,x1,y1))
c=im[y0:y1,x0:x1].copy()
for v in range(0,1300,25):
    col=(0,0,230) if v%100==0 else ((150,150,255) if v%50==0 else (215,215,255))
    if x0<=v<x1: cv2.line(c,(v-x0,0),(v-x0,y1-y0),col,1)
    if y0<=v<y1: cv2.line(c,(0,v-y0),(x1-x0,v-y0),col,1)
c=cv2.resize(c,None,fx=s,fy=s,interpolation=cv2.INTER_CUBIC)
for v in range(0,1300,100):
    if x0<=v<x1: cv2.putText(c,str(v),(int((v-x0)*s)+3,14),0,0.45,(200,0,0),1)
    if y0<=v<y1: cv2.putText(c,str(v),(3,int((v-y0)*s)+14),0,0.45,(200,0,0),1)
cv2.imwrite(sys.argv[7],c)
