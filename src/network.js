(function () {
  const mapKey = window.PhysicsMapKey;
  // Reuse the atlas's deterministic d3-force layout. A focus changes emphasis and
  // camera only: all canonical nodes, directed claims and positions stay intact.
  function mount(canvas, tooltip, atlas, onSelect, onEdge = () => {}) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw Error('Canvas unavailable');
    const nodes = atlas.nodes, edges = atlas.edges;
    const byId = new Map(nodes.map(n => [n.id, n]));
    const ranked = [...nodes].sort((a, b) => b.degree - a.degree || a.id.localeCompare(b.id));
    const neighbors = new Map(nodes.map(n => [n.id, new Set()]));
    for (const e of edges) { neighbors.get(e.source).add(e.target); neighbors.get(e.target).add(e.source); }
    const bounds = list => list.reduce((b, n) => ({minX: Math.min(b.minX, n.layout.x), maxX: Math.max(b.maxX, n.layout.x), minY: Math.min(b.minY, n.layout.y), maxY: Math.max(b.maxY, n.layout.y)}), {minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity});
    const whole = bounds(nodes);
    let width = 960, height = 620, scale = 1, centerX = 0, centerY = 0;
    let selected = null, topic = 'all', featured = null, labels = [], nodeLabels = [], frame = null, destroyed = false;
    let drag = null, pointers = new Map(), pinch = null;
    const listeners = [];
    function listen(target, event, fn, options) { target.addEventListener(event, fn, options); listeners.push(() => target.removeEventListener(event, fn, options)); }
    const human = s => s.replaceAll('_', ' ');
    const screen = n => ({x: width / 2 + (n.layout.x - centerX) * scale, y: height / 2 + (n.layout.y - centerY) * scale});
    const radius = n => n.id === selected ? 9 : Math.min(7, 2.4 + Math.sqrt(n.degree) * .45);
    function camera(b) {
      centerX = (b.minX + b.maxX) / 2; centerY = (b.minY + b.maxY) / 2;
      scale = Math.min((width - 100) / Math.max(180, b.maxX - b.minX), (height - 100) / Math.max(180, b.maxY - b.minY));
    }
    function fit() { if(destroyed)return;camera(whole); draw(); }
    function focusCamera(id) {
      const ids = new Set([id, ...neighbors.get(id)]);
      camera(bounds(nodes.filter(n => ids.has(n.id))));
    }
    function focusedEdges() { return selected ? edges.filter(e => e.source === selected || e.target === selected) : []; }
    function draw() {
      frame = null;
      if (destroyed || document.hidden) return;
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0); ctx.clearRect(0, 0, width, height);
      labels = []; nodeLabels = [];
      const peers = neighbors.get(selected);
      const focused = focusedEdges(), focusSet = new Set(focused);
      const occupied = [];
      function caption(text, x, y, color, priority = false, edge = null) {
        const w = text.length * 6.5 + 12, h = 19;
        const box = {x: x - w / 2, y: y - 13, w, h};
        if (box.x < 3 || box.y < 3 || box.x + w > width - 3 || box.y + h > height - 3) return;
        if (!priority && occupied.some(b => box.x < b.x+b.w+5 && box.x+w+5 > b.x && box.y < b.y+b.h+3 && box.y+h+3 > b.y)) return;
        occupied.push(box); ctx.globalAlpha = 1; ctx.font = '600 11px system-ui'; ctx.textAlign = 'center';
        ctx.fillStyle = '#10252def'; ctx.fillRect(box.x, box.y, w, h); ctx.fillStyle = color; ctx.fillText(text, x, y);
        if (edge) labels.push({x, y: y-4, w, h, edge}); else nodeLabels.push({text, x, y});
      }
      function drawEdge(e) {
        const a = byId.get(e.source), b = byId.get(e.target), start = screen(a), end = screen(b);
        const style = mapKey.classify(e), active = focusSet.has(e) || featured === e.id;
        const inTopic = topic === 'all' || a.topics.includes(topic) || b.topics.includes(topic);
        ctx.globalAlpha = active ? .95 : selected ? .075 : inTopic ? .24 : .055;
        ctx.strokeStyle = style.color; ctx.fillStyle = style.color; ctx.lineWidth = active ? 2 : .65; ctx.setLineDash(style.dash);
        const dx = end.x-start.x, dy = end.y-start.y, distance = Math.hypot(dx, dy);
        if (!distance) return;
        const trim = Math.min(radius(b)+2, distance*.3), fromTrim = Math.min(radius(a)+2, distance*.3);
        const from = {x:start.x+dx/distance*fromTrim,y:start.y+dy/distance*fromTrim};
        const to = {x:end.x-dx/distance*trim,y:end.y-dy/distance*trim};
        ctx.beginPath(); ctx.moveTo(from.x, from.y); ctx.lineTo(to.x, to.y); ctx.stroke(); ctx.setLineDash([]);
        const angle = Math.atan2(dy,dx), head = active ? 8 : 3;
        ctx.beginPath(); ctx.moveTo(to.x,to.y); ctx.lineTo(to.x-head*Math.cos(angle-.45),to.y-head*Math.sin(angle-.45)); ctx.lineTo(to.x-head*Math.cos(angle+.45),to.y-head*Math.sin(angle+.45));
        if (style.arrow === 'filled') ctx.fill(); else ctx.stroke();
      }
      // Background first; every edge is drawn once, including parallel predicates.
      for (const e of edges) if (!focusSet.has(e) && featured !== e.id) drawEdge(e);
      for (const e of edges) if (focusSet.has(e) || featured === e.id) drawEdge(e);
      for (const n of nodes) {
        const p = screen(n), active = n.id === selected || peers?.has(n.id);
        ctx.globalAlpha = selected ? active ? 1 : .3 : topic === 'all' || n.topics.includes(topic) ? .9 : .25;
        ctx.fillStyle = mapKey.domainById.get(mapKey.groupOf(n)).color;
        ctx.beginPath(); ctx.arc(p.x,p.y,radius(n),0,Math.PI*2); ctx.fill();
        if (n.id === selected) { ctx.strokeStyle='#ffffff'; ctx.lineWidth=2; ctx.stroke(); }
      }
      // Broad hubs at overview; progressively more labels as space opens up.
      const domainHubs = [...new Map([...ranked].reverse().map(n => [mapKey.groupOf(n), n])).values()];
      const broadIds = ['physics','force','energy','thermodynamics','quantum_mechanics','special_relativity','matter','ion','astrophysics'];
      const overview = [...new Set([...broadIds.map(id => byId.get(id)).filter(Boolean), ...domainHubs, ...ranked])];
      const candidates = selected ? [byId.get(selected), ...ranked.filter(n => peers.has(n.id))] : overview;
      const maxLabels = selected ? candidates.length : Math.min(nodes.length, Math.round(24 + scale * 18));
      for (const n of candidates.slice(0,maxLabels)) {
        if (!selected && topic !== 'all' && !n.topics.includes(topic)) continue;
        const p=screen(n); caption(n.label,p.x,p.y-radius(n)-7,'#eef9fa',n.id===selected);
      }
      // Exact predicates remain in the accessible evidence list even when a
      // crowded caption is suppressed. Prioritize scientific teaching bridges.
      const claims = [...focused].sort((a,b) => Number(b.id===featured)-Number(a.id===featured) || Number(!!b.record?.teaching_addition)-Number(!!a.record?.teaching_addition) || a.id.localeCompare(b.id));
      for (const e of claims) {
        const a=screen(byId.get(e.source)),b=screen(byId.get(e.target));
        caption(human(e.relation),(a.x+b.x)/2,(a.y+b.y)/2,mapKey.classify(e).color,false,e);
      }
      ctx.globalAlpha=1;ctx.textAlign='start';
    }
    function requestDraw() { if (frame === null && !destroyed && !document.hidden) frame=window.requestAnimationFrame(draw); }
    function resize() {
      if (destroyed) return;
      const oldWidth=width,oldHeight=height,rect=canvas.getBoundingClientRect();
      width=Math.max(320,rect.width||960);height=Math.max(340,rect.height||620);
      const ratio=Math.min(window.devicePixelRatio||1,2);canvas.width=Math.round(width*ratio);canvas.height=Math.round(height*ratio);
      if (!selected) camera(whole); else scale*=Math.min(width/oldWidth,height/oldHeight);
      draw();
    }
    const point=e=>{const r=canvas.getBoundingClientRect();return {x:e.clientX-r.left,y:e.clientY-r.top};};
    function hit(p) { let best=null,d=13;for(const n of nodes){const s=screen(n),distance=Math.hypot(p.x-s.x,p.y-s.y);if(distance<d){best=n;d=distance;}}return best; }
    function edgeAt(p) {
      const label=labels.find(l=>Math.abs(p.x-l.x)<l.w/2&&Math.abs(p.y-l.y)<l.h/2);if(label)return label.edge;
      let best=null,d=6;
      for(const e of focusedEdges()){const a=screen(byId.get(e.source)),b=screen(byId.get(e.target)),dx=b.x-a.x,dy=b.y-a.y,length=dx*dx+dy*dy;if(!length)continue;const t=Math.max(.08,Math.min(.92,((p.x-a.x)*dx+(p.y-a.y)*dy)/length)),dist=Math.hypot(p.x-a.x-dx*t,p.y-a.y-dy*t);if(dist<d){best=e;d=dist;}}return best;
    }
    function zoom(factor,p={x:width/2,y:height/2}) {
      if(destroyed)return;const next=Math.max(.08,Math.min(20,scale*factor)),wx=centerX+(p.x-width/2)/scale,wy=centerY+(p.y-height/2)/scale;
      centerX=wx-(p.x-width/2)/next;centerY=wy-(p.y-height/2)/next;scale=next;draw();
    }
    listen(canvas,'pointerdown',e=>{
      const p=point(e);pointers.set(e.pointerId,p);canvas.setPointerCapture?.(e.pointerId);
      if(pointers.size===2){const [a,b]=[...pointers.values()];pinch={distance:Math.hypot(a.x-b.x,a.y-b.y)};drag=null;}
      else drag={...p,centerX,centerY,moved:false};
    });
    listen(canvas,'pointermove',e=>{
      const p=point(e);if(pointers.has(e.pointerId))pointers.set(e.pointerId,p);
      if(pinch&&pointers.size===2){const [a,b]=[...pointers.values()],distance=Math.hypot(a.x-b.x,a.y-b.y);if(pinch.distance>0)zoom(distance/pinch.distance,{x:(a.x+b.x)/2,y:(a.y+b.y)/2});pinch.distance=distance;return;}
      if(drag){const dx=p.x-drag.x,dy=p.y-drag.y;if(Math.hypot(dx,dy)>4)drag.moved=true;if(drag.moved){centerX=drag.centerX-dx/scale;centerY=drag.centerY-dy/scale;tooltip.hidden=true;requestDraw();return;}}
      const node=hit(p),edge=node?null:edgeAt(p);tooltip.hidden=!node&&!edge;
      tooltip.textContent=node?node.label:edge?byId.get(edge.source).label+' → '+human(edge.relation)+' → '+byId.get(edge.target).label+' · '+(edge.scope||'Scope not specified'):'';
      const r=canvas.getBoundingClientRect();tooltip.style.left=Math.max(5,Math.min(width-235,p.x+12))+'px';tooltip.style.top=Math.max(5,p.y+r.top-tooltip.parentElement.getBoundingClientRect().top-40)+'px';canvas.style.cursor=node||edge?'pointer':'grab';
    });
    listen(canvas,'pointerup',e=>{if(drag&&!drag.moved&&!pinch){const p=point(e),node=hit(p),edge=node?null:edgeAt(p);if(node)onSelect(node.id);else if(edge)onEdge(edge);}pointers.delete(e.pointerId);drag=null;pinch=null;});
    listen(canvas,'pointercancel',()=>{drag=null;pinch=null;pointers.clear();});
    listen(canvas,'pointerleave',()=>{tooltip.hidden=true;});
    listen(canvas,'wheel',e=>{e.preventDefault();zoom(e.deltaY<0?1.12:1/1.12,point(e));},{passive:false});
    listen(canvas,'keydown',e=>{if(['+','=','-','ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home'].includes(e.key)){e.preventDefault();if(e.key==='Home')fit();else if(['+','=','-'].includes(e.key))zoom(e.key==='-'?1/1.3:1.3);else{centerX+=({'ArrowLeft':-50,'ArrowRight':50}[e.key]||0)/scale;centerY+=({'ArrowUp':-50,'ArrowDown':50}[e.key]||0)/scale;draw();}}});
    listen(window,'resize',resize);
    listen(document,'visibilitychange',()=>{if(document.hidden&&frame!==null){window.cancelAnimationFrame(frame);frame=null;}else requestDraw();});
    const observer=typeof ResizeObserver!=='undefined'?new ResizeObserver(resize):null;observer?.observe(canvas);resize();
    return {
      select(id) { if(destroyed||selected===id)return;selected=byId.has(id)?id:null;featured=null;tooltip.hidden=true;if(selected)focusCamera(selected);else camera(whole);draw(); },
      topic(id) { if(destroyed)return;topic=id;draw(); },
      focusEdge(id) { if(destroyed)return;featured=id;draw(); },zoom,fit,
      counts() { return {nodes:nodes.length,edges:edges.length,connected:neighbors.get(selected)?.size||0,highlighted:focusedEdges().length}; },
      snapshot() { return {selected,scale,centerX,centerY,topic,nodes:nodes.map(n=>({id:n.id,...screen(n),layout:{...n.layout}})),edges,focusedEdges:focusedEdges(),labels:[...labels],nodeLabels:[...nodeLabels]}; },
      destroy() { destroyed=true;listeners.forEach(fn=>fn());observer?.disconnect();pointers.clear();tooltip.hidden=true;if(frame!==null)window.cancelAnimationFrame(frame);frame=null; }
    };
  }
  window.PhysicsNetwork={mount};
})();
