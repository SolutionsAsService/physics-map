(function () {
  const mapKey = window.PhysicsMapKey;

  function mount(canvas, tooltip, atlas, onSelect) {
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas is unavailable in this browser');
    const nodes = atlas.nodes;
    const edges = atlas.edges;
    const styles = new Map(edges.map(edge => [edge, mapKey.classify(edge)]));
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
    let fitScaleX = 1;
    let fitScaleY = 1;
    let zoom = 1;
    let panX = 0;
    let panY = 0;
    let selected = null;
    let hovered = null;
    let topic = 'all';
    let focusedEdges = [];
    let drag = null;
    let scheduled = false;

    function screen(node) {
      return { x: width / 2 + panX + (node.layout.x - centerX) * fitScaleX * zoom, y: height / 2 + panY + (node.layout.y - centerY) * fitScaleY * zoom };
    }

    function draw() {
      scheduled = false;
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      context.clearRect(0, 0, width, height);
      const active = selected || hovered;
      const related = active ? neighbors.get(active) || new Set() : null;
      function drawEdge(edge, highlighted) {
        const from = byId.get(edge.source), to = byId.get(edge.target);
        if (!from || !to) return;
        const inTopic = topic === 'all' || from.topics.includes(topic) || to.topics.includes(topic);
        const style = styles.get(edge);
        context.globalAlpha = highlighted ? 0.94 : active ? 0.065 : inTopic ? 0.21 : 0.05;
        context.strokeStyle = style.color;
        context.lineWidth = highlighted ? 2.2 : 0.8;
        context.setLineDash(style.dash);
        const start = screen(from), end = screen(to);
        context.beginPath(); context.moveTo(start.x, start.y); context.lineTo(end.x, end.y); context.stroke();
      }
      for (const edge of edges) if (!active || (edge.source !== active && edge.target !== active)) drawEdge(edge, false);
      if (active) for (const edge of edges) if (edge.source === active || edge.target === active) drawEdge(edge, true);
      context.setLineDash([]);
      const labeled = new Set(ranked.slice(0, 32).map(node => node.id));
      if (active) {
        labeled.add(active);
        for (const node of ranked.filter(node => related.has(node.id)).slice(0, 25)) labeled.add(node.id);
      }
      for (const node of nodes) {
        const point = screen(node);
        const relevant = node.id === active || related?.has(node.id);
        const inTopic = topic === 'all' || node.topics.includes(topic);
        const radius = Math.max(1.5, Math.min(8, (3 + Math.sqrt(node.degree || 0) * 0.65) * Math.max(0.58, Math.min(1.6, Math.min(fitScaleX, fitScaleY) * zoom))));
        context.globalAlpha = active ? relevant ? 1 : 0.3 : inTopic ? 0.82 : 0.25;
        context.fillStyle = mapKey.domainById.get(mapKey.groupOf(node)).color;
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
      fitScaleX = (width - 36) / Math.max(1, bounds.maxX - bounds.minX);
      fitScaleY = (height - 36) / Math.max(1, bounds.maxY - bounds.minY);
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

    function edgeAt(clientX, clientY) {
      if (!selected) return null;
      const rect = canvas.getBoundingClientRect();
      const pointX = clientX - rect.left, pointY = clientY - rect.top;
      let closest = null, distance = 7;
      for (const edge of focusedEdges) {
        const start = screen(byId.get(edge.source)), end = screen(byId.get(edge.target));
        const horizontal = end.x - start.x, vertical = end.y - start.y;
        const lengthSquared = horizontal * horizontal + vertical * vertical;
        if (!lengthSquared) continue;
        const fraction = Math.max(0, Math.min(1, ((pointX - start.x) * horizontal + (pointY - start.y) * vertical) / lengthSquared));
        const separation = Math.hypot(pointX - start.x - fraction * horizontal, pointY - start.y - fraction * vertical);
        if (separation < distance) { distance = separation; closest = edge; }
      }
      return closest;
    }

    function moveTooltip(event, node, edge) {
      tooltip.hidden = !node && !edge;
      if (!node && !edge) return;
      tooltip.textContent = node ? `${node.label} · ${node.degree} links` : `${byId.get(edge.source).label} → ${byId.get(edge.target).label} · ${edge.relation.replaceAll('_', ' ')}${edge.semantic ? ` · ${edge.semantic}` : ''}`;
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
      const edge = node ? null : edgeAt(event.clientX, event.clientY);
      if (hovered !== node?.id) { hovered = node?.id || null; requestDraw(); }
      canvas.style.cursor = node ? 'pointer' : edge ? 'help' : drag ? 'grabbing' : 'grab';
      moveTooltip(event, node, edge);
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
      select(id) { selected = id; focusedEdges = id ? edges.filter(edge => edge.source === id || edge.target === id) : []; hovered = null; tooltip.hidden = true; draw(); },
      topic(id) { topic = id; draw(); },
      zoom(factor) { zoom = Math.max(0.65, Math.min(12, zoom * factor)); draw(); },
      fit() { zoom = 1; panX = 0; panY = 0; selected = null; focusedEdges = []; draw(); },
      counts() { return { nodes: nodes.length, edges: edges.length, connected: selected ? neighbors.get(selected)?.size || 0 : 0 }; }
    };
  }

  window.PhysicsNetwork = { mount };
})();
