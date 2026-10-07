const state = { atlas: null, byId: new Map(), edgesById: new Map(), searchText: new Map(), selected: null, activeRelation: null, relationIndex: 0, topic: 'all', query: '', catalogQuery: '', catalogLimit: 36, route: null, routeStep: 0 };
const $ = selector => document.querySelector(selector);
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const humanize = value => String(value || '').replaceAll('_', ' ').replace(/\b\w/g, letter => letter.toUpperCase());
const category = node => window.PhysicsMapKey.groupOf(node);

function connectIndexes(atlas) {
  state.byId = new Map(atlas.nodes.map(node => [node.id, node]));
  state.edgesById = new Map();
  for (const edge of atlas.edges) {
    for (const id of [edge.source, edge.target]) {
      if (!state.edgesById.has(id)) state.edgesById.set(id, []);
      state.edgesById.get(id).push(edge);
    }
  }
  state.searchText = new Map(atlas.nodes.map(node => [node.id, [
    node.id, node.label, node.type, node.description, node.note?.intuition,
    ...node.variants.flatMap(variant => [variant.document, ...variant.fields.map(field => JSON.stringify(field.value)), ...variant.claims.map(claim => JSON.stringify(claim)), ...(variant.related || []).map(item => JSON.stringify(item.record))]),
    ...(state.edgesById.get(node.id) || []).map(edge => `${edge.relation} ${edge.semantic}`)
  ].join(' ').toLowerCase()]));
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
  state.relationIndex = 0;
  renderMap();
  renderPreview();
  renderInspector();
  if (scroll) $('#explorer').scrollIntoView({ behavior: 'smooth' });
  history.replaceState(null, '', `${location.pathname}?concept=${encodeURIComponent(id)}#explorer`);
}

function clearSelection({ fit = false } = {}) {
  if (!state.selected && !fit) return;
  const wasFocused = Boolean(state.activeRelation);
  state.selected = null;
  state.activeRelation = null;
  state.relationIndex = 0;
  if (fit || wasFocused) network.fit();
  renderMap();
  renderPreview();
  renderInspector();
  const url = new URL(location.href);
  url.searchParams.delete('concept');
  history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
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
  return state.atlas.nodes.filter(node => inTopic(node) && (!term || state.searchText.get(node.id).includes(term)));
}

function renderSearch() {
  const host = $('#search-results');
  if (!state.query.trim()) { host.hidden = true; return; }
  const matches = filteredNodes(state.query);
  const results = matches.slice(0, 9);
  host.hidden = false;
  host.innerHTML = `<div class="search-meta">${matches.length} matches in ${state.topic === 'all' ? 'the full atlas' : 'this source'}</div>${results.map(node => `<button type="button" data-concept="${escapeHtml(node.id)}"><span class="result-dot ${category(node)}"></span><span><strong>${escapeHtml(node.label)}</strong><small>${escapeHtml(node.description || node.note?.intuition || 'Source reference')}</small></span><span class="result-arrow">↗</span></button>`).join('') || '<p class="search-empty">No matching concepts. Try a broader term or another source.</p>'}`;
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
  $('#details-jump').hidden = !state.selected;
  $('#map-mode').textContent = state.selected ? `FOCUS / ${state.byId.get(state.selected).label.toUpperCase()}` : 'WHOLE FIELD / ALL NODES';
  $('#map-count').textContent = `${state.atlas.nodes.length.toLocaleString()} nodes · ${state.atlas.edges.length.toLocaleString()} links${state.selected ? ` · ${network?.counts().connected || 0} neighbors highlighted` : ''}`;
  renderRelationshipStage();
}

