/* RotoClick Studio — accesso, voucher e controllo degli export nel tool.
   Non modifica il codice di calcolo: intercetta il clic sui pulsanti di export
   (#expModels = modelli per la stampa, #expScans = scansioni Key Clinic),
   chiede conferma, registra l'export sul server e solo dopo lascia partire il download. */
(function () {
  "use strict";
  const RC = window.RC, cfg = RC.cfg, esc = RC.esc;
  const BOTTONI = { expModels: "modelli", expScans: "key-clinic" };
  let stato = null;          // risposta di stato_laboratorio() o null se non autenticato
  let lascia = false;        // true = il prossimo clic passa al tool (export autorizzato)
  let acct = null, box = null;

  const prezzo = () => RC.euro(stato && stato.prezzo_caso != null ? stato.prezzo_caso : 2) + (cfg.NOTA_PREZZO ? " " + cfg.NOTA_PREZZO : "");
  const link = (url, txt) => (url ? `<a href="${esc(url)}" target="_blank" rel="noopener">${esc(txt)}</a>` : esc(txt));

  /* ------------------------------ stato ------------------------------ */
  async function aggiorna() {
    try {
      const u = await RC.auth.user();
      stato = u ? await RC.call("stato_laboratorio") : null;
    } catch (e) { console.warn("RotoClick Studio:", e.message); stato = null; }
    disegnaAccount();
    return stato;
  }

  function disegnaAccount() {
    if (!box) return;
    if (!stato) { box.innerHTML = `<button class="rc-chip" type="button" data-a="login">Accedi / Registrati</button>`; return; }
    if (stato.ruolo !== "laboratorio") {
      box.innerHTML = `<a class="rc-chip" href="${esc(RC.base)}gestione/"><span class="nm" translate="no">${esc(stato.email)}</span><span class="rc-tag">${esc(stato.ruolo)}</span></a>
        <button class="rc-chip" type="button" data-a="esci">Esci</button>`;
      return;
    }
    let tag;
    if (stato.bloccato) tag = `<span class="rc-tag bad">Export bloccato</span>`;
    else if (!stato.collegato) tag = `<span class="rc-tag warn">Inserisci codice kit</span>`;
    else if (stato.casi_gratuiti > 0) tag = `<span class="rc-tag ok">${stato.casi_gratuiti} casi inclusi</span>`;
    else tag = `<span class="rc-tag">${esc(prezzo())} a caso</span>`;
    box.innerHTML = `<button class="rc-chip" type="button" data-a="account"><span class="nm" translate="no">${esc(stato.ragione_sociale)}</span>${tag}</button>`;
  }

  /* ---------------------------- finestre ---------------------------- */
  function vistaLogin(motivo, dopo) {
    const m = RC.modal(`<h2>Accedi a RotoClick Studio</h2>
      ${motivo ? `<p class="rc-muted">${esc(motivo)}</p>` : ""}
      <form class="rc-form" novalidate>
        <label>Email<input class="rc-in" type="email" name="email" autocomplete="email" required></label>
        <label>Password<input class="rc-in" type="password" name="pw" autocomplete="current-password" required></label>
        <div class="rc-msg"></div>
        <button class="rc-b pri" type="submit">Accedi</button>
      </form>
      <p class="rc-small" style="margin-top:12px">Nuovo cliente? <button class="rc-link" type="button" data-v="reg">Registrati gratis</button>
      · <button class="rc-link" type="button" data-v="reset">Password dimenticata?</button></p>`);
    const f = m.el.querySelector("form");
    f.addEventListener("submit", (e) => { e.preventDefault();
      RC.busy(f.querySelector("button"), m, async () => {
        await RC.auth.signIn(f.email.value, f.pw.value);
        await aggiorna(); m.close(); if (dopo) dopo();
      });
    });
    m.el.querySelector('[data-v="reg"]').addEventListener("click", () => vistaRegistrazione(dopo));
    m.el.querySelector('[data-v="reset"]').addEventListener("click", () => vistaReset(f.email.value));
  }

  function vistaRegistrazione(dopo) {
    const m = RC.modal(`<h2>Registra il tuo laboratorio</h2>
      <p class="rc-muted rc-small">La registrazione è gratuita e permette di usare tutto il tool. Per esportare serve il codice di un kit RotoClick (K-Lab o K-Clinic): ogni codice include dei casi gratuiti.</p>
      <form class="rc-form" novalidate>
        <label>Ragione sociale<input class="rc-in" name="rs" autocomplete="organization" required></label>
        <label>Partita IVA / UID<input class="rc-in" name="piva" required></label>
        <label>Email<input class="rc-in" type="email" name="email" autocomplete="email" required></label>
        <label>Password (min. 8 caratteri)<input class="rc-in" type="password" name="pw" autocomplete="new-password" minlength="8" required></label>
        <label class="rc-check"><input type="checkbox" name="ok" required><span>Accetto le ${link(cfg.LINK_CONDIZIONI, "condizioni d'uso")}${cfg.LINK_PRIVACY ? " e l'" + link(cfg.LINK_PRIVACY, "informativa privacy") : ""}, compreso il prezzo di ${esc(prezzo())} per ogni export oltre i casi inclusi, fatturato dal rivenditore del mio kit.</span></label>
        <div class="rc-msg"></div>
        <button class="rc-b pri" type="submit">Registrati</button>
      </form>
      <p class="rc-small" style="margin-top:12px">Hai già un account? <button class="rc-link" type="button" data-v="login">Accedi</button></p>`);
    const f = m.el.querySelector("form");
    f.addEventListener("submit", (e) => { e.preventDefault();
      const rs = f.rs.value.trim(), piva = f.piva.value.trim();
      if (!rs || !piva) return m.msg("Inserisci ragione sociale e partita IVA.", "bad");
      if (f.pw.value.length < 8) return m.msg("La password deve avere almeno 8 caratteri.", "bad");
      if (!f.ok.checked) return m.msg("Per registrarti devi accettare le condizioni.", "bad");
      RC.busy(f.querySelector("button"), m, async () => {
        const r = await RC.auth.signUp(f.email.value.trim(), f.pw.value, { ragione_sociale: rs, piva });
        if (r.confermaEmail) {
          RC.modal(`<h2>Controlla la tua email</h2><p>Ti abbiamo inviato un link a <b>${RC.dato(f.email.value.trim())}</b>. Aprilo per confermare l'indirizzo, poi accedi.</p>
            <div class="rc-row end" style="margin-top:14px"><button class="rc-b pri" type="button" data-ok>OK</button></div>`)
            .el.querySelector("[data-ok]").addEventListener("click", RC.closeModal);
          return;
        }
        await aggiorna();
        vistaVoucher("Registrazione completata. Inserisci il codice del tuo kit per sbloccare l'export.", dopo);
      });
    });
    m.el.querySelector('[data-v="login"]').addEventListener("click", () => vistaLogin(null, dopo));
  }

  function vistaReset(email) {
    const m = RC.modal(`<h2>Recupera la password</h2><p class="rc-muted">Ti inviamo un link per sceglierne una nuova.</p>
      <form class="rc-form" novalidate><label>Email<input class="rc-in" type="email" name="email" value="${esc(email || "")}" required></label>
      <div class="rc-msg"></div><button class="rc-b pri" type="submit">Invia link</button></form>`);
    const f = m.el.querySelector("form");
    f.addEventListener("submit", (e) => { e.preventDefault();
      RC.busy(f.querySelector("button"), m, async () => { await RC.auth.resetPassword(f.email.value.trim()); m.msg("Se l'email è registrata riceverai il link a breve.", "ok"); });
    });
  }

  function vistaNuovaPassword() {
    const m = RC.modal(`<h2>Scegli una nuova password</h2><form class="rc-form" novalidate>
      <label>Nuova password (min. 8 caratteri)<input class="rc-in" type="password" name="pw" autocomplete="new-password" required></label>
      <div class="rc-msg"></div><button class="rc-b pri" type="submit">Salva</button></form>`, { noClose: true });
    const f = m.el.querySelector("form");
    f.addEventListener("submit", (e) => { e.preventDefault();
      if (f.pw.value.length < 8) return m.msg("Almeno 8 caratteri.", "bad");
      RC.busy(f.querySelector("button"), m, async () => { await RC.auth.updatePassword(f.pw.value); m.close(); await aggiorna(); RC.avviso("Password aggiornata", "Ora sei connesso.", "ok"); });
    });
  }

  function vistaVoucher(intro, dopo) {
    const m = RC.modal(`<h2>Inserisci il codice del kit</h2>
      <p class="rc-muted">${esc(intro || "Trovi il codice nella confezione del kit RotoClick K-Lab o K-Clinic.")}</p>
      <form class="rc-form" novalidate>
        <label>Codice kit<input class="rc-in code" name="cod" autocomplete="off" spellcheck="false" placeholder="RK-XXXX-XXXX" required></label>
        <div class="rc-msg"></div>
        <button class="rc-b pri" type="submit">Attiva codice</button>
      </form>
      <p class="rc-small rc-muted" style="margin-top:10px">Il codice garantisce che il kit è originale e acquistato da un rivenditore autorizzato.${cfg.LINK_RIVENDITORI ? " " + link(cfg.LINK_RIVENDITORI, "Elenco rivenditori") : ""}</p>`);
    const f = m.el.querySelector("form");
    f.addEventListener("submit", (e) => { e.preventDefault();
      RC.busy(f.querySelector("button"), m, async () => {
        const r = await RC.call("riscatta_voucher", { p_codice: f.cod.value });
        await aggiorna();
        RC.modal(`<h2>Codice attivato</h2>
          <div class="rc-msg ok">+${r.casi_aggiunti} casi inclusi (${esc(r.tipo)}). Ora hai ${r.casi_gratuiti} casi inclusi disponibili.</div>
          ${r.nuovo_collegamento ? `<p>Il tuo rivenditore è <b>${RC.dato(r.rivenditore)}</b>: dopo i casi inclusi ogni export costa ${esc(prezzo())} e ti viene fatturato da lui a fine mese.</p>` : ""}
          <div class="rc-row end" style="margin-top:14px"><button class="rc-b pri" type="button" data-ok>${dopo ? "Continua" : "OK"}</button></div>`)
          .el.querySelector("[data-ok]").addEventListener("click", () => { RC.closeModal(); if (dopo) dopo(); });
      });
    });
  }

  async function vistaAccount() {
    await aggiorna();
    if (!stato) return vistaLogin();
    const m = RC.modal(`<h2 translate="no">${esc(stato.ragione_sociale)}</h2>
      <dl class="rc-kv">
        <dt>Email</dt><dd translate="no">${esc(stato.email)}</dd>
        ${stato.piva ? `<dt>Partita IVA</dt><dd translate="no">${esc(stato.piva)}</dd>` : ""}
        <dt>Rivenditore</dt><dd>${stato.collegato ? RC.dato(stato.rivenditore) : "— inserisci il codice di un kit"}</dd>
        <dt>Casi inclusi</dt><dd>${stato.casi_gratuiti}</dd>
        <dt>Export a pagamento</dt><dd>${stato.export_mese} questo mese · ${esc(prezzo())} l'uno</dd>
        <dt>Kit registrati</dt><dd>${stato.codici.length ? stato.codici.map((c) => RC.dato(c.codice) + " <span class='rc-muted'>(" + esc(c.tipo) + ")</span>").join("<br>") : "nessuno"}</dd>
      </dl>
      ${stato.bloccato ? `<div class="rc-msg bad">L'export è bloccato. Contatta ${RC.dato(stato.rivenditore)}.</div>` : ""}
      <div class="rc-row">
        <button class="rc-b pri" type="button" data-a="voucher">Inserisci codice kit</button>
        <button class="rc-b" type="button" data-a="storico">I miei export</button>
        <button class="rc-b" type="button" data-a="esci">Esci</button>
      </div>`);
    m.el.querySelector('[data-a="voucher"]').addEventListener("click", () => vistaVoucher());
    m.el.querySelector('[data-a="storico"]').addEventListener("click", vistaStorico);
    m.el.querySelector('[data-a="esci"]').addEventListener("click", esci);
  }

  async function vistaStorico() {
    const m = RC.modal(`<h2>I miei export</h2><div class="rc-msg"></div><div class="rc-scroll">Caricamento…</div>
      <div class="rc-row" style="margin-top:12px"><button class="rc-b" type="button" data-a="ind">← Account</button></div>`, { wide: true });
    m.el.querySelector('[data-a="ind"]').addEventListener("click", vistaAccount);
    try {
      const r = await RC.call("lista_export", {});
      m.el.querySelector(".rc-scroll").innerHTML = r.righe.length ? `<table class="rc-tbl"><thead><tr><th>Data</th><th>Tipo</th><th>Fatturato da</th><th class="n">Importo</th></tr></thead><tbody>
        ${r.righe.map((x) => `<tr><td>${RC.dataOra(x.confermato_il)}</td><td>${x.tipo === "modelli" ? "Modelli" : "Key Clinic"}</td><td>${RC.dato(x.rivenditore)}</td>
          <td class="n">${x.stornato ? "stornato" : x.gratuito ? "incluso" : RC.euro(x.prezzo)}</td></tr>`).join("")}</tbody></table>`
        : `<p class="rc-muted">Nessun export finora.</p>`;
    } catch (e) { m.msg(e.message, "bad"); }
  }

  async function esci() { await RC.auth.signOut(); stato = null; disegnaAccount(); RC.closeModal(); }

  /* --------------------------- export --------------------------- */
  function pronto(tipo) {
    let s = null;
    try { s = typeof S !== "undefined" ? S : null; } catch (e) { s = null; }  // stato interno del tool
    if (!s) return true;
    return tipo === "modelli" ? !!s.models : !!(s.upper && s.lower);
  }

  function lanciaExport(btn) { lascia = true; btn.click(); }

  async function chiediExport(btn, tipo) {
    if (!pronto(tipo)) {
      return RC.avviso("Niente da esportare", tipo === "modelli" ? "Calcola prima i modelli." : "Carica prima le scansioni superiore e inferiore.", "warn");
    }
    const riprova = () => chiediExport(btn, tipo);
    await aggiorna();
    if (!stato) return vistaLogin("Per esportare accedi o registrati: la registrazione è gratuita.", riprova);
    if (stato.ruolo === "admin") {
      const m = RC.modal(`<h2>Export dimostrativo</h2><p>Sei connesso come amministratore Dentag: questo export non viene conteggiato né fatturato.</p>
        <div class="rc-row end" style="margin-top:14px"><button class="rc-b" type="button" data-no>Annulla</button><button class="rc-b pri" type="button" data-si>Esporta</button></div>`);
      m.el.querySelector("[data-no]").addEventListener("click", m.close);
      m.el.querySelector("[data-si]").addEventListener("click", () => { m.close(); lanciaExport(btn); });
      return;
    }
    if (stato.ruolo !== "laboratorio") {
      return RC.avviso("Account del back-end", "Questo account serve per la gestione. Per esportare accedi con un account laboratorio.", "warn");
    }
    if (stato.bloccato) return RC.avviso("Export non disponibile", "L'export è bloccato per il tuo account. Contatta " + stato.rivenditore + ".", "bad");
    if (!stato.collegato) return vistaVoucher("Per esportare inserisci il codice del tuo kit RotoClick (K-Lab o K-Clinic). Ogni codice include casi gratuiti.", riprova);

    const nome = tipo === "modelli" ? "modelli per la stampa" : "scansioni orientate Key Clinic";
    const conta = tipo === "modelli" || stato.key_clinic_conta;
    let corpo;
    if (!conta) corpo = `<div class="rc-msg ok">Questo export è gratuito.</div>`;
    else if (stato.casi_gratuiti > 0) corpo = `<div class="rc-price"><b>Caso incluso</b><span class="rc-muted">ne restano ${stato.casi_gratuiti - 1} dopo questo export</span></div>`;
    else corpo = `<div class="rc-price"><b>${esc(RC.euro(stato.prezzo_caso))}</b><span class="rc-muted">${esc(cfg.NOTA_PREZZO || "")}</span></div>
      <p>Ti verrà addebitato da <b>${RC.dato(stato.rivenditore)}</b> a fine mese.</p>`;
    const m = RC.modal(`<h2>Esporta ${esc(nome)}</h2>${corpo}
      ${conta ? `<p class="rc-small rc-muted">Ogni export conta come un caso, anche se riesporti lo stesso lavoro: controlla i modelli prima di confermare.</p>` : ""}
      <div class="rc-msg"></div>
      <div class="rc-row end" style="margin-top:14px"><button class="rc-b" type="button" data-no>Annulla</button><button class="rc-b pri" type="button" data-si>Conferma ed esporta</button></div>`);
    m.el.querySelector("[data-no]").addEventListener("click", m.close);
    const si = m.el.querySelector("[data-si]");
    si.addEventListener("click", () => RC.busy(si, m, async () => {
      await RC.call("registra_export", { p_tipo: tipo });
      m.close(); lanciaExport(btn); aggiorna();
    }));
  }

  document.addEventListener("click", (ev) => {
    const btn = ev.target && ev.target.closest ? ev.target.closest("#expModels, #expScans") : null;
    if (!btn) return;
    if (lascia) { lascia = false; return; }      // export già autorizzato: passa al tool
    ev.preventDefault(); ev.stopImmediatePropagation();
    if (btn.disabled) return;
    chiediExport(btn, BOTTONI[btn.id]);
  }, true);

  /* --------------------------- avvio --------------------------- */
  function avvia() {
    const header = document.querySelector("header");
    acct = document.createElement("div");
    acct.className = "rc-acct";
    (header || document.body).appendChild(acct);
    acct.addEventListener("click", (e) => {
      const a = e.target.closest("[data-a]"); if (!a) return;
      if (a.dataset.a === "login") vistaLogin();
      if (a.dataset.a === "account") vistaAccount();
      if (a.dataset.a === "esci") esci();
    });
    acct.appendChild(RC.tendinaLingua());
    box = document.createElement("span"); box.className = "rc-acct"; acct.appendChild(box);
    box.innerHTML = `<span class="rc-chip" aria-busy="true">…</span>`;
    RC.onLang(disegnaAccount);
    RC.onAuth((ev) => { if (ev === "PASSWORD_RECOVERY") vistaNuovaPassword(); else aggiorna(); });
    aggiorna();
    RC.barraAnteprima();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", avvia); else avvia();
})();
