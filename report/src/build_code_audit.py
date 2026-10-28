#!/usr/bin/env python3
"""
Builds report/deliverables/BinGenie_Code_Evidence_Audit.docx

Reads: the two project repositories (cloned to /tmp during the audit)
Writes: a verdict on whether the metrics in the IEOM paper and the lab report
        can be used, with code-level evidence for every conclusion.
"""
import os
from docx import Document
from docx.shared import Pt, Cm, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_BREAK
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.oxml.ns import qn
from docx.oxml import OxmlElement

import re

TOKEN = re.compile(r"(\*\*[^*]+\*\*|`[^`]+`)")


def add_rich(p, text, size, mono_font, base_bold=False, color=None):
    """Render **bold** and `monospace` inline spans."""
    for tok in TOKEN.split(text):
        if not tok:
            continue
        if tok.startswith("**") and tok.endswith("**") and len(tok) > 4:
            r = p.add_run(tok[2:-2]); r.bold = True; r.font.name = "Times New Roman"
            r.font.size = Pt(size)
            if color is not None:
                r.font.color.rgb = color
        elif tok.startswith("`") and tok.endswith("`") and len(tok) > 2:
            r = p.add_run(tok[1:-1]); r.font.name = mono_font
            r.font.size = Pt(size - 0.7)
            r.font.color.rgb = RGBColor(0x24, 0x29, 0x2E)
        else:
            r = p.add_run(tok); r.bold = base_bold; r.font.name = "Times New Roman"
            r.font.size = Pt(size)
            if color is not None:
                r.font.color.rgb = color


NAVY = RGBColor(0x1F, 0x38, 0x64)
RED = RGBColor(0xA6, 0x1B, 0x1B)
GREEN = RGBColor(0x1E, 0x60, 0x33)
GREY = RGBColor(0x40, 0x40, 0x40)
BODY = "Times New Roman"
TBL = "Calibri"
MONO = "Consolas"

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUTDIR = os.path.join(BASE, "deliverables")

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


def para(text, size=11, italic=False, space_after=6, bold=False, align="just", color=None):
    p = doc.add_paragraph()
    p.paragraph_format.space_after = Pt(space_after)
    p.alignment = {"just": WD_ALIGN_PARAGRAPH.JUSTIFY, "left": WD_ALIGN_PARAGRAPH.LEFT,
                   "center": WD_ALIGN_PARAGRAPH.CENTER}[align]
    add_rich(p, text, size, MONO, base_bold=bold, color=color)
    if italic:
        for r in p.runs:
            r.italic = True
    return p


def code(text, size=8.2):
    p = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(3)
    p.paragraph_format.space_after = Pt(4)
    p.paragraph_format.left_indent = Cm(0.5)
    p.paragraph_format.line_spacing = 1.0
    p.alignment = WD_ALIGN_PARAGRAPH.LEFT
    r = p.add_run(text)
    r.font.name = MONO
    r.font.size = Pt(size)
    r.font.color.rgb = RGBColor(0x1A, 0x1A, 0x1A)
    pPr = p._p.get_or_add_pPr()
    sh = OxmlElement("w:shd")
    sh.set(qn("w:val"), "clear")
    sh.set(qn("w:fill"), "F4F5F7")
    pPr.append(sh)
    return p


def bullet(text, size=10):
    p = doc.add_paragraph(style="List Bullet")
    p.paragraph_format.space_after = Pt(2)
    p.paragraph_format.left_indent = Cm(0.8)
    p.paragraph_format.first_line_indent = Cm(-0.45)
    p.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY
    add_rich(p, text, size, MONO)


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
            add_rich(p, txt, size, "Consolas", base_bold=bold, color=color)
            for r in p.runs:
                if r.font.name == "Consolas":
                    pass
                else:
                    r.font.name = TBL
        if i % 2 == 1:
            for j in range(len(row)):
                shade(cells[j], "EEF1F7")
        if tag_col is not None:
            sv = str(row[tag_col]).replace("!!", "")
            fill = None
            if sv.startswith("NO"):
                fill = "F8D7DA"
            elif sv.startswith("PARTIAL"):
                fill = "FFF0CC"
            elif sv.startswith("YES"):
                fill = "D9EAD3"
            elif sv.startswith("REAL"):
                fill = "DEEAF6"
            if fill:
                shade(cells[tag_col], fill)
    fixed_layout(t, 16.6)
    for j, gc in enumerate(t._tbl.tblGrid.findall(qn("w:gridCol"))):
        gc.set(qn("w:w"), str(int(widths[j] * 567)))
    for row in t.rows:
        for j, c in enumerate(row.cells):
            c.width = Cm(widths[j])
    return t


