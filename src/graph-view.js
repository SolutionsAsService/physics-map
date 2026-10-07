(function (root) {
  // The display graph is a projection; source records are never removed or mutated.
  function connectedCore(atlas) {
    const neighbors = new Map(atlas.nodes.map(node => [node.id, new Set()]));
    for (const edge of atlas.edges) {
      if (edge.source === edge.target || !neighbors.has(edge.source) || !neighbors.has(edge.target)) continue;
      neighbors.get(edge.source).add(edge.target);
      neighbors.get(edge.target).add(edge.source);
    }
    const removed = new Set();
    const queue = [...neighbors].filter(([, peers]) => peers.size < 2).map(([id]) => id);
    for (let index = 0; index < queue.length; index++) {
      const id = queue[index];
      if (removed.has(id)) continue;
      removed.add(id);
      for (const peer of neighbors.get(id)) {
        neighbors.get(peer).delete(id);
        if (neighbors.get(peer).size < 2 && !removed.has(peer)) queue.push(peer);
      }
    }
    const nodes = atlas.nodes.filter(node => !removed.has(node.id)).map(node => ({ ...node, degree: neighbors.get(node.id).size }));
    const ids = new Set(nodes.map(node => node.id));
    const edges = atlas.edges.filter(edge => edge.source !== edge.target && ids.has(edge.source) && ids.has(edge.target));
    // Edge-only teaching sources still participate in source filtering.
    const graphByFile = new Map(atlas.documents?.map(document => [document.file, document.graphId]) || []);
    const byId = new Map(nodes.map(node => [node.id, node]));
    for (const edge of edges) {
      const topic = graphByFile.get(edge.document);
      if (!topic) continue;
      for (const id of [edge.source, edge.target]) byId.get(id).topics = [...new Set([...(byId.get(id).topics || []), topic])];
    }
    return {
      ...atlas, nodes, edges,
      paths: atlas.paths.map(route => ({ ...route, steps: route.steps.filter(id => ids.has(id)) })).filter(route => route.steps.length > 1),
      summary: { ...atlas.summary, concepts: nodes.length, relationships: edges.length,
        overlaps: nodes.filter(node => new Set(node.variants.map(variant => variant.document)).size > 1).length,
        unresolved: nodes.filter(node => node.unresolved).length,
        hiddenConcepts: atlas.nodes.length - nodes.length, archivedRelationships: atlas.edges.length - edges.length }
    };
  }
  // A bounded lens into the genuine two-neighbor core. No synthetic edges.
  function neighborhood(atlas, focus, offset = -1, limit = 5) {
    const byId = new Map(atlas.nodes.map(n => [n.id,n]));
    const rank = e => e.record?.teaching_addition ? 0 : e.kind === 'causation' ? 1 : e.kind === 'definition' ? 2 : 3;
    const incident = atlas.edges.filter(e => e.source === focus || e.target === focus).sort((a,b)=>rank(a)-rank(b)||a.id.localeCompare(b.id));
    const peers = [...new Set(incident.map(e=>e.source===focus?e.target:e.source))];
    const chosen = ['force','net_force','acceleration'].includes(focus)&&offset<0 ? ['force','net_force','acceleration','mass'].filter(id=>id!==focus&&byId.has(id)) : peers.slice(Math.max(0,offset),Math.max(0,offset)+limit);
    const ids = new Set([focus,...chosen]);
    if(['force','net_force','acceleration'].includes(focus)&&offset<0)for(const id of ['force','net_force','acceleration','mass'])if(byId.has(id))ids.add(id);
    // One most explanatory directed predicate per endpoint pair; other claims remain inspectable.
    const pairs = new Set();const edges = atlas.edges.filter(e=>ids.has(e.source)&&ids.has(e.target)&&!(offset<0&&['force','net_force','acceleration'].includes(focus)&&e.source==='force'&&e.target==='acceleration')).sort((a,b)=>rank(a)-rank(b)||a.id.localeCompare(b.id)).filter(e=>{const k=[e.source,e.target].sort().join('|');if(pairs.has(k))return false;pairs.add(k);return true;});
    return {nodes:[...ids].map(id=>byId.get(id)).filter(Boolean),edges,totalNeighbors:peers.length,offset,limit};
  }
  root.PhysicsGraphView = { connectedCore, neighborhood };
})(globalThis);
