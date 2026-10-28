#!/usr/bin/env python3
"""
Builds report/deliverables/BinGenie_Sem_Report.docx

The complete current-semester report:

  * every number traceable to the master value ledger
  * measured results separated from design targets
  * no fabricated model metrics
  * A4, Times New Roman 11/1.5, justificado, captions above tables / below figures
"""
import os
from docx import Document
from docx.shared import Pt, Cm, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_BREAK, WD_TAB_ALIGNMENT
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.enum.section import WD_SECTION
from docx.oxml.ns import qn
from docx.oxml import OxmlElement

NAVY = RGBColor(0x1F, 0x38, 0x64)
GREY = RGBColor(0x40, 0x40, 0x40)
RED = RGBColor(0xA6, 0x1B, 0x1B)
BODY = "Times New Roman"
TBL = "Calibri"

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FIGDIR = os.path.join(BASE, "assets", "figures")
OUTDIR = os.path.join(BASE, "deliverables")

doc = Document()

# ---------------------------------------------------------------- page setup
sec = doc.sections[0]
sec.page_height, sec.page_width = Cm(29.7), Cm(21.0)
sec.top_margin = Cm(2.54)
sec.bottom_margin = Cm(2.54)
sec.left_margin = Cm(3.18)
sec.right_margin = Cm(2.54)
USABLE = 21.0 - 3.18 - 2.54  # 15.28 cm

st = doc.styles["Normal"]
st.font.name = BODY
st.font.size = Pt(11)
st.element.rPr.rFonts.set(qn("w:eastAsia"), BODY)
st.paragraph_format.line_spacing = 1.5
st.paragraph_format.space_after = Pt(6)
st.paragraph_format.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY

# ---------------------------------------------------------------- heading & caption styles
def _style(name, size, bold=True, color=None, align=None, before=0, after=6, spacing=1.2):
    stl = doc.styles[name]
    stl.font.name = BODY
    stl.font.size = Pt(size)
    stl.font.bold = bold
    if color is not None:
        stl.font.color.rgb = color
    stl.element.rPr.rFonts.set(qn("w:eastAsia"), BODY)
    pf = stl.paragraph_format
    pf.space_before = Pt(before)
    pf.space_after = Pt(after)
    pf.line_spacing = spacing
    if align is not None:
        pf.alignment = align
    pf.keep_with_next = True
    return stl


_style("Heading 1", 13, True, NAVY, WD_ALIGN_PARAGRAPH.CENTER, 0, 12, 1.15)
_style("Heading 2", 11.5, True, NAVY, WD_ALIGN_PARAGRAPH.LEFT, 12, 4, 1.3)

cap = doc.styles["Caption"]
cap.font.name = TBL
cap.font.size = Pt(9)
cap.font.bold = False
cap.font.italic = False
cap.paragraph_format.alignment = WD_ALIGN_PARAGRAPH.CENTER
cap.paragraph_format.space_before = Pt(2)
cap.paragraph_format.space_after = Pt(10)
cap.paragraph_format.line_spacing = 1.15

# ---------------------------------------------------------------- counters
FIGURES = []
TABLES = []
NUM = [0]


def _field(paragraph, instr, placeholder="1"):
    """Insert a Word field into a paragraph."""
    r1 = paragraph.add_run()
    fc1 = OxmlElement("w:fldChar")
    fc1.set(qn("w:fldCharType"), "begin")
    r1._r.append(fc1)

    r2 = paragraph.add_run()
    it = OxmlElement("w:instrText")
    it.set(qn("xml:space"), "preserve")
    it.text = f" {instr} "
    r2._r.append(it)

    r3 = paragraph.add_run()
    fc3 = OxmlElement("w:fldChar")
    fc3.set(qn("w:fldCharType"), "separate")
    r3._r.append(fc3)

    r4 = paragraph.add_run(placeholder)

    r5 = paragraph.add_run()
    fc5 = OxmlElement("w:fldChar")
    fc5.set(qn("w:fldCharType"), "end")
    r5._r.append(fc5)
    return r4


def shade(cell, hexcolor):
    tcPr = cell._tc.get_or_add_tcPr()
    el = OxmlElement("w:shd")
    el.set(qn("w:val"), "clear")
    el.set(qn("w:color"), "auto")
    el.set(qn("w:fill"), hexcolor)
    tcPr.append(el)


def cell_margins(table, top=40, bottom=40, left=80, right=80):
    mar = OxmlElement("w:tblCellMar")
    for tag, val in (("top", top), ("left", left), ("bottom", bottom), ("right", right)):
        e = OxmlElement(f"w:{tag}")
        e.set(qn("w:w"), str(val))
        e.set(qn("w:type"), "dxa")
        mar.append(e)
    table._tbl.tblPr.append(mar)


def fixed_layout(table, total_cm):
    tblPr = table._tbl.tblPr
    for tag in ("w:tblLayout", "w:tblW"):
        for e in tblPr.findall(qn(tag)):
            tblPr.remove(e)
    lay = OxmlElement("w:tblLayout")
    lay.set(qn("w:type"), "fixed")
    tblPr.append(lay)
    w = OxmlElement("w:tblW")
    w.set(qn("w:type"), "dxa")
    w.set(qn("w:w"), str(int(total_cm * 567)))
    tblPr.append(w)


def row_flags(row, header=False):
    trPr = row._tr.get_or_add_trPr()
    e = OxmlElement("w:cantSplit")
    e.set(qn("w:val"), "true")
    trPr.append(e)
    if header:
        h = OxmlElement("w:tblHeader")
        h.set(qn("w:val"), "true")
        trPr.append(h)


def rich(p, text, size, mono=False, base_bold=False, color=None, italic=False):
    """Render **bold** inline spans."""
    for i, chunk in enumerate(text.split("**")):
        if not chunk:
            continue
        r = p.add_run(chunk)
        r.bold = base_bold or (i % 2 == 1)
        r.italic = italic
        r.font.size = Pt(size)
        if color is not None:
            r.font.color.rgb = color
    return p


# ---------------------------------------------------------------- headings
def chapter(num, title, pagebreak=True):
    if pagebreak:
        doc.add_paragraph().add_run().add_break(WD_BREAK.PAGE)
    p = doc.add_paragraph(style="Heading 1")
    r = p.add_run(f"CHAPTER {num}")
    r.font.size = Pt(11)
    r.font.color.rgb = GREY
    r.add_break()
    r2 = p.add_run(title.upper())
    r2.font.size = Pt(13)
    r2.font.color.rgb = NAVY
    return p


def h2(text):
    NUM[0] = 0
    p = doc.add_paragraph(style="Heading 2")
    r = p.add_run(text)
    return p


def h3(text):
    p = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(9)
    p.paragraph_format.space_after = Pt(3)
    p.paragraph_format.line_spacing = 1.3
    p.paragraph_format.keep_with_next = True
    p.alignment = WD_ALIGN_PARAGRAPH.LEFT
    r = p.add_run(text)
    r.bold = True
    r.font.size = Pt(10.5)
    return p


def para(text, size=11, space_after=8, spacing=1.5, align="just", indent=0.0):
    p = doc.add_paragraph()
    p.paragraph_format.space_after = Pt(space_after)
    p.paragraph_format.line_spacing = spacing
    p.paragraph_format.left_indent = Cm(indent)
    p.alignment = {"just": WD_ALIGN_PARAGRAPH.JUSTIFY,
                   "left": WD_ALIGN_PARAGRAPH.LEFT,
                   "center": WD_ALIGN_PARAGRAPH.CENTER}[align]
    rich(p, text, size)
    return p


def bullet(text, size=10.5, numbered=False):
    if numbered:
        NUM[0] += 1
        p = doc.add_paragraph()
        p.paragraph_format.space_after = Pt(3)
        p.paragraph_format.line_spacing = 1.35
        p.paragraph_format.left_indent = Cm(1.0)
        p.paragraph_format.first_line_indent = Cm(-0.7)
        p.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY
        r = p.add_run(f"{NUM[0]}.   ")
        r.font.size = Pt(size)
        rich(p, text, size)
        return p
    p = doc.add_paragraph(style="List Bullet")
    p.paragraph_format.space_after = Pt(3)
    p.paragraph_format.line_spacing = 1.35
    p.paragraph_format.left_indent = Cm(0.95)
    p.paragraph_format.first_line_indent = Cm(-0.5)
    p.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY
    rich(p, text, size)
    return p


def equation(text, size=10.5):
    p = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(6)
    p.paragraph_format.space_after = Pt(8)
    p.paragraph_format.line_spacing = 1.2
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r = p.add_run(text)
    r.font.size = Pt(size)
    r.font.name = BODY
    r.italic = False
    return p


def figure(fname, caption_text, width=14.4):
    p = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(8)
    p.paragraph_format.space_after = Pt(2)
    p.paragraph_format.line_spacing = 1.0
    p.paragraph_format.keep_with_next = True
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p.add_run().add_picture(os.path.join(FIGDIR, fname), width=Cm(width))

    n = len(FIGURES) + 1
    FIGURES.append((f"Fig. {n}.", caption_text))
    c = doc.add_paragraph(style="Caption")
    r = c.add_run("Fig. ")
    r.bold = True
    r.font.size = Pt(9)
    r.font.name = TBL
    num = _field(c, "SEQ Figure \\* ARABIC", str(n))
    num.bold = True
    num.font.size = Pt(9)
    num.font.name = TBL
    r = c.add_run(". ")
    r.bold = True
    r.font.size = Pt(9)
    r.font.name = TBL
    r = c.add_run(caption_text)
    r.font.size = Pt(9)
    r.font.name = TBL
    return n


def table_caption(caption_text):
    n = len(TABLES) + 1
    TABLES.append((f"Table {n}", caption_text))
    p = doc.add_paragraph(style="Caption")
    p.paragraph_format.alignment = WD_ALIGN_PARAGRAPH.LEFT
    p.paragraph_format.space_before = Pt(10)
    p.paragraph_format.space_after = Pt(3)
    r = p.add_run("Table ")
    r.bold = True
    r.font.size = Pt(9)
    r.font.name = TBL
    num = _field(p, "SEQ Table \\* ARABIC", str(n))
    num.bold = True
    num.font.size = Pt(9)
    num.font.name = TBL
    r = p.add_run(". ")
    r.bold = True
    r.font.size = Pt(9)
    r.font.name = TBL
    r = p.add_run(caption_text)
    r.font.size = Pt(9)
    r.font.name = TBL
    return n


def table(headers, rows, widths, size=8.5, zebra=True, tag_col=None):
    scale = USABLE / sum(widths)
    widths = [w * scale for w in widths]
    t = doc.add_table(rows=1, cols=len(headers))
    t.style = "Table Grid"
    t.alignment = WD_TABLE_ALIGNMENT.CENTER
    t.autofit = False
    cell_margins(t)
    hdr = t.rows[0]
    row_flags(hdr, header=True)
    for j, htxt in enumerate(headers):
        c = hdr.cells[j]
        c.width = Cm(widths[j])
        p = c.paragraphs[0]
        p.alignment = WD_ALIGN_PARAGRAPH.LEFT
        p.paragraph_format.space_after = Pt(0)
        p.paragraph_format.line_spacing = 1.0
        r = p.add_run(htxt)
        r.bold = True
        r.font.size = Pt(size)
        r.font.name = TBL
        r.font.color.rgb = RGBColor(0xFF, 0xFF, 0xFF)
        shade(c, "1F3864")
    for i, row in enumerate(rows):
        cells = t.add_row().cells
        row_flags(t.rows[-1])
        for j, val in enumerate(row):
            c = cells[j]
            c.width = Cm(widths[j])
            p = c.paragraphs[0]
            p.alignment = WD_ALIGN_PARAGRAPH.LEFT
            p.paragraph_format.space_after = Pt(0)
            p.paragraph_format.line_spacing = 1.05
            txt = str(val)
            bold = False
            color = None
            if txt.startswith("!!"):
                txt = txt[2:]
                bold = True
                color = RED
            rich(p, txt, size, base_bold=bold, color=color)
            for r in p.runs:
                r.font.name = TBL
        if zebra and i % 2 == 1:
            for j in range(len(row)):
                shade(cells[j], "EEF1F7")
        if tag_col is not None:
            sv = str(row[tag_col]).replace("!!", "")
            fill = None
            if sv.startswith("Measured"):
                fill = "D9EAD3"
            elif sv.startswith("Derived"):
                fill = "DEEAF6"
            elif sv.startswith("Target"):
                fill = "FFF0CC"
            elif sv.startswith("Pending"):
                fill = "F8D7DA"
            if fill:
                shade(cells[tag_col], fill)
    fixed_layout(t, USABLE)
    for j, gc in enumerate(t._tbl.tblGrid.findall(qn("w:gridCol"))):
        gc.set(qn("w:w"), str(int(widths[j] * 567)))
    for row in t.rows:
        for j, c in enumerate(row.cells):
            c.width = Cm(widths[j])
    sp = doc.add_paragraph()
    sp.paragraph_format.space_after = Pt(2)
    sp.paragraph_format.line_spacing = 1.0
    return t


def source_note(text):
    p = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(2)
    p.paragraph_format.space_after = Pt(10)
    p.paragraph_format.line_spacing = 1.1
    p.alignment = WD_ALIGN_PARAGRAPH.LEFT
    r = p.add_run(text)
    r.italic = True
    r.font.size = Pt(8)
    r.font.name = TBL
    r.font.color.rgb = GREY


def placeholder_row_note():
    source_note("Cells shown as ____ are to be completed from the logged test run described in "
                "Chapter 5.5. They are left blank deliberately rather than filled with an estimate.")


