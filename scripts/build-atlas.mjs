import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { claimEntries, explainDocument, explainEdge, explainVariant } from './extract-concepts.mjs';
import { layoutGraph } from './layout-graph.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDirectory = path.join(root, 'data');

async function sourceFiles(directory = dataDirectory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(entries.map(async entry => entry.isDirectory()
    ? sourceFiles(path.join(directory, entry.name))
    : entry.name.endsWith('.json') && !['atlas.json', 'atlas-curriculum.json'].includes(entry.name) ? [path.relative(dataDirectory, path.join(directory, entry.name)).replaceAll('\\', '/')] : []));
  return files.flat().sort();
}

export async function buildAtlas() {
  const files = await sourceFiles();
  const sources = await Promise.all(files.map(async file => ({ file, data: JSON.parse(await readFile(path.join(dataDirectory, file), 'utf8')) })));
  const documents = sources.filter(({ data }) => Array.isArray(data.nodes) && Array.isArray(data.edges));
  const curriculum = JSON.parse(await readFile(path.join(dataDirectory, 'atlas-curriculum.json'), 'utf8'));
  const nodes = new Map();
  const edges = [];
  const documentMetadata = [];

  for (const { file, data } of documents) {
    const graphId = data.graph_id || path.basename(file, '.json');
    const claimsById = new Map(claimEntries(data).map(claim => [claim.id, claim]));
    const { nodes: _nodes, edges: _edges, ...metadata } = data;
    documentMetadata.push({ file, graphId, title: data.title || graphId, domain: data.domain || '', nodeCount: data.nodes.length, edgeCount: data.edges.length, fields: explainDocument(metadata), metadata });
    for (const original of data.nodes) {
      if (!original.id || typeof original.id !== 'string') throw new Error(`Missing node ID in ${file}`);
      const current = nodes.get(original.id) || { id: original.id, label: original.label || original.id, type: original.type || original.node_type || 'concept', description: '', topics: [], variants: [] };
      if (!current.topics.includes(graphId)) current.topics.push(graphId);
      current.variants.push(explainVariant(original, file, claimsById));
      const explanation = [original.definition, original.description, original.semantic_definition].find(value => typeof value === 'string') || '';
      if (explanation.length > current.description.length) current.description = explanation;
      if (current.label === current.id && original.label) current.label = original.label;
      nodes.set(original.id, current);
    }
    for (const claim of claimsById.values()) {
      const original = nodes.get(claim.id);
      const current = original || { id: claim.id, label: String(claim.statement || claim.id).slice(0, 76), type: 'source claim', description: claim.statement || '', topics: [], variants: [], claim: true };
      if (!current.topics.includes(graphId)) current.topics.push(graphId);
      current.variants.push(explainVariant(claim, file, claimsById));
      nodes.set(claim.id, current);
    }
    data.edges.forEach((original, index) => {
      if (!original.source || !original.target) throw new Error(`Incomplete edge ${index} in ${file}`);
      edges.push({ id: `${graphId}:${index}`, source: original.source, target: original.target, relation: original.relationship || original.relation || 'related to', semantic: original.semantic || original.description || '', ...explainEdge(original, file, claimsById) });
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

  const unifiedNodes = [...nodes.values()].sort((a, b) => a.label.localeCompare(b.label));
  layoutGraph(unifiedNodes, edges, documentMetadata);
  return {
    schemaVersion: '2.0', title: 'Physics Map', documents: documentMetadata,
    nodes: unifiedNodes, edges, paths: curriculum.paths,
    summary: { concepts: nodes.size, relationships: edges.length, overlaps: unifiedNodes.filter(node => new Set(node.variants.map(variant => variant.document)).size > 1).length, unresolved: unifiedNodes.filter(node => node.unresolved).length }
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const atlas = await buildAtlas();
  await writeFile(path.join(dataDirectory, 'atlas.json'), JSON.stringify(atlas));
  console.log(`Built ${atlas.summary.concepts} concepts from ${atlas.documents.length} sources, ${atlas.summary.relationships} relationships, ${atlas.summary.overlaps} shared concepts, ${atlas.summary.unresolved} unresolved references`);
}
