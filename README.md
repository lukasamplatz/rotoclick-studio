# RotoClick Studio

Tool nel browser per i modelli RotoClick (Key Lab / Key Clinic), con registrazione dei laboratori, codici dei kit (voucher), conteggio degli export e back-end per Dentag, rivenditori e agenti.

Indirizzo previsto: **https://amplatzlukas.com/rotoclick-studio/**

---

## Come funziona

1. **Registrazione libera.** Il laboratorio si registra nel tool (ragione sociale, P.IVA, email). Senza codice può usare tutto, **tranne esportare**.
2. **Voucher = codice del kit.** Ogni kit K-Lab o K-Clinic ha un codice. Inserito nel tool:
   - sblocca l'export (modelli e scansioni Key Clinic);
   - aggiunge **10 casi inclusi**;
   - il **primo** codice collega il laboratorio al rivenditore a cui era assegnato quel codice.
   Un codice vale una volta sola e funziona solo se assegnato a un rivenditore attivo: è la garanzia che il kit è originale e venduto da un rivenditore abilitato.
3. **Export.** A ogni export compare un pop-up: "caso incluso" oppure "2,00 € + IVA, addebitato da [rivenditore] a fine mese". Solo dopo la conferma il server registra l'export e parte il download. Ogni export è un caso (non esistono riesportazioni gratuite).
4. **Fine mese.** Dentag fattura a ogni rivenditore 1 € per export a pagamento. Il rivenditore fattura 2 € ai suoi clienti, usando il riepilogo per laboratorio. I clienti diretti e quelli degli agenti li fattura Dentag a 2 €.

**Privacy:** scansioni e casi restano sul PC del laboratorio. Il server riceve solo i dati del laboratorio e, per ogni export, data e ora, tipo e importo.

## Struttura

| File | Cosa contiene |
| --- | --- |
| `index.html` | Il tool, con login, voucher e pop-up di export già inseriti |
| `gestione/index.html` | Back-end per Dentag (admin), rivenditori e agenti |
| `config.js` | Collegamento a Supabase, testo del prezzo, link a condizioni e privacy |
| `assets/` | Codice dell'accesso (`rc-api.js`), finestre (`rc-ui.*`), controllo export (`rc-gate.js`), back-end (`gestione.*`) |
| `supabase/schema.sql` | Il database: tabelle, regole di accesso, tutte le funzioni |
| `strumenti/integra.py` | Inserisce login e controllo export in una nuova versione del tool |
| `assets/anteprima-*` | Solo per la modalità anteprima (database finto nel browser) |

---

## 1. Pubblicare su GitHub (anteprima subito funzionante)

Con `config.js` vuoto il sito parte in **modalità anteprima**: un database finto salvato nel browser, con account e codici di prova. Si può mostrare a papà o a un rivenditore prima di configurare Supabase.

