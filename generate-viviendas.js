/**
 * generate-viviendas.js
 *
 * Genera páginas estáticas reales en /viviendas/<slug>/index.html para que
 * cada vivienda activa tenga una URL "bonita" (https://conilvacaciones.github.io/viviendas/<slug>/)
 * además de la ya existente /vivienda.html?id=<slug>.
 *
 * Cómo funciona:
 *  - vivienda.html es una plantilla genérica: carga los datos de la vivienda
 *    en el navegador (vía Supabase) según el id que detecta en la URL
 *    (?id=... o /viviendas/<slug>/).
 *  - Este script NO necesita generar HTML distinto por vivienda: solo
 *    necesita saber qué slugs (ids) están activos ahora mismo, y colocar
 *    una copia idéntica de vivienda.html en viviendas/<slug>/index.html
 *    para cada uno.
 *  - Las viviendas que ya no están activas (o que se han borrado) ven su
 *    carpeta eliminada automáticamente, para no dejar páginas huérfanas.
 *
 * Se ejecuta desde GitHub Actions (ver .github/workflows/sync-viviendas.yml)
 * usando Node 18+ (fetch global ya disponible, sin dependencias externas).
 */

const fs = require("fs");
const path = require("path");

const SUPABASE_URL = "https://bjuxswhdktkvlrnuejuz.supabase.co";
// Misma clave pública ("publishable"/anon) ya embebida en vivienda.html del lado cliente.
const SUPABASE_KEY = "sb_publishable_Z_Mlw0dn2p9uOOpQn4QL4w_wx74m27G";

const REPO_ROOT = path.resolve(__dirname, "..");
const TEMPLATE_PATH = path.join(REPO_ROOT, "vivienda.html");
const OUTPUT_DIR = path.join(REPO_ROOT, "viviendas");

const SLUG_PATTERN = /^[a-z0-9-]+$/;

async function fetchActiveSlugs() {
  const url = `${SUPABASE_URL}/rest/v1/viviendas?select=id&activo=eq.true`;
  const res = await fetch(url, {
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
    },
  });
  if (!res.ok) {
    throw new Error(`Error consultando Supabase: ${res.status} ${res.statusText} - ${await res.text()}`);
  }
  const rows = await res.json();
  const slugs = rows
    .map((r) => String(r.id || "").trim())
    .filter((id) => id.length > 0);

  const invalid = slugs.filter((id) => !SLUG_PATTERN.test(id));
  if (invalid.length > 0) {
    console.warn("Aviso: se ignoran ids con formato inesperado (no [a-z0-9-]+):", invalid);
  }
  return slugs.filter((id) => SLUG_PATTERN.test(id));
}

function main() {
  fetchActiveSlugs()
    .then((slugs) => {
      if (slugs.length === 0) {
        console.log("No hay viviendas activas en Supabase. No se genera nada (y no se borra nada por seguridad).");
        return;
      }

      if (!fs.existsSync(TEMPLATE_PATH)) {
        throw new Error(`No se encuentra la plantilla en ${TEMPLATE_PATH}`);
      }
      const template = fs.readFileSync(TEMPLATE_PATH, "utf-8");

      if (!fs.existsSync(OUTPUT_DIR)) {
        fs.mkdirSync(OUTPUT_DIR, { recursive: true });
      }

      let created = 0;
      let updated = 0;
      for (const slug of slugs) {
        const dir = path.join(OUTPUT_DIR, slug);
        const outFile = path.join(dir, "index.html");
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }
        const existing = fs.existsSync(outFile) ? fs.readFileSync(outFile, "utf-8") : null;
        if (existing !== template) {
          fs.writeFileSync(outFile, template, "utf-8");
          if (existing === null) created++; else updated++;
        }
      }

      // Limpieza: elimina carpetas de viviendas que ya no están activas.
      const existingDirs = fs.readdirSync(OUTPUT_DIR, { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .map((d) => d.name);
      const activeSet = new Set(slugs);
      let removed = 0;
      for (const dirName of existingDirs) {
        if (!activeSet.has(dirName)) {
          fs.rmSync(path.join(OUTPUT_DIR, dirName), { recursive: true, force: true });
          removed++;
        }
      }

      console.log(`Viviendas activas: ${slugs.length}`);
      console.log(`Páginas creadas: ${created}, actualizadas: ${updated}, eliminadas: ${removed}`);
    })
    .catch((err) => {
      console.error("Error generando páginas de viviendas:", err.message || err);
      process.exit(1);
    });
}

main();