# ---------------------------------------------------------------- footer
def build_footer():
    p = sec.footer.paragraphs[0]
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r = p.add_run("Waste Segregating Smart Bin (BinGenie)")
    r.font.size = Pt(8)
    r.font.name = TBL
    r.font.color.rgb = GREY
    r = p.add_run("   |   ")
    r.font.size = Pt(8)
    r.font.color.rgb = GREY
    fld = OxmlElement("w:fldSimple")
    fld.set(qn("w:instr"), "PAGE")
    run = OxmlElement("w:r")
    t = OxmlElement("w:t")
    t.text = "1"
    run.append(t)
    fld.append(run)
    p._p.append(fld)


def page_break():
    doc.add_paragraph().add_run().add_break(WD_BREAK.PAGE)


# ================================================================== TITLE
for _ in range(2):
    doc.add_paragraph()

p = doc.add_paragraph()
p.alignment = WD_ALIGN_PARAGRAPH.CENTER
p.paragraph_format.line_spacing = 1.15
r = p.add_run("WASTE SEGREGATING SMART BIN")
r.bold = True
r.font.size = Pt(28)
r.font.color.rgb = NAVY

p = doc.add_paragraph()
p.alignment = WD_ALIGN_PARAGRAPH.CENTER
p.paragraph_format.line_spacing = 1.15
r = p.add_run("(BIN GENIE)")
r.bold = True
r.font.size = Pt(20)
r.font.color.rgb = NAVY

doc.add_paragraph()
p = doc.add_paragraph()
p.alignment = WD_ALIGN_PARAGRAPH.CENTER
p.paragraph_format.line_spacing = 1.3
r = p.add_run("Design and Development of an IoT-Enabled Waste Segregation System\n"
              "using a Dual Carousel Disc Mechanism and AI-Driven Image Recognition")
r.font.size = Pt(12)
r.italic = True
r.font.color.rgb = GREY

for _ in range(2):
    doc.add_paragraph()

p = doc.add_paragraph()
p.alignment = WD_ALIGN_PARAGRAPH.CENTER
p.paragraph_format.line_spacing = 1.15
r = p.add_run("A PROJECT REPORT")
r.bold = True
r.font.size = Pt(11)

p = doc.add_paragraph()
p.alignment = WD_ALIGN_PARAGRAPH.CENTER
p.paragraph_format.line_spacing = 1.4
r = p.add_run("submitted in partial fulfilment of the requirements for the award of the degree of")
r.font.size = Pt(10.5)

p = doc.add_paragraph()
p.alignment = WD_ALIGN_PARAGRAPH.CENTER
r = p.add_run("BACHELOR OF ENGINEERING")
r.bold = True
r.font.size = Pt(14)
r.font.color.rgb = NAVY

p = doc.add_paragraph()
p.alignment = WD_ALIGN_PARAGRAPH.CENTER
r = p.add_run("in")
r.font.size = Pt(10.5)

p = doc.add_paragraph()
p.alignment = WD_ALIGN_PARAGRAPH.CENTER
r = p.add_run("MECHANICAL AND AUTOMATION ENGINEERING")
r.bold = True
r.font.size = Pt(12)

for _ in range(2):
    doc.add_paragraph()

p = doc.add_paragraph()
p.alignment = WD_ALIGN_PARAGRAPH.CENTER
r = p.add_run("Submitted by")
r.font.size = Pt(10.5)
r.italic = True

t = doc.add_table(rows=0, cols=2)
t.alignment = WD_TABLE_ALIGNMENT.CENTER
for name, roll in [("BHUVANESHWARAN M", "412511621003"),
                   ("JAGAN BABU R", "412511621011"),
                   ("RUDHRA PRIYA G", "412511622036")]:
    c = t.add_row().cells
    c[0].width = Cm(8.0)
    c[1].width = Cm(4.5)
    p0 = c[0].paragraphs[0]
    p0.alignment = WD_ALIGN_PARAGRAPH.RIGHT
    r = p0.add_run(name)
    r.bold = True
    r.font.size = Pt(11)
    p1 = c[1].paragraphs[0]
    p1.alignment = WD_ALIGN_PARAGRAPH.LEFT
    r = p1.add_run(f"[{roll}]")
    r.font.size = Pt(11)

for _ in range(2):
    doc.add_paragraph()

p = doc.add_paragraph()
p.alignment = WD_ALIGN_PARAGRAPH.CENTER
r = p.add_run("Under the guidance of")
r.font.size = Pt(10.5)
r.italic = True

p = doc.add_paragraph()
p.alignment = WD_ALIGN_PARAGRAPH.CENTER
r = p.add_run("Mr. V. VELMURUGAN")
r.bold = True
r.font.size = Pt(12)

p = doc.add_paragraph()
p.alignment = WD_ALIGN_PARAGRAPH.CENTER
r = p.add_run("Associate Professor, Department of Mechanical and Automation Engineering")
r.font.size = Pt(10)

for _ in range(2):
    doc.add_paragraph()

p = doc.add_paragraph()
p.alignment = WD_ALIGN_PARAGRAPH.CENTER
r = p.add_run("SRI SAI RAM ENGINEERING COLLEGE")
r.bold = True
r.font.size = Pt(14)
r.font.color.rgb = NAVY

p = doc.add_paragraph()
p.alignment = WD_ALIGN_PARAGRAPH.CENTER
r = p.add_run("(An Autonomous Institution; Affiliated to Anna University, Chennai – 600 025)")
r.font.size = Pt(9.5)

p = doc.add_paragraph()
p.alignment = WD_ALIGN_PARAGRAPH.CENTER
r = p.add_run("West Tambaram, Chennai – 600 044")
r.font.size = Pt(9.5)

doc.add_paragraph()
p = doc.add_paragraph()
p.alignment = WD_ALIGN_PARAGRAPH.CENTER
r = p.add_run("NOVEMBER 2026")
r.bold = True
r.font.size = Pt(12)

# ================================================================== CERTIFICATE
page_break()
p = doc.add_paragraph()
p.alignment = WD_ALIGN_PARAGRAPH.CENTER
r = p.add_run("SRI SAI RAM ENGINEERING COLLEGE")
r.bold = True
r.font.size = Pt(14)
r.font.color.rgb = NAVY
p = doc.add_paragraph()
p.alignment = WD_ALIGN_PARAGRAPH.CENTER
r = p.add_run("(An Autonomous Institution; Affiliated to Anna University, Chennai – 600 025)")
r.font.size = Pt(9.5)

p = doc.add_paragraph()
p.alignment = WD_ALIGN_PARAGRAPH.CENTER
p.paragraph_format.space_before = Pt(18)
r = p.add_run("BONAFIDE CERTIFICATE")
r.bold = True
r.font.size = Pt(14)
r.underline = True

para("Certified that this project report titled “WASTE SEGREGATING SMART BIN (BIN GENIE)” is the "
     "bonafide work of BHUVANESHWARAN M (412511621003), JAGAN BABU R (412511621011) and "
     "RUDHRA PRIYA G (412511622036), who carried out the project work under my supervision. "
     "This report has not been submitted elsewhere for the award of any other degree or diploma.",
     size=11, space_after=18)

for _ in range(2):
    doc.add_paragraph()

t = doc.add_table(rows=2, cols=3)
t.alignment = WD_TABLE_ALIGNMENT.CENTER
heads = ["Mr. V. VELMURUGAN", "Mr. S. RAMANATHAN", "Dr. N. MANI"]
roles = ["Supervisor\nAssociate Professor", "Project Coordinator\nAssistant Professor",
         "Head of the Department\nProfessor"]
for j in range(3):
    c = t.rows[0].cells[j]
    c.width = Cm(USABLE / 3)
    p = c.paragraphs[0]
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r = p.add_run(heads[j])
    r.bold = True
    r.font.size = Pt(10)
    c = t.rows[1].cells[j]
    p = c.paragraphs[0]
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r = p.add_run(roles[j])
    r.font.size = Pt(9)
fixed_layout(t, USABLE)

for _ in range(3):
    doc.add_paragraph()
para("Submitted for the project viva-voce examination held on ______________________", size=10.5)

for _ in range(2):
    doc.add_paragraph()
t = doc.add_table(rows=1, cols=2)
t.alignment = WD_TABLE_ALIGNMENT.CENTER
for j, lab in enumerate(["INTERNAL EXAMINER", "EXTERNAL EXAMINER"]):
    c = t.rows[0].cells[j]
    c.width = Cm(USABLE / 2)
    p = c.paragraphs[0]
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r = p.add_run(lab)
    r.bold = True
    r.font.size = Pt(10)
fixed_layout(t, USABLE)

# ================================================================== ACKNOWLEDGEMENT
page_break()
p = doc.add_paragraph(style="Heading 1")
r = p.add_run("ACKNOWLEDGEMENT")
doc.add_paragraph()

para("We express our sincere gratitude to our founder Chairman, Thiru. MJF. Ln. Leo Muthu, whose "
     "vision and blessings have shaped the environment in which this work was carried out, and to our "
     "Chairman and CEO, Dr. Sai Prakash LeoMuthu, for creating an atmosphere that encourages learning, "
     "innovation and independent enquiry.")

para("We are grateful to our Principal, Dr. J. Raja, for his constant encouragement and for making "
     "available the laboratory facilities that this project required.")

para("We are indebted to our Head of the Department, Dr. Mani N, for his guidance and for his "
     "insistence on rigour in reporting, which materially improved the quality of this document.")

para("We thank our project coordinator, Mr. S. Ramanathan, for coordinating the review schedule and "
     "for his careful reading of the manuscript.")

para("We owe a particular debt to our supervisor, Mr. V. Velmurugan, for his technical direction "
     "throughout the design and fabrication of the mechanism, and for encouraging us to report what we "
     "had measured rather than what we had hoped to measure. Much of what is credible in this report "
     "is a consequence of that advice.")

para("We also thank the teaching and non-teaching staff of the Department of Mechanical and Automation "
     "Engineering for their support, and the members of the review panel whose questions during the "
     "progress reviews helped us identify several errors in earlier drafts.")
doc.add_paragraph()
p = doc.add_paragraph()
p.alignment = WD_ALIGN_PARAGRAPH.RIGHT
r = p.add_run("— The Authors")
r.bold = True
r.font.size = Pt(10.5)

# ================================================================== ABSTRACT
page_break()
p = doc.add_paragraph(style="Heading 1")
r = p.add_run("ABSTRACT")
doc.add_paragraph()

para("Rapid urbanisation and the rising generation of municipal solid waste have made source-level "
     "segregation one of the most persistent bottlenecks in waste management, particularly in developing "
     "regions where biodegradable, recyclable, electronic and residual fractions are discarded together. "
     "Mixed disposal contaminates recyclable material, reduces the yield of recovery facilities and "
     "increases the quantity of waste reaching landfill.")

para("This report presents the design and development of BinGenie, a four-stream waste segregation unit "
     "that combines a dual carousel disc mechanism with multi-sensor material discrimination and a "
     "vision-based classifier. Waste inserted at the inlet is examined by a moisture probe, a capacitive "
     "proximity sensor, an inductive proximity sensor, a time-of-flight sensor, a load cell and a gas "
     "sensor, and photographed by a camera. A Raspberry Pi 4 fuses the visual and physical evidence and "
     "indexes a pair of ABS carousel discs to one of four detachable compartments: biodegradable, dry, "
     "electronic and residual.")

para("The mechanical design is reported in full: an overall envelope of 750 mm × 450 mm, four "
     "compartments of Ø156 mm × 370 mm arranged at 90° intervals on a 112 mm centre radius such that "
     "each outer edge is flush with the Ø380 mm disc rim, and an index repeatability requirement of "
     "0.5° derived from the 2.4 mm clearance between adjacent compartment mouths. The control "
     "architecture is specified down to the interface level, with an explicit six-state machine and a "
     "measured design cycle of 3.2 s, corresponding to a theoretical throughput of 1,125 items per hour.")

para("A matter of reporting integrity should be stated at the outset. The classification network has not "
     "yet been trained, and therefore no classification accuracy is reported in this "
     "document. What is reported is the completed mechanical and electrical design, the decision logic "
     "that maps ten material classes onto four physical streams, a preliminary observation of "
     "vision-only performance obtained by running a published pretrained model on live camera data, and "
     "a fully specified evaluation protocol whose results will be added in the next phase. The "
     "preliminary observation is instructive: the published model achieved a detection in 95.94% of "
     "13,352 frames but classified 98.37% of those detections as a single class, at a mean confidence "
     "of approximately 0.49. That failure is precisely the motivation for the sensor fusion architecture "
     "adopted here.")

para("The report closes with the design targets for the field phase, the measurement plan by which each "
     "will be verified, and a roadmap for the demonstration of the working prototype.", space_after=12)

p = doc.add_paragraph()
p.paragraph_format.space_before = Pt(10)
r = p.add_run("Keywords: ")
r.bold = True
r.font.size = Pt(10.5)
r = p.add_run("waste segregation, carousel disc mechanism, sensor fusion, convolutional neural network, "
              "IoT-enabled bin, source segregation, circular economy")
r.font.size = Pt(10.5)
r.italic = True

# ================================================================== TOC
page_break()
p = doc.add_paragraph(style="Heading 1")
r = p.add_run("TABLE OF CONTENTS")
doc.add_paragraph()

p = doc.add_paragraph()
p.paragraph_format.space_after = Pt(6)
p.alignment = WD_ALIGN_PARAGRAPH.LEFT
_ph = _field(p, 'TOC \\o "1-2" \\h \\z \\u',
             "The contents is generated automatically. In Word, place the cursor here and press F9 "
             "(or right-click and choose Update Field) if it is not already populated.")
_ph.font.size = Pt(10)
_ph.font.color.rgb = GREY
_ph.italic = True

# ================================================================== LOF / LOT
page_break()
p = doc.add_paragraph(style="Heading 1")
r = p.add_run("LIST OF FIGURES")
p = doc.add_paragraph()
p.paragraph_format.space_after = Pt(6)
_ph = _field(p, 'TOC \\h \\z \\c "Figure"',
             "Figure numbers and pages are generated automatically. Press F9 to update if needed.")
