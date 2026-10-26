/* RotoClick Studio — finestre di dialogo e barra anteprima (condivise) */
(function () {
  "use strict";
  const RC = window.RC;
  let corrente = null;

  // Apre una finestra; contenuto = HTML. Restituisce {el, close, msg(testo, tipo)}
  RC.modal = function (html, opts) {
    opts = opts || {};
    RC.closeModal();
    const ov = document.createElement("div");
    ov.className = "rc-ov";
    ov.innerHTML = `<div class="rc-dlg${opts.wide ? " wide" : ""}" role="dialog" aria-modal="true">
      ${opts.noClose ? "" : '<button class="rc-x" type="button" aria-label="Chiudi">×</button>'}${html}</div>`;
    document.body.appendChild(ov);
    const dlg = ov.firstElementChild;
    const close = () => { if (ov.parentNode) ov.remove(); document.removeEventListener("keydown", onKey); if (corrente && corrente.el === dlg) corrente = null; if (opts.onClose) opts.onClose(); };
    const onKey = (e) => { if (e.key === "Escape" && !opts.noClose) close(); };
    document.addEventListener("keydown", onKey);
    const x = dlg.querySelector(".rc-x"); if (x) x.addEventListener("click", close);
    ov.addEventListener("mousedown", (e) => { if (e.target === ov && !opts.noClose) close(); });
    const first = dlg.querySelector("input:not([type=checkbox]),select,textarea,button.pri");
    if (first) setTimeout(() => first.focus(), 30);
    const msg = (t, tipo) => { const m = dlg.querySelector(".rc-msg"); if (m) { m.className = "rc-msg " + (tipo || ""); m.textContent = t || ""; } };
    corrente = { el: dlg, close, msg };
    return corrente;
  };
  RC.closeModal = () => { if (corrente) corrente.close(); };

  // Esegue fn mostrando l'eventuale errore nella finestra; disabilita il pulsante durante l'attesa
  RC.busy = async function (btn, m, fn) {
    if (btn) btn.disabled = true;
    if (m) m.msg("", "");
    try { return await fn(); }
    catch (e) { if (m) m.msg(e.message || String(e), "bad"); else alert(e.message || e); return undefined; }
    finally { if (btn) btn.disabled = false; }
  };

  RC.avviso = (titolo, testo, tipo) => RC.modal(`<h2>${RC.esc(titolo)}</h2><div class="rc-msg ${tipo || ""}">${RC.esc(testo)}</div>
    <div class="rc-row end" style="margin-top:14px"><button class="rc-b pri" type="button" data-ok>OK</button></div>`)
    .el.querySelector("[data-ok]").addEventListener("click", RC.closeModal);

  // Barra informativa in modalità anteprima
  RC.barraAnteprima = async function () {
    if (!RC.anteprima) return;
    const d = document.createElement("details");
    d.className = "rc-demo";
    d.innerHTML = `<summary>Modalità anteprima — dati solo in questo browser</summary><div class="in">Caricamento…</div>`;
    document.body.appendChild(d);
    try {
      await RC.ready;
      const cod = await RC.codiciDemo();
      d.querySelector(".in").innerHTML = `Supabase non è ancora configurato (config.js): account, codici ed export sono simulati.<br>
        Account demo (password <code>anteprima</code>): <code>admin@anteprima.it</code> · <code>rivenditore@anteprima.it</code><br>
        Un laboratorio si registra da sé. Codici kit di prova ancora liberi:<br>${cod.map((c) => `<code>${RC.esc(c.codice_stampato)}</code> ${RC.esc(c.tipo)}`).join(" · ") || "nessuno (generali dal back-end)"}
        <br><button type="button" data-reset>Azzera l'anteprima</button>`;
      d.querySelector("[data-reset]").addEventListener("click", () => { if (confirm(RC.t("Cancellare tutti i dati di prova di questo browser?"))) RC.resetAnteprima(); });
    } catch (e) {
      d.querySelector(".in").textContent = "Anteprima non disponibile: " + e.message;
    }
  };
})();
