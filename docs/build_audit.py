#!/usr/bin/env python3
"""
Builds: docs/IDFP_BinGenie_Technical_Audit.docx
Audit of (1) IEOM Conference Full Paper_142 and (2) IDFP Lab Report (previous semester).
"""
import os
from docx import Document
from docx.shared import Pt, Cm, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_BREAK
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.enum.section import WD_SECTION
from docx.oxml.ns import qn
from docx.oxml import OxmlElement

NAVY = RGBColor(0x1F, 0x38, 0x64)
RED = RGBColor(0xA6, 0x1B, 0x1B)
GREEN = RGBColor(0x1E, 0x60, 0x33)
GREY = RGBColor(0x40, 0x40, 0x40)
BODY = "Times New Roman"
TBL = "Calibri"

doc = Document()

# ---------------------------------------------------------------- base styles
st = doc.styles["Normal"]
st.font.name = BODY
st.font.size = Pt(11)
st.element.rPr.rFonts.set(qn("w:eastAsia"), BODY)
pf = st.paragraph_format
pf.space_after = Pt(6)
pf.line_spacing = 1.15
pf.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY

sec = doc.sections[0]
sec.page_height, sec.page_width = Cm(29.7), Cm(21.0)
sec.top_margin = Cm(2.2)
sec.bottom_margin = Cm(2.0)
sec.left_margin = Cm(2.2)
sec.right_margin = Cm(2.2)

USABLE = 16.6  # cm


def shade(cell, hexcolor):
    tcPr = cell._tc.get_or_add_tcPr()
    el = OxmlElement("w:shd")
    el.set(qn("w:val"), "clear")
    el.set(qn("w:color"), "auto")
    el.set(qn("w:fill"), hexcolor)
    tcPr.append(el)


def cell_margins(table, top=40, bottom=40, left=70, right=70):
    tblPr = table._tbl.tblPr
    mar = OxmlElement("w:tblCellMar")
    for tag, val in (("top", top), ("left", left), ("bottom", bottom), ("right", right)):
        e = OxmlElement(f"w:{tag}")
        e.set(qn("w:w"), str(val))
        e.set(qn("w:type"), "dxa")
        mar.append(e)
    tblPr.append(mar)


def fixed_layout(table, total_cm):
    """Force fixed layout so the widths given survive Word's autofit."""
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


def repeat_header(row):
    trPr = row._tr.get_or_add_trPr()
    e = OxmlElement("w:tblHeader")
    e.set(qn("w:val"), "true")
    trPr.append(e)


def no_split(row):
    trPr = row._tr.get_or_add_trPr()
    e = OxmlElement("w:cantSplit")
    e.set(qn("w:val"), "true")
    trPr.append(e)


def h1(text, pagebreak=False):
    if pagebreak:
        doc.add_paragraph().add_run().add_break(WD_BREAK.PAGE)
    p = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(10)
    p.paragraph_format.space_after = Pt(6)
    p.paragraph_format.keep_with_next = True
    p.paragraph_format.alignment = WD_ALIGN_PARAGRAPH.LEFT
    r = p.add_run(text.upper())
    r.bold = True
    r.font.size = Pt(13)
    r.font.color.rgb = NAVY
    r.font.name = BODY
    # bottom rule
    pPr = p._p.get_or_add_pPr()
    pbdr = OxmlElement("w:pBdr")
    b = OxmlElement("w:bottom")
    b.set(qn("w:val"), "single")
    b.set(qn("w:sz"), "8")
    b.set(qn("w:space"), "2")
    b.set(qn("w:color"), "1F3864")
    pbdr.append(b)
    pPr.append(pbdr)
    return p


def h2(text):
    p = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(10)
    p.paragraph_format.space_after = Pt(4)
    p.paragraph_format.keep_with_next = True
    p.paragraph_format.alignment = WD_ALIGN_PARAGRAPH.LEFT
    r = p.add_run(text)
    r.bold = True
    r.font.size = Pt(11.5)
    r.font.color.rgb = NAVY
    return p


def para(text, size=11, italic=False, align="just", space_after=6, bold=False, color=None, indent=0):
    p = doc.add_paragraph()
    p.paragraph_format.space_after = Pt(space_after)
    p.paragraph_format.left_indent = Cm(indent)
    p.alignment = {"just": WD_ALIGN_PARAGRAPH.JUSTIFY, "left": WD_ALIGN_PARAGRAPH.LEFT,
                   "center": WD_ALIGN_PARAGRAPH.CENTER}[align]
    # simple **bold** support
    chunks = text.split("**")
    for i, c in enumerate(chunks):
        if not c:
            continue
        r = p.add_run(c)
        r.bold = bold or (i % 2 == 1)
        r.italic = italic
        r.font.size = Pt(size)
        if color is not None:
            r.font.color.rgb = color
    return p


def bullet(text, size=10.5, level=0):
    p = doc.add_paragraph(style="List Bullet")
    p.paragraph_format.space_after = Pt(2)
    p.paragraph_format.left_indent = Cm(0.75 + 0.55 * level)
    p.paragraph_format.first_line_indent = Cm(-0.45)
    p.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY
    chunks = text.split("**")
    for i, c in enumerate(chunks):
        if not c:
            continue
        r = p.add_run(c)
        r.bold = i % 2 == 1
        r.font.size = Pt(size)
    return p


def caption(text):
    p = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(8)
    p.paragraph_format.space_after = Pt(3)
    p.paragraph_format.keep_with_next = True
    p.alignment = WD_ALIGN_PARAGRAPH.LEFT
    r = p.add_run(text)
    r.bold = True
    r.font.size = Pt(9)
    r.font.color.rgb = NAVY
    r.font.name = TBL
    return p


def note(text):
    p = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(2)
    p.paragraph_format.space_after = Pt(8)
    p.alignment = WD_ALIGN_PARAGRAPH.LEFT
    r = p.add_run(text)
    r.italic = True
    r.font.size = Pt(8)
    r.font.color.rgb = GREY
    r.font.name = TBL
    return p


def table(headers, rows, widths, size=8, head_fill="1F3864", zebra=True, severity_col=None):
    t = doc.add_table(rows=1, cols=len(headers))
    t.style = "Table Grid"
    t.alignment = WD_TABLE_ALIGNMENT.CENTER
    t.autofit = False
    cell_margins(t)
    hdr = t.rows[0]
    repeat_header(hdr)
    no_split(hdr)
    for j, htxt in enumerate(headers):
        c = hdr.cells[j]
        c.width = Cm(widths[j])
        c.text = ""
        p = c.paragraphs[0]
        p.alignment = WD_ALIGN_PARAGRAPH.LEFT
        p.paragraph_format.space_after = Pt(0)
        p.paragraph_format.line_spacing = 1.0
        r = p.add_run(htxt)
        r.bold = True
        r.font.size = Pt(size)
        r.font.name = TBL
        r.font.color.rgb = RGBColor(0xFF, 0xFF, 0xFF)
        shade(c, head_fill)
    for i, row in enumerate(rows):
        cells = t.add_row().cells
        no_split(t.rows[-1])
        for j, val in enumerate(row):
            c = cells[j]
            c.width = Cm(widths[j])
            c.text = ""
            p = c.paragraphs[0]
            p.alignment = WD_ALIGN_PARAGRAPH.LEFT
            p.paragraph_format.space_after = Pt(0)
            p.paragraph_format.line_spacing = 1.0
            txt = str(val)
            bold = False
            color = None
            if txt.startswith("!!"):
                txt = txt[2:]
                bold = True
                color = RED
            chunks = txt.split("**")
            for k, ch in enumerate(chunks):
                if not ch:
                    continue
                r = p.add_run(ch)
                r.bold = bold or (k % 2 == 1)
                r.font.size = Pt(size)
                r.font.name = TBL
                if color is not None:
                    r.font.color.rgb = color
        if zebra and i % 2 == 1:
            for j in range(len(row)):
                shade(cells[j], "EEF1F7")
        if severity_col is not None:
            sv = str(row[severity_col]).replace("!!","")
            fill = None
            if sv.startswith("BLOCKER"):
                fill = "F8D7DA"
            elif sv.startswith("MAJOR"):
                fill = "FFF0CC"
            elif sv.startswith("MINOR"):
                fill = "E2EFDA"
            elif sv.startswith("OK"):
                fill = "D9EAD3"
            elif sv.startswith("GAP"):
                fill = "DEEAF6"
            if fill:
                shade(cells[severity_col], fill)
    fixed_layout(t, sum(widths))
    # fix column widths on every cell + grid
    tbl = t._tbl
    grid = tbl.tblGrid
    for j, gc in enumerate(grid.findall(qn("w:gridCol"))):
        gc.set(qn("w:w"), str(int(widths[j] * 567)))
    for row in t.rows:
        for j, c in enumerate(row.cells):
            c.width = Cm(widths[j])
    return t


