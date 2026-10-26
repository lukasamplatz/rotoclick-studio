/* =====================================================================
   RotoClick Studio — configurazione
   ---------------------------------------------------------------------
   Lascia SUPABASE_URL vuoto per la MODALITÀ ANTEPRIMA: tutto funziona
   con un database finto salvato solo in questo browser (account e codici
   di prova). Inserisci URL e chiave del progetto Supabase per andare live.
   La chiave "publishable"/"anon" è pubblica per natura: la sicurezza è
   nelle funzioni del database (supabase/schema.sql).
   ===================================================================== */
window.RC_CONFIG = {
  SUPABASE_URL: "",            // es. "https://abcdefghijkl.supabase.co"
  SUPABASE_ANON_KEY: "",       // Project Settings → API Keys → publishable (o anon) key

  VALUTA: "€",
  NOTA_PREZZO: "+ IVA",        // testo dopo il prezzo nel pop-up ("" per nasconderlo)

  // Link mostrati nella registrazione e nei messaggi d'errore
  LINK_CONDIZIONI: "",         // condizioni d'uso di RotoClick Studio
  LINK_PRIVACY: "",            // informativa privacy
  LINK_RIVENDITORI: "",        // elenco rivenditori autorizzati
  EMAIL_SUPPORTO: ""           // email di assistenza mostrata ai clienti
};
