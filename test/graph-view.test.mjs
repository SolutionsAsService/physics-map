import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import '../src/graph-view.js';
const { connectedCore } = globalThis.PhysicsGraphView;
const make = (ids, pairs) => ({ nodes: ids.map(id => ({ id, variants: [] })), edges: pairs.map(([source, target]) => ({ source, target })), paths: [{ steps: ids }], summary: {} });

test('iterative 2-core ignores loops, parallel edges and missing endpoints without mutating sources', () => {
  const atlas = make(['a', 'b', 'c', 'tail', 'leaf', 'loop', 'duplicate', 'isolated'], [['a','b'], ['b','c'], ['c','a'], ['a','tail'], ['tail','leaf'], ['loop','loop'], ['duplicate','a'], ['a','duplicate'], ['duplicate','a'], ['a','missing']]);
  const original = structuredClone(atlas);
  const view = connectedCore(atlas);
  assert.deepEqual(view.nodes.map(n => n.id), ['a','b','c']);
  assert.ok(view.nodes.every(n => n.degree === 2));
  assert.equal(view.edges.length, 3);
  assert.deepEqual(view.paths[0].steps, ['a','b','c']);
  assert.deepEqual(atlas, original);
  assert.deepEqual(connectedCore(view).nodes, view.nodes, 'core membership is idempotent');
  assert.deepEqual(connectedCore(view).edges, view.edges);
  assert.equal(connectedCore(make(['x','y'], [['x','y']])).nodes.length, 0);
});

test('real map contains only 2+ distinct visible neighbors and source-backed motion relations', async () => {
  const atlas = JSON.parse(await readFile(new URL('../data/atlas.json', import.meta.url)));
  const view = connectedCore(atlas);
  const ids = new Set(view.nodes.map(n => n.id));
  assert.ok(view.nodes.length < atlas.nodes.length);
  for (const node of view.nodes) {
    const peers = new Set(view.edges.filter(e => e.source === node.id || e.target === node.id).map(e => e.source === node.id ? e.target : e.source));
    assert.ok(peers.size >= 2, node.id);
    assert.equal(node.degree, peers.size);
  }
  assert.ok(view.edges.every(e => ids.has(e.source) && ids.has(e.target) && e.source !== e.target));
  for (const route of view.paths) assert.ok(route.steps.every(id => ids.has(id)));
  assert.equal(ids.has('ref_source_668'), false, 'one-link bibliography entries are archived');
  const proof = view.edges.find(e => e.source === 'net_force' && e.target === 'acceleration' && e.record.teaching_addition);
  assert.equal(proof.record.mathematical_form, 'a = F_net / m');
  assert.match(proof.record.conditions, /constant positive mass/);
  assert.ok(proof.evidence[0].references.some(r => new URL(r.url).hostname === 'openstax.org'));
  assert.equal(view.summary.relationships, view.edges.length);
  assert.equal(view.summary.concepts, view.nodes.length);
});

test('each core concept has a bounded navigable neighborhood made only from real predicates',async()=>{const a=connectedCore(JSON.parse(await readFile(new URL('../data/atlas.json',import.meta.url))));for(const n of a.nodes){const v=globalThis.PhysicsGraphView.neighborhood(a,n.id);assert.ok(v.nodes.length<=6,n.id);assert.ok(v.totalNeighbors>=2,n.id);assert.ok(v.edges.every(e=>a.edges.includes(e)));}const lens=globalThis.PhysicsGraphView.neighborhood(a,'force');assert.ok(lens.nodes.some(n=>n.id==='acceleration'));assert.ok(lens.edges.some(e=>e.source==='force'&&e.target==='net_force'));assert.ok(lens.edges.some(e=>e.source==='net_force'&&e.target==='acceleration'&&e.relation==='causes'));});

test('paging reaches every genuine neighbor, including those omitted from the mechanics overview', async () => {
 const a = connectedCore(JSON.parse(await readFile(new URL('../data/atlas.json', import.meta.url))));
 for (const focus of ['force','net_force','acceleration','ion']) {
  const expected = new Set(a.edges.filter(e => e.source === focus || e.target === focus).map(e => e.source === focus ? e.target : e.source));
  const reached = new Set();
  for (let offset=0; offset<expected.size; offset+=4) {
   const lens = globalThis.PhysicsGraphView.neighborhood(a,focus,offset,4);
   for (const node of lens.nodes) if (node.id !== focus) reached.add(node.id);
  }
  assert.deepEqual(reached,expected,focus);
 }
});
