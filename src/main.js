/* ===================== Start ===================== */
import { $ } from './util.js';
import { setState, normalize, newJacket, rebuildCatalog } from './state.js';
import { setImageLoadHandler } from './draw.js';
import { ed, layoutEditor, drawEditor } from './editor2d.js';
import { init3D } from './jacket3d.js';
import { buildSelect, syncMaker, makerOpen } from './catalog-ui.js';
import { buildTabs, buildLeatherPick, renderInspector } from './panels.js';
import { redrawEverything, updateUndo, toast } from './pipeline.js';
import { readSaved, backUpSaved, setSaveState } from './storage.js';
import './io.js';

// The saved plan, or a new jacket. A plan that can't be read is kept as a backup (not
// overwritten by the next save) and the user is told.
function loadPlan(){
  const saved = readSaved();
  if (!saved) return { plan:newJacket(), local:false };
  try { return { plan:normalize(JSON.parse(saved.raw)), local:true }; }
  catch (e){
    console.error('Saved plan unreadable', e);
    backUpSaved(saved.raw);
    return { plan:newJacket(), local:false, damaged:true };
  }
}

function start(){
  const { plan, local, damaged } = loadPlan(); setState(plan);
  setImageLoadHandler(redrawEverything);
  rebuildCatalog(); buildTabs(); buildLeatherPick(); buildSelect();
  init3D();
  layoutEditor(); redrawEverything(); updateUndo();
  setSaveState(local ? 'Saved in this browser' : '');
  new ResizeObserver(() => { layoutEditor(); drawEditor(); }).observe(ed.wrap);
  new ResizeObserver(() => { if (makerOpen()) syncMaker(); else renderInspector(); }).observe($('#itemPreview'));
  if (damaged) toast("Your saved plan couldn't be read, so this is a fresh jacket. The old one is kept in this browser as a backup; email us and we can help get it back.");
  if (document.fonts){ document.fonts.load('20px Graduate').then(() => redrawEverything()).catch(() => {}); document.fonts.ready.then(() => redrawEverything()); }
  // Tell index.html's start-up check that the app is running.
  window.__gpaStarted = true;
  // Later errors: say so once, without taking the page down (the plan is already saved).
  let told = false;
  const oops = () => { if (told) return; told = true; toast('Something went wrong. Your plan is saved; reload the page if anything looks off.'); };
  window.addEventListener('error', e => { if (!e.filename || e.filename.startsWith(location.origin)) oops(); });
  window.addEventListener('unhandledrejection', oops);
}
start();
