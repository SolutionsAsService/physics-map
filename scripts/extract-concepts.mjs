const excluded = new Set(['id', 'label']);
const titles = {
  semantic_definition: 'Semantic definition',
  chemical_formula: 'Chemical formula',
  net_charge: 'Net charge',
  charge_definition: 'Charge relation',
  canonical_examples: 'Examples',
  not_to_conflate_with: 'Do not confuse with',
  epistemic_status: 'Scientific status'
};

export function claimEntries(document) {
  const value = document.claims || document.source_claims || [];
  if (Array.isArray(value)) return value;
  return Object.entries(value).map(([key, claim]) => ({ id: claim.id || key, ...claim }));
}

export function claimText(claim) {
  return claim.statement || claim.claim || claim.description || claim.text || '';
}

export function fieldsFrom(record) {
  return Object.entries(record)
    .filter(([key]) => !excluded.has(key))
    .map(([key, value]) => ({ key, label: titles[key] || key.replaceAll('_', ' ').replace(/^./, letter => letter.toUpperCase()), value }));
}

export function sourceClaimsFor(record, claimsById) {
  const references = record.source_claims || record.source_claim_ids || [];
  const ids = Array.isArray(references) ? references : [];
  return ids.map(reference => {
    const id = typeof reference === 'string' ? reference : reference.id;
    return claimsById.get(id) || { id, missing: true };
  });
}

export function relatedSections(metadata, conceptIds) {
  const sections = new Map();
  function exactReferences(value, matches) {
    if (typeof value === 'string') { if (conceptIds.has(value)) matches.add(value); return; }
    if (Array.isArray(value)) { value.forEach(item => exactReferences(item, matches)); return; }
    if (value && typeof value === 'object') Object.values(value).forEach(item => exactReferences(item, matches));
  }
  for (const [section, content] of Object.entries(metadata)) {
    if (['claims', 'source_claims', 'nodes', 'edges'].includes(section)) continue;
    const records = Array.isArray(content) ? content : [content];
    for (const record of records) {
      if (!record || typeof record !== 'object') continue;
      const matches = new Set();
      exactReferences(record, matches);
      for (const id of matches) {
        if (!sections.has(id)) sections.set(id, []);
        sections.get(id).push({ section, fields: fieldsFrom(record), record });
      }
    }
  }
  return sections;
}

export function explainEdge(original, file, claimsById) {
  return {
    document: file,
    fields: fieldsFrom(original).filter(field => !['source', 'target', 'relation', 'relationship', 'semantic'].includes(field.key)),
    evidence: sourceClaimsFor(original, claimsById),
    record: original
  };
}

export function explainDocument(metadata) {
  return fieldsFrom(metadata).filter(field => !['claims', 'source_claims'].includes(field.key));
}

export function explainVariant(original, file, claimsById) {
  return {
    document: file,
    fields: fieldsFrom(original),
    source: original.source || null,
    claims: sourceClaimsFor(original, claimsById),
    record: original
  };
}
