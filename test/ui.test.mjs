import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM, VirtualConsole } from 'jsdom';

test('search, focus, source records and learning routes work on the full atlas', async () => {
  const [html, keyScript, networkScript, script, atlas, styles] = await Promise.all([
    readFile(new URL('../index.html', import.meta.url), 'utf8'),
    readFile(new URL('../src/map-key.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/network.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/app.js', import.meta.url), 'utf8'),
    readFile(new URL('../data/atlas.json', import.meta.url), 'utf8'),
    readFile(new URL('../src/styles.css', import.meta.url), 'utf8')
  ]);
  assert.match(styles, /\.map-panel\s*\{[^}]*height:\s*clamp\(720px,\s*88vh,/);
  assert.match(styles, /\.inspector\s*\{[^}]*border-top:/);
  const failures = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', error => failures.push(error));
  const dom = new JSDOM(html, { url: 'http://localhost:4173/', runScripts: 'outside-only', virtualConsole });
  const graph = JSON.parse(atlas);
  dom.window.fetch = async () => ({ ok: true, json: async () => graph });
  const scrolled = [];
  dom.window.HTMLElement.prototype.scrollIntoView = function () { scrolled.push(this.id); };
  const circles = [];
  const dashPatterns = new Set();
  dom.window.HTMLCanvasElement.prototype.getContext = () => ({
    setTransform() {}, clearRect() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {},
    setLineDash(pattern) { dashPatterns.add(pattern.join(',')); },
    arc(x, y) { circles.push([x, y]); }, fill() {}, fillText() {}
  });
  dom.window.eval(keyScript);
  dom.window.eval(networkScript);
  dom.window.eval(script);
  await new Promise(resolve => setTimeout(resolve, 150));
  const document = dom.window.document;
  assert.equal(document.querySelector('#metric-concepts').textContent, graph.summary.concepts.toLocaleString());
  assert.ok(circles.length >= graph.summary.concepts);
  const rendered = circles.slice(0, graph.summary.concepts);
  assert.ok(Math.min(...rendered.map(([x]) => x)) <= 25);
  assert.ok(Math.max(...rendered.map(([x]) => x)) >= 935);
  assert.ok(Math.min(...rendered.map(([, y]) => y)) <= 25);
  assert.ok(Math.max(...rendered.map(([, y]) => y)) >= 595);
  assert.ok(document.querySelector('#map-count').textContent.includes(`${graph.summary.concepts.toLocaleString()} nodes`));
  assert.equal(document.querySelectorAll('#domain-key .domain-item').length, 10);
  assert.equal(document.querySelectorAll('#relation-key .relation-key-item').length, 6);
  assert.ok(document.querySelector('#domain-key').textContent.includes('Relativity'));
  assert.ok(dashPatterns.size >= 5);
  assert.equal(document.querySelector('#details-jump').hidden, true);
  assert.equal(document.querySelector('#map-preview').hidden, true);

  const search = document.querySelector('#search');
  search.value = 'entropy';
  search.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  assert.ok(document.querySelector('#search-results').textContent.includes('Entropy'));
  document.querySelector('#search-results [data-concept="entropy"]').click();
  assert.ok(document.querySelector('#inspector h3').textContent.toLowerCase().includes('entropy'));
  assert.ok(document.querySelector('#inspector .relation-list').children.length > 0);
  assert.equal(document.querySelectorAll('#inspector .relation-entry').length, graph.edges.filter(edge => edge.source === 'entropy' || edge.target === 'entropy').length);
  assert.ok(document.querySelector('#map-count').textContent.includes('neighbors highlighted'));
  assert.equal(document.querySelector('#map-preview').hidden, false);
  assert.ok(document.querySelector('#map-preview h3').textContent.toLowerCase().includes('entropy'));
  assert.ok(document.querySelector('#map-preview').textContent.includes('SOURCE EXCERPT'));
  const sample = document.querySelector('#map-preview .preview-link');
  assert.ok(sample);
  assert.ok(sample.querySelector('svg path').getAttribute('stroke-dasharray'));
  assert.ok(graph.edges.filter(edge => (edge.source === 'entropy' && edge.target === sample.dataset.concept) || (edge.target === 'entropy' && edge.source === sample.dataset.concept)).some(edge => sample.textContent.toLowerCase().includes(edge.relation.replaceAll('_', ' ').toLowerCase())));
  assert.ok(document.querySelector('#inspector .relation-style svg'));
  assert.ok(document.querySelector('#inspector').textContent.includes('Original relation:'));
  sample.click();
  assert.equal(document.querySelector('#inspector h3').textContent, graph.nodes.find(node => node.id === sample.dataset.concept).label);
  document.querySelector('#preview-read').click();
  assert.equal(scrolled.at(-1), 'inspector');
  assert.ok(document.querySelector('#inspector .relation-list').children.length > 0);

  search.value = 'net ionic charge';
  search.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  assert.ok(document.querySelector('#search-results').textContent.includes('Ion'));
  document.querySelector('#search-results [data-concept="ion"]').click();
  assert.ok(document.querySelector('#inspector').textContent.includes('Q/e = N_protons - N_electrons'));
  assert.ok(document.querySelector('#inspector').textContent.includes('L67-L70'));
  assert.equal(document.querySelector('#details-jump').hidden, false);
  assert.ok(document.querySelector('#map-preview').textContent.includes('recorded links'));

  const sourceContext = document.querySelector('#inspector .document-context');
  sourceContext.open = true;
  sourceContext.dispatchEvent(new dom.window.Event('toggle'));
  assert.ok(sourceContext.querySelector('.document-fields').textContent.includes('Schema version'));
  assert.ok(sourceContext.querySelector('pre').textContent.includes('"schema_version"'));
  const raw = document.querySelector('#inspector .raw-record');
  raw.open = true;
  raw.dispatchEvent(new dom.window.Event('toggle'));
  assert.ok(raw.querySelector('pre').textContent.includes('"variants"'));

  document.querySelector('#catalog-search').value = 'concept_special_relativity';
  document.querySelector('#catalog-search').dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  document.querySelector('#catalog-items [data-concept="concept_special_relativity"]').click();
  const study = document.querySelector('#inspector .related-material');
  assert.ok(study.textContent.includes('Learning Paths'));
  assert.ok(study.textContent.includes('concept_special_relativity'));
  search.value = 'Einstein: Foundations';
  search.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  assert.ok(document.querySelector('#search-results').textContent.includes('matches'));
  document.querySelector('#catalog-search').value = 'Einstein: Foundations';
  document.querySelector('#catalog-search').dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  assert.ok(document.querySelector('#catalog-items [data-concept="concept_special_relativity"]'));
  document.querySelector('#details-jump').click();

  document.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  assert.equal(document.querySelector('#inspector h3').textContent, 'Explore the complete field.');
  assert.equal(document.querySelector('#map-mode').textContent, 'WHOLE FIELD / ALL NODES');
  assert.equal(new URL(dom.window.location.href).searchParams.has('concept'), false);
  assert.equal(document.querySelector('#map-preview').hidden, true);
  document.querySelector('.starter-links [data-concept="entropy"]').click();
  document.querySelector('#preview-close').click();
  assert.equal(document.querySelector('#map-mode').textContent, 'WHOLE FIELD / ALL NODES');
  assert.equal(document.querySelector('#map-preview').hidden, true);

  document.querySelector('#route-list button').click();
  assert.equal(document.querySelector('#route-detail').hidden, false);
  document.querySelector('#route-next').click();
  assert.ok(document.querySelector('#route-detail').textContent.includes('02'));
  assert.deepEqual(failures, []);
  dom.window.close();
});