def add_footer_page_numbers():
    footer = sec.footer
    p = footer.paragraphs[0]
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r = p.add_run("Technical Audit  |  BinGenie — Waste Segregating Smart Bin  |  Page ")
    r.font.size = Pt(8)
    r.font.name = TBL
    r.font.color.rgb = GREY
    fld = OxmlElement("w:fldSimple")
    fld.set(qn("w:instr"), "PAGE")
    run = OxmlElement("w:r")
    rPr = OxmlElement("w:rPr")
    sz = OxmlElement("w:sz"); sz.set(qn("w:val"), "16"); rPr.append(sz)
    run.append(rPr)
    t = OxmlElement("w:t"); t.text = "1"; run.append(t)
    fld.append(run)
    p._p.append(fld)
    r2 = p.add_run(" of ")
    r2.font.size = Pt(8)
    r2.font.name = TBL
    fld2 = OxmlElement("w:fldSimple")
    fld2.set(qn("w:instr"), "NUMPAGES")
    run2 = OxmlElement("w:r")
    t2 = OxmlElement("w:t"); t2.text = "1"; run2.append(t2)
    fld2.append(run2)
    p._p.append(fld2)


add_footer_page_numbers()

# ============================================================ COVER
for _ in range(3):
    doc.add_paragraph()

p = doc.add_paragraph(); p.alignment = WD_ALIGN_PARAGRAPH.CENTER
r = p.add_run("TECHNICAL AUDIT OF THE PROJECT DOCUMENTATION")
r.bold = True; r.font.size = Pt(20); r.font.color.rgb = NAVY

p = doc.add_paragraph(); p.alignment = WD_ALIGN_PARAGRAPH.CENTER
p.paragraph_format.space_before = Pt(2)
r = p.add_run("Verification of every metric, table and claim in the\nIEOM Conference Paper and the previous-semester IDP Lab Report")
r.font.size = Pt(12); r.italic = True; r.font.color.rgb = GREY

doc.add_paragraph()
p = doc.add_paragraph(); p.alignment = WD_ALIGN_PARAGRAPH.CENTER
r = p.add_run("BIN GENIE")
r.bold = True; r.font.size = Pt(26); r.font.color.rgb = NAVY
p = doc.add_paragraph(); p.alignment = WD_ALIGN_PARAGRAPH.CENTER
r = p.add_run("Waste Segregating Smart Bin\nIoT-Enabled Waste Segregation using a Carousel Disc Mechanism and AI-Driven Image Recognition")
r.font.size = Pt(11); r.font.color.rgb = GREY

for _ in range(3):
    doc.add_paragraph()

rows = [
    ("Purpose", "Pre-submission integrity check. Identifies metrics that are numerically\nimpossible, mutually contradictory, or not reachable with the stated\nhardware, dataset and test plan."),
    ("Source 1", "IEOM Conference Full Paper_142 — “Development of IoT-Enabled Waste\nSegregation System Using Carousel Disc Mechanism and AI-Driven Image\nRecognition”, 5th Indian International Conference on IEOM, Vellore, 6–8 Nov 2025 (12 pp.)"),
    ("Source 2", "IDFP Lab Report — “Waste Segregating Smart Bin (BinGenie)”, Innovative\nDesign and Fabrication Project 20MUPJ601, dated May 2026 (43 pp.)"),
    ("Output", "One consolidated issue register + a single master value ledger that the\ncurrent-semester report must be built from."),
]
t = doc.add_table(rows=0, cols=2); t.style = "Table Grid"; t.autofit = False
cell_margins(t)
for k, v in rows:
    c = t.add_row().cells
    c[0].width = Cm(3.4); c[1].width = Cm(13.2)
    shade(c[0], "1F3864")
    p0 = c[0].paragraphs[0]; p0.paragraph_format.space_after = Pt(0)
    rr = p0.add_run(k); rr.bold = True; rr.font.size = Pt(9); rr.font.name = TBL
    rr.font.color.rgb = RGBColor(0xFF, 0xFF, 0xFF)
    p1 = c[1].paragraphs[0]; p1.paragraph_format.space_after = Pt(0); p1.paragraph_format.line_spacing = 1.0
    rr = p1.add_run(v); rr.font.size = Pt(8.5); rr.font.name = TBL
for row in t.rows:
    row.cells[0].width = Cm(3.4); row.cells[1].width = Cm(13.2)
fixed_layout(t, 16.6)

doc.add_paragraph()
p = doc.add_paragraph(); p.alignment = WD_ALIGN_PARAGRAPH.CENTER
r = p.add_run("Audit date: 28 October 2026")
r.font.size = Pt(10); r.bold = True; r.font.color.rgb = GREY

# ============================================================ 1. SCOPE
h1("1. Scope, method and how to read this audit", pagebreak=True)

para("Two documents describing the same project were read in full, cross-checked against each other, and "
     "re-computed from first principles. Every confusion matrix was re-added row-wise and column-wise; every "
     "percentage was recomputed from its numerator and denominator; every forecast was tested for internal "
     "growth consistency; and every physical claim (battery, motor, geometry, throughput) was reduced to "
     "watts, millimetres and seconds. Market and demographic figures were traced to published sources.")

para("Three questions were asked of each item:")
bullet("**Is it possible?** Does the arithmetic close? (e.g. do the rows of a confusion matrix add to the stated test set?)")
bullet("**Is it consistent?** Do the two documents, and different sections of the same document, agree on the number?")
bullet("**Is it reachable?** Can the stated prototype, dataset and test plan actually produce this result, and is there a measurement record to defend it in a viva?")

h2("Severity scale used throughout")
table(
    ["Tag", "Meaning", "Consequence if left uncorrected"],
    [
        ["BLOCKER", "Numerically impossible, or two values that cannot both be true for the same experiment.",
         "An external examiner or reviewer can disprove it in one minute of arithmetic. This is the single biggest risk to the new report."],
        ["MAJOR", "Possible but unsupported: no dataset count, no baseline, no measurement record, or a figure that a prototype of this build cannot deliver.",
         "Attracts the question “show me the log”. Undermines otherwise good work."],
        ["MINOR", "Editorial: spelling, cross-references, caption/title wording, placeholders, layout.",
         "Damages polish and first impression; easy marks lost."],
        ["OK", "Verified correct. Carry forward unchanged into the new report.",
         "None — these become the anchors that make the rest credible."],
    ],
    [2.0, 7.4, 7.2], size=8, severity_col=0)