_ph.font.size = Pt(10)
_ph.font.color.rgb = GREY
_ph.italic = True

page_break()
p = doc.add_paragraph(style="Heading 1")
r = p.add_run("LIST OF TABLES")
p = doc.add_paragraph()
p.paragraph_format.space_after = Pt(6)
_ph = _field(p, 'TOC \\h \\z \\c "Table"',
             "Table numbers and pages are generated automatically. Press F9 to update if needed.")
_ph.font.size = Pt(10)
_ph.font.color.rgb = GREY
_ph.italic = True

# ================================================================== ABBREVIATIONS
p = doc.add_paragraph(style="Heading 1")
r = p.add_run("LIST OF ABBREVIATIONS")
doc.add_paragraph()

abbrs = [
    ("ABS", "Acrylonitrile Butadiene Styrene"),
    ("ADC", "Analogue-to-Digital Converter"),
    ("AI", "Artificial Intelligence"),
    ("BMS", "Battery Management System"),
    ("BOM", "Bill of Materials"),
    ("CNN", "Convolutional Neural Network"),
    ("CSI", "Camera Serial Interface"),
    ("EBITDA", "Earnings Before Interest, Tax, Depreciation and Amortisation"),
    ("GPIO", "General-Purpose Input/Output"),
    ("HDPE", "High-Density Polyethylene"),
    ("I²C", "Inter-Integrated Circuit (bus)"),
    ("IoT", "Internet of Things"),
    ("MRF", "Materials Recovery Facility"),
    ("MSW", "Municipal Solid Waste"),
    ("MQTT", "Message Queuing Telemetry Transport"),
    ("PWM", "Pulse-Width Modulation"),
    ("SDG", "Sustainable Development Goal"),
    ("TFLite", "TensorFlow Lite"),
    ("ToF", "Time of Flight"),
    ("UART", "Universal Asynchronous Receiver-Transmitter"),
]
t = doc.add_table(rows=0, cols=2)
for a, b in abbrs:
    c = t.add_row().cells
    c[0].width = Cm(3.2)
    c[1].width = Cm(USABLE - 3.2)
    p0 = c[0].paragraphs[0]
    p0.paragraph_format.space_after = Pt(0)
    r = p0.add_run(a)
    r.bold = True
    r.font.size = Pt(10)
    p1 = c[1].paragraphs[0]
    p1.paragraph_format.space_after = Pt(0)
    r = p1.add_run(b)
    r.font.size = Pt(10)
fixed_layout(t, USABLE)

print("front matter built; figures so far:", len(FIGURES))

# ================================================================== CH 1
chapter(1, "Introduction")

h2("1.1  Background and Motivation")
para("Municipal solid waste generation in India has grown faster than the infrastructure available to "
     "process it. Urban local bodies collect the majority of household waste, but a large fraction "
     "reaches landfill or open dump sites because the biodegradable, recyclable, electronic and residual "
     "fractions were never separated at the point of disposal. Once mixed, the value of the recyclable "
     "fraction falls sharply: paper and cardboard absorb moisture from food waste, glass and plastic "
     "become contaminated, and the entire load becomes unsuitable for recovery at a materials recovery "
     "facility (MRF).")

para("The consequences are both environmental and economic. Mixed waste produces leachate and methane "
     "in landfill, raises the cost per tonne of processing, and reduces the revenue that municipalities "
     "can recover from the sale of recyclables. Manual segregation at the tipping point is "
     "labour-intensive, inconsistent between operators, and exposes workers to sharps and hazardous "
     "material. Segregation at source, before the fractions meet, avoids all of these problems, but it "
     "depends on the user making a correct decision every time.")

para("That dependence is the weakness of every source-segregation programme. Compliance falls wherever "
     "the decision is ambiguous — an oily pizza box, a laminated pouch, a broken charger — and the "
     "consequence of a single mistake propagates through the entire collection. An automated device that "
     "inspects each item and routes it to the correct compartment removes the decision from the user "
     "entirely, and does so consistently. This is the motivation for the work reported here.")

para("Two technologies make such a device feasible at low cost: compact embedded vision, which can "
     "classify an object from a single image using a small convolutional neural network, and inexpensive "
     "material sensors, which measure moisture, dielectric constant and metal content directly. Neither "
     "is sufficient alone. Vision fails under poor lighting, on transparent objects and on materials "
     "that look alike; sensors cannot distinguish two plastics but can reliably detect metal and water. "
     "A device that combines them can succeed where either alone would not, and it is that combination, "
     "together with a mechanism compact enough for a domestic bin, that this project develops.")

h2("1.2  Problem Statement")
para("Existing low-cost smart bins fall into two groups, and each addresses only half of the problem.")
bullet("Sensor-only bins classify waste by electrical or physical properties. They are fast, cheap and "
       "robust, but they cannot separate materials with similar dielectric behaviour, and their accuracy "
       "degrades sharply in mixed waste.")
bullet("Vision-only bins classify by camera image. They handle a wider vocabulary of materials, but they "
       "are sensitive to lighting, occlusion and transparent or reflective objects, and their energy "
       "budget is often incompatible with battery operation.")

para("Both groups are usually built around a single hinged lid per compartment, which limits them to two "
     "or three streams and requires the user to present the item to the correct opening. Neither "
     "reports what it actually did, so neither can be audited, and neither generates the operational "
     "data that a municipality would need to plan collection.")

para("The problem addressed by this project is therefore threefold: to classify waste into four streams "
     "with a single insertion, to route each item mechanically to the correct compartment without user "
     "judgement, and to record every decision so that performance can be measured rather than asserted.")

h2("1.3  Objectives")
para("The aim of the project is to design, build and evaluate an intelligent waste segregation unit "
     "capable of accurate, energy-efficient and scalable classification of municipal solid waste at the "
     "point of disposal. The specific objectives are:")
bullet("To design a compact four-stream segregation mechanism using a dual carousel disc, in which "
       "waste is indexed to the correct compartment by rotation rather than by a lid.", numbered=True)
bullet("To integrate a multi-sensor array — moisture, capacitive, inductive, time-of-flight, load and "
       "gas — with a camera-based classifier so that physical evidence corroborates the visual "
       "decision.", numbered=True)
bullet("To define and implement a decision rule that maps the material classes produced by the "
       "classifier onto the four physical streams, including a fail-safe path for hazardous and "
       "low-confidence items.", numbered=True)
bullet("To implement a closed-loop embedded control system that sequences sensing, inference, fusion "
       "and actuation within a cycle short enough for domestic use.", numbered=True)
bullet("To establish an evaluation protocol by which classification accuracy, index repeatability, "
       "cycle time and energy consumption can be measured and reported reproducibly.", numbered=True)
bullet("To assess the economic and sustainability case for the device at household, institutional and "
       "municipal scale.", numbered=True)

h2("1.4  Scope and Limitations")
para("The scope of this phase covers the mechanical design and fabrication of the segregation unit, the "
     "electrical and control architecture, the definition of the classification and fusion logic, and "
     "the design of the evaluation protocol. The following are explicitly outside the present scope and "
     "are carried forward to the field phase described in Chapter 8.")
bullet("Training of the classification network to convergence, and the resulting per-class metrics. The "
       "protocol is fully specified in Chapter 5; the numbers are not yet available.")
bullet("Deployment of the trained model to the Raspberry Pi in quantised form, and the associated "
       "latency measurement.")
bullet("Long-duration field trials, uptime measurement and municipal route-integration studies.")
bullet("Life-cycle assessment and certification testing.")

para("One limitation of a different kind should be recorded here. Both an earlier conference paper and "
     "an earlier semester report on this project quoted classification accuracies and impact figures "
     "that could not be traced to a completed training run. Those figures have been removed from this "
     "report rather than re-quoted. What appears here is either a design specification, a computed "
     "quantity, or a measurement with a stated provenance. Where a number is not yet available, the "
     "cell is left blank and the measurement that will fill it is described.")

h2("1.5  Statement of Project Status")
para("For clarity, the status of each subsystem at the time of writing is set out below. This table is "
     "referred to throughout the report, and the reader is asked to keep it in view: it distinguishes "
     "what has been designed, what has been built, and what has been measured.")
table_caption("Status of each subsystem at the time of writing")
table(["Subsystem", "Designed", "Built", "Measured", "Evidence in this report"],
      [["Carousel disc mechanism", "Yes", "Yes", "Partly", "Ch. 3; repeatability protocol in Ch. 3.5"],
       ["Four detachable compartments", "Yes", "Yes", "Yes", "Ch. 3.3, dimensions verified against disc"],
       ["Sensor array and mounting", "Yes", "Yes", "Partly", "Ch. 2.2, Ch. 4.1"],
       ["Power subsystem", "Yes", "Yes", "No", "Ch. 2.5; runtime protocol in Ch. 7.3"],
       ["Firmware and state machine", "Yes", "Yes", "Partly", "Ch. 4.2; cycle timing in Ch. 4.3"],
       ["Classification model", "Yes", "No — not trained", "!!No", "Ch. 5; preliminary log in Ch. 5.6"],
       ["Fusion logic", "Yes", "Yes", "!!No", "Ch. 2.6"],
       ["IoT telemetry", "Yes", "Partly", "!!No", "Ch. 4.5"]],
      [3.5, 1.4, 1.9, 1.6, 5.4], size=8.5, tag_col=3)
source_note("“Measured” means a logged measurement exists and is reported in this document. “Partly” means "
            "the quantity is known from the build but no formal log has yet been recorded.")

# ================================================================== CH 2
chapter(2, "System Design and Architecture")

h2("2.1  Overview of the Four Modules")
para("The unit is organised as four functional modules arranged around a single controller: sensing and "
     "detection at the inlet, control and processing in the head, segregation by the carousel mechanism, "
     "and output in the form of four compartments together with a telemetry link. Fig. 1 shows the "
     "architecture with the physical interface for every connection. The interfaces are the substance of "
     "the diagram: they establish, for example, that the sensing bus is I²C plus an analogue front end "
     "rather than a generic sensor connection, that the disc carries an index sensor and is therefore "
     "positioned in closed loop, and that the motor runs from a separate 12 V rail while the logic runs "
     "from 5 V and 3.3 V.")

figure("Fig_System_Architecture.png",
       "System architecture. Four functional columns, an explicit interface key, and the power bus "
       "separated from the signal path.")

para("The choice of a four-column presentation follows from the design method: each column corresponds "
     "to a subsystem that can be tested independently before integration. A defective sensor can be "
     "exercised through the I²C bus without the mechanism running; the disc can be commanded through its "
     "driver without the camera; and the classifier can be evaluated offline on still images without any "
     "of the hardware. This modularity is what makes staged verification possible at all, and it is "
     "preserved in the firmware as four concurrent tasks rather than one sequential program.")

h2("2.2  Sensing and Detection Module")
para("Seven sensing elements are used. Their arrangement is deliberate: each one is chosen because it "
     "measures a property that the others cannot, and each has a known limitation that motivates the "
     "presence of the others. Table 2 sets out the sensor, the interface, the decision it contributes "
     "and the limitation that must be stated openly.")

table_caption("Sensing elements and the decision each contributes")
table(["Sensor", "Part", "Interface", "Decision contributed", "Known limitation"],
      [["Camera", "OV5647, 5 MP", "MIPI-CSI", "Primary class: colour, texture and shape features",
        "Sensitive to lighting and occlusion; transparent and reflective items are hard"],
       ["Moisture", "Resistive probe", "ADC via ADS1115", "Wet versus dry; the biodegradable trigger",
        "Measures surface moisture only — a wet plastic bag reads wet"],
       ["Capacitive proximity", "LJC18A3-H-Z/BX", "GPIO / ADC", "Presence of dielectric material",
        "Cannot separate plastic from glass or paper on its own"],
       ["Inductive proximity", "LJ12A3-4-Z/BX", "GPIO", "Ferrous metal content",
        "Blind to aluminium and to plastic-cased electronics"],
       ["Time of flight", "VL53L0X", "I²C (0x29)", "Object present; gates image capture",
        "Ambient infrared and dark targets reduce range"],
       ["Load cell", "5 kg bar + HX711", "GPIO, bit-banged", "Mass per item; fill estimate",
        "Requires tare and calibration; drifts with temperature"],
       ["Gas", "MQ-135", "ADC", "Odour and air-quality index for hygiene logging",
        "Cross-sensitive; reported as a relative index, not as a concentration"]],
      [2.3, 2.7, 2.4, 3.4, 4.0], size=8.2)
source_note("The limitation column is not a list of weaknesses in the design. It is the technical "
            "justification for sensor fusion: no single element is sufficient, and the fusion rule in "
            "Section 2.6 is constructed so that each element compensates for the deficiency of another.")

para("The capture sequence is triggered by the time-of-flight sensor rather than by a mechanical switch. "
     "When the measured distance falls below a threshold, the controller wakes the camera and begins "
     "acquisition; the frame is then cropped to the region of interest and resized before inference. "
     "This removes the need for the user to press anything, and it bounds the energy cost of idling "
     "because the camera is unpowered between items.")

h2("2.3  Control and Processing Module")
para("The controller is a Raspberry Pi 4 Model B with 4 GB of RAM, running Raspberry Pi OS. It was "
     "chosen over a microcontroller because the classification stage requires a full operating system "
     "and a numerical runtime, and over a more powerful single-board computer because the thermal and "
     "power budgets of a domestic bin are restrictive. The quad-core processor allows the four tasks — "
     "sensing, inference, fusion-and-decision, and actuation-and-logging — to run as concurrent threads, "
     "so that image capture for the next item can begin while the disc is still indexing the previous "
     "one.")

para("The controller's interfaces are summarised in Table 3. Digital sensors are read directly from "
     "GPIO; the analogue sensors share an ADS1115 converter on the I²C bus; the camera uses the "
     "dedicated MIPI-CSI connector; and the stepper driver receives step and direction pulses from "
     "three GPIO lines. Because the motor supply is 12 V and the logic supply is 5 V, the two rails are "
     "kept separate and joined only at a common ground, which prevents the current transients of the "
     "stepper from disturbing the analogue measurements.")

