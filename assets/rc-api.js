/* RotoClick Studio — accesso ai dati.
   Due modalità con la stessa interfaccia:
   - LIVE: Supabase (config.js compilato)
   - ANTEPRIMA: database PostgreSQL nel browser (PGlite) con lo stesso schema.sql,
     account e codici di prova. I dati restano solo in questo browser. */
(function () {
  "use strict";
  const cfg = window.RC_CONFIG || {};
  const RC = (window.RC = window.RC || {});
  RC.cfg = cfg;
  RC.anteprima = !cfg.SUPABASE_URL;

  // cartella base del sito (dove stanno config.js, assets/, supabase/)
  const me = document.currentScript && document.currentScript.src;
  RC.base = me ? me.replace(/assets\/rc-api\.js(\?.*)?$/, "") : "./";

  const listeners = [];
  const emit = (ev) => listeners.forEach((cb) => { try { cb(ev); } catch (e) { console.error(e); } });

  const traduci = (m) => {
    const t = {
      "Invalid login credentials": "Email o password errati.",
      "Email not confirmed": "Email non ancora confermata: apri il link che ti abbiamo inviato.",
      "User already registered": "Questa email è già registrata. Accedi o recupera la password.",
      "Password should be at least 6 characters": "La password deve avere almeno 6 caratteri.",
      "Unable to validate email address: invalid format": "Email non valida.",
    };
    for (const k in t) if (String(m).indexOf(k) >= 0) return t[k];
    if (/rate limit/i.test(m)) return "Troppe richieste. Riprova tra qualche minuto.";
    return m;
  };

  /* ------------------------------ LIVE ------------------------------ */
  function live() {
    const sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    });
    const pagina = () => location.href.split("#")[0].split("?")[0];
    sb.auth.onAuthStateChange((ev) => emit(ev));
    return {
      ready: Promise.resolve(),
      auth: {
        async user() { const { data } = await sb.auth.getSession(); return data.session ? data.session.user : null; },
        async signUp(email, password, meta) {
          const { data, error } = await sb.auth.signUp({ email, password, options: { data: meta || {}, emailRedirectTo: pagina() } });
          if (error) throw new Error(traduci(error.message));
          if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0)
            throw new Error("Questa email è già registrata. Accedi o recupera la password.");
          return { confermaEmail: !data.session };
        },
        async signIn(email, password) {
          const { error } = await sb.auth.signInWithPassword({ email, password });
          if (error) throw new Error(traduci(error.message));
        },
        async signOut() { await sb.auth.signOut(); },
        async resetPassword(email) {
          const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: pagina() });
          if (error) throw new Error(traduci(error.message));
        },
        async updatePassword(password) {
          const { error } = await sb.auth.updateUser({ password });
          if (error) throw new Error(traduci(error.message));
        },
      },
      async call(fn, args) {
        const { data, error } = await sb.rpc(fn, args || {});
        if (error) throw new Error(traduci(error.message));
        return data;
      },
    };
  }

  /* ---------------------------- ANTEPRIMA ---------------------------- */
  function anteprima() {
    const KEY = "rc-anteprima-uid";
    const PW = "anteprima";
    let db = null;
    // una sola operazione per volta sul database locale (evita blocchi tra richieste parallele)
    let coda = Promise.resolve();
    const seriale = (fn) => { const r = coda.then(fn, fn); coda = r.catch(() => {}); return r; };
    const getUid = () => { try { return localStorage.getItem(KEY) || ""; } catch (e) { return RC._uid || ""; } };
    const setUid = (v) => { RC._uid = v; try { v ? localStorage.setItem(KEY, v) : localStorage.removeItem(KEY); } catch (e) {} };

    const ready = (async () => {
      const CDN = "https://cdn.jsdelivr.net/npm/@electric-sql/pglite@0.5.8/dist/";
      const DIR = "idb://rotoclick-studio-anteprima";
      try {
        const { PGliteWorker } = await import(CDN + "worker/index.js");
        db = await PGliteWorker.create(new Worker(RC.base + "assets/anteprima-worker.js", { type: "module" }), { dataDir: DIR });
      } catch (e) {
        console.warn("Anteprima: worker non disponibile, database nella pagina.", e);
        const { PGlite } = await import(CDN + "index.js");
        db = await PGlite.create(DIR);
      }
      const ex = await db.query("select to_regclass('public.impostazioni') is not null as c");
      if (!ex.rows[0].c) {
        const get = async (p) => { const r = await fetch(RC.base + p); if (!r.ok) throw new Error("File mancante: " + p); return r.text(); };
        await db.exec(await get("assets/anteprima-auth.sql"));
        await db.exec(await get("supabase/schema.sql"));
      }
      // dati di prova (solo la prima volta)
      const demo = await db.query("select count(*)::int as n from rivenditori where nome = 'Rivenditore Demo S.r.l.'");
      if (!demo.rows[0].n) {
        await db.exec(`
          insert into rivenditori (nome, piva, email, paese) values ('Rivenditore Demo S.r.l.', 'IT00000000001', 'rivenditore@anteprima.it', 'IT');
          insert into inviti (email, ruolo, nome) values ('admin@anteprima.it', 'admin', 'Admin Dentag') on conflict do nothing;
          insert into inviti (email, ruolo, rivenditore_id, nome)
            select 'rivenditore@anteprima.it', 'rivenditore', id, 'Titolare Demo' from rivenditori where nome = 'Rivenditore Demo S.r.l.' on conflict do nothing;
          insert into auth.users (email, anteprima_password) values
            ('admin@anteprima.it', '${PW}'), ('rivenditore@anteprima.it', '${PW}') on conflict do nothing;
          select set_config('request.jwt.claim.sub', (select id::text from auth.users where email = 'admin@anteprima.it'), false);
          select admin_genera_codici(4, 'K-LAB', (select id from rivenditori where nome = 'Rivenditore Demo S.r.l.'), null, 'DEMO');
          select admin_genera_codici(2, 'K-CLINIC', _dentag_id(), null, 'DEMO');
          select set_config('request.jwt.claim.sub', '', false);`);
      }
    })();

    async function user() {
      await ready; const id = getUid(); if (!id) return null;
      const r = await seriale(() => db.query("select id, email from auth.users where id = $1", [id]));
      return r.rows[0] || null;
    }
    return {
      ready,
      auth: {
        user,
        async signUp(email, password, meta) {
          await ready; email = String(email || "").trim().toLowerCase();
          if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error("Email non valida.");
          if (String(password || "").length < 6) throw new Error("La password deve avere almeno 6 caratteri.");
          const ex = await seriale(() => db.query("select 1 from auth.users where email = $1", [email]));
          if (ex.rows.length) throw new Error("Questa email è già registrata. Accedi o recupera la password.");
          const r = await seriale(() => db.query("insert into auth.users (email, raw_user_meta_data, anteprima_password) values ($1, $2, $3) returning id",
            [email, meta || {}, password]));
          setUid(r.rows[0].id); emit("SIGNED_IN");
          return { confermaEmail: false };
        },
        async signIn(email, password) {
          await ready;
          const r = await seriale(() => db.query("select id from auth.users where email = $1 and anteprima_password = $2",
            [String(email || "").trim().toLowerCase(), password]));
          if (!r.rows.length) throw new Error("Email o password errati.");
          setUid(r.rows[0].id); emit("SIGNED_IN");
        },
        async signOut() { setUid(""); emit("SIGNED_OUT"); },
        async resetPassword() { throw new Error("In anteprima il recupero password non invia email. Password degli account demo: " + PW); },
        async updatePassword(password) {
          await ready; await seriale(() => db.query("update auth.users set anteprima_password = $1 where id = $2", [password, getUid()]));
        },
      },
      async call(fn, args) {
        await ready;
        if (!/^[a-z_]+$/.test(fn)) throw new Error("Funzione non valida");
        args = args || {};
        const keys = Object.keys(args).filter((k) => /^p_[a-z_]+$/.test(k));
        const uid = getUid();
        // utente + funzione nella stessa transazione: più schede possono usare lo stesso database
        const r = await seriale(() => db.transaction(async (tx) => {
          await tx.query("select set_config('request.jwt.claim.sub', $1, true)", [uid]);
          return tx.query(`select ${fn}(${keys.map((k, i) => `${k} => $${i + 1}`).join(", ")}) as r`, keys.map((k) => args[k]));
        }));
        return r.rows[0].r;
      },
      async codiciDemo() {
        await ready;
        const r = await seriale(() => db.query("select codice_stampato, tipo from codici where stato = 'disponibile' and lotto = 'DEMO' order by tipo desc, codice_stampato"));
        return r.rows;
      },
      async reset() {
        try { indexedDB.deleteDatabase("/pglite/rotoclick-studio-anteprima"); } catch (e) {}
        setUid(""); location.reload();
      },
    };
  }

  const impl = RC.anteprima ? anteprima() : live();
  RC.ready = impl.ready;
  RC.auth = impl.auth;
  RC.codiciDemo = impl.codiciDemo;
  RC.resetAnteprima = impl.reset;
  RC.onAuth = (cb) => listeners.push(cb);
  // Chiama una funzione del database; se risponde {ok:false} lancia l'errore leggibile
  RC.call = async (fn, args) => {
    const d = await impl.call(fn, args);
    if (d && d.ok === false) throw new Error(d.errore || "Operazione non riuscita");
    return d;
  };

  /* --------------------------- utilità comuni --------------------------- */
  RC.esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  RC.euro = (n) => Number(n || 0).toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " " + (cfg.VALUTA || "€");
  RC.data = (s) => (s ? new Date(s).toLocaleDateString("it-IT") : "");
  RC.dataOra = (s) => (s ? new Date(s).toLocaleString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "");
  RC.nomeMese = (iso) => { const [y, m] = String(iso).split("-").map(Number); return new Date(y, m - 1, 1).toLocaleDateString("it-IT", { month: "long", year: "numeric" }); };
  RC.csv = (nome, righe) => {
    const s = righe.map((r) => r.map((v) => { v = v == null ? "" : String(v); return /[;"\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }).join(";")).join("\r\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob(["﻿" + s], { type: "text/csv;charset=utf-8" }));
    a.download = nome; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
  };
})();