caption("Table 1.1 — Severity scale.")
note("Throughout, “Paper” = IEOM conference paper (5th Indian International Conference on IEOM, Nov 2025); “Report” = previous-semester IDFP Lab Report (May 2026). "
     "Numbers in square brackets are section numbers of the source document.")

# ============================================================ 2. HEADLINE
h1("2. Executive summary — the ten changes that matter most", pagebreak=True)

para("The engineering content of both documents is sound and the narrative is well organised. The problem is "
     "concentrated in the numbers. Of the quantified claims, **the model-performance block is self-contradictory in "
     "five independent ways**, the **market sizing is wrong by a factor of 18.6 on the Chennai population**, and the "
     "**financial plan contains two revenue series that differ by 29×**. These are all fixable before submission, but "
     "they must be fixed deliberately, because each wrong number is cross-referenced in three or four places.")

table(
    ["#", "Severity", "Issue", "Where", "Action"],
    [
        ["1", "BLOCKER", "Same model reported at four different accuracies: 95.41%, 97.7%, 98.3% and (from its own confusion matrix) 94.04%.",
         "Paper [4], [5.1], [5.4], [6]", "Fix one value from one logged run and use it everywhere."],
        ["2", "BLOCKER", "Stated “overall accuracy of 98.3%” does not match Table 3, which computes to 94.04% (3,188/3,390).",
         "Paper [5.1] vs Table 3", "Correct to 94.04%, or re-run and re-report the matrix."],
        ["3", "BLOCKER", "Confusion-matrix class sizes (500/750/330/500/310/1,000) contradict the stated test set of 80 or 100 images per class.",
         "Paper Tables 2, 3 vs Table 1", "Re-print both matrices with a single, stated test set."],
        ["4", "BLOCKER", "Model class set (Plastic, Metal, Glass, Medical, Organic, E-waste) is not the product category set (Biodegradable, Dry, Electronic, Residual). No mapping is given.",
         "Paper [4], Report [7.3.2]", "Define the 4-class mapping explicitly, or report 6-class results and state the rule that collapses them."],
        ["5", "BLOCKER", "Chennai population taken as 250,000; the census figure is 4,646,732. TAM/SAM/SOM therefore wrong by 18.6×, and Tamil Nadu is given as 30 M instead of ~72 M.",
         "Report [5.1.3], [5.1.4]", "Rebuild TAM/SAM/SOM bottom-up in households and rupees."],
        ["6", "BLOCKER", "Global market stated as $4.2 bn by 2030 at 15.8% CAGR; $2.5 bn grown at 15.8% for 7 years gives $6.98 bn, and $2.5→$4.2 bn is only 7.69% CAGR.",
         "Report [2.2], [5.1.1]", "Cite one published series (see §6) and quote its own base year, end year and CAGR."],
        ["7", "BLOCKER", "Two incompatible Year-1 revenues (₹6,90,000 vs ₹2,01,50,000) in the same chapter, and Year 5 below Year 2.",
         "Report [9.1] vs [9.2]", "One coherent 5-year P&L built from units × price."],
        ["8", "MAJOR", "Three mutually exclusive inference times: 3–7 s (Table 1), 1.92 s [5.4], 65 ms (Fig. 6).",
         "Paper [4], [5.4]", "State hardware, quantisation, batch size and the measured value once."],
        ["9", "MAJOR", "Dataset claimed from TrashNet/Kaggle/TACO, but TrashNet holds only 2,527 images and has no Organic, Medical or E-waste class; 11,280 images are claimed.",
         "Paper [4]", "Give a per-source image count table and a provenance statement."],
        ["10", "MAJOR", "No baseline for the impact claims (60–80% segregation gain, 70% less manual handling, 30% cost cut, 20% recycling gain, 98% uptime).",
         "Report [3.3], [11.1]", "Convert to design targets + prototype-measured KPIs, clearly separated."],
    ],
    [0.8, 1.9, 6.2, 3.1, 4.6], size=7.6, severity_col=1)
caption("Table 2.1 — Top issues, in order of exposure.")
note("Issues 1–7 are the ones to clear before the template is filled in. Issues 8–10 are cleared by rewording plus one evidence table each.")

# ============================================================ 3. WHAT SURVIVES
h1("3. What is already correct — keep these exactly as they are", pagebreak=True)

para("An audit that lists only faults is not useful. The following items were tested and **passed**; they should be "
     "carried into the new report unchanged, because they are what makes the corrected document defensible.")

table(
    ["Item", "Where", "Verification performed", "Verdict"],
    [
        ["Table 1 per-class percentages", "Paper Table 1",
         "98.75, 97.5, 95, 95, 93.75 and 92.5% of 80 images give exactly 79, 78, 76, 76, 75 and 74 classified.",
         "OK — internally exact."],
        ["Overall accuracy 95.41%", "Paper [4]",
         "79+78+76+76+75+74 = 458; 458/480 = 95.42%. Rounding difference of 0.01 only.",
         "OK — state 95.42% or keep 480 as the denominator note."],
        ["Sensor confusion matrix", "Paper Table 2",
         "Rows sum to 3,460 and columns sum to 3,460 — the matrix is a valid, balanced contingency table. Row-normalised diagonal (93/90/94/80/68/92%) matches the stated values except e-waste.",
         "OK except one cell (see §4.2)."],
        ["EfficientNet confusion matrix", "Paper Table 3",
         "Rows and columns both sum to 3,390; every row-normalised diagonal equals the percentage printed in the cell (97.0, 94.7, 95.5, 90.0, 89.7, 95.0%).",
         "OK as a matrix — only the “98.3% overall” sentence is wrong."],
        ["Control-cycle timing", "Paper [3.4.3], [5.4]",
         "“3–4 s per cycle” and “average cycle time 3.2 s” are consistent, and 3.2 s implies 1,125 items/hour.",
         "OK — add the throughput number."],
        ["Compartment / disc geometry", "Paper [3.2], Report [7.3.2]",
         "Two 380 mm discs, four 156 mm compartments, 750 mm tall, 450 mm wide: feasible only as a 2×2 cluster (312 mm) on a 112 mm centre radius. See §4.4 for the tolerance consequence.",
         "OK, but must be dimensioned in the drawing."],
        ["Battery energy budget", "Paper [3.4.1]",
         "12 V × 7 Ah = 84 Wh. A 6–8 h claim requires 10.5–14 W average system draw.",
         "OK as arithmetic — needs a measured load log."],
        ["LTV/CAC framing", "Report [9.4]",
         "The three metrics are correctly defined and the ratio is computable: 6,200/3,871 = 1.60.",
         "Formula OK — the ratio itself is a risk (see §7)."],
    ],
    [3.6, 2.6, 7.4, 3.0], size=7.8)
caption("Table 3.1 — Verified items. These numbers can be defended line by line.")
note("Rule for the new report: any number that cannot be defended the way these were defended should not appear as a "
     "measured result — it belongs in a clearly-labelled section titled “Design targets” or “Expected performance”.")

# ============================================================ 4. IMPOSSIBLE
h1("4. Metrics that are numerically impossible or mutually contradictory", pagebreak=True)

