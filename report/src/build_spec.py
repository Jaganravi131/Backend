#!/usr/bin/env python3
"""Builds docs/BinGenie_What_We_Can_Use.docx — the carry-forward project specification."""
import os
from docx import Document
from docx.shared import Pt, Cm, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_BREAK
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.oxml.ns import qn
from docx.oxml import OxmlElement

NAVY = RGBColor(0x1F, 0x38, 0x64)
RED = RGBColor(0xA6, 0x1B, 0x1B)
GREEN = RGBColor(0x1E, 0x60, 0x33)
GREY = RGBColor(0x40, 0x40, 0x40)
BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FIG = os.path.join(BASE, "assets", "figures", "Fig_System_Architecture.png")
OUTDIR = os.path.join(BASE, "deliverables")

BODY = "Times New Roman"
TBL = "Calibri"

doc = Document()
st = doc.styles["Normal"]
st.font.name = BODY
st.font.size = Pt(11)
st.element.rPr.rFonts.set(qn("w:eastAsia"), BODY)
st.paragraph_format.space_after = Pt(6)
st.paragraph_format.line_spacing = 1.15
st.paragraph_format.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY

sec = doc.sections[0]
sec.page_height, sec.page_width = Cm(29.7), Cm(21.0)
sec.top_margin = Cm(2.2)
sec.bottom_margin = Cm(2.0)
sec.left_margin = Cm(2.2)
sec.right_margin = Cm(2.2)


def shade(cell, hexcolor):
    tcPr = cell._tc.get_or_add_tcPr()
    el = OxmlElement("w:shd")
    el.set(qn("w:val"), "clear")
    el.set(qn("w:color"), "auto")
    el.set(qn("w:fill"), hexcolor)
    tcPr.append(el)


def cell_margins(table, top=40, bottom=40, left=70, right=70):
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


def h1(text, pagebreak=False):
    if pagebreak:
        doc.add_paragraph().add_run().add_break(WD_BREAK.PAGE)
    p = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(10)
    p.paragraph_format.space_after = Pt(6)
    p.paragraph_format.keep_with_next = True
    p.alignment = WD_ALIGN_PARAGRAPH.LEFT
    r = p.add_run(text.upper())
    r.bold = True
    r.font.size = Pt(13)
    r.font.color.rgb = NAVY
    pPr = p._p.get_or_add_pPr()
    pbdr = OxmlElement("w:pBdr")
    b = OxmlElement("w:bottom")
    b.set(qn("w:val"), "single")
    b.set(qn("w:sz"), "8")
    b.set(qn("w:space"), "2")
    b.set(qn("w:color"), "1F3864")
    pbdr.append(b)
    pPr.append(pbdr)


def h2(text):
    p = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(10)
    p.paragraph_format.space_after = Pt(4)
    p.paragraph_format.keep_with_next = True
    p.alignment = WD_ALIGN_PARAGRAPH.LEFT
    r = p.add_run(text)
    r.bold = True
    r.font.size = Pt(11.5)
    r.font.color.rgb = NAVY


def para(text, size=11, italic=False, space_after=6, bold=False, align="just", color=None, indent=0.0):
    p = doc.add_paragraph()
    p.paragraph_format.space_after = Pt(space_after)
    p.paragraph_format.left_indent = Cm(indent)
    p.alignment = {"just": WD_ALIGN_PARAGRAPH.JUSTIFY, "left": WD_ALIGN_PARAGRAPH.LEFT,
                   "center": WD_ALIGN_PARAGRAPH.CENTER}[align]
    for i, c in enumerate(text.split("**")):
        if not c:
            continue
        r = p.add_run(c)
        r.bold = bold or (i % 2 == 1)
        r.italic = italic
        r.font.size = Pt(size)
        if color is not None:
            r.font.color.rgb = color
    return p


def bullet(text, size=10):
    p = doc.add_paragraph(style="List Bullet")
    p.paragraph_format.space_after = Pt(2)
    p.paragraph_format.left_indent = Cm(0.8)
    p.paragraph_format.first_line_indent = Cm(-0.45)
    p.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY
    for i, c in enumerate(text.split("**")):
        if not c:
            continue
        r = p.add_run(c)
        r.bold = i % 2 == 1
        r.font.size = Pt(size)


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


