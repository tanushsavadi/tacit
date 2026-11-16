"""Build TACIT_HackUMass_Judging_Pitch.pptx from build/deck.json (same spec as the Figma deck).

Native, editable shapes and text boxes; real product images; speaker notes.
Run with the scratchpad venv (python-pptx, Pillow).
"""
import json, pathlib, re
from PIL import Image, ImageFont
from pptx import Presentation
from pptx.util import Emu, Pt
from pptx.dml.color import RGBColor
from pptx.enum.shapes import MSO_SHAPE
from pptx.enum.text import PP_ALIGN, MSO_ANCHOR, MSO_AUTO_SIZE
from pptx.enum.dml import MSO_LINE_DASH_STYLE
from pptx.oxml.ns import qn

ROOT = pathlib.Path(__file__).resolve().parent.parent
ASSETS = ROOT / "assets"
FONTS = ROOT / "fonts/extras/ttf"
PX = 6350  # EMU per slide pixel (1920 px = 13.333 in)
deck = json.loads((ROOT / "build/deck.json").read_text())

FACE = {"Regular": ("Inter", False), "Medium": ("Inter Medium", False), "Semi Bold": ("Inter SemiBold", False), "Bold": ("Inter", True)}
TTF = {"Regular": "Inter-Regular.ttf", "Medium": "Inter-Medium.ttf", "Semi Bold": "Inter-SemiBold.ttf", "Bold": "Inter-Bold.ttf"}
_font_cache = {}


def rgb(h):
    return RGBColor.from_string(h.upper())


def text_height(e):
    """Measure wrapped height with the real Inter metrics (same wrapping Figma does, approximately)."""
    key = (e["f"], e["s"])
    if key not in _font_cache:
        _font_cache[key] = ImageFont.truetype(str(FONTS / TTF[e["f"]]), e["s"])
    font = _font_cache[key]
    lines = 0
    for para in e["txt"].split("\n"):
        words, cur = para.split(" "), ""
        n = 1
        for w in words:
            trial = (cur + " " + w).strip()
            if font.getlength(trial) * (1 + e.get("ls", 0) / 100) > e["w"] and cur:
                n += 1
                cur = w
            else:
                cur = trial
        lines += n
    return int(lines * e["s"] * e["lh"]) + 4


def px(v):
    return Emu(int(round(v * PX)))


prs = Presentation()
prs.slide_width, prs.slide_height = px(1920), px(1080)
blank = prs.slide_layouts[6]

DEF = dict(c="EEF3F1", f="Regular", lh=1.3, ls=0, al="LEFT", sw=1, r=0, op=1, s=28)

