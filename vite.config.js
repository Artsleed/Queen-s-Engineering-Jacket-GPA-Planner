import { defineConfig } from 'vite';
import { loadSheet, sheetRows, barsForApp } from './scripts/sheet.mjs';

// Lets the app `import bars from '../data/bars.xlsx'`. The sheet is read at build
// time and only the bar list (name, type, your extra columns) reaches the browser.
// In `npm run dev`, saving the sheet in Excel reloads the page.
function barsSheet(){
  return {
    name: 'bars-xlsx',
    enforce: 'pre',
    async load(id){
      const file = id.split('?')[0];
      if (!file.endsWith('.xlsx')) return null;
      this.addWatchFile(file);
      const bars = barsForApp(sheetRows(await loadSheet(file)));
      return `export default ${JSON.stringify(bars)};`;
    },
  };
}

export default defineConfig({
  plugins: [barsSheet()],
  // three.js alone is ~500 kB minified, so the default warning would fire on every build.
  build: { chunkSizeWarningLimit: 700 },
  // Unit tests only; the browser tests in e2e/ run with Playwright.
  test: { include: ['tests/**/*.test.js'] },
});
