# Queen-s-Engineering-Jacket-GPA-Planner
a project that allows students to plan out their gpa's bar/patch placement on a model before committing to sewing them on

Not affiliated with or endorsed by Queen's University.

## Development

```sh
npm install
npm run dev        # local dev server
npm test           # unit tests (fit logic)
npm run test:e2e   # browser smoke tests (first run: npx playwright install chromium)
npm run build      # production build into dist/ (Vercel runs this on push)
npm run scrape     # add new GPA Bars wiki pages to data/bars.xlsx (close it in Excel first)
```
