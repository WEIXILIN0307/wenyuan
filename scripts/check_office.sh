#!/usr/bin/env bash
# Independent Office smoke check on synthetic fixtures only. Not a human GUI acceptance test.
set -euo pipefail
wenyuan_root="$(cd "$(dirname "$0")/.." && pwd)"
wenyuan_office_out="$(mktemp -d /tmp/wenyuan-office.XXXXXX)"
timeout 40 libreoffice "-env:UserInstallation=file://$wenyuan_office_out/profile" \
  --headless --convert-to pdf --outdir "$wenyuan_office_out" "$wenyuan_root/examples/synthetic.docx"
test -s "$wenyuan_office_out/synthetic.pdf"
pdftotext "$wenyuan_office_out/synthetic.pdf" "$wenyuan_office_out/synthetic.txt"
rg -q '社区阅读活动' "$wenyuan_office_out/synthetic.txt"
rg -q '演示志愿者' "$wenyuan_office_out/synthetic.txt"
pdfinfo "$wenyuan_office_out/synthetic.pdf"
printf 'Synthetic Office check output: %s\n' "$wenyuan_office_out"
