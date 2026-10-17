/**
 * generate-viviendas.js
 *
 * Genera páginas estáticas reales en /viviendas/<slug>/index.html para que
 * cada vivienda activa tenga una URL "bonita" (https://conilvacaciones.github.io/viviendas/<slug>/)
 * además de la ya existente /vivienda.html?id=<id interno>.
 *
 * Cómo funciona:
 *  - vivienda.html es una plantilla genérica: carga los datos de la vivienda
 *    en el navegador (vía Supabase) según el id o el slug que detecta en la
 *    URL (?id=... o /viviendas/<slug>/).
 *  - Cada vivienda tiene un id interno inmutable (usado para reservas,
 *    fotos, etc.) y opcionalmente un "slug" editable desde el admin, que es
 *    lo que se usa en la URL bonita si está puesto. Si no tiene slug, se usa
 *    el id interno como slug por defecto.
 *  - Las etiquetas <title>, meta description, og: y twitter: (y canonical)
 *    del <head> se sustituyen por el nombre, descripción y primera foto reales
 *    de cada vivienda, directamente en el HTML que se sube al repo. Esto es
 *    necesario porque apps como WhatsApp o Facebook leen esas etiquetas tal
 *    cual están en el HTML al generar la vista previa al compartir un
 *    enlace, SIN ejecutar JavaScript — así que el relleno dinámico que hace
 *    vivienda.html en el navegador (updateViviendaSocialMeta) nunca llega a
 *    verse en esas vistas previas. El resto de la página (todo el cuerpo,
 *    el comportamiento, los scripts) es idéntico a vivienda.html.
 *  - Las viviendas que ya no están activas, que se han borrado, o a las que
 *    se les ha cambiado el slug, ven su carpeta antigua eliminada
 *    automáticamente, para no dejar páginas huérfanas.
 *
 * Además, este mismo script genera /blog/<slug>/index.html para cada
 * entrada de blog publicada, siguiendo exactamente el mismo patrón que las
 * viviendas (blog/index.html es la plantilla genérica; cada entrada tiene un
 * id interno inmutable y opcionalmente un "slug" editable desde el admin).
 * El sitemap.xml incluye ambos tipos de página.
 *
 * Se ejecuta desde GitHub Actions (ver .github/workflows/sync-viviendas.yml)
 * usando Node 18+ (fetch global ya disponible, sin dependencias externas).
 */

const fs = require("fs");
const path = require("path");

const SUPABASE_URL = "https://bjuxswhdktkvlrnuejuz.supabase.co";
// Misma clave pública ("publishable"/anon) ya embebida en vivienda.html del lado cliente.
const SUPABASE_KEY = "sb_publishable_Z_Mlw0dn2p9uOOpQn4QL4w_wx74m27G";
const SITE_URL = "https://conilvacaciones.github.io";
const FALLBACK_IMAGE = `${SITE_URL}/images/og-image.png`;

const REPO_ROOT = path.resolve(__dirname, "..");
const TEMPLATE_PATH = path.join(REPO_ROOT, "vivienda.html");
const OUTPUT_DIR = path.join(REPO_ROOT, "viviendas");
const BLOG_TEMPLATE_PATH = path.join(REPO_ROOT, "blog", "index.html");
const BLOG_OUTPUT_DIR = path.join(REPO_ROOT, "blog");
const SITEMAP_PATH = path.join(REPO_ROOT, "sitemap.xml");

// Páginas estáticas del sitio (además de las fichas de vivienda, que se añaden
// dinámicamente). cambiar aquí si se añade o se quita alguna página fija.
const STATIC_PAGES = [
  { loc: `${SITE_URL}/`, changefreq: "weekly", priority: "1.0" },
  { loc: `${SITE_URL}/blog/`, changefreq: "weekly", priority: "0.8" },
  { loc: `${SITE_URL}/anunciate-con-nosotros/`, changefreq: "monthly", priority: "0.6" },
  { loc: `${SITE_URL}/aviso-legal/`, changefreq: "yearly", priority: "0.2" },
  { loc: `${SITE_URL}/politica-privacidad/`, changefreq: "yearly", priority: "0.2" },
  { loc: `${SITE_URL}/politica-cookies/`, changefreq: "yearly", priority: "0.2" },
];