def footer():
    p = sec.footer.paragraphs[0]
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r = p.add_run("BinGenie — Code Evidence Audit  |  Page ")
    r.font.size = Pt(8)
    r.font.name = TBL
    r.font.color.rgb = GREY
    for instr, tail in (("PAGE", None), ("NUMPAGES", " of ")):
        if tail:
            rt = p.add_run(tail)
            rt.font.size = Pt(8)
            rt.font.name = TBL
        fld = OxmlElement("w:fldSimple")
        fld.set(qn("w:instr"), instr)
        run = OxmlElement("w:r")
        t = OxmlElement("w:t")
        t.text = "1"
        run.append(t)
        fld.append(run)
        p._p.append(fld)


footer()

# ==================================================================== cover
for _ in range(2):
    doc.add_paragraph()
p = doc.add_paragraph()
p.alignment = WD_ALIGN_PARAGRAPH.CENTER
r = p.add_run("CODE EVIDENCE AUDIT")
r.bold = True
r.font.size = Pt(22)
r.font.color.rgb = NAVY
p = doc.add_paragraph()
p.alignment = WD_ALIGN_PARAGRAPH.CENTER
r = p.add_run("Can the metrics in the paper and the lab report be used?\nA file-by-file reading of both project repositories")
r.italic = True
r.font.size = Pt(12)
r.font.color.rgb = GREY

doc.add_paragraph()
p = doc.add_paragraph()
p.alignment = WD_ALIGN_PARAGRAPH.CENTER
r = p.add_run("BIN GENIE")
r.bold = True
r.font.size = Pt(26)
r.font.color.rgb = NAVY

doc.add_paragraph()
t = doc.add_table(rows=0, cols=2)
t.style = "Table Grid"
t.autofit = False
cell_margins(t)
for k, v in [("Repositories read", "Smart_waste_classifier_Model — 37 files, 4,257 lines of Python and Markdown\nBINGENIE — Vite / React / shadcn marketing site"),
             ("Method", "Both repositories cloned and read in full. Every script, README and analysis\nnote inspected. Every number in the paper and report traced to a source file\nwhere one exists, and marked unsourced where none does."),
             ("Headline", "Your code is real and it is capable. But it does not produce the numbers in\neither document — and one file in your own repository states plainly that the\ntraining curves were simulated. That file also tells you how to fix this."),
             ("Time to fix", "One training run and one evaluation script — about 90 minutes of wall-clock\ntime — replaces every fabricated number with a real one.")]:
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

# ==================================================================== 1
h1("1. The direct answer", pagebreak=True)
para("**No — none of the model metrics in either document can be used as they stand.** Not because the work is "
     "dishonest, but because the code in your repositories does not compute them. The numbers in the paper and the "
     "report were not produced by this codebase; when you trace each one to a source file, it either does not "
     "exist there, or it means something different from what the document says it means.")
para("**But the news is better than that sounds.** Your repository contains a working evaluation script that will "
     "produce real per-class precision, recall, F1, top-1 accuracy and a confusion matrix, computed in code rather "
     "than typed by hand. It takes one training run to feed it. Everything the report needs is one command away — "
     "it has simply never been run.")

para("Three findings decide the whole question:", space_after=4)
bullet("**The architecture is different.** Both documents report EfficientNet-B3. There is not one occurrence of "
       "“efficientnet”, “tensorflow”, “tflite”, “torch”, “keras”, “resnet” or “mobilenet” anywhere in the "
       "repository. Every model call in the codebase is YOLOv8, through Ultralytics.")
bullet("**The classes are different.** The documents report six classes including Medical Waste and E-waste. The "
       "code trains on ten classes — battery, biological, cardboard, glass, metal, paper, plastic, shoes, clothes, "
       "trash — and Medical Waste does not exist in any form.")
bullet("**The training curves were generated, not measured.** Your own `generate_training_graphs.py` builds them "
       "from an exponential function plus Gaussian noise, and three separate Markdown files in the repository "
       "say so in plain English. Those are the two curves labelled “Model training performance” in the paper.")

