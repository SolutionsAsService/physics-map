// Classification is about record roles, never name substrings used as aliases.
export const metadataType = /person|histor|bibliograph|reference|source|claim|publication|scientific_work|doctoral|book|paper|essay|manifesto|article|journal|institution|organization|award|protocol|graph_root|semantic_distinction|semantic_axiom|semantic_consequence|political|social_|cultural|philosoph|epistem|research_goal|dataset|methodolog|primary_collection|further_reading|evidence|^work$|^goal$|^observatory$/i;
export function isMetadata(node) { return metadataType.test(node.type || node.node_type || ''); }
// Stable category for an explicit predicate. Never infer a causal inverse from algebra.
export function semanticKind(relation, record = {}) {
 const r = relation.toLowerCase();
 if (/conserv/.test(r)) return 'conservation';
 if (/approxim|limit_of|reduces_to|classical_limit/.test(r)) return 'approximation';
 if (/proportional/.test(r)) return 'proportionality';
 if (/deriv|integral|integrat|differentiat/.test(r)) return 'derivation';
 if (/defin/.test(r)) return 'definition';
 if (/causes|produces|induces|generates|drives|leads_to|results_in/.test(r) || record.semantic_role === 'causal') return 'causation';
 if (/part_of|compos|constitut|contains|includes|component|consists|sum/.test(r)) return 'composition';
 if (/is_a|type_of|subclass|instance|subfield|branch/.test(r)) return 'classification';
 if (/depends|determines|requires|governs|constrains|affects|explains|predicts/.test(r)) return 'dependency';
 return 'relation';
}
export const metadataPredicate = /source|citation|cites|reference|claim|authored|published|historical|discovered|developed_by|formulated_by|named_after|documented|supported_by|has_section|has_equation_record/i;
