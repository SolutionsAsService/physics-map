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

export function fieldsFrom(record) {
  return Object.entries(record)
    .filter(([key]) => !excluded.has(key))
    .map(([key, value]) => ({ key, label: titles[key] || key.replaceAll('_', ' ').replace(/^./, letter => letter.toUpperCase()), value }));
}

export function sourceClaimsFor(record, claimsById) {
  const ids = Array.isArray(record.source_claims) ? record.source_claims : [];
  return ids.map(id => claimsById.get(id) || { id, missing: true });
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