para("This matters more than an ordinary error because the report links the repository directly — "
     "“https://github.com/Jaganravi131/Smart_waste_classifier_Model/tree/main” appears on page 21. Anyone who "
     "follows that link can open `JOURNAL_SUBMISSION_SUPPORT.md` and read, in your own repository, that the "
     "training visualisations were simulated. That is the first thing to fix, before any figure is re-plotted.")

# ==================================================================== 2
h1("2. Metric-by-metric verdict", pagebreak=True)
para("Each claim from the two documents, set against what the code can actually produce.")

table(["Claim in the documents", "Where", "Can your code produce it?", "What the code actually contains"],
      [["“EfficientNet-B3 achieves 95.41% overall accuracy”", "Paper §4; Table 1",
        "!!NO", "No EfficientNet anywhere. `train.py` line 64 loads `YOLO(f\"{args.model}-cls.pt\")` — YOLOv8 classification. Default `yolov8s-cls`."],
       ["“Overall accuracy 98.3%” (Table 3 matrix)", "Paper §5.1",
        "!!NO", "No confusion matrix is committed. `eval_per_class.py` can print one, but `runs/` is git-ignored and no weights exist."],
       ["“Up to 97.7% accuracy on Raspberry Pi 4 via TFLite”", "Paper §5.4, §6",
        "!!NO", "No TFLite, no export, no Pi deployment script. The Pi appears in the report, not in the code."],
       ["Per-class precision 87.6–92.1% (Table 7.2)", "Report §7.5.1",
        "!!NO", "These are hand-written. `eval_per_class.py` computes exactly these four columns — it just needs `best.pt` and a `val/` folder."],
       ["Confidence 0.88–0.95 per class", "Report Table 7.2",
        "!!NO — and contradicted", "The one real measurement in the repository reports mean confidence 0.4451–0.5870, with 70.92% of detections below 0.5. The real numbers are half the claimed ones."],
       ["Fig. 5(a)/5(b): accuracy and loss vs epoch", "Paper §5.2",
        "!!NO — simulated", "`generate_training_graphs.py` lines 27, 31, 67, 71 generate these from `0.3 + 0.6*(1-exp(-e/10)) + noise`. Marked “Simulated” in three Markdown files."],
       ["Fig. 6: architecture comparison, EfficientNet-B3 at 93.8% / 65 ms", "Paper §5.4",
        "!!NO", "No benchmark script, no timing code, and no second architecture is ever loaded. This figure has no origin in the repository at all."],
       ["“Validation loss minimum 0.172 at epoch 8”", "Paper §5.2",
        "!!NO", "The simulation produces a loss curve, but the number depends on the random seed at generation time. It was not measured on any model."],
       ["“Detection rate 95.94%” — if used as accuracy", "Not currently used",
        "PARTIAL — misread", "Real, but it is the fraction of video frames in which any box was drawn: 12,810 / 13,352. It says nothing about whether the class was correct."],
       ["“Cycle time 3.2 s”, “angular deviation 1.8°”", "Paper §5.4",
        "PARTIAL — mechanical", "Consistent with the build, but no log exists. Unrelated to these repositories; belongs to the hardware test."],
       ["“40% landfill reduction, 65% recycling, 30% cost”", "Report §2.2, §11.1",
        "!!NO — from a website", "These are `StatCard` placeholder strings in the BINGENIE marketing site. The site also carries invented testimonials from fictional people and institutions."],
       ["“Accuracy 91.2% indoor / 82.4% low light / …”", "Report §7.5.1",
        "!!NO", "No per-condition test harness exists. Nothing in the repository varies lighting or measures it."]],
      [4.4, 2.6, 2.6, 7.0], size=7.3, tag_col=2)
caption("Table 2.1 — Twelve claims, twelve verdicts. Two are partially real; ten have no computational origin.")
note("“Can your code produce it?” = could this number come out of this repository as it exists today. NO means the code needed to "
     "produce it is not there, not that the number is achievable in principle.")

# ==================================================================== 3
h1("3. The four mismatches, in detail", pagebreak=True)

