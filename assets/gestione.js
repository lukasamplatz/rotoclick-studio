/* RotoClick Studio — back-end per Dentag (admin) e rivenditori */
(function () {
  "use strict";
  const RC = window.RC, esc = RC.esc, euro = RC.euro;
  const main = document.getElementById("main"), tabsEl = document.getElementById("tabs"), userEl = document.getElementById("user");
  let P = null;                 // mio_profilo()
  let tab = null;
  let mese = null;              // mese selezionato (YYYY-MM-01)
  let cacheRiv = null;

  const SEZIONI = {
    admin:       [["riepilogo", "Riepilogo mese"], ["rivenditori", "Rivenditori"], ["laboratori", "Laboratori"], ["codici", "Codici kit"], ["export", "Export"], ["accessi", "Accessi"], ["impostazioni", "Impostazioni"]],
    rivenditore: [["riepilogo", "Riepilogo mese"], ["laboratori", "Clienti"], ["codici", "Codici kit"], ["export", "Export"]],
  };
  const isAdmin = () => P && P.ruolo === "admin";

  /* ----------------------------- utilità ----------------------------- */
  function mesi() {
    const [y, m] = P.mese_corrente.split("-").map(Number); const out = [];
    for (let k = 0; k < 24; k++) { const d = new Date(y, m - 1 - k, 1); out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`); }
    return out;
  }
  const selMese = () => `<select class="rc-in" data-mese aria-label="Mese">${mesi().map((x) => `<option value="${x}"${x === mese ? " selected" : ""}>${esc(RC.nomeMese(x))}</option>`).join("")}</select>`;
  const legaMese = (fn) => { const s = main.querySelector("[data-mese]"); if (s) s.addEventListener("change", () => { mese = s.value; fn(); }); };
  const n = (v) => Number(v || 0);
  const tag = (t, c) => `<span class="rc-tag ${c || ""}">${esc(t)}</span>`;
  const vuoto = (t) => `<div class="g-tw"><div class="g-empty">${esc(t)}</div></div>`;
  const erroreMain = (e) => { main.insertAdjacentHTML("afterbegin", `<div class="rc-msg bad">${esc(e.message || e)}</div>`); };
  async function rivenditori() { if (!cacheRiv) cacheRiv = (await RC.call("admin_rivenditori")).righe; return cacheRiv; }
  const optRiv = (lista, sel, vuotoTxt) => (vuotoTxt != null ? `<option value="">${esc(vuotoTxt)}</option>` : "") +
    lista.filter((r) => r.attivo).map((r) => `<option value="${r.id}"${r.id === sel ? " selected" : ""}>${esc(r.nome)}</option>`).join("");
  const filtra = (input, tbody) => input.addEventListener("input", () => {
    const q = input.value.trim().toLowerCase();
    tbody.querySelectorAll("tr").forEach((tr) => { tr.hidden = q && !tr.textContent.toLowerCase().includes(q); });
  });

  /* ------------------------------ accesso ------------------------------ */
  function login(msg) {
    tabsEl.innerHTML = ""; userEl.innerHTML = "";
    main.innerHTML = `<div class="g-login g-card">
      <h1>Accesso gestione</h1><p class="g-lead">Per Dentag e i rivenditori abilitati.</p>
      <form class="rc-form" novalidate id="fl">
        <label>Email<input class="rc-in" type="email" name="email" autocomplete="email" required></label>
        <label>Password<input class="rc-in" type="password" name="pw" autocomplete="current-password" required></label>
        <div class="rc-msg ${msg ? "warn" : ""}">${esc(msg || "")}</div>
        <button class="rc-b pri" type="submit">Accedi</button>
      </form>
      <p class="rc-small" style="margin-top:12px"><button class="rc-link" type="button" data-v="primo">Primo accesso</button> (hai ricevuto l'abilitazione da Dentag)
      · <button class="rc-link" type="button" data-v="reset">Password dimenticata?</button></p></div>`;
    const f = main.querySelector("#fl"), box = { msg: (t, c) => { const m = f.querySelector(".rc-msg"); m.className = "rc-msg " + (c || ""); m.textContent = t || ""; } };
    f.addEventListener("submit", (e) => { e.preventDefault(); RC.busy(f.querySelector("button"), box, async () => { await RC.auth.signIn(f.email.value, f.pw.value); await avvio(); }); });
    main.querySelector('[data-v="primo"]').addEventListener("click", primoAccesso);
    main.querySelector('[data-v="reset"]').addEventListener("click", () => {
      const m = RC.modal(`<h2>Recupera la password</h2><form class="rc-form" novalidate><label>Email<input class="rc-in" type="email" name="email" value="${esc(f.email.value)}"></label>
        <div class="rc-msg"></div><button class="rc-b pri" type="submit">Invia link</button></form>`);
      const g = m.el.querySelector("form");
      g.addEventListener("submit", (e) => { e.preventDefault(); RC.busy(g.querySelector("button"), m, async () => { await RC.auth.resetPassword(g.email.value.trim()); m.msg("Se l'email è registrata riceverai il link a breve.", "ok"); }); });
    });
  }

  function primoAccesso() {
    const m = RC.modal(`<h2>Primo accesso</h2><p class="rc-muted">Usa l'email che Dentag ha abilitato e scegli una password.</p>
      <form class="rc-form" novalidate><label>Email<input class="rc-in" type="email" name="email" autocomplete="email"></label>
      <label>Password (min. 8 caratteri)<input class="rc-in" type="password" name="pw" autocomplete="new-password"></label>
      <div class="rc-msg"></div><button class="rc-b pri" type="submit">Crea accesso</button></form>`);
    const f = m.el.querySelector("form");
    f.addEventListener("submit", (e) => { e.preventDefault();
      if (f.pw.value.length < 8) return m.msg("Almeno 8 caratteri.", "bad");
      RC.busy(f.querySelector("button"), m, async () => {
        const r = await RC.auth.signUp(f.email.value.trim(), f.pw.value, {});
        if (r.confermaEmail) return m.msg("Ti abbiamo inviato un'email: apri il link per confermare, poi accedi.", "ok");
        m.close(); await avvio();
      });
    });
  }

  function nuovaPassword() {
    const m = RC.modal(`<h2>Nuova password</h2><form class="rc-form" novalidate><label>Password (min. 8 caratteri)<input class="rc-in" type="password" name="pw" autocomplete="new-password"></label>
      <div class="rc-msg"></div><button class="rc-b pri" type="submit">Salva</button></form>`, { noClose: true });
    const f = m.el.querySelector("form");
    f.addEventListener("submit", (e) => { e.preventDefault(); if (f.pw.value.length < 8) return m.msg("Almeno 8 caratteri.", "bad");
      RC.busy(f.querySelector("button"), m, async () => { await RC.auth.updatePassword(f.pw.value); m.close(); avvio(); }); });
  }

  async function avvio() {
    await RC.ready;
    const u = await RC.auth.user();
    if (!u) return login();
    try { P = await RC.call("mio_profilo"); } catch (e) { return login(e.message); }
    if (!SEZIONI[P.ruolo]) {
      tabsEl.innerHTML = "";
      userEl.innerHTML = `<button class="rc-b sm" type="button" data-esci>Esci</button>`;
      userEl.querySelector("[data-esci]").addEventListener("click", esci);
      main.innerHTML = `<div class="g-login g-card"><h1>Area non disponibile</h1>
        <p>${P.ruolo === "laboratorio" ? "Questo è un account laboratorio: usa il tool." : "Questo accesso è stato disabilitato. Contatta Dentag."}</p>
        <p><a class="rc-b pri" href="../">Apri RotoClick Studio</a></p></div>`;
      return;
    }
    mese = P.mese_corrente; cacheRiv = null;
    const ruoloTxt = { admin: "Dentag · admin", rivenditore: P.rivenditore ? P.rivenditore.nome : "Rivenditore" }[P.ruolo];
    userEl.innerHTML = `<span class="rc-muted">${esc(P.nome || P.email)}</span>${tag(ruoloTxt)}<a class="rc-b sm" href="../">Tool</a><button class="rc-b sm" type="button" data-esci>Esci</button>`;
    userEl.querySelector("[data-esci]").addEventListener("click", esci);
    tabsEl.innerHTML = SEZIONI[P.ruolo].map(([k, t]) => `<button type="button" data-tab="${k}">${esc(t)}</button>`).join("");
    tabsEl.querySelectorAll("[data-tab]").forEach((b) => b.addEventListener("click", () => vai(b.dataset.tab)));
    const h = location.hash.slice(1);
    vai(SEZIONI[P.ruolo].some(([k]) => k === h) ? h : "riepilogo");
  }
  async function esci() { await RC.auth.signOut(); P = null; login(); }

  function vai(k) {
    tab = k; history.replaceState(null, "", "#" + k);
    tabsEl.querySelectorAll("[data-tab]").forEach((b) => b.toggleAttribute("aria-current", b.dataset.tab === k));
    if (tabsEl.querySelector(`[data-tab="${k}"]`)) tabsEl.querySelector(`[data-tab="${k}"]`).setAttribute("aria-current", "page");
    main.innerHTML = `<p class="rc-muted">Caricamento…</p>`;
    ({ riepilogo, rivenditori: vistaRivenditori, laboratori: vistaLaboratori, codici: vistaCodici, export: vistaExport, accessi: vistaAccessi, impostazioni: vistaImpostazioni })[k]()
      .catch((e) => { main.innerHTML = ""; erroreMain(e); });
  }

  /* ---------------------------- riepilogo ---------------------------- */
  async function riepilogo(rivSel) {
    if (isAdmin() && !rivSel) return riepilogoAdmin();
    const r = await RC.call("riepilogo_laboratori", { p_mese: mese, p_rivenditore: rivSel || null });
    const dentag = r.rivenditore && r.rivenditore.is_dentag;
    const T = r.righe.reduce((a, x) => ({ p: a.p + n(x.casi_pagati), g: a.g + n(x.casi_gratuiti), c: a.c + n(x.totale_cliente), q: a.q + n(x.quota_rivenditore), d: a.d + n(x.quota_dentag) }), { p: 0, g: 0, c: 0, q: 0, d: 0 });
    const mostraQuote = !dentag;
    main.innerHTML = `
      ${isAdmin() ? `<p><button class="rc-link" type="button" data-back>← Tutti i rivenditori</button></p>` : ""}
      <h1>Riepilogo ${esc(RC.nomeMese(mese))}${isAdmin() ? " · " + esc(r.rivenditore.nome) : ""}</h1>
      <p class="g-lead">${dentag ? "Clienti diretti: Dentag fattura a ogni laboratorio il totale indicato." :
        "Base per le fatture: a ogni laboratorio il totale indicato; Dentag ti fattura la colonna “Dovuto a Dentag”."} ${r.chiuso ? tag("mese chiuso", "ok") : ""}</p>
      <div class="g-bar">${selMese()}<span class="sp"></span>
        <button class="rc-b" type="button" data-csv>Scarica riepilogo (CSV)</button>
        <button class="rc-b" type="button" data-csvd>Scarica dettaglio export (CSV)</button></div>
      <div class="g-kpis">
        <div class="g-kpi"><span>Export a pagamento</span><b>${T.p}</b></div>
        <div class="g-kpi"><span>Casi inclusi usati</span><b>${T.g}</b></div>
        <div class="g-kpi"><span>Totale da fatturare ai clienti</span><b>${euro(T.c)}</b></div>
        ${mostraQuote ? `<div class="g-kpi"><span>Tua quota</span><b>${euro(T.q)}</b></div><div class="g-kpi"><span>Dovuto a Dentag</span><b>${euro(T.d)}</b></div>` : ""}
      </div>
      ${r.righe.length ? `<div class="g-tw"><table class="rc-tbl"><thead><tr><th>Laboratorio</th><th>P.IVA</th><th class="n">Inclusi</th><th class="n">A pagamento</th><th class="n">Totale cliente</th>${mostraQuote ? '<th class="n">Tua quota</th><th class="n">Dovuto a Dentag</th>' : ""}</tr></thead><tbody>
        ${r.righe.map((x) => `<tr><td>${esc(x.laboratorio)}</td><td>${esc(x.piva || "")}</td><td class="n">${x.casi_gratuiti}</td><td class="n">${x.casi_pagati}</td><td class="n">${euro(x.totale_cliente)}</td>${mostraQuote ? `<td class="n">${euro(x.quota_rivenditore)}</td><td class="n">${euro(x.quota_dentag)}</td>` : ""}</tr>`).join("")}
        <tr class="tot"><td>Totale</td><td></td><td class="n">${T.g}</td><td class="n">${T.p}</td><td class="n">${euro(T.c)}</td>${mostraQuote ? `<td class="n">${euro(T.q)}</td><td class="n">${euro(T.d)}</td>` : ""}</tr>
        </tbody></table></div>` : vuoto("Nessun export in questo mese.")}`;
    legaMese(() => riepilogo(rivSel));
    const back = main.querySelector("[data-back]"); if (back) back.addEventListener("click", () => riepilogoAdmin());
    const nomeFile = (s) => `rotoclick-${s}-${mese.slice(0, 7)}${isAdmin() ? "-" + r.rivenditore.nome.replace(/[^\w]+/g, "_") : ""}.csv`;
    main.querySelector("[data-csv]").addEventListener("click", () => RC.csv(nomeFile("riepilogo"), [
      ["Mese", "Laboratorio", "P.IVA", "Email", "Casi inclusi", "Casi a pagamento", "Totale cliente", "Quota rivenditore", "Dovuto a Dentag"],
      ...r.righe.map((x) => [mese.slice(0, 7), x.laboratorio, x.piva, x.email, x.casi_gratuiti, x.casi_pagati, n(x.totale_cliente).toFixed(2).replace(".", ","), n(x.quota_rivenditore).toFixed(2).replace(".", ","), n(x.quota_dentag).toFixed(2).replace(".", ",")])]));
    main.querySelector("[data-csvd]").addEventListener("click", async () => {
      const d = await RC.call("lista_export", { p_mese: mese, p_rivenditore: rivSel || null });
      RC.csv(nomeFile("export"), [["Data e ora", "Laboratorio", "P.IVA", "Rivenditore", "Tipo", "Incluso", "Prezzo", "Stornato"],
        ...d.righe.map((x) => [RC.dataOra(x.confermato_il), x.laboratorio, x.piva, x.rivenditore, x.tipo, x.gratuito ? "sì" : "no", n(x.prezzo).toFixed(2).replace(".", ","), x.stornato ? "sì" : ""])]);
    });
  }

  async function riepilogoAdmin() {
    const r = await RC.call("riepilogo_rivenditori", { p_mese: mese });
    const T = r.righe.reduce((a, x) => ({ p: a.p + n(x.casi_pagati), c: a.c + n(x.totale_clienti), d: a.d + n(x.da_fatturare), dir: a.dir + (x.is_dentag ? n(x.totale_clienti) : 0) }), { p: 0, c: 0, d: 0, dir: 0 });
    const passato = mese < P.mese_corrente;
    main.innerHTML = `<h1>Riepilogo ${esc(RC.nomeMese(mese))}</h1>
      <p class="g-lead">Quanto fatturare a ogni rivenditore (la quota Dentag di ogni export a pagamento) e ai clienti diretti. Clicca una riga per il dettaglio per laboratorio. ${r.chiuso ? tag("mese chiuso", "ok") : ""}</p>
      <div class="g-bar">${selMese()}<span class="sp"></span>
        ${passato && !r.chiuso ? `<button class="rc-b" type="button" data-chiudi>Chiudi il mese</button>` : ""}
        <button class="rc-b" type="button" data-csv>Scarica (CSV)</button></div>
      <div class="g-kpis">
        <div class="g-kpi"><span>Export a pagamento</span><b>${T.p}</b></div>
        <div class="g-kpi"><span>Da fatturare ai rivenditori</span><b>${euro(T.d)}</b></div>
        <div class="g-kpi"><span>Da fatturare ai clienti diretti</span><b>${euro(T.dir)}</b></div>
        <div class="g-kpi"><span>Incasso Dentag</span><b>${euro(T.d + T.dir)}</b></div>
      </div>
      ${r.righe.length ? `<div class="g-tw"><table class="rc-tbl"><thead><tr><th>Rivenditore</th><th class="n">Laboratori</th><th class="n">Inclusi</th><th class="n">A pagamento</th><th class="n">Totale clienti</th><th class="n">Quota rivenditore</th><th class="n">Da fatturare al rivenditore</th></tr></thead><tbody>
        ${r.righe.map((x) => `<tr class="click" data-riv="${x.rivenditore_id}"><td>${esc(x.rivenditore)} ${x.is_dentag ? tag("clienti diretti") : ""}</td><td class="n">${x.laboratori}</td><td class="n">${x.casi_gratuiti}</td><td class="n">${x.casi_pagati}</td><td class="n">${euro(x.totale_clienti)}</td><td class="n">${x.is_dentag ? "—" : euro(x.quota_rivenditore)}</td><td class="n">${x.is_dentag ? "fattura ai clienti" : euro(x.da_fatturare)}</td></tr>`).join("")}
        </tbody></table></div>` : vuoto("Nessun export in questo mese.")}`;
    legaMese(riepilogoAdmin);
    main.querySelectorAll("[data-riv]").forEach((tr) => tr.addEventListener("click", () => riepilogo(tr.dataset.riv)));
    main.querySelector("[data-csv]").addEventListener("click", () => RC.csv(`rotoclick-rivenditori-${mese.slice(0, 7)}.csv`, [
      ["Mese", "Rivenditore", "P.IVA", "Laboratori", "Casi inclusi", "Casi a pagamento", "Totale clienti", "Quota rivenditore", "Da fatturare al rivenditore"],
      ...r.righe.map((x) => [mese.slice(0, 7), x.rivenditore, x.piva, x.laboratori, x.casi_gratuiti, x.casi_pagati, n(x.totale_clienti).toFixed(2).replace(".", ","), n(x.quota_rivenditore).toFixed(2).replace(".", ","), n(x.da_fatturare).toFixed(2).replace(".", ",")])]));
    const ch = main.querySelector("[data-chiudi]");
    if (ch) ch.addEventListener("click", async () => {
      if (!confirm(`Chiudere ${RC.nomeMese(mese)}? Dopo la chiusura non si possono più stornare export di quel mese.`)) return;
      try { await RC.call("admin_chiudi_mese", { p_mese: mese }); riepilogoAdmin(); } catch (e) { alert(e.message); }
    });
  }

  /* ---------------------------- rivenditori ---------------------------- */
  async function vistaRivenditori() {
    cacheRiv = null; const lista = await rivenditori();
    main.innerHTML = `<h1>Rivenditori</h1><p class="g-lead">I rivenditori abilitati ricevono codici kit e fatturano 2 € a caso ai propri clienti. Disattivando un rivenditore i suoi codici non usati vengono revocati e i suoi laboratori passano a Dentag.</p>
      <div class="g-bar"><input class="rc-in" type="search" placeholder="Cerca…" data-q><span class="sp"></span><button class="rc-b pri" type="button" data-nuovo>Nuovo rivenditore</button></div>
      <div class="g-tw"><table class="rc-tbl"><thead><tr><th>Nome</th><th>P.IVA</th><th>Email</th><th>Paese</th><th class="n">Laboratori</th><th class="n">Codici liberi</th><th class="n">Codici usati</th><th class="n">Accessi</th><th>Stato</th><th></th></tr></thead><tbody>
      ${lista.map((r) => `<tr><td>${esc(r.nome)} ${r.is_dentag ? tag("Dentag") : ""}</td><td>${esc(r.piva || "")}</td><td>${esc(r.email || "")}</td><td>${esc(r.paese || "")}</td>
        <td class="n">${r.laboratori}</td><td class="n">${r.codici_disponibili}</td><td class="n">${r.codici_usati}</td><td class="n">${r.utenti}</td>
        <td>${r.attivo ? tag("attivo", "ok") : tag("disattivato", "bad")}</td>
        <td><div class="rc-row"><button class="rc-b sm" type="button" data-mod="${r.id}">Modifica</button>
          ${r.is_dentag ? "" : `<button class="rc-b sm ${r.attivo ? "bad" : ""}" type="button" data-att="${r.id}" data-v="${r.attivo ? 0 : 1}">${r.attivo ? "Disattiva" : "Riattiva"}</button>`}</div></td></tr>`).join("")}
      </tbody></table></div>`;
    filtra(main.querySelector("[data-q]"), main.querySelector("tbody"));
    main.querySelector("[data-nuovo]").addEventListener("click", () => formRivenditore(null));
    main.querySelectorAll("[data-mod]").forEach((b) => b.addEventListener("click", () => formRivenditore(lista.find((r) => r.id === b.dataset.mod))));
    main.querySelectorAll("[data-att]").forEach((b) => b.addEventListener("click", async () => {
      const r = lista.find((x) => x.id === b.dataset.att), on = b.dataset.v === "1";
      if (!on && !confirm(`Disattivare ${r.nome}?\n\n• ${r.codici_disponibili} codici non usati verranno revocati\n• ${r.laboratori} laboratori passeranno a Dentag\n• gli export già fatti restano a suo carico`)) return;
      try { const x = await RC.call("admin_stato_rivenditore", { p_id: r.id, p_attivo: on });
        if (!on) alert(`${x.codici_revocati} codici revocati, ${x.laboratori_spostati} laboratori spostati a Dentag.`);
        vistaRivenditori(); } catch (e) { alert(e.message); }
    }));
  }

  function formRivenditore(r) {
    r = r || {};
    const m = RC.modal(`<h2>${r.id ? "Modifica rivenditore" : "Nuovo rivenditore"}</h2><form class="rc-form" novalidate>
      <label>Ragione sociale<input class="rc-in" name="nome" value="${esc(r.nome || "")}"></label>
      <label>P.IVA / UID<input class="rc-in" name="piva" value="${esc(r.piva || "")}"></label>
      <label>Email amministrativa<input class="rc-in" type="email" name="email" value="${esc(r.email || "")}"></label>
      <label>Paese<input class="rc-in" name="paese" value="${esc(r.paese || "IT")}" maxlength="2"></label>
      <label>Note<input class="rc-in" name="note" value="${esc(r.note || "")}"></label>
      <div class="rc-msg"></div><button class="rc-b pri" type="submit">Salva</button></form>
      ${r.id ? "" : `<p class="rc-small rc-muted">Poi, in “Accessi”, abilita l'email della persona che userà il back-end.</p>`}`);
    const f = m.el.querySelector("form");
    f.addEventListener("submit", (e) => { e.preventDefault(); RC.busy(f.querySelector("button"), m, async () => {
      await RC.call("admin_salva_rivenditore", { p_id: r.id || null, p_nome: f.nome.value, p_piva: f.piva.value, p_email: f.email.value, p_paese: f.paese.value.toUpperCase(), p_note: f.note.value });
      m.close(); cacheRiv = null; vistaRivenditori();
    }); });
  }

  /* ---------------------------- laboratori ---------------------------- */
  async function vistaLaboratori() {
    const lista = (await RC.call("lista_laboratori", {})).righe;
    const puoBloccare = P.ruolo === "admin" || P.ruolo === "rivenditore";
    const nuovi = lista.filter((l) => l.nuovo).length;
    main.innerHTML = `<h1>${isAdmin() ? "Laboratori" : "Clienti"}</h1>
      <p class="g-lead">${isAdmin() ? "Tutti i laboratori registrati. Quelli senza rivenditore non hanno ancora inserito un codice kit." : "I laboratori collegati a te tramite il codice del kit."}${nuovi ? " " + tag(nuovi + " nuovi negli ultimi 14 giorni", "ok") : ""}</p>
      <div class="g-bar"><input class="rc-in" type="search" placeholder="Cerca laboratorio, P.IVA, email…" data-q><span class="sp"></span><button class="rc-b" type="button" data-csv>Scarica (CSV)</button></div>
      ${lista.length ? `<div class="g-tw"><table class="rc-tbl"><thead><tr><th>Laboratorio</th><th>P.IVA</th><th>Email</th>${isAdmin() ? "<th>Rivenditore</th>" : ""}<th>Collegato il</th><th class="n">Kit</th><th class="n">Inclusi rimasti</th><th class="n">A pagamento (mese)</th><th>Stato</th>${puoBloccare ? "<th></th>" : ""}</tr></thead><tbody>
      ${lista.map((l) => `<tr><td>${esc(l.ragione_sociale)} ${l.nuovo ? tag("nuovo", "ok") : ""}</td><td>${esc(l.piva || "")}</td><td>${esc(l.email)}</td>
        ${isAdmin() ? `<td>${l.rivenditore ? esc(l.rivenditore) : tag("senza codice", "warn")}</td>` : ""}
        <td>${RC.data(l.collegato_il)}</td><td class="n">${l.kit}</td><td class="n">${l.casi_gratuiti}</td><td class="n">${l.pagati_mese}</td>
        <td>${l.bloccato ? tag("export bloccato", "bad") : l.rivenditore_id ? tag("attivo", "ok") : tag("demo", "warn")}</td>
        ${puoBloccare ? `<td><div class="rc-row">${l.rivenditore_id || isAdmin() ? `<button class="rc-b sm ${l.bloccato ? "" : "bad"}" type="button" data-blk="${l.id}" data-v="${l.bloccato ? 0 : 1}">${l.bloccato ? "Sblocca" : "Blocca"}</button>` : ""}
          ${isAdmin() ? `<button class="rc-b sm" type="button" data-sposta="${l.id}">Sposta</button>` : ""}</div></td>` : ""}</tr>`).join("")}
      </tbody></table></div>` : vuoto("Nessun laboratorio ancora.")}`;
    const q = main.querySelector("[data-q]"), tb = main.querySelector("tbody"); if (tb) filtra(q, tb);
    main.querySelector("[data-csv]").addEventListener("click", () => RC.csv("rotoclick-laboratori.csv", [
      ["Laboratorio", "P.IVA", "Email", "Rivenditore", "Registrato il", "Collegato il", "Kit", "Casi inclusi rimasti", "A pagamento mese", "A pagamento totale", "Bloccato"],
      ...lista.map((l) => [l.ragione_sociale, l.piva, l.email, l.rivenditore, RC.data(l.creato_il), RC.data(l.collegato_il), l.kit, l.casi_gratuiti, l.pagati_mese, l.pagati_totale, l.bloccato ? "sì" : ""])]));
    main.querySelectorAll("[data-blk]").forEach((b) => b.addEventListener("click", async () => {
      const l = lista.find((x) => x.id === b.dataset.blk), on = b.dataset.v === "1";
      if (on && !confirm(`Bloccare l'export per ${l.ragione_sociale}? Potrà ancora usare il tool ma non esportare.`)) return;
      try { await RC.call("blocca_laboratorio", { p_lab: l.id, p_bloccato: on }); vistaLaboratori(); } catch (e) { alert(e.message); }
    }));
    main.querySelectorAll("[data-sposta]").forEach((b) => b.addEventListener("click", () => spostaLab(lista.find((x) => x.id === b.dataset.sposta))));
  }

  async function spostaLab(l) {
    const riv = await rivenditori();
    const m = RC.modal(`<h2>Sposta ${esc(l.ragione_sociale)}</h2><p class="rc-muted">Gli export già fatti restano al rivenditore attuale; da ora in poi fattura il nuovo.</p>
      <form class="rc-form" novalidate><label>Rivenditore<select class="rc-in" name="riv">${optRiv(riv, l.rivenditore_id)}</select></label>
      <div class="rc-msg"></div><button class="rc-b pri" type="submit">Sposta</button></form>`);
    const f = m.el.querySelector("form");
    f.addEventListener("submit", (e) => { e.preventDefault(); RC.busy(f.querySelector("button"), m, async () => {
      await RC.call("admin_sposta_laboratorio", { p_lab: l.id, p_rivenditore: f.riv.value, p_agente: null }); m.close(); vistaLaboratori(); }); });
  }

  /* ------------------------------ codici ------------------------------ */
  async function vistaCodici() {
    const lista = (await RC.call("lista_codici", {})).righe;
    const cont = (s) => lista.filter((c) => c.stato === s).length;
    main.innerHTML = `<h1>Codici kit</h1>
      <p class="g-lead">${isAdmin() ? "Ogni kit K-Lab o K-Clinic ha un codice. Un codice funziona solo se è assegnato a un rivenditore attivo; il primo codice inserito da un laboratorio lo collega a quel rivenditore." : "I codici dei kit che ti sono stati assegnati. Quando un cliente inserisce il codice viene collegato a te."}</p>
      <div class="g-kpis"><div class="g-kpi"><span>Disponibili</span><b>${cont("disponibile")}</b></div><div class="g-kpi"><span>Usati</span><b>${cont("usato")}</b></div>${isAdmin() ? `<div class="g-kpi"><span>Revocati</span><b>${cont("revocato")}</b></div>` : ""}</div>
      ${isAdmin() ? `<div class="g-bar"><button class="rc-b pri" type="button" data-gen>Genera codici</button><button class="rc-b" type="button" data-imp>Importa codici esistenti</button>
        <span class="sp"></span><button class="rc-b" type="button" data-ass disabled>Assegna selezionati</button><button class="rc-b bad" type="button" data-rev disabled>Revoca selezionati</button></div>` : ""}
      <div class="g-bar"><input class="rc-in" type="search" placeholder="Cerca codice, lotto, laboratorio…" data-q>
        <select class="rc-in" data-st><option value="">Tutti gli stati</option><option value="disponibile">Disponibili</option><option value="usato">Usati</option>${isAdmin() ? '<option value="revocato">Revocati</option>' : ""}</select>
        <span class="sp"></span><button class="rc-b" type="button" data-csv>Scarica (CSV)</button></div>
      ${lista.length ? `<div class="g-tw"><table class="rc-tbl"><thead><tr>${isAdmin() ? '<th><input type="checkbox" data-all aria-label="Seleziona tutti"></th>' : ""}<th>Codice</th><th>Tipo</th><th>Lotto</th><th>Stato</th>${isAdmin() ? "<th>Rivenditore</th>" : ""}<th>Laboratorio</th><th>Usato il</th></tr></thead><tbody>
      ${lista.map((c) => `<tr data-st="${c.stato}">${isAdmin() ? `<td>${c.stato === "disponibile" ? `<input type="checkbox" data-c="${esc(c.codice)}" aria-label="Seleziona">` : ""}</td>` : ""}
        <td class="code">${esc(c.codice_stampato)}</td><td>${esc(c.tipo)}</td><td>${esc(c.lotto || "")}</td>
        <td>${c.stato === "disponibile" ? tag("disponibile") : c.stato === "usato" ? tag("usato", "ok") : tag("revocato", "bad")}</td>
        ${isAdmin() ? `<td>${c.rivenditore ? esc(c.rivenditore) : tag("non assegnato", "warn")}</td>` : ""}<td>${esc(c.laboratorio || "")}</td><td>${RC.data(c.usato_il)}</td></tr>`).join("")}
      </tbody></table></div>` : vuoto("Nessun codice.")}`;
    const q = main.querySelector("[data-q]"), st = main.querySelector("[data-st]"), tb = main.querySelector("tbody");
    const applica = () => { const t = q.value.trim().toLowerCase(); tb && tb.querySelectorAll("tr").forEach((tr) => { tr.hidden = (t && !tr.textContent.toLowerCase().includes(t)) || (st.value && tr.dataset.st !== st.value); }); };
    q.addEventListener("input", applica); st.addEventListener("change", applica);
    main.querySelector("[data-csv]").addEventListener("click", () => {
      const sel = lista.filter((c) => (!st.value || c.stato === st.value) && (!q.value.trim() || JSON.stringify(c).toLowerCase().includes(q.value.trim().toLowerCase())));
      RC.csv("rotoclick-codici.csv", [["Codice", "Tipo", "Lotto", "Stato", "Rivenditore", "Laboratorio", "Usato il", "Creato il"],
        ...sel.map((c) => [c.codice_stampato, c.tipo, c.lotto, c.stato, c.rivenditore, c.laboratorio, RC.data(c.usato_il), RC.data(c.creato_il)])]);
    });
    if (!isAdmin()) return;
    const selezionati = () => [...main.querySelectorAll("[data-c]:checked")].filter((x) => !x.closest("tr").hidden).map((x) => x.dataset.c);
    const agg = () => { const k = selezionati().length; main.querySelector("[data-ass]").disabled = main.querySelector("[data-rev]").disabled = !k;
      main.querySelector("[data-ass]").textContent = k ? `Assegna ${k} selezionati` : "Assegna selezionati"; };
    main.querySelectorAll("[data-c]").forEach((x) => x.addEventListener("change", agg));
    const all = main.querySelector("[data-all]"); if (all) all.addEventListener("change", () => { main.querySelectorAll("[data-c]").forEach((x) => { if (!x.closest("tr").hidden) x.checked = all.checked; }); agg(); });
    main.querySelector("[data-gen]").addEventListener("click", () => formCodici("genera"));
    main.querySelector("[data-imp]").addEventListener("click", () => formCodici("importa"));
    main.querySelector("[data-ass]").addEventListener("click", async () => {
      const cods = selezionati(); const riv = await rivenditori();
      const m = RC.modal(`<h2>Assegna ${cods.length} codici</h2><form class="rc-form" novalidate>
        <label>Rivenditore<select class="rc-in" name="riv">${optRiv(riv, null, "— nessuno (codici non utilizzabili)")}</select></label>
        <div class="rc-msg"></div><button class="rc-b pri" type="submit">Assegna</button></form>`);
      const f = m.el.querySelector("form");
      f.addEventListener("submit", (e) => { e.preventDefault(); RC.busy(f.querySelector("button"), m, async () => {
        await RC.call("admin_assegna_codici", { p_codici: cods, p_rivenditore: f.riv.value || null, p_agente: null }); m.close(); vistaCodici(); }); });
    });
    main.querySelector("[data-rev]").addEventListener("click", async () => {
      const cods = selezionati(); if (!confirm(`Revocare ${cods.length} codici? Non potranno più essere usati.`)) return;
      try { await RC.call("admin_revoca_codici", { p_codici: cods }); vistaCodici(); } catch (e) { alert(e.message); }
    });
  }

  async function formCodici(modo) {
    const riv = await rivenditori();
    const gen = modo === "genera";
    const m = RC.modal(`<h2>${gen ? "Genera codici" : "Importa codici esistenti"}</h2>
      <p class="rc-muted rc-small">${gen ? "Codici casuali nel formato RK-XXXX-XXXX, da stampare sulle etichette dei kit." : "Incolla i codici già stampati sui kit, uno per riga. Spazi e trattini non contano."}</p>
      <form class="rc-form" novalidate>
        ${gen ? `<label>Quanti codici<input class="rc-in" type="number" name="n" min="1" max="1000" value="20"></label>` : `<label>Codici<textarea class="rc-in" name="lista" placeholder="Un codice per riga"></textarea></label>`}
        <label>Tipo di kit<select class="rc-in" name="tipo"><option>K-LAB</option><option>K-CLINIC</option></select></label>
        <label>Rivenditore<select class="rc-in" name="riv">${optRiv(riv, null, "— assegna più tardi")}</select></label>
        <label>Lotto / riferimento (facoltativo)<input class="rc-in" name="lotto" placeholder="es. DDT 2026-112"></label>
        <div class="rc-msg"></div><button class="rc-b pri" type="submit">${gen ? "Genera" : "Importa"}</button></form>`);
    const f = m.el.querySelector("form");
    f.addEventListener("submit", (e) => { e.preventDefault(); RC.busy(f.querySelector("button"), m, async () => {
      const base = { p_tipo: f.tipo.value, p_rivenditore: f.riv.value || null, p_agente: null, p_lotto: f.lotto.value };
      if (gen) {
        const r = await RC.call("admin_genera_codici", Object.assign({ p_n: Number(f.n.value) }, base));
        const nomeRiv = f.riv.value ? f.riv.selectedOptions[0].textContent : "non assegnati";
        const rm = RC.modal(`<h2>${r.codici.length} codici generati</h2><p class="rc-muted">${esc(f.tipo.value)} · ${esc(nomeRiv)}</p>
          <textarea class="rc-in" readonly style="width:100%;min-height:200px">${esc(r.codici.join("\n"))}</textarea>
          <div class="rc-row end" style="margin-top:12px"><button class="rc-b" type="button" data-csv>Scarica per le etichette (CSV)</button><button class="rc-b pri" type="button" data-ok>Fatto</button></div>`, { onClose: vistaCodici });
        rm.el.querySelector("[data-csv]").addEventListener("click", () => RC.csv(`codici-${f.tipo.value}-${new Date().toISOString().slice(0, 10)}.csv`, [["Codice", "Tipo", "Rivenditore", "Lotto"], ...r.codici.map((c) => [c, f.tipo.value, nomeRiv, f.lotto.value])]));
        rm.el.querySelector("[data-ok]").addEventListener("click", rm.close);
      } else {
        const cods = f.lista.value.split(/[\r\n,;]+/).map((s) => s.trim()).filter(Boolean);
        if (!cods.length) throw new Error("Incolla almeno un codice.");
        const r = await RC.call("admin_importa_codici", Object.assign({ p_codici: cods }, base));
        m.msg(`Importati ${r.importati}.` + (r.doppioni.length ? ` Già presenti: ${r.doppioni.join(", ")}.` : "") + (r.troppo_corti.length ? ` Troppo corti (min. 6 caratteri): ${r.troppo_corti.join(", ")}.` : ""), r.doppioni.length || r.troppo_corti.length ? "warn" : "ok");
        if (r.importati) f.lista.value = "";
        vistaCodici();
      }
    }); });
  }

  /* ------------------------------ export ------------------------------ */
  async function vistaExport(rivFiltro) {
    const [d, riv] = await Promise.all([RC.call("lista_export", { p_mese: mese, p_rivenditore: rivFiltro || null }), isAdmin() ? rivenditori() : Promise.resolve([])]);
    main.innerHTML = `<h1>Export</h1><p class="g-lead">Ogni export confermato da un laboratorio, con data e ora. È la prova in caso di contestazione${isAdmin() ? "; un errore evidente si storna finché il mese non è chiuso" : ""}.</p>
      <div class="g-bar">${selMese()}${isAdmin() ? `<select class="rc-in" data-riv><option value="">Tutti i rivenditori</option>${riv.map((r) => `<option value="${r.id}"${r.id === rivFiltro ? " selected" : ""}>${esc(r.nome)}</option>`).join("")}</select>` : ""}
        <input class="rc-in" type="search" placeholder="Cerca laboratorio…" data-q><span class="sp"></span><button class="rc-b" type="button" data-csv>Scarica (CSV)</button></div>
      ${d.righe.length ? `<div class="g-tw"><table class="rc-tbl"><thead><tr><th>Data e ora</th><th>Laboratorio</th>${isAdmin() ? "<th>Rivenditore</th>" : ""}<th>Tipo</th><th class="n">Importo</th><th>Stato</th>${isAdmin() ? "<th></th>" : ""}</tr></thead><tbody>
      ${d.righe.map((x) => `<tr><td>${RC.dataOra(x.confermato_il)}</td><td>${esc(x.laboratorio)}</td>${isAdmin() ? `<td>${esc(x.rivenditore)}</td>` : ""}<td>${x.tipo === "modelli" ? "Modelli" : "Key Clinic"}</td>
        <td class="n">${x.gratuito ? "incluso" : euro(x.prezzo)}</td><td>${x.stornato ? tag("stornato", "bad") + (x.nota_storno ? ` <span class="rc-muted rc-small">${esc(x.nota_storno)}</span>` : "") : ""}</td>
        ${isAdmin() ? `<td>${x.stornato ? "" : `<button class="rc-b sm" type="button" data-storna="${x.id}">Storna</button>`}</td>` : ""}</tr>`).join("")}
      </tbody></table></div>` : vuoto("Nessun export in questo mese.")}`;
    legaMese(() => vistaExport(rivFiltro));
    const sr = main.querySelector("[data-riv]"); if (sr) sr.addEventListener("change", () => vistaExport(sr.value || null));
    const tb = main.querySelector("tbody"); if (tb) filtra(main.querySelector("[data-q]"), tb);
    main.querySelector("[data-csv]").addEventListener("click", () => RC.csv(`rotoclick-export-${mese.slice(0, 7)}.csv`, [["Data e ora", "Laboratorio", "P.IVA", "Rivenditore", "Tipo", "Incluso", "Prezzo", "Quota rivenditore", "Quota Dentag", "Stornato", "Nota"],
      ...d.righe.map((x) => [RC.dataOra(x.confermato_il), x.laboratorio, x.piva, x.rivenditore, x.tipo, x.gratuito ? "sì" : "no", n(x.prezzo).toFixed(2).replace(".", ","), n(x.quota_rivenditore).toFixed(2).replace(".", ","), n(x.quota_dentag).toFixed(2).replace(".", ","), x.stornato ? "sì" : "", x.nota_storno])]));
    main.querySelectorAll("[data-storna]").forEach((b) => b.addEventListener("click", () => {
      const x = d.righe.find((r) => String(r.id) === b.dataset.storna);
      const m = RC.modal(`<h2>Storna export</h2><p>${esc(x.laboratorio)} · ${RC.dataOra(x.confermato_il)} · ${x.gratuito ? "caso incluso (torna disponibile)" : euro(x.prezzo)}</p>
        <form class="rc-form" novalidate><label>Motivo<input class="rc-in" name="nota" placeholder="es. export doppio per errore"></label><div class="rc-msg"></div><button class="rc-b pri" type="submit">Storna</button></form>`);
      const f = m.el.querySelector("form");
      f.addEventListener("submit", (e) => { e.preventDefault(); RC.busy(f.querySelector("button"), m, async () => { await RC.call("admin_storna_export", { p_id: x.id, p_nota: f.nota.value }); m.close(); vistaExport(rivFiltro); }); });
    }));
  }

  /* ------------------------------ accessi ------------------------------ */
  async function vistaAccessi() {
    const [u, riv] = await Promise.all([RC.call("admin_utenti"), rivenditori()]);
    const R = { admin: "Admin Dentag", rivenditore: "Rivenditore", disabilitato: "Disabilitato" };
    main.innerHTML = `<h1>Accessi al back-end</h1>
      <p class="g-lead">Abilita l'email di una persona: poi entra in questa pagina con “Primo accesso” usando quella email. I laboratori invece si registrano da soli nel tool.</p>
      <div class="g-grid2"><div class="g-card"><h2>Abilita un'email</h2>
        <form class="rc-form" novalidate id="fi">
          <label>Email<input class="rc-in" type="email" name="email"></label>
          <label>Nome<input class="rc-in" name="nome"></label>
          <label>Ruolo<select class="rc-in" name="ruolo"><option value="rivenditore">Rivenditore</option><option value="admin">Admin Dentag</option></select></label>
          <label data-wr>Rivenditore<select class="rc-in" name="riv">${optRiv(riv.filter((r) => !r.is_dentag), null, "— scegli")}</select></label>
          <div class="rc-msg"></div><button class="rc-b pri" type="submit">Abilita</button></form></div>
        <div class="g-card"><h2>In attesa di primo accesso</h2>
          ${u.inviti.length ? `<table class="rc-tbl"><tbody>${u.inviti.map((i) => `<tr><td>${esc(i.email)}<br><span class="rc-muted rc-small">${esc(i.nome || "")} · ${esc(R[i.ruolo])}${i.rivenditore ? " · " + esc(i.rivenditore) : ""}</span></td>
            <td><button class="rc-b sm bad" type="button" data-dis="${esc(i.email)}">Annulla</button></td></tr>`).join("")}</tbody></table>` : `<p class="rc-muted">Nessuno.</p>`}</div></div>
      <div class="g-tw"><table class="rc-tbl"><thead><tr><th>Email</th><th>Nome</th><th>Ruolo</th><th>Rivenditore</th><th></th></tr></thead><tbody>
      ${u.utenti.map((x) => `<tr><td>${esc(x.email)}</td><td>${esc(x.nome || "")}</td><td>${x.ruolo === "disabilitato" ? tag("disabilitato", "bad") : esc(R[x.ruolo])}</td><td>${esc(x.rivenditore || "")}</td>
        <td>${x.ruolo !== "disabilitato" && x.email !== P.email ? `<button class="rc-b sm bad" type="button" data-dis="${esc(x.email)}">Disabilita</button>` : ""}</td></tr>`).join("")}
      </tbody></table></div>`;
    const f = main.querySelector("#fi"), box = { msg: (t, c) => { const m = f.querySelector(".rc-msg"); m.className = "rc-msg " + (c || ""); m.textContent = t || ""; } };
    const wr = f.querySelector("[data-wr]"); const sync = () => { wr.hidden = f.ruolo.value !== "rivenditore"; }; f.ruolo.addEventListener("change", sync); sync();
    f.addEventListener("submit", (e) => { e.preventDefault(); RC.busy(f.querySelector("button"), box, async () => {
      const r = await RC.call("admin_invita", { p_email: f.email.value, p_ruolo: f.ruolo.value, p_rivenditore: f.ruolo.value === "rivenditore" ? f.riv.value || null : null, p_nome: f.nome.value });
      await vistaAccessi();
      main.querySelector("#fi .rc-msg").className = "rc-msg ok";
      main.querySelector("#fi .rc-msg").textContent = r.aggiornato ? "Accesso aggiornato." : "Email abilitata: ora la persona può fare “Primo accesso”.";
    }); });
    main.querySelectorAll("[data-dis]").forEach((b) => b.addEventListener("click", async () => {
      if (!confirm(`Togliere l'accesso a ${b.dataset.dis}?`)) return;
      try { await RC.call("admin_disabilita_accesso", { p_email: b.dataset.dis }); vistaAccessi(); } catch (e) { alert(e.message); }
    }));
  }

  /* ---------------------------- impostazioni ---------------------------- */
  async function vistaImpostazioni() {
    P = await RC.call("mio_profilo"); const i = P.impostazioni;
    main.innerHTML = `<h1>Impostazioni</h1><p class="g-lead">Valgono per gli export futuri; quelli già registrati mantengono il prezzo del momento.</p>
      <div class="g-card" style="max-width:520px"><form class="rc-form" novalidate id="fs">
        <label>Prezzo per caso al laboratorio (${esc(RC.cfg.VALUTA || "€")})<input class="rc-in" type="number" step="0.01" min="0" name="prezzo" value="${n(i.prezzo_caso)}"></label>
        <label>Quota del rivenditore per caso (${esc(RC.cfg.VALUTA || "€")})<input class="rc-in" type="number" step="0.01" min="0" name="quota" value="${n(i.quota_rivenditore)}"></label>
        <label>Casi inclusi per ogni codice kit<input class="rc-in" type="number" step="1" min="0" name="casi" value="${i.casi_per_kit}"></label>
        <label class="rc-check"><input type="checkbox" name="kc"${i.key_clinic_conta ? " checked" : ""}><span>Anche l'export delle scansioni Key Clinic conta come caso</span></label>
        <div class="rc-msg"></div><button class="rc-b pri" type="submit">Salva</button></form></div>`;
    const f = main.querySelector("#fs"), box = { msg: (t, c) => { const m = f.querySelector(".rc-msg"); m.className = "rc-msg " + (c || ""); m.textContent = t || ""; } };
    f.addEventListener("submit", (e) => { e.preventDefault(); RC.busy(f.querySelector("button"), box, async () => {
      await RC.call("admin_salva_impostazioni", { p_prezzo: Number(f.prezzo.value), p_quota: Number(f.quota.value), p_casi: Number(f.casi.value), p_kc: f.kc.checked });
      box.msg("Impostazioni salvate.", "ok");
    }); });
  }

  RC.onAuth((ev) => { if (ev === "PASSWORD_RECOVERY") nuovaPassword(); });
  RC.barraAnteprima();
  avvio().catch((e) => { main.innerHTML = ""; erroreMain(e); });
})();
