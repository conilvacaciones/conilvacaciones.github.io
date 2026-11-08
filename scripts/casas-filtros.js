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

const ALWAYS = new Set(["piscina", "mascotas", "aire", "barbacoa", "wifi", "p4"]);

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
  // Búsquedas muy habituales: tienen página propia aunque todas las casas las cumplan
  // (p. ej. "casas con piscina privada"), con su propio texto y preguntas frecuentes.
  const ids = hk.map((x) => x.h.id).sort();
  for (const f of FILTERS) {
    if (!ALWAYS.has(f.key)) continue;
    const got = setOf([f]);
    if (got.join("|") === all && ids.length) best.set("always:" + f.key, { filters: [f], ids: got, cost: f.prio });
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

  const faqBlock = (qa) => `<div style="margin-top:34px;max-width:900px"><h2 style="font-family:var(--ff-display);color:var(--atlantic);font-size:26px;margin:0 0 12px">Preguntas frecuentes</h2>` +
    qa.map(([q, a]) => `<details style="background:#fff;border:1px solid var(--line);border-radius:12px;padding:14px 16px;margin-bottom:10px"><summary style="font-weight:600;cursor:pointer">${h.escapeText(q)}</summary><p style="margin:10px 0 0;color:var(--ink-soft);line-height:1.6">${h.escapeText(a)}</p></details>`).join("") + `</div>`;


  const EMO = [["piscina","🏊"],["jard","🌳"],["terraza","☀️"],["barbacoa","🍖"],["wifi","📶"],["tv","📺"],["aire","❄️"],["calef","🌡️"],["parking","🅿️"],["mascota","🐾"],["lavavajillas","🍽️"],["cocina","🍳"],["lavadora","🧺"],["vistas","🌊"],["playa","🏖️"]];
  const emo = (l) => { const x = String(l).toLowerCase(); for (const [k, e] of EMO) if (x.includes(k)) return e; return "✨"; };
  const ico = (d) => `<svg class="icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  const I = {
    pin: ico('<path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/>'),
    users: ico('<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.5a6.5 6.5 0 0 1 3.5 5.5"/>'),
    bed: ico('<path d="M3 18V6M3 14h18v4M21 14v-2a3 3 0 0 0-3-3h-7v5"/><circle cx="7" cy="11" r="1.6"/>'),
    bath: ico('<path d="M3 12h18v2a5 5 0 0 1-5 5H8a5 5 0 0 1-5-5v-2zM6 12V6a2 2 0 0 1 3.5-1.3M7 19l-1 2M17 19l1 2"/>'),
  };
  const houseCard = (v) => {
    const href = `/viviendas/${encodeURIComponent(v.slug)}/`;
    const foto = v.fotosUrls && v.fotosUrls[0];
    const am = (v.amenities || []);
    const chipsH = am.slice(0, 4).map((a) => `<span class="amenity-chip"><span class="em">${emo(a)}</span>${h.escapeText(a)}</span>`).join("") +
      (am.length > 4 ? `<span class="amenity-chip">+${am.length - 4}</span>` : "");
    const precio = v.precio
      ? `<div class="house-price"><span class="from">desde</span><b>${h.escapeText(v.precio)} €</b><span> / ${v.unidadPrecio}</span></div>`
      : `<div class="house-price"><b style="font-size:15px">Consultar precio</b></div>`;
    return `<article class="house-card"><a href="${href}" class="house-photo" style="display:block;background:linear-gradient(135deg,#0B3D5C,#177268)" aria-label="${h.escapeAttr(v.nombre)}">` +
      (foto ? `<img src="${h.escapeAttr(foto)}" alt="${h.escapeAttr(v.nombre)}" loading="lazy">` : "") + `</a>` +
      `<div class="house-body"><div><h3 class="house-title"><a href="${href}" style="color:inherit;text-decoration:none">${h.escapeText(v.nombre)}</a></h3>` +
      (v.tagline ? `<p class="house-tagline">${h.escapeText(v.tagline)}</p>` : "") + `</div>` +
      `<div class="house-loc">${I.pin}<span>${h.escapeText(v.zona || "Conil de la Frontera")}</span>${v.distancia ? `<span class="sep">·</span><span>${h.escapeText(v.distancia)}</span>` : ""}</div>` +
      `<div class="house-meta"><span>${I.users}${v.huespedes} pers.</span><span>${I.bed}${v.dormitorios} dorm.</span>${v.banos ? `<span>${I.bath}${v.banos} baños</span>` : ""}</div>` +
      `<div class="house-amenities">${chipsH}</div>` +
      `<div class="house-foot">${precio}</div>` +
      `<a class="btn btn-dark house-btn btn-block" href="${href}" style="text-align:center">Más detalles</a></div></article>`;
  };
  const HCSS = `<style>.houses-grid{display:grid;grid-template-columns:1fr;gap:26px;align-items:stretch}@media(min-width:641px) and (max-width:1024px){.houses-grid{grid-template-columns:repeat(2,1fr)}}@media(min-width:1025px){.houses-grid{grid-template-columns:repeat(3,1fr)}}.house-card{height:100%;background:var(--card,#fff);border-radius:var(--radius-lg,22px);overflow:hidden;box-shadow:var(--shadow-card,0 10px 30px -14px rgba(11,61,92,.25));border:1px solid rgba(11,61,92,.06);display:flex;flex-direction:column;transition:transform .3s ease,box-shadow .3s ease}.house-card:hover{transform:translateY(-6px);box-shadow:0 26px 50px -20px rgba(11,61,92,.42)}.house-photo{position:relative;aspect-ratio:4/3;overflow:hidden;flex-shrink:0}.house-photo img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;z-index:2}.house-body{padding:20px 22px 22px;display:flex;flex-direction:column;gap:12px;flex:1}.house-title{font-family:var(--ff-display);font-weight:600;font-size:19px;color:var(--ink);line-height:1.3;margin:0}.house-tagline{font-size:13.5px;color:var(--ink-soft);margin:2px 0 0}.house-loc{display:flex;align-items:center;gap:6px;font-size:13px;color:var(--teal);font-weight:600}.house-loc .icon{color:var(--teal)}.house-loc .sep{color:var(--ink-faint);font-weight:400}.house-meta{display:flex;gap:16px;flex-wrap:wrap;font-size:13px;color:var(--ink-soft);padding:12px 0;border-top:1px solid var(--line);border-bottom:1px solid var(--line)}.house-meta span{display:flex;align-items:center;gap:6px}.house-meta .icon{color:var(--ink-faint)}.house-amenities{display:flex;gap:8px;flex-wrap:wrap}.amenity-chip{display:flex;align-items:center;gap:5px;background:var(--cal,#f6efe3);border-radius:999px;padding:5px 10px 5px 8px;font-size:11.5px;color:var(--ink-soft);font-weight:500}.amenity-chip .em{font-size:15px;line-height:1;flex:none}.house-foot{display:flex;align-items:center;justify-content:flex-end;margin-top:auto;padding-top:6px;gap:12px}.house-price{text-align:right}.house-price .from{display:block;font-size:10.5px;color:var(--ink-faint);text-transform:uppercase;letter-spacing:.05em}.house-price b{font-family:var(--ff-mono);font-size:22px;color:var(--atlantic)}.house-price span{font-size:11.5px;color:var(--ink-soft)}.house-btn{margin-top:14px}</style>`;


  const SEARCH = `<style>.cv-search{background:linear-gradient(120deg,#c4f3e1 0%,#a9ebd2 50%,#8fe2c4 100%);border:1px solid rgba(255,255,255,.45);border-radius:var(--radius-lg,22px);padding:24px 28px;margin:22px 0 8px;box-shadow:0 20px 55px rgba(11,61,92,.18);color:#0B3D5C}.cv-search h2{font-family:var(--ff-display);font-size:23px;margin:0 0 4px;color:#0B3D5C}.cv-search p{margin:0 0 16px;font-size:14.5px;color:#0f4a52}.cv-search .row{display:grid;grid-template-columns:1.2fr 1.2fr .7fr auto;gap:16px;align-items:end}.cv-search label{display:block;font-size:12px;font-weight:600;color:#0f4a52;margin-bottom:6px;text-transform:uppercase;letter-spacing:.03em}.cv-search input{box-sizing:border-box;width:100%;min-height:50px;padding:12px 14px;border:0;border-radius:12px;background:#fff;font:inherit;font-size:16px;color:var(--ink)}.cv-search .acts{display:flex;gap:12px;flex-wrap:wrap}.cv-search .btn{white-space:nowrap;padding:14px 24px;font-size:15.5px}.cv-search .btn-s{background:#0B3D5C;color:#fff}.cv-search .btn-o{background:rgba(255,255,255,.55);color:#0B3D5C;border:1.5px solid rgba(11,61,92,.35)}@media(max-width:900px){.cv-search .row{grid-template-columns:1fr 1fr}.cv-search .acts{grid-column:1/3}}@media(max-width:560px){.cv-search{padding:18px 16px}.cv-search .row{grid-template-columns:minmax(0,1fr)}.cv-search .acts{grid-column:1}}</style>` +
    `<form class="cv-search" id="cvSearch" onsubmit="var f=this;var q=new URLSearchParams();if(f.e.value)q.set('entrada',f.e.value);if(f.s.value)q.set('salida',f.s.value);q.set('personas',f.p.value||2);location.href='/?'+q.toString()+'#viviendas';return false"><h2>Encuentra tu casa ideal</h2><p>Dinos tus fechas y cuántos sois, y te recomendamos las casas que mejor encajan.</p>` +
    `<div class="row"><div><label for="cvE">Entrada</label><input type="date" id="cvE" name="e"></div><div><label for="cvS">Salida</label><input type="date" id="cvS" name="s"></div><div><label for="cvP">Personas</label><input type="number" id="cvP" name="p" min="1" max="30" value="2"></div>` +
    `<div class="acts"><button type="submit" class="btn btn-s">Buscar casa</button><a href="/casas-conil/" class="btn btn-o">Ver todas</a><button type="button" class="btn btn-o" id="openFiltros">Filtros</button></div></div></form>`;

  const section = (h1, intro, cards, current, qa) =>
    `<section class="blog-section" id="casas" style="padding:120px 0 60px"><div class="wrap" style="max-width:1180px">` +
    `<span class="eyebrow">Casas vacacionales en Conil</span>` +
    `<h1 style="font-family:var(--ff-display);color:var(--atlantic);font-size:clamp(30px,5vw,46px);line-height:1.1;margin:10px 0 14px">${h.escapeText(h1)}</h1>` +
    `<p style="color:var(--ink-soft);font-size:17px;line-height:1.6;max-width:720px;margin:0 0 18px">${intro}</p>` +
    `${SEARCH}` +
    `${HCSS}<div class="houses-grid" style="margin-top:18px">${cards}</div>` +
    `` +
    faqBlock(qa) +
    `<div style="margin-top:34px;max-width:900px;background:var(--atlantic);color:#fff;border-radius:20px;padding:26px"><h2 style="font-family:var(--ff-display);font-size:26px;margin:0 0 8px">Reserva directa, sin comisiones</h2><p style="margin:0 0 16px;color:rgba(255,255,255,.85);line-height:1.55">Escríbenos por WhatsApp y te confirmamos disponibilidad y precio para tus fechas.</p><a class="btn btn-primary" href="https://wa.me/34650283373" target="_blank" rel="noopener">Consultar por WhatsApp</a></div>` +
    `<p style="margin-top:22px;font-size:12.5px;color:var(--ink-faint);line-height:1.8;max-width:900px">Ver también: ${finalPages.filter((p) => p.slug !== current).map((p) => `<a href="/casas-conil/${p.slug}/" style="color:inherit">${h.escapeText(p.filters.map((f) => f.label).join(" + "))}</a>`).join(" · ")}${current ? ` · <a href="/casas-conil/" style="color:inherit">Todas las casas</a>` : ""}</p>` +
    `<p style="margin-top:14px"><a href="/playas-conil/" style="color:var(--atlantic);font-weight:600">Guía de playas de Conil</a> · <a href="/#viviendas" style="color:var(--atlantic);font-weight:600">Ver todas desde la portada</a></p>` +
    `</div><div class="blog-grid" id="blogGrid" style="display:none!important" hidden></div></section>`;

  const build = ({ slug, h1, title, desc, intro, houses, qa }) => {
    const url = slug ? `${SITE_URL}/casas-conil/${slug}/` : `${SITE_URL}/casas-conil/`;
    let html = retag(template, { title, desc, url });
    const cards = houses.map((v) => houseCard(v)).join("");
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
