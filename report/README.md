# BinGenie — Report Workspace

Everything for the current-semester project report lives in this folder and nowhere else.
It is self-contained: copy `report/` into any repository and it works unchanged.

Project: **Waste Segregating Smart Bin (BinGenie)** — IoT-enabled waste segregation using a
dual carousel disc mechanism and AI-driven image recognition.

---

## 1. Layout

```
report/
├── README.md                  this file
├── build.sh                   rebuilds every deliverable from source
├── requirements.txt           python-docx, matplotlib
│
├── deliverables/              documents to submit — these are the outputs
│   ├── IDFP_BinGenie_Technical_Audit.docx
│   ├── BinGenie_What_We_Can_Use.docx
│   ├── BinGenie_Code_Evidence_Audit.docx
│   └── BinGenie_Sem_Report.docx      <- the submission
│
├── assets/
│   └── figures/               generated and supplied figures
│       └── Fig_System_Architecture.png
│
├── src/                       build scripts — edit these, not the .docx
│   ├── make_figure.py         regenerates the architecture figure
│   ├── build_audit.py         regenerates the technical audit
│   ├── build_spec.py          regenerates the carry-forward specification
│   ├── build_code_audit.py    regenerates the code evidence audit
│   ├── make_report_figures.py regenerates the six report figures
│   └── build_report.py        builds the full semester report
│
└── templates/                 drop the semester template here
    └── README.md
```

### Opening the report

`BinGenie_Sem_Report.docx` contains live Word fields: the table of contents, the list of figures
and the list of tables are generated from the document's own headings and captions. The file is
flagged to refresh them when opened, so Word will offer to update the fields — accept it. If a
list still shows a grey placeholder sentence, click on it and press **F9**.

**Rule: never hand-edit a file in `deliverables/`.** Edit the script in `src/`, run
`./report/build.sh`, and the document is regenerated consistently. This is what keeps
numbers identical across the abstract, results, tables and conclusion.

---

## 2. Rebuild

```bash
pip install -r report/requirements.txt
./report/build.sh
```

Output is written to `report/deliverables/`. The build takes about two seconds and is
deterministic — same source, same document.

---

## 3. What each deliverable is

| File | What it is | Status |
|---|---|---|
| `IDFP_BinGenie_Technical_Audit.docx` | Verification of every metric, table and claim in the IEOM conference paper and the previous-semester lab report. 14 blockers, 7 major, editorial register, master value ledger. | Done |
| `BinGenie_What_We_Can_Use.docx` | The carry-forward specification: what survives as fact, what must be re-specified, hardware part numbers, interface table, dimension set, class-to-compartment mapping, market-sizing method, four-log measurement plan, chapter-by-chapter map. | Done |
| `BinGenie_Code_Evidence_Audit.docx` | File-by-file reading of both GitHub repositories, against the metrics claimed in the paper and report. Verdict per metric, provenance trace, the real detection-log analysis, and the pipeline that produces genuine numbers. | Done |
| `BinGenie_Sem_Report.docx` | **The submission.** Nine chapters plus five appendices, 7 figures, 19 tables. Built from the master value ledger: measured results separated from design targets, no fabricated model metrics, automatic contents / list of figures / list of tables. | Done |

The two finished documents are the working answer to *"what can we actually use?"*.
The third is the actual submission and is built once `templates/` has the current template.

---

## 4. Moving this into your own repository

The folder is deliberately independent of the repository it sits in — no absolute paths,
no imports from outside `report/`.

**Option A — copy (simplest).** Copy the whole folder, commit:

```bash
cp -r report/ /path/to/your-repo/report/
cd /path/to/your-repo && git add report && git commit -m "Add BinGenie report workspace"
```

**Option B — single archive.** Send one zip over and unpack it at the top level of the target repo.

**Option C — keep the history.** If the target repo is separate and you want this folder's
commit history, use a subtree split from the repo that contains `report/`:

```bash
git subtree split --prefix=report -b report-only
cd /path/to/your-repo
git subtree add --prefix=report /path/to/source-repo report-only
```

**What to check after moving:** run `./report/build.sh` once. If it produces the three files
without error, the move was clean. Nothing else needs configuring.

---

## 5. Naming convention for the final report

Once the template is in place, the final document is built as
`deliverables/BinGenie_Sem_Report.docx` and follows the template's own numbering. Figures are
numbered from `assets/figures/` and tables are generated inline, so the contents, list of
figures and list of tables are always consistent with the body.

Placeholders that must be filled by the team are written as `__` in the source and highlighted
in the document — never invented. See the carry-forward specification, Table 11.1, for the full
list of what is still outstanding.

---

## 6. Outstanding inputs

These block the parts of the final report that cannot be derived from the existing documents:

1. A completed training run — `train.py` then `eval_per_class.py`, per Table 5.1 of the code audit
2. Dataset counts per source and per class, after cleaning
3. Survey: n, method, location, date, questionnaire
4. Prototype BOM with actual unit costs, and build cost
5. Unit price to quote and target margin
6. Team roles and the currently blank KPI rows (hackathons, grants, incubation)
7. Four photographs: full assembly, head unit open, disc removed, compartment removed
8. The current-semester template

Items 1–5 have a fallback: the ambiguous numbers become labelled design targets rather than
fabricated results. Items 6–8 are simply blank until supplied.