para("These are the “cannot be reached” figures in the strict sense: the numbers, as printed, cannot describe any real "
     "experiment. Each was checked by re-adding the table it comes from.")

h2("4.1 The model-accuracy block contradicts itself five times")

table(
    ["ID", "Metric", "Value A", "Value B", "Arithmetic that decides it"],
    [
        ["A-1", "Overall CNN accuracy", "98.3% [5.1]", "94.04% (Table 3)",
         "Diagonal of Table 3 = 485+710+315+450+278+950 = 3,188. Total = 3,390. 3,188/3,390 = 94.04%. 98.3% is not obtainable from the matrix."],
        ["A-2", "Overall CNN accuracy", "95.41% [4]", "94.04% (Table 3)",
         "95.42% is the 480-image test of Table 1. Table 3 is a 3,390-image test. Two different experiments are being reported as one."],
        ["A-3", "Overall CNN accuracy", "97.7% [5.4], [6]", "94.04% (Table 3)",
         "“Overall accuracy of up to 97.7%” in the abstract, conclusion and validation — a fourth value for the same model."],
        ["A-4", "CNN accuracy, Fig. 6", "93.8% (EfficientNet-B3)", "95.41 / 97.7 / 98.3%",
         "Fig. 6 plots EfficientNet-B3 at 93.8%, which agrees with none of the three text values and not with Table 3's 94.04%."],
        ["A-5", "Per-class metrics (Table 7.2)", "Precision 87.6–92.1%", "Table 3 matrix 90.7–99.5%",
         "Recomputed precision from Table 3: Paper 90.65, Plastic 92.57, Metal 91.30, Glass 92.78, E-waste 91.75, Organic 99.48. Report Table 7.2 states 88.7, 91.2, 92.1, 87.9, —, 87.6. Only Metal is close."],
    ],
    [1.0, 3.3, 2.6, 2.6, 7.1], size=7.8)
caption("Table 4.1 — Five incompatible statements about one model.")
note("A-5 also reveals that Report Table 7.2 omits E-waste entirely, although e-waste is one of the four compartments the machine sorts into.")

h2("4.2 Confusion-matrix class sizes contradict the dataset tables")

table(
    ["ID", "Statement", "Document", "Why it fails"],
    [
        ["B-1", "“80 test images per class” (6 classes = 480 tests)", "Paper Table 1",
         "Table 2's class supports are 500/750/400/500/310/1,000 and Table 3's are 500/750/330/500/310/1,000. Neither is 480, or 600, or equal per class."],
        ["B-2", "“Data divided 80:20 for training and testing” [4]", "Paper [4]",
         "Table 1 gives 1,500 train / 300 validation / 80 test per class = 79.8 / 16.0 / 4.3%. That is a three-way split, not 80:20."],
        ["B-3", "“Validation used 2,000 labelled waste samples across four categories” [5.4]", "Paper [5.4]",
         "Table 1 describes 11,280 images over six categories; Table 3 describes 3,390. Three dataset designs in one paper."],
        ["B-4", "E-waste recall “70%”", "Paper Table 2, [5.1]",
         "Cell = 210 of a 310 row = 67.74%. Only 70% if the support is 300. Print 67.7% or change the support."],
        ["B-5", "Sensor-module overall accuracy", "Paper [5.1]",
         "Never stated, although computable: 3,046/3,460 = 88.03%. The section gives only per-class values; the fusion gain over 88.03% is therefore never quantified."],
    ],
    [1.0, 4.4, 2.4, 8.8], size=7.8)
caption("Table 4.2 — Dataset and support inconsistencies.")
note("Consequence to state in the new report: with 3,390 test images and unequal supports, the honest headline is "
     "“94.04% overall, macro-F1 93.32”, not 98.3%. Macro-F1 is the fairer figure when supports are unequal and it is "
     "lower — which is exactly why it should be reported.")

h2("4.3 The taxonomy gap: six trained classes, four physical compartments")

para("The single most serious technical gap in both documents is that **the classifier and the machine do not share a "
     "category set**. The neural network is trained and tested on Plastic, Metal, Glass, Medical Waste, Organic and "
     "E-waste. The carousel disc indexes four compartments: Biodegradable (wet), Dry, Electronic and Residual. "
     "No table, figure or sentence maps one set onto the other. Three consequences follow, and all three are "
     "answerable in one sentence each — but only if the new report states them:")

bullet("“Medical waste” has no destination compartment. It is either dropped into Residual (a health-and-safety statement) or the class must be removed from training.")
bullet("“Dry” and “Residual” are not output classes of the model at all, so a “four-category classification accuracy” cannot be derived from the six-class results as printed.")
bullet("Plastic, Metal and Glass are materials, not disposal streams. Cardboard, paper, textile and food waste — the bulk of real MSW — are either absent or folded into “Organic” without definition.")

para("**Recommended fix (one paragraph, no new experiments):** define the mapping table — Organic → Biodegradable; "
     "Plastic, Glass, Paper → Dry; Metal, E-waste → Electronic; Medical Waste and any low-confidence result → Residual — "
     "then report both the six-class model metrics and the derived four-stream decision accuracy, and state which of "
     "the two the headline number refers to.")

h2("4.4 Mechanical claim that the stated tolerance cannot deliver")

para("Paper [5.3] proposes, as an improvement, “precise angular positioning within ±2° of the target compartment”, while "
     "[5.4] already claims “angular deviation below 1.8°” as achieved. The proposed improvement is therefore worse than "
     "the achievement — a contradiction on its face. More importantly, 1.8° is not good enough for the stated geometry:")

table(
    ["Quantity", "Calculation", "Result", "Consequence"],
    [
        ["Max compartment centre radius", "380/2 − 156/2", "112 mm", "Compartment axes must sit inside this circle."],
        ["Chord between adjacent compartments at that radius", "112 × √2", "158.4 mm", "Two 156 mm circles leave a gap of only 2.4 mm."],
        ["Arc error from a 1.8° error at 110 mm radius", "1.8 × π/180 × 110", "3.46 mm", "Larger than the 2.4 mm gap — a mis-indexed drop can straddle two compartments."],
        ["Arc error at the disc rim", "1.8 × π/180 × 190", "5.97 mm", "Visible misalignment of the cup with the aperture."],
        ["Tolerance needed to stay inside the gap", "arctan(1.2/110)", "≤ 0.62°", "Specify ≤ 0.5° (≈0.96 mm) and verify by encoder log."],
    ],
    [4.4, 3.4, 2.0, 6.8], size=7.8)
caption("Table 4.3 — Tolerance versus geometry.")
note("Fix: angular resolution is not the constraint — a 200-step NEMA 17 on a DRV8825 at 1/16 microstepping resolves 0.1125°, so 0.5° "
     "is roughly four microsteps. The constraint is backlash and coupling compliance in the direct-drive arrangement. So either fit a "
     "zero-backlash coupling / 5:1 reduction, or add a drop chute or guide cone between disc and compartment mouth, or reduce the "
     "compartment diameter to ~130 mm. State the choice, the method of measurement (encoder ticks per index position) and the "
     "repeatability over 100 cycles — not just the mean deviation.")

# ============================================================ 5. NOT REACHABLE
h1("5. Claims that are not reachable with the stated prototype, data or test plan", pagebreak=True)

para("These numbers are not arithmetically impossible — they are simply unsupported. Each one is the kind of figure a "
     "reviewer reads as a real measurement and then asks to see the record for. There is no record in either document.")

