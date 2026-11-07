/*
 * Páginas de filtros de casas: /casas-conil/ (listado) y /casas-conil/<filtro>/ (una por resultado distinto).
 * Se generan a partir de las viviendas activas de Supabase (las llama generate-viviendas.js) y
 * se escribe /casas-conil/filtros.json para el panel "Filtros" (casas-conil/filtros.js).
 *
 * Filtros: personas (mínimo), dormitorios (mínimo) y equipamiento. Se prueban todas las
 * combinaciones de 1 y 2 filtros; para cada conjunto de casas distinto se crea UNA página
 * (la combinación más simple). El conjunto "todas las casas" es el propio listado.
 */
const fs = require("fs");
const path = require("path");

const norm = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

// prio: orden de preferencia al elegir la combinación "representante" de un conjunto.
const FILTERS = [
  { key: "p6", group: "personas", min: 6, label: "6 o más personas", slug: "para-6-personas", phrase: "para 6 o más personas", text: "Si viajáis varias familias o un grupo grande, estas casas tienen capacidad para 6 o más personas." },
  { key: "p4", group: "personas", min: 4, label: "4 o más personas", slug: "para-4-personas", phrase: "para 4 o más personas", text: "Casas con espacio para 4 o más personas, pensadas para familias y grupos pequeños de amigos." },
  { key: "p8", group: "personas", min: 8, label: "8 o más personas", slug: "para-8-personas", phrase: "para 8 o más personas", text: "Casas para grupos grandes, con capacidad para 8 o más personas." },
  { key: "d3", group: "dormitorios", min: 3, label: "3 o más dormitorios", slug: "con-3-dormitorios", phrase: "con 3 o más dormitorios", text: "Casas con 3 o más dormitorios, para que cada pareja o familia tenga su espacio." },
  { key: "d2", group: "dormitorios", min: 2, label: "2 o más dormitorios", slug: "con-2-dormitorios", phrase: "con 2 o más dormitorios", text: "Casas con 2 o más dormitorios: más intimidad para familias con niños o dos parejas." },
  { key: "piscina", group: "equip", re: /piscina priv/, label: "Piscina privada", slug: "con-piscina-privada", phrase: "con piscina privada", text: "Una piscina privada permite bañarse sin compartir espacio ni depender de horarios, algo muy valorado con niños y en los meses de calor." },
  { key: "mascotas", group: "equip", re: /mascota/, label: "Admite mascotas", slug: "que-admiten-mascotas", phrase: "que admiten mascotas", text: "Si viajas con tu perro u otra mascota, estas casas las admiten. Conviene avisar al reservar y confirmar las condiciones con el propietario." },
  { key: "parking", group: "equip", re: /parking|aparcamiento/, label: "Parking", slug: "con-parking", phrase: "con parking", text: "Tener parking propio quita el quebradero de cabeza de aparcar en Conil en temporada alta." },
  { key: "aire", group: "equip", re: /aire acondicionado/, label: "Aire acondicionado", slug: "con-aire-acondicionado", phrase: "con aire acondicionado", text: "El aire acondicionado se agradece en las noches de verano." },
  { key: "calefaccion", group: "equip", re: /calefaccion/, label: "Calefacción", slug: "con-calefaccion", phrase: "con calefacción", text: "Conil se disfruta también fuera del verano. La calefacción hace cómodas las estancias de otoño, invierno y primavera." },
  { key: "barbacoa", group: "equip", re: /barbacoa/, label: "Barbacoa", slug: "con-barbacoa", phrase: "con barbacoa", text: "Una barbacoa propia permite cenar al aire libre sin salir de casa." },
  { key: "jardin", group: "equip", re: /jardin privado/, label: "Jardín privado", slug: "con-jardin-privado", phrase: "con jardín privado", text: "Un jardín privado da espacio para que los niños jueguen y para disfrutar del exterior a cualquier hora." },
  { key: "terraza", group: "equip", re: /terraza|solarium/, label: "Terraza o solárium", slug: "con-terraza", phrase: "con terraza o solárium", text: "Una terraza o solárium permite desayunar, comer o tomar el sol sin salir de la casa." },
  { key: "wifi", group: "equip", re: /wi-?fi/, label: "WiFi", slug: "con-wifi", phrase: "con WiFi", text: "WiFi en la casa, útil para conectarse o teletrabajar durante la estancia." },
  { key: "lavavajillas", group: "equip", re: /lavavajillas/, label: "Lavavajillas", slug: "con-lavavajillas", phrase: "con lavavajillas", text: "Un lavavajillas facilita las comidas en grupo." },
].map((f, i) => ({ ...f, prio: i }));