for S in deck:
    slide = prs.slides.add_slide(blank)
    bg = slide.background.fill
    bg.solid()
    bg.fore_color.rgb = rgb(S["bg"])
    for e0 in S["els"]:
        e = {**DEF, **{k: v for k, v in e0.items() if v is not None or k == "fill"}}
        t = e["t"]
        if t in ("rect", "ell"):
            kind = MSO_SHAPE.OVAL if t == "ell" else (MSO_SHAPE.ROUNDED_RECTANGLE if e.get("r") else MSO_SHAPE.RECTANGLE)
            sh = slide.shapes.add_shape(kind, px(e["x"]), px(e["y"]), px(e["w"]), px(e["h"]))
            sh.shadow.inherit = False
            if kind == MSO_SHAPE.ROUNDED_RECTANGLE:
                sh.adjustments[0] = min(0.5, e["r"] / min(e["w"], e["h"]))
            if e.get("fill"):
                sh.fill.solid()
                sh.fill.fore_color.rgb = rgb(e["fill"])
                if e.get("op", 1) < 1:
                    # alpha on the solid fill
                    srgb = sh.fill._xPr.find(qn("a:solidFill")).find(qn("a:srgbClr"))
                    a = srgb.makeelement(qn("a:alpha"), {"val": str(int(e["op"] * 100000))})
                    srgb.append(a)
            else:
                sh.fill.background()
            if e.get("stroke"):
                sh.line.color.rgb = rgb(e["stroke"])
                sh.line.width = Emu(int(e["sw"] * PX))
                if e.get("dash"):
                    sh.line.dash_style = MSO_LINE_DASH_STYLE.DASH
            else:
                sh.line.fill.background()
            sh.text_frame.text = ""
        elif t == "img":
            src = ASSETS / e["src"]
            iw, ih = Image.open(src).size
            pic = slide.shapes.add_picture(str(src), px(e["x"]), px(e["y"]), px(e["w"]), px(e["h"]))
            box, img = e["w"] / e["h"], iw / ih
            if img > box + 1e-3:  # crop sides
                c = (1 - box / img) / 2
                pic.crop_left = pic.crop_right = c
            elif img < box - 1e-3:  # crop top/bottom
                c = (1 - img / box) / 2
                pic.crop_top = pic.crop_bottom = c
            if e.get("r"):
                pic.auto_shape_type = MSO_SHAPE.ROUNDED_RECTANGLE
                geom = pic._element.spPr.find(qn("a:prstGeom"))
                av = geom.find(qn("a:avLst"))
                if av is None:
                    av = geom.makeelement(qn("a:avLst"), {}); geom.append(av)
                gd = av.makeelement(qn("a:gd"), {"name": "adj", "fmla": "val %d" % int(min(0.5, e["r"] / min(e["w"], e["h"])) * 100000)})
                av.append(gd)
            pic.name = "img " + e["src"]
        else:  # text
            h = text_height(e)
            tb = slide.shapes.add_textbox(px(e["x"]), px(e["y"]), px(e["w"]), px(h))
            tf = tb.text_frame
            tf.word_wrap = True
            tf.auto_size = MSO_AUTO_SIZE.NONE
            tf.margin_left = tf.margin_right = tf.margin_top = tf.margin_bottom = 0
            tf.vertical_anchor = MSO_ANCHOR.TOP
            spans = e.get("spans") or [[e["txt"], None, None]]
            # split spans into paragraphs on \n
            paras = [[]]
            for txt, col, _ in spans:
                parts = txt.split("\n")
                for i, part in enumerate(parts):
                    if i > 0:
                        paras.append([])
                    if part:
                        paras[-1].append((part, col or e["c"]))
            face, bold = FACE[e["f"]]
            for pi, runs in enumerate(paras):
                p = tf.paragraphs[0] if pi == 0 else tf.add_paragraph()
                p.alignment = {"LEFT": PP_ALIGN.LEFT, "CENTER": PP_ALIGN.CENTER, "RIGHT": PP_ALIGN.RIGHT}[e["al"]]
                p.line_spacing = Pt(e["s"] * e["lh"] * 0.5)
                if not runs:
                    runs = [("", e["c"])]
                for txt, col in runs:
                    r = p.add_run()
                    r.text = txt
                    f = r.font
                    f.name = face
                    f.size = Pt(e["s"] * 0.5)
                    f.bold = bold
                    f.color.rgb = rgb(col)
                    rPr = r._r.get_or_add_rPr()
                    if e.get("ls"):
                        rPr.set("spc", str(int(e["ls"] / 100 * e["s"] * 0.5 * 100)))
                    if e.get("strike"):
                        rPr.set("strike", "sngStrike")
            tb.name = e.get("name") or re.sub(r"\s+", " ", e["txt"])[:40]
    notes = re.sub(r"\*\*(.+?)\*\*", r"\1", S["notes"])
    notes = re.sub(r"(?<!\w)\*(.+?)\*(?!\w)", r"\1", notes)
    slide.notes_slide.notes_text_frame.text = notes

out = ROOT / "TACIT_HackUMass_Judging_Pitch.pptx"
prs.save(out)
print("wrote", out, out.stat().st_size, "bytes,", len(prs.slides), "slides")