def table(headers, rows, widths, size=7.8, tag_col=None, head_fill="1F3864"):
    scale = 16.6 / sum(widths)
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
        shade(c, head_fill)
    for i, row in enumerate(rows):
        cells = t.add_row().cells
        row_flags(t.rows[-1])
        for j, val in enumerate(row):
            c = cells[j]
            c.width = Cm(widths[j])
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
            for k, ch in enumerate(txt.split("**")):
                if not ch:
                    continue
                r = p.add_run(ch)
                r.bold = bold or (k % 2 == 1)
                r.font.size = Pt(size)
                r.font.name = TBL
                if color is not None:
                    r.font.color.rgb = color
        if i % 2 == 1:
            for j in range(len(row)):
                shade(cells[j], "EEF1F7")
        if tag_col is not None:
            sv = str(row[tag_col]).replace("!!", "")
            fill = None
            if sv.startswith("USE"):
                fill = "D9EAD3"
            elif sv.startswith("RESPEC"):
                fill = "FFF0CC"
            elif sv.startswith("DROP"):
                fill = "F8D7DA"
            elif sv.startswith("MEASURE"):
                fill = "DEEAF6"
            if fill:
                shade(cells[tag_col], fill)
    fixed_layout(t, sum(widths))
    for j, gc in enumerate(t._tbl.tblGrid.findall(qn("w:gridCol"))):
        gc.set(qn("w:w"), str(int(widths[j] * 567)))
    for row in t.rows:
        for j, c in enumerate(row.cells):
            c.width = Cm(widths[j])
    return t


def footer():
    p = sec.footer.paragraphs[0]
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r = p.add_run("BinGenie — Carry-Forward Specification  |  Page ")
    r.font.size = Pt(8)
    r.font.name = TBL
    r.font.color.rgb = GREY
    fld = OxmlElement("w:fldSimple")
    fld.set(qn("w:instr"), "PAGE")
    run = OxmlElement("w:r")
    t = OxmlElement("w:t")
    t.text = "1"
    run.append(t)
    fld.append(run)
    p._p.append(fld)
    r2 = p.add_run(" of ")
    r2.font.size = Pt(8)
    r2.font.name = TBL
    fld2 = OxmlElement("w:fldSimple")
    fld2.set(qn("w:instr"), "NUMPAGES")
    run2 = OxmlElement("w:r")
    t2 = OxmlElement("w:t")
    t2.text = "1"
    run2.append(t2)
    fld2.append(run2)
    p._p.append(fld2)


footer()

# ================================================================== cover
for _ in range(2):
    doc.add_paragraph()
p = doc.add_paragraph()
p.alignment = WD_ALIGN_PARAGRAPH.CENTER
r = p.add_run("WHAT WE CAN ACTUALLY USE")
r.bold = True
r.font.size = Pt(22)
r.font.color.rgb = NAVY
p = doc.add_paragraph()
p.alignment = WD_ALIGN_PARAGRAPH.CENTER
r = p.add_run("The carry-forward specification for the current-semester report")
r.italic = True
r.font.size = Pt(12)
r.font.color.rgb = GREY

doc.add_paragraph()
p = doc.add_paragraph()
p.alignment = WD_ALIGN_PARAGRAPH.CENTER
r = p.add_run("BIN GENIE")
r.bold = True
r.font.size = Pt(28)
r.font.color.rgb = NAVY
p = doc.add_paragraph()
p.alignment = WD_ALIGN_PARAGRAPH.CENTER
r = p.add_run("Waste Segregating Smart Bin\nIoT-Enabled Waste Segregation using a Carousel Disc Mechanism\nand AI-Driven Image Recognition")
r.font.size = Pt(11)
r.font.color.rgb = GREY

doc.add_paragraph()
t = doc.add_table(rows=0, cols=2)
t.style = "Table Grid"
t.autofit = False
cell_margins(t)
for k, v in [("Purpose", "Separate the project's defensible content from the content that must be re-specified,\nso the new report is built on solid ground rather than on corrected guesses."),
             ("Companion", "IDFP_BinGenie_Technical_Audit.docx — the issue register this document answers.\nIssue IDs (A-1, C-5, D-1 …) refer to that audit."),
             ("Verdict tags", "USE = carry forward as it stands.   RESPECIFY = keep the concept, change the number or wording.\nDROP = remove.   MEASURE = keep, but it needs a logged measurement before it can be claimed."),
             ("Core finding", "The mechanical architecture and the system concept are sound and are the strongest part of\nthe project. The weak part is everything that is a claim rather than a design.\nSo: design claims stay, performance claims get measured or relabelled.")]:
    c = t.add_row().cells
    row_flags(t.rows[-1])
    c[0].width = Cm(3.4)
    c[1].width = Cm(13.2)
    shade(c[0], "1F3864")
    p0 = c[0].paragraphs[0]
    p0.paragraph_format.space_after = Pt(0)
    rr = p0.add_run(k)
    rr.bold = True
    rr.font.size = Pt(9)
    rr.font.name = TBL
    rr.font.color.rgb = RGBColor(0xFF, 0xFF, 0xFF)
    p1 = c[1].paragraphs[0]
    p1.paragraph_format.space_after = Pt(0)
    p1.paragraph_format.line_spacing = 1.0
    rr = p1.add_run(v)
    rr.font.size = Pt(8.5)
    rr.font.name = TBL
fixed_layout(t, 16.6)
for row in t.rows:
    row.cells[0].width = Cm(3.4)
    row.cells[1].width = Cm(13.2)