function renderRelationshipStage() {
  const host = $('#relationship-stage');
  const directed = (state.edgesById.get(state.selected) || []).filter(edge => window.PhysicsMapKey.classify(edge).arrow);
  const previouslyHidden = host.hidden;
  host.hidden = !directed.length;
  $('.map-panel').classList.toggle('has-relation', directed.length > 0);
  if (previouslyHidden !== host.hidden) network?.resize();
  if (!directed.length) { state.activeRelation = null; host.replaceChildren(); return; }
  state.relationIndex %= directed.length;
  const edge = directed[state.relationIndex];
  const style = window.PhysicsMapKey.classify(edge);
  state.activeRelation = edge;
  const source = state.byId.get(edge.source);
  const target = state.byId.get(edge.target);
  const equation = edge.record?.mathematical_form;
  host.style.setProperty('--edge-color', style.color);
  host.innerHTML = `<div class="stage-header"><span>${style.id === 'causal' ? 'SOURCE-ASSERTED CAUSATION' : 'MATHEMATICAL DERIVATION'}</span><span>${escapeHtml(humanize(edge.relation))} · ${state.relationIndex + 1}/${directed.length}</span></div><div class="stage-chain"><button type="button" class="stage-node" data-concept="${escapeHtml(edge.source)}"><span class="stage-dot" aria-hidden="true"></span><strong>${escapeHtml(source?.label || edge.source)}</strong></button><svg class="stage-connector" viewBox="0 0 200 52" preserveAspectRatio="none" role="img" aria-label="${escapeHtml(source?.label || edge.source)} leads to ${escapeHtml(target?.label || edge.target)}"><defs><marker id="stage-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M0 0 10 5 0 10z" fill="currentColor"/></marker></defs><path class="stage-path" d="M4 26 H192" marker-end="url(#stage-arrow)"/><circle class="stage-pulse" r="3"><animateMotion dur="2.4s" repeatCount="indefinite" path="M4 26 H187"/></circle></svg><button type="button" class="stage-node" data-concept="${escapeHtml(edge.target)}"><span class="stage-dot" aria-hidden="true"></span><strong>${escapeHtml(target?.label || edge.target)}</strong></button></div><div class="stage-footer"><span>${equation ? `<b>${escapeHtml(equation)}</b> · ` : ''}${escapeHtml(sourceTitle(edge.document))}</span>${directed.length > 1 ? '<span class="stage-steps"><button type="button" data-step="-1" aria-label="Previous directed relationship">←</button><button type="button" data-step="1" aria-label="Next directed relationship">→</button></span>' : ''}</div>`;
  host.querySelectorAll('[data-concept]').forEach(button => button.addEventListener('click', () => selectConcept(button.dataset.concept)));
  host.querySelectorAll('[data-step]').forEach(button => button.addEventListener('click', () => {
    state.relationIndex = (state.relationIndex + Number(button.dataset.step) + directed.length) % directed.length;
    renderMap();
    renderPreview();
  }));
  network?.focusEdge(edge);
}

function sourceTitle(file) {
  return state.atlas.documents.find(document => document.file === file)?.title || file;
}

function lineSample(style) {
  const endpoint = style.arrow ? 34 : 41;
  const head = style.arrow === 'filled' ? `<path d="M40 5 32 1v8z" fill="${style.color}"/>` : style.arrow === 'open' ? `<path d="m33 1 7 4-7 4" fill="none" stroke="${style.color}" stroke-width="2"/>` : '';
  return `<svg class="line-sample" viewBox="0 0 42 10" width="42" height="10" aria-hidden="true"><path d="M1 5 H${endpoint}" fill="none" stroke="${style.color}" stroke-width="2.2" stroke-dasharray="${style.dash.join(' ') || 'none'}"/>${head}</svg>`;
}

function renderMapKey() {
  const key = window.PhysicsMapKey;
  $('#domain-key').innerHTML = `<span class="key-title">POINTS / DOMAINS</span>${key.domains.map(domain => `<span class="domain-item"><i style="--domain-color:${domain.color}" aria-hidden="true"></i>${escapeHtml(domain.label)}</span>`).join('')}`;
  $('#relation-key').innerHTML = key.relationships.map(style => `<span class="relation-key-item" title="${escapeHtml(style.description)}">${lineSample(style)}${escapeHtml(style.label)}</span>`).join('') + '<span class="key-note">Arrow = source → target. Causation is shown only when the source explicitly asserts it; read conditions and provenance in the preview.</span>';
}

