import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';

test('every recorded relationship gets a visual family without losing its original meaning', async () => {
  const script = await readFile(new URL('../src/map-key.js', import.meta.url), 'utf8');
  const atlas = JSON.parse(await readFile(new URL('../data/atlas.json', import.meta.url), 'utf8'));
  const context = { window: {} };
  runInNewContext(script, context);
  const key = context.window.PhysicsMapKey;
  const examples = [
    ['instance_of', 'structure'], ['provides_provenance_for', 'evidence'],
    ['authored', 'history'], ['predicts', 'effect'], ['measures', 'practice'],
    ['associated_with', 'related']
  ];
  for (const [relation, family] of examples) assert.equal(key.classify({ relation }).id, family);
  assert.equal(key.groupOf({ type: 'scientist', topics: [] }), 'history');
  assert.equal(key.groupOf({ type: 'bibliographic_reference', topics: ['albert_einstein_full'] }), 'claim');
  assert.equal(key.groupOf({ type: 'concept', topics: ['albert_einstein_full'] }), 'physics');
  assert.equal(key.groupOf({ type: 'concept', topics: ['theory_of_relativity_full'] }), 'relativity');
  assert.equal(key.classify({ relation: 'unknown_connection' }).id, 'related');
  assert.ok(atlas.edges.every(edge => key.relationships.includes(key.classify(edge))));
  assert.ok(key.relationships.every(style => atlas.edges.some(edge => key.classify(edge) === style)));
  assert.equal(new Set(key.domains.map(item => item.id)).size, key.domains.length);
});
