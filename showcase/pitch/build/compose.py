import json, sys
d = json.load(open('deck.json'))
idx = [int(i) for i in sys.argv[1].split(',')]
batch = []
pc = ac = 0
for i, s in enumerate(d):
    row = 0 if s['section'] == 'Pitch' else 1
    col = i if row == 0 else i - 7
    s = dict(s, row=row, col=col); s.pop('section')
    defaults = dict(c='EEF3F1', f='Regular', lh=1.3, ls=0, al='LEFT', sw=1, r=0, op=1, s=28, stroke=None, fill=None)
    s['els'] = [{k: v for k, v in e.items() if not (k in defaults and defaults[k] == v and not (k == 'sw' and e.get('stroke')))} for e in s['els']]
    for e in s['els']:
        if e.get('t') in ('rect',) and 'fill' not in e: e['fill'] = None
    if i in idx: batch.append(s)
code = 'const DECK = ' + json.dumps(batch, ensure_ascii=False, separators=(',', ':')) + ';\n' + open('renderer.js').read()
open(f'batch_{sys.argv[2]}.js', 'w').write(code); print(len(code))
