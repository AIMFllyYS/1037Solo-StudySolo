import sys, glob
from PIL import Image
fs=sys.argv[2:]; out=sys.argv[1]
cols=2 if len(fs)<=4 else 3
ims=[Image.open(f).convert('RGB').resize((960,540)) for f in fs]
rows=(len(ims)+cols-1)//cols
s=Image.new('RGB',(960*cols,540*rows))
for i,im in enumerate(ims): s.paste(im,((i%cols)*960,(i//cols)*540))
s.save(out)