table(
    ["ID", "Claim as written", "Where", "Why it is not reachable", "What to write instead"],
    [
        ["C-1", "“Increased source-level waste segregation rate by 60–80%”", "Report [3.3]",
         "No baseline segregation rate, no site, no duration, no before/after measurement. Also a system property, not a device property.",
         "State the design target and the measurement plan; keep measured KPIs to what the prototype logs."],
        ["C-2", "“Reduction in manual waste handling by 70%”", "Report [3.3]",
         "Requires a time-and-motion study of a real collection route. Not performed.",
         "Express as “per-item user intervention reduced to 1 action (insertion) vs 3 (inspect, decide, place)”."],
        ["C-3", "“Reduce waste collection costs by 30%, improve recycling rates by 20%”", "Report [11.1]",
         "Municipal cost data and a controlled trial are needed; neither exists in either document.",
         "Attribute to literature with a citation, or label as a modelled projection with the model shown."],
        ["C-4", "“Latency 300 ms, system uptime above 98%”", "Paper [5.4]",
         "Uptime cannot be demonstrated over a 100-cycle lab run; no monitoring period, no percentile, no failure definition.",
         "“Median round-trip latency X ms over N requests (min/median/p95/max), measured over T hours.”"],
        ["C-5", "“65 ms mean forward pass for EfficientNet-B3 on Raspberry Pi 4”", "Paper Fig. 6, [5.4]",
         "A 224×224 B3 forward pass on a Pi 4 CPU typically costs 250–600 ms un-quantised. 65 ms implies INT8 TFLite with XNNPACK plus warm cache — none of which is stated.",
         "State: TFLite INT8, XNNPACK, single-image batch, median of 100 runs after 10 warm-ups, and the Pi's clock/power mode."],
        ["C-6", "“Angular deviation below 1.8° across 100 continuous cycles”", "Paper [5.4], Report [7.3.3]",
         "Mechanically possible, but it contradicts the ±2° “improvement” in [5.3] and is insufficient for the 2.4 mm gap (§4.4).",
         "Re-specify to ≤0.5°, and report the measurement (encoder count, dial gauge, or vision) and the sample size."],
        ["C-7", "“6–8 hours of standalone operation”", "Paper [3.4.1]",
         "84 Wh supports 6–8 h only at 10.5–14 W average. A Pi 4 at inference plus a NEMA 17 moving is at or above that; no duty cycle or power log is given.",
         "“Measured draw of X W idle / Y W during actuation; 84 Wh therefore gives Z h at the measured duty cycle of D%.”"],
        ["C-8", "Confidence scores 0.88–0.95", "Report Table 7.2",
         "A confidence column with no calibration method or reliability diagram is not interpretable.",
         "Either drop the column, or add expected calibration error over 10 bins."],
        ["C-9", "Accuracy 91.2% indoor / 89.7% outdoor / 82.4% low light / 85.9% multi-object / 81.3% partial", "Report [7.5.1]",
         "No protocol: number of images per condition, light level (lux), object distance, or who labelled them. “Indoor 91.2%” is also numerically identical to the Plastic precision figure in the same chapter — the signature of a copied value.",
         "Define each condition with lux and distance, give n per condition, and show the per-condition matrix."],
        ["C-10", "Survey: 82% / 68% / 90% / 85%", "Report [2.3]",
         "No n, no sampling frame, no location, no date, no questionnaire. Two of the five bullets (45% manual financial reporting errors, 35% real-time financial insight problems) are about a fintech product, not waste.",
         "State n, method (e.g. n = 120, purposive, Chennai, Oct 2026), attach the questionnaire as an appendix, delete the two financial bullets."],
        ["C-11", "“Optional IoT connectivity”", "Paper Abstract, [3.1.3]",
         "The same section describes the Pi transmitting fill level, gas and status to a dashboard, and [5.4] validates IoT latency. “Optional” and “validated” cannot both be the scope.",
         "Choose: make IoT a delivered module (and say so in the abstract) or drop the latency claim."],
        ["C-12", "“Average cycle time 3.2 s” over 100 continuous cycles", "Paper [5.4]",
         "Consistent with [3.4.3]'s 3–4 s, but throughput (items/hour) is never stated, so the mechanical result cannot be compared with any other system.",
         "Add: 3.2 s ⇒ 1,125 items/h theoretical, and the observed rate including reload."],
    ],
    [0.9, 3.5, 1.9, 5.2, 5.1], size=7.4)
caption("Table 5.1 — Unsupported claims and their replacements.")
note("C-5, C-7 and C-9 are the three most likely to be challenged in a viva, because each is a claim about hardware that the examiner can estimate in their head.")

# ============================================================ 6. MARKET
h1("6. Market sizing — four independent errors", pagebreak=True)

h2("6.1 The global market figure is internally impossible")

para("Report [2.2] and [5.1.1] state: “estimated value in 2023: $2.5 billion; projected value by 2030: $4.2 billion; "
     "CAGR 15.8%”. These three numbers cannot coexist. Growing $2.5 bn at 15.8% for seven years gives "
     "2.5 × 1.158^7 = **$6.98 bn**, not $4.2 bn; and $2.5 bn → $4.2 bn over seven years is a CAGR of **7.69%**, not 15.8%. "
     "The $4.2 bn / 15.8% pairing appears to come from an older press release whose base year was different.")

h2("6.2 Corrected reference values (choose one source and cite it)")

table(
    ["Source", "Base year and value", "Forecast", "CAGR"],
    [
        ["Allied Market Research (2024/25 editions)", "$2.2 bn in 2023", "$8.3 bn by 2032", "15.6% (2024–2032)"],
        ["Mordor Intelligence", "$3.54 bn in 2025", "$7.15 bn by 2030", "15.1% (2025–2030)"],
        ["Acumen Research & Consulting", "$2.57 bn in 2023", "$10.37 bn by 2032", "16.9% (2024–2032)"],
        ["Research and Markets / Global Industry Analysts", "$2.4 bn in 2023", "$5.6 bn by 2030", "13.2% (2023–2030)"],
    ],
    [5.4, 3.6, 3.6, 4.0], size=8)
caption("Table 6.1 — Published series that are internally consistent.")
note("Recommendation: adopt Allied Market Research ($2.2 bn 2023 → $8.3 bn 2032, 15.6%) for the global paragraph and "
     "Mordor ($3.54 bn 2025 → $7.15 bn 2030) if a 2030 horizon is preferred. Never mix a value from one house with a "
     "CAGR from another — that is how the current 2.5 / 4.2 / 15.8% error arose.")

h2("6.3 TAM / SAM / SOM: the arithmetic is right, the inputs are wrong")

table(
    ["Level", "Input used in the report", "Check", "Verified value", "Status"],
    [
        ["India TAM", "1.4 bn × 35% urban × 70% interested = 343 M people", "1,400 × 0.35 = 490 M ✓ arithmetic",
         "Urban share is 31.2% at the 2011 census (377 M) and ≈36% in 2025 (≈525 M of 1.46 bn). The 70% “interested” factor is invented.",
         "Arithmetic correct — assumptions unsourced."],
        ["Tamil Nadu SAM", "Population 30 M; urban 37.5%; → 11.25 M", "30 × 0.375 = 11.25 M ✓ arithmetic",
         "Tamil Nadu's population is 72.1 M (2011 census), ≈77.5 M projected for 2026. Urban share is 48.4% (34.9 M in 2011), not 37.5%.",
         "!!Base population wrong by 2.4×; urban share wrong by 11 points."],
        ["Chennai SOM", "Population 250,000 → SOM 175,000", "250,000 × 0.70 = 175,000 ✓ arithmetic",
         "Chennai Corporation: 4,646,732 (2011 census), ≈5.39 M (2025 estimate); metropolitan area 8.65 M (2011). The report understates the city by 18.6×.",
         "!!Input wrong by 18.6×; whole chain collapses."],
        ["Unit basis", "People", "—",
         "A bin is sold per household or per institution. Chennai at ≈4.0 persons/household is ≈1.35 M households. Sizing in people cannot be converted to units, price or revenue.",
         "!!Wrong unit — must be households or institutions, in ₹."],
    ],
    [2.0, 4.0, 3.2, 6.3, 1.1], size=7.6)