table_caption("Controller interface assignment")
table(["Signal", "From → To", "Physical interface", "Rate or note"],
      [["Image", "OV5647 → Pi 4", "MIPI-CSI, 2 lane", "640 × 480 capture; 224 × 224 inference crop"],
       ["Analogue sensors", "Moisture, MQ-135, load cell → Pi 4", "ADS1115 over I²C (0x48)", "16-bit; 10–100 samples/s"],
       ["Digital sensors", "Capacitive, inductive → Pi 4", "GPIO inputs", "Debounced 20 ms in firmware"],
       ["Distance", "VL53L0X → Pi 4", "I²C (0x29)", "30–50 ms per ranging cycle"],
       ["Motor", "Pi 4 → DRV8825", "GPIO step / dir / enable", "200–1,600 Hz step rate"],
       ["Position", "Index sensor → Pi 4", "GPIO interrupt", "Edge-triggered; counter in firmware"],
       ["Logic power", "Buck converter → Pi 4", "5 V, 5 A", "≈90% efficiency; ripple below 50 mV"],
       ["Motor power", "Battery → DRV8825", "12 V direct", "Separate rail; common ground only"],
       ["Telemetry", "Pi 4 → broker", "Wi-Fi, MQTT over TCP", "Publish on state change plus 60 s heartbeat"]],
      [2.2, 4.3, 4.0, 4.3], size=8.2)

h2("2.4  Segregation Module")
para("Segregation is performed by two coaxial circular plates, each machined from ABS to Ø380 mm and "
     "18 mm thickness. The upper plate carries a cup-shaped downward extrusion that receives the item and "
     "holds it while the plate rotates; the lower plate carries an arc-shaped aperture. Both are driven "
     "from a single NEMA 17 stepper motor through a coupling, and they rotate together so that the cup "
     "and the aperture remain in register. When the commanded index position is reached, the aperture "
     "aligns with the mouth of the selected compartment and the item falls under gravity.")

para("The arrangement is chosen over four motorised lids for three reasons. First, it needs one actuator "
     "rather than four, which reduces cost, mass and the number of failure points. Second, the item never "
     "rests on a lid that must open beneath it, so there is no possibility of the item falling into the "
     "gap between compartments during actuation. Third, the rotational path is continuous, which means "
     "the mechanism can index to any compartment in at most 270° of travel regardless of its current "
     "position, and can return to a defined home position for calibration.")

para("The four compartments are arranged at 90° intervals around the disc axis. Their geometry, and the "
     "reason the arrangement is not a simple grid, is treated in Section 3.2.")

h2("2.5  Power Subsystem")
para("Power is supplied from a 12 V, 7 Ah lithium-ion pack, configured as three cells in series with an "
     "integrated battery management system providing over-charge, over-discharge and short-circuit "
     "protection. A synchronous buck converter derives 5 V at up to 5 A for the controller and "
     "peripherals at approximately 90% efficiency, and a second regulator provides 3.3 V for the sensor "
     "and logic supply. The motor and its driver are fed directly from the 12 V rail.")

para("The stored energy is 84 Wh, obtained as the product of 12 V and 7 Ah. This is the correct starting "
     "point for a runtime claim, but it is not itself a runtime. The usable time depends on the average "
     "system draw, which in turn depends on the duty cycle: the controller consumes power continuously, "
     "whereas the motor draws current only while indexing. A stored energy of 84 Wh corresponds to a "
     "runtime of six to eight hours only if the average draw lies between 10.5 W and 14 W. Since the "
     "actual draw of the assembled unit has not yet been logged, no runtime figure is reported here; the "
     "measurement that will produce one is specified in Section 7.3.")

h2("2.6  Class-to-Compartment Decision Logic")
para("The classifier produces a material class; the mechanism has four physical destinations. The "
     "mapping between them is a design decision in its own right, and it is set out explicitly in "
     "Fig. 2 and Table 4. It is not a one-to-one correspondence: several material classes share a "
     "compartment, one class is deliberately never auto-sorted, and a confidence threshold provides a "
     "fail-safe path.")

figure("Fig_Class_Mapping.png",
       "Class-to-compartment decision logic. Sensor evidence corroborates or overrides the visual "
       "prediction; any low-confidence result defaults to the residual compartment.")

table_caption("Mapping of classifier output to physical compartment")
table(["Classifier output", "Compartment", "Corroboration rule", "Rationale"],
      [["Biological / organic", "Biodegradable (wet)", "Moisture high confirms; low moisture with high confidence may retain the class",
        "The wet fraction is the compostable stream"],
       ["Paper, cardboard", "Dry", "Capacitive present, low mass", "Collected with plastics at the MRF"],
       ["Plastic", "Dry", "Capacitive present, inductive absent", "Recyclable dry fraction"],
       ["Glass", "Dry", "Capacitive present, high mass, no inductive", "Separated at the MRF, not in the bin"],
       ["Metal", "Electronic", "Inductive high overrides the camera", "Highest-value recovery stream"],
       ["Battery, e-waste", "Electronic", "Inductive high, or visual confidence above threshold", "Battery-bearing items must not enter the dry stream"],
       ["Clothes, shoes, general", "Residual", "No corroboration available", "Not recyclable in this configuration"],
       ["Any class, confidence < τ", "!!Residual", "Sensor vote decides; ties resolve to residual",
        "Fail-safe: an uncertain item must not contaminate a clean stream"]],
      [3.1, 2.9, 5.1, 4.0], size=8.2)
source_note("The threshold τ is a tuned parameter of the fusion stage; its value is reported with the "
            "evaluation results. A residual outcome is not a malfunction — it is the designed response "
            "to any item the system cannot classify with adequate confidence, and it protects the value "
            "of the three clean streams.")

para("Two properties of this logic deserve emphasis. First, the inductive sensor takes precedence over "
     "the camera for metal. This is a deliberate asymmetry: metal recovery is the highest-value stream, "
     "the inductive response to ferrous material is unambiguous, and a camera is easily fooled by a "
     "metallic finish on a non-metallic object. Second, hazardous material is never auto-sorted. Batteries "
     "and medical waste go to the residual compartment regardless of classifier confidence, because the "
     "cost of a false positive — a lithium cell entering a dry recyclable stream — is far greater than "
     "the cost of a conservative omission.")

# ================================================================== CH 3
chapter(3, "Mechanical Design")

h2("3.1  Principal Dimensions")
para("The unit is a free-standing bin of 750 mm height and 450 mm width, sized to sit beneath a standard "
     "kitchen counter and to be moved by one person. The envelope is divided into a head section, which "
     "houses the electronics, sensors and carousel assembly, and a body section containing the four "
     "detachable compartments. Table 5 collects the governing dimensions; every dimension in the "
     "assembly drawing is derived from one of these.")

table_caption("Principal dimensions of the assembly")
table(["Dimension", "Value", "Derivation or note"],
      [["Overall height", "750 mm", "Head section plus compartment bay"],
       ["Overall width and depth", "450 mm", "Footprint limited by compartment bay"],
       ["Compartment", "4 × Ø156 mm × 370 mm", "Internal capacity approximately 7.1 litres each"],
       ["Total nominal capacity", "approximately 28 litres", "Four compartments at 7.1 litres"],
       ["Compartment arrangement", "Four, at 90° intervals", "See Section 3.2 for the constraint"],
       ["Compartment centre radius", "112 mm", "(380 − 156) / 2"],
       ["Disc", "2 × Ø380 mm × 18 mm", "Upper disc carries the cup; lower disc the aperture"],
       ["Index angle", "90° per position", "Four equally spaced positions"],
       ["Gap between adjacent compartment mouths", "2.4 mm", "112√2 − 156; governs the tolerance in Section 3.5"],
       ["Available head height above compartments", "380 mm", "750 − 370; houses the Pi, driver, converter and wiring"]],
      [5.0, 3.6, 6.4], size=8.4)

h2("3.2  Carousel Disc Geometry")
para("The relationship between the four compartments and the disc that feeds them is the tightest "
     "constraint in the design, and it is worth stating explicitly because the obvious arrangement does "
     "not work. Four compartments of Ø156 mm cannot be placed side by side in a 450 mm wide body: they "
     "would require 624 mm. They also cannot be placed in a 2 × 2 square cluster, because the diagonal "
     "corner of such a cluster lies √2 × 112 + 78 = 236 mm from the axis, which is 46 mm beyond the "
     "190 mm radius of the disc.")

para("The arrangement that does work places the four compartments at 90° intervals, each with its centre "
     "on a radius of 112 mm. The centre radius is fixed by the arithmetic: 190 mm disc radius less 78 mm "
     "compartment radius equals 112 mm, so that the outer edge of each compartment is exactly flush with "
     "the rim of the disc. In this position the adjacent centres are 112√2 = 158.4 mm apart, which "
     "exceeds the 156 mm diameter by 2.4 mm; the four circles therefore clear one another, and the "
     "assembly fits the disc. Fig. 3 shows the arrangement to scale.")

figure("Fig_Carousel_Geometry.png",
       "Top view of the carousel and compartment arrangement, drawn to scale. Four Ø156 mm compartments "
       "at 90° intervals on a 112 mm centre radius.")

para("The 2.4 mm clearance is not a detail that can be absorbed by ordinary manufacturing tolerance. It "
     "is what fixes the angular repeatability specification derived in Section 3.5, and it is the reason "
     "the mechanism uses an index sensor rather than relying on open-loop step counting.")

h2("3.3  Waste Compartments")
para("Each compartment is a high-density polyethylene container of Ø156 mm internal diameter and 370 mm "
     "height, giving a nominal capacity of approximately 7.1 litres and a total of approximately 28 "
     "litres across the four streams. HDPE was selected for corrosion resistance, low mass, and "
     "resistance to the cleaning agents used on kitchen waste; it is also readily available in the "
     "diameters required, which avoided a tooling cost that would have been disproportionate at "
     "prototype volume.")

para("The compartments are colour-coded to match the decision logic — green for biodegradable, yellow "
     "for dry, orange for electronic, grey for residual — and each is independently removable through "
     "the front of the body. Independent removal matters for two reasons: a compartment containing "
     "organic waste can be emptied daily without disturbing the electronics, and a compartment can be "
     "inspected after a disputed classification without dismantling the unit. The bases are sealed and "
     "the lids are common across all four, so a single spare lid serves the whole unit.")

h2("3.4  Drive and Transmission")
para("Rotation is provided by a single NEMA 17 stepper motor with a 1.8° step angle, that is, 200 full "
     "steps per revolution. It is driven by a DRV8825 bipolar driver operating in 1/16 microstepping "
     "mode, which gives an angular resolution of 0.1125° per microstep and 50 microsteps per 90° index "
     "position. The driver receives step and direction signals from the controller and is enabled only "
     "during a move, so that the windings are not energised while the unit is idle.")

para("The motor is coupled to the disc hub directly through a flexible coupling. A flexible element is "
     "used rather than a rigid one because the two discs must remain parallel to better than a "
     "millimetre across their diameter; a rigid coupling would transmit any misalignment between the "
     "motor shaft and the hub into the disc plane and produce a rubbing contact with the lower plate. "
     "The coupling also attenuates the step transients that would otherwise appear as vibration in the "
     "camera image during capture.")

para("An important consequence of the resolution calculation should be recorded. With 0.1125° per "
     "microstep, angular resolution is not the limiting factor in positioning: a tolerance of 0.5° "
     "corresponds to roughly four microsteps, which the drive can resolve comfortably. The limiting "
     "factor is backlash and compliance in the coupling and hub, which is why the position is verified "
     "by an index sensor and counted in firmware rather than assumed from the number of steps issued.")

h2("3.5  Tolerance Analysis and Angular Repeatability")
para("The tolerance on index position follows directly from the 2.4 mm gap between adjacent compartment "
     "mouths. If the aperture comes to rest with an angular error of θ, the corresponding displacement "
     "at the compartment centre radius r = 112 mm is r·θ in radians. For the item to land wholly inside "
     "the intended compartment, this displacement must not exceed half the clearance, that is, 1.2 mm. "
     "The permissible angular error is therefore:")
equation("θ_max = arctan(1.2 / 112) = 0.61°")
para("A specified repeatability of 0.5° leaves a margin and corresponds to a displacement of 0.98 mm, "
     "well inside the clearance. Table 6 shows the numbers, together with the displacement that would "
     "result from the looser figures quoted in earlier documents on this project.")

table_caption("Relationship between angular error and radial displacement at the compartment centre radius")
table(["Angular error", "Displacement at r = 112 mm", "Proportion of the 1.2 mm half-clearance", "Verdict"],
      [["0.1125° (one microstep)", "0.22 mm", "18%", "Well within tolerance"],
       ["0.5° (specified)", "0.98 mm", "82%", "Acceptable, with margin"],
       ["0.61° (theoretical limit)", "1.20 mm", "100%", "Limit of acceptability"],
       ["1.8° (quoted in earlier drafts)", "!!3.52 mm", "!!293%", "!!Exceeds the gap; the item can straddle two mouths"],
       ["2.0° (proposed in earlier drafts as an improvement)", "!!3.91 mm", "!!326%", "!!Not a valid specification"]],
      [3.6, 3.4, 3.6, 4.4], size=8.4)
source_note("The two lower rows are included because earlier documents on this project specified 1.8° as "
            "achieved and ±2° as an improvement. The first exceeds the available clearance and the second "
            "is looser than the first, so neither can be retained. The specification adopted in this report "
            "is 0.5°, verified by an index sensor over 100 consecutive cycles.")

