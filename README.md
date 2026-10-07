# Physics Map

An interconnected, source-aware physics learning map across physics, thermodynamics, physical chemistry, ions, ionic bonding and quantum mechanics. Follow learning routes, search definitions and claim text, and inspect original records and evidence for every relationship. No sign-in, backend or paid service is required.

## Run locally

```bash
npm run build
npm run dev
```

Open `http://localhost:4173`. The page is static and can also be served from a GitHub Pages repository root, any static hosting provider, or a basic web server. Serve over HTTP rather than opening `index.html` with `file://` so the atlas can load.

## Data model

The original JSON graphs are preserved in `data/`. `npm run build` recursively discovers graph JSON files in `data/` with `nodes` and `edges` arrays, excluding the generated `atlas.json` and the curriculum file. Place new source graphs there and rebuild; no importer allowlist needs editing. Six graphs currently yield 1,539 concepts and 2,076 recorded relationships. The original node fields, edges, source references and claim records remain in `variants[].record`, `edges[].record` and document metadata. Concepts with the same ID merge into one node with multiple source records. The curriculum notes are clearly marked teaching additions, not falsely attributed to any graph. Source texts named in citations may not be included in this repository; displayed citations are the source graph's own provenance, not independently verified external references.

The map renders **every node and recorded link at all times** using a precomputed force layout. Hover or select to brighten direct neighbors and edges; unrelated nodes remain visible but dimmed. Drag to pan, scroll or use buttons to zoom, and choose Fit all to reset. Source filters dim the map rather than hiding nodes; they narrow only search and catalog results. The inspector shows every connection, every source field and available claim-level evidence, including original line references, without silently truncating. Full source documents and the unified atlas can also be downloaded. A record with no definition or citation is identified as such; the app does not invent one.

## Verify

```bash
npm test
npm run build
```

The tests check source-record preservation, evidence, graph completeness, rendered interactions and route integrity. Re-run `npm run build` after adding or editing any source graph or curriculum notes, then commit the changed `data/atlas.json` alongside them.
