import re,sys
txt=open(sys.argv[1]).read()
secs=re.split(r'\n### ',txt)
tot=0
for s in secs[1:]:
    head=s.split('\n')[0]
    q=[l[1:].strip() for l in s.split('\n') if l.startswith('>')]
    q=' '.join(q); q=re.sub(r'\*\([^)]*\)\*|\*[^*]*\*|\[[A-Z ]+\]','',q)
    n=len(re.findall(r"[A-Za-z0-9'’%-]+",q)); tot+=n
    print(f"{head[:60]:60} {n:4} words  {n/2.5:5.1f}s")
print('total',tot,'words',round(tot/2.5),'s speaking')