caption("Table 6.2 — TAM/SAM/SOM verification.")
note("The last row is the structural problem: even with correct populations, “343 million individuals” cannot become a "
     "revenue number. Rebuild as: households × penetration × price per unit, then present TAM/SAM/SOM in ₹ crore.")

para("**Suggested rebuild (worked, using census-anchored inputs — replace the survey factor with your own n):**")
table(
    ["Step", "Definition", "Working", "Result"],
    [
        ["TAM (India)", "Urban households addressable by a source-segregation device", "≈525 M urban ÷ 4.4 persons/household", "≈119 million households"],
        ["SAM (Tamil Nadu)", "Urban households in TN", "34.9 M urban (2011 census) ÷ 4.0", "≈8.7 million households"],
        ["SOM (Chennai)", "Chennai households × realistic 5-yr penetration", "1.35 M × 3%", "≈40,000 units"],
        ["Value", "SOM × unit price", "40,000 × ₹25,000", "≈₹100 crore addressable in Chennai"],
    ],
    [2.6, 5.4, 5.0, 3.6], size=7.8)
caption("Table 6.3 — Illustrative bottom-up sizing. Substitute your own penetration assumption and state its basis.")
note("The 3% penetration used above is a placeholder to demonstrate the method — it must be replaced by a value you can "
     "defend from your own survey, and the survey table must carry n, method, place and date.")

# ============================================================ 7. FINANCE
h1("7. Financial plan — the numbers do not reconcile", pagebreak=True)

table(
    ["ID", "Line", "As stated", "Check", "Required correction"],
    [
        ["D-1", "Year-1 revenue", "₹6,90,000 [9.1] vs ₹2,01,50,000 [9.2]", "Ratio 29.2× — same year, same chapter.",
         "One series only. Derive it: units sold × unit price (state both)."],
        ["D-2", "Revenue trajectory", "Y1 ₹2,01,50,000 → Y2 ₹2,45,70,000 → Y5 ₹1,50,93,839", "Revenue falls 38.6% between Y2 and Y5 while the text claims “significant profitability from Year 3”.",
         "Monotone growth, or an explicit reason for decline (e.g. hardware → subscription mix shift) shown in the table."],
        ["D-3", "Missing P&L lines", "Revenue and net profit only", "No COGS, gross margin, opex, headcount, or units sold. Net profit cannot be audited.",
         "Full P&L: revenue, COGS, gross profit, opex split, EBITDA, tax, PAT — 5 years."],
        ["D-4", "Break-even", "“Expect to break even in Year 2” [9.3]", "Y1 already shows ₹16.9 L net profit and Y2 ₹27.84 L. You cannot break even after two profitable years.",
         "Compute cumulative cash flow and show the month it turns positive."],
        ["D-5", "Capital ask", "Startup cost ₹8,00,000 [9.1]; seed ask ₹5,00,000 for 18 months [9.5]", "Shortfall ₹3,00,000 (37.5%). ₹5 L over 18 months = ₹27,778/month for R&D + marketing + ops — less than one engineer.",
         "Make the ask ≥ startup cost, or re-scope. Show a monthly cash-flow statement for 18 months."],
        ["D-6", "Unit economics", "CAC ₹3,871; CLV ₹6,200; payback 6 months [9.4]", "CLV/CAC = 1.60 (healthy is ≥3.0). A 6-month payback implies ₹645/month gross margin per customer; at the stated $5/month basic plan (≈₹415) payback is 9.3 months even at 100% margin.",
         "Recompute: payback = CAC ÷ (ARPU × gross margin %). If hardware is sold, include its margin in the payback."],
        ["D-7", "Currency", "$300 bin, $5 and $15 plans, ₹ costs", "Two currencies in one plan with no exchange-rate assumption.",
         "Quote in ₹ throughout, or state “USD at ₹83/$” once and use it consistently."],
        ["D-8", "BOM reality", "Price “starts at $300” (≈₹24,900)", "Raspberry Pi 4 4 GB ≈₹5,000; 5 MP camera ≈₹800; 6 sensor modules ≈₹2,500; NEMA 17 + DRV8825 ≈₹1,600; 12 V 7 Ah Li-ion + BMS ≈₹2,000; discs, HDPE bins, steel frame, 3D prints ≈₹5,000. Indicative BOM ≈₹17,000–19,000 before assembly and channel.",
         "Publish the BOM with unit costs and a target gross margin. At ₹24,900 with a 40% channel margin the gross margin is thin — show the sensitivity."],
    ],
    [0.9, 2.8, 4.3, 4.6, 4.0], size=7.4)
caption("Table 7.1 — Financial inconsistencies.")
note("D-1 and D-4 are the two that a business-school reviewer will find first: a 29× discrepancy inside one chapter, and a "
     "break-even claim that contradicts two profitable years.")

# ============================================================ 8. EDITORIAL
h1("8. Text, reference and formatting errors", pagebreak=True)

h2("8.1 Editorial and consistency errors")

