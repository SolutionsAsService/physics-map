# Physics Map

An interconnected, source-aware physics learning map. Explore the relationships between physics, thermodynamics and physical chemistry; follow four short learning routes; search the full concept index; and inspect complete JSON records behind each idea. No sign-in, backend or paid service is required.

## Run locally

```bash
npm run build
npm run dev
```

Open `http://localhost:4173`. The page is static and can also be served from a GitHub Pages repository root, any static hosting provider, or a basic web server. Serve over HTTP rather than opening `index.html` with `file://` so the atlas can load.

## Data model

The original JSON graphs are preserved in `data/`. `npm run build` creates `data/atlas.json` from those three files and `data/atlas-curriculum.json`. All original node fields, edges, claims and source references remain available in `variants[].record` and `edges[].record`; concepts with the same ID merge into one node with multiple original records. The 14 originally dangling references in the whole-field graph are supplied as *labeled teaching additions* in the curriculum file, not falsely attributed to a source. Generated atlas relationships retain their originating file. Guided routes are learning suggestions and their diagram lines are dashed to distinguish them from recorded edges. The source texts named in citations are not included in this repository; the UI does not present them as verified external references.

The full source documents and unified atlas can be downloaded from the page. A focused map limits visual clutter; the search, index, inspector and downloadable JSON give access to the full data.

## Verify

```bash
npm test
npm run build
```

The tests check source-record preservation, edge resolution and route integrity. Re-run `npm run build` after editing any source graph or curriculum notes, then commit the changed `data/atlas.json` alongside them.