h2("3.1 Architecture: the documents say EfficientNet, the code says YOLOv8")
para("A repository-wide search for the frameworks and architectures named in the paper returns nothing:")
code("$ grep -rniE \"efficientnet|resnet|mobilenet|squeezenet|nasnet|tensorflow|tflite|torch|keras\" .\n(no matches)")
para("Whereas every model instantiation in the repository is Ultralytics YOLOv8:")
code("smart_bin/train.py:64              model = YOLO(f\"{args.model}-cls.pt\")\nsmart_bin/detect_smartbin.py:109    model = YOLO(weights)\nsmart_bin/eval_per_class.py:14      model = YOLO(str(weights))\nsmart_bin/analyze_runtime_bias.py:6 model = YOLO(str(BASE / \"runs\" / ... / \"best.pt\"))")
para("This is not a small discrepancy — it changes the deployment story as well. YOLOv8s-cls is a ~22 MB model "
     "with a different export path (ONNX, NCNN, TFLite through `model.export()`), a different inference profile "
     "on a Raspberry Pi, and a different set of published benchmarks. The paper's comparison figure, which pits "
     "EfficientNet-B3 against ResNet-50, MobileNetV2 and SqueezeNet, describes a study that was not performed here.")

h2("3.2 Classes: four different taxonomies across one project")
table(["Source", "Categories", "Count"],
      [["IEOM paper and lab report §7.3.2", "Biodegradable (wet), Dry, Electronic, Residual", "4 compartments"],
       ["Paper Table 1 and Table 3 (the model)", "Plastic, Metal, Glass, Medical Waste, Organic, E-waste", "6 classes"],
       ["BINGENIE README", "Dry, Wet, Metal, Plastic", "4 categories"],
       ["`smart_bin/prepare_dataset.py` line 23 (training)", "battery, biological, cardboard, glass, metal, paper, plastic, shoes, clothes, trash", "10 classes"],
       ["`smart_bin/detect_smartbin.py` line 26 (`BIN_MAPPING`)", "BIN_1 Hazardous/E-waste · BIN_2 Wet/Organic · BIN_3 Dry Recyclable · BIN_4 Glass · BIN_5 Metal · BIN_6 Plastic · BIN_7 General", "7 bins"],
       ["`smart_bin/data.yaml` (detection config)", "cardboard, glass, metal, paper, plastic, trash", "6 classes"]],
      [4.8, 8.4, 3.4], size=7.5)
caption("Table 3.1 — Every taxonomy in the project. None of them agrees with any other.")
para("The code's own mapping is seven bins, not four. And the one class with safety consequences — battery, mapped "
     "to “BIN_1 (Hazardous / E-waste)” — has no counterpart in a four-compartment machine unless you add it. This "
     "is the same gap the earlier audit flagged, now confirmed from the code side: the classifier and the mechanism "
     "were designed against different category lists.")

h2("3.3 Dataset: 12,259 images in the code, 11,280 in the paper, neither verified")
para("`train.py`'s docstring describes “the 10-class garbage dataset (12,259 images)”. `prepare_dataset.py` splits "
     "it 80:20 into `train/` and `val/` with `SEED = 42`. The paper's Table 1 instead describes 1,500 training + "
     "300 validation + 80 test images per class across six classes — 11,280 images, a three-way 79.8 / 16.0 / 4.3 "
     "split, and a class list that includes two classes the dataset never had.")
para("Neither figure can be checked, because `.gitignore` excludes `smart_bin/datasets/`, `smart_bin/runs/`, "
     "`*.pt`, `*.onnx` and `*.png`. That is good practice for a public repository — but it also means the "
     "repository contains no artefact of any completed run: no weights, no results file, no confusion matrix, no "
     "dataset listing. There is nothing to cite.")

h2("3.4 Evidence: what the repository honestly says about its own figures")
para("To the credit of whoever wrote the repository documentation, it does not hide this. Three files state it "
     "directly:")
