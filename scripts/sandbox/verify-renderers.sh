#!/bin/bash
# Synthetic public fixture only. Run with no network and an ordinary container UID.
set -euo pipefail
export PATH=/opt/studysolo/bin:$PATH
export NODE_PATH=/opt/studysolo/node_modules
export PLAYWRIGHT_BROWSERS_PATH=/opt/studysolo/browsers
qa_dir=${1:?Provide a fresh writable QA output directory}
mkdir -p "$qa_dir"
export HOME="$qa_dir"
cd "$qa_dir"
test -f /opt/studysolo/runtime-ready.json
python3 - <<'PY'
from pathlib import Path
from docx import Document
from docx.shared import Mm
from docx.oxml.ns import qn
title = 'StudySolo 云端文档验收'
body = '这是公开的合成测试文稿，用于验证中文字体、文档转换与页面渲染。'
Path('handbook.html').write_text('<!doctype html><html lang="zh"><meta charset="utf-8"><style>@page{size:A4;margin:0}body{margin:24mm;font-family:"Noto Sans CJK SC",sans-serif}h1{font-size:24pt}p{font-size:14pt;line-height:1.8}</style><h1>' + title + '</h1>' + ''.join('<p>' + body + '</p>' for _ in range(8)) + '</html>', encoding='utf-8')
document = Document()
section = document.sections[0]
section.page_width, section.page_height = Mm(210), Mm(297)
for name in ('Normal', 'Title'):
    style = document.styles[name]
    style.font.name = 'Noto Sans CJK SC'
    style.element.get_or_add_rPr().get_or_add_rFonts().set(qn('w:eastAsia'), 'Noto Sans CJK SC')
document.add_heading(title, 0)
for _ in range(8):
    document.add_paragraph(body)
document.save('manuscript.docx')
PY
node /opt/studysolo/skills/notes-to-handbook/scripts/render_pdf.js handbook.html handbook.pdf
python3 /opt/studysolo/skills/notes-to-handbook/scripts/check_pdf_pages.py handbook.pdf --save-dir handbook-pages
timeout 60 libreoffice -env:UserInstallation="file://$qa_dir/office-profile" --headless --convert-to pdf --outdir . manuscript.docx
python3 /opt/studysolo/skills/gb-standard-docx-pdf/scripts/document_preflight.py --docx manuscript.docx --pdf manuscript.pdf --expect 'StudySolo' --expect '云端文档验收' --require-a4 --min-pages 1 --json-out preflight.json
python3 /opt/studysolo/skills/gb-standard-docx-pdf/scripts/render_pdf_pages.py manuscript.pdf manuscript-pages --dpi 90
printf 'Renderer smoke tests passed; per-document visual, citation and standards acceptance remains required.\n'
