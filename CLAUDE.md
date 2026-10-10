# GPA Planner

A web app for planning the layout of bars, patches and flags on a Queen's University Engineering jacket (the "GPA"). Users place items on a flat 2D view of each jacket section and see the result on a rotatable 3D jacket.

It is a plain-JavaScript Vite project (no framework), deployed to Vercel from GitHub. `gpa-planner.html` is the original single-file version, kept for reference only. Don't edit it.

## Context you need first

**Domain.** At Queen's, engineering students sew small rectangular patches called **bars** onto their jacket (the GPA). Bars are earned by completing challenges or by being involved in things. For example, the "Wizard" bar is earned by building a staff out of beer cans as tall as you are. Other jacket items include:

- **Pass crest**: goes on the right sleeve after first year.
- **Year number**: the graduating year, on the left sleeve.
- **Patches**: these are commonly for design teams, but can be for other things also. 
- **Flags**: national.

Jacket space is limited. The whole point of the app is deciding what fits and where it goes.

**Bar types** (from Nathaniel):

- **Shenanigans:** silly stuff and challenges. These split into:
  - **Official:** widely recognised.
  - **Experimental:** not enough people have done it yet. It may be upgraded to official later.
- **Academic/extracurricular:** design team patches, the discipline bar, and so on.

**Traditional layout** (confirmed by Nathaniel). The app should require or strongly suggest these spots. Apart from them, any bar can go roughly anywhere.