const SLUG_PATTERN = /^[a-z0-9-]+$/;

function stripHTML(html) {
  if (!html) return "";
  return String(html)
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function truncate(text, max) {
  if (text.length <= max) return text;
  return text.slice(0, max - 1).replace(/\s+\S*$/, "") + "…";
}

// Escapa para insertar de forma segura dentro de un atributo HTML (content="...").
function escapeAttr(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function publicStorageUrl(bucket, storagePath) {
  if (!storagePath) return null;
  // Replica el formato de sb.storage.from(bucket).getPublicUrl(path).data.publicUrl
  const encodedPath = String(storagePath).split("/").map(encodeURIComponent).join("/");
  return `${SUPABASE_URL}/storage/v1/object/public/${bucket}/${encodedPath}`;
}

function publicPhotoUrl(storagePath) {
  return publicStorageUrl("fotos-viviendas", storagePath);
}

function publicBlogPhotoUrl(storagePath) {
  return publicStorageUrl("fotos-blog", storagePath);
}

async function fetchActiveViviendas() {
  const url = `${SUPABASE_URL}/rest/v1/viviendas?select=id,slug,nombre,tagline,descripcion,fotos&activo=eq.true`;
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

  const candidates = rows.map((r) => {
    const id = String(r.id || "").trim();
    const slug = String(r.slug || "").trim() || id;
    const fotos = Array.isArray(r.fotos) ? r.fotos : [];
    return {
      id,
      slug,
      nombre: String(r.nombre || "").trim(),
      tagline: String(r.tagline || "").trim(),
      descripcion: stripHTML(r.descripcion),
      imagen: publicPhotoUrl(fotos[0]) || FALLBACK_IMAGE,
    };
  }).filter((r) => r.id.length > 0);

  const invalid = candidates.filter((r) => !SLUG_PATTERN.test(r.slug));
  if (invalid.length > 0) {
    console.warn("Aviso: se ignoran viviendas cuyo slug/id no tiene un formato válido (no [a-z0-9-]+):", invalid.map((r) => r.id));
  }
  const valid = candidates.filter((r) => SLUG_PATTERN.test(r.slug));

  // Si dos viviendas acaban resolviendo al mismo slug (p.ej. alguien puso
  // como slug personalizado el id de otra vivienda), nos quedamos con la
  // primera y avisamos, para no pisar una página con la de otra.
  const seen = new Map();
  const result = [];
  for (const r of valid) {
    if (seen.has(r.slug)) {
      console.warn(`Aviso: el slug "${r.slug}" está repetido (viviendas "${seen.get(r.slug)}" y "${r.id}"). Se usa solo para "${seen.get(r.slug)}".`);
      continue;
    }
    seen.set(r.slug, r.id);
    result.push(r);
  }
  return result;
}

async function fetchPublishedBlogPosts() {
  const url = `${SUPABASE_URL}/rest/v1/blog_posts?select=id,slug,titulo,resumen,portada&publicado=eq.true`;
  const res = await fetch(url, {
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
    },
  });
  if (!res.ok) {
    throw new Error(`Error consultando Supabase (blog_posts): ${res.status} ${res.statusText} - ${await res.text()}`);
  }
  const rows = await res.json();

  const candidates = rows.map((r) => {
    const id = String(r.id || "").trim();
    const slug = String(r.slug || "").trim() || id;
    return {
      id,
      slug,
      titulo: String(r.titulo || "").trim(),
      resumen: stripHTML(r.resumen),
      imagen: publicBlogPhotoUrl(r.portada) || FALLBACK_IMAGE,
    };
  }).filter((r) => r.id.length > 0);

  const invalid = candidates.filter((r) => !SLUG_PATTERN.test(r.slug));
  if (invalid.length > 0) {
    console.warn("Aviso: se ignoran entradas de blog cuyo slug/id no tiene un formato válido (no [a-z0-9-]+):", invalid.map((r) => r.id));
  }
  const valid = candidates.filter((r) => SLUG_PATTERN.test(r.slug));

  const seen = new Map();
  const result = [];
  for (const r of valid) {
    if (seen.has(r.slug)) {
      console.warn(`Aviso: el slug de blog "${r.slug}" está repetido (entradas "${seen.get(r.slug)}" y "${r.id}"). Se usa solo para "${seen.get(r.slug)}".`);
      continue;
    }
    seen.set(r.slug, r.id);
    result.push(r);
  }
  return result;
}

function buildPageContent(template, vivienda) {
  const pageUrl = `${SITE_URL}/viviendas/${encodeURIComponent(vivienda.slug)}/`;
  const title = vivienda.nombre ? `${vivienda.nombre} · Conil Vacaciones` : "Detalle de vivienda · Conil Vacaciones";
  const description = truncate(
    vivienda.tagline || vivienda.descripcion || "Vivienda vacacional en Conil de la Frontera, Cádiz. Fotos, precio, servicios y disponibilidad. Consulta y reserva directamente con el propietario.",
    200
  );
  const image = vivienda.imagen;

  let html = template;

  html = html.replace(
    /<title>Detalle de vivienda · Conil Vacaciones<\/title>/,
    `<title>${escapeAttr(title)}</title>`
  );
  html = html.replace(
    /<meta name="description" content="Vivienda vacacional en Conil de la Frontera, Cádiz\. Fotos, precio, servicios y disponibilidad\. Consulta y reserva directamente con el propietario\.">/,
    `<meta name="description" content="${escapeAttr(description)}">`
  );
  html = html.replace(
    /<meta property="og:url" content="https:\/\/conilvacaciones\.github\.io\/vivienda\.html">/,
    `<meta property="og:url" content="${escapeAttr(pageUrl)}">`
  );
  html = html.replace(
    /<meta property="og:title" content="Vivienda en Conil de la Frontera · Conil Vacaciones">/,
    `<meta property="og:title" content="${escapeAttr(title)}">`
  );
  html = html.replace(
    /<meta property="og:description" content="Vivienda vacacional en Conil de la Frontera\. Consulta disponibilidad y contacta directamente con el propietario a través de Conil Vacaciones\.">/,
    `<meta property="og:description" content="${escapeAttr(description)}">`
  );
  html = html.replace(
    /<meta property="og:image" content="https:\/\/conilvacaciones\.github\.io\/images\/og-image\.png">/,
    `<meta property="og:image" content="${escapeAttr(image)}">`
  );
  html = html.replace(
    /<meta name="twitter:title" content="Vivienda en Conil de la Frontera · Conil Vacaciones">/,
    `<meta name="twitter:title" content="${escapeAttr(title)}">`
  );
  html = html.replace(
    /<meta name="twitter:description" content="Vivienda vacacional en Conil de la Frontera\. Consulta disponibilidad y contacta directamente con el propietario a través de Conil Vacaciones\.">/,
    `<meta name="twitter:description" content="${escapeAttr(description)}">`
  );
  html = html.replace(
    /<meta name="twitter:image" content="https:\/\/conilvacaciones\.github\.io\/images\/og-image\.png">/,
    `<meta name="twitter:image" content="${escapeAttr(image)}">`
  );
  html = html.replace(
    /<link rel="canonical" id="canonicalLink" href="https:\/\/conilvacaciones\.github\.io\/vivienda\.html">/,
    `<link rel="canonical" id="canonicalLink" href="${escapeAttr(pageUrl)}">`
  );

  return html;
}

function buildBlogPageContent(template, post) {
  const pageUrl = `${SITE_URL}/blog/${encodeURIComponent(post.slug)}/`;
  const title = post.titulo ? `${post.titulo} · Conil Vacaciones` : "Blog · Conil Vacaciones — Qué hacer y ver en Conil de la Frontera";
  const description = truncate(
    post.resumen || "Ideas, playas y planes en Conil de la Frontera contados por quienes vivimos aquí. Descubre qué ver y hacer en la Costa de la Luz, Cádiz.",
    200
  );
  const image = post.imagen;

  let html = template;

  html = html.replace(
    /<title id="pageTitle">Blog · Conil Vacaciones — Qué hacer y ver en Conil de la Frontera<\/title>/,
    `<title id="pageTitle">${escapeAttr(title)}</title>`
  );
  html = html.replace(
    /<meta name="description" id="pageDescription" content="Ideas, playas y planes en Conil de la Frontera contados por quienes vivimos aquí\. Descubre qué ver y hacer en la Costa de la Luz, Cádiz\.">/,
    `<meta name="description" id="pageDescription" content="${escapeAttr(description)}">`
  );
  html = html.replace(
    /<meta property="og:url" content="https:\/\/conilvacaciones\.github\.io\/blog\/">/,
    `<meta property="og:url" content="${escapeAttr(pageUrl)}">`
  );
  html = html.replace(
    /<meta property="og:title" id="ogTitle" content="Blog · Conil Vacaciones — Qué hacer y ver en Conil de la Frontera">/,
    `<meta property="og:title" id="ogTitle" content="${escapeAttr(title)}">`
  );
  html = html.replace(
    /<meta property="og:description" id="ogDescription" content="Playas, planes y recomendaciones en Conil de la Frontera, contados por quienes vivimos aquí\.">/,
    `<meta property="og:description" id="ogDescription" content="${escapeAttr(description)}">`
  );
  html = html.replace(
    /<meta property="og:image" content="https:\/\/conilvacaciones\.github\.io\/images\/og-image\.png">/,
    `<meta property="og:image" content="${escapeAttr(image)}">`
  );
  html = html.replace(
    /<meta name="twitter:title" id="twitterTitle" content="Blog · Conil Vacaciones — Qué hacer y ver en Conil de la Frontera">/,
    `<meta name="twitter:title" id="twitterTitle" content="${escapeAttr(title)}">`
  );
  html = html.replace(
    /<meta name="twitter:description" id="twitterDescription" content="Playas, planes y recomendaciones en Conil de la Frontera, contados por quienes vivimos aquí\.">/,
    `<meta name="twitter:description" id="twitterDescription" content="${escapeAttr(description)}">`
  );
  html = html.replace(
    /<meta name="twitter:image" content="https:\/\/conilvacaciones\.github\.io\/images\/og-image\.png">/,
    `<meta name="twitter:image" content="${escapeAttr(image)}">`
  );
  html = html.replace(
    /<link rel="canonical" href="https:\/\/conilvacaciones\.github\.io\/blog\/">/,
    `<link rel="canonical" href="${escapeAttr(pageUrl)}">`
  );

  return html;
}

function buildSitemap(viviendas, blogPosts) {
  const staticEntries = STATIC_PAGES.map(
    (p) => `  <url>\n    <loc>${escapeAttr(p.loc)}</loc>\n    <changefreq>${p.changefreq}</changefreq>\n    <priority>${p.priority}</priority>\n  </url>`
  );
  const viviendaEntries = viviendas.map((v) => {
    const loc = `${SITE_URL}/viviendas/${encodeURIComponent(v.slug)}/`;
    return `  <url>\n    <loc>${escapeAttr(loc)}</loc>\n    <changefreq>weekly</changefreq>\n    <priority>0.9</priority>\n  </url>`;
  });
  const blogEntries = (blogPosts || []).map((p) => {
    const loc = `${SITE_URL}/blog/${encodeURIComponent(p.slug)}/`;
    return `  <url>\n    <loc>${escapeAttr(loc)}</loc>\n    <changefreq>monthly</changefreq>\n    <priority>0.7</priority>\n  </url>`;
  });
  const entries = staticEntries.concat(viviendaEntries).concat(blogEntries).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries}\n</urlset>\n`;
}

// Genera páginas /dir/<slug>/index.html a partir de una plantilla, y elimina
// las carpetas huérfanas que ya no correspondan a ningún elemento activo.
// Devuelve { slugs, created, updated, removed }.
function generateStaticPages(items, template, outputDir, buildContentFn) {
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  let created = 0;
  let updated = 0;
  const slugs = [];
  for (const item of items) {
    slugs.push(item.slug);
    const dir = path.join(outputDir, item.slug);
    const outFile = path.join(dir, "index.html");
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const content = buildContentFn(template, item);
    const existing = fs.existsSync(outFile) ? fs.readFileSync(outFile, "utf-8") : null;
    if (existing !== content) {
      fs.writeFileSync(outFile, content, "utf-8");
      if (existing === null) created++; else updated++;
    }
  }

  const existingDirs = fs.readdirSync(outputDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);
  const activeSet = new Set(slugs);
  let removed = 0;
  for (const dirName of existingDirs) {
    if (!activeSet.has(dirName)) {
      fs.rmSync(path.join(outputDir, dirName), { recursive: true, force: true });
      removed++;
    }
  }

  return { slugs, created, updated, removed };
}

function main() {
  Promise.all([fetchActiveViviendas(), fetchPublishedBlogPosts()])
    .then(([viviendas, blogPosts]) => {
      let viviendaStats = { slugs: [], created: 0, updated: 0, removed: 0 };
      if (viviendas.length === 0) {
        console.log("No hay viviendas activas en Supabase. No se generan páginas de viviendas (y no se borra nada por seguridad).");
      } else {
        if (!fs.existsSync(TEMPLATE_PATH)) {
          throw new Error(`No se encuentra la plantilla en ${TEMPLATE_PATH}`);
        }
        const template = fs.readFileSync(TEMPLATE_PATH, "utf-8");
        viviendaStats = generateStaticPages(viviendas, template, OUTPUT_DIR, buildPageContent);
        console.log(`Viviendas activas: ${viviendaStats.slugs.length}`);
        console.log(`Páginas de viviendas creadas: ${viviendaStats.created}, actualizadas: ${viviendaStats.updated}, eliminadas: ${viviendaStats.removed}`);
      }

      let blogStats = { slugs: [], created: 0, updated: 0, removed: 0 };
      if (blogPosts.length === 0) {
        console.log("No hay entradas de blog publicadas en Supabase. No se generan páginas de blog (y no se borra nada por seguridad).");
      } else {
        if (!fs.existsSync(BLOG_TEMPLATE_PATH)) {
          throw new Error(`No se encuentra la plantilla en ${BLOG_TEMPLATE_PATH}`);
        }
        const blogTemplate = fs.readFileSync(BLOG_TEMPLATE_PATH, "utf-8");
        // No tocar el index.html genérico de /blog/ como si fuera una "carpeta huérfana":
        // generateStaticPages solo crea/borra subcarpetas, así que esto es seguro.
        blogStats = generateStaticPages(blogPosts, blogTemplate, BLOG_OUTPUT_DIR, buildBlogPageContent);
        console.log(`Entradas de blog publicadas: ${blogStats.slugs.length}`);
        console.log(`Páginas de blog creadas: ${blogStats.created}, actualizadas: ${blogStats.updated}, eliminadas: ${blogStats.removed}`);
      }

      // Mantiene sitemap.xml sincronizado con las páginas fijas, las viviendas activas y el blog.
      const sitemap = buildSitemap(viviendas, blogPosts);
      const existingSitemap = fs.existsSync(SITEMAP_PATH) ? fs.readFileSync(SITEMAP_PATH, "utf-8") : null;
      if (existingSitemap !== sitemap) {
        fs.writeFileSync(SITEMAP_PATH, sitemap, "utf-8");
        console.log("sitemap.xml actualizado.");
      } else {
        console.log("sitemap.xml ya estaba al día.");
      }
    })
    .catch((err) => {
      console.error("Error generando páginas estáticas:", err.message || err);
      process.exit(1);
    });
}

main();
