/* "Avísame si se libera": formulario que guarda un aviso en Supabase (tabla alertas_disponibilidad).
 * El propietario lo ve en el panel de administración y avisa por WhatsApp cuando las fechas quedan libres.
 * Uso: cvAlerta.montar(elemento, { sb, viviendaId, nombreCasa, getFechas: () => ({entrada:"YYYY-MM-DD", salida:"YYYY-MM-DD", personas:2}) }) */
(function () {
  "use strict";
  var CSS = ".cva{margin-top:14px;border:1.5px dashed rgba(11,61,92,.28);border-radius:14px;padding:0;background:#fbf7ee;text-align:left;overflow:hidden}" +
    ".cva-t{display:flex;align-items:center;gap:8px;width:100%;background:none;border:0;padding:14px 16px;font:inherit;font-weight:700;font-size:15px;color:#0B3D5C;cursor:pointer;text-align:left}" +
    ".cva-ch{margin-left:auto;transition:transform .25s ease;flex:none}.cva-t[aria-expanded=true] .cva-ch{transform:rotate(180deg)}.cva-p{padding:0 16px 16px;border-top:1px solid rgba(11,61,92,.12)}.cva-s{font-size:13px;color:#4a5a66;margin:12px 0 0;line-height:1.45}" +
    ".cva form{margin-top:12px;display:grid;gap:10px}" +
    ".cva label{display:block;font-size:12px;font-weight:600;color:#4a5a66;margin-bottom:4px}" +
    ".cva input{box-sizing:border-box;width:100%;min-height:44px;padding:10px 12px;border:1px solid #d9ddd6;border-radius:10px;background:#fff;font:inherit;font-size:16px;color:#16242e}" +
    ".cva .cva-r{display:grid;grid-template-columns:1fr 1fr;gap:10px}" +
    ".cva button[type=submit]{min-height:46px;border:0;border-radius:999px;background:#D6336C;color:#fff;font:inherit;font-weight:700;font-size:15px;cursor:pointer}" +
    ".cva button[disabled]{opacity:.6;cursor:default}" +
    ".cva .cva-m{font-size:13px;margin:0;line-height:1.4}.cva .cva-ok{color:#177268;font-weight:600}.cva .cva-err{color:#b3261e}" +
    ".cva .cva-hp{position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden}";
  function ensureCss() {
    if (document.getElementById("cva-css")) return;
    var st = document.createElement("style"); st.id = "cva-css"; st.textContent = CSS; document.head.appendChild(st);
  }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function today() { var d = new Date(); return d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2); }

  function montar(el, opts) {
    if (!el || !opts || !opts.sb) return;
    ensureCss();
    var uid = "cva" + Math.random().toString(36).slice(2, 7);
    el.innerHTML = '<div class="cva"><button type="button" class="cva-t" aria-expanded="false" aria-controls="' + uid + 'p">🔔 Avísame si se libera<svg class="cva-ch" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg></button><div class="cva-p" id="' + uid + 'p" hidden>' +
      '<p class="cva-s">¿Tus fechas están ocupadas? Déjanos tu contacto y te avisamos si queda libre' + (opts.nombreCasa ? ' ' + esc(opts.nombreCasa) : ' alguna casa') + '. Sin compromiso.</p>' +
      '<form novalidate><div class="cva-r"><div><label for="' + uid + 'e">Entrada</label><input type="date" id="' + uid + 'e" name="e" min="' + today() + '"></div>' +
      '<div><label for="' + uid + 's">Salida</label><input type="date" id="' + uid + 's" name="s" min="' + today() + '"></div></div>' +
      '<div><label for="' + uid + 'n">Tu nombre</label><input type="text" id="' + uid + 'n" name="n" maxlength="80" autocomplete="name"></div>' +
      '<div><label for="' + uid + 'c">WhatsApp o email</label><input type="text" id="' + uid + 'c" name="c" maxlength="120" autocomplete="off" placeholder="+34 600 000 000 o tu@email.com"></div>' +
      '<div class="cva-hp"><label>No rellenar<input type="text" name="web" tabindex="-1" autocomplete="off"></label></div>' +
      '<button type="submit">Avisarme</button><p class="cva-m" role="status"></p></form></div></div>';
    var box = el.querySelector(".cva"), btn = box.querySelector(".cva-t"), form = box.querySelector("form"), pan = box.querySelector(".cva-p"), msg = box.querySelector(".cva-m");
    btn.addEventListener("click", function () {
      var open = pan.hidden; pan.hidden = !open; btn.setAttribute("aria-expanded", open ? "true" : "false");
      if (open && typeof opts.getFechas === "function") {
        var f = opts.getFechas() || {};
        if (f.entrada) form.e.value = f.entrada;
        if (f.salida) form.s.value = f.salida;
      }
    });
    form.addEventListener("submit", function (ev) {
      ev.preventDefault();
      msg.className = "cva-m"; msg.textContent = "";
      if (form.web.value) return;
      var e = form.e.value, s = form.s.value, n = form.n.value.trim(), c = form.c.value.trim();
      if (!e || !s || s <= e) { msg.className = "cva-m cva-err"; msg.textContent = "Elige una fecha de entrada y otra de salida posterior."; return; }
      if (!n) { msg.className = "cva-m cva-err"; msg.textContent = "Dinos tu nombre."; return; }
      var okMail = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(c), okTel = c.replace(/[^\d]/g, "").length >= 9;
      if (!okMail && !okTel) { msg.className = "cva-m cva-err"; msg.textContent = "Escribe un email o un teléfono válido."; return; }
      var f = (typeof opts.getFechas === "function" && opts.getFechas()) || {};
      var sub = form.querySelector("button[type=submit]"); sub.disabled = true;
      opts.sb.from("alertas_disponibilidad").insert({
        vivienda_id: opts.viviendaId || null, nombre: n, contacto: c, fecha_entrada: e, fecha_salida: s, personas: f.personas || null
      }).then(function (r) {
        if (r && r.error) { sub.disabled = false; msg.className = "cva-m cva-err"; msg.textContent = "No hemos podido guardar el aviso. Inténtalo de nuevo o escríbenos por WhatsApp."; return; }
        form.reset(); msg.className = "cva-m cva-ok"; msg.textContent = "¡Hecho! Te avisaremos si esas fechas quedan libres.";
        setTimeout(function () { sub.disabled = false; }, 4000);
      }, function () { sub.disabled = false; msg.className = "cva-m cva-err"; msg.textContent = "No hemos podido guardar el aviso. Inténtalo de nuevo."; });
    });
  }
  window.cvAlerta = { montar: montar };
})();
