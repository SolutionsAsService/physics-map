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
  root.PhysicsGraphView = { connectedCore };
})(globalThis);