function renderPreview() {
  const host = $('#map-preview');
  const node = state.selected && state.byId.get(state.selected);
  host.hidden = !node;
  if (!node) { host.replaceChildren(); return; }
  const sourceExcerpt = node.description || node.variants.flatMap(variant => variant.fields).find(field => ['definition', 'description', 'semantic_definition'].includes(field.key) && typeof field.value === 'string')?.value;
  const preface = sourceExcerpt || node.note?.intuition || 'No prose definition is supplied by the source graphs. The recorded connections and original fields appear in the full entry.';
  const provenance = sourceExcerpt ? 'SOURCE EXCERPT' : node.note?.intuition ? 'CURATED TEACHING NOTE' : 'CONNECTION-ONLY RECORD';
  const sources = [...new Set(node.variants.map(variant => sourceTitle(variant.document)))];
  const connections = state.edgesById.get(node.id) || [];
  const examples = [];
  const seen = new Set();
  const ordered = [...connections].sort((left, right) => {
    if (left === state.activeRelation) return -1;
    if (right === state.activeRelation) return 1;
    const rank = edge => ({ causal: 0, derivation: 1, effect: 2 })[window.PhysicsMapKey.classify(edge).id] ?? 3;
    return rank(left) - rank(right);
  });
  for (const edge of ordered) {
    const family = window.PhysicsMapKey.classify(edge).id;
    if (!seen.has(family) && examples.length < 4) { examples.push(edge); seen.add(family); }
  }
  for (const edge of ordered) {
    if (examples.length >= 4) break;
    if (!examples.includes(edge)) examples.push(edge);
  }
  const why = examples.map(edge => {
    const { other, direction } = relationDescription(edge, node.id);
    if (!other) return '';
    const style = window.PhysicsMapKey.classify(edge);
    return `<button type="button" class="preview-link" data-concept="${escapeHtml(other.id)}"><span class="preview-link-top">${lineSample(style)}<span>${escapeHtml(style.label)}</span></span><strong>${direction} ${escapeHtml(other.label)}</strong><span class="preview-link-reason">${escapeHtml(humanize(edge.relation))}${edge.semantic ? ` · ${escapeHtml(edge.semantic)}` : ''}</span><small>${escapeHtml(sourceTitle(edge.document))}</small></button>`;
  }).join('');
  const leading = ordered.find(edge => ['causal', 'derivation'].includes(window.PhysicsMapKey.classify(edge).id) && (edge.record?.mathematical_form || edge.record?.mechanism));
  const proof = leading ? `<div class="dynamic-proof"><span class="preview-kicker">${window.PhysicsMapKey.classify(leading).id === 'causal' ? 'SOURCE-ASSERTED CAUSE' : 'MATHEMATICAL DERIVATION'}</span><strong>${escapeHtml(state.byId.get(leading.source)?.label || leading.source)} → ${escapeHtml(state.byId.get(leading.target)?.label || leading.target)}</strong><span>${escapeHtml(humanize(leading.relation))}</span>${leading.record.mathematical_form ? `<b>${escapeHtml(leading.record.mathematical_form)}</b>` : ''}${leading.record.mechanism ? `<p>${escapeHtml(leading.record.mechanism)}</p>` : ''}${leading.record.conditions ? `<p><em>When:</em> ${escapeHtml(Array.isArray(leading.record.conditions) ? leading.record.conditions.join(' · ') : leading.record.conditions)}</p>` : ''}${leading.record.effect ? `<p><em>Result:</em> ${escapeHtml(leading.record.effect)}</p>` : ''}<small>Recorded in ${escapeHtml(sourceTitle(leading.document))}${leading.record.source_line_range ? ` · lines ${escapeHtml(Array.isArray(leading.record.source_line_range) ? leading.record.source_line_range.join('–') : leading.record.source_line_range)}` : ''}</small></div>` : '';
  host.innerHTML = `<div class="preview-heading"><span class="label-chip ${category(node)}">${escapeHtml(humanize(node.type))}</span><button type="button" id="preview-close" aria-label="Clear concept selection">×</button></div><p class="preview-kicker">${provenance}</p><h3>${escapeHtml(node.label)}</h3><p class="preview-id">${escapeHtml(node.id)}</p><p class="preview-preface">${escapeHtml(preface)}</p><div class="preview-meta"><span>${connections.length} recorded links</span><span>${sources.length} sources</span></div><p class="preview-sources">${sources.length ? escapeHtml(sources.slice(0, 2).join(' · ')) + (sources.length > 2 ? ` · +${sources.length - 2} more` : '') : 'Curriculum addition; no original source record'}</p>${proof}${why ? `<div class="preview-why"><span class="preview-kicker">WHY THESE POINTS CONNECT</span>${why}<p>Showing ${examples.length} of ${connections.length} recorded links. All links and evidence appear in the full entry.</p></div>` : ''}<button type="button" id="preview-read">Read full entry ↓</button>`;
  host.scrollTop = 0;
  $('#preview-close').addEventListener('click', () => clearSelection());
  $('#preview-read').addEventListener('click', () => $('#inspector').scrollIntoView({ behavior: 'smooth', block: 'start' }));
  host.querySelectorAll('.preview-link').forEach(button => button.addEventListener('click', () => selectConcept(button.dataset.concept)));
}

