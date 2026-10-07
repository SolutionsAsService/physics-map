const state = { atlas: null, byId: new Map(), edgesById: new Map(), selected: null, topic: 'all', query: '', catalogQuery: '', catalogLimit: 36, route: null, routeStep: 0 };
const $ = selector => document.querySelector(selector);
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const humanize = value => String(value || '').replaceAll('_', ' ').replace(/\b\w/g, letter => letter.toUpperCase());
const category = node => node?.claim ? 'claim' : node?.topics?.some(topic => topic.includes('ionic_bonding')) ? 'bonding' : node?.topics?.some(topic => topic.startsWith('ion_')) ? 'ion' : node?.topics?.some(topic => topic.includes('quantum_mechanics')) ? 'quantum' : node?.topics?.some(topic => topic.includes('physical_chemistry')) ? 'chemistry' : node?.topics?.some(topic => topic.includes('thermodynamics')) ? 'thermo' : 'physics';

function connectIndexes(atlas) {
  state.byId = new Map(atlas.nodes.map(node => [node.id, node]));
  for (const edge of atlas.edges) {
    for (const id of [edge.source, edge.target]) {
      if (!state.edgesById.has(id)) state.edgesById.set(id, []);
      state.edgesById.get(id).push(edge);
    }
  }
}

function relationDescription(edge, id) {
  const other = state.byId.get(edge.source === id ? edge.target : edge.source);
  const direction = edge.source === id ? '→' : '←';
  const relation = edge.semantic || humanize(edge.relation).toLowerCase();
  return { other, direction, relation };
}

function selectConcept(id, { scroll = false } = {}) {
  if (!state.byId.has(id)) return;
  state.selected = id;
  renderMap();
  renderInspector();
  if (scroll) $('#explorer').scrollIntoView({ behavior: 'smooth' });
  history.replaceState(null, '', `${location.pathname}?concept=${encodeURIComponent(id)}#explorer`);
}

function renderFilters() {
  const filters = [{ id: 'all', label: 'All sources' }, ...state.atlas.documents.map(doc => ({ id: doc.graphId, label: humanize(doc.domain || doc.graphId.replace(/_full.*|_whole.*/, '')) }))];
  $('#topic-filters').innerHTML = filters.map(item => `<button type="button" class="filter ${item.id === state.topic ? 'active' : ''}" data-topic="${escapeHtml(item.id)}" aria-pressed="${item.id === state.topic}">${escapeHtml(item.label)}</button>`).join('');
  $('#topic-filters').querySelectorAll('button').forEach(button => button.addEventListener('click', () => {
    state.topic = button.dataset.topic;
    renderFilters();
    renderSearch();
    renderMap();
    renderCatalog();
  }));
}

function inTopic(node) { return state.topic === 'all' || node.topics.includes(state.topic); }
function filteredNodes(query) {
  const term = query.trim().toLowerCase();
  return state.atlas.nodes.filter(node => inTopic(node) && (!term || `${node.label} ${node.description} ${node.id} ${node.note?.intuition || ''} ${node.type} ${node.variants.flatMap(variant => [...variant.fields.map(field => typeof field.value === 'string' ? field.value : JSON.stringify(field.value)), ...variant.claims.map(claim => claim.statement || '')]).join(' ')}`.toLowerCase().includes(term)));
}

function renderSearch() {
  const host = $('#search-results');
  if (!state.query.trim()) { host.hidden = true; return; }
  const results = filteredNodes(state.query).slice(0, 9);
  host.hidden = false;
  host.innerHTML = `<div class="search-meta">${filteredNodes(state.query).length} matches in ${state.topic === 'all' ? 'the full atlas' : 'this source'}</div>${results.map(node => `<button type="button" data-concept="${escapeHtml(node.id)}"><span class="result-dot ${category(node)}"></span><span><strong>${escapeHtml(node.label)}</strong><small>${escapeHtml(node.description || node.note?.intuition || 'Source reference')}</small></span><span class="result-arrow">↗</span></button>`).join('') || '<p class="search-empty">No matching concepts. Try a broader term or another source.</p>'}`;
  host.querySelectorAll('[data-concept]').forEach(button => button.addEventListener('click', () => {
    selectConcept(button.dataset.concept);
    state.query = '';
    $('#search').value = '';
    renderSearch();
  }));
}