table(
    ["ID", "Location", "As written", "Correction"],
    [
        ["E-1", "Report, Contents", "“7 DESIGN AND ARCHITECHTURE”", "ARCHITECTURE"],
        ["E-2", "Report, Contents 5.2", "“TARGET AUDIENCE AND CUSTOMER PERSONAL”", "CUSTOMER PERSONA"],
        ["E-3", "Report [5.2]", "Persona: “Sarah, 35, Owner of a retail business… struggles with cash flow, budgeting and timely financial reporting”",
         "Belongs to a fintech project. Replace with a waste-relevant persona: e.g. Secretary, 42, gated community of 180 flats, Chennai."],
        ["E-4", "Report [2.3]", "“45% of businesses cite errors in manual financial reporting… 35% struggle with real-time financial insights”",
         "Delete both bullets — they are about accounting software, not waste."],
        ["E-5", "Report, title/certificate", "“WASTE SEGREGATING SMART BIN (BIN GENIE)” / “(BINGENIE)”", "One spelling. Use “BinGenie” in running text and the full name once on the title page."],
        ["E-6", "Report, Abstract", "“…classifying waste into wet, dry, and electronic categories” (3)", "Four categories — add Residual/Unsorted, consistent with [7.3.2] and the paper."],
        ["E-7", "Report [7.5.1]", "“trained on open source dataset (Kaggle, Smart Waste Segregation dataset) containing various Table 1.”", "Broken sentence; rebuild as a proper dataset paragraph with per-source counts (see §9)."],
        ["E-8", "Report [7.5.1]", "“…containing various Table 1. Dataset Partition and Classification Results.”", "Cross-reference the table properly: “Table 7.1”."],
        ["E-9", "Report Table 7.2 caption", "“Precision table of various categories of waste”", "Captions must match content: “Per-class precision, recall and F1-score”. Table also omits E-waste."],
        ["E-10", "Report, Acknowledgement", "“our Supervisor, Mr. Velmurugan V for his /her expertise”", "Remove the template switch: “for his expertise”."],
        ["E-11", "Report, Acknowledgement", "“bricks other save thrown at him” (David Brinkley quote)", "“the bricks others have thrown at him”. Consider dropping the epigraph entirely — it is not standard in this template."],
        ["E-12", "Report, Certificate", "“SRI SAI RAM ENGINEERING COLLEGE” vs “Sri Sairam Engineering College” (paper)", "Use the institution's official form throughout. Verify Chairman/CEO name forms against the official letterhead."],
        ["E-13", "Report, Figs 7.1 & 7.2", "Both captioned as the overall structure/design of the bin", "Distinguish: 7.1 overall assembly (isometric), 7.2 exploded view or front/side elevation."],
        ["E-14", "Report, Appendix II", "Rows 2.3–2.8 and 3.1–3.4 left blank; instruction lines “Include the following KPIs…” still present", "Fill or delete every blank row. Instruction text must never reach the printed page."],
        ["E-15", "Report, Appendix IV", "“Enclose the screenshot of the project uploaded in the link…” with no screenshot", "Insert the SDG Scout screenshot, or delete the appendix."],
        ["E-16", "Report, Contents", "Page numbers 1–33", "Regenerate the field after all edits; every reflow invalidates them."],
        ["E-17", "Report, Figures", "“Figure Number / Figure Name / Page No.” list is fine but numbering starts at 7.1", "Either keep chapter-based numbering consistently or use Fig. 1…n."],
        ["E-18", "Paper, [5.3]", "“…precise angular positioning within ±2° deviation”", "See §4.4 — re-specify to ≤0.5°."],
        ["E-19", "Paper, [3.1.3] vs Abstract", "“Optional IoT connectivity” vs a validated IoT dashboard", "Resolve the scope statement (C-11)."],
        ["E-20", "Paper, DOI", "10.46254/IN05.20250000", "Verify the real DOI on the certificate/proceedings before the new report cites this publication."],
    ],
    [0.9, 3.1, 6.6, 6.0], size=7.4)
caption("Table 8.1 — Editorial register.")
note("E-14 and E-15 are the two that most affect the impression of the report: leftover template instructions read as unfinished work.")

h2("8.2 Fourteen of seventeen literature citations are missing from the reference list")

para("Chapter 4 of the Report cites seventeen works. Only three of them (Longo et al., 2021; Chen et al., 2021; "
     "Nafiz et al., 2023) appear in the reference list, and Chen and Nafiz were carried over from the conference paper "
     "rather than from the review itself. The other fourteen are untraceable — which means it cannot be verified, and a reviewer will treat the "
     "whole literature review as unverified.")

table(
    ["Cited in Report Chapter 4", "Present in reference list?", "Note"],
    [
        ["Longo et al. (2021)", "Yes", "Also cited in the paper — keep."],
        ["Zhao et al. (2022); Kumar and Singh (2020); Singh and Sharma (2020); Gyawali et al. (2020); Yu and Grammenos (2021)",
         "!!No", "Five works supporting the CNN claims; none traceable."],
        ["Chen et al. (2021); Nafiz et al. (2023)", "Yes", "Both are in the list, but both were imported from the paper, not from this review."],
        ["White et al. (2020)", "!!No", "WasteNet 97% claim — this is the closest prior art to the project and must be cited properly."],
        ["Patel et al. (2020); Alqahtani et al. (2019); Kumar et al. (2021)", "!!No", "Three IoT monitoring works."],
        ["Nguyen et al. (2021); Dasaklis et al. (2020)", "!!No", "Blockchain works — also largely irrelevant to this project's scope."],
        ["Lopez et al. (2022); Patil and Deshpande (2021); Garcia and Lopez (2022)", "!!No", "Solar bin, urban analytics, anaerobic digestion."],
    ],
    [8.6, 3.4, 4.6], size=7.8)
caption("Table 8.2 — Citation traceability.")

para("Two further problems with the literature review as written: (i) the paper's own 20 references are almost entirely "
     "absent from the report's Chapter 4, so the report reviews a different body of work than the paper it is based on; "
     "and (ii) the formatting mixes two styles — Chapter 4 uses author–year, the reference list uses a numbered-free "
     "IEEE-like style. The new report should pick one (IEEE numeric is the usual template default) and apply it to both.")

# ============================================================ 9. EVIDENCE
h1("9. Evidence and appendix gaps that the new report must close", pagebreak=True)

table(
    ["#", "Missing artefact", "Why it is needed", "Where it goes"],
    [
        ["1", "Dataset provenance table: source, licence, raw count, classes, images kept after cleaning, per class",
         "The current claim (TrashNet + Kaggle + TACO, 1,800 per class) cannot be reconciled: TrashNet holds 2,527 images in total and has no Organic or E-waste class.",
         "Chapter 7, before Table 7.1"],
        ["2", "One experiment sheet: date, model file hash, TFLite version, quantisation, Pi power mode, test-set count",
         "Makes the single reported accuracy reproducible and defensible.",
         "Appendix"],
        ["3", "Confusion matrix printed once, with support column and macro-F1",
         "Replaces three incompatible matrices with one auditable one.",
         "Chapter 7 / Results"],
        ["4", "BOM with unit costs and vendors",
         "Backs the price and the gross margin.",
         "Chapter 9"],
        ["5", "Survey instrument + n + sampling method",
         "Backs every survey percentage used in Chapter 2 and in the TAM/SAM/SOM penetration assumption.",
         "Appendix"],
        ["6", "Motor index-position log (encoder ticks vs commanded angle, 100 cycles)",
         "Converts the ±1.8° claim into a measured distribution and closes C-6 and §4.4.",
         "Chapter 7 / Validation"],
        ["7", "Power log (V, I, W at idle / inference / actuation) and duty cycle",
         "Converts the 6–8 h claim into a computed runtime.",
         "Chapter 7 / Validation"],
        ["8", "Patent/prior-art or novelty statement",
         "The claim “novelty lies in hybrid integration” is asserted; one paragraph of prior-art comparison would defend it.",
         "Chapter 4 or 1"],
        ["9", "Plagiarism / AI-use declaration, if the template requires it",
         "Standard submission requirement in most autonomous-institution templates.",
         "Front matter"],
        ["10", "List of abbreviations and symbols",
         "The document uses ToF, MEC, BMS, HDPE, ABS, PWM, CSI, GPIO, TFLite without a key.",
         "Front matter"],
    ],
    [0.8, 4.4, 7.3, 4.1], size=7.6)
caption("Table 9.1 — Evidence register.")

# ============================================================ 10. LEDGER
h1("10. Master value ledger — the single set of numbers for the new report", pagebreak=True)

para("This is the operative table. **Every number that appears anywhere in the new report must come from the right-hand "
     "column of this table, and nowhere else.** Fill the “Confirmed value” column once, then treat it as the only source — "
     "that is what prevents the same 29× and 4-accuracy problems from reappearing.")

