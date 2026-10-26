// Solo MODALITÀ ANTEPRIMA: database PostgreSQL locale (PGlite) in un Web Worker,
// così il calcolo 3D del tool non lo rallenta. Condiviso tra le schede aperte.
import { PGlite } from "https://cdn.jsdelivr.net/npm/@electric-sql/pglite@0.5.8/dist/index.js";
import { worker } from "https://cdn.jsdelivr.net/npm/@electric-sql/pglite@0.5.8/dist/worker/index.js";

worker({
  async init(options) {
    return new PGlite(options.dataDir);
  },
});