function houseKeys(v) {
  const labels = (v.amenities || []).map(norm);
  const keys = [];
  for (const f of FILTERS) {
    if (f.group === "personas") { if ((v.huespedes || 0) >= f.min) keys.push(f.key); }
    else if (f.group === "dormitorios") { if ((v.dormitorios || 0) >= f.min) keys.push(f.key); }
    else if (labels.some((l) => f.re.test(l))) keys.push(f.key);
  }
  return keys;
}

function buildCombos(houses) {
  const hk = houses.map((h) => ({ h, keys: new Set(houseKeys(h)) }));
  const setOf = (fs_) => hk.filter((x) => fs_.every((f) => x.keys.has(f.key))).map((x) => x.h.id).sort();
  const all = houses.map((h) => h.id).sort().join("|");
  const best = new Map(); // setKey -> {filters, ids, cost}
  const consider = (fs_) => {
    const ids = setOf(fs_);
    if (!ids.length) return;
    const key = ids.join("|");
    if (key === all) return;
    const cost = fs_.length * 1000 + fs_.reduce((a, f) => a + f.prio, 0);
    const cur = best.get(key);
    if (!cur || cost < cur.cost) best.set(key, { filters: fs_, ids, cost });
  };
  for (let i = 0; i < FILTERS.length; i++) {
    consider([FILTERS[i]]);
    for (let j = i + 1; j < FILTERS.length; j++) {
      if (FILTERS[i].group !== "equip" && FILTERS[i].group === FILTERS[j].group) continue;
      consider([FILTERS[i], FILTERS[j]]);
    }
  }
  return [...best.values()].sort((a, b) => a.cost - b.cost);
}

const slugOf = (fs_) => fs_.map((f) => f.slug).join("-y-").replace(/-y-(con|que|para)-/g, "-y-");
const phraseOf = (fs_) => fs_.map((f) => f.phrase).join(" y ");

