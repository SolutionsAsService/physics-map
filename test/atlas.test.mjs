import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { isDeepStrictEqual } from 'node:util';
import { buildAtlas } from '../scripts/build-atlas.mjs';

test('all discovered source graphs retain complete original records and valid layouts', async () => {
  const atlas = await buildAtlas();
  assert.equal(atlas.documents.length, 6);
  assert.equal(atlas.summary.concepts, 1539);
  for (const node of atlas.nodes) {
    assert.ok(Number.isFinite(node.layout.x) && Number.isFinite(node.layout.y), node.id);
  }
  for (const document of atlas.documents) {
    const original = JSON.parse(await readFile(new URL(`../data/${document.file}`, import.meta.url)));
    assert.equal(atlas.edges.filter(edge => edge.document === document.file).length, original.edges.length);
    for (const node of original.nodes) {
      const merged = atlas.nodes.find(candidate => candidate.id === node.id);
      assert.ok(merged.variants.some(variant => variant.document === document.file && isDeepStrictEqual(variant.record, node)), node.id);
    }
  }
});

test('cross-source IDs are unified and every relationship resolves', async () => {
  const atlas = await buildAtlas();
  const ids = new Set(atlas.nodes.map(node => node.id));
  assert.equal(ids.size, atlas.nodes.length);
  assert.equal(atlas.summary.overlaps, 99);
  assert.ok(atlas.nodes.find(node => node.id === 'thermodynamics').variants.length >= 2);
  assert.equal(atlas.summary.unresolved, 0);
  for (const edge of atlas.edges) {
    assert.ok(ids.has(edge.source), edge.source);
    assert.ok(ids.has(edge.target), edge.target);
  }
});

test('new ion and quantum evidence can be traced to its complete source claims', async () => {
  const atlas = await buildAtlas();
  const ion = atlas.nodes.find(node => node.id === 'ion');
  const variant = ion.variants.find(record => record.document.startsWith('ion_full'));
  assert.ok(variant.fields.some(field => field.key === 'charge_definition'));
  assert.ok(variant.claims.some(claim => claim.provenance?.source_lines));
  assert.ok(atlas.documents.some(document => document.graphId.startsWith('quantum_mechanics')));
  assert.ok(atlas.edges.some(edge => edge.evidence.some(claim => claim.provenance)));
});

test('learning routes reference real concepts and added notes have provenance', async () => {
  const atlas = await buildAtlas();
  const byId = new Map(atlas.nodes.map(node => [node.id, node]));
  for (const route of atlas.paths) for (const id of route.steps) assert.ok(byId.has(id), id);
  assert.equal(byId.get('calculus').addedByCurriculum, true);
  assert.equal(byId.get('calculus').variants.length, 0);
  assert.ok(byId.get('entropy').variants.length >= 2);
});
