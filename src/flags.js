/* ===================== Country flags ===================== */
// Every country's flag, from the flag-icons package (MIT), plus the ones it lacks that
// we drew ourselves in src/flags/ (Quebec). Each flag is an SVG
// that draw.js paints into the patch and covers with the felt texture, like the
// hand-drawn flags it replaced. No DOM.
//
// Placements store the country code (`flag: { type:'svg', code }`), never the
// file URL, since Vite renames the files on every build.
import countries from 'flag-icons/country.json';
import { FLAG } from './config.js';

// Two globs: listed together in one, Vite skips the node_modules one.
const files = {
  ...import.meta.glob('/node_modules/flag-icons/flags/4x3/*.svg', { query:'?url', import:'default', eager:true }),
  ...import.meta.glob('/src/flags/*.svg', { query:'?url', import:'default', eager:true }),
};
const URLS = Object.fromEntries(Object.entries(files).map(([path, url]) => [path.match(/([\w-]+)\.svg$/)[1], url]));
export const flagUrl = code => URLS[code] || null;

// Groups of countries and placeholders, not places someone would be from.
const NOT_PLACES = new Set(['asean', 'cefta', 'eac', 'arab', 'pc', 'un', 'xx', 'cp', 'dg', 'sh-ac', 'sh-hl', 'sh-ta']);

// Flags flag-icons doesn't have, drawn in src/flags/<code>.svg.
const OURS = [{ code:'ca-qc', name:'Quebec' }];

export const FLAG_DEFS = [...countries, ...OURS]
  .filter(c => !NOT_PLACES.has(c.code) && URLS[c.code])
  .map(c => ({ id:`flag-${c.code}`, cat:'flag', name:c.name, text:'', ...FLAG, flag:{ type:'svg', code:c.code } }))
  .sort((a, b) => a.name.localeCompare(b.name));