let network;
function renderMap() {
  network?.select(state.selected);
  network?.topic(state.topic);
  $('#map-mode').textContent = state.selected ? `FOCUS / ${state.byId.get(state.selected).label.toUpperCase()}` : 'WHOLE FIELD / ALL NODES';
  $('#map-count').textContent = `${state.atlas.nodes.length.toLocaleString()} nodes · ${state.atlas.edges.length.toLocaleString()} links${state.selected ? ` · ${network?.counts().connected || 0} neighbors highlighted` : ''}`;
}

function sourceTitle(file) {
  return state.atlas.documents.find(document => document.file === file)?.title || file;
}

function displayValue(value) {
  if (typeof value === 'string') return escapeHtml(value);
  return `<pre class="field-value">${escapeHtml(JSON.stringify(value, null, 2))}</pre>`;
}

function renderInspector() {
  const host = $('#inspector');
  const node = state.selected ? state.byId.get(state.selected) : null;
  if (!node) {
    host.innerHTML = '<div class="inspector-empty"><span class="inspector-orbit" aria-hidden="true">◉</span><p class="eyebrow">YOUR OBSERVATION DECK</p><h3>Explore the complete field.</h3><p>Every source concept and relationship stays on the map. Choose a point or search to illuminate its direct connections and read the evidence behind them.</p><div class="starter-links"><button data-concept="energy">What is energy? ↗</button><button data-concept="entropy">Why entropy? ↗</button><button data-concept="quantum_mechanics">Inside quantum theory ↗</button></div></div>';
    host.querySelectorAll('[data-concept]').forEach(button => button.addEventListener('click', () => selectConcept(button.dataset.concept)));
    return;
  }
  const connections = state.edgesById.get(node.id) || [];
  const explanation = node.description || node.note?.intuition || `No prose definition is supplied for this concept. Its ${connections.length} recorded connections and source records are listed below.`;
  const sourceRecords = node.variants.map(variant => `<article class="source-variant"><h5>${escapeHtml(sourceTitle(variant.document))}</h5><p class="source-file">${escapeHtml(variant.document)}</p>${variant.fields.map(field => `<div class="source-field"><strong>${escapeHtml(field.label)}</strong><div>${displayValue(field.value)}</div></div>`).join('') || '<p>No descriptive fields supplied in this source.</p>'}${variant.source ? `<div class="source-field"><strong>Source reference</strong>${displayValue(variant.source)}</div>` : ''}${variant.claims.length ? `<div class="claim-list"><strong>Supporting claims</strong>${variant.claims.map(claim => `<div class="claim"><b>${escapeHtml(claim.id)}</b><p>${escapeHtml(claim.statement || 'Source claim reference not found')}</p>${claim.provenance ? `<small>${displayValue(claim.provenance)}</small>` : ''}</div>`).join('')}</div>` : ''}</article>`).join('');
  const relations = connections.map(edge => {
    const { other, direction, relation } = relationDescription(edge, node.id);
    return `<article class="relation-entry"><button type="button" data-concept="${escapeHtml(other?.id || '')}"><span class="relation-direction">${direction}</span><span><small>${escapeHtml(relation)}</small><strong>${escapeHtml(other?.label || other?.id || 'Unknown')}</strong></span><span class="relation-arrow">↗</span></button><div class="relation-proof"><span>${escapeHtml(sourceTitle(edge.document))}</span>${edge.semantic ? `<p>${escapeHtml(edge.semantic)}</p>` : ''}${edge.evidence.map(claim => `<p>Claim ${escapeHtml(claim.id)}: ${escapeHtml(claim.statement || 'Referenced claim missing')}${claim.provenance ? ` · ${escapeHtml(JSON.stringify(claim.provenance))}` : ''}</p>`).join('')}</div></article>`;
  }).join('');
  host.innerHTML = `<div class="inspector-content"><div class="inspector-heading"><span class="label-chip ${category(node)}">${escapeHtml(humanize(node.type))}</span><span class="record-number">${connections.length} LINKS · ${node.variants.length} SOURCES</span></div><h3>${escapeHtml(node.label)}</h3><p class="inspector-id">${escapeHtml(node.id)}</p>${node.note?.intuition ? `<div class="insight"><span class="insight-icon">✧</span><div><strong>IN PLAIN LANGUAGE · CURATED NOTE</strong><p>${escapeHtml(node.note.intuition)}</p></div></div>` : ''}<div class="inspector-section"><h4>Concept overview</h4><p>${escapeHtml(explanation)}</p>${node.note?.example ? `<p class="example"><b>For example</b> · ${escapeHtml(node.note.example)}</p>` : ''}${node.addedByCurriculum ? '<p class="provenance-warning">Teaching note added to resolve a source reference; not an original graph node.</p>' : ''}</div><div class="inspector-section"><h4>Original source records <span>${node.variants.length}</span></h4>${sourceRecords || '<p>Curriculum-only concept; no original source record.</p>'}</div><div class="inspector-section"><h4>All connections <span>${connections.length}</span></h4><p class="connection-note">Direction, meaning and source evidence are shown for each recorded link. A link without a cited claim has no claim-level citation in the source data.</p><div class="relation-list">${relations || '<p>No relationships are recorded for this concept yet.</p>'}</div></div><div class="inspector-section"><details class="raw-record"><summary>Inspect complete JSON records <span>↗</span></summary><pre></pre></details></div></div>`;
  host.querySelectorAll('[data-concept]').forEach(button => button.addEventListener('click', () => selectConcept(button.dataset.concept)));
  const details = host.querySelector('details');
  details.addEventListener('toggle', () => { if (details.open) details.querySelector('pre').textContent = JSON.stringify({ id: node.id, variants: node.variants, curriculum: node.note || null, relationships: connections }, null, 2); });
}

