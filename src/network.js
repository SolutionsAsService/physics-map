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
    if (!nodes.length) Object.assign(bounds, { minX: 0, maxX: 1, minY: 0, maxY: 1 });
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
    let featuredEdge = null;
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
      const activeEdges = active ? edges.filter(edge => edge.source === active || edge.target === active) : [];
      function drawEdge(edge, highlighted) {
        const from = byId.get(edge.source), to = byId.get(edge.target);
        if (!from || !to) return;
        const inTopic = topic === 'all' || from.topics.includes(topic) || to.topics.includes(topic);
        const style = styles.get(edge);
        context.globalAlpha = edge === featuredEdge ? 1 : highlighted ? 0.94 : active ? 0.065 : inTopic ? 0.21 : 0.05;
        context.strokeStyle = style.color;
        context.lineWidth = edge === featuredEdge ? 4 : highlighted ? 2.2 : 0.8;
        context.setLineDash(style.dash);
        const sourcePoint = screen(from), targetPoint = screen(to);
        const distance = Math.hypot(targetPoint.x - sourcePoint.x, targetPoint.y - sourcePoint.y);
        const alongX = distance ? (targetPoint.x - sourcePoint.x) / distance : 0;
        const alongY = distance ? (targetPoint.y - sourcePoint.y) / distance : 0;
        const featured = edge === featuredEdge && distance > 32;
        const start = featured ? { x: sourcePoint.x + alongX * 12, y: sourcePoint.y + alongY * 12 } : sourcePoint;
        const end = featured ? { x: targetPoint.x - alongX * 14, y: targetPoint.y - alongY * 14 } : targetPoint;
        context.beginPath(); context.moveTo(start.x, start.y); context.lineTo(end.x, end.y); context.stroke();
        // All predicates get an arrow; small quiet heads avoid an overview thicket.
        if (style.arrow) {
          if (distance > 2) {
            const inset = featured ? 0 : Math.min(distance * 0.2, highlighted ? 9 : 5);
            const tipX = end.x - alongX * inset, tipY = end.y - alongY * inset;
            const size = Math.min(distance * 0.3, featured ? 11 : highlighted ? 7 : 3);
            const baseX = tipX - alongX * size, baseY = tipY - alongY * size;
            const halfWidth = size * 0.55;
            context.setLineDash([]);
            context.beginPath();
            if (style.arrow === 'filled') {
              context.moveTo(tipX, tipY);
              context.lineTo(baseX - alongY * halfWidth, baseY + alongX * halfWidth);
              context.lineTo(baseX + alongY * halfWidth, baseY - alongX * halfWidth);
              context.fillStyle = style.color;
              context.fill();
            } else {
              context.moveTo(baseX - alongY * halfWidth, baseY + alongX * halfWidth);
              context.lineTo(tipX, tipY);
              context.lineTo(baseX + alongY * halfWidth, baseY - alongX * halfWidth);
              context.setLineDash([]);
              context.stroke();
            }
          }
        }
      }
      for (const edge of edges) if (!active || (edge.source !== active && edge.target !== active)) drawEdge(edge, false);
      if (active) for (const edge of activeEdges) if (edge !== featuredEdge) drawEdge(edge, true);
      if (featuredEdge) drawEdge(featuredEdge, true);
      context.setLineDash([]);
      const labeled = new Set(ranked.slice(0, 32).map(node => node.id));
      if (active) {
        labeled.add(active);
        for (const node of ranked.filter(node => related.has(node.id)).slice(0, 25)) labeled.add(node.id);
      }
      if (featuredEdge) { labeled.add(featuredEdge.source); labeled.add(featuredEdge.target); }
      for (const node of nodes) {
        const point = screen(node);
        const relevant = node.id === active || related?.has(node.id);
        const inTopic = topic === 'all' || node.topics.includes(topic);
        const radius = Math.max(1.5, Math.min(8, (3 + Math.sqrt(node.degree || 0) * 0.65) * Math.max(0.58, Math.min(1.6, Math.min(fitScaleX, fitScaleY) * zoom))));
        const featured = featuredEdge && (featuredEdge.source === node.id || featuredEdge.target === node.id);
        context.globalAlpha = active ? relevant ? 1 : 0.3 : inTopic ? 0.82 : 0.25;
        context.fillStyle = mapKey.domainById.get(mapKey.groupOf(node)).color;
        context.beginPath(); context.arc(point.x, point.y, featured || node.id === active ? radius + 3 : radius, 0, Math.PI * 2); context.fill();
        if (node.id === active || featured) {
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
      if (featuredEdge) {
        const from = screen(byId.get(featuredEdge.source)), to = screen(byId.get(featuredEdge.target));
        const dx = to.x - from.x, dy = to.y - from.y;
        const distance = Math.max(1, Math.hypot(dx, dy));
        const style = styles.get(featuredEdge);
        const relation = featuredEdge.relation.replaceAll('_', ' ').toUpperCase();
        const formula = featuredEdge.record?.mathematical_form;
        const caption = formula ? `${relation} · ${formula}` : relation;
        context.font = '600 12px system-ui, sans-serif';
        const textWidth = Math.min(width - 20, Math.ceil((context.measureText?.(caption).width || caption.length * 7) + 20));
        const labelX = Math.max(10, Math.min(width - textWidth - 10, (from.x + to.x) / 2 - textWidth / 2 - dy / distance * 24));
        const labelY = Math.max(22, Math.min(height - 12, (from.y + to.y) / 2 + dx / distance * 24));
        context.globalAlpha = 1;
        context.fillStyle = '#10252d';
        context.fillRect(labelX, labelY - 18, textWidth, 25);
        context.fillStyle = style.color;
        context.fillText(caption, labelX + 9, labelY);
      }
      context.globalAlpha = 1;
    }

    function requestDraw() {
      if (scheduled) return;
      scheduled = true;
      (window.requestAnimationFrame || (callback => setTimeout(callback, 16)))(draw);
    }

    function frameFeaturedEdge() {
      if (!featuredEdge) return;
      const from = byId.get(featuredEdge.source), to = byId.get(featuredEdge.target);
      const distance = Math.hypot((to.layout.x - from.layout.x) * fitScaleX, (to.layout.y - from.layout.y) * fitScaleY);
      zoom = Math.max(1.8, Math.min(8, (width < 600 ? 95 : 160) / Math.max(1, distance)));
      const midpointX = (from.layout.x + to.layout.x) / 2 - centerX;
      const midpointY = (from.layout.y + to.layout.y) / 2 - centerY;
      panX = (width < 760 ? width * 0.5 : width * 0.39) - width / 2 - midpointX * fitScaleX * zoom;
      panY = (width < 760 ? height * 0.28 : height * 0.52) - height / 2 - midpointY * fitScaleY * zoom;
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
      frameFeaturedEdge();
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
      tooltip.textContent = node ? `${node.label} · ${node.degree} distinct neighbors` : `${byId.get(edge.source).label} → ${byId.get(edge.target).label} · ${edge.relation.replaceAll('_', ' ')}${edge.semantic ? ` · ${edge.semantic}` : ''}${edge.record?.mathematical_form ? ` · ${edge.record.mathematical_form}` : ''}${edge.record?.conditions ? ` · When: ${Array.isArray(edge.record.conditions) ? edge.record.conditions.join('; ') : edge.record.conditions}` : ''}`;
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
      if (edge && featuredEdge !== edge) { featuredEdge = edge; requestDraw(); }
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
      select(id) { if (selected !== id) featuredEdge = null; selected = id; focusedEdges = id ? edges.filter(edge => edge.source === id || edge.target === id) : []; hovered = null; tooltip.hidden = true; draw(); },
      focusEdge(edge) { if (featuredEdge === edge) return; featuredEdge = edge; frameFeaturedEdge(); draw(); },
      topic(id) { topic = id; draw(); },
      zoom(factor) { zoom = Math.max(0.65, Math.min(12, zoom * factor)); draw(); },
      fit() { zoom = 1; panX = 0; panY = 0; selected = null; featuredEdge = null; focusedEdges = []; draw(); },
      counts() { return { nodes: nodes.length, edges: edges.length, connected: selected ? neighbors.get(selected)?.size || 0 : 0 }; }
    };
  }

  window.PhysicsNetwork = { mount };
})();
