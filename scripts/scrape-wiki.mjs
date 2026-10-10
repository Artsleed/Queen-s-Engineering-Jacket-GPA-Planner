// Pulls every article from the GPA Bars wiki into data/bars.xlsx for hand cleanup.
//
//   npm run scrape                       (updates data/bars.xlsx)
//   node scripts/scrape-wiki.mjs <file>  (updates another .xlsx, e.g. a test copy)
//
// Safe to re-run. The sheet is edited in place: rows are matched by wiki page
// id, and only the wiki_* / on_wiki / possible_duplicate_of cells are rewritten.
// Your edits, extra columns, row order and formatting are kept. New wiki pages
// are added at the bottom; pages gone from the wiki get on_wiki = no.
// Close the file in Excel first, or the save will fail.

import ExcelJS from 'exceljs';
import { existsSync } from 'node:fs';
import { SHEET_PATH, WIKI_COLS, EDIT_COLS, loadSheet, sheetRows } from './sheet.mjs';

const API = 'https://gpabars.fandom.com/api.php';
const OUT = process.argv[2] ?? SHEET_PATH;
const UA = 'GPA-Planner-scraper (github.com/Artsleed)';

// Pages that are about the wiki or are lists, not bars.
const NON_BAR_CATS = /^(Main Pages|Browse|Help|Help desk|Policy|Blog posts|Forums|Community|Watercooler|Site administration|History|Tradition|GPA|Templates?)$/i;
const NON_BAR_TITLES = new Set([
  "Queen's GPA Bars Wiki", 'Essential Bars', 'Additional Bars', 'Extracurricular Bars', 'Shenanigans',
  'Experimental Bars', 'Discipline Bars', 'Year Mottos', 'Frosh Groups', 'Where To Get Bars', 'Academics',
  'The Jacket Ritual',
]);

async function api(params) {
  const url = `${API}?${new URLSearchParams({ format: 'json', formatversion: '2', ...params })}`;
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  return res.json();
}

// All non-redirect articles with their categories. The API pages results and,
// separately, pages the category lists, so keep merging until nothing is left.
async function fetchPages() {
  const pages = new Map();
  let cont = {};
  do {
    const data = await api({
      action: 'query', generator: 'allpages', gapnamespace: '0', gapfilterredir: 'nonredirects',
      gaplimit: 'max', prop: 'categories|info', cllimit: 'max', ...cont,
    });
    for (const p of data.query?.pages ?? []) {
      const row = pages.get(p.pageid) ?? { pageid: p.pageid, title: p.title, length: p.length, cats: new Set() };
      for (const c of p.categories ?? []) row.cats.add(c.title.replace(/^Category:/, ''));
      pages.set(p.pageid, row);
    }
    cont = data.continue ?? null;
  } while (cont);
  return [...pages.values()];
}

// First guess at the type, using your scheme. Experimental wins over Shenanigans
// because the wiki tends to add the general tag too.
function guessType(title, cats) {
  const has = (re) => [...cats].some((c) => re.test(c));
  if (NON_BAR_TITLES.has(title) || has(NON_BAR_CATS)) return 'skip';
  if (has(/^Experi[e]?mental/i)) return 'experimental';
  if (has(/^Shenanigans$/i)) return 'official';
  if (has(/^(Extracurricular Bars|Discipline Bars|Clubs\/Sports|Residences)$/i)) return 'academic';
  return '';
}

const cleanName = (t) => t.replace(/^"(.*)"$/, '$1').trim();
const dupKey = (t) => cleanName(t).toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]/g, '');

function levenshtein(a, b) {
  if (Math.abs(a.length - b.length) > 2) return 99;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++)
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[b.length];
}

// Points each page at an earlier-sorted page whose name differs by at most one
// letter ("Beerlin Wall" / "Beerlyn Wall", "Millenium" / "Millennium"). Only a
// hint: puns like "Dongerzone" / "Danger Zone" get flagged too.
function findDuplicates(pages) {
  const keyed = pages.map((p) => ({ p, k: dupKey(p.title) })).sort((a, b) => a.k.localeCompare(b.k));
  const dup = new Map();
  for (let i = 0; i < keyed.length; i++) {
    for (let j = 0; j < i; j++) {
      const a = keyed[i].k, b = keyed[j].k;
      const close = a === b || (a.length >= 8 && levenshtein(a, b) <= 1);
      if (close) { dup.set(keyed[i].p.pageid, keyed[j].p.title); break; }
    }
  }
  return dup;
}

// --- write into the sheet ---

const HEAD = [...EDIT_COLS, ...WIKI_COLS];
const wikiUrl = (t) => `https://gpabars.fandom.com/wiki/${encodeURIComponent(t.replace(/ /g, '_'))}`;

async function openOrCreate() {
  if (existsSync(OUT)) return loadSheet(OUT);
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('bars', { views: [{ state: 'frozen', ySplit: 1 }] });
  ws.addRow(HEAD).font = { bold: true };
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: HEAD.length } };
  ws.columns.forEach((c, i) => { c.width = HEAD[i] === 'name' || HEAD[i] === 'wiki_title' ? 32 : 14; });
  return { wb, ws, cols: new Map(HEAD.map((h, i) => [h, i + 1])) };
}

const pages = await fetchPages();
const dups = findDuplicates(pages);
const { wb, ws, cols } = await openOrCreate();

// Any of our columns missing from the sheet (e.g. deleted by accident) go back on the end.
for (const h of HEAD) if (!cols.has(h)) {
  const n = Math.max(0, ...cols.values()) + 1;
  ws.getRow(1).getCell(n).value = h; cols.set(h, n);
}

const byId = new Map(sheetRows({ ws, cols }).map((r) => [r.pageid, r._row]));
const set = (rowNum, values) => {
  const row = ws.getRow(rowNum);
  for (const [h, v] of Object.entries(values)) row.getCell(cols.get(h)).value = v;
  row.commit();
};

let added = 0;
const seen = new Set();
const fresh = [];
for (const p of pages.sort((a, b) => a.title.localeCompare(b.title))) {
  const id = String(p.pageid);
  seen.add(id);
  const wiki = {
    pageid: p.pageid,
    wiki_title: p.title,
    wiki_url: wikiUrl(p.title),
    wiki_categories: [...p.cats].sort().join('; '),
    wiki_length: p.length,
    on_wiki: 'yes',
    possible_duplicate_of: dups.get(p.pageid) ?? '',
  };
  if (byId.has(id)) { set(byId.get(id), wiki); continue; }
  const type = guessType(p.title, p.cats);
  fresh.push({ include: type === 'skip' ? 'no' : 'yes', name: cleanName(p.title), type, notes: '', ...wiki });
}
let gone = 0;
for (const [id, rowNum] of byId) if (!seen.has(id)) { set(rowNum, { on_wiki: 'no' }); gone++; }
for (const r of fresh) {
  const rowNum = ws.lastRow ? ws.lastRow.number + 1 : 2;
  set(rowNum, r);
  // Text format, so Excel doesn't turn names like "007" into 7.
  ws.getRow(rowNum).getCell(cols.get('name')).numFmt = '@';
  added++;
}

try {
  await wb.xlsx.writeFile(OUT);
} catch (e) {
  if (e.code === 'EBUSY' || e.code === 'EPERM') {
    console.error(`Couldn't save ${OUT}: it's open in another program. Close it in Excel and run again.`);
    process.exit(1);
  }
  throw e;
}
console.log(`${pages.length} wiki pages -> ${OUT}`);
console.log(`${added} new rows added at the bottom, ${gone} rows no longer on the wiki, ${dups.size} possible duplicates flagged`);