# ================================================================== 1
h1("1. The one-line answer", pagebreak=True)
para("**Use the machine. Re-decide the numbers.** Your project has two halves, and they are in very different states. "
     "The physical system — the dual carousel disc, the four detachable compartments, the sensor set, the "
     "Raspberry Pi control loop, the 3.2 s cycle — is a genuine, buildable, defensible piece of engineering. Nothing "
     "about it needs to be invented or softened. The second half — every number that describes how well it performs — "
     "is currently a set of estimates that do not agree with each other, and that is the half a reviewer attacks.")
para("So the rule for the new report is simple: **anything that is a design decision can be stated as fact; anything "
     "that is a performance claim must be either measured or explicitly labelled a target.** Both documents already "
     "blur that line, which is why the same accuracy appears four times with four values.")

caption("Table 1.1 — The project at a glance: what survives, what must be re-decided.")
table(["Element", "What you have", "Verdict", "What the new report should say"],
      [["Dual carousel disc mechanism", "Two Ø380 × 18 mm ABS discs, upper with a cup extrusion, lower with arc apertures, NEMA 17 + DRV8825, 4 index positions",
        "USE", "Describe as designed and built. Dimension it. This is the novelty — lead with it."],
       ["Four detachable compartments", "Ø156 × 370 mm HDPE, colour-coded, independently removable", "USE",
        "Keep, with the four cardinal positions on the 112 mm centre radius dimensioned (§4)."],
       ["Sensor suite", "Moisture, capacitive, inductive, ToF, load cell, MQ-135, OV5647 camera", "USE",
        "Keep the set. State the part numbers and what each one actually decides (§3)."],
       ["Raspberry Pi 4 control", "Pi 4 Model B, 4 GB, Python + TFLite, 6-state machine", "USE",
        "Keep. Add the interface table (§3.4) — it makes the architecture look engineered, not hand-drawn."],
       ["Cycle time 3.2 s / 3–4 s", "Consistent in both documents", "USE",
        "Keep as measured. Add the implied 1,125 items/h theoretical throughput."],
       ["EfficientNet-B3 as the model", "Pre-trained, 224×224, TFLite deployment", "USE",
        "Keep the choice, justify it against MobileNetV2 and ResNet-50 with your own measured numbers, not Fig. 6 as printed."],
       ["Classification accuracy", "95.41% / 97.7% / 98.3% / 93.8% / 94.04%", "!!RESPECIFY",
        "One value, one test set, one run. Recomputed from your own matrix it is 94.04% — use that, or re-run."],
       ["Dataset description", "“TrashNet, Kaggle and TACO”, 1,800 per class", "!!RESPECIFY",
        "Per-source counts, licences, classes and the 4-stream mapping (§6)."],
       ["Market sizing", "TAM 343 M people, Chennai 250,000", "!!RESPECIFY",
        "Rebuild in households and ₹ crore from census figures (§7)."],
       ["Impact claims", "60–80%, 70%, 30%, 20%", "!!RESPECIFY",
        "Move to a section titled “Expected impact and design targets”."],
       ["Financial projections", "Two Year-1 revenues, Y5 below Y2", "!!RESPECIFY",
        "One P&L from units × price (§8)."],
       ["Survey percentages", "82% / 68% / 90% / 85%, no n", "!!RESPECIFY", "Re-run with a stated n and method, or drop."],
       ["Fintech persona and survey bullets", "“Sarah, cash flow, budgeting”", "!!DROP", "Delete. Nothing about this project."],
       ["Blockchain literature (Nguyen, Dasaklis)", "Cited but irrelevant to the build", "!!DROP", "Delete from the review."],
       ["“±1.8° achieved / ±2° improvement”", "Contradictory and too loose for the geometry", "!!RESPECIFY",
        "Specify ≤ 0.5° and give the measurement method (§9, log 3)."],
       ["Inference time", "3–7 s / 1.92 s / 65 ms", "!!MEASURE", "One median, with hardware state, quantisation and batch size."],
       ["Battery runtime 6–8 h", "From 12 V 7 Ah = 84 Wh", "!!MEASURE", "Power log × duty cycle, or upsize the pack (§9)."],
       ["IoT latency 300 ms / 98% uptime", "No monitoring period", "!!MEASURE", "Median and p95 over a stated run (§9)."]],
      [3.4, 4.6, 2.0, 6.6], size=7.4, tag_col=2)
note("Six elements are USE — they carry the report. Seven are RESPECIFY and three are MEASURE — they need a decision or a log, not a re-write. Two are plain deletions.")

# ================================================================== 2
h1("2. The architecture you can defend, stated properly", pagebreak=True)
para("Both documents describe the architecture in prose that wanders between modules, assembly and workflow. The figure "
     "below is the same architecture, made specific: four columns (input and sensing, processing, actuation, output and "
     "telemetry), the actual interface for each link, and the power distribution as a separate bus. This is the form it "
     "should take in the new report — it reads as a designed system, and every box in it is something you can point to on "
     "the prototype.")