para("Verification is by encoder count against commanded position, cross-checked with a dial gauge on "
     "the disc rim for a sample of positions. The protocol commands each of the four positions "
     "twenty-five times from a randomly disturbed start, records the final position error, and reports "
     "the mean and the standard deviation rather than a single figure. This distinguishes repeatability "
     "(the spread of successive attempts) from accuracy (the systematic offset), which a mean alone "
     "would conceal.")

h2("3.6  Materials and Construction")
para("Materials were selected against three criteria that conflict: stiffness where the geometry needs "
     "it, low mass where the motor must move it, and corrosion resistance where the environment demands "
     "it. Table 7 records the selection and the reasoning.")
table_caption("Material selection by component")
table(["Component", "Material", "Reason for selection"],
      [["Carousel discs", "ABS, 18 mm plate", "Stiff enough at Ø380 mm to hold flatness, machinable, and roughly half the mass of aluminium"],
       ["Compartments", "HDPE", "Chemically inert, withstands cleaning, available in the required diameter"],
       ["Main frame and body", "Mild steel, powder coated", "Stiff support for the disc bearing; coating resists humid kitchen air"],
       ["Sensor mounts and brackets", "PLA, 3D printed", "Complex geometry at negligible cost; easily reprinted when a mount is revised"],
       ["Coupling", "Flexible, machined", "Accommodates shaft misalignment and damps step transients"],
       ["Hub and bearing housing", "Aluminium", "Bearing seat requires a harder material than the disc"]],
      [4.0, 3.6, 7.4], size=8.4)

para("The use of printed brackets is a deliberate design choice rather than a cost compromise. The "
     "sensor mounts are the components most likely to change as the fusion logic is tuned, and a printed "
     "mount can be revised and reprinted in an afternoon, whereas a machined or moulded equivalent would "
     "fix the sensor geometry at a stage when it is still being optimised.")

h2("3.7  Bill of Materials")
para("The bill of materials is given in Appendix A. Its purpose in this chapter is to establish that the "
     "cost of goods is consistent with the price assumed in Chapter 7. The indicative build cost of the "
     "prototype lies between ₹17,000 and ₹19,000 in components, before assembly labour and channel "
     "margin. This figure is what allows a selling price to be derived rather than asserted, and it is "
     "the number most often requested in a technical review; it is reported here so that it can be "
     "checked against the design rather than taken on trust.")

# ================================================================== CH 4
chapter(4, "Electrical and Control Design")

h2("4.1  Hardware Interfacing")
para("The interface assignment has already been listed in Table 3. Three points about the electrical "
     "design deserve separate treatment, because they are the ones that determine whether the system "
     "works in practice rather than merely on a diagram.")
bullet("**Separation of power rails.** The stepper draws a current pulse of the order of an ampere at "
       "every step. If that current shares a path with the analogue sensor supply, the resulting ground "
       "bounce appears as noise in the moisture and gas readings at exactly the moment a measurement "
       "matters. The 12 V motor rail and the 5 V logic rail are therefore kept separate and joined only "
       "at a single common ground point near the battery.")
bullet("**Analogue front end.** The moisture probe, the MQ-135 and the load cell are all analogue. Rather "
       "than using the Pi's own limited analogue capability, they share an ADS1115 16-bit converter on "
       "the I²C bus, which gives a stable reference and allows gain to be set per channel.")
bullet("**Motor enable.** The DRV8825 enable line is driven only during a commanded move. This avoids "
       "continuous winding current while the disc is stationary, which would otherwise dominate the "
       "average power draw and make the runtime figure in Section 2.5 unattainable.")

h2("4.2  Firmware Architecture")
para("The firmware is written in Python on Raspberry Pi OS and is organised as a six-state machine with "
     "four concurrent worker threads. The state machine governs the sequence; the threads allow the "
     "camera to capture the next item while the mechanism completes the previous one. Fig. 4 shows the "
     "states and the guard conditions on each transition.")

figure("Fig_State_Machine.png",
       "Firmware state machine. Each transition is guarded by a timeout, and a missed guard drives the "
       "system to the fault state with the disc held in position.")

para("The choice of a state machine rather than a linear program is what makes the fault behaviour "
     "defensible. Every transition has an explicit guard and a timeout: if the proximity trigger does not "
     "occur within its window, if the camera frame does not arrive, if inference does not complete, or "
     "if the index sensor does not confirm the commanded position, the machine moves to FAULT and holds "
     "the disc rather than continuing blindly. A linear program without these guards would, in the same "
     "circumstances, either hang or actuate on stale data.")

para("The four threads are a capture thread, an inference thread, a control thread and a logging thread. "
     "They communicate through bounded queues, which is what prevents an unusually slow inference from "
     "causing frames to accumulate without limit. The bound is a design parameter: when the queue is "
     "full the oldest unprocessed frame is dropped, because a stale image is worse than no image.")

h2("4.3  Cycle Timing and Throughput")
para("The design cycle is 3.2 s per item. Fig. 5 breaks the cycle into its constituent stages and "
     "shows where the time is spent. The largest single allowance is the index rotation, which is "
     "unavoidable for a mechanical actuator of this inertia; the second largest is the gravity drop, "
     "which is governed by the height of the drop and cannot be shortened without reducing the "
     "reliability of the fall.")

figure("Fig_Cycle_Timeline.png",
       "Breakdown of the 3.2 s design cycle. The index rotation and the gravity drop together account "
       "for 1.40 s, or 44% of the cycle.")

para("At 3.2 s per item the theoretical throughput is 3,600 / 3.2 = 1,125 items per hour. This figure "
     "should be read as an upper bound: it assumes an item is always available at the inlet at the "
     "instant the mechanism returns to standby. In domestic use the arrival rate is far lower — a "
     "household generates of the order of a few tens of items per day — so the practical service rate is "
     "set by the user, not by the machine. The figure matters for institutional deployment, where a "
     "canteen or a hostel may present a sustained stream, and it is the number against which the machine "
     "should be compared with other automated sorters.")

h2("4.4  Fault Handling")
para("Three fault classes are distinguished, and they are handled differently because their consequences "
     "differ.")
bullet("**Mechanical jam.** The index sensor does not confirm position within its timeout. The disc is "
       "held, the motor is disabled to prevent overheating, and an alert is raised. The unit does not "
       "attempt to force through the obstruction.")
bullet("**Sensor anomaly.** A reading falls outside its physically plausible range, which usually "
       "indicates a disconnected probe. The affected channel is excluded from the fusion vote, its "
       "weight redistributed, and the exclusion is logged so that the omission is visible in the record.")
bullet("**Low-confidence classification.** No fault; the item is routed to the residual compartment by "
       "the fail-safe rule in Section 2.6, and the event is logged with its confidence value so that the "
       "threshold τ can be tuned from evidence.")

para("The common principle is that the system degrades towards the residual stream rather than towards "
     "an arbitrary guess, and that every degradation is recorded. A bin that silently misroutes is worse "
     "than one that refuses to route, because the first error is invisible and the second is not.")

h2("4.5  Telemetry and Monitoring")
para("The controller publishes state transitions and a periodic heartbeat over Wi-Fi using MQTT. The "
     "published record includes the classification outcome, the confidence value, the sensor readings "
     "used in the fusion vote, the index position reached, the fill level of each compartment derived "
     "from item count and mass, and the gas index. This record is what allows the system to be audited "
     "after the fact, and it is the raw material for the municipal planning case in Section 7.2.")

para("The telemetry link is specified here as part of the architecture, but its performance has not yet "
     "been measured. In particular, no latency or uptime figures are reported in this document. Latency "
     "and uptime are quantities that require a defined monitoring period and a defined failure criterion; "
     "neither has been established, and quoting a figure without them would repeat precisely the kind of "
     "untraceable claim this report has set out to avoid. The measurement that will produce both is "
     "specified in Section 7.3.")

# ================================================================== CH 5
chapter(5, "Waste Classification Model")

h2("5.1  Dataset and Provenance")
para("The training corpus is assembled from three public sources together with images captured at the "
     "inlet of the prototype itself. The in-house capture is important and should not be treated as a "
     "supplement: the public datasets were photographed under conditions that differ from those inside a "
     "bin, and a model trained only on them will classify a laboratory image correctly and a kitchen "
     "scrap badly. Table 8 sets out the provenance. Counts are completed from the preparation script "
     "output; the total reported here is the number of images retained after cleaning, not the number "
     "downloaded.")

table_caption("Dataset provenance")
table(["Source", "Licence / access", "Classes available", "Images retained", "Role in the corpus"],
      [["TrashNet (Stanford)", "Open, research use", "Glass, paper, cardboard, plastic, metal, trash", "____",
        "Base for the dry recyclable classes"],
       ["Kaggle smart-waste set", "Open, per-dataset licence", "Organic, recyclable and variants", "____",
        "Organic class and bulk volume"],
       ["TACO", "CC BY 4.0", "60 litter categories, in-the-wild scenes", "____",
        "Hard cases: partial, cluttered, low light"],
       ["In-house capture at inlet", "Owned", "All four streams, Indian municipal mix", "____",
        "Domain match to the installed bin"],
       ["**Total**", "", "**Ten material classes**", "**____**", "After removal of duplicates and corrupt files"]],
      [3.1, 2.8, 4.2, 2.2, 3.4], size=8.2)
placeholder_row_note()

para("Three controls are applied during preparation, and each is recorded so that the split can be "
     "reproduced. The split is stratified by class, so that a class with few images is not lost from the "
     "validation set. The random seed is fixed. And the split is made at file level before any "
     "augmentation, so that an augmented copy of a training image cannot appear in the validation set — "
     "a common error that inflates reported accuracy by a wide margin and is invisible in the final "
     "number.")

h2("5.2  Model Selection")
para("The classifier is a YOLOv8 classification network fine-tuned from pretrained weights. The "
     "selection is a departure from the network named in earlier documents on this project, and the "
     "reason should be stated plainly: the earlier documents described an EfficientNet-B3 classifier, but "
     "no such model was ever built in the project's codebase, which trains and evaluates YOLOv8 "
     "exclusively. The network reported here is the network that exists.")

para("YOLOv8-cls is preferred here for four reasons. It is a single-stage classifier, so a single forward "
     "pass produces the class distribution without a separate proposal stage. It is available in a "
     "nano variant whose parameter count and memory footprint suit a Raspberry Pi with 4 GB of RAM. It "
     "exports directly to ONNX, NCNN and TFLite, which is the path by which the model will eventually run "
     "on the controller. And the training, validation and per-class evaluation scripts that accompany it "
     "compute the metrics from a confusion matrix rather than requiring them to be assembled by hand, "
     "which removes a class of transcription error.")

para("The choice is not asserted as optimal. A comparative benchmark against MobileNetV3, ResNet-50 and "
     "EfficientNet-B0 on the same split, measuring both top-1 accuracy and median inference latency on "
     "the Pi, is scheduled as part of the field phase. Until that benchmark exists, the statement that "
     "YOLOv8-cls is the best choice for this application is a design rationale, not a result, and it is "
     "presented as such.")

h2("5.3  Training Protocol")
para("The protocol below is fixed in advance so that the reported result cannot be influenced by "
     "subsequent choices. It is reproduced in full because the reproducibility of the number depends "
     "entirely on these settings being recorded alongside it.")

table_caption("Fixed training protocol")
table(["Parameter", "Value", "Note"],
      [["Base model", "YOLOv8n-cls", "Nano variant, chosen for the Pi's memory budget"],
       ["Input resolution", "224 × 224 px", "Matches the camera crop after resizing"],
       ["Epochs", "50, with early stopping patience 15", "Reduced schedule for CPU-only training"],
       ["Batch size", "32", "Reduced to 16 if memory is constrained"],
       ["Optimiser", "Automatic (SGD with momentum)", "Default schedule of the training framework"],
       ["Augmentation", "Rotation, horizontal flip, brightness and contrast jitter", "Applied to the training split only"],
       ["Validation split", "20% of the corpus, stratified, seed 42", "Held out before augmentation"],
       ["Test split", "Separate held-out set", "Reserved for the final reported metric"],
       ["Hardware", "GPU where available; CPU otherwise", "Recorded with the result"],
       ["Random seed", "42", "Fixed for split and augmentation"]],
      [3.4, 5.2, 6.4], size=8.4)

h2("5.4  Evaluation Metrics and Their Definitions")
para("Four quantities are reported, and their definitions are fixed here so that the reported values can "
     "be checked independently. All four are computed from the confusion matrix C, in which the entry "
     "C[i][j] counts the items whose true class is i and whose predicted class is j.")

para("Overall accuracy is the fraction of all items classified correctly:", space_after=2)
equation("Accuracy = Σ_i C[i][i]  /  Σ_i Σ_j C[i][j]")

para("For class i, with support n_i equal to the row sum, precision and recall are:", space_after=2)
equation("Precision_i = C[i][i] / Σ_k C[k][i]          Recall_i = C[i][i] / Σ_j C[i][j]")

para("And the F1 score is their harmonic mean:", space_after=2)
equation("F1_i = 2 · Precision_i · Recall_i / (Precision_i + Recall_i)")

para("Two aggregate figures are reported alongside these. Macro-F1 is the unweighted mean of the per-class "
     "F1 scores; it treats every class as equally important, so a poorly performing minority class "
     "depresses it. Micro-accuracy is the overall accuracy above, which is dominated by the largest "
     "classes. Where the class supports are unequal — and in a real waste stream they always are — the "
     "two figures diverge, and reporting only the micro figure conceals poor performance on minority "
     "classes. For that reason both are reported, and the per-class table always carries its support "
     "column so that the reader can see which classes are carrying the aggregate.")

para("A further caution concerns the word accuracy itself. The proportion of frames in which the detector "
     "finds any object at all is a detection rate, not an accuracy: it says nothing about whether the "
     "object was classified correctly. The two are easily confused, and the confusion is flattering. In "
     "this report the term accuracy is used only in the sense defined above.")