table(
    ["#", "Quantity", "Old value(s) in the documents", "Status", "Value to use in the new report"],
    [
        ["1", "Headline classification accuracy", "95.41% / 97.7% / 98.3% / 93.8% / 94.04%", "!!BLOCKER",
         "One value, from one test run, with the denominator printed: “__% (n = __)”."],
        ["2", "Test-set size and split", "80/class, 100/class, 2,000 total, 80:20, 3,390", "!!BLOCKER",
         "State the split once: __% train / __% validation / __% test, and n per class."],
        ["3", "Per-class precision / recall / F1 + support", "Table 7.2 (5 classes, no support)", "!!BLOCKER",
         "Six (or four) classes, each with support, macro-F1 and the matrix it came from."],
        ["4", "Class taxonomy", "6 trained classes vs 4 compartments", "!!BLOCKER",
         "Add the mapping table; state which accuracy is 6-class and which is 4-stream."],
        ["5", "Inference time", "3–7 s / 1.92 s / 65 ms", "!!BLOCKER",
         "One measured median with hardware, quantisation and batch size stated."],
        ["6", "Model", "EfficientNet-B3", "OK", "Keep. Add input size (224×224) and parameter count (≈12 M)."],
        ["7", "Global market", "$2.5 bn 2023 → $4.2 bn 2030, 15.8%", "!!BLOCKER",
         "$2.2 bn 2023 → $8.3 bn 2032, 15.6% (Allied) — or Mordor $3.54 bn 2025 → $7.15 bn 2030, 15.1%."],
        ["8", "India population / urban share", "1.4 bn × 35%", "MAJOR",
         "1.46 bn (2026) × 36% urban ≈ 525 M, or cite the 2011 census 31.2% explicitly. State the year of every population figure."],
        ["9", "Tamil Nadu population / urban share", "30 M × 37.5%", "!!BLOCKER",
         "72.1 M (2011 census) or ≈77.5 M (2026 projection) × 48.4% urban."],
        ["10", "Chennai population", "250,000", "!!BLOCKER",
         "4,646,732 (2011 census, Corporation) or ≈5.39 M (2025 est.); metropolitan area 8.65 M (2011)."],
        ["11", "Market sizing unit", "Individuals", "!!BLOCKER", "Households / institutions, and value in ₹ crore."],
        ["12", "Survey findings", "82 / 68 / 90 / 85% with no n", "MAJOR", "n, method, location, date + questionnaire in appendix."],
        ["13", "Year-1 revenue", "₹6,90,000 vs ₹2,01,50,000", "!!BLOCKER", "One series, derived from units × price."],
        ["14", "5-year revenue and PAT", "Y1, Y2, then Y5 < Y2", "!!BLOCKER", "Monotone series with COGS, opex, EBITDA, PAT."],
        ["15", "Break-even", "“Year 2” (after two profitable years)", "!!BLOCKER", "Month of positive cumulative cash flow."],
        ["16", "Seed ask", "₹5,00,000 for 18 months vs ₹8,00,000 startup cost", "!!BLOCKER", "Ask ≥ cost; monthly cash flow for 18 months."],
        ["17", "CAC / CLV / payback", "₹3,871 / ₹6,200 / 6 months (ratio 1.60)", "MAJOR",
         "Derivation shown; ratio ≥3.0 or justified; payback = CAC ÷ (ARPU × gross margin)."],
        ["18", "Selling price", "$300 / $5 / $15", "MAJOR", "₹ price with BOM and gross margin; state any USD conversion rate."],
        ["19", "Angular accuracy", "±1.8° achieved; ±2° proposed as improvement", "MAJOR",
         "≤0.5° specified (see Table 4.3) and measured; delete the ±2° “improvement”."],
        ["20", "Battery runtime", "6–8 h from 12 V 7 Ah", "MAJOR", "Measured W × duty cycle → h; or upsize to 12 V 12–18 Ah."],
        ["21", "Cycle time / throughput", "3.2 s average; 3–4 s cycle", "OK", "Keep, and add “≈1,125 items/h theoretical”."],
        ["22", "IoT latency and uptime", "300 ms; >98%", "MAJOR", "Median + p95 over a stated period; uptime over ≥72 h or drop the claim."],
        ["23", "Impact metrics (60–80%, 70%, 30%, 20%)", "Presented as achievements", "!!BLOCKER",
         "Relabel as “Design targets”, each with a defined measurement method."],
        ["24", "Bin dimensions", "750 mm H, 450 mm W; 4 × Ø156 × 370 mm; 2 × Ø380 × 18 mm", "OK",
         "Keep, and add the 2×2 arrangement and the 112 mm centre radius explicitly."],
        ["25", "Weight of the unit", "Not stated anywhere", "GAP", "Add — required for a bin that is meant to be portable."],
        ["26", "Cost per unit (prototype)", "Not stated", "GAP", "Add actual prototype build cost — the single most requested figure in a viva."],
    ],
    [0.7, 4.0, 4.2, 1.8, 5.9], size=7.3)
caption("Table 10.1 — Master value ledger. Nothing outside this column should appear in the new report.")
note("Rows 25 and 26 are gaps rather than errors: neither document states the prototype's mass or its actual cost to build, "
     "and both are asked in every review.")

# ============================================================ 11. CHECKLIST
h1("11. Pre-submission checklist for the new report", pagebreak=True)

para("Run this list top to bottom after the template is filled. Each line is a single pass over the document.")
items = [
    ("Numbers", [
        "Every accuracy, percentage and time value appears once, and it appears identically in abstract, results, conclusion and appendix.",
        "Every percentage is recomputable from a printed numerator and denominator.",
        "Every table's rows and columns add to the stated total.",
        "Every population and market figure carries a year and a source.",
        "Every currency is one currency, or the exchange rate is stated once.",
        "The 5-year series is monotone or explains any decline.",
    ]),
    ("Claims", [
        "No sentence claims a measured impact that has no measurement record behind it.",
        "Design targets are in a section titled as such, not scattered through Results.",
        "Every hardware number (W, h, mm, °, s) is traceable to an appendix log.",
        "The class taxonomy agrees between: dataset table, confusion matrix, decision logic, drawing, and SDG narrative.",
    ]),
    ("Text", [
        "Contents, List of Figures and List of Tables regenerated after the final edit.",
        "No template instruction text and no blank rows anywhere.",
        "Figure and table numbering consistent; every caption matches its content.",
        "Every cross-reference resolves (“see Table __” points at the right table).",
        "Spelling: ARCHITECTURE, CUSTOMER PERSONA, BinGenie, Sri Sairam.",
        "Every in-text citation appears in the reference list, and vice versa.",
        "One citation style throughout.",
        "No residual financial-product text (persona, survey bullets).",
    ]),
    ("Format", [
        "Headings are real heading styles, not bold body text, so the automatic contents works.",
        "All figures same width, same border treatment, captions below figures, table captions above tables.",
        "Justified body text with no rivers; hyphenation off.",
        "Page numbers in the footer; front matter in roman numerals if the template requires it.",
        "Plagiarism / AI-use declaration completed if required.",
    ]),
]
for head, lst in items:
    h2(head)
    for it in lst:
        bullet(it, size=10)

doc.add_paragraph()
p = doc.add_paragraph()
p.paragraph_format.space_before = Pt(10)
p.alignment = WD_ALIGN_PARAGRAPH.LEFT
r = p.add_run("Bottom line. ")
r.bold = True; r.font.size = Pt(10.5); r.font.color.rgb = NAVY
r = p.add_run("Fourteen of the twenty-six ledger rows are blockers, and every one of them is fixed by arithmetic rather "
              "than by a new experiment — choose one accuracy, one test set, one taxonomy, one survey, one population series, one P&L. "
              "The engineering is defensible; the numbers need to be made defensible with it. Once the current-semester "
              "template arrives, the report can be built directly from the right-hand column of Table 10.1.")
r.font.size = Pt(10.5)

out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "IDFP_BinGenie_Technical_Audit.docx")
doc.save(out)
print("saved:", out)
