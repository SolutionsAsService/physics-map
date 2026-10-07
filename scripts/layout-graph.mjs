import { forceCenter, forceCollide, forceLink, forceManyBody, forceSimulation, forceX, forceY } from 'd3-force';

export function layoutGraph(nodes, edges, documents) {
  const topics = new Map(documents.map((document, index) => {
    const angle = (index / Math.max(1, documents.length)) * Math.PI * 2 - Math.PI / 2;
    return [document.graphId, { x: Math.cos(angle) * 310, y: Math.sin(angle) * 240 }];
  }));
  const degree = new Map();
  for (const edge of edges) {
    degree.set(edge.source, (degree.get(edge.source) || 0) + 1);
    degree.set(edge.target, (degree.get(edge.target) || 0) + 1);
  }
  const byId = new Map();
  const simulationNodes = nodes.map((node, index) => {
    const centers = node.topics.map(topic => topics.get(topic)).filter(Boolean);
    const center = centers.length ? { x: centers.reduce((sum, point) => sum + point.x, 0) / centers.length, y: centers.reduce((sum, point) => sum + point.y, 0) / centers.length } : { x: 0, y: 0 };
    const angle = index * 2.399963229728653;
    const radius = 20 + Math.sqrt(index) * 9;
    const positioned = { id: node.id, x: center.x + Math.cos(angle) * radius, y: center.y + Math.sin(angle) * radius, center, degree: degree.get(node.id) || 0 };
    byId.set(node.id, positioned);
    return positioned;
  });
  const links = edges.map(edge => ({ source: edge.source, target: edge.target }));
  const simulation = forceSimulation(simulationNodes)
    .force('link', forceLink(links).id(node => node.id).distance(42).strength(0.16))
    .force('charge', forceManyBody().strength(node => -15 - Math.min(65, node.degree * 1.4)).distanceMax(450))
    .force('collision', forceCollide(node => 4 + Math.min(7, Math.sqrt(node.degree))).iterations(1))
    .force('x', forceX(node => node.center.x).strength(0.018))
    .force('y', forceY(node => node.center.y).strength(0.018))
    .force('center', forceCenter(0, 0))
    .stop();
  simulation.tick(180);
  for (const node of nodes) {
    const position = byId.get(node.id);
    node.layout = { x: Math.round(position.x * 10) / 10, y: Math.round(position.y * 10) / 10 };
    node.degree = position.degree;
  }
}