h2("5.5  Evaluation Protocol and Current Status")
para("The model has not yet been trained, and therefore no classification metric is "
     "reported in this document. This is stated at the outset rather than at the end of the section, "
     "because the reader is entitled to know why Chapter 6 contains no accuracy figure.")

para("The evaluation that will produce the figure is fully specified, and the code to perform it exists. "
     "The protocol is as follows.")
bullet("Prepare the corpus and split it as in Section 5.3, recording the per-class support before "
       "training begins.", numbered=True)
bullet("Train for the fixed schedule, saving the best checkpoint by validation top-1 accuracy.", numbered=True)
bullet("Run the checkpoint over the held-out test split, once, without further tuning. The confusion "
       "matrix is generated by the evaluation script, not assembled by hand.", numbered=True)
bullet("Report the matrix with its support column, together with per-class precision, recall and F1, "
       "macro-F1 and micro-accuracy, as defined in Section 5.4.", numbered=True)
bullet("Record the run configuration — model, epochs, resolution, batch, seed, date, hardware — on the "
       "experiment sheet reproduced in Appendix D.", numbered=True)
bullet("Repeat the evaluation with the sensor channels disabled, to obtain the vision-only baseline "
       "against which the fusion gain is measured.", numbered=True)

para("The last item is the one that makes the contribution measurable. The claim of this project is not "
     "that a classifier can recognise waste — that has been demonstrated many times — but that fusing "
     "physical sensor evidence with a visual classifier improves the outcome on the classes where vision "
     "is weak. Without a vision-only baseline on the same items, that claim cannot be tested.")

table_caption("Classification results — to be completed from the logged test run")
table(["Class", "Support", "Precision", "Recall", "F1"],
      [["Biological / organic", "____", "____", "____", "____"],
       ["Paper, cardboard", "____", "____", "____", "____"],
       ["Plastic", "____", "____", "____", "____"],
       ["Glass", "____", "____", "____", "____"],
       ["Metal", "____", "____", "____", "____"],
       ["Battery, e-waste", "____", "____", "____", "____"],
       ["Clothes, shoes, general", "____", "____", "____", "____"],
       ["**Macro-F1**", "", "", "", "**____**"],
       ["**Overall accuracy**", "**____**", "", "", "**____**"]],
      [5.2, 2.4, 2.5, 2.5, 2.4], size=8.6)
placeholder_row_note()

h2("5.6  Preliminary Observation: Vision-Only Detection Log")
para("Although no trained model is available, one measurement of practical relevance does exist. A "
     "published pretrained waste classifier was run over a live camera feed at the prototype inlet for a "
     "period of approximately thirteen minutes, and every prediction was logged. That log is analysed in "
     "Section 6.2. It is reported here because it bears directly on the design of the fusion stage, and "
     "its principal finding is negative.")

para("Across 13,352 frames the model produced a detection in 12,810 frames, a detection rate of 95.94%. "
     "Of those 12,810 detections, 12,601 — 98.37% — were labelled as a single class. The mean confidence "
     "across all detections was approximately 0.49, and 70.92% of detections fell below a confidence of "
     "0.5. In other words, the model almost always found something, almost always called it the same "
     "thing, and was not confident about any of it.")

para("This is a failure, but it is an informative one. It shows that a general-purpose classifier trained "
     "on studio-lit product photographs does not transfer to the interior of a bin, and that the failure "
     "mode is not a diffuse confusion between similar classes but a collapse onto a single dominant one. "
     "It also shows why the architecture in Chapter 2 is justified: a system that trusted this classifier "
     "alone would route nearly everything to one compartment, whereas a system that consults the "
     "inductive and moisture sensors can at least reject the grossest errors. The measurement is "
     "reported honestly in Section 6.2, including the caveat that the model used was not trained by the "
     "authors.")

para("One qualification must be recorded. The pretrained model used for this observation was a published "
     "third-party model served over a network, not a model trained within this project. The observation "
     "therefore characterises the behaviour of that model on this feed; it does not characterise the "
     "fusion architecture, which has not yet been evaluated. It is presented as a motivation, not as a "
     "result of the present design.")

# ================================================================== CH 6
chapter(6, "Results and Discussion")

h2("6.1  Summary of Verification Status")
para("This chapter separates what has been verified from what has been designed. Table 11 is the "
     "operative summary: every quantitative statement made in this report is classified as measured, "
     "derived, or a target, and the distinction is maintained throughout the remainder of the document.")

table_caption("Verification status of every quantitative claim in this report")
table(["Quantity", "Value reported", "Status", "Basis"],
      [["Index angle per position", "90°", "Derived", "Four equally spaced positions on a circle"],
       ["Microstep resolution", "0.1125°", "Derived", "1.8° ÷ 16; 200-step motor on a DRV8825"],
       ["Required index repeatability", "0.5°", "Derived", "Section 3.5; from the 2.4 mm clearance"],
       ["Compartment centre radius", "112 mm", "Derived", "(380 − 156) / 2"],
       ["Gap between adjacent mouths", "2.4 mm", "Derived", "112√2 − 156"],
       ["Nominal total capacity", "approximately 28 litres", "Derived", "Four compartments at 7.1 litres"],
       ["Design cycle time", "3.2 s", "Measured", "Timed over the assembled unit"],
       ["Theoretical throughput", "1,125 items/h", "Derived", "3,600 ÷ 3.2"],
       ["Stored energy", "84 Wh", "Derived", "12 V × 7 Ah"],
       ["Detection rate, pretrained model", "95.94%", "Measured", "12,810 of 13,352 logged frames"],
       ["Class collapse, pretrained model", "98.37%", "Measured", "12,601 of 12,810 detections"],
       ["Mean confidence, pretrained model", "approximately 0.49", "Measured", "Weighted mean over the log"],
       ["Index repeatability achieved", "____°", "!!Pending", "Protocol in Section 3.5; not yet logged"],
       ["Classification accuracy", "____%", "!!Pending", "Protocol in Section 5.5; model not trained"],
       ["Inference latency on the Pi", "____ ms", "!!Pending", "Requires the trained model"],
       ["Battery runtime", "____ h", "!!Pending", "Requires a power log at the measured duty cycle"],
       ["Fusion gain over vision-only", "____ pts", "!!Pending", "Requires both evaluations on the same items"]],
      [5.0, 3.0, 2.2, 5.1], size=8.2, tag_col=2)
source_note("Measured: a logged observation exists and is reported here. Derived: computed from stated "
            "inputs by the arithmetic shown. Target: a design intention, quantified in Chapter 7 but not "
            "yet realised. Pending: the measurement is specified but has not been performed.")

h2("6.2  Analysis of the Preliminary Detection Log")
para("The log described in Section 5.6 is the only performance measurement available at this stage, and "
     "it rewards close reading. Table 12 gives the class distribution and Fig. 6 the corresponding "
     "confidence distribution.")

table_caption("Class distribution and confidence statistics from the preliminary detection log")
table(["Class", "Detections", "Share of detections", "Mean confidence", "Interpretation"],
      [["Paper", "12,601", "98.37%", "0.488", "Dominated the log; the collapse is onto this class"],
       ["Glass", "149", "1.16%", "0.497", "Occasional, at moderate confidence"],
       ["Cardboard", "26", "0.20%", "0.587", "Highest mean confidence of any class"],
       ["Plastic", "24", "0.19%", "0.445", "Lowest mean confidence; the class most worth recovering"],
       ["Metal", "10", "0.08%", "0.571", "Very rare, despite metal being visually distinctive"],
       ["**Total**", "**12,810**", "**100%**", "**0.489**", "Of 13,352 frames processed (95.94% had a detection)"]],
      [2.6, 2.4, 2.9, 3.0, 4.2], size=8.2)

figure("Fig_Detection_Log.png",
       "Preliminary detection log: (a) distribution of predicted classes; (b) distribution of "
       "confidence values across all detections.")

para("Four observations follow, and each has a consequence for the design.")

para("**The collapse is onto one class, not a diffuse confusion.** A model that confuses glass with "
     "plastic, and paper with cardboard, is behaving as one would expect from a weak classifier and can "
     "be improved with more data. A model that assigns 98.37% of its predictions to a single class is "
     "exhibiting a different failure: the decision boundary has moved so far that the other classes are "
     "effectively unreachable. The likely cause is a mismatch between the training distribution and the "
     "inference conditions — the interior of a bin is dim, close-focus and contains one object filling "
     "the frame, which is not what a product-photograph dataset contains.")

para("**The confidence is uniformly low.** A mean of 0.489 with 70.92% of predictions below 0.5 means "
     "the model is, in effect, reporting that it does not know. This is useful information rather than "
     "noise: a confidence threshold is a legitimate rejection criterion, and the distribution confirms "
     "that a threshold placed at 0.5 would have rejected most of what the model produced. The fusion "
     "stage of this project is built on precisely that principle.")

para("**Metal is almost never predicted, despite being physically distinctive.** Ten detections out of "
     "12,810 is not credible for a feed containing any metal at all. This is the clearest single argument "
     "for the inductive sensor: whatever the visual model is doing, it is not detecting metal, whereas a "
     "proximity sensor costing a few hundred rupees does so reliably.")

para("**The measurement was made with a model the authors did not train.** This limits what can be "
     "claimed. The log characterises that model on that feed; it does not characterise the architecture "
     "of this project. Its value here is diagnostic — it identifies the failure mode the design must "
     "survive — not comparative.")

h2("6.3  Discussion")
para("The results in this chapter are thin, and it would be a mistake to present them otherwise. Of the "
     "seventeen quantities in Table 11, four are measured, eight are derived, and five remain pending. "
     "The honest summary is that the mechanical and electrical design is complete and internally "
     "consistent, one informal performance measurement exists, and the central quantitative claim of the "
     "project — that fused sensing outperforms vision alone — has not yet been tested.")

para("Three points can nevertheless be made with confidence, because they follow from the design rather "
     "than from a measurement.")

para("First, the geometry closes. The four compartments fit the disc, they clear one another by 2.4 mm, "
     "and the tolerance required to keep the drop inside the intended mouth follows from that clearance "
     "by a one-line calculation. This sounds modest, but it is the calculation that determines whether "
     "the mechanism can work at all, and it is more than the earlier documents on this project "
     "established: they quoted a repeatability of 1.8° without checking it against the geometry, and "
     "1.8° is nearly three times the permissible error.")

para("Second, the decision logic is complete and it behaves conservatively. Every classifier output has a "
     "defined destination, hazardous material is never auto-sorted, and an uncertain item defaults to "
     "the residual stream rather than to a guess. The rule is designed so that its worst case is a "
     "missed opportunity rather than a contaminated stream.")

para("Third, the failure observed in Section 6.2 is the failure the design anticipates. A vision-only "
     "classifier collapsed onto a single class and reported low confidence while doing so. The "
     "architecture in Chapter 2 responds to exactly that condition: it consults the inductive and "
     "moisture sensors, overrides the camera where they disagree, and routes the remainder to residual. "
     "The design is therefore not weakened by the preliminary result; it is the reason for it.")

para("What is missing is the measurement that would close the argument. That is the subject of the next "
     "chapter, which states the targets, and of Chapter 8, which states when they will be tested.")

# ================================================================== CH 7
chapter(7, "Expected Impact and Design Targets")

para("This chapter is deliberately confined to targets. Nothing in it is a measured result, and the "
     "figures are stated with the basis on which they were set and the method by which they will later "
     "be verified. Separating them from Chapter 6 is the point: a target that is presented as an "
     "achievement is the most common form of overstatement in student project reports, and the "
     "distinction costs nothing to maintain.")

h2("7.1  Alignment with the Sustainable Development Goals")
para("The project contributes primarily to Goal 12, Responsible Consumption and Production, and "
     "specifically to Target 12.5, which calls for a substantial reduction in waste generation through "
     "prevention, reduction, recycling and reuse. By segregating at the point of disposal the unit "
     "increases the proportion of each stream that is recoverable, because material that never meets "
     "contamination retains its value downstream. The contribution is to the quality of the recyclable "
     "fraction rather than to the total quantity of waste generated, and that distinction should be "
     "stated clearly.")

para("The project also supports Goal 11, Sustainable Cities and Communities, through Target 11.6, which "
     "concerns the reduction of the adverse per capita environmental impact of cities, and Goal 13, "
     "Climate Action, indirectly, through the avoided emissions from landfill and from the transport of "
     "unsegregated waste. The telemetry described in Section 4.5 supports Target 11.6 more directly than "
     "the hardware does, because fill-level and composition data allow collection routes to be planned "
     "on evidence rather than on a fixed schedule.")

para("The alignment is a matter of design intent at this stage. No reduction in emissions or in "
     "collection cost has been measured, and none is claimed.")

h2("7.2  Design Targets and Their Basis")
para("Table 13 states the targets for the field phase. Each has a stated basis and a stated measurement "
     "method, so that the target is falsifiable rather than aspirational.")

table_caption("Design targets for the field phase, with basis and verification method")
table(["Quantity", "Target", "Basis for the target", "Verification method"],
      [["Overall classification accuracy", "≥ 85%", "Population-classifier performance reported for comparable waste corpora; conservative given in-house capture",
        "Held-out test split, per Section 5.5"],
       ["Fusion gain over vision-only", "≥ 8 percentage points", "The classes where vision is weakest in Section 6.2 are exactly those the inductive and moisture sensors resolve",
        "Paired evaluation with sensor channels disabled"],
       ["Index repeatability", "within 0.5°", "Section 3.5; from the 2.4 mm clearance", "Index-sensor log over 100 cycles"],
       ["Cycle time", "≤ 3.5 s per item", "Section 4.3; measured 3.2 s with margin", "Stopwatch over 50 consecutive items"],
       ["Battery runtime", "≥ 6 h at 60% duty cycle", "84 Wh stored energy; requires average draw ≤ 14 W", "Power log with a current logger"],
       ["Reporting uptime", "≥ 72 h continuous", "Longest plausible unattended period in a domestic setting", "Soak test with logged heartbeats"],
       ["Cost of goods", "≤ ₹19,000 per unit", "Appendix A; consistent with the price assumed in Section 7.4", "BOM at prototype and at 100-unit volume"],
       ["Residual rate", "≤ 15% of items", "Share of items for which no confident decision is possible; a lower rate indicates a working fusion rule", "Share of items routed to the residual compartment"]],
      [3.2, 2.4, 5.6, 4.1], size=8.2)

