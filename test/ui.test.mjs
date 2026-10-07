import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM, VirtualConsole } from 'jsdom';

test('search, focus, source records and learning routes work on the full atlas', async () => {
  const [html, script, atlas] = await Promise.all([
    readFile(new URL('../index.html', import.meta.url), 'utf8'),
    readFile(new URL('../src/app.js', import.meta.url), 'utf8'),
    readFile(new URL('../data/atlas.json', import.meta.url), 'utf8')
  ]);
  const failures = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', error => failures.push(error));
  const dom = new JSDOM(html, { url: 'http://localhost:4173/', runScripts: 'outside-only', virtualConsole });
  dom.window.fetch = async () => ({ ok: true, json: async () => JSON.parse(atlas) });
  dom.window.HTMLElement.prototype.scrollIntoView = () => {};
  dom.window.eval(script);
  await new Promise(resolve => setTimeout(resolve, 35));
  const document = dom.window.document;
  assert.equal(document.querySelector('#metric-concepts').textContent, '783');
  assert.equal(document.querySelector('#network').querySelectorAll('.map-node').length > 10, true);

  const search = document.querySelector('#search');
  search.value = 'entropy';
  search.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  assert.ok(document.querySelector('#search-results').textContent.includes('Entropy'));
  document.querySelector('#search-results [data-concept="entropy"]').click();
  assert.ok(document.querySelector('#inspector h3').textContent.toLowerCase().includes('entropy'));
  assert.ok(document.querySelector('#inspector .relation-list').children.length > 0);

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