p = doc.add_paragraph()
p.alignment = WD_ALIGN_PARAGRAPH.CENTER
p.paragraph_format.space_before = Pt(6)
p.paragraph_format.space_after = Pt(2)
p.add_run().add_picture(FIG, width=Cm(16.4))
caption("Figure 2.1 — System architecture. Four functional columns, an explicit interface key, and the power bus separated from the signal path.")
note("Use this figure (or redraw it in the same layout) in Chapter 7 of the new report. What makes it credible is not the boxes but the "
     "interface labels: MIPI-CSI, I²C + ADC, GPIO STEP/DIR/EN, MQTT. A block diagram without interfaces is a sketch.")

para("**Why this form is stronger than the existing one:** the current Figure 7.4 in the report is a generic "
     "sensor➜controller➜actuator chain that could describe any project. The version above is specific to your machine — "
     "it shows that the disc has an index sensor and therefore closed-loop positioning, that the sensing bus is I²C plus "
     "an ADC rather than a vague “sensors”, and that the motor runs on a 12 V rail while the logic runs on 3.3 V. Those "
     "three details alone are what separate a designed system from a described one.")

# ================================================================== 3
h1("3. Hardware: the exact set to specify", pagebreak=True)
para("This is the part of the project you own outright. Nail the part numbers and the report stops sounding speculative. "
     "Where the previous documents were vague (“moisture sensor”, “gas sensor”), specify the device and say what it decides.")

h2("3.1 Sensing and the decision each sensor makes")
table(["Sensor", "Suggested part", "Interface", "What it decides", "Limitation to state openly"],
      [["Camera", "OV5647 5 MP (or OV5640)", "MIPI-CSI", "Primary class: material and shape features",
        "Needs even lighting at the inlet; 65 ms inference is not credible without INT8 + XNNPACK"],
       ["Moisture", "Resistive/capacitive soil probe", "ADC (ADS1115)", "Wet vs dry — the biodegradable trigger",
        "Reads surface moisture only; a wet plastic bag reads “wet”. Must be fused, not trusted alone."],
       ["Capacitive proximity", "LJC18A3-H-Z/BX or TTP223", "GPIO / ADC", "Presence of dielectric material (plastic, paper)",
        "Cannot separate plastic from glass or paper by itself"],
       ["Inductive proximity", "LJ12A3-4-Z/BX", "GPIO", "Ferrous metal → electronic/metal class",
        "Blind to aluminium and to plastic-cased electronics. This is the sensor-fusion gain you can demonstrate."],
       ["ToF", "VL53L0X", "I²C", "Object present and its distance → gates capture",
        "Ambient IR and dark targets degrade range"],
       ["Load cell", "5 kg bar + HX711", "GPIO (bit-banged)", "Mass per item → volumetric and fill estimate",
        "Needs tare and calibration; drift with temperature"],
       ["Gas", "MQ-135", "ADC", "Odour / air-quality index for hygiene logging",
        "Cross-sensitive; report as a relative index, never as a ppm concentration"]],
      [2.4, 3.4, 2.2, 4.2, 4.4], size=7.4)
note("The “limitation” column is not weakness — it is the argument for sensor fusion. Stating that the inductive sensor is blind to aluminium "
     "is what justifies the camera, and the camera is what justifies the fusion algorithm. Reviewers reward that reasoning.")

h2("3.2 Actuation and the tolerance you must re-specify")
table(["Item", "Specification to write", "Why this value"],
      [["Stepper", "NEMA 17, 1.8°/step (200 steps/rev), 1.7 A/phase", "Standard, cheap, and enough torque for two ABS discs through a coupling"],
       ["Driver", "DRV8825, 1/16 microstepping", "0.1125° per microstep — the resolution is not the problem, so say so"],
       ["Transmission", "Direct coupling, or 5:1 belt reduction if backlash > 0.5°", "Backlash is the actual error source, not resolution"],
       ["Index feedback", "Home/index sensor (optical or hall) + encoder count per position", "Turns an open-loop guess into a measured position"],
       ["Angular repeatability", "!!≤ 0.5°, verified over 100 cycles", "The 2.4 mm gap between compartments allows no more (§4)"],
       ["Cycle time", "3.2 s average per item", "Already consistent across both documents — keep it"],
       ["Throughput", "≈1,125 items/h theoretical", "3,600 / 3.2 — state it, it is the number a reviewer compares with other systems"]],
      [2.8, 6.2, 7.6], size=7.6, tag_col=None)
note("Delete the sentence in the old paper that proposes “±2°” as an improvement — the old report already claims 1.8°, so the "
     "improvement reads as a regression. Replace it with the ≤0.5° specification and the reason for it.")

h2("3.3 The four-stream decision logic — the missing table")
para("This is the single most valuable thing you can add, because it converts your six-class model into a four-compartment "
     "machine and shows you have thought about it. Put this table in Chapter 7 immediately after the class list.")

