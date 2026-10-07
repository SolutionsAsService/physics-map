import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';

for (const width of [1200, 390]) test(`arrows track hover, selection, zoom, pan and resize at ${width}px`, async () => {
  const dom = new JSDOM('<canvas></canvas><div id="tip"></div>', { runScripts: 'outside-only' });
  const { window } = dom;
  let frame = [], path = [], w = width;
  const canvas = window.document.querySelector('canvas');
  canvas.getBoundingClientRect = () => ({ width: w, height: 620, left: 0, top: 0 });
  canvas.getContext = () => ({
    setTransform() {}, clearRect() { frame = []; }, setLineDash() {},
    beginPath() { path = []; }, moveTo(x,y) { path.push([x,y]); }, lineTo(x,y) { path.push([x,y]); },
    stroke() { frame.push({ path: [...path], alpha: this.globalAlpha, width: this.lineWidth }); },
    fill() { frame.push({ path: [...path], alpha: this.globalAlpha, filled: true }); },
    arc() {}, fillText() {}, fillRect() {}, measureText() { return { width: 80 }; }
  });
  window.requestAnimationFrame = callback => { callback(); return 1; };
  for (const file of ['map-key.js','network.js']) window.eval(await readFile(new URL('../src/' + file, import.meta.url), 'utf8'));
  const nodes = [{id:'a',layout:{x:0,y:0}}, {id:'b',layout:{x:100,y:0}}, {id:'c',layout:{x:50,y:100}}].map(n => ({...n,label:n.id,topics:[],degree:2}));
  const edges = [{source:'a',target:'b',relation:'associated_with'}, {source:'b',target:'c',relation:'contains'}, {source:'c',target:'a',relation:'causes'}];
  let selected;
  const map = window.PhysicsNetwork.mount(canvas, window.document.querySelector('#tip'), {nodes,edges}, id => { selected = id; });
  const arrows = () => frame.filter(p => p.path.length === 3);
  assert.equal(arrows().length, 3, 'all predicates have heads, not only causal links');
  assert.equal(arrows().filter(p => p.filled).length, 1, 'association heads do not imply causation');
  canvas.dispatchEvent(new window.MouseEvent('pointermove', {clientX:18,clientY:18}));
  assert.equal(arrows().filter(p => p.alpha === .94).length, 2, 'hover highlights incident arrows without selection');
  canvas.dispatchEvent(new window.MouseEvent('pointerdown', {clientX:18,clientY:18}));
  canvas.dispatchEvent(new window.MouseEvent('pointerup', {clientX:18,clientY:18}));
  assert.equal(selected, 'a');
  map.select('a'); map.focusEdge(edges[0]);
  const before = JSON.stringify(arrows());
  map.zoom(1.3);
  assert.notEqual(JSON.stringify(arrows()), before, 'arrow coordinates track zoom');
  const zoomed = JSON.stringify(arrows());
  canvas.dispatchEvent(new window.MouseEvent('pointerdown', {clientX:100,clientY:100}));
  canvas.dispatchEvent(new window.MouseEvent('pointermove', {clientX:145,clientY:140}));
  canvas.dispatchEvent(new window.MouseEvent('pointerup', {clientX:145,clientY:140}));
  assert.notEqual(JSON.stringify(arrows()), zoomed, 'arrow coordinates track drag');
  w += 50; window.dispatchEvent(new window.Event('resize'));
  assert.ok(arrows().every(p => p.path.every(point => point.every(Number.isFinite))));
  map.fit(); assert.equal(arrows().length, 3);
  dom.window.close();
});