function renderRoutes() {
  $('#route-list').innerHTML = state.atlas.paths.map((route, index) => `<button class="route-card ${escapeHtml(route.color)}" type="button" data-route="${escapeHtml(route.id)}"><span class="route-top"><span>PATH / 0${index + 1}</span><span aria-hidden="true">↗</span></span><span class="route-art" aria-hidden="true">${route.steps.map((_, step) => `<i style="--step:${step}"></i>`).join('')}</span><strong>${escapeHtml(route.title)}</strong><span class="route-subtitle">${escapeHtml(route.subtitle)}</span><span class="route-bottom">${route.steps.length} concepts <span>FOLLOW THIS ROUTE →</span></span></button>`).join('');
  $('#route-list').querySelectorAll('button').forEach(button => button.addEventListener('click', () => {
    state.route = state.atlas.paths.find(route => route.id === button.dataset.route);
    state.routeStep = 0;
    renderRouteDetail();
    $('#route-detail').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }));
}

function renderRouteDetail() {
  const host = $('#route-detail');
  if (!state.route) { host.hidden = true; return; }
  host.hidden = false;
  const route = state.route;
  const id = route.steps[state.routeStep];
  const concept = state.byId.get(id);
  const previous = route.steps[state.routeStep - 1];
  const bridge = previous ? state.atlas.edges.find(edge => (edge.source === previous && edge.target === id) || (edge.target === previous && edge.source === id)) : null;
  const transition = !previous ? 'Every route starts somewhere. Choose this idea and follow its connections.' : bridge ? `Recorded connection: ${escapeHtml(state.byId.get(previous).label)} ${escapeHtml(humanize(bridge.relation).toLowerCase())} ${escapeHtml(concept.label)}.` : `Next, look at ${escapeHtml(concept.label)} to connect this idea with ${escapeHtml(state.byId.get(previous).label)}.`;
  host.innerHTML = `<div><p class="eyebrow">FOLLOWING / ${escapeHtml(route.title.toUpperCase())}</p><h3>${escapeHtml(concept.label)}</h3><p>${escapeHtml(concept.note?.intuition || concept.description || 'Explore this concept in its full source record.')}</p><small>${transition}</small><div class="route-actions"><button class="button primary" id="route-explore" type="button">Explore this idea ↗</button><button class="button outline" id="route-next" type="button">${state.routeStep + 1 === route.steps.length ? 'Start again ↺' : 'Next idea →'}</button></div></div><div class="route-progress"><span>YOUR ROUTE / ${state.routeStep + 1} OF ${route.steps.length}</span>${route.steps.map((step, index) => `<button type="button" data-step="${index}" class="${index === state.routeStep ? 'current' : ''}"><b>${String(index + 1).padStart(2, '0')}</b>${escapeHtml(state.byId.get(step).label)}</button>`).join('')}</div>`;
  $('#route-explore').addEventListener('click', () => selectConcept(id, { scroll: true }));
  $('#route-next').addEventListener('click', () => { state.routeStep = (state.routeStep + 1) % route.steps.length; renderRouteDetail(); });
  host.querySelectorAll('[data-step]').forEach(button => button.addEventListener('click', () => { state.routeStep = Number(button.dataset.step); renderRouteDetail(); }));
}