table(["Model output (6-class)", "Compartment (4-stream)", "Fusion rule that overrides the camera", "Rationale"],
      [["Organic", "Biodegradable (wet)", "Moisture above threshold confirms; low moisture + high confidence may keep Organic", "Wet fraction is the compostable stream"],
       ["Plastic", "Dry", "Capacitive present + inductive absent", "Recyclable dry fraction"],
       ["Paper / Cardboard", "Dry", "Capacitive present, low mass", "Same stream as plastic for collection purposes"],
       ["Glass", "Dry", "Capacitive present, high mass, no inductive", "Separate at the MRF, not in the bin"],
       ["Metal", "Electronic", "Inductive high → override to Electronic regardless of camera", "Metal recovery is the highest-value stream"],
       ["E-waste", "Electronic", "Inductive high or camera confidence ≥ threshold", "Battery-bearing items must not go to Dry"],
       ["Medical waste", "!!Residual (unsorted)", "No override — always Residual", "Health-and-safety decision: never auto-sort hazardous waste"],
       ["Any class, confidence < τ", "Residual (unsorted)", "Sensor vote decides; ties resolve to Residual", "Fail-safe: an uncertain item must not contaminate a clean stream"]],
      [4.0, 3.4, 5.4, 3.8], size=7.6)
caption("Table 3.1 — The class-to-compartment mapping. Currently missing from both documents.")
note("Two sentences to add under this table: (i) the threshold τ is a tuned parameter and its value is reported in the results; "
     "(ii) a Residual outcome is not a failure — it is the designed behaviour for anything the system is not confident about.")

h2("3.4 Interface table — the detail that makes the architecture verifiable")
table(["Signal", "From → To", "Physical interface", "Rate / note"],
      [["Image", "OV5647 → Pi 4", "MIPI-CSI 2-lane", "640×480 preview, 224×224 inference crop"],
       ["Sensor analogue", "Moisture, MQ-135, load cell → Pi 4", "ADS1115 over I²C (0x48)", "16-bit, 10–100 SPS depending on channel"],
       ["Proximity / metal", "Capacitive, inductive → Pi 4", "GPIO digital inputs", "Debounced 20 ms in firmware"],
       ["Distance", "VL53L0X → Pi 4", "I²C (0x29)", "30–50 ms per ranging cycle"],
       ["Motor", "Pi 4 → DRV8825", "GPIO STEP / DIR / EN + PWM", "STEP at 200–1,600 Hz depending on microstep"],
       ["Position", "Index sensor → Pi 4", "GPIO interrupt", "Edge-triggered; position counter in firmware"],
       ["Power — logic", "Buck → Pi 4", "5 V, 5 A", "≈90% efficiency; ripple under 50 mV"],
       ["Power — motor", "Battery → DRV8825", "12 V direct", "Common ground with logic; separate rail"],
       ["Telemetry", "Pi 4 → broker", "Wi-Fi, MQTT over TCP", "Publish on state change + 60 s heartbeat"]],
      [2.4, 4.6, 4.4, 5.2], size=7.6)
note("Every row here is a fact about your build that no reviewer can argue with. That is exactly the kind of content the new report needs more of.")

# ================================================================== 4
h1("4. Geometry: the numbers to draw", pagebreak=True)
para("The dimensions in the old documents are correct but never assembled into a layout, which is why neither the "
     "2.4 mm clearance problem nor the arrangement itself was ever checked. This is the layout they imply. Put it in the drawing and the report gains a "
     "level of detail that is unusual at this stage.")

table(["Dimension", "Value", "Derivation / note"],
      [["Overall height", "750 mm", "As stated in both documents"],
       ["Overall width", "450 mm", "As stated"],
       ["Compartment", "4 × Ø156 × 370 mm", "As stated; 370 × 2 = 740 mm inside a 750 mm body is tight — check the 2×2 stack"],
       ["Compartment arrangement", "Four at 90° (cardinal), centre radius 112 mm", "Each outer edge is flush with the disc rim. A 2×2 square cluster reaches 236 mm from the axis and cannot fit a Ø380 disc; four in a row need 624 mm in a 450 mm body."],
       ["Compartment centre radius", "112 mm", "(380 − 156)/2 — the whole layout is bounded by this"],
       ["Gap between compartment circles", "2.4 mm", "112√2 − 156 — this is why 0.5° repeatability is required"],
       ["Disc", "2 × Ø380 × 18 mm, ABS", "As stated"],
       ["Disc rise per item", "≈90° per index", "Four 90° positions; 50 steps per index at 1/16 microstep"],
       ["Index time budget", "≈0.8–1.2 s", "Leave the rest of the 3.2 s cycle for inference, drop and reset"],
       ["Head volume available", "≈380 mm of height above the compartments", "750 − 370; enough for Pi, driver, buck and wiring"],
       ["Materials", "ABS discs, HDPE bins, powder-coated MS frame, PLA brackets", "As stated — keep, and say why (mass, corrosion, printability)"]],
      [4.6, 4.2, 7.8], size=7.6)
