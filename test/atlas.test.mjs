import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { isDeepStrictEqual } from 'node:util';
import { buildAtlas } from '../scripts/build-atlas.mjs';

const atlasPromise = buildAtlas();

test('all discovered source graphs retain complete original records and valid layouts', async () => {
  const atlas = await atlasPromise;
  assert.ok(atlas.documents.length >= 12);
  assert.ok(atlas.summary.concepts >= 2744);
  assert.ok(atlas.documents.some(document => document.file.startsWith('matter_full_')));
  assert.ok(atlas.documents.some(document => document.file.startsWith('albert_einstein_')));
  assert.ok(atlas.documents.some(document => document.file.startsWith('theory_of_relativity_')));
  assert.ok(atlas.documents.some(document => document.file.startsWith('force_full_')));
  assert.ok(atlas.documents.some(document => document.file.startsWith('acceleration_full_')));
  assert.ok(atlas.documents.some(document => document.file.startsWith('astrophysics_full_')));
  for (const node of atlas.nodes) {
    assert.ok(Number.isFinite(node.layout.x) && Number.isFinite(node.layout.y), node.id);
  }
  for (const document of atlas.documents) {
    const original = JSON.parse(await readFile(new URL(`../data/${document.file}`, import.meta.url)));
    assert.equal(atlas.edges.filter(edge => edge.document === document.file).length, (original.edges || original.relationships).length);
    for (const key of Object.keys(original).filter(key => !['nodes', 'edges', 'relationships', 'claims', 'source_claims'].includes(key))) {
      assert.ok(document.fields.some(field => field.key === key) || ['title', 'graph_id', 'domain'].includes(key), `${document.file}: ${key}`);
    }
    for (const node of original.nodes) {
      const merged = atlas.nodes.find(candidate => candidate.id === node.id);
      assert.ok(merged.variants.some(variant => variant.document === document.file && isDeepStrictEqual(variant.record, node)), node.id);
      const variant = merged.variants.find(record => record.document === document.file && isDeepStrictEqual(record.record, node));
      for (const key of Object.keys(node).filter(key => !['id', 'label', 'type', 'node_type'].includes(key))) {
        assert.ok(variant.fields.some(field => field.key === key), `${document.file}/${node.id}: ${key}`);
      }
    }
    for (const edge of atlas.edges.filter(edge => edge.document === document.file)) {
      for (const key of Object.keys(edge.record).filter(key => !['source', 'target', 'relation', 'relationship', 'semantic', 'id', 'label', 'type', 'node_type'].includes(key))) {
        assert.ok(edge.fields.some(field => field.key === key), `${document.file}/edge: ${key}`);
      }
    }
  }
});

test('cross-source IDs are unified and every relationship resolves', async () => {
  const atlas = await atlasPromise;
  const ids = new Set(atlas.nodes.map(node => node.id));
  assert.equal(ids.size, atlas.nodes.length);
  assert.ok(atlas.summary.overlaps >= 131);
  assert.ok(atlas.nodes.find(node => node.id === 'thermodynamics').variants.length >= 2);
  assert.equal(atlas.summary.unresolved, 0);
  for (const edge of atlas.edges) {
    assert.ok(ids.has(edge.source), edge.source);
    assert.ok(ids.has(edge.target), edge.target);
  }
});

test('force and acceleration retain their explicit mechanism, equation and assumptions', async () => {
  const atlas = await atlasPromise;
  const accelerationDocument = atlas.documents.find(document => document.file.startsWith('acceleration_full_'));
  const forceDocument = atlas.documents.find(document => document.file.startsWith('force_full_'));
  const astroDocument = atlas.documents.find(document => document.file.startsWith('astrophysics_full_'));
  assert.equal(accelerationDocument.edgeCount, 221);
  assert.equal(forceDocument.edgeCount, 634);
  assert.equal(astroDocument.edgeCount, 211);
  const proof = atlas.edges.find(edge => edge.source === 'net_force' && edge.target === 'acceleration' && edge.relation === 'causes_acceleration_through');
  assert.equal(proof.record.semantic_role, 'causal_derivation');
  assert.equal(proof.record.mathematical_form, 'F_net=dp/dt=m a');
  assert.match(proof.record.conditions, /constant mass/);
  assert.deepEqual(proof.record.source_line_range, [132, 132]);
  assert.equal(proof.fields.find(field => field.key === 'mechanism').value, proof.record.mechanism);
  assert.equal(proof.semantic, proof.record.mechanism);
  assert.ok(atlas.nodes.find(node => node.id === 'net_force').variants.some(variant => variant.document === accelerationDocument.file));
});

test('new ion and quantum evidence can be traced to its complete source claims', async () => {
  const atlas = await atlasPromise;
  const ion = atlas.nodes.find(node => node.id === 'ion');
  const variant = ion.variants.find(record => record.document.startsWith('ion_full'));
  assert.ok(variant.fields.some(field => field.key === 'charge_definition'));
  assert.ok(variant.claims.some(claim => claim.provenance?.source_lines));
  assert.ok(atlas.documents.some(document => document.graphId.startsWith('quantum_mechanics')));
  assert.ok(atlas.edges.some(edge => edge.evidence.some(claim => claim.provenance)));
  const einstein = atlas.edges.find(edge => edge.document.startsWith('albert_einstein_') && edge.record.source_claim_ids?.length);
  assert.ok(einstein.evidence.some(claim => claim.claim && claim.line_start), 'Einstein source_claim_ids resolve to source lines');
  const linkedPath = atlas.nodes.find(node => node.id === 'concept_special_relativity').variants.find(variant => variant.document.startsWith('albert_einstein_'));
  assert.ok(linkedPath.related.some(record => record.section === 'learning_paths' && record.record.sequence.includes('concept_special_relativity')));
});

test('learning routes reference real concepts and added notes have provenance', async () => {
  const atlas = await atlasPromise;
  const byId = new Map(atlas.nodes.map(node => [node.id, node]));
  for (const route of atlas.paths) for (const id of route.steps) assert.ok(byId.has(id), id);
  assert.equal(byId.get('calculus').addedByCurriculum, true);
  assert.equal(byId.get('calculus').variants.length, 0);
  assert.ok(byId.get('entropy').variants.length >= 2);
});
