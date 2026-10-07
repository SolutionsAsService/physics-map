(function () {
  const colors = { physics: '#83d8e9', thermo: '#f8b886', chemistry: '#9ceddd', quantum: '#b6b4ff', ion: '#f19db4', bonding: '#d5c18e', claim: '#74929a' };

  function groupOf(node) {
    if (node.claim) return 'claim';
    const topics = node.topics || [];
    if (topics.some(topic => topic.includes('ionic_bonding'))) return 'bonding';
    if (topics.some(topic => topic.startsWith('ion_'))) return 'ion';
    if (topics.some(topic => topic.includes('quantum_mechanics'))) return 'quantum';
    if (topics.some(topic => topic.includes('physical_chemistry'))) return 'chemistry';
    if (topics.some(topic => topic.includes('thermodynamics'))) return 'thermo';
    return 'physics';
  }

  function mount(canvas, tooltip, atlas, onSelect) {
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas is unavailable in this browser');
    const nodes = atlas.nodes;
    const edges = atlas.edges;
    const ranked = [...nodes].sort((left, right) => right.degree - left.degree);
    const byId = new Map(nodes.map(node => [node.id, node]));
    const neighbors = new Map(nodes.map(node => [node.id, new Set()]));
    for (const edge of edges) {
      neighbors.get(edge.source)?.add(edge.target);
      neighbors.get(edge.target)?.add(edge.source);
    }
    const bounds = nodes.reduce((result, node) => ({
      minX: Math.min(result.minX, node.layout.x), maxX: Math.max(result.maxX, node.layout.x),
      minY: Math.min(result.minY, node.layout.y), maxY: Math.max(result.maxY, node.layout.y)
    }), { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity });
    const centerX = (bounds.minX + bounds.maxX) / 2;
    const centerY = (bounds.minY + bounds.maxY) / 2;
    let width = 960;
    let height = 620;
    let fitScale = 1;
    let zoom = 1;
    let panX = 0;
    let panY = 0;
    let selected = null;
    let hovered = null;
    let topic = 'all';
    let drag = null;
    let scheduled = false;

    function screen(node) {
      const scale = fitScale * zoom;
      return { x: width / 2 + panX + (node.layout.x - centerX) * scale, y: height / 2 + panY + (node.layout.y - centerY) * scale };
    }

    function draw() {
      scheduled = false;
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      context.clearRect(0, 0, width, height);
      const active = selected || hovered;
      const related = active ? neighbors.get(active) || new Set() : null;
      for (const edge of edges) {
        const from = byId.get(edge.source), to = byId.get(edge.target);
        if (!from || !to) continue;
        const highlighted = active && (edge.source === active || edge.target === active);
        const inTopic = topic === 'all' || from.topics.includes(topic) || to.topics.includes(topic);
        context.globalAlpha = highlighted ? 0.92 : active ? 0.075 : inTopic ? 0.17 : 0.045;
        context.strokeStyle = highlighted ? '#b6eee1' : '#5c8790';
        context.lineWidth = highlighted ? 1.4 : 0.65;
        const start = screen(from), end = screen(to);
        context.beginPath(); context.moveTo(start.x, start.y); context.lineTo(end.x, end.y); context.stroke();
      }
      const labeled = new Set(ranked.slice(0, 32).map(node => node.id));
      if (active) {
        labeled.add(active);
        for (const node of ranked.filter(node => related.has(node.id)).slice(0, 25)) labeled.add(node.id);
      }
      for (const node of nodes) {
        const point = screen(node);
        const relevant = node.id === active || related?.has(node.id);
        const inTopic = topic === 'all' || node.topics.includes(topic);
        const radius = Math.max(1.5, Math.min(8, (3 + Math.sqrt(node.degree || 0) * 0.65) * Math.max(0.58, Math.min(1.6, fitScale * zoom))));
        context.globalAlpha = active ? relevant ? 1 : 0.3 : inTopic ? 0.82 : 0.25;
        context.fillStyle = colors[groupOf(node)];
        context.beginPath(); context.arc(point.x, point.y, node.id === active ? radius + 3 : radius, 0, Math.PI * 2); context.fill();
        if (node.id === active) {
          context.strokeStyle = '#f5fff9'; context.lineWidth = 2; context.stroke();
        }
      }
      for (const node of nodes) {
        if (!labeled.has(node.id) || (topic !== 'all' && !node.topics.includes(topic) && node.id !== active)) continue;
        if (active && node.id !== active && !related.has(node.id)) continue;
        const point = screen(node);
        context.globalAlpha = node.id === active ? 1 : 0.9;
        context.fillStyle = node.id === active ? '#ffffff' : '#c8dadd';
        context.font = `${node.id === active ? 13 : 10}px system-ui, sans-serif`;
        context.fillText(node.label.slice(0, 27), point.x + 7, point.y - 7);
      }
      context.globalAlpha = 1;
    }

    function requestDraw() {
      if (scheduled) return;
      scheduled = true;
      (window.requestAnimationFrame || (callback => setTimeout(callback, 16)))(draw);
    }

    function resize() {
      const rect = canvas.getBoundingClientRect();
      width = Math.max(320, Math.round(rect.width || 960));
      height = Math.max(340, Math.round(rect.height || 620));
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * pixelRatio);
      canvas.height = Math.round(height * pixelRatio);
      fitScale = Math.min((width - 80) / Math.max(1, bounds.maxX - bounds.minX), (height - 80) / Math.max(1, bounds.maxY - bounds.minY));
      draw();
    }

    function hitTest(clientX, clientY) {
      const rect = canvas.getBoundingClientRect();
      const x = clientX - rect.left, y = clientY - rect.top;
      let closest = null, distance = 12;
      for (const node of nodes) {
        const point = screen(node);
        const candidate = Math.hypot(point.x - x, point.y - y);
        if (candidate < distance) { distance = candidate; closest = node; }
      }
      return closest;
    }

    function moveTooltip(event, node) {
      tooltip.hidden = !node;
      if (!node) return;
      tooltip.textContent = `${node.label} · ${node.degree} links`;
      const bounds = canvas.getBoundingClientRect();
      tooltip.style.left = `${Math.min(bounds.width - 190, Math.max(10, event.clientX - bounds.left + 12))}px`;
      tooltip.style.top = `${Math.max(10, event.clientY - bounds.top - 32)}px`;
    }

    canvas.addEventListener('pointerdown', event => {
      drag = { x: event.clientX, y: event.clientY, panX, panY, moved: false };
      canvas.setPointerCapture?.(event.pointerId);
    });
    canvas.addEventListener('pointermove', event => {
      if (drag) {
        const dx = event.clientX - drag.x, dy = event.clientY - drag.y;
        if (Math.hypot(dx, dy) > 4) drag.moved = true;
        if (drag.moved) { panX = drag.panX + dx; panY = drag.panY + dy; tooltip.hidden = true; requestDraw(); return; }
      }
      const node = hitTest(event.clientX, event.clientY);
      if (hovered !== node?.id) { hovered = node?.id || null; requestDraw(); }
      canvas.style.cursor = node ? 'pointer' : drag ? 'grabbing' : 'grab';
      moveTooltip(event, node);
    });
    canvas.addEventListener('pointerup', event => {
      if (drag && !drag.moved) {
        const node = hitTest(event.clientX, event.clientY);
        if (node) onSelect(node.id);
      }
      drag = null;
    });
    canvas.addEventListener('pointercancel', () => { drag = null; });
    canvas.addEventListener('pointerleave', () => { hovered = null; tooltip.hidden = true; requestDraw(); });
    canvas.addEventListener('wheel', event => {
      event.preventDefault();
      const factor = event.deltaY < 0 ? 1.12 : 1 / 1.12;
      const next = Math.max(0.65, Math.min(12, zoom * factor));
      const rect = canvas.getBoundingClientRect();
      const x = event.clientX - rect.left - width / 2, y = event.clientY - rect.top - height / 2;
      panX = x - (x - panX) * (next / zoom);
      panY = y - (y - panY) * (next / zoom);
      zoom = next;
      requestDraw();
    }, { passive: false });
    window.addEventListener('resize', resize);
    resize();

    return {
      select(id) { selected = id; hovered = null; tooltip.hidden = true; draw(); },
      topic(id) { topic = id; draw(); },
      zoom(factor) { zoom = Math.max(0.65, Math.min(12, zoom * factor)); draw(); },
      fit() { zoom = 1; panX = 0; panY = 0; selected = null; draw(); },
      counts() { return { nodes: nodes.length, edges: edges.length, connected: selected ? neighbors.get(selected)?.size || 0 : 0 }; }
    };
  }

  window.PhysicsNetwork = { mount };
})();