caption("Table 4.1 — Dimension set for the new drawing.")
note("If the 2×2 stack plus 370 mm compartments will not fit the 750 mm height, change the height in the new report rather than "
     "leaving the three numbers in conflict. Pick one set and use it in the drawing, the table and the text.")

# ================================================================== 5
h1("5. Performance: what becomes a result and what becomes a target", pagebreak=True)
para("This is the section that fixes the audit's biggest problem. Split every performance statement into one of three "
     "boxes and never let a number sit in the wrong one.")

table(["Box", "Heading to use in the report", "What goes in it", "How it is worded"],
      [["Measured", "7.x Experimental results", "Cycle time, index repeatability, per-class metrics from one logged run, sensor-level accuracies",
        "“Measured on N items under condition C using instrument I.”"],
       ["Derived", "7.x Computed performance", "Throughput (3,600/3.2), battery runtime at a stated duty cycle, cost per unit",
        "“Computed from the measured cycle time of 3.2 s.”"],
       ["Target", "11.x Expected impact and design targets", "60–80% segregation improvement, 70% less handling, 30% cost reduction, 20% recycling gain",
        "“Design target: … measured by … in the next phase.”"]],
      [2.4, 4.4, 5.4, 4.4], size=7.6)
caption("Table 5.1 — Three boxes for performance statements.")
note("Most of the numbers a reviewer will attack are currently in the wrong box — the impact percentages and the uptime figure in "
     "particular. Moving them is a formatting change with a large credibility return, and it costs no new experiments.")

para("**What you can claim today, honestly, with the prototype you have:**")
for b in ["A four-stream mechanical segregation unit with a dual carousel disc and detachable bins, built and operating.",
          "A complete cycle (detect → classify → index → drop → log) in about 3.2 s, i.e. a theoretical 1,125 items/h.",
          "Sensor-level material discrimination with per-class accuracies of 93% paper, 94% metal, 92% organic, 80% glass and about 68% e-waste — and therefore a measured reason to add vision.",
          "A vision classifier that improves the weakest sensor classes, with the improvement on e-waste and glass reported as the headline fusion gain rather than the overall accuracy.",
          "A working class-to-compartment decision rule including a fail-safe Residual path for hazardous or low-confidence items.",
          "A modular mechanical architecture in which head unit, discs and compartments are independently serviceable."]:
    bullet(b, size=10)
para("**What you cannot claim yet, and should replace with a target or a measurement plan:** collection-cost reduction, "
     "recycling-rate improvement, source-segregation improvement across a population, manual-handling reduction, uptime, "
     "and any single “overall accuracy” other than the one your logged test set produces.", size=10.5)

# ================================================================== 6
h1("6. The model and the dataset — what to write instead", pagebreak=True)
para("The model choice is fine. What is not fine is that the report never says how many images came from where, and that "
     "the class set does not match the compartments. Both are fixable with a table and a paragraph.")

h2("6.1 Dataset provenance table — required before any metric")
table(["Source", "Licence / access", "Classes available", "Images used", "Role"],
      [["TrashNet (Stanford)", "Open, research use", "Glass, paper, cardboard, plastic, metal, trash", "__ (≤ 2,527 total)",
        "Base for the dry recyclable classes"],
       ["Kaggle — Smart Waste / Waste Classification", "Open, per-dataset licence", "Organic, recyclable, and variants", "__", "Organic class and bulk volume"],
       ["TACO (Trash Annotations in Context)", "CC BY 4.0", "60 litter categories, in-the-wild scenes", "__", "Hard cases: partial, cluttered, low-light"],
       ["Own capture (phone camera at the inlet)", "Owned", "All four streams, Indian MSW mix", "__", "Domain match to the actual bin, and the per-condition results"],
       ["**Total**", "", "6 model classes", "**__**", "Report the exact count after cleaning"]],
      [4.4, 3.0, 4.2, 2.2, 2.8], size=7.4)
note("Fill the blanks with real counts. If the total is 11,280, fine — but then the test set, the confusion matrix and the "
     "split percentages must all be consistent with 11,280. If the total is smaller, say so. A smaller, honestly described "
     "dataset is far stronger than a large one that does not add up.")

h2("6.2 What the results section must contain, in this order")
for i, b in enumerate([
    "Test-set definition: total images, images per class, and the split percentages. One sentence.",
    "One confusion matrix, six classes, with a support column.",
    "Per-class precision, recall and F1 computed from that matrix (not typed in separately), plus macro-F1 and overall accuracy.",
    "Sensor-only baseline on the same test items — this is your fusion gain and it is the most original result you have.",
    "The four-stream decision accuracy after applying Table 3.1, which is the number that actually describes the machine.",
    "The qualitative failure cases: what the system gets wrong and why (glass vs plastic, wet plastic bags, aluminium)."], 1):
    para(f"**{i}. {b}**", size=10.5, space_after=3)

para("Reporting macro-F1 alongside overall accuracy is not a formality: with unequal class supports the two diverge, and "
     "a reviewer who recomputes macro-F1 from your matrix will trust the report far more if it is already there.", size=10.5)

