# Bar data

`bars.xlsx` is the bar list. It was first pulled from the [GPA Bars wiki](https://gpabars.fandom.com) with `npm run scrape`, and you edit it by hand in Excel. The app reads the file directly when it builds, so there's no export step: save it, then commit and push.

After editing, run `npm test`. It checks the sheet for mistakes, such as a misspelled type or two included bars with the same name.

## Columns you edit

| Column | Meaning |
|---|---|
| `include` | `no` leaves the bar out of the app. Anything else keeps it in. |
| `name` | The text shown in the app and printed on the bar. |
| `type` | `official`, `experimental` (both shenanigans), `academic`, or `skip`. A blank `type` shows as unclassified. |
| `notes` | Free text for you. It never reaches the app. |
| `bar_colour`, `text_colour`, `border_colour` | Optional. A colour name (`black`, `white`, `grey`, `silver`, `royal blue`, `blue`, `navy`, `light blue`, `teal`, `green`, `dark green`, `lime`, `red`, `maroon`, `pink`, `purple`, `orange`, `gold`, `yellow`, `brown`, `tan`) or a hex code like `#1E9E4A`. Blank keeps the standard blue bar, gold text and red border. `npm test` flags names it doesn't know. The names and their shades are `FELT_COLOURS` in `src/config.js`. |

You can add your own columns, sort, filter and colour cells. The scraper keeps all of it, and your extra columns reach the app too.

## Columns the scraper owns

`pageid`, the `wiki_*` columns, `on_wiki` and `possible_duplicate_of` are rewritten on every scrape, so don't edit them. Rows are matched by `pageid`. If you delete a row, it comes back on the next scrape; to drop a bar, set `include` to `no` instead.

## Re-scraping

Run `npm run scrape` with the file **closed in Excel**, otherwise the save fails. It adds new wiki bars at the bottom, and marks bars that have gone from the wiki with `on_wiki` = `no`.