code("JOURNAL_SUBMISSION_SUPPORT.md:44\n  \"The visualizations were generated using simulated training data that follows typical\n   deep learning convergence patterns. This approach was necessary because the current\n   implementation focuses on inference rather than training.\"\n\nGRAPH_DESCRIPTIONS_FOR_JOURNAL.md:56\n  \"These graphs were generated using simulated training data ... Since the actual trash\n   detection system operates in inference mode, these visualizations represent expected\n   training dynamics based on similar object detection architectures.\"\n\nFINAL_ANALYSIS_REPORT.md:23,27\n  \"Simulated training and validation accuracy curves\"\n  \"Simulated training and validation loss curves\"")
para("The code generating them is a three-line curve fit:")
code("generate_training_graphs.py:27\ntrain_accuracy = 0.3 + 0.6 * (1 - np.exp(-epochs/10)) + np.random.normal(0, 0.02, len(epochs))\n:31\nval_accuracy   = 0.25 + 0.65 * (1 - np.exp(-epochs/12)) + np.random.normal(0, 0.03, len(epochs))\n:67\ntrain_loss     = 1.5 * np.exp(-epochs/8) + 0.1 + np.abs(np.random.normal(0, 0.05, len(epochs)))")
para("That is not a record of training. It is a drawing of what training usually looks like. In the paper those "
     "same two curves carry the caption “Model training performance: (a) Accuracy vs Epoch; (b) Loss vs Epoch” and "
     "the text reads “both training and validation accuracies exceed 95% after 15 epochs, indicating fast "
     "convergence”. The 95% ceiling exists only because line 28 clips the array at 0.95.")

# ==================================================================== 4
h1("4. Where each number in the report actually came from", pagebreak=True)
para("Tracing each headline number to its most likely origin. This is the section that answers “can we use these?” "
     "precisely — for each one, whether a defensible source exists.")

table(["Number in the document", "Most likely real origin", "Why it cannot be used"],
      [["95.41% overall accuracy", "The 95.94% “detection rate” in ACCURACY_ANALYSIS_SUMMARY.md (12,810 / 13,352 frames)",
        "0.53 points apart, and the underlying quantity is the share of frames with any detection — not classification accuracy. Reproducing it as accuracy converts a weak result into a strong-sounding one."],
       ["“Detection rate” 95.94% itself", "Real, computed by `accuracy_analysis.py:36`",
        "It is a legitimate statistic, but of the wrong thing, and it was produced by a third-party hosted model (see below), not by a model you trained."],
       ["Plastic precision 98.75%", "No source found", "Not in either repository, and not derivable from Table 1's own counts."],
       ["Mean confidence 0.88–0.95", "The repository reports 0.4451–0.5870", "The claim is roughly double the only measurement that exists."],
       ["30% lower collection costs", "`StatCard statValue=\"30%\"` in `src/pages/Index.tsx`: “Lower Collection Costs”",
        "A placeholder string in a template marketing site, alongside fictional testimonials from “Dr. Emily Chen, Green Valley University” and “Michael Rodriguez, Oakridge City”."],
       ["40% landfill reduction, 65% recycling", "The other two StatCards on the same page", "Same placeholder origin, no study behind them."],
       ["65 ms inference for EfficientNet-B3", "No source found", "No timing code exists; and the model named does not appear in the repository."],
       ["Cycle time 3.2 s", "Hardware measurement, not in these repositories", "Defensible, but needs a log. Unrelated to the two repos audited here."]],
      [3.8, 5.6, 7.2], size=7.4)
caption("Table 4.1 — Provenance trace for the eight numbers most likely to be questioned.")

h2("4.1 One more thing that matters: the model behind the real data is not yours")
para("The one genuine dataset of results — 13,352 logged frames — was not produced by a model trained in this "
     "repository. `detect.py` and `plastic.py` both call a hosted third-party model over the network:")
code("detect.py:10      model_id=\"garbage-classification-3/2\",  # Replace with the actual model ID from Universe\nplastic.py        InferencePipeline.init(model_id=..., api_key=os.environ[\"ROBOFLOW_API_KEY\"])")
para("So the detection log describes the behaviour of a published Roboflow model called "
     "`garbage-classification-3/2` on your camera feed. That is a legitimate thing to study — but it is not "
     "“our trained model”, and in a viva it is the first question a reviewer will ask.")