function displayValue(value) {
  if (value === null) return '<span class="field-empty">Null in source</span>';
  if (Array.isArray(value)) return value.length ? `<ul class="value-list">${value.map(item => `<li>${displayValue(item)}</li>`).join('')}</ul>` : '<span class="field-empty">Empty list in source</span>';
  if (typeof value === 'object') return `<dl class="value-object">${Object.entries(value).map(([key, item]) => `<div><dt>${escapeHtml(humanize(key))}</dt><dd>${displayValue(item)}</dd></div>`).join('')}</dl>`;
  return escapeHtml(value);
}

function renderFields(fields) {
  return fields.map(field => `<div class="source-field"><strong>${escapeHtml(field.label)}</strong><div>${displayValue(field.value)}</div></div>`).join('');
}

function renderClaim(claim) {
  const fields = Object.entries(claim).filter(([key]) => key !== 'id').map(([key, value]) => ({ label: humanize(key), value }));
  return `<div class="claim"><b>${escapeHtml(claim.id)}</b>${renderFields(fields)}</div>`;
}

function renderStudyMaterial(records) {
  if (!records.length) return '';
  return `<details class="related-material"><summary>Linked source material · ${records.length} records</summary>${records.map(item => {
    const sequence = Array.isArray(item.record.sequence) ? item.record.sequence.filter(id => state.byId.has(id)) : [];
    return `<article class="study-record"><h6>${escapeHtml(humanize(item.section))}</h6>${renderFields(item.fields)}${sequence.length ? `<div class="study-sequence">Explore this source path: ${sequence.map(id => `<button type="button" data-concept="${escapeHtml(id)}">${escapeHtml(state.byId.get(id).label)}</button>`).join(' → ')}</div>` : ''}</article>`;
  }).join('')}</details>`;
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
  const keyFacts = new Set(['definition', 'description', 'semantic_definition', 'scope', 'conceptual_basis', 'significance', 'history_note', 'distinction', 'foundational_issue', 'role', 'charge_definition', 'canonical_examples', 'not_to_conflate_with']);
  const perspectives = node.variants.flatMap(variant => variant.fields.filter(field => keyFacts.has(field.key) && field.value).map(field => `<div class="perspective"><strong>${escapeHtml(field.label)} · ${escapeHtml(sourceTitle(variant.document))}</strong><div>${displayValue(field.value)}</div></div>`)).join('');
  const connectedDefinitions = connections.map(edge => ({ edge, ...relationDescription(edge, node.id) })).filter(item => item.other?.description).slice(0, 5);
  const guide = `<div class="inspector-section"><h4>Source-backed field guide</h4><div class="perspectives-grid">${perspectives || '<p>No prose explanation was provided by the source graphs for this concept.</p>'}</div>${connectedDefinitions.length ? `<h5>Connected definitions · first ${connectedDefinitions.length} of ${connections.length} links</h5>${connectedDefinitions.map(({ edge, other, relation }) => `<button type="button" class="perspective-link" data-concept="${escapeHtml(other.id)}"><b>${escapeHtml(other.label)}</b> · ${escapeHtml(relation)}<small>${escapeHtml(other.description)} · ${escapeHtml(sourceTitle(edge.document))}</small></button>`).join('')}` : ''}</div>`;
  const sourceRecords = node.variants.map(variant => {
    const document = state.atlas.documents.find(item => item.file === variant.document);
    const encodedFile = variant.document.split('/').map(encodeURIComponent).join('/');
    const context = document?.metadata.source || document?.metadata.source_policy || null;
    return `<article class="source-variant"><h5>${escapeHtml(sourceTitle(variant.document))}</h5><p class="source-file">${escapeHtml(variant.document)} · <a href="./data/${encodedFile}" download>Download source JSON ↓</a></p>${renderFields(variant.fields) || '<p>No descriptive fields supplied in this record.</p>'}${variant.claims.length ? `<div class="claim-list"><strong>Supporting claims · ${variant.claims.length}</strong>${variant.claims.map(renderClaim).join('')}</div>` : ''}${renderStudyMaterial(variant.related || [])}${context ? `<div class="source-field"><strong>Source policy / origin</strong>${displayValue(context)}</div>` : ''}${document ? `<details class="document-context" data-file="${escapeHtml(variant.document)}"><summary>Source context, references &amp; complete metadata ↗</summary><div class="document-fields"></div><details class="document-raw"><summary>Full source metadata JSON</summary><pre></pre></details></details>` : ''}</article>`;
  }).join('');
  const relations = connections.map(edge => {
    const { other, direction, relation } = relationDescription(edge, node.id);
    const style = window.PhysicsMapKey.classify(edge);
    return `<article class="relation-entry"><button type="button" data-concept="${escapeHtml(other?.id || '')}"><span class="relation-direction">${direction}</span><span><span class="relation-style">${lineSample(style)}${escapeHtml(style.label)}</span><small>Original relation: ${escapeHtml(humanize(edge.relation))}</small><strong>${escapeHtml(other?.label || other?.id || 'Unknown')}</strong></span><span class="relation-arrow">↗</span></button><div class="relation-proof">${other?.description ? `<p class="neighbor-description">${escapeHtml(other.description)}</p>` : ''}<span>Recorded in ${escapeHtml(sourceTitle(edge.document))}</span>${edge.semantic ? `<p>${escapeHtml(relation)}</p>` : ''}${renderFields(edge.fields || [])}${edge.evidence.length ? `<div class="claim-list"><strong>Supporting claims · ${edge.evidence.length}</strong>${edge.evidence.map(renderClaim).join('')}</div>` : '<p>No claim-level citation supplied for this relationship.</p>'}</div></article>`;
  }).join('');
  host.innerHTML = `<div class="inspector-content"><div class="inspector-heading"><span class="label-chip ${category(node)}">${escapeHtml(humanize(node.type))}</span><span class="record-number">${connections.length} LINKS · ${node.variants.length} SOURCES</span></div><h3>${escapeHtml(node.label)}</h3><p class="inspector-id">${escapeHtml(node.id)}</p><button type="button" id="clear-focus" class="clear-focus">Clear selection <kbd>Esc</kbd></button>${node.note?.intuition ? `<div class="insight"><span class="insight-icon">✧</span><div><strong>IN PLAIN LANGUAGE · CURATED NOTE</strong><p>${escapeHtml(node.note.intuition)}</p></div></div>` : ''}<div class="inspector-section"><h4>Concept overview</h4><p>${escapeHtml(explanation)}</p>${node.note?.example ? `<p class="example"><b>For example</b> · ${escapeHtml(node.note.example)}</p>` : ''}${node.addedByCurriculum ? '<p class="provenance-warning">Teaching note added to resolve a source reference; not an original graph node.</p>' : ''}</div>${guide}<div class="inspector-section"><h4>Original source records <span>${node.variants.length}</span></h4><div class="source-record-grid">${sourceRecords || '<p>Curriculum-only concept; no original source record.</p>'}</div></div><div class="inspector-section"><h4>All connections <span>${connections.length}</span></h4><p class="connection-note">Direction, meaning and source evidence are shown for each recorded link. A link without a cited claim has no claim-level citation in the source data.</p><div class="relation-list">${relations || '<p>No relationships are recorded for this concept yet.</p>'}</div></div><div class="inspector-section"><details class="raw-record"><summary>Inspect complete JSON records <span>↗</span></summary><pre></pre></details></div></div>`;
  host.querySelectorAll('[data-concept]').forEach(button => button.addEventListener('click', () => selectConcept(button.dataset.concept)));
  $('#clear-focus').addEventListener('click', () => clearSelection());
  host.querySelectorAll('.document-context').forEach(details => details.addEventListener('toggle', () => {
    if (!details.open) return;
    const document = state.atlas.documents.find(item => item.file === details.dataset.file);
    details.querySelector('.document-fields').innerHTML = renderFields(document.fields);
    details.querySelector('pre').textContent = JSON.stringify(document.metadata, null, 2);
  }));
  const details = host.querySelector('.raw-record');
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
  $('#details-jump').addEventListener('click', () => $('#inspector').scrollIntoView({ behavior: 'smooth', block: 'start' }));
  $('#zoom-in').addEventListener('click', () => network.zoom(1.3));
  $('#zoom-out').addEventListener('click', () => network.zoom(1 / 1.3));
  $('#reset-map').addEventListener('click', () => clearSelection({ fit: true }));
}

