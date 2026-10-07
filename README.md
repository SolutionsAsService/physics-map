# Physics Map

An interconnected, source-aware physics learning map across physics, forces, acceleration, astrophysics, matter, thermodynamics, physical chemistry, ions, ionic bonding, quantum mechanics, Einstein and relativity. Follow learning routes, search definitions, connected ideas and claim text, and inspect original records and evidence for every relationship. No sign-in, backend or paid service is required.

## Run locally

```bash
npm run build
npm run dev
```

Open `http://localhost:4173`. The page is static and can also be served from a GitHub Pages repository root, any static hosting provider, or a basic web server. Serve over HTTP rather than opening `index.html` with `file://` so the atlas can load.

## Data model

The original JSON graphs are preserved in `data/`. `npm run build` recursively discovers graph JSON files in `data/` with `nodes` and either `edges` or `relationships` arrays, excluding the generated `atlas.json` and the curriculum file. Place new source graphs there and rebuild; no importer allowlist needs editing. Twelve uploaded graphs plus one explicitly marked teaching-additions graph yield 3,576 concepts and 4,488 recorded relationships, including the uploaded force, acceleration and astrophysics graphs. The original node fields, edges, source references and claim records remain in `variants[].record`, `edges[].record` and document metadata. The extractor resolves both `source_claims` and `source_claim_ids`, preserving source line references, and links learning paths or other document-level material to concepts only when the source records explicitly reference their IDs. Concepts with the same ID merge into one node with multiple source records. The curriculum notes are clearly marked teaching additions, not falsely attributed to any graph. Source texts named in citations may not be included in this repository; displayed citations are the source graph's own provenance, not independently verified external references.

The full-width map renders the **iterative 2-core**: every visible concept has at least two distinct visible neighbors. Self-links and repeated links to the same neighbor do not satisfy that threshold; pruning continues until stable. Search, catalog, routes, details and displayed counts share this projection, with no dangling edges. The unfiltered atlas and source downloads preserve every original record. The map renders this connected core using a precomputed force layout, fitted close to the viewer edges. Hover or select to brighten direct neighbors and edges; unrelated nodes remain visible but dimmed. Selecting a concept opens a compact, source-labeled preview at the right of the map; it gives the preface, source count and link count without requiring a scroll. Use **Read full entry** for the complete encyclopedia below, or ×/Escape to clear focus. The preview overlays the graph rather than reducing its width. Drag to pan, scroll or use buttons to zoom, and choose Fit all to reset. Source filters dim the map rather than hiding nodes; they narrow only search and catalog results. The encyclopedia assembles each source's supplied definitions, scope, examples, distinctions and connected descriptions, with every original node field, every edge attribute, all available claim records and provenance, linked educational material (where explicitly referenced), and expandable document-level context (including source policies, bibliographies and raw metadata). Full source documents and the unified atlas can also be downloaded. Some source graph records do not contain a prose definition or a citation; the app identifies those gaps rather than inventing material or claiming the cited source text was independently verified.

The **map key** separates colored concept domains from colored and patterned link families (source-asserted causes, mathematical derivations, part/type, source/support, person/history, dependency/effect, study/use, other). These are heuristic visual groupings of the original relationship verbs, not new claims or external verification. Select a concept to see a few representative links in the map preview with direction, original verb, available source explanation, and source document. The complete entry shows all *visible* relationships and their evidence, plus exact original node fields; unfiltered relationships remain in the source downloads. Hover a highlighted line to see its verb and explanation without leaving the map.

The **Force → acceleration** hero link selects the actual `net_force` map node and frames its labeled **a = F_net / m** arrow to acceleration. The explicitly marked teaching addition cites OpenStax University Physics §5.3 and NASA Glenn, verified on October 7, 2026, and states Newtonian, inertial-frame, constant-positive-mass conditions. A second sourced dependency connects mass to acceleration **at fixed net force**; no links are manufactured to keep low-connectivity nodes visible. Original uploaded force/acceleration records remain intact.

**Every visible relationship has a source → target arrow.** Filled heads identify source-asserted causation; open heads identify all other predicates (including associations, not causal claims). Original verbs, conditions and evidence remain available in the preview/detail. Selecting or hovering highlights the actual connections; hovering a selected connection labels its exact predicate. Arrow geometry is recalculated with the canvas on pan, zoom and resize. Small low-opacity overview heads and focus-only captions reduce clutter. There is no continuous arrow animation or added runtime dependency.

Low-connectivity bibliography entries are archived by the same rule as concepts. No “Prometheus protocol” concept exists in the supplied checkout; mentions of the unrelated **Prometheus Books** publisher are not selectively censored.

## Verify

```bash
npm test
npm run build
```

The tests check preservation and extraction of source, node and edge fields, evidence, graph completeness, edge-to-edge fit, Escape behavior, rendered interactions and route integrity. Re-run `npm run build` after adding or editing any source graph or curriculum notes, then commit the changed `data/atlas.json` alongside them.
