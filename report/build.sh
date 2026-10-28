#!/usr/bin/env bash
# Rebuild every deliverable in report/deliverables from source.
#   ./report/build.sh
# Requires: python3 with python-docx and matplotlib (see report/requirements.txt).
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$HERE/src"

echo "== 1/4  figure"
python3 make_figure.py

echo "== 2/4  technical audit"
python3 build_audit.py

echo "== 3/4  carry-forward specification"
python3 build_spec.py

echo "== 4/4  code evidence audit"
python3 build_code_audit.py

echo
echo "Done. Output in $HERE/deliverables:"
ls -1 "$HERE/deliverables"