para("One target deserves comment. The residual rate — the proportion of items that the unit declines to "
     "classify confidently — is included deliberately, because a system can always achieve a high "
     "accuracy on the items it chooses to sort by sending everything else to residual. Reporting the "
     "residual rate alongside the accuracy makes that trade-off visible. A unit that achieves 90% "
     "accuracy while sending 40% of the stream to residual is less useful than one achieving 85% while "
     "sending 10%, and only the pair of figures distinguishes them.")

h2("7.3  Measurement Plan")
para("Five logs close every pending item in Table 11. Each is a few hours of work, and each converts an "
     "unsupported statement into a defended one. They are listed in the order in which they should be "
     "executed, because the later ones depend on the earlier.")

table_caption("Measurement plan")
table(["#", "Log", "Procedure", "Closes"],
      [["1", "Training and classification", "Train per Section 5.3, evaluate once on the held-out split, generate the matrix with the evaluation script rather than by hand",
        "Accuracy, macro-F1, per-class metrics"],
       ["2", "Index repeatability", "Home the disc, command each of four positions twenty-five times from a disturbed start, record encoder count and dial-gauge deviation",
        "The 0.5° specification"],
       ["3", "Cycle timing", "Time fifty consecutive items from trigger to return to standby; report mean and standard deviation",
        "The 3.2 s cycle and the throughput figure"],
       ["4", "Power and runtime", "Log voltage and current at idle, during inference and during actuation; compute Wh per cycle; extrapolate to 84 Wh",
        "Battery runtime"],
       ["5", "Fusion ablation", "Repeat log 1 with the sensor channels disabled, on the same items", "The fusion gain"]],
      [0.7, 3.3, 6.3, 5.0], size=8.2)

para("The experiment record sheet in Appendix D is used for each run. It records the model, the "
     "configuration, the date, the hardware and the operator, and it is the artefact that makes a "
     "reported number reproducible. A result without such a sheet is an assertion.")

h2("7.4  Economic Case")
para("The unit economics are derived rather than asserted, because the earlier documents on this project "
     "contained two revenue figures that differed by a factor of twenty-nine. The derivation begins with "
     "the bill of materials, which gives a component cost of approximately ₹18,500 at prototype volume. "
     "A selling price of ₹24,900 implies a gross margin of ₹6,500 per unit, or 26.1% — a thin margin for "
     "a hardware product, and one that reflects the cost of small-volume purchasing rather than a "
     "durable cost structure. At a hundred-unit volume the component cost should fall appreciably, and "
     "the margin with it; the sensitivity of the margin to volume is therefore part of the case rather "
     "than an afterthought.")

para("On the operating side, the assumptions are sixty units in the first year rising to twelve hundred "
     "in the fifth, with operating expenditure growing from ₹9 lakh to ₹48 lakh over the same period. On "
     "those assumptions the first year produces a negative EBITDA of ₹5.1 lakh, the second a negative "
     "₹2.3 lakh, and the third the first positive figure at ₹4.0 lakh. Cumulative EBITDA turns positive "
     "in the fourth year. Fig. 7 shows both series.")

figure("Fig_Financial_Projection.png",
       "Five-year projection: (a) annual revenue, gross margin and EBITDA; (b) cumulative EBITDA, which "
       "turns positive in Year 4.")

para("Two aspects of this projection should be stated rather than left for the reader to infer. The "
     "break-even is in the fourth year, not the second, and it is driven by operating expenditure rather "
     "than by gross margin — the business is gross-margin positive from the first year. And the capital "
     "requirement must be at least the startup cost of ₹8 lakh plus the cumulative operating deficit of "
     "approximately ₹7.4 lakh, so a seed requirement of the order of ₹15 lakh is implied; a request for "
     "₹5 lakh, as in the earlier draft, would not fund the plan as written.")

para("The market framing is given in Appendix A of the accompanying specification document and is not "
     "reproduced here. In summary, the addressable population is best measured in households rather than "
     "in individuals, since a bin is sold per dwelling or per institution, and the earlier estimate of "
     "the Chennai population as 250,000 was an error of more than an order of magnitude against the "
     "census figure of 4,646,732.")

# ================================================================== CH 8
chapter(8, "Prototype Status and Roadmap")

h2("8.1  Current State of the Prototype")
para("The mechanical assembly is complete and operates: the discs rotate under firmware control, the "
     "index positions are reachable, the compartments detach, and the sensing array is mounted and "
     "wired. The electrical architecture is complete and the firmware implements the six-state machine. "
     "What is not complete is the classification stage, and because the classification stage is what "
     "supplies the input to the fusion rule, the end-to-end behaviour of the unit has not yet been "
     "demonstrated.")

para("This is a normal state for a project of this scope at this point in the year, and it is worth "
     "saying so plainly. The sequence of work in a hardware project of this kind is design, build, "
     "instrument, measure. The project has completed design and build and is at the start of the "
     "instrumentation phase. The remaining work is bounded and is set out below.")

table_caption("Remaining work to demonstration")
table(["Task", "Depends on", "Estimated effort", "Deliverable"],
      [["Train the classifier to the fixed protocol", "Dataset prepared and split", "4–6 h of compute", "Checkpoint and validation curve"],
       ["Evaluate on the held-out split", "Trained checkpoint", "2 h", "Confusion matrix and per-class metrics"],
       ["Export to TFLite and benchmark on the Pi", "Trained checkpoint", "4 h", "Median inference latency"],
       ["Tune the fusion threshold τ", "Classification metrics and sensor calibration", "3 h", "A stated value of τ with justification"],
       ["Run the fusion ablation", "Trained checkpoint and sensor calibration", "4 h", "Fusion gain in percentage points"],
       ["Log index repeatability over 100 cycles", "Working mechanism", "3 h", "Repeatability distribution"],
       ["Log power and derive runtime", "Working unit", "3 h", "Runtime at the measured duty cycle"],
       ["Build the operator dashboard", "Telemetry link", "2–3 days", "Live view of state, fill level and log"]],
      [4.6, 3.6, 2.6, 4.5], size=8.2)

h2("8.2  Phase Plan for Demonstration")
para("The demonstration is planned in three phases, each of which produces something that can be shown "
     "independently of the others. This matters because a single end-to-end demonstration that fails at "
     "any point shows nothing, whereas three staged demonstrations each show something and localise any "
     "failure.")

para("**Phase 1 — Mechanism and control.** The disc indexes to each of the four positions on command, "
     "the index sensor confirms position, and the cycle timing is logged. This phase requires no trained "
     "model and can be demonstrated as soon as the repeatability and timing logs are complete. It "
     "establishes that the mechanical thesis of the project works.")

para("**Phase 2 — Classification and fusion.** The trained model runs on the controller and the fusion "
     "rule routes items to the correct compartment. The ablation is demonstrated by disabling the sensor "
     "channels, which allows the fusion gain to be shown live rather than merely tabulated. This phase "
     "establishes the contribution of the project.")

para("**Phase 3 — Telemetry and dashboard.** The unit publishes state transitions, outcomes and fill "
     "levels to a dashboard, and the log can be exported for analysis. This phase establishes the "
     "monitoring case and supplies the operational data for the municipal argument in Section 7.1.")

para("The dashboard is deliberately scheduled last. It is the most visible element of a demonstration and "
     "the least technically demanding, and there is a natural temptation to build it first because it "
     "photographs well. Doing so would produce a system that displays data it cannot yet justify. The "
     "order above ensures that every displayed quantity has a measurement behind it.")

# ================================================================== CH 9
chapter(9, "Conclusion and Future Scope")

h2("9.1  Conclusion")
para("This report has presented the design and development of a four-stream waste segregation unit that "
     "combines a dual carousel disc mechanism with multi-sensor material discrimination and a "
     "vision-based classifier. The mechanical design is complete: a 750 mm by 450 mm envelope, four "
     "Ø156 mm by 370 mm detachable compartments arranged at 90° intervals on a 112 mm centre radius, and "
     "a pair of Ø380 mm ABS discs that index the waste to the selected compartment. The control "
     "architecture is specified down to the interface and implemented as a six-state machine with four "
     "concurrent tasks and explicit fault handling. The decision logic that maps ten material classes "
     "onto four physical streams is defined, including a fail-safe path for hazardous and "
     "low-confidence items.")

para("The principal analytical contribution of the report is the tolerance derivation in Section 3.5. "
     "The geometry of four Ø156 mm compartments beneath a Ø380 mm disc permits only 2.4 mm of clearance "
     "between adjacent mouths, which restricts the angular error at the compartment centre radius to "
     "0.61°. The mechanism is accordingly specified to 0.5°, and since a 200-step motor on a 1/16 "
     "microstepping driver resolves 0.1125°, the constraint is identified as backlash and coupling "
     "compliance rather than resolution. Earlier documents on this project specified 1.8° without "
     "performing this check; 1.8° exceeds the available clearance by a factor of nearly three.")

para("No classification accuracy is reported, because the classifier has not been trained. This "
     "omission is deliberate. One preliminary measurement does exist: a published pretrained model, run "
     "on a live feed at the inlet, returned a detection in 95.94% of 13,352 frames but assigned 98.37% of "
     "those detections to a single class, at a mean confidence of approximately 0.49. That is a failure "
     "of transfer from studio imagery to the interior of a bin, and it is precisely the failure that the "
     "fusion architecture is designed to survive. The measurement is reported for what it is — a "
     "diagnostic of the problem, not a result of the design.")

para("The evaluation protocol that will close the remaining gap is fully specified, and the code to "
     "execute it exists. Five measurements — classification metrics, index repeatability, cycle timing, "
     "power draw and a fusion ablation — would convert every pending entry in Table 11 into a reported "
     "one. Until they are made, this report claims the design and not the performance.")

h2("9.2  Future Scope")
para("The immediate work is the sequence in Table 15: train, evaluate, export, calibrate, ablate, and "
     "log the mechanical and electrical quantities. Beyond that, four directions are worth recording.")
bullet("**A comparative model benchmark.** The choice of YOLOv8-cls is presently a rationale rather than "
       "a result. A benchmark against MobileNetV3, ResNet-50 and EfficientNet-B0 on the same split, "
       "measuring both accuracy and latency on the controller, would either confirm the choice or "
       "overturn it, and either outcome is useful.")
bullet("**A short-range near-infrared channel.** The preliminary log shows that glass, plastic and metal "
       "are poorly separated by visible-light imagery. A near-infrared reflectance measurement "
       "distinguishes these materials by their spectral signature at modest cost, and would address the "
       "weakest part of the current sensor set.")
bullet("**Volume and mass instrumentation.** The present fill estimate is derived from item count and "
       "mass. A cheaper and more accurate approach is a time-of-flight depth measurement per compartment, "
       "which would also detect bridging and compaction.")
bullet("**Field trial with route integration.** The municipal case rests on the claim that fill-level and "
       "composition data allow collection to be scheduled on evidence. That claim is testable only in "
       "the field, over a period long enough to observe a full cycle of collection, and it is the natural "
       "subject of a subsequent project.")

# ================================================================== REFERENCES
page_break()
p = doc.add_paragraph(style="Heading 1")
r = p.add_run("REFERENCES")
doc.add_paragraph()

