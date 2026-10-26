#!/usr/bin/env python3
"""Inserisce login, voucher e controllo export in una versione del tool RotoClick Studio.

Uso (dalla cartella del progetto):
    python3 strumenti/integra.py  percorso/del/tool.html

Scrive index.html. Il tool non viene modificato: si aggiungono solo un foglio di stile
nel <head> e alcuni script prima di </body>. Se il file contiene già l'integrazione,
la sostituisce (si può rilanciare a ogni nuova versione del tool).
"""
import re
import sys
from pathlib import Path

INIZIO, FINE = "<!-- RC-STUDIO:INIZIO -->", "<!-- RC-STUDIO:FINE -->"
HEAD = f'{INIZIO}<link rel="stylesheet" href="assets/rc-ui.css">{FINE}\n'
BODY = (
    f"{INIZIO}\n"
    '<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.116.0/dist/umd/supabase.js"></script>\n'
    '<script src="config.js"></script>\n'
    '<script src="assets/rc-lang-data.js"></script>\n'
    '<script src="assets/rc-i18n.js"></script>\n'
    '<script src="assets/rc-api.js"></script>\n'
    '<script src="assets/rc-ui.js"></script>\n'
    '<script src="assets/rc-gate.js"></script>\n'
    f"{FINE}\n"
)


def main():
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    src = Path(sys.argv[1]).read_text(encoding="utf-8")
    src = re.sub(re.escape(INIZIO) + r".*?" + re.escape(FINE) + r"\n?", "", src, flags=re.S)
    if src.count("</head>") < 1 or src.rfind("</body>") < 0:
        sys.exit("Il file non sembra una pagina HTML completa (manca </head> o </body>).")
    for bid in ("expModels", "expScans"):
        if f'id="{bid}"' not in src:
            print(f"ATTENZIONE: pulsante #{bid} non trovato: quell'export non sarebbe controllato.")
    src = src.replace("</head>", HEAD + "</head>", 1)
    i = src.rfind("</body>")
    src = src[:i] + BODY + src[i:]
    out = Path(__file__).resolve().parent.parent / "index.html"
    out.write_text(src, encoding="utf-8")
    print(f"Scritto {out} ({len(src) // 1024} KB)")


if __name__ == "__main__":
    main()
