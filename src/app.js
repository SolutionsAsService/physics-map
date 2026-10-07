const state = { atlas: null, byId: new Map(), edgesById: new Map(), selected: null, topic: 'all', query: '', catalogQuery: '', catalogLimit: 36, route: null, routeStep: 0, zoom: 1, panX: 0, panY: 0 };
const $ = selector => document.querySelector(selector);
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const humanize = value => String(value || '').replaceAll('_', ' ').replace(/\b\w/g, letter => letter.toUpperCase());
const abbreviate = text => text.length > 22 ? `${text.slice(0, 20)}…` : text;
const category = node => node?.topics?.some(topic => topic.includes('physical_chemistry')) ? 'chemistry' : node?.topics?.some(topic => topic.includes('thermodynamics')) ? 'thermo' : 'physics';

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
  if (!inTopic(state.byId.get(id))) {
    state.topic = 'all';
    renderFilters();
    renderCatalog();
  }
  state.selected = id;
  state.zoom = 1;
  state.panX = 0;
  state.panY = 0;
  renderMap();
  renderInspector();
  if (scroll) $('#explorer').scrollIntoView({ behavior: 'smooth' });
  history.replaceState(null, '', `${location.pathname}?concept=${encodeURIComponent(id)}#explorer`);
}

function renderFilters() {
  const filters = [{ id: 'all', label: 'All sources' }, ...state.atlas.documents.map(doc => ({ id: doc.graphId, label: doc.graphId.includes('physical_chemistry') ? 'Physical chemistry' : doc.graphId.includes('thermodynamics') ? 'Thermodynamics' : 'Physics' }))];
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
  return state.atlas.nodes.filter(node => inTopic(node) && (!term || `${node.label} ${node.description} ${node.id} ${node.note?.intuition || ''} ${node.type}`.toLowerCase().includes(term)));
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

const anchorIds = ['physics', 'motion', 'force', 'energy', 'thermodynamics', 'temperature', 'heat', 'entropy', 'statistical_mechanics', 'atom', 'quantum_mechanics', 'electromagnetism', 'electromagnetic_radiation', 'chemical_equilibrium', 'physical_chemistry', 'classical_thermodynamics', 'general_relativity', 'wave', 'molecule', 'pressure'];

function visibleNetwork() {
  if (!state.selected) {
    const nodes = anchorIds.map(id => state.byId.get(id)).filter(node => node && inTopic(node));
    const ids = new Set(nodes.map(node => node.id));
    const recorded = state.atlas.edges.filter(edge => ids.has(edge.source) && ids.has(edge.target));
    const paths = state.atlas.paths.flatMap(route => route.steps.slice(1).map((id, index) => ({ source: route.steps[index], target: id, relation: 'learning route', guide: true }))).filter(edge => ids.has(edge.source) && ids.has(edge.target));
    return { nodes, edges: [...recorded, ...paths] };
  }
  const connections = state.edgesById.get(state.selected) || [];
  const ranked = [...connections].sort((left, right) => {
    const rank = edge => {
      const id = edge.source === state.selected ? edge.target : edge.source;
      const node = state.byId.get(id);
      return (node?.unresolved ? -100 : 0) + (node?.description ? 20 : 0) + (state.edgesById.get(id)?.length || 0);
    };
    return rank(right) - rank(left);
  });
  const visible = ranked.filter(edge => inTopic(state.byId.get(edge.source === state.selected ? edge.target : edge.source))).slice(0, 39);
  const ids = new Set([state.selected, ...visible.flatMap(edge => [edge.source, edge.target])]);
  return { nodes: [...ids].map(id => state.byId.get(id)), edges: visible, omitted: connections.length - visible.length };
}

function layout(nodes) {
  const positions = new Map();
  const center = { x: 480, y: 304 };
  if (state.selected) {
    positions.set(state.selected, center);
    const surrounding = nodes.filter(node => node.id !== state.selected);
    surrounding.forEach((node, index) => {
      const inner = index < 14;
      const ringIndex = inner ? index : index - 14;
      const ringCount = inner ? Math.min(14, surrounding.length) : surrounding.length - 14;
      const angle = (ringIndex / Math.max(1, ringCount)) * Math.PI * 2 - Math.PI / 2 + (inner ? 0 : 0.16);
      const radius = inner ? 164 : 260;
      positions.set(node.id, { x: center.x + Math.cos(angle) * radius * 1.34, y: center.y + Math.sin(angle) * radius });
    });
  } else {
    const centerNode = nodes.find(node => node.id === 'physics') || nodes[0];
    if (centerNode) positions.set(centerNode.id, center);
    const surrounding = nodes.filter(node => node !== centerNode);
    surrounding.forEach((node, index) => {
      const angle = index / Math.max(1, surrounding.length) * Math.PI * 2 - Math.PI / 2;
      const radius = index % 3 === 0 ? 226 : 255;
      positions.set(node.id, { x: center.x + Math.cos(angle) * radius * 1.55, y: center.y + Math.sin(angle) * radius });
    });
  }
  return positions;
}

const svgNs = 'http://www.w3.org/2000/svg';
function svgElement(tag, attributes = {}) {
  const element = document.createElementNS(svgNs, tag);
  for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, String(value));
  return element;
}
function updateTransform() {
  $('#network-world')?.setAttribute('transform', `translate(${state.panX} ${state.panY}) translate(480 310) scale(${state.zoom}) translate(-480 -310)`);
}
function renderMap() {
  const svg = $('#network');
  svg.replaceChildren();
  const { nodes, edges, omitted = 0 } = visibleNetwork();
  $('#map-mode').textContent = state.selected ? `FOCUS / ${state.byId.get(state.selected).label.toUpperCase()}` : 'WHOLE FIELD / KEY IDEAS';
  $('#map-count').textContent = `${nodes.length} shown · ${edges.length} links${omitted > 0 ? ` · ${omitted} more in record` : ''}`;
  const world = svgElement('g', { id: 'network-world' });
  svg.append(world);
  const positions = layout(nodes);
  for (const edge of edges) {
    const a = positions.get(edge.source), b = positions.get(edge.target);
    if (!a || !b) continue;
    const line = svgElement('line', { x1: a.x, y1: a.y, x2: b.x, y2: b.y, class: edge.guide ? 'edge guide' : 'edge' });
    const tip = svgElement('title'); tip.textContent = `${state.byId.get(edge.source)?.label} ${humanize(edge.relation).toLowerCase()} ${state.byId.get(edge.target)?.label}`;
    line.append(tip); world.append(line);
  }
  nodes.forEach((node, index) => {
    const point = positions.get(node.id);
    if (!point) return;
    const selected = node.id === (state.selected || 'physics');
    const group = svgElement('g', { class: `map-node ${category(node)} ${selected ? 'chosen' : ''}`, tabindex: 0, role: 'button', 'aria-label': `Explore ${node.label}`, transform: `translate(${point.x} ${point.y})` });
    group.append(svgElement('circle', { r: selected ? 21 : 15, class: 'node-halo' }));
    group.append(svgElement('circle', { r: selected ? 10 : node.unresolved ? 4 : 6, class: 'node-core' }));
    if (selected || nodes.length <= 21 || index < 18) {
      const label = svgElement('text', { y: selected ? 43 : 31, 'text-anchor': 'middle' });
      label.textContent = abbreviate(node.label);
      group.append(label);
    }
    const tip = svgElement('title'); tip.textContent = node.label; group.append(tip);
    group.addEventListener('click', () => selectConcept(node.id));
    group.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); selectConcept(node.id); } });
    world.append(group);
  });
  updateTransform();
}

