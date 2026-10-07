(function () {
  const domains = [
    { id: 'physics', label: 'Physics', color: '#83d8e9' },
    { id: 'thermo', label: 'Thermodynamics', color: '#f8b886' },
    { id: 'chemistry', label: 'Chemistry', color: '#9ceddd' },
    { id: 'quantum', label: 'Quantum', color: '#b6b4ff' },
    { id: 'ion', label: 'Ions', color: '#f19db4' },
    { id: 'bonding', label: 'Bonding', color: '#d5c18e' },
    { id: 'matter', label: 'Matter', color: '#d0e9a2' },
    { id: 'relativity', label: 'Relativity', color: '#8bc9f8' },
    { id: 'history', label: 'People / history', color: '#f7d598' },
    { id: 'claim', label: 'Sources / claims', color: '#74929a' }
  ];
  const relationships = [
    { id: 'structure', label: 'Part / type', color: '#82d5e9', dash: [], description: 'Recorded membership, classification, or branch.' },
    { id: 'evidence', label: 'Source / support', color: '#c8a7ff', dash: [3, 4], description: 'A source, claim, reference, or recorded support link.' },
    { id: 'history', label: 'Person / history', color: '#f7c076', dash: [2, 6], description: 'Authorship, discovery, or other explicitly historical relation.' },
    { id: 'effect', label: 'Dependency / effect', color: '#f0948b', dash: [10, 4], description: 'A recorded explanation, prediction, requirement, or effect.' },
    { id: 'practice', label: 'Study / use', color: '#a9dfaf', dash: [7, 3, 2, 3], description: 'A recorded study, application, measurement, or representation.' },
    { id: 'related', label: 'Other link', color: '#8fa7af', dash: [1, 6], description: 'Another recorded relationship. Its exact meaning is shown when selected.' }
  ];
  const domainById = new Map(domains.map(domain => [domain.id, domain]));
  const relationshipById = new Map(relationships.map(relationship => [relationship.id, relationship]));

  function groupOf(node) {
    if (node.claim || /bibliographic|source.claim|scientific_work/i.test(node.type)) return 'claim';
    if (/person|scientist|author|historical|institution|award/i.test(node.type)) return 'history';
    const topics = node.topics || [];
    if (topics.some(topic => topic.includes('ionic_bonding'))) return 'bonding';
    if (topics.some(topic => topic.startsWith('matter_'))) return 'matter';
    if (topics.some(topic => topic.startsWith('ion_'))) return 'ion';
    if (topics.some(topic => topic.includes('quantum_mechanics'))) return 'quantum';
    if (topics.some(topic => topic.includes('theory_of_relativity'))) return 'relativity';
    if (topics.some(topic => topic.includes('physical_chemistry'))) return 'chemistry';
    if (topics.some(topic => topic.includes('thermodynamics'))) return 'thermo';
    return 'physics';
  }

  function classify(edge) {
    const relation = String(edge.relation || '').toLowerCase();
    if (/provenance|source|citation|referenc|cites|claims?|supports|documents|confirmed|evidence/.test(relation)) return relationshipById.get('evidence');
    if (/subfield|subclass|instance_of|is_a|is_type_of|part_of|contains|includes|component|member|branch|classified|field_of/.test(relation)) return relationshipById.get('structure');
    if (/authored|coauthored|developed|formulated|discovered|invented|historically|contributed|coined|advocated|built|founder/.test(relation)) return relationshipById.get('history');
    if (/explains|predicts|depends|requires|causes|governs|produces|affects|enables|constrains|determines|forbids|permits|motivates|implies/.test(relation)) return relationshipById.get('effect');
    if (/studies|uses|used_in|applied_to|represented_by|quantifies|measures|tests|presents|describes|defines/.test(relation)) return relationshipById.get('practice');
    return relationshipById.get('related');
  }

  window.PhysicsMapKey = { domains, relationships, domainById, groupOf, classify };
})();
