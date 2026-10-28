#!/usr/bin/env bash
# Rebuild every deliverable in report/deliverables from source.
#   ./report/build.sh
# Requires: python3 with python-docx and matplotlib (see report/requirements.txt).
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$HERE/src"

echo "== 1/6  architecture figure"
python3 make_figure.py

echo "== 2/6  report figures"
python3 make_report_figures.py

echo "== 3/6  technical audit"
python3 build_audit.py

echo "== 4/6  carry-forward specification"
python3 build_spec.py

echo "== 5/6  code evidence audit"
python3 build_code_audit.py

echo "== 6/6  semester report"
python3 build_report.py

echo
echo "Done. Output in $HERE/deliverables:"
ls -1 "$HERE/deliverables"
