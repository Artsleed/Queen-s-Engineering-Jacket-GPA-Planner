// Reads data/bars.xlsx. Shared by the wiki scraper and the Vite build (which turns
// the sheet into the app's bar list). Runs in Node only, never in the browser.
import ExcelJS from 'exceljs';
import { fileURLToPath } from 'node:url';

export const SHEET_PATH = fileURLToPath(new URL('../data/bars.xlsx', import.meta.url));

// Columns the scraper owns and overwrites on every run.
export const WIKI_COLS = ['pageid', 'wiki_title', 'wiki_url', 'wiki_categories', 'wiki_length', 'on_wiki', 'possible_duplicate_of'];
// Columns Nathaniel owns. Filled with a guess the first time a page is seen, then never touched.
export const EDIT_COLS = ['include', 'name', 'type', 'notes'];

// Excel cells can hold rich text, links, formulas or dates; flatten them all to plain text.
export function cellText(v){
  if (v == null) return '';
  if (typeof v === 'object'){
    if (Array.isArray(v.richText)) return v.richText.map(r => r.text).join('');
    if ('text' in v) return cellText(v.text);
    if ('result' in v) return cellText(v.result);
    if (v instanceof Date) return v.toISOString().slice(0, 10);
  }
  return String(v).trim();
}

export async function loadSheet(path = SHEET_PATH){
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(path);
  const ws = wb.getWorksheet('bars') ?? wb.worksheets[0];
  const cols = new Map(); // header name -> column number
  ws.getRow(1).eachCell((c, n) => { const h = cellText(c.value); if (h) cols.set(h, n); });
  return { wb, ws, cols };
}

// Every data row as { header: text }, plus its Excel row number as _row.
export function sheetRows({ ws, cols }){
  const out = [];
  ws.eachRow((row, n) => {
    if (n === 1) return;
    const r = {};
    for (const [h, c] of cols) r[h] = cellText(row.getCell(c).value);
    if (Object.values(r).some(v => v !== '')) out.push({ ...r, _row: n });
  });
  return out;
}

// The bars the app should offer: included, not skipped, with a name. Keeps any
// extra columns Nathaniel adds, but drops the scraper's wiki_* bookkeeping.
export function barsForApp(rows){
  const skip = new Set([...WIKI_COLS.filter(c => c !== 'pageid'), 'include', 'notes', '_row']);
  return rows
    .filter(r => r.include.toLowerCase() !== 'no' && r.type.toLowerCase() !== 'skip' && r.name)
    .map(r => Object.fromEntries(Object.entries(r).filter(([k]) => !skip.has(k)).map(([k, v]) => [k, k === 'type' ? v.toLowerCase() : v])));
}
