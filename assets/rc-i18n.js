/* RotoClick Studio — lingue (italiano / Deutsch / English).
   Il tool e le pagine sono scritti in italiano. Questo strato osserva la pagina e
   sostituisce ogni testo italiano con la traduzione (dizionario in rc-lang-data.js),
   anche i messaggi che il tool genera mentre si lavora. Il codice del tool non cambia.
   - frasi esatte:   "Applica"                      → "Anwenden"
   - frasi con dati: "Modelli {0} {1} pronti."      → "Modelle {0} {1} fertig."
   - testi composti: tradotti frase per frase
   Gli elementi con translate="no" (nomi, codici, email) non vengono toccati. */
(function () {
  "use strict";
  const RC = (window.RC = window.RC || {});
  const LINGUE = [["it", "Italiano"], ["de", "Deutsch"], ["en", "English"]];
  const LOCALE = { it: "it-IT", de: "de-DE", en: "en-GB" };
  const KEY = "rc-lingua";

  /* --------------------------- scelta lingua --------------------------- */
  function iniziale() {
    try { const v = localStorage.getItem(KEY); if (v && LOCALE[v]) return v; } catch (e) {}
    const n = (navigator.language || "it").slice(0, 2).toLowerCase();
    return LOCALE[n] ? n : "it";
  }
  RC.lang = iniziale();
  RC.locale = () => LOCALE[RC.lang];
  const ascoltatori = [];
  RC.onLang = (cb) => ascoltatori.push(cb);

  /* ----------------------------- dizionario ----------------------------- */
  const norm = (s) => String(s).replace(/\s+/g, " ").trim();
  const ESATTE = { de: new Map(), en: new Map() };
  const MODELLI = { de: [], en: [] };
  const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  function carica(righe) {
    for (const r of righe) {
      const it = norm(r[0]);
      ["de", "en"].forEach((l, i) => {
        const tr = r[i + 1];
        if (tr == null || tr === "") return;
        if (/\{\d\}/.test(it)) {
          const ordine = [];
          const re = new RegExp("^" + escRe(it).replace(/\\\{(\d)\\\}/g, (_, n) => { ordine.push(+n); return "((?:(?! · ).)+?)"; }) + "$");   // un valore non attraversa " · "
          MODELLI[l].push({ re, ordine, tr, fissi: it.replace(/\{\d\}/g, "").length });
        } else ESATTE[l].set(it, tr);
      });
    }
    // prima i modelli con più testo fisso (più specifici)
    ["de", "en"].forEach((l) => MODELLI[l].sort((a, b) => b.fissi - a.fissi));
  }
  carica(window.RC_LANG_DATA || []);
  const IN_LINEA = (window.RC_LANG_INLINE || []).map((r) => ({ it: r[0], de: r[1], en: r[2] }));
  const PREFISSI = (window.RC_LANG_PREFIX || []).map((r) => ({ it: r[0], de: r[1], en: r[2] }));

  // valore variabile dentro una frase: traduzione esatta, altrimenti sostituzioni in linea (es. "+ IVA")
  function valore(v, l, prof) {
    const e = ESATTE[l].get(norm(v));
    if (e != null) return e;
    if ((prof || 0) < 3) { const r = unaFrase(norm(v), l, (prof || 0) + 1); if (r != null) return r; }
    let s = v;
    for (const r of IN_LINEA) if (s.indexOf(r.it) >= 0) s = s.split(r.it).join(r[l]);
    return s;
  }

  function unaFrase(t, l, prof) {
    const e = ESATTE[l].get(t);
    if (e != null) return e;
    for (const m of MODELLI[l]) {
      const x = m.re.exec(t);
      if (!x) continue;
      const val = {}; m.ordine.forEach((n, i) => { val[n] = valore(x[i + 1], l, prof); });
      return m.tr.replace(/\{(\d)\}/g, (_, n) => (val[n] != null ? val[n] : ""));
    }
    return null;
  }

  // traduzione di una stringa italiana (null = nessuna traduzione trovata)
  function trad(testo, l, soloEsatte, livello) {
    const t = norm(testo);
    if (!t) return null;
    if (soloEsatte) { const e = ESATTE[l].get(t); return e != null ? e : null; }
    let r = unaFrase(t, l);
    if (r != null) return r;
    // punto finale aggiunto dal codice (es. elenco di note + ".")
    if (/[^.]\.$/.test(t)) { r = unaFrase(t.slice(0, -1), l); if (r != null) return r.replace(/[.]?$/, "."); }
    livello = livello || 0;
    if (livello > 2) return null;
    // testo composto: frase per frase, poi elementi separati da " · "
    for (const sep of [/(?<=[.:!?…])\s+(?=[A-ZÀ-Ü«“(0-9+−-])/, / · /]) {
      const parti = t.split(sep);
      if (parti.length < 2) continue;
      let ok = false;
      const out = parti.map((p) => { const x = trad(p, l, false, livello + 1); if (x != null) { ok = true; return x; } return p; });
      if (ok) return out.join(sep.source === " · " ? " · " : " ");
    }
    // nota con prefisso ("Sup: …", "Inf: …"): si traduce il resto
    for (const pf of PREFISSI) if (t.startsWith(pf.it)) { const x = trad(t.slice(pf.it.length), l, false, livello + 1); if (x != null) return pf[l] + x; }
    return null;
  }

  // per i testi creati dal codice (alert, confirm, valori calcolati)
  RC.t = function (testo, ...val) {
    let s = RC.lang === "it" ? null : trad(testo, RC.lang, false);
    if (s == null) s = testo;
    return val.length ? s.replace(/\{(\d)\}/g, (_, n) => (val[n] != null ? val[n] : "")) : s;
  };

  /* ------------------------- traduzione della pagina ------------------------- */
  const ORIG = new WeakMap();          // nodo di testo → { orig, mostrato }
  const ORIG_ATTR = new WeakMap();     // elemento → { attr: { orig, mostrato } }
  const ATTRS = ["title", "placeholder", "aria-label", "alt"];
  const SALTA = new Set(["SCRIPT", "STYLE", "TEXTAREA", "CODE", "NOSCRIPT"]);
  const lettere = /[A-Za-zÀ-ÿ]{2}/;
  RC.mancanti = new Set();             // testi italiani senza traduzione (per controllo)

  function escluso(el) {
    for (let e = el; e && e.nodeType === 1; e = e.parentElement) {
      if (SALTA.has(e.tagName)) return true;
      if (e.getAttribute("translate") === "no") return true;
      if (e.isContentEditable) return true;
    }
    return false;
  }
  // nella riga del file caricato il tool rilegge il proprio testo: solo frasi esatte
  const soloEsatte = (el) => !!(el && el.closest && el.closest(".fn"));

  function nodoTesto(n) {
    const p = n.parentElement;
    if (!p || escluso(p)) return;
    if (p.classList && p.classList.contains("brand")) return;   // nome del prodotto
    let st = ORIG.get(n);
    if (!st || n.data !== st.mostrato) { st = { orig: n.data, mostrato: n.data }; ORIG.set(n, st); }
    const orig = st.orig;
    let nuovo = orig;
    if (RC.lang !== "it" && lettere.test(orig)) {
      const r = trad(orig, RC.lang, soloEsatte(p));
      if (r != null) {
        const m = orig.match(/^(\s*)[\s\S]*?(\s*)$/);
        nuovo = m[1] + r + m[2];
      } else if (orig.trim().length > 1) RC.mancanti.add(norm(orig));
    }
    if (n.data !== nuovo) { st.mostrato = nuovo; n.data = nuovo; } else st.mostrato = n.data;
  }

  function attributi(el) {
    if (escluso(el)) return;
    let mappa = ORIG_ATTR.get(el);
    for (const a of ATTRS) {
      if (!el.hasAttribute(a)) continue;
      const v = el.getAttribute(a);
      if (!mappa) { mappa = {}; ORIG_ATTR.set(el, mappa); }
      let st = mappa[a];
      if (!st || v !== st.mostrato) st = mappa[a] = { orig: v, mostrato: v };
      let nuovo = st.orig;
      if (RC.lang !== "it" && lettere.test(st.orig)) {
        const r = trad(st.orig, RC.lang, false);
        if (r != null) nuovo = r; else RC.mancanti.add(norm(st.orig));
      }
      if (v !== nuovo) { st.mostrato = nuovo; el.setAttribute(a, nuovo); }
    }
  }

  function albero(radice) {
    if (!radice) return;
    if (radice.nodeType === 3) return nodoTesto(radice);
    if (radice.nodeType !== 1 || SALTA.has(radice.tagName)) return;
    attributi(radice);
    const w = document.createTreeWalker(radice, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, {
      acceptNode: (n) => (n.nodeType === 1 && SALTA.has(n.tagName) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
    });
    let n; while ((n = w.nextNode())) { if (n.nodeType === 3) nodoTesto(n); else attributi(n); }
  }

  let titoloOrig = null;
  function titolo() {
    if (titoloOrig == null || (document.title !== titoloOrig && document.title !== RC._titoloMostrato)) titoloOrig = document.title;
    const t = RC.lang === "it" ? titoloOrig : trad(titoloOrig, RC.lang, false) || titoloOrig;
    RC._titoloMostrato = t; if (document.title !== t) document.title = t;
  }

  let osservatore = null;
  function osserva() {
    if (osservatore) return;
    osservatore = new MutationObserver((lista) => {
      osservatore.disconnect();
      try {
        for (const m of lista) {
          if (m.type === "characterData") nodoTesto(m.target);
          else if (m.type === "attributes") attributi(m.target);
          else m.addedNodes.forEach(albero);
        }
      } finally { avvia(); }
    });
    const avvia = () => osservatore.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });
    avvia();
  }

  RC.traduciPagina = function () {
    document.documentElement.lang = RC.lang;
    if (osservatore) osservatore.disconnect();
    albero(document.body); titolo();
    if (osservatore) osservatore.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });
  };

  RC.setLang = function (l) {
    if (!LOCALE[l] || l === RC.lang) return;
    RC.lang = l;
    try { localStorage.setItem(KEY, l); } catch (e) {}
    RC.traduciPagina();
    document.querySelectorAll("select.rc-lang").forEach((s) => { s.value = l; });
    ascoltatori.forEach((cb) => { try { cb(l); } catch (e) { console.error(e); } });
  };

  // tendina della lingua
  RC.tendinaLingua = function () {
    const s = document.createElement("select");
    s.className = "rc-lang";
    s.setAttribute("aria-label", "Lingua");
    s.setAttribute("translate", "no");
    s.innerHTML = LINGUE.map(([k, t]) => `<option value="${k}"${k === RC.lang ? " selected" : ""}>${t}</option>`).join("");
    s.addEventListener("change", () => RC.setLang(s.value));
    return s;
  };

  function avvio() { RC.traduciPagina(); osserva(); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", avvio); else avvio();
})();