REFS = [
    ("Ahmed, T., Rahman, M., and Qureshi, A.", "Smart waste management: a paradigm shift enabled by "
     "artificial intelligence", "Waste Management Bulletin", "vol. 2, no. 3, pp. 244–263", 2024),
    ("Afolalu, S., Ajayi, O., and Olayanju, T.", "Development of a smart waste bin for solid waste "
     "management", "International Journal of Sustainable Development and Planning",
     "vol. 16, no. 4, pp. 745–754", 2021),
    ("Cai, Y., Xu, C., and Zhang, H.", "An intelligent waste-sorting and recycling device based on an "
     "improved EfficientNet", "International Journal of Environmental Research and Public Health",
     "vol. 19, no. 15987, pp. 1–17", 2022),
    ("Chen, J., Li, X., and Zhao, W.", "Artificial intelligence-based e-waste management for "
     "environmental planning", "Environmental Impact Assessment Review", "vol. 87, art. 106556", 2021),
    ("Debdas, D., Rajesh, V., and Kaur, J.", "AI-driven sustainable waste management framework",
     "Cleaner Engineering and Technology", "vol. 9, pp. 100–118", 2022),
    ("Holanda Filho, R., Souza, L., and Silva, P.", "IoT-based real-time waste classification framework",
     "Applied Sciences", "vol. 13, no. 3943, pp. 1–15", 2023),
    ("Hussain, M., Bano, S., and Yaseen, Z.", "Waste management and prediction of air pollutants using "
     "IoT and machine learning", "Energies", "vol. 13, no. 3930, pp. 1–16", 2023),
    ("Ismail, M. Z., Rahim, S. K., and Fadhlullah, S. Y.", "Optimized deep learning-based e-waste "
     "management in an IoT application", "Cybernetics and Systems", "vol. 54, no. 1, pp. 112–132", 2023),
    ("Kaya, V.", "Classification of waste materials with a smart garbage system for sustainable "
     "development: a novel model", "Frontiers in Environmental Science",
     "vol. 11, art. 1228732, pp. 1–12", 2023),
    ("Koskinopoulou, M., Georgiou, E., and Papadopoulos, C.", "Robotic waste sorting: advances and "
     "opportunities", "IEEE Robotics and Automation Magazine", "vol. 28, no. 4, pp. 85–97", 2021),
    ("Longo, E., Lombardi, L., and Montanaro, T.", "A 5G-enabled smart waste management system for a "
     "university campus", "Sensors", "vol. 21, no. 7319, pp. 1–18", 2021),
    ("Mounadel, A., El Hani, S., and Abouelabbes, L.", "Application of artificial intelligence "
     "techniques in municipal solid waste management", "Environmental Technology Reviews",
     "vol. 12, no. 1, pp. 99–115", 2023),
    ("Mousavi, S., Hosseinzadeh, A., and Golzary, A.", "Smart waste collection systems: a review of "
     "optimization and IoT integration", "Science of the Total Environment",
     "vol. 886, art. 163925", 2023),
    ("Nafiz, M. S., Rahman, T., and Alam, S.", "ConvoWaste: an automatic waste segregation machine "
     "using deep learning", "Proc. Int. Conf. on Robotics, Electrical and Signal Processing Techniques "
     "(ICREST)", "Dhaka, Bangladesh, pp. 412–417", 2023),
    ("Rahman, M. W., Iqbal, T., and Chowdhury, F.", "Intelligent waste management system using deep "
     "learning with IoT", "Journal of King Saud University – Computer and Information Sciences",
     "vol. 36, no. 1, pp. 114–125", 2024),
    ("Redmon, J., and Farhadi, A.", "YOLOv3: an incremental improvement",
     "arXiv preprint", "arXiv:1804.02767", 2018),
    ("Shi, C., Wu, J., and Zhang, Y.", "Waste classification using multilayer hybrid convolution neural "
     "networks", "Applied Sciences", "vol. 11, no. 17, pp. 7895–7908", 2021),
    ("Suvarnamma, G., and Pradeepkiran, G.", "SmartBin system with waste tracking and sorting mechanism "
     "using IoT", "Cleaner Engineering and Technology", "vol. 3, art. 100114", 2021),
    ("Thiagarajah, S., Kumar, R., and Vimal, P.", "Deep learning-based solid waste segregation system",
     "Engineering, Technology & Applied Science Research", "vol. 13, no. 3, pp. 10439–10446", 2023),
    ("Vishnu, S., Ramesh, K., and Raj, R.", "IoT-enabled solid waste management in smart cities",
     "Smart Cities", "vol. 4, no. 3, pp. 1004–1017", 2021),
    ("Jocher, G., et al.", "Ultralytics YOLOv8: a state-of-the-art real-time object detection and image "
     "classification framework", "Ultralytics software documentation", "accessed October 2026", 2023),
    ("Thung, G., and Ruchiranga, M.", "Classification of trash for recyclability status",
     "Stanford University CS229 project report", "Stanford, CA", 2016),
]

for i, (authors, title, venue, loc, year) in enumerate(REFS, 1):
    p = doc.add_paragraph()
    p.paragraph_format.space_after = Pt(6)
    p.paragraph_format.line_spacing = 1.2
    p.paragraph_format.left_indent = Cm(1.0)
    p.paragraph_format.first_line_indent = Cm(-1.0)
    p.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY
    r = p.add_run(f"[{i}]\t")
    r.font.size = Pt(10)
    r.bold = True
    r = p.add_run(f"{authors}, ")
    r.font.size = Pt(10)
    r = p.add_run(f"“{title},” ")
    r.font.size = Pt(10)
    r.italic = True
    r = p.add_run(f"{venue}, {loc}, {year}.")
    r.font.size = Pt(10)

# ================================================================== APPENDIX A
page_break()
p = doc.add_paragraph(style="Heading 1")
r = p.add_run("APPENDIX A — BILL OF MATERIALS")
r.bold = True
r.font.size = Pt(13)
r.font.color.rgb = NAVY
p = doc.add_paragraph()
doc.add_paragraph()

para("The table below gives the prototype bill of materials and the component cost on which the price "
     "and margin in Section 7.4 are based. Costs are indicative at single-unit purchase in Chennai and "
     "should be replaced with actual invoices before the figure is quoted as fact.")

table_caption("Prototype bill of materials")
table(["Item", "Specification", "Qty", "Unit cost (₹)", "Extended (₹)"],
      [["Single-board computer", "Raspberry Pi 4 Model B, 4 GB", "1", "5,000", "5,000"],
       ["Camera module", "OV5647, 5 MP, CSI", "1", "800", "800"],
       ["Stepper motor", "NEMA 17, 1.8°, 1.7 A/phase", "1", "1,200", "1,200"],
       ["Stepper driver", "DRV8825 module", "1", "400", "400"],
       ["Battery and management", "12 V 7 Ah Li-ion, 3S, with BMS", "1", "2,000", "2,000"],
       ["Buck converter", "12 V to 5 V, 5 A, synchronous", "1", "450", "450"],
       ["Analogue front end", "ADS1115, 16-bit, I²C", "1", "250", "250"],
       ["Moisture probe", "Resistive, stainless", "1", "250", "250"],
       ["Capacitive sensor", "LJC18A3-H-Z/BX", "1", "450", "450"],
       ["Inductive sensor", "LJ12A3-4-Z/BX", "1", "450", "450"],
       ["Time-of-flight", "VL53L0X", "1", "350", "350"],
       ["Load cell and amplifier", "5 kg bar + HX711", "1", "450", "450"],
       ["Gas sensor", "MQ-135", "1", "150", "150"],
       ["Index sensor", "Optical or hall, with magnet", "1", "200", "200"],
       ["Carousel discs", "ABS, Ø380 × 18 mm, machined", "2", "1,400", "2,800"],
       ["Compartments", "HDPE, Ø156 × 370 mm", "4", "350", "1,400"],
       ["Frame and body", "Mild steel, powder coated", "1 set", "1,800", "1,800"],
       ["Printed brackets", "PLA, 3D printed", "1 set", "600", "600"],
       ["Coupling and hub", "Aluminium, machined", "1", "500", "500"],
       ["Wiring, connectors, fasteners", "Assorted", "1 set", "800", "800"],
       ["**Total component cost**", "", "", "", "**≈ 18,500**"]],
      [4.2, 5.0, 1.1, 2.3, 2.4], size=8.2)
source_note("At a hundred-unit volume the component cost is expected to fall by 20–30%, principally on "
            "the machined discs, the frame and the printed parts. The margin in Section 7.4 is computed "
            "at prototype cost and is therefore conservative.")

# ================================================================== APPENDIX B
page_break()
p = doc.add_paragraph(style="Heading 1")
r = p.add_run("APPENDIX B — DATASET PROVENANCE AND SPLIT")
r.bold = True
r.font.size = Pt(13)
r.font.color.rgb = NAVY
p = doc.add_paragraph()
doc.add_paragraph()

para("This appendix records the composition of the training corpus and the split applied to it, so that "
     "the reported metrics can be reproduced. It is completed from the output of the preparation script "
     "and is the artefact referenced in Section 5.1.")

table_caption("Per-class composition after cleaning")
table(["Class", "Source(s)", "Total images", "Training (80%)", "Validation (20%)"],
      [["Biological / organic", "Kaggle, in-house", "____", "____", "____"],
       ["Paper, cardboard", "TrashNet, in-house", "____", "____", "____"],
       ["Plastic", "TrashNet, in-house", "____", "____", "____"],
       ["Glass", "TrashNet, in-house", "____", "____", "____"],
       ["Metal", "TrashNet, in-house", "____", "____", "____"],
       ["Battery, e-waste", "TACO, in-house", "____", "____", "____"],
       ["Clothes, shoes, general", "Kaggle, TACO", "____", "____", "____"],
       ["**Total**", "", "**____**", "**____**", "**____**"]],
      [4.6, 3.6, 2.4, 2.4, 2.4], size=8.4)
placeholder_row_note()

para("Controls applied during preparation: the split is stratified by class; the random seed is fixed at "
     "42; the split is performed at file level before augmentation, so no augmented copy of a training "
     "image can appear in the validation set; and duplicate and corrupt files are removed before "
     "splitting, with the number removed recorded.")

# ================================================================== APPENDIX C
page_break()
p = doc.add_paragraph(style="Heading 1")
r = p.add_run("APPENDIX C — METRIC DEFINITIONS")
r.bold = True
r.font.size = Pt(13)
r.font.color.rgb = NAVY
p = doc.add_paragraph()
doc.add_paragraph()

para("All classification metrics in this report are computed from the confusion matrix C, where C[i][j] "
     "is the number of items whose true class is i and whose predicted class is j. The row sum n_i = "
     "Σ_j C[i][j] is the support of class i.")

table_caption("Definitions used throughout Chapter 5 and Chapter 6")
table(["Quantity", "Definition", "Reading"],
      [["Accuracy", "Σ_i C[i][i] / Σ_i n_i", "Dominated by the largest classes when supports are unequal"],
       ["Precision (class i)", "C[i][i] / Σ_k C[k][i]", "Of the items called i, the proportion that were i"],
       ["Recall (class i)", "C[i][i] / n_i", "Of the items that were i, the proportion that were found"],
       ["F1 (class i)", "2PR / (P + R)", "Harmonic mean; punishes a large gap between precision and recall"],
       ["Macro-F1", "Unweighted mean of per-class F1", "Treats every class equally; the fairer aggregate under imbalance"],
       ["Support", "n_i", "Must be reported with every per-class figure"],
       ["Detection rate", "Frames with any object / total frames", "**Not** an accuracy; says nothing about correctness"],
       ["Residual rate", "Items routed to residual / total items", "The complement of the accuracy claim; report alongside it"],
       ["Fusion gain", "Accuracy(fused) − Accuracy(vision only)", "Measured on the same item set, sensor channels disabled"]],
      [3.2, 4.6, 7.0], size=8.2)

para("Two conventions are applied without exception. A per-class metric is never reported without its "
     "support, because a precision of 0.99 computed over four items is not comparable with one computed "
     "over four hundred. And an aggregate figure is never reported alone, because the aggregate can "
     "conceal a class that is never correctly identified.")

# ================================================================== APPENDIX D
page_break()
p = doc.add_paragraph(style="Heading 1")
r = p.add_run("APPENDIX D — EXPERIMENT RECORD SHEET")
r.bold = True
r.font.size = Pt(13)
r.font.color.rgb = NAVY
p = doc.add_paragraph()
doc.add_paragraph()

para("One sheet is completed for every reported measurement. A result without a sheet is an assertion and "
     "is not reported. The fields below are the minimum set.")

table_caption("Experiment record sheet")
table(["Field", "Entry"],
      [["Experiment ID and title", "____"],
       ["Date and operator", "____"],
       ["Model file and version", "____"],
       ["Training configuration (epochs, resolution, batch, seed)", "____"],
       ["Hardware and power mode", "____"],
       ["Inference runtime and quantisation", "____"],
       ["Test set size and per-class support", "____"],
       ["Confusion matrix reference (file name)", "____"],
       ["Computed metrics (macro-F1, accuracy)", "____"],
       ["Sensor calibration date and offset", "____"],
       ["Ambient conditions (lighting, temperature)", "____"],
       ["Anomalies observed during the run", "____"],
       ["Signature", "____"]],
      [7.6, 7.2], size=8.6, zebra=False)

# ================================================================== APPENDIX E
page_break()
p = doc.add_paragraph(style="Heading 1")
r = p.add_run("APPENDIX E — KEY PERFORMANCE INDICATORS")
r.bold = True
r.font.size = Pt(13)
r.font.color.rgb = NAVY
p = doc.add_paragraph()
doc.add_paragraph()

h3("E.1  Research and professional practice")
table(["Item", "Detail"],
      [["Paper publication", "“Development of IoT-Enabled Waste Segregation System Using Carousel Disc "
        "Mechanism and AI-Driven Image Recognition”, 5th Indian International Conference on Industrial "
        "Engineering and Operations Management (IEOM), Vellore, 6–8 November 2025"],
       ["Technical documentation", "Technical audit and carry-forward specification prepared for the "
        "project, covering verification of all reported metrics and the design of the current evaluation "
        "protocol"],
       ["Repository", "github.com/Jaganravi131/Smart_waste_classifier_Model — training, evaluation and "
        "deployment scripts for the classification stage"]],
      [3.6, 11.2], size=8.6, zebra=False)

h3("E.2  Competitions and recognition")
table(["Item", "Detail"],
      [["Solveathon 4.0, 2025", "Shortlisted for the second round"],
       ["Innovathon 4.0, 2026", "Shortlisted for the second round"],
       ["Project progression", "The problem statement has been carried forward continuously since "
        "Ideathon 4.0 through Solveathon 4.0 and Innovathon 4.0"]],
      [3.6, 11.2], size=8.6, zebra=False)

h3("E.3  Project metrics at the time of writing")
table(["Metric", "Value", "Status"],
      [["Design cycle time", "3.2 s per item", "Measured"],
       ["Theoretical throughput", "1,125 items per hour", "Derived"],
       ["Streams segregated", "Four, plus a fail-safe residual path", "Built"],
       ["Classification accuracy", "____", "Pending training run"],
       ["Index repeatability", "____", "Pending log"],
       ["Battery runtime", "____", "Pending power log"],
       ["Component cost", "approximately ₹18,500", "Estimated from BOM"]],
      [5.6, 5.2, 4.0], size=8.6)
source_note("E.3 replaces the blank KPI rows of the earlier report. Every row is either filled with a "
            "traceable value or explicitly marked pending; none is left blank without explanation.")

build_footer()

# make Word refresh TOC / LOF / LOT / SEQ fields when the document is opened
settings = doc.settings.element
uf = settings.find(qn("w:updateFields"))
if uf is None:
    uf = OxmlElement("w:updateFields")
    uf.set(qn("w:val"), "true")
    settings.append(uf)

os.makedirs(OUTDIR, exist_ok=True)
out = os.path.join(OUTDIR, "BinGenie_Sem_Report.docx")
doc.save(out)
print("saved:", out)
print("figures:", len(FIGURES), " tables:", len(TABLES))
