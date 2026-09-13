/* Psicologia no Sofá — shared app layer: Supabase client, session, account chip, helpers.
   Requires: supabase-js v2 (UMD) and assets/pns-config.js loaded before this file. */
(function (global) {
  "use strict";
  var cfg = global.PNS_CONFIG;
  if (!global.supabase) { console.warn("supabase-js não carregou"); return; }
  var sb = global.supabase.createClient(cfg.supabaseUrl, cfg.supabaseKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  });

  var MONTHS = ["janeiro","fevereiro","março","abril","maio","junho","julho","agosto","setembro","outubro","novembro","dezembro"];
  function longDate(iso) { var p = String(iso).slice(0, 10).split("-"); return parseInt(p[2], 10) + " de " + MONTHS[parseInt(p[1], 10) - 1] + " de " + p[0]; }
  function shortDate(iso) { var p = String(iso).slice(0, 10).split("-"); return parseInt(p[2], 10) + " " + MONTHS[parseInt(p[1], 10) - 1].slice(0, 3) + " " + p[0]; }
  function fmtTime(s) { s = Math.max(0, Math.floor(s || 0)); var h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60;
    return (h ? h + ":" + String(m).padStart(2, "0") : m) + ":" + String(x).padStart(2, "0"); }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function qs(k) { return new URLSearchParams(location.search).get(k); }

  function getSession() { return sb.auth.getSession().then(function (r) { return r.data.session; }); }
  function getProfile() {
    return sb.from("profiles").select("id, full_name").maybeSingle().then(function (r) { return r.data; });
  }
  function requireAuth() {
    return getSession().then(function (s) {
      if (!s) { location.replace("entrar.html?next=" + encodeURIComponent(location.pathname.split("/").pop() + location.search)); throw new Error("redirect"); }
      return s;
    });
  }
  function signOut() { return sb.auth.signOut().then(function () { location.href = "index.html"; }); }

  /* account control in the platform navigation (#nav-account) */
  function mountAccount() {
    var slot = document.getElementById("nav-account"); if (!slot) return;
    function render(session) {
      if (session) {
        var email = session.user.email || "";
        slot.innerHTML = '<a class="btn btn-primary btn-sm" href="minha-conta.html" title="' + esc(email) + '">Minha conta</a>' +
          '<button type="button" class="chip" data-signout>Sair</button>';
        slot.querySelector("[data-signout]").addEventListener("click", signOut);
      } else {
        slot.innerHTML = '<a class="btn btn-primary btn-sm" href="entrar.html">Entrar</a>';
      }
    }
    getSession().then(render);
    sb.auth.onAuthStateChange(function (_e, session) { render(session); });
  }
  document.addEventListener("DOMContentLoaded", mountAccount);

  global.PNS = { sb: sb, longDate: longDate, shortDate: shortDate, fmtTime: fmtTime, esc: esc, qs: qs,
                 getSession: getSession, getProfile: getProfile, requireAuth: requireAuth, signOut: signOut };
})(window);