1. Crea su GitHub un repository chiamato **`rotoclick-studio`**, nello stesso account che pubblica amplatzlukas.com.
2. Carica tutti i file di questa cartella (Add file → Upload files, oppure con git).
3. Settings → Pages → *Deploy from a branch* → `main` / `(root)` → Save.
4. Se amplatzlukas.com è il dominio personalizzato del sito utente (`<utente>.github.io`), il repository appare da solo su **amplatzlukas.com/rotoclick-studio/**. Se invece il sito è un unico repository, copia questi file in una cartella `rotoclick-studio/` di quel repository.

Account di prova in anteprima (password `anteprima`): `admin@anteprima.it`, `rivenditore@anteprima.it`, `agente@anteprima.it`. I codici di prova sono nella barra "Modalità anteprima" in basso.

## 2. Andare live con Supabase

1. Crea un progetto su [supabase.com](https://supabase.com) (regione UE, per esempio Frankfurt).
2. **SQL Editor** → incolla tutto `supabase/schema.sql` → *Run*.
3. **Authentication → URL Configuration**
   - Site URL: `https://amplatzlukas.com/rotoclick-studio/`
   - Redirect URLs: aggiungi `https://amplatzlukas.com/rotoclick-studio/**`
4. **Authentication → Sign In / Providers → Email**: lascia attiva la conferma dell'email.
5. **Authentication → Emails**: traduci in italiano (e tedesco) i testi di conferma e di recupero password. Per l'uso reale configura un SMTP tuo (*SMTP Settings*), perché il servizio email incluso in Supabase ha limiti di invio bassi.
6. **Project Settings → API Keys**: copia *Project URL* e la chiave *publishable* (o *anon*) in `config.js`:
   ```js
   SUPABASE_URL: "https://xxxxxxxx.supabase.co",
   SUPABASE_ANON_KEY: "sb_publishable_…",
   ```
   La chiave è pubblica per natura: la sicurezza sta nelle funzioni del database.
7. **Primo amministratore**: nel SQL Editor esegui
   ```sql
   insert into inviti (email, ruolo, nome) values ('tua@email.it', 'admin', 'Lukas');
   ```
   Poi apri `/rotoclick-studio/gestione/` → **Primo accesso** con quella email.
8. Compila in `config.js` anche `LINK_CONDIZIONI`, `LINK_PRIVACY`, `LINK_RIVENDITORI` ed `EMAIL_SUPPORTO`.

> Sul piano gratuito Supabase mette in pausa i progetti inattivi. Per la produzione valuta il piano a pagamento.

## 3. Uso quotidiano (back-end `/gestione/`)

| Chi | Cosa fa |
| --- | --- |
| **Dentag (admin)** | Crea i rivenditori, abilita le email di rivenditori/agenti/admin (**Accessi**), genera o importa i codici e li assegna (**Codici kit**), vede il riepilogo per rivenditore, storna export sbagliati, chiude il mese, cambia prezzo/quote/casi inclusi (**Impostazioni**) |
| **Rivenditore** | Vede i suoi clienti (i nuovi sono segnalati), li blocca se non pagano, vede i suoi codici, scarica il riepilogo del mese per fatturare |
| **Agente Dentag** | Vede solo i clienti collegati con i codici a lui assegnati e i loro export |

**Codici dei kit**
- *Genera codici*: codici casuali `RK-XXXX-XXXX` (senza 0/O e 1/I), con il CSV da usare per le etichette.
- *Importa codici esistenti*: per i kit già in giro con un codice stampato. Spazi e trattini non contano.
- Un codice funziona solo quando è **assegnato a un rivenditore**. I kit venduti direttamente vanno a "Dentag Italia S.r.l.", con l'eventuale agente.

**Fine mese:** *Riepilogo mese* → scegli il mese → *Scarica (CSV)* → fatture. Dentag fattura la colonna "Da fatturare al rivenditore"; per i clienti diretti clicca la riga Dentag. Dopo la fatturazione usa **Chiudi il mese**: da quel momento gli export di quel mese non si possono più stornare.

**Rivenditore disattivato:** i suoi codici non usati vengono revocati e i suoi laboratori passano a Dentag. Gli export già fatti restano a suo carico.

## 4. Aggiornare il tool

Quando hai una nuova versione del tool (il file HTML del prototipo):

```bash
python3 strumenti/integra.py percorso/RotoClick-Studio-nuovo.html
```

Lo script riscrive `index.html` con login, voucher e controllo export. Il codice di calcolo non viene toccato: il controllo intercetta i clic sui pulsanti `#expModels` (modelli) ed `#expScans` (Key Clinic). Se cambi gli id di quei pulsanti, lo script ti avvisa.

## 5. Cose da sapere

- **Sicurezza:** tabelle, codici e conteggi stanno sul server e un laboratorio non può modificarli. Il tool però gira nel browser: un utente molto esperto potrebbe aggirare il pop-up e salvare i file senza passare dal server. Per un importo simbolico è un rischio accettabile.
- **Codici indovinabili:** i codici generati sono casuali. Se i kit vecchi hanno codici in sequenza, conviene sostituirli con codici nuovi, perché una sequenza si indovina. Il sistema blocca comunque un laboratorio dopo 10 tentativi sbagliati in un'ora.
- **Prezzo:** 2 € a caso, 1 € al rivenditore e 10 casi per kit sono modificabili in *Impostazioni* e valgono per gli export futuri. Nell'accordo con i rivenditori conviene indicare i 2 € come **prezzo massimo** (da verificare con il consulente).
- **Key Clinic:** di default anche l'export Key Clinic conta come caso. Si può cambiare in *Impostazioni*.
- **Lingua:** l'interfaccia è in italiano. La versione tedesca va aggiunta prima di andare in DACH.