| Where | What, top to bottom |
|---|---|
| Right sleeve | University motto, then pass crest, then discipline bar |
| Left sleeve | Year motto, then grad year (last 2 digits) |
| Front, upper left (wearer's left) | Year crest |
| Upper back | "QUEEN'S" (slight arch), "APPLIED", "SCIENCE". The whole block fits in 38.6 cm wide × 30.5 cm tall. |
| Lower back | Frosh group bar at bottom left, FREC group bar at bottom right, flags between them, discipline *patch* above the flags. The patch is separate from the sleeve bar, and its details are still to come. |

**Real sizes** (Nathaniel's measurements):

- **Standard bar:** about 12.1 × 2.9 cm (4¾ × 1⅛ in). It curves with the ends down; the bottom edge drops about 1.3 cm (0.5 in), so the bounding box is about 12.1 × 4.1 cm. Most bars are royal blue with a red border and gold lettering.
- **University and year mottos:** about 11.4 × 3.8 cm. Scroll shape with ribbon ends.
- **Pass crest:** about 6.6 × 9.5 cm. Shield shape.
- **Flags:** about 6.4 × 3.8 cm.

**Content rules:**

- Show each bar's name and category only, never how it's earned. Many requirements involve heavy drinking, and the audience is mostly first- and second-years.
- The site must say it isn't affiliated with Queen's University.
- The wiki owner allowed us to use its data without credit. Don't use wiki photos.

**The user.** Nathaniel is a second-year Computer Engineering student and is also a Frec (orientation leader). He knows programming fundamentals but very little web dev, and isn't especially interested in learning as he specializes in other areas of programming.

- Explain the reasoning behind design and technical decisions, not just the result.
- Be direct and practical.
- Expect him to push back when something doesn't fit how the jacket actually works. He is the authority on jacket traditions and real patch details.
- Good areas for him to contribute directly:
  - Bar data: names, real sizes, colours, how each is earned, photos.
  - Placement rules.
  - The pure-logic functions: fit checking and auto-arranging. These are isolated and need no DOM knowledge.

**Origin.** The app was first built in claude.ai as a single-file artifact. Nathaniel moved it to Vercel and GitHub, so the claude.ai constraints (single file, approved CDNs only, `window.claude` services) no longer apply.

## Running and testing

- **Setup:** `npm install` once. For the browser tests, also run `npx playwright install chromium`.
- **Run:** `npm run dev`, then open the printed URL. Run it in the browser before calling a change done.
- **Unit tests:** `npm test` runs Vitest on `tests/`. Fit logic is covered in `tests/fit.test.js`.
- **Browser tests:** `npm run test:e2e` runs the Playwright tests in `e2e/` and starts the dev server itself. They check that the 3D view renders, and test add, overlap, undo, drag and reload. Headless Chromium uses SwiftShader for WebGL (the flags are in `playwright.config.js`).
- **Build:** `npm run build` writes `dist/`. Vercel detects Vite and runs this itself; there's no `vercel.json`.
- **Bar data:** `data/bars.xlsx` is the real copy, and Nathaniel edits it in Excel. A Vite plugin in `vite.config.js` (using `scripts/sheet.mjs`) lets code `import bars from '../data/bars.xlsx'`, which gives the included, non-skipped rows as `{ name, type, pageid, ...his extra columns }`. `npm run scrape` merges new wiki pages into the sheet in place, and only rewrites the wiki columns. `tests/bars-sheet.test.js` checks the sheet for mistakes. See `data/README.md`.
- **Internet:** only Google Fonts loads from a CDN. three.js is bundled.

## Hosting

- **Vercel, from GitHub.** Pushing to `main` deploys.
- **Static only.** There's no backend yet. Plans save to `localStorage`, and Export/Import moves them between devices.
- **three.js is pinned to `0.128.0`** (r128) to match the original look. Newer versions renamed `outputEncoding` and `sRGBEncoding` and changed light intensities, so upgrading needs a visual check. `OrbitControls` is available from `three/examples/jsm` now, but the camera controls are still hand-written.

## Architecture

The code is plain ES modules in `src/`. Modules share `state`, `catMap`, `current` and `sel`, which are exported from `state.js`. Other modules can read them directly and always see the latest value, but must use `setState` / `setCurrent` / `setSel` to replace them. The UI modules import each other in a cycle; that's fine because nothing calls across modules while the files are first loading.

| File | Contents |
|---|---|
| `config.js` | Default measurements, `BAR` (standard bar size and colours), `PRESETS`, section names, constants |
| `catalog.js` | `BUILTINS` (presets plus every sheet bar), picker `GROUPS`, `groupOf`, `RENAMED_IDS`. No DOM. |
| `util.js` | Small helpers (`$`, `clamp`, colour functions) |
| `state.js` | State, `normalize`, catalogue, section geometry, no-go zones. No DOM. |
| `fit.js` | `boxesClash`, `conflicts`, `findSpot`. No DOM. |
| `draw.js` | `drawItem`, `drawPanel` (the single renderer) |
| `editor2d.js` | Cutting-mat editor: layout, drawing, drag, keyboard |
| `jacket3d.js` | three.js scene, textures, camera, picking |
| `catalog-ui.js` | Item picker (search, category filter, grouped list), preview, "make your own" form, Add |
| `panels.js` | Section tabs, inspector, space meters, jacket-size dialog |
| `pipeline.js` | `commit` / `liveUpdate` / redraw, undo stack, toast |
| `storage.js` | `localStorage` save and load |
| `io.js` | Export, import, save picture, 3D snapshot |
| `main.js` | Start-up |

### Units and coordinates

- All geometry is in **centimetres**.
- Each jacket section is treated as a flat rectangle ("unrolled"). Positions are measured from the section's **top-left corner**: x to the right, y downward.

| Section | Width | Height | Notes |
|---|---|---|---|
| `front` | chest / 2 | body length | Viewer's left is the wearer's right. |
| `back` | chest / 2 | body length | Viewer's left is the wearer's left. |
| `leftSleeve`, `rightSleeve` | sleeve circumference | sleeve length | The horizontal centre line is the outer side of the arm. Both edges are the underarm seam. |

- **No-go zones** come from `noGoZones(section)`:
  - Front: the zipper strip.
  - Front and back: the waistband.
  - Sleeves: the cuffs.
- **Rotation** is only 0° or 90°. `dims(p)` returns the rotated bounding box.

### State model

`state` is saved as JSON. The schema version is `v: 1`. Shape:

```js
{
  v: 1,
  updatedAt: <ms>,
  meas:   { chest, length, sleeve, sleeveCirc, waistband, cuff, zipper, gap }, // cm
  jacket: { color, lining },                                                 // hex
  items:  [ItemDef],   // custom items, plus overrides of presets (same id as the preset)
  placed: [{ uid, item, section, x, y, rot, text }] // text: per-placement override, or null
}
```

`ItemDef` fields:

```js
{ id, cat: 'bar'|'patch'|'flag', name, text, w, h,
  shape: 'rect'|'round'|'circle'|'shield'|'text',
  bg, fg, border, note,
  flag?: { type: 'h'|'v'|'disc'|'canada', colors: [...] },
  img?: dataURL }
```

- **Catalog:** `catMap` is `BUILTINS` (the `PRESETS` plus every bar in `data/bars.xlsx`) merged with `state.items`. It is rebuilt by `rebuildCatalog()`.
- **Sheet bar ids** are `wiki-<pageid>`, so renaming a bar in the sheet keeps it on saved jackets. Sheet bars carry `type` (the sheet's type column), which decides their picker group.
- **Custom ids** start with `c-`. Editing a built-in stores an override that has the built-in's id.
- **Missing items:** if a placement's item is gone (e.g. a bar later set to `include = no`), `rebuildCatalog()` gives it a stand-in "Bar no longer in the list" def instead of deleting the placement.
- **Moved presets:** `RENAMED_IDS` maps old preset ids to their sheet id (`bar-wizard` → `wiki-2095`, `patch-engsoc` → `wiki-2064`); `normalize()` applies it.
- **Loading:** saved data always goes through `normalize()`. If you change the schema:
  - Bump `v`.
  - Add a migration in `normalize()`.
  - Never break plans people have already saved.

### Rendering

- `drawPanel(ctx, section, pxPerCm, opts)` is the **single renderer** for a section. It is used both by the 2D editor (with labels, guides and conflict highlights) and to paint the 3D textures (`renderTexture`, at `TEX_PX = 12` px/cm). Keep it that way, so 2D and 3D can never disagree.
- `drawItem` draws one patch. Shapes are vector paths, with an optional flag fill, an optional photo (cover-fit and clipped), a border, and a faux stitch line. Text is auto-fitted and uses the `Graduate` font.

### 3D model

`build3D()` builds the jacket. Scene units are decimetres (cm / 10).

- **Torso:** two half-cylinders (front and back), z-scaled 0.62 so it isn't round.
  - `thetaStart = -π/2` for the front and `π/2` for the back, so texture u = 0 is the viewer's left on each.
  - A flattened hemisphere forms the shoulder yoke, with a torus collar on top.
- **Sleeves:** tapered cylinders on pivots, angled ±0.28 rad.
  - `thetaStart` is set so u = 0.5 (the 2D centre line) faces outward.
- **Rebuilding:** `build3D()` re-runs when `meas` or `jacket` change. `builtKey` tracks this.
- **Clicking the model** (`pick3D`): it raycasts, converts the hit UV to section cm, then selects that section and patch.
- **Focusing a section** animates the yaw. It respects `prefers-reduced-motion`.

### Fit logic (pure functions; good place for Nathaniel to contribute)

- `boxesClash(a, b, gap)` tests axis-aligned box overlap with a minimum gap.
- `conflicts(section)` returns a `Map<uid, reason>` covering:
  - items off the edge
  - items on no-go zones
  - items overlapping or closer than `meas.gap`
- `findSpot(section, w, h, skipUid)` brute-forces a 0.5 cm grid. It picks the free spot nearest a per-section anchor. "Add" tries the item rotated if the upright version doesn't fit.

Circles and shields currently collide by their bounding box, which is conservative.

### UI flow

- **Mutations** follow one pattern: `pushHistory()` → change `state` → `commit()`.
  - `commit()` redraws everything, saves (debounced), and updates the Undo button.
- **Dragging** uses `liveUpdate()`. It redraws only the editor and the current section's texture each frame, then commits on pointer up.
- **Undo** is a JSON snapshot stack holding the last 80 states.
- **Saving** (`scheduleSave`): debounced write to `localStorage`. Photos are downscaled to 240 px to keep plans small.

## Design

The visual direction is a green self-healing cutting mat with a cm grid as the workspace, set against Queen's colours.

- **Colours:**

| Name | Hex |
|---|---|
| Queen's blue | `#002452` |
| Queen's gold | `#EAAA00` |
| Queen's red | `#9D1939` |
| Mat green | `#2E5B48` |

- **Fonts:** Graduate (a varsity face) for the title and patch lettering; Archivo for the UI.
- **Theme:** colours are CSS tokens on `:root`, with dark mode handled through `prefers-color-scheme` and `data-theme`.
- **Accessibility:**
  - Keep it responsive down to about 375 px.
  - Keep keyboard support on the mat: arrows nudge, Shift+arrows nudge 2 cm, R rotates, Delete removes, Esc deselects, Ctrl/Cmd+Z undoes.
  - Keep focus outlines visible.

## Known placeholders and limitations

- **The bar list comes from `data/bars.xlsx`.** All bars are flat 12.1 × 2.9 cm rectangles in royal blue / red / gold for now; the curve isn't drawn, and fit checks use the flat box. Patches, flags, mottos and the pass crest are still the old guesses (sizes, a circular pass crest). Sheet rows that are really patches, such as EngSoc Crest, draw as bars for now..
  - Default text like "29" and "COMPUTER" is illustrative.
  - Get real data from Nathaniel. Don't make up more traditions.
- **Crests are generic placeholder drawings.** Don't recreate the real Queen's or EngSoc logos (they're trademarked). Users can upload a photo of their own patch instead.
- **Default jacket measurements** are a generic size L. The user is meant to enter their own.
- **Rotation is 0°/90° only,** and collisions are box-based.
- **Not modelled:** pockets, seams, shoulder or collar areas, and the area under the arm. The sleeve taper slightly distorts the texture near the cuff.
- **Mobile:** no pinch-zoom in 3D (there are +/− buttons instead), and you can't drag directly from the 3D view.
- **Auto-placement anchors are simple.** The front anchors at 75% of the width, so patches can land toward the side of the torso.

## Suggested backlog

Confirm priorities with Nathaniel first.

1. **Real bar catalogue and layout.** `data/bars.xlsx` exists and loads at build time, and Nathaniel is classifying it. Next steps:
   - Done: the picker uses it (search plus category filter), bars are the real flat size, and the not-affiliated disclaimer is in the footer.
   - Curved bars, plus real shapes and sizes for mottos, the pass crest and flags.
   - Reserved spots for the traditional layout, with the fixed QUEEN'S/APPLIED/SCIENCE block.
2. **Status per item.** Earned, working on it, or wishlist. Summaries like "what fits if I earn everything on my wishlist".
3. **Custom no-go zones.** Let the user draw pockets or areas to keep clear.
4. **Smarter auto-arrange.** A packing or optimisation pass that fits a chosen set of items into a section, respecting traditional placements and preferred groupings. This is a self-contained algorithms problem that suits Nathaniel.
5. **Free rotation,** with shape-accurate collision. Use separating-axis tests, and circle tests for round patches.
6. **Share or compare layouts,** for example a frosh group comparing jackets.
7. **More tests.** Add `normalize` migrations and auto-arrange as they're written.