# ================================================================== 7
h1("7. Market sizing you can defend — the method, in your units", pagebreak=True)
para("The previous numbers cannot be salvaged, because they are built in people and a bin is sold in units. Here is the "
     "same exercise rebuilt in households, with every input traceable. Replace the two placeholders with your own survey "
     "figures and the section becomes defensible.")

table(["Level", "Definition", "Input", "Source", "Result"],
      [["TAM — India", "Urban households addressable by a source-segregation device", "≈525 M urban ÷ 4.4 persons/household",
        "Census 2011 urban share 31.2%; 2026 population ≈1.46 bn", "≈119 M households"],
       ["SAM — Tamil Nadu", "Urban households in Tamil Nadu", "34.9 M urban ÷ 4.0",
        "Census 2011: TN 72.1 M, urban 48.4%", "≈8.7 M households"],
       ["SOM — Chennai", "Chennai households × realistic 5-year penetration", "1.35 M × __%",
        "Chennai Corporation 4,646,732 (2011); ≈5.39 M (2025 est.)", "≈__ units"],
       ["Value", "SOM × unit price", "__ × ₹__", "Your BOM + target margin", "₹__ crore"]],
      [2.8, 4.2, 3.4, 4.0, 2.2], size=7.4)
caption("Table 7.1 — Bottom-up sizing. Two placeholders remain: your penetration assumption and your price.")
note("If the review panel is not business-focused, this table can be short. What matters is that it is in households and rupees, "
     "and that every population figure carries its year and source. The old “343 million individuals” cannot be defended under any questioning.")

# ================================================================== 8
h1("8. Money: the smallest version that survives", pagebreak=True)
para("You do not need a sophisticated financial model — you need one that does not contradict itself. Three commitments "
     "make the chapter safe, and each is a ten-minute edit.")

for b in ["**One price, in one currency.** Quote ₹ throughout. If you keep the USD figures, state “USD 1 = ₹83” once and use it everywhere.",
          "**One revenue series.** Units sold × price per unit, for five years, monotone. If revenue falls in Year 5, the table must explain why.",
          "**Break-even is a month, not a year.** Compute cumulative cash flow month by month and state the month it turns positive. With two profitable years already claimed, “break-even in Year 2” is not a statement that can be made."]:
    bullet(b, size=10)

para("And one number is missing from both documents that a reviewer will ask for in the first five minutes: **what does one "
     "unit actually cost you to build?** Publish the BOM. An indicative build for this specification lands in the "
     "₹17,000–19,000 range before assembly and channel margin — Pi 4 ≈₹5,000, camera ≈₹800, six sensor modules ≈₹2,500, "
     "NEMA 17 + DRV8825 ≈₹1,600, 12 V 7 Ah pack + BMS ≈₹2,000, discs, bins, frame and 3D prints ≈₹5,000. Your own figures "
     "will be more accurate; the point is that the table exists and the price is derived from it rather than asserted.", size=10.5)

# ================================================================== 9
h1("9. Measurement plan — what to log before you write the results", pagebreak=True)
para("Every MEASURE tag in Table 1.1 closes with one of these four logs. Each is a few hours of work and each converts an "
     "unsupported claim into a defended one. If the template's deadline is tight, do logs 1 and 3 first: they carry the "
     "most weight.")

table(["#", "Log to keep", "Procedure", "What it lets you claim", "Effort"],
      [["1", "Inference timing", "100 items, TFLite INT8, single-image batch, 10 warm-up runs discarded, median and p95 recorded, Pi power mode noted",
        "One honest inference time, replacing 3–7 s / 1.92 s / 65 ms", "2 h"],
       ["2", "Classification test", "Held-out set, per-class support recorded, one matrix printed, metrics computed in code not by hand",
        "One accuracy + macro-F1 that survives recomputation", "4 h"],
       ["3", "Index repeatability", "Home the disc, command each of the 4 positions 25 times, record encoder count and dial-gauge deviation",
        "“≤ 0.5° over 100 cycles” with a distribution, replacing the 1.8° claim", "3 h"],
       ["4", "Power and runtime", "Log V and I at idle, during inference, and during actuation; compute Wh per cycle; extrapolate to the pack",
        "Runtime at a stated duty cycle, replacing “6–8 hours”", "3 h"]],
      [0.8, 3.2, 5.6, 4.6, 1.4], size=7.4)
caption("Table 9.1 — Four logs, about twelve hours total.")
note("With these four logs the results chapter becomes defensible in full. Without them, every performance sentence in the report "
     "is a sentence a reviewer can put a question mark against.")

# ================================================================== 10
h1("10. Chapter-by-chapter carry-forward map", pagebreak=True)
para("How the old material should be redistributed into the new template, once it arrives. This is the plan; the template "
     "will only decide the numbering.")