function renderInspector() {
  const host = $('#inspector');
  const node = state.selected ? state.byId.get(state.selected) : null;
  if (!node) {
    host.innerHTML = '<div class="inspector-empty"><span class="inspector-orbit" aria-hidden="true">◉</span><p class="eyebrow">YOUR OBSERVATION DECK</p><h3>Start with a question.</h3><p>Pick a glowing point on the map, search for an idea, or follow a learning route. The connections will reveal themselves.</p><div class="starter-links"><button data-concept="energy">What is energy? ↗</button><button data-concept="entropy">Why entropy? ↗</button><button data-concept="quantum_mechanics">Inside quantum theory ↗</button></div></div>';
    host.querySelectorAll('[data-concept]').forEach(button => button.addEventListener('click', () => selectConcept(button.dataset.concept)));
    return;
  }
  const connections = state.edgesById.get(node.id) || [];
  const neighbors = connections.slice(0, 120);
  const sources = node.variants.map(variant => variant.document);
  const sourceLabels = [...new Set(sources)].map(file => file.includes('physical_chemistry') ? 'Physical chemistry' : file.includes('thermodynamics') ? 'Thermodynamics' : 'Physics');
  host.innerHTML = `<div class="inspector-content"><div class="inspector-heading"><span class="label-chip ${category(node)}">${escapeHtml(humanize(node.type))}</span><span class="record-number">${connections.length} LINKS</span></div><h3>${escapeHtml(node.label)}</h3><p class="inspector-id">${escapeHtml(node.id)}</p>${node.note?.intuition ? `<div class="insight"><span class="insight-icon">✧</span><div><strong>IN PLAIN LANGUAGE</strong><p>${escapeHtml(node.note.intuition)}</p></div></div>` : ''}<div class="inspector-section"><h4>What the source says</h4><p>${escapeHtml(node.description || 'No definition in the source record. Explore its recorded connections below.')}</p>${node.note?.example ? `<p class="example"><b>For example</b> · ${escapeHtml(node.note.example)}</p>` : ''}${node.addedByCurriculum ? '<p class="provenance-warning">Teaching note added to resolve a source reference; not an original graph node.</p>' : ''}</div><div class="inspector-section"><h4>Connections <span>${connections.length}</span></h4><div class="relation-list">${neighbors.map(edge => { const { other, direction, relation } = relationDescription(edge, node.id); return `<button type="button" data-concept="${escapeHtml(other?.id || '')}"><span class="relation-direction">${direction}</span><span><small>${escapeHtml(relation)}</small><strong>${escapeHtml(other?.label || 'Unknown')}</strong></span><span class="relation-arrow">↗</span></button>`; }).join('') || '<p>No relationships are recorded for this concept yet.</p>'}</div>${connections.length > neighbors.length ? `<p class="overflow-note">${connections.length - neighbors.length} additional relationships remain in the downloadable atlas.</p>` : ''}</div><div class="inspector-section"><h4>Source records</h4><p class="source-labels">${sourceLabels.length ? sourceLabels.map(label => escapeHtml(label)).join(' · ') : 'Curriculum expansion'}</p><details class="raw-record"><summary>View full JSON records <span>↗</span></summary><pre></pre></details></div></div>`;
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
  const svg = $('#network');
  let drag = null;
  svg.addEventListener('pointerdown', event => { if (event.target.closest('.map-node')) return; drag = { x: event.clientX, y: event.clientY, panX: state.panX, panY: state.panY }; svg.setPointerCapture(event.pointerId); });
  svg.addEventListener('pointermove', event => { if (!drag) return; const bounds = svg.getBoundingClientRect(); state.panX = drag.panX + (event.clientX - drag.x) * (960 / bounds.width); state.panY = drag.panY + (event.clientY - drag.y) * (620 / bounds.height); updateTransform(); });
  svg.addEventListener('pointerup', () => { drag = null; });
  svg.addEventListener('pointercancel', () => { drag = null; });
  svg.addEventListener('wheel', event => { event.preventDefault(); state.zoom = Math.max(0.6, Math.min(2.4, state.zoom * (event.deltaY < 0 ? 1.08 : 0.92))); updateTransform(); }, { passive: false });
  $('#zoom-in').addEventListener('click', () => { state.zoom = Math.min(2.4, state.zoom * 1.2); updateTransform(); });
  $('#zoom-out').addEventListener('click', () => { state.zoom = Math.max(0.6, state.zoom / 1.2); updateTransform(); });
  $('#reset-map').addEventListener('click', () => { state.selected = null; state.zoom = 1; state.panX = 0; state.panY = 0; renderMap(); renderInspector(); history.replaceState(null, '', `${location.pathname}#explorer`); });
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
    $('#source-links').innerHTML = state.atlas.documents.map((doc, index) => `<a href="./data/${encodeURIComponent(doc.file)}" download><span>0${index + 1} / ${escapeHtml(doc.title)}</span><span>↓</span></a>`).join('') + '<a href="./data/atlas.json" download><span>04 / Unified atlas JSON</span><span>↓</span></a>';
    renderFilters(); renderMap(); renderInspector(); renderRoutes(); renderCatalog(); setupMapGestures();
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
