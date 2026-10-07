import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {isDeepStrictEqual}from'node:util';import {buildAtlas}from'../scripts/build-atlas.mjs';import {isMetadata,semanticKind}from'../scripts/canonical-policy.mjs';
const promise=buildAtlas();
test('every uploaded node and edge survives exactly in canonical provenance or supporting archive',async()=>{const a=await promise;assert.equal(a.documents.length,14);for(const d of a.documents){const original=JSON.parse(await readFile(new URL('../data/'+d.file,import.meta.url)));for(const n of original.nodes){const preserved=a.nodes.some(c=>c.variants.some(v=>v.document===d.file&&isDeepStrictEqual(v.record,n)))||a.archive.nodes.some(v=>v.document===d.file&&isDeepStrictEqual(v.record,n));assert.ok(preserved,d.file+'/'+n.id);}const records=[...a.edges.flatMap(e=>e.provenance),...a.archive.edges].filter(v=>v.document===d.file);assert.equal(records.length,(original.edges||original.relationships).length);for(const [i,e] of(original.edges||original.relationships).entries())assert.ok(records.some(p=>p.index===i&&isDeepStrictEqual(p.record,e)));}assert.ok(a.nodes.every(n=>Number.isFinite(n.layout.x)&&Number.isFinite(n.layout.y)));});
test('explicit aliases merge concepts across datasets without merging distinct quantities or local equations',async()=>{const a=await promise;const by=new Map(a.nodes.map(n=>[n.id,n]));for(const [x,y]of a.aliases.distinct){assert.ok(by.has(x),x);assert.ok(by.has(y),y);assert.notEqual(x,y);}for(const id of ['force','acceleration','quantum_mechanics','general_relativity','ion','thermodynamics','mass_energy_equivalence'])assert.ok(by.get(id).topics.length>=2,id);assert.ok(by.get('force').aliases.includes('concept_force'));assert.ok(!by.has('concept_force'));assert.ok(!by.has('person_albert_einstein'));assert.ok(a.nodes.every(n=>!isMetadata(n)));assert.ok(by.get('general_relativity').supporting.length);assert.ok(a.nodes.filter(n=>n.id.endsWith('::eq_mass_energy')).length>=1);});
test('typed directed physical claims aggregate duplicates but not inverse causation',async()=>{const a=await promise;const ids=new Set(a.nodes.map(n=>n.id));const e=a.edges.find(e=>e.source==='net_force'&&e.target==='acceleration'&&e.relation==='causes');assert.equal(e.kind,'causation');assert.equal(e.provenance.length,6);assert.match(e.scope,/Nonzero.*constant positive mass/);assert.ok(e.evidence.some(c=>c.references?.some(r=>r.url.includes('openstax.org'))));assert.ok(!a.edges.some(e=>e.source==='acceleration'&&e.target==='net_force'&&e.kind==='causation'));for(const e of a.edges){assert.ok(ids.has(e.source)&&ids.has(e.target));assert.notEqual(e.source,e.target);assert.ok(e.kind&&e.directed&&e.provenance.length);assert.equal(e.claimCount,e.provenance.length);}assert.equal(new Set(a.edges.map(e=>e.id)).size,a.edges.length);assert.equal(semanticKind('time_derivative_defines'),'derivation');assert.equal(semanticKind('conserves'),'conservation');assert.equal(semanticKind('approximates'),'approximation');});
test('curated cross-domain bridges are scoped and have primary educational provenance',async()=>{const a=await promise;for(const [source,target]of [['temperature','kinetic_energy'],['kinetic_energy','internal_energy'],['electrostatic_force','ionic_bond'],['quantum_mechanics','electron'],['mass_energy_equivalence','concept_stellar_fusion']]){const e=a.edges.find(e=>e.source===source&&e.target===target&&e.record.teaching_addition);assert.ok(e,source+' → '+target);assert.ok(e.scope.length>20);assert.ok(e.evidence.some(c=>c.references?.some(r=>new URL(r.url).hostname==='openstax.org')));}const by=new Set(a.nodes.map(n=>n.id));for(const p of a.paths)for(const id of p.steps)assert.ok(by.has(id));});

test('extracted document, variant and edge fields retain source details and claim links', async () => {
 const a = await promise;
 for (const document of a.documents) {
  const original = JSON.parse(await readFile(new URL('../data/' + document.file, import.meta.url)));
  const {nodes, edges, relationships, ...metadata} = original;
  assert.deepEqual(document.metadata, metadata);
  for (const key of Object.keys(metadata).filter(k => !['claims','source_claims','title','graph_id','domain'].includes(k)))
   assert.ok(document.fields.some(f => f.key === key), document.file + ': ' + key);
 }
 for (const node of a.nodes) for (const variant of node.variants)
  for (const key of Object.keys(variant.record).filter(k => !['id','label','type','node_type'].includes(k)))
   assert.ok(variant.fields.some(f => f.key === key), variant.document + '/' + node.id + ': ' + key);
 for (const edge of [...a.edges.flatMap(e => e.provenance), ...a.archive.edges])
  for (const key of Object.keys(edge.record).filter(k => !['source','target','relation','relationship','semantic','id','label','type','node_type'].includes(k)))
   assert.ok(edge.fields.some(f => f.key === key), edge.document + ': ' + key);
 const proof = a.edges.find(e => e.source === 'net_force' && e.target === 'acceleration' && e.relation === 'causes');
 const original = proof.provenance.find(p => p.document.startsWith('acceleration_full_'));
 assert.equal(original.record.mathematical_form, 'F_net=dp/dt=m a');
 assert.deepEqual(original.record.source_line_range, [132,132]);
 assert.match(original.record.conditions, /constant mass/);
 assert.equal(original.fields.find(f => f.key === 'mechanism').value, original.record.mechanism);
 const ion = a.nodes.find(n => n.id === 'ion').variants.find(v => v.document.startsWith('ion_full'));
 assert.ok(ion.fields.some(f => f.key === 'charge_definition'));
 assert.ok(ion.claims.some(c => c.provenance?.source_lines));
 const relativity = a.nodes.find(n => n.id === 'special_relativity').variants.find(v => v.document.startsWith('albert_einstein_'));
 assert.ok(relativity.related.some(r => r.section === 'learning_paths' && r.record.sequence.includes('concept_special_relativity')));
 const einstein = [...a.edges.flatMap(e => e.provenance), ...a.archive.edges].find(p => p.document.startsWith('albert_einstein_') && p.record.source_claim_ids?.length);
 assert.ok(einstein.evidence.some(c => c.claim && c.line_start));
});