table(["Old material", "Old location", "New location", "Treatment"],
      [["Thesis statement, motivation, four-category objective", "Paper §1–1.1", "Introduction", "Keep — tighten to one page"],
       ["Literature review (paper's 20 references)", "Paper §2", "Literature review", "Keep, convert to IEEE numeric, add the report's 3 traceable citations"],
       ["Module-level architecture", "Paper §3.1", "Design and architecture", "Rebuild as Figure 2.1 with interfaces"],
       ["Prototype dimensions, assembly, disc design", "Paper §3.2; Report §7.3", "Design and architecture", "Keep — add Table 4.1 and the 2×2 layout"],
       ["Decision framework, fusion rules, control logic", "Paper §3.3", "Design and architecture", "Keep, and add Table 3.1 (class → compartment)"],
       ["Integration, actuation, firmware, workflow", "Paper §3.4", "Design and architecture", "Keep, add Table 3.4 (interfaces)"],
       ["Dataset description", "Paper §4", "Model development", "Replace with the provenance table (§6.1)"],
       ["Sensor and CNN results", "Paper §5.1", "Results", "Replace both matrices with one consistent run; add macro-F1"],
       ["Training curves, architecture comparison", "Paper §5.2; Report Fig 7.5–7.6", "Results", "Keep the curves; re-plot the comparison with your own timings"],
       ["Validation (accuracy, cycle, IoT)", "Paper §5.4", "Results", "Keep cycle time; re-derive accuracy; IoT latency only if logged"],
       ["Proposed improvements", "Paper §5.3", "Conclusion and future scope", "Keep, but delete the ±2° regression and fix the tolerance"],
       ["Problem statement, market, surveys", "Report §2", "Introduction / market", "Rewrite market per §7; re-run or drop the survey"],
       ["SDG alignment", "Report §3", "Introduction or a short dedicated section", "Keep the reasoning; move the impact numbers to targets"],
       ["Business model, revenue, GTM", "Report §8", "Business plan, if the template keeps it", "Keep the structure, fix the numbers per §8"],
       ["Financial plan", "Report §9", "Business plan", "Rebuild one P&L; publish the BOM"],
       ["Team and roadmap", "Report §10", "Team and execution", "Keep, fill every blank row"],
       ["KPI appendix, positive-justification appendix", "Report App. II–III", "Appendices", "Keep; delete leftover template instructions"],
       ["Conclusions", "Paper §6; Report §11", "Conclusion and future scope", "Merge; state one accuracy and one next step"]],
      [4.8, 3.4, 3.6, 5.0], size=7.3)
note("Nothing of substance is thrown away except the fintech persona, the two financial survey bullets and the blockchain citations. "
     "The rest is re-organised and re-numbered — which is exactly what a carry-forward report should be.")

# ================================================================== 11
h1("11. What to hand over next", pagebreak=True)
para("So that the report can be built in one pass rather than in four, these are the items only you can supply. Everything "
     "else is already settled in this document.")

table(["#", "Item", "Format needed", "Where it goes"],
      [["1", "Dataset counts per source and per class, after cleaning", "A single table of numbers", "Table 6.1"],
       ["2", "The one test run: model file, TFLite version, quantisation, Pi power mode, per-class support", "One experiment sheet", "Results"],
       ["3", "Survey: n, method, location, date, questionnaire", "One paragraph + appendix scan", "Market / Appendix"],
       ["4", "Prototype BOM with actual unit costs, and the build cost", "Spreadsheet or list", "Business plan"],
       ["5", "Unit price you intend to quote, and the target margin", "One number each", "Business plan"],
       ["6", "Team roles and any KPI rows that are currently blank (hackathons, grants, incubation)", "Plain text", "Team / Appendix II"],
       ["7", "Photographs: full assembly, head unit open, disc removed, one compartment removed", "Four images ≥ 1 MP", "Design chapter"],
       ["8", "The current-semester template", "DOCX", "Sets the numbering, headings and front matter"]],
      [0.8, 6.6, 4.6, 4.6], size=7.6)
caption("Table 11.1 — Inputs needed from the team.")
note("If items 1–5 are not available before the deadline, the report can still be built: the ambiguous numbers get replaced by the "
     "design-target wording in Table 5.1 and the blanks stay as clearly marked placeholders rather than invented values.")

doc.add_paragraph()
p = doc.add_paragraph()
p.paragraph_format.space_before = Pt(8)
r = p.add_run("In short. ")
r.bold = True
r.font.size = Pt(10.5)
r.font.color.rgb = NAVY
r = p.add_run("Use the machine exactly as built, and describe it with the dimension and interface tables above — that part "
              "is genuinely good work. For the numbers, move every unmeasured claim into a section called “Expected impact "
              "and design targets”, keep exactly one accuracy, and add the four logs in Table 9.1 so that one accuracy is "
              "yours. Then the report says what the project did, instead of what it hopes.")
r.font.size = Pt(10.5)

os.makedirs(OUTDIR, exist_ok=True)
out = os.path.join(OUTDIR, "BinGenie_What_We_Can_Use.docx")
doc.save(out)
print("saved:", out)
