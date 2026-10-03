#!/usr/bin/env node
/**
 * render_pdf.js — Render a handbook-style HTML file to a print-accurate PDF.
 *
 * Usage:
 *   node render_pdf.js <input.html> <output.pdf> [format]
 *
 *   format defaults to "A4". Pass "Letter" for US letter sized documents.
 *
 * Why margins are forced to 0:
 *   Playwright's page.pdf({ margin }) shrinks the printable area below the
 *   nominal page size (e.g. A4's 297mm becomes 297mm - margin.top - margin.bottom
 *   of *usable* height). If your CSS sizes `.page` divs at the full nominal
 *   height (which it should, for predictable layout), any non-zero Playwright
 *   margin causes every page to overflow by that amount — and once a chapter's
 *   content nearly fills a page, that overflow gets promoted to its own fully
 *   blank page in the output. Setting margins to 0 here and handling all
 *   footer/page-number rendering *inside* the HTML (absolutely positioned
 *   within each .page div) keeps the CSS page size and the PDF page size in
 *   exact agreement, which eliminates phantom blank pages at the source.
 *
 * Requires: npm package "playwright" with chromium installed (already set up
 * in this environment — `which playwright` / `pip show playwright` to confirm).
 */

const { chromium } = require('playwright');
const path = require('path');

async function main() {
  const [, , inputPath, outputPath, formatArg] = process.argv;

  if (!inputPath || !outputPath) {
    console.error('Usage: node render_pdf.js <input.html> <output.pdf> [format]');
    process.exit(1);
  }

  const format = formatArg || 'A4';
  const absInput = path.resolve(inputPath);
  const absOutput = path.resolve(outputPath);

  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.goto('file://' + absInput, { waitUntil: 'networkidle' });

    // Let web fonts finish loading before rasterizing — CJK fonts in
    // particular can otherwise render with a fallback face on first paint.
    await page.evaluate(() => document.fonts ? document.fonts.ready : Promise.resolve());

    await page.pdf({
      path: absOutput,
      printBackground: true,
      displayHeaderFooter: false,   // page numbers/footers live inside the HTML instead
      margin: { top: '0mm', bottom: '0mm', left: '0mm', right: '0mm' },
      preferCSSPageSize: false,
      format,
    });
    console.log('Wrote ' + absOutput);
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