function generate(ctx) {
  const { viviendas, template, REPO_ROOT, SITE_URL, h } = ctx;
  const OUT = path.join(REPO_ROOT, "casas-conil");
  const combos = buildCombos(viviendas);
  const byId = new Map(viviendas.map((v) => [v.id, v]));
  const pages = combos.map((c) => ({ slug: slugOf(c.filters), phrase: phraseOf(c.filters), filters: c.filters, ids: c.ids, houses: c.ids.map((id) => byId.get(id)) }));
  // Evita colisiones de slug (poco probable): conserva la primera.
  const seen = new Set();
  const finalPages = pages.filter((p) => (seen.has(p.slug) ? false : (seen.add(p.slug), true)));

  const retag = (html, { title, desc, url }) => {
    html = html.replace(/<title[^>]*>[\s\S]*?<\/title>/, () => `<title>${h.escapeAttr(title)}</title>`);
    html = html.replace(/<meta name="description"[^>]*>/, () => `<meta name="description" content="${h.escapeAttr(desc)}">`);
    html = html.replace(/<meta property="og:url"[^>]*>/, () => `<meta property="og:url" content="${h.escapeAttr(url)}">`);
    html = html.replace(/<meta property="og:title"[^>]*>/, () => `<meta property="og:title" content="${h.escapeAttr(title)}">`);
    html = html.replace(/<meta property="og:description"[^>]*>/, () => `<meta property="og:description" content="${h.escapeAttr(desc)}">`);
    html = html.replace(/<meta name="twitter:title"[^>]*>/, () => `<meta name="twitter:title" content="${h.escapeAttr(title)}">`);
    html = html.replace(/<meta name="twitter:description"[^>]*>/, () => `<meta name="twitter:description" content="${h.escapeAttr(desc)}">`);
    html = html.replace(/<link rel="canonical"[^>]*>/, () => `<link rel="canonical" href="${h.escapeAttr(url)}">`);
    return html;
  };

  const chips = (current) => {
    const links = finalPages.filter((p) => p.slug !== current).map((p) => `<a href="/casas-conil/${p.slug}/" style="display:inline-block;margin:0 8px 8px 0;padding:8px 14px;border-radius:999px;background:#fff;border:1px solid var(--line);color:var(--atlantic);font-weight:600;font-size:14px;text-decoration:none">${h.escapeText(p.filters.map((f) => f.label).join(" + "))}</a>`);
    return `<a href="/casas-conil/" style="display:inline-block;margin:0 8px 8px 0;padding:8px 14px;border-radius:999px;background:var(--atlantic);color:#fff;font-weight:600;font-size:14px;text-decoration:none">Todas las casas</a>` + links.join("");
  };

  const faqBlock = (qa) => `<div style="margin-top:34px"><h2 style="font-family:var(--ff-display);color:var(--atlantic);font-size:26px;margin:0 0 12px">Preguntas frecuentes</h2>` +
    qa.map(([q, a]) => `<details style="background:#fff;border:1px solid var(--line);border-radius:12px;padding:14px 16px;margin-bottom:10px"><summary style="font-weight:600;cursor:pointer">${h.escapeText(q)}</summary><p style="margin:10px 0 0;color:var(--ink-soft);line-height:1.6">${h.escapeText(a)}</p></details>`).join("") + `</div>`;

  const section = (h1, intro, cards, current, qa) =>
    `<section class="blog-section" id="casas" style="padding:120px 0 60px"><div class="wrap" style="max-width:900px">` +
    `<span class="eyebrow">Casas vacacionales en Conil</span>` +
    `<h1 style="font-family:var(--ff-display);color:var(--atlantic);font-size:clamp(30px,5vw,46px);line-height:1.1;margin:10px 0 14px">${h.escapeText(h1)}</h1>` +
    `<p style="color:var(--ink-soft);font-size:17px;line-height:1.6;max-width:720px;margin:0 0 18px">${intro}</p>` +
    `<div style="margin:18px 0 8px"><button type="button" class="btn btn-primary" id="openFiltros">Filtros</button></div>` +
    `<div class="blog-modal-content" style="max-width:none;margin-top:18px"><div style="display:grid;gap:16px">${cards}</div></div>` +
    `<h2 style="font-family:var(--ff-display);color:var(--atlantic);font-size:26px;margin:34px 0 12px">Otras formas de buscar</h2><div>${chips(current)}</div>` +
    faqBlock(qa) +
    `<div style="margin-top:34px;background:var(--atlantic);color:#fff;border-radius:20px;padding:26px"><h2 style="font-family:var(--ff-display);font-size:26px;margin:0 0 8px">Reserva directa, sin comisiones</h2><p style="margin:0 0 16px;color:rgba(255,255,255,.85);line-height:1.55">Escríbenos por WhatsApp y te confirmamos disponibilidad y precio para tus fechas.</p><a class="btn btn-primary" href="https://wa.me/34650283373" target="_blank" rel="noopener">Consultar por WhatsApp</a></div>` +
    `<p style="margin-top:22px"><a href="/playas-conil/" style="color:var(--atlantic);font-weight:600">Guía de playas de Conil</a> · <a href="/#viviendas" style="color:var(--atlantic);font-weight:600">Ver todas desde la portada</a></p>` +
    `</div><div class="blog-grid" id="blogGrid" hidden></div></section>`;

  const build = ({ slug, h1, title, desc, intro, houses, qa }) => {
    const url = slug ? `${SITE_URL}/casas-conil/${slug}/` : `${SITE_URL}/casas-conil/`;
    let html = retag(template, { title, desc, url });
    const cards = houses.map((v) => h.casaCardStatic(v)).join("");
    html = html.replace(/<section class="blog-section" id="blog">[\s\S]*?<\/section>/, () => section(h1, intro, cards, slug, qa));
    const ld = h.jsonLdScript({ "@context": "https://schema.org", "@type": "CollectionPage", name: h1, url, description: desc,
      mainEntity: { "@type": "ItemList", itemListElement: houses.map((v, i) => ({ "@type": "ListItem", position: i + 1, url: `${SITE_URL}/viviendas/${v.slug}/`, name: v.nombre })) } }) + "\n" +
      h.jsonLdScript(h.breadcrumbLd([{ name: "Inicio", url: `${SITE_URL}/` }, { name: "Casas en Conil", url: `${SITE_URL}/casas-conil/` }].concat(slug ? [{ name: h1, url }] : []))) + "\n" +
      h.jsonLdScript({ "@context": "https://schema.org", "@type": "FAQPage", mainEntity: qa.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })) });
    html = html.replace("</head>", () => ld + "\n</head>");
    html = html.replace("</body>", () => `<script src="/casas-conil/filtros.js" defer></script>\n</body>`);
    return html;
  };

  const list = (vs) => vs.map((v) => v.nombre).join(", ");
  const write = (file, content) => {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const prev = fs.existsSync(file) ? fs.readFileSync(file, "utf-8") : null;
    if (prev !== content) { fs.writeFileSync(file, content, "utf-8"); return true; }
    return false;
  };
  let changed = 0;

  // Listado principal
  const mainQa = [
    ["¿Cuántas casas vacacionales tenéis en Conil?", `Ahora mismo hay ${viviendas.length} casas disponibles: ${list(viviendas)}.`],
    ["¿Cómo reservo una casa?", "Escríbenos por WhatsApp con tus fechas y el número de personas: te confirmamos disponibilidad y precio directamente, sin comisiones de intermediarios."],
    ["¿Qué filtros puedo usar?", "Puedes filtrar por número de personas, dormitorios y equipamiento (piscina privada, mascotas, parking, aire acondicionado, calefacción, barbacoa, jardín, terraza, WiFi y lavavajillas)."],
  ];
  changed += write(path.join(OUT, "index.html"), build({
    slug: "", h1: "Casas vacacionales en Conil de la Frontera",
    title: "Casas vacacionales en Conil de la Frontera con piscina · Conil Vacaciones",
    desc: h.truncate(`Casas vacacionales en Conil de la Frontera con piscina privada: ${list(viviendas)}. Reserva directa con el propietario, sin comisiones.`, 158),
    intro: `Casas vacacionales en Conil con piscina privada, para familias, parejas y grupos. Filtra por personas, dormitorios o equipamiento para encontrar la que mejor encaja con tu viaje.`,
    houses: viviendas, qa: mainQa })) ? 1 : 0;

  for (const p of finalPages) {
    const Hh = `Casas vacacionales en Conil ${p.phrase}`;
    const intro = h.escapeText(`Estas son las casas vacacionales de Conil de la Frontera ${p.phrase}. `) + p.filters.map((f) => h.escapeText(f.text)).join(" ") + " " + h.escapeText(`Ahora mismo hay ${p.houses.length} ${p.houses.length === 1 ? "casa" : "casas"}: ${list(p.houses)}.`);
    const qa = [
      [`¿Qué casas vacacionales hay en Conil ${p.phrase}?`, `${list(p.houses)}. Todas se reservan directamente con el propietario.`],
      ["¿Puedo combinar este filtro con otros?", "Sí: usa el botón Filtros para añadir personas, dormitorios o equipamiento y ver las casas que cumplen todo a la vez."],
    ];
    changed += write(path.join(OUT, p.slug, "index.html"), build({
      slug: p.slug, h1: Hh,
      title: h.truncate(`Casas en Conil ${p.phrase} · Conil Vacaciones`, 70),
      desc: h.truncate(`Casas vacacionales en Conil ${p.phrase}: ${list(p.houses)}. Reserva directa con el propietario, sin comisiones.`, 158),
      intro, houses: p.houses, qa })) ? 1 : 0;
  }

  // Páginas huérfanas (filtros que ya no dan un resultado distinto)
  const active = new Set(finalPages.map((p) => p.slug));
  if (fs.existsSync(OUT)) {
    for (const d of fs.readdirSync(OUT, { withFileTypes: true })) {
      if (d.isDirectory() && !active.has(d.name)) { fs.rmSync(path.join(OUT, d.name), { recursive: true, force: true }); changed++; }
    }
  }

  // Datos para el panel de filtros del navegador
  const manifest = {
    filters: FILTERS.map(({ key, group, label }) => ({ key, group, label })),
    houses: viviendas.map((v) => ({ id: v.id, nombre: v.nombre, url: `/viviendas/${v.slug}/`, keys: houseKeys(v) })),
    pages: finalPages.map((p) => ({ url: `/casas-conil/${p.slug}/`, ids: p.ids })),
    all: "/casas-conil/",
  };
  changed += write(path.join(OUT, "filtros.json"), JSON.stringify(manifest)) ? 1 : 0;

  const urls = [{ loc: `${SITE_URL}/casas-conil/`, changefreq: "weekly", priority: "0.8" }].concat(finalPages.map((p) => ({ loc: `${SITE_URL}/casas-conil/${p.slug}/`, changefreq: "weekly", priority: "0.6" })));
  return { pages: finalPages, urls, changed };
}

module.exports = { generate, FILTERS, buildCombos, houseKeys };
