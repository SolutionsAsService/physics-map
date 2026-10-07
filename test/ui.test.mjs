import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM, VirtualConsole } from 'jsdom';

test('search, focus, source records and learning routes work on the full atlas', async () => {
  const [html, networkScript, script, atlas] = await Promise.all([
    readFile(new URL('../index.html', import.meta.url), 'utf8'),
    readFile(new URL('../src/network.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/app.js', import.meta.url), 'utf8'),
    readFile(new URL('../data/atlas.json', import.meta.url), 'utf8')
  ]);
  const failures = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', error => failures.push(error));
  const dom = new JSDOM(html, { url: 'http://localhost:4173/', runScripts: 'outside-only', virtualConsole });
  dom.window.fetch = async () => ({ ok: true, json: async () => JSON.parse(atlas) });
  dom.window.HTMLElement.prototype.scrollIntoView = () => {};
  const circles = [];
  dom.window.HTMLCanvasElement.prototype.getContext = () => ({
    setTransform() {}, clearRect() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {},
    arc(x, y) { circles.push([x, y]); }, fill() {}, fillText() {}
  });
  dom.window.eval(networkScript);
  dom.window.eval(script);
  await new Promise(resolve => setTimeout(resolve, 150));
  const document = dom.window.document;
  assert.equal(document.querySelector('#metric-concepts').textContent, '1,539');
  assert.ok(circles.length >= 1539);
  assert.ok(document.querySelector('#map-count').textContent.includes('1,539 nodes'));

  const search = document.querySelector('#search');
  search.value = 'entropy';
  search.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  assert.ok(document.querySelector('#search-results').textContent.includes('Entropy'));
  document.querySelector('#search-results [data-concept="entropy"]').click();
  assert.ok(document.querySelector('#inspector h3').textContent.toLowerCase().includes('entropy'));
  assert.ok(document.querySelector('#inspector .relation-list').children.length > 0);
  assert.equal(document.querySelectorAll('#inspector .relation-entry').length, JSON.parse(atlas).edges.filter(edge => edge.source === 'entropy' || edge.target === 'entropy').length);
  assert.ok(document.querySelector('#map-count').textContent.includes('neighbors highlighted'));

  search.value = 'net ionic charge';
  search.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  assert.ok(document.querySelector('#search-results').textContent.includes('Ion'));
  document.querySelector('#search-results [data-concept="ion"]').click();
  assert.ok(document.querySelector('#inspector').textContent.includes('Q/e = N_protons - N_electrons'));
  assert.ok(document.querySelector('#inspector').textContent.includes('L67-L70'));

  const raw = document.querySelector('#inspector details');
  raw.open = true;
  raw.dispatchEvent(new dom.window.Event('toggle'));
  assert.ok(raw.querySelector('pre').textContent.includes('"variants"'));

  document.querySelector('#route-list button').click();
  assert.equal(document.querySelector('#route-detail').hidden, false);
  document.querySelector('#route-next').click();
  assert.ok(document.querySelector('#route-detail').textContent.includes('02'));
  assert.deepEqual(failures, []);
  dom.window.close();
});
