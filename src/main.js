/* ===================== Start ===================== */
import { $ } from './util.js';
import { setState, normalize, rebuildCatalog } from './state.js';
import { setImageLoadHandler } from './draw.js';
import { ed, layoutEditor, drawEditor } from './editor2d.js';
import { init3D } from './jacket3d.js';
import { buildSelect, chosenDef, drawPreview, syncMaker } from './catalog-ui.js';
import { buildTabs } from './panels.js';
import { redrawEverything, updateUndo } from './pipeline.js';
import { loadLocal, setSaveState } from './storage.js';
import './io.js';

function start(){
  const local = loadLocal(); if (local) setState(normalize(local));
  setImageLoadHandler(redrawEverything);
  rebuildCatalog(); buildTabs(); buildSelect();
  init3D();
  layoutEditor(); redrawEverything(); updateUndo();
  setSaveState(local ? 'Saved in this browser' : '');
  new ResizeObserver(() => { layoutEditor(); drawEditor(); }).observe(ed.wrap);
  new ResizeObserver(() => { if ($('#maker').hidden){ const d = chosenDef(); if (d) drawPreview(d); } else syncMaker(); }).observe($('#itemPreview'));
  if (document.fonts){ document.fonts.load('20px Graduate').then(() => redrawEverything()).catch(() => {}); document.fonts.ready.then(() => redrawEverything()); }
}
start();
