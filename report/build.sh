#!/usr/bin/env bash
# Rebuild every deliverable in report/deliverables from source.
#   ./report/build.sh
# Requires: python3 with python-docx and matplotlib (see report/requirements.txt).
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$HERE/src"

echo "== 1/3  figure"
python3 make_figure.py

echo "== 2/3  technical audit"
python3 build_audit.py

echo "== 3/3  carry-forward specification"
python3 build_spec.py

echo
echo "Done. Output in $HERE/deliverables:"
ls -1 "$HERE/deliverables"