h2("4.2 What that real log actually shows")
table(["Quantity", "Value", "What it implies"],
      [["Frames analysed", "13,352 over ~13 minutes", "About 17 frames per second — a single continuous session"],
       ["Frames with any detection", "12,810 (95.94%)", "The model usually finds something, not that it finds the right thing"],
       ["Frames with no detection", "542 (4.06%)", "—"],
       ["Dominant class", "Paper — 12,601 detections, 98.37% of all detections", "!!Severe collapse: the model called almost everything paper. This is a failure mode, not a result."],
       ["All other classes combined", "209 detections (1.63%)", "Glass 149 · Cardboard 26 · Plastic 24 · Metal 10"],
       ["Overall mean confidence", "≈ 0.49", "!!Below any sensible operating threshold"],
       ["Detections below 0.5 confidence", "9,085 (70.92%)", "Seven in ten detections were low-confidence"],
       ["Best class by confidence", "Cardboard, 0.5870", "Still below 0.6"]],
      [4.2, 5.0, 7.4], size=7.5)
caption("Table 4.2 — The only real performance measurement in either repository.")
note("Read honestly, this is a useful negative result: a general-purpose model called over an API collapses onto one class in a "
     "real bin. That is precisely the argument for training on your own stream — and it is a stronger contribution than a "
     "borrowed 98.3%.")

# ==================================================================== 5
h1("5. What your code can produce — and how fast", pagebreak=True)
para("This is the part that matters for the new report. You already wrote the evaluation you need. "
     "`smart_bin/eval_per_class.py` walks the validation folder, runs the model on every image, builds a confusion "
     "matrix in NumPy, and prints exactly the metrics the report claims to have:")

code("smart_bin/eval_per_class.py\n  cm       = np.zeros((len(classes), len(classes)), dtype=int)\n  ...      for every image: model(img) -> r.probs.top1 -> predicted class\n  print(f\"TOP1_ACC: {correct/total:.4f}\")\n  print(\"class,support,precision,recall,f1\")\n  tp = cm[i,i]; support = cm[i,:].sum(); fp = cm[:,i].sum() - tp\n  prec = tp/(tp+fp);  rec = tp/support;  f1 = 2*prec*rec/(prec+rec)\n  print(cm)")

para("That is a correct, standard implementation — per-class precision, recall and F1 derived from the matrix "
     "rather than typed, with support reported. It produces precisely the table the earlier audit said the report "
     "needed (Table 6.2, item 3). It does not need to be written; it needs to be run.")

h2("5.1 The four commands")
table(["#", "Command", "What it gives you", "Time"],
      [["1", "`export ROBOFLOW_API_KEY=...` then `python download_dataset.py`", "The garbage dataset with its generated `data.yaml`", "5 min"],
       ["2", "`python prepare_dataset.py`", "`datasets/cls/train/` and `val/` split 80:20 with a fixed seed — reproducible", "2 min"],
       ["3", "`python train.py --model yolov8n --epochs 50`", "`runs/smart_bin_v1/weights/best.pt`. Use `yolov8n` on CPU; `yolov8s` if you have a GPU", "1–6 h"],
       ["4", "`python eval_per_class.py`", "`TOP1_ACC`, per-class precision / recall / F1 / support, and the full confusion matrix", "2 min"],
       ["5", "`python analyze_runtime_bias.py`", "Per-class runtime and bias check on the trained weights", "5 min"]],
      [0.8, 6.2, 7.2, 2.4], size=7.5)
caption("Table 5.1 — The pipeline already exists in your repository. Only steps 1–4 have never been executed end to end.")

para("Two practical notes. First, use `--model yolov8n` if you are on a CPU — `yolov8s` over 12,259 images at "
     "224 px for 50 epochs is slow without a GPU, and the difference in final top-1 is usually one or two points. "
     "Second, record the run configuration alongside the result — model name, epochs, image size, batch, seed, date "
     "— because that one line is what turns a number into a result.", size=10.5)

para("**After the run, the report's model section becomes:**", space_after=4)
bullet("“YOLOv8n-cls, fine-tuned for 50 epochs on 12,259 images across 10 classes at 224 px, achieved a top-1 "
       "accuracy of __% on a held-out 20% validation split (n = __).”")
bullet("One confusion matrix, printed by `eval_per_class.py`, with the support column included.")
bullet("Per-class precision, recall and F1 from the same run — real numbers, whatever they are. If glass and "
       "plastic are confused, say so; that is the interesting finding, and it is what motivates the inductive "
       "sensor in your bin.")
bullet("The sensor-fusion argument, now supported by your own data rather than by an assertion: vision is weakest "
       "exactly where the inductive and moisture sensors are strongest.")

