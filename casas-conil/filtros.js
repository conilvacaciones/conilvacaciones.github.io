/* Panel "Filtros" de casas. Lee /casas-conil/filtros.json (lo genera scripts/casas-filtros.js). */
(function () {
  "use strict";
  var btn = document.getElementById("openFiltros");
  if (!btn) return;
  var data = null, loading = null, panel = null, sel = {};

  function css() {
    if (document.getElementById("fltCss")) return;
    var s = document.createElement("style"); s.id = "fltCss";
    s.textContent =
      ".flt-bd{position:fixed;inset:0;background:rgba(8,42,64,.55);z-index:9998;display:flex;align-items:flex-end;justify-content:center}" +
      ".flt-box{background:#fff;width:100%;max-width:560px;max-height:88vh;overflow:auto;border-radius:22px 22px 0 0;padding:22px 22px 0;box-shadow:0 -20px 50px rgba(0,0,0,.25)}" +
      "@media(min-width:700px){.flt-bd{align-items:center}.flt-box{border-radius:22px}}" +
      ".flt-h{display:flex;justify-content:space-between;align-items:center;margin-bottom:6px}" +
      ".flt-h h2{font:600 24px var(--ff-display,Georgia,serif);color:var(--atlantic,#0B3D5C);margin:0}" +
      ".flt-x{background:none;border:0;font-size:28px;line-height:1;cursor:pointer;color:#5b6b78}" +
      ".flt-g{margin:16px 0 0}.flt-g b{display:block;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#177268;margin-bottom:8px}" +
      ".flt-c{display:flex;flex-wrap:wrap;gap:8px}" +
      ".flt-chip{border:1.5px solid #e4e1d6;background:#faf9f4;border-radius:999px;padding:9px 14px;font:600 14px var(--ff-body,system-ui,sans-serif);cursor:pointer;color:#243746}" +
      ".flt-chip[aria-pressed=true]{background:var(--atlantic,#0B3D5C);border-color:var(--atlantic,#0B3D5C);color:#fff}" +
      ".flt-f{position:sticky;bottom:0;background:#fff;margin:18px -22px 0;padding:14px 22px 18px;border-top:1px solid #eee;display:flex;gap:10px;align-items:center;justify-content:space-between;flex-wrap:wrap}" +
      ".flt-n{font-size:14px;color:#44566a;flex:1;min-width:140px}" +
      ".flt-go{background:var(--bougain,#D6336C);color:#fff;border:0;border-radius:999px;padding:12px 22px;font:700 15px var(--ff-body,system-ui,sans-serif);cursor:pointer}" +
      ".flt-go[disabled]{opacity:.45;cursor:not-allowed}" +
      ".flt-clear{background:none;border:0;color:#44566a;text-decoration:underline;cursor:pointer;font-size:14px}" +
      ".flt-list{margin:12px 0 0;padding:0;list-style:none}.flt-list a{display:block;padding:10px 12px;border:1px solid #e4e1d6;border-radius:12px;margin-bottom:8px;color:var(--atlantic,#0B3D5C);font-weight:600;text-decoration:none}";
    document.head.appendChild(s);
  }
  function pre() {
    var el = document.querySelector(".flt-applied"), k = el && el.getAttribute("data-keys");
    return k ? k.split(",") : [];
  }
  function load() {
    if (data) return Promise.resolve(data);
    if (!loading) loading = fetch("/casas-conil/filtros.json").then(function (r) { return r.json(); }).then(function (d) { data = d; return d; });
    return loading;
  }
  function matches() {
    var keys = Object.keys(sel).filter(function (k) { return sel[k]; });
    return data.houses.filter(function (h) { return keys.every(function (k) { return h.keys.indexOf(k) !== -1; }); });
  }
  function selKeys() { return Object.keys(sel).filter(function (k) { return sel[k]; }).sort(); }
  function target() {
    var keys = selKeys();
    if (!keys.length) return data.all;
    return (data.combos && data.combos[keys.join(",")]) || (data.all + "?f=" + keys.join(","));
  }
  function refresh() {
    var list = matches(), n = list.length;
    panel.querySelector(".flt-n").textContent = n === 0 ? "Ninguna casa cumple todo. Prueba a quitar algún filtro." : n + (n === 1 ? " casa cumple tus filtros" : " casas cumplen tus filtros");
    var go = panel.querySelector(".flt-go"); go.disabled = n === 0;
    var url = list.length ? target() : null, ul = panel.querySelector(".flt-list");
    ul.innerHTML = "";
    go.textContent = "Ver resultados";
    go.onclick = function () { if (url) location.href = url; };
  }
  function chip(f) {
    var b = document.createElement("button"); b.type = "button"; b.className = "flt-chip"; b.textContent = f.label; b.setAttribute("aria-pressed", "false");
    b.onclick = function () {
      var on = !sel[f.key];
      if (on && (f.group === "personas" || f.group === "dormitorios")) {
        data.filters.forEach(function (o) { if (o.group === f.group) sel[o.key] = false; });
        panel.querySelectorAll('[data-g="' + f.group + '"] .flt-chip').forEach(function (c) { c.setAttribute("aria-pressed", "false"); });
      }
      sel[f.key] = on; b.setAttribute("aria-pressed", on ? "true" : "false"); refresh();
    };
    return b;
  }
  function open() {
    css();
    load().then(function () {
      if (panel) panel.remove();
      sel = {};
      pre().forEach(function (k) { sel[k] = true; });
      panel = document.createElement("div"); panel.className = "flt-bd"; panel.setAttribute("role", "dialog"); panel.setAttribute("aria-modal", "true"); panel.setAttribute("aria-label", "Filtros");
      var box = document.createElement("div"); box.className = "flt-box";
      box.innerHTML = '<div class="flt-h"><h2>Filtros</h2><button type="button" class="flt-x" aria-label="Cerrar">×</button></div>';
      var groups = [["personas", "Personas"], ["dormitorios", "Dormitorios"], ["equip", "Equipamiento"]];
      groups.forEach(function (g) {
        var items = data.filters.filter(function (f) { return f.group === g[0]; });
        if (!items.length) return;
        var w = document.createElement("div"); w.className = "flt-g"; w.setAttribute("data-g", g[0]);
        w.innerHTML = "<b>" + g[1] + '</b><div class="flt-c"></div>';
        var c = w.querySelector(".flt-c"); items.forEach(function (f) { var b = chip(f); if (sel[f.key]) b.setAttribute("aria-pressed", "true"); c.appendChild(b); });
        box.appendChild(w);
      });
      var ul = document.createElement("ul"); ul.className = "flt-list"; box.appendChild(ul);
      var foot = document.createElement("div"); foot.className = "flt-f";
      foot.innerHTML = '<span class="flt-n"></span><button type="button" class="flt-clear">Quitar filtros</button><button type="button" class="flt-go">Ver resultados</button>';
      box.appendChild(foot); panel.appendChild(box); document.body.appendChild(panel);
      var close = function () { panel.remove(); panel = null; document.removeEventListener("keydown", esc); };
      var esc = function (e) { if (e.key === "Escape") close(); };
      document.addEventListener("keydown", esc);
      panel.addEventListener("click", function (e) { if (e.target === panel) close(); });
      box.querySelector(".flt-x").onclick = close;
      foot.querySelector(".flt-clear").onclick = function () { sel = {}; panel.querySelectorAll(".flt-chip").forEach(function (c) { c.setAttribute("aria-pressed", "false"); }); refresh(); };
      refresh();
    }).catch(function () { location.href = "/casas-conil/"; });
  }
  btn.addEventListener("click", open);

  // /casas-conil/?f=a,b,c  → filtra el listado y muestra los filtros aplicados
  (function () {
    var m = /[?&]f=([^&]+)/.exec(location.search);
    var grid = document.querySelector(".houses-grid"), bar = document.querySelector(".flt-applied");
    if (!m || !grid || !bar) return;
    var keys = decodeURIComponent(m[1]).split(",").filter(Boolean).sort();
    load().then(function (d) {
      keys = keys.filter(function (k) { return d.filters.some(function (f) { return f.key === k; }); });
      if (!keys.length) return;
      var ok = {};
      d.houses.forEach(function (h) { ok[h.id] = keys.every(function (k) { return h.keys.indexOf(k) !== -1; }); });
      var shown = 0;
      grid.querySelectorAll(".house-card").forEach(function (c) { var v = ok[c.getAttribute("data-id")]; c.style.display = v ? "" : "none"; if (v) shown++; });
      var labels = keys.map(function (k) { return d.filters.filter(function (f) { return f.key === k; })[0].label; });
      bar.setAttribute("data-keys", keys.join(","));
      bar.hidden = false;
      bar.innerHTML = '<span class="fa-l">Filtros aplicados:</span>' + labels.map(function (l) { return '<span class="fa-c">' + l + "</span>"; }).join("") + '<a class="fa-x" href="/casas-conil/">Quitar filtros</a>';
      var h1 = document.querySelector("#casas h1");
      if (h1) h1.textContent = shown ? "Casas en Conil con tus filtros (" + shown + ")" : "Ninguna casa cumple todos los filtros";
      var rb = document.createElement("meta"); rb.name = "robots"; rb.content = "noindex,follow"; document.head.appendChild(rb);
    });
  })();
})();
