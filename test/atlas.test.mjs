import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { isDeepStrictEqual } from 'node:util';
import { buildAtlas } from '../scripts/build-atlas.mjs';

test('all three source graphs remain represented with complete original records', async () => {
  const atlas = await buildAtlas();
  assert.equal(atlas.documents.length, 3);
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
  assert.equal(atlas.summary.overlaps, 46);
  assert.ok(atlas.nodes.find(node => node.id === 'thermodynamics').variants.length >= 2);
  assert.equal(atlas.summary.unresolved, 0);
  for (const edge of atlas.edges) {
    assert.ok(ids.has(edge.source), edge.source);
    assert.ok(ids.has(edge.target), edge.target);
  }
});

test('learning routes reference real concepts and added notes have provenance', async () => {
  const atlas = await buildAtlas();
  const byId = new Map(atlas.nodes.map(node => [node.id, node]));
  for (const route of atlas.paths) for (const id of route.steps) assert.ok(byId.has(id), id);
  assert.equal(byId.get('calculus').addedByCurriculum, true);
  assert.equal(byId.get('calculus').variants.length, 0);
  assert.ok(byId.get('entropy').variants.length >= 2);
});
