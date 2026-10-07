import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDirectory = path.join(root, 'data');

export async function buildAtlas() {
  const files = (await readdir(dataDirectory)).filter(file => file.endsWith('.json') && file !== 'atlas.json' && file !== 'atlas-curriculum.json').sort();
  const documents = await Promise.all(files.map(async file => ({ file, data: JSON.parse(await readFile(path.join(dataDirectory, file), 'utf8')) })));
  const curriculum = JSON.parse(await readFile(path.join(dataDirectory, 'atlas-curriculum.json'), 'utf8'));
  const nodes = new Map();
  const edges = [];

  for (const { file, data } of documents) {
    for (const original of data.nodes) {
      if (!original.id || typeof original.id !== 'string') throw new Error(`Missing node ID in ${file}`);
      const current = nodes.get(original.id) || { id: original.id, label: original.label || original.id, type: original.type || 'concept', description: '', topics: [], variants: [] };
      current.topics.push(data.graph_id);
      current.variants.push({ document: file, record: original });
      const explanation = original.definition || original.description || '';
      if (explanation.length > current.description.length) current.description = explanation;
      if (current.label === current.id && original.label) current.label = original.label;
      nodes.set(original.id, current);
    }
    for (const claim of data.claims || []) {
      const existing = nodes.get(claim.id);
      if (existing) throw new Error(`Claim ID collides with concept: ${claim.id}`);
      nodes.set(claim.id, { id: claim.id, label: claim.statement.slice(0, 76), type: 'source claim', description: claim.statement, topics: [data.graph_id], variants: [{ document: file, record: claim }], claim: true });
    }
    data.edges.forEach((original, index) => {
      if (!original.source || !original.target) throw new Error(`Incomplete edge ${index} in ${file}`);
      edges.push({ id: `${data.graph_id}:${index}`, source: original.source, target: original.target, relation: original.relationship || original.relation || 'related to', semantic: original.semantic || '', document: file, record: original });
    });
  }

  for (const [id, note] of Object.entries(curriculum.notes)) {
    const current = nodes.get(id) || { id, label: id.replaceAll('_', ' '), type: 'curated concept', description: '', topics: [], variants: [], addedByCurriculum: true };
    current.note = note;
    nodes.set(id, current);
  }
  for (const edge of edges) {
    for (const id of [edge.source, edge.target]) {
      if (!nodes.has(id)) nodes.set(id, { id, label: id.replaceAll('_', ' '), type: 'unresolved reference', description: '', topics: [], variants: [], unresolved: true });
    }
  }
  for (const learningPath of curriculum.paths) {
    for (const id of learningPath.steps) if (!nodes.has(id)) throw new Error(`Unknown curriculum step ${id}`);
  }

  const result = {
    schemaVersion: '1.0',
    title: 'Physics Map',
    documents: documents.map(({ file, data }) => ({ file, graphId: data.graph_id, title: data.title, nodeCount: data.nodes.length, edgeCount: data.edges.length })),
    nodes: [...nodes.values()].sort((a, b) => a.label.localeCompare(b.label)),
    edges,
    paths: curriculum.paths,
    summary: { concepts: nodes.size, relationships: edges.length, overlaps: [...nodes.values()].filter(node => new Set(node.variants.map(variant => variant.document)).size > 1).length, unresolved: [...nodes.values()].filter(node => node.unresolved).length }
  };
  return result;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const atlas = await buildAtlas();
  await writeFile(path.join(dataDirectory, 'atlas.json'), JSON.stringify(atlas));
  console.log(`Built ${atlas.summary.concepts} concepts, ${atlas.summary.relationships} relationships, ${atlas.summary.overlaps} merged concepts, ${atlas.summary.unresolved} unresolved references`);
}
