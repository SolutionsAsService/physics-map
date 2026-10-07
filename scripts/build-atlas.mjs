import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { claimEntries, explainDocument, explainEdge, explainVariant, relatedSections } from './extract-concepts.mjs';
import { isMetadata, metadataPredicate, semanticKind } from './canonical-policy.mjs';
import { layoutGraph } from './layout-graph.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const directory = path.join(root, 'data');
const json = async file => JSON.parse(await readFile(path.join(directory, file), 'utf8'));
const key = value => createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0,16);
async function sourceFiles(dir = directory) {
 const files = await readdir(dir, {withFileTypes:true});
 return (await Promise.all(files.map(e => e.isDirectory() ? sourceFiles(path.join(dir,e.name)) : e.name.endsWith('.json') && !['atlas.json','atlas-curriculum.json','concept-aliases.json'].includes(e.name) ? [path.relative(directory,path.join(dir,e.name))] : []))).flat().sort();
}
export async function buildAtlas() {
 const aliases = await json('concept-aliases.json');
 const curriculum = await json('atlas-curriculum.json');
 const sources = (await Promise.all((await sourceFiles()).map(async file=>({file,data:await json(file)})))).filter(({data})=>Array.isArray(data.nodes)&&Array.isArray(data.edges||data.relationships));
 const canonical = (id,file) => aliases.scoped[file+'#'+id]?.canonical || aliases.aliases[id]?.canonical || id;
 const nodes = new Map(), documents = [], archive = {nodes:[],edges:[],claims:[]}, lookup = new Map();
 const rawIdConcepts = new Map();
 let rawNodes=0, rawEdges=0, conceptRecords=0;
 for (const {file,data} of sources) {
  const graphId=data.graph_id||path.basename(file,'.json');
  const claims = new Map(claimEntries(data).map(c=>[c.id,c]));
  const {nodes:_,edges:__,relationships:___,...metadata}=data;
  const related=relatedSections(metadata,new Set([...data.nodes.map(n=>n.id),...claims.keys()]));
  documents.push({file,graphId,title:data.title||data.subject||graphId,domain:data.domain||'',nodeCount:data.nodes.length,edgeCount:(data.edges||data.relationships).length,metadata,fields:explainDocument(metadata)});
  archive.claims.push(...[...claims.values()].map(record=>({document:file,record})));
  rawNodes+=data.nodes.length;rawEdges+=(data.edges||data.relationships).length;
  for(const original of data.nodes){
   if(isMetadata(original)){archive.nodes.push({document:file,record:original,reason:'Supporting metadata, not a physics neighbor'});lookup.set(file+'#'+original.id,null);continue;}
   conceptRecords++;
   // Local equation IDs (eq_*) may collide between documents; retain their own identity.
   const id = /^eq_/.test(original.id) ? graphId+'::'+original.id : canonical(original.id,file);
   lookup.set(file+'#'+original.id,id);
   if(!rawIdConcepts.has(original.id))rawIdConcepts.set(original.id,new Set());rawIdConcepts.get(original.id).add(id);
   const node=nodes.get(id)||{id,label:original.label||id,type:original.type||original.node_type||'concept',description:'',topics:[],variants:[],aliases:[],supporting:[]};
   node.topics=[...new Set([...node.topics,graphId])];node.aliases=[...new Set([...node.aliases,original.id])];
   node.variants.push({...explainVariant(original,file,claims),related:related.get(original.id)||[]});
   const description=[original.definition,original.description,original.semantic_definition].find(v=>typeof v==='string')||'';
   if(description.length>node.description.length)node.description=description;
   if(original.id===id)node.label=original.label||id;
   nodes.set(id,node);
  }
 }
 const resolve=(id,file)=>lookup.has(file+'#'+id)?lookup.get(file+'#'+id):nodes.has(canonical(id,file))?canonical(id,file):rawIdConcepts.get(id)?.size===1?[...rawIdConcepts.get(id)][0]:null;
 const merged=new Map();let eligibleEdges=0;
 for(const {file,data}of sources){
  const claims=new Map(claimEntries(data).map(c=>[c.id,c]));const local=new Map(data.nodes.map(n=>[n.id,n]));
  for(const [index,original]of(data.edges||data.relationships).entries()){
   const correction=aliases.edgeOverrides?.[file+'#'+original.id];
   const source=correction?.source||resolve(original.source,file),target=resolve(original.target,file);
   const relation=correction?.relation||original.relationship||original.relation||'related_to';
   const provenance={...explainEdge(original,file,claims),index,...(correction?{correction}: {})};
   if(!source||!target||source===target||metadataPredicate.test(relation)){
    const item={...provenance,reason:source===target&&source?'Alias self-reference':'Metadata or unresolved supporting endpoint'};archive.edges.push(item);
    for(const id of new Set([source,target].filter(Boolean)))nodes.get(id)?.supporting.push({...item,records:[local.get(original.source),local.get(original.target)].filter(n=>n&&isMetadata(n))});
    continue;
   }
   eligibleEdges++;
   let verb=relation,kind=original.kind||semanticKind(relation,original),scope=original.conditions||original.scope||'';
   // Equivalent Newtonian claims coalesce while all original source records remain in provenance.
   if(source==='net_force'&&target==='acceleration'&&['causes','causes_acceleration','causes_acceleration_through','determines'].includes(relation)){
    verb='causes';kind='causation';scope='Nonzero net external force; inertial frame; constant positive mass; Newtonian mechanics.';
   }
   const identity=[source,target,verb,kind,scope];const hash=key(identity);
   const edge=merged.get(hash)||{id:'edge_'+hash,source,target,relation:verb,kind,directed:true,scope,semantic:original.semantic||original.description||original.mechanism||'',...provenance,provenance:[],claimCount:0};
   edge.provenance.push(provenance);edge.claimCount++;
   const evidence=[...edge.evidence,...provenance.evidence];edge.evidence=[...new Map(evidence.map(c=>[key(c),c])).values()];
   if(original.teaching_addition){edge.record=original;edge.document=file;edge.fields=provenance.fields;edge.semantic=original.mechanism||edge.semantic;}
   merged.set(hash,edge);
  }
 }
 for(const [id,note]of Object.entries(curriculum.notes)){const node=nodes.get(canonical(id,''));if(node)node.note=note;}
 const unifiedNodes=[...nodes.values()].sort((a,b)=>a.id.localeCompare(b.id));const edges=[...merged.values()].sort((a,b)=>a.id.localeCompare(b.id));
 const paths=curriculum.paths.map(p=>({...p,steps:[...new Set(p.steps.map(id=>canonical(id,'')).filter(id=>nodes.has(id)))]})).filter(p=>p.steps.length>1);
 layoutGraph(unifiedNodes,edges,documents);
 const peers=new Map(unifiedNodes.map(n=>[n.id,new Set()]));for(const e of edges){peers.get(e.source).add(e.target);peers.get(e.target).add(e.source);}for(const n of unifiedNodes)n.degree=peers.get(n.id).size;
 return {schemaVersion:'3.0',title:'Physics concept map',aliases,documents,nodes:unifiedNodes,edges,paths,archive,summary:{sourceNodeRecords:rawNodes,sourceEdgeRecords:rawEdges,conceptRecords,concepts:nodes.size,relationships:edges.length,mergedAliases:Object.keys(aliases.aliases).length,excludedMetadata:archive.nodes.length,archivedEdges:archive.edges.length,aggregatedDuplicateClaims:eligibleEdges-edges.length,overlaps:unifiedNodes.filter(n=>n.topics.length>1).length,unresolved:0}};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){const atlas=await buildAtlas();await writeFile(path.join(directory,'atlas.json'),JSON.stringify(atlas));console.log(JSON.stringify(atlas.summary,null,2));}
