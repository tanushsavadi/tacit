const hex = h => ({ r: parseInt(h.slice(0,2),16)/255, g: parseInt(h.slice(2,4),16)/255, b: parseInt(h.slice(4,6),16)/255 });
await Promise.all(['Regular','Medium','Semi Bold','Bold'].map(s => figma.loadFontAsync({ family: 'Inter', style: s })));
const HASH = { 'a_lockup.png': '42b518409e30523bfe009dcffb45fc745b2dfafb', 'a_review.png': 'ec26f1eb884ce4ad6cdf8917a71109660674657c', 'a_speaking.png': 'fe1365e6c41af6ccde2a163ba1ec3c4321334194' };
const out = [];
for (const S of DECK) {
  if (S.row > 0) { const g = figma.currentPage.children.find(c => c.type === 'SLIDE_GRID'); while (g.children.length <= S.row) figma.createSlideRow(g.children.length); }
  const slide = figma.createSlide(S.row, S.col);
  slide.name = S.name;
  slide.fills = [{ type: 'SOLID', color: hex(S.bg) }];
  const imgs = [];
  for (const e0 of S.els) {
    const e = Object.assign({ c: 'EEF3F1', f: 'Regular', lh: 1.3, ls: 0, al: 'LEFT', sw: 1, r: 0, op: 1, s: 28 }, e0);
    let n;
    if (e.t === 'rect' || e.t === 'img') {
      n = figma.createRectangle(); slide.appendChild(n); n.resize(e.w, e.h);
      if (e.t === 'img') { n.name = 'img:' + e.src; n.fills = [{ type: 'SOLID', color: hex('1A1F1D') }]; if (HASH[e.src]) n.fills = [{ type: 'IMAGE', imageHash: HASH[e.src], scaleMode: 'FILL' }]; else imgs.push([n.id, e.src]); }
      else {
        n.name = e.name || 'shape';
        n.fills = e.fill ? [{ type: 'SOLID', color: hex(e.fill), opacity: e.op ?? 1 }] : [];
        if (e.stroke) { n.strokes = [{ type: 'SOLID', color: hex(e.stroke) }]; n.strokeWeight = e.sw; n.strokeAlign = 'INSIDE'; if (e.dash) n.dashPattern = [10, 8]; }
      }
      if (e.r) n.cornerRadius = e.r;
    } else if (e.t === 'ell') {
      n = figma.createEllipse(); slide.appendChild(n); n.resize(e.w, e.h); n.name = 'dot';
      n.fills = e.fill ? [{ type: 'SOLID', color: hex(e.fill) }] : [];
      if (e.stroke) { n.strokes = [{ type: 'SOLID', color: hex(e.stroke) }]; n.strokeWeight = e.sw; n.strokeAlign = 'INSIDE'; }
    } else {
      n = figma.createText(); slide.appendChild(n);
      n.fontName = { family: 'Inter', style: e.f }; n.fontSize = e.s; n.characters = e.txt;
      n.fills = [{ type: 'SOLID', color: hex(e.c) }];
      n.lineHeight = { unit: 'PERCENT', value: e.lh * 100 };
      if (e.ls) n.letterSpacing = { unit: 'PERCENT', value: e.ls };
      n.textAlignHorizontal = e.al;
      n.resize(e.w, 10); n.textAutoResize = 'HEIGHT';
      if (e.spans) { let i = 0; for (const [t, c] of e.spans) { if (c) n.setRangeFills(i, i + t.length, [{ type: 'SOLID', color: hex(c) }]); i += t.length; } }
      if (e.strike) n.textDecoration = 'STRIKETHROUGH';
      n.name = e.name || e.txt.replace(/\n/g, ' ').slice(0, 48);
    }
    n.x = e.x; n.y = e.y;
  }
  slide.speakerNotes = S.notes;
  out.push({ id: slide.id, name: S.name, imgs });
}
const g = figma.currentPage.children.find(c => c.type === 'SLIDE_GRID');
if (g) { g.children[0].name = 'Pitch'; if (g.children[1]) g.children[1].name = 'Appendix'; }
return out;