function renderCatalog() {
  const filtered = filteredNodes(state.catalogQuery);
  $('#catalog-count').textContent = `${filtered.length} RECORDS`;
  $('#catalog-items').innerHTML = filtered.slice(0, state.catalogLimit).map(node => `<button type="button" data-concept="${escapeHtml(node.id)}"><span class="result-dot ${category(node)}"></span><span><strong>${escapeHtml(node.label)}</strong><small>${escapeHtml(node.type.replaceAll('_', ' '))}${node.variants.length > 1 ? ` · ${node.variants.length} source records` : ''}</small></span><span aria-hidden="true">↗</span></button>`).join('') || '<p class="search-empty">No concepts found in this source. Try another filter.</p>';
  $('#catalog-more').hidden = filtered.length <= state.catalogLimit;
  $('#catalog-items').querySelectorAll('[data-concept]').forEach(button => button.addEventListener('click', () => selectConcept(button.dataset.concept, { scroll: true })));
}

function setupMapGestures() {
  network = window.PhysicsNetwork.mount($('#network'), $('#map-tooltip'), state.atlas, id => selectConcept(id));
  $('#zoom-in').addEventListener('click', () => network.zoom(1.3));
  $('#zoom-out').addEventListener('click', () => network.zoom(1 / 1.3));
  $('#reset-map').addEventListener('click', () => {
    state.selected = null;
    network.fit();
    renderMap();
    renderInspector();
    history.replaceState(null, '', `${location.pathname}#explorer`);
  });
}

async function init() {
  try {
    const response = await fetch('./data/atlas.json');
    if (!response.ok) throw new Error(`Could not load atlas (HTTP ${response.status})`);
    state.atlas = await response.json();
    connectIndexes(state.atlas);
    $('#metric-concepts').textContent = state.atlas.summary.concepts.toLocaleString();
    $('#metric-relations').textContent = state.atlas.summary.relationships.toLocaleString();
    $('#metric-overlap').textContent = state.atlas.summary.overlaps;
    $('#source-links').innerHTML = state.atlas.documents.map((doc, index) => `<a href="./data/${doc.file.split('/').map(encodeURIComponent).join('/')}" download><span>${String(index + 1).padStart(2, '0')} / ${escapeHtml(doc.title)}</span><span>↓</span></a>`).join('') + `<a href="./data/atlas.json" download><span>${String(state.atlas.documents.length + 1).padStart(2, '0')} / Unified atlas JSON</span><span>↓</span></a>`;
    setupMapGestures(); renderFilters(); renderMap(); renderInspector(); renderRoutes(); renderCatalog();
    $('#search').addEventListener('input', event => { state.query = event.target.value; renderSearch(); });
    $('#catalog-search').addEventListener('input', event => { state.catalogQuery = event.target.value; state.catalogLimit = 36; renderCatalog(); });
    $('#catalog-more').addEventListener('click', () => { state.catalogLimit += 36; renderCatalog(); });
    document.addEventListener('keydown', event => { if (event.key === '/' && !['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) { event.preventDefault(); $('#search').focus(); $('#explorer').scrollIntoView({ behavior: 'smooth' }); } if (event.key === 'Escape') { state.query = ''; $('#search').value = ''; renderSearch(); } });
    const initial = new URL(location.href).searchParams.get('concept');
    if (initial && state.byId.has(initial)) selectConcept(initial);
  } catch (error) {
    $('#inspector').innerHTML = `<div class="inspector-empty"><h3>Atlas unavailable</h3><p>${escapeHtml(error.message)}. Serve this folder over HTTP so the JSON can load.</p></div>`;
    $('#map-mode').textContent = 'ATLAS UNAVAILABLE';
  }
}

init();