# ==================================================================== 6
h1("6. If you cannot train before the deadline", pagebreak=True)
para("There is a fallback that keeps the report honest without a training run. It is weaker, but it is defensible, "
     "and it is far better than a number nobody can trace.")

table(["Instead of", "Write"],
      [["“EfficientNet-B3 achieved 95.41% accuracy”", "“The classification stage uses a YOLOv8-cls network. Training and evaluation are scheduled for the next phase; the present work reports the mechanical segregation unit and the sensing architecture.”"],
       ["Fig. 5 accuracy and loss curves", "Delete them. A training curve that was not produced by a training run has no place in a technical report, and a reviewer who asks for the run directory will find nothing."],
       ["Fig. 6 architecture comparison", "Delete it, or replace it with a table of the architectures you considered and the reason you chose YOLOv8 (single-stage, easy TFLite/NCNN export, small footprint)."],
       ["Table 1 and Table 3 confusion matrices", "Delete both. Replace with Table 4.2 of this document — the real detection-log analysis — labelled as “preliminary observation with a published pretrained model”."],
       ["“98.3% accuracy” in the abstract and conclusion", "“A four-stream segregation unit was designed, built and tested; classification accuracy will be reported after the training run scheduled for __.”"],
       ["“40% / 65% / 30% impact” claims", "“Expected impact, to be validated in field trials” — with no numbers, or with the numbers explicitly marked as targets."]],
      [5.0, 11.6], size=7.6)
caption("Table 6.1 — Honest fallback wording if the training run cannot be completed.")

para("The detection-log analysis is genuinely publishable as a finding: a general-purpose model reached only 0.49 "
     "mean confidence and collapsed 98.4% of its predictions onto one class in a real bin environment. That is a "
     "measured, reproducible, useful result — and it is the strongest possible justification for the work you did "
     "next, which was to add sensors and a custom mechanism.")

# ==================================================================== 7
h1("7. What to do, in order", pagebreak=True)

table(["Priority", "Action", "Why it comes first"],
      [["1", "!!Remove the simulated training curves from the paper and the report", "They are the only item that a reader can disprove by opening a file you linked to yourself. Everything else is a gap; this is a contradiction."],
       ["2", "Run steps 1–4 of Table 5.1 and keep `runs/`, `best.pt` and the eval output", "This single run converts ten NO verdicts in Table 2.1 into real results."],
       ["3", "Rewrite the model section around YOLOv8, not EfficientNet", "The architecture claim is currently unsupported by any code. Changing the text is free; changing the model is not necessary."],
       ["4", "Pick one taxonomy and use it everywhere: model, mapping table, drawing, and report", "Four taxonomies exist today (Table 3.1). The code already has a clean 7-bin mapping you can collapse to 4."],
       ["5", "Replace the website statistics with the honest provenance note", "The 40/65/30% figures came from template placeholder text with fictional testimonials attached."],
       ["6", "If the deleted figures leave gaps, use Table 4.2 — the real detection analysis", "It is real, it is yours, and it is a better story than a borrowed accuracy."],
       ["7", "Add the run configuration to an appendix", "Model, epochs, image size, batch, seed, date. One table that makes every number in the report traceable."]],
      [1.4, 7.4, 7.8], size=7.5)
caption("Table 7.1 — Remediation order.")

doc.add_paragraph()
p = doc.add_paragraph()
p.paragraph_format.space_before = Pt(8)
r = p.add_run("The short version. ")
r.bold = True
r.font.size = Pt(10.5)
r.font.color.rgb = NAVY
r = p.add_run("You have the code, and it is better than the documents suggest — a working training script, a "
              "correct evaluation script, a real dataset pipeline, and an honest set of analysis notes. What you do "
              "not have is a trained model, which means you do not yet have any model metrics. So the metrics in "
              "both documents cannot be used — not because they are wrong about your system, but because they were "
              "never produced by it. One training run fixes all of it. Until then, report the machine and the sensing "
              "architecture as built, and report the classification stage as designed-but-not-yet-evaluated. That is "
              "a completely respectable state for a project at this stage, and it is one your own repository already "
              "supports.")
r.font.size = Pt(10.5)

os.makedirs(OUTDIR, exist_ok=True)
out = os.path.join(OUTDIR, "BinGenie_Code_Evidence_Audit.docx")
doc.save(out)
print("saved:", out)