async function init() {
  try {
    const response = await fetch('./data/atlas.json');
    if (!response.ok) throw new Error(`Could not load atlas (HTTP ${response.status})`);
    state.atlas = await response.json();
    connectIndexes(state.atlas);
    $('#metric-concepts').textContent = state.atlas.summary.concepts.toLocaleString();
    $('#search').placeholder = `Search ${state.atlas.summary.concepts.toLocaleString()} concepts, definitions or claims…`;
    $('#metric-relations').textContent = state.atlas.summary.relationships.toLocaleString();
    $('#metric-overlap').textContent = state.atlas.summary.overlaps;
    $('#source-links').innerHTML = state.atlas.documents.map((doc, index) => `<a href="./data/${doc.file.split('/').map(encodeURIComponent).join('/')}" download><span>${String(index + 1).padStart(2, '0')} / ${escapeHtml(doc.title)}</span><span>↓</span></a>`).join('') + `<a href="./data/atlas.json" download><span>${String(state.atlas.documents.length + 1).padStart(2, '0')} / Unified atlas JSON</span><span>↓</span></a>`;
    setupMapGestures(); renderMapKey(); renderFilters(); renderMap(); renderPreview(); renderInspector(); renderRoutes(); renderCatalog();
    $('#demo-force').addEventListener('click', () => selectConcept('net_force'));
    $('#search').addEventListener('input', event => { state.query = event.target.value; renderSearch(); });
    $('#catalog-search').addEventListener('input', event => { state.catalogQuery = event.target.value; state.catalogLimit = 36; renderCatalog(); });
    $('#catalog-more').addEventListener('click', () => { state.catalogLimit += 36; renderCatalog(); });
    document.addEventListener('keydown', event => {
      if (event.key === '/' && !['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) {
        event.preventDefault(); $('#search').focus(); $('#explorer').scrollIntoView({ behavior: 'smooth' });
      }
      if (event.key === 'Escape') {
        state.query = '';
        $('#search').value = '';
        renderSearch();
        if (state.selected) { event.preventDefault(); clearSelection(); }
      }
    });
    const initial = new URL(location.href).searchParams.get('concept');
    if (initial && state.byId.has(initial)) selectConcept(initial);
  } catch (error) {
    $('#inspector').innerHTML = `<div class="inspector-empty"><h3>Atlas unavailable</h3><p>${escapeHtml(error.message)}. Serve this folder over HTTP so the JSON can load.</p></div>`;
    $('#map-mode').textContent = 'ATLAS UNAVAILABLE';
  }
}

init();
