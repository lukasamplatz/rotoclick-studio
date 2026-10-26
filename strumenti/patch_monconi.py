#!/usr/bin/env python3
"""Tipo di moncone sfilabile: Classico / Con binari / Con binari click.

Uso:  python3 strumenti/patch_monconi.py  tool-originale.html  tool-modificato.html

Modifica il tool (HTML + codice di calcolo) e ricalcola le posizioni dei tratti di codice
che il tool copia nel calcolo parallelo (rcWorker.ranges): ogni modifica al codice principale
sposta quei tratti, quindi vanno riallineati.
- Classico:          corpo con la forma del margine + fianco 45°, nessun binario, nessuna gola nel modello
- Con binari:        binari vestibolare/linguale e relative gole, senza click
- Con binari click:  come prima (click sul binario linguale)
"""
import json
import re
import sys

# ---------------------------------------------------------------- HTML (fuori dal codice)
HTML = [
    # scelta del tipo in cima al pannello monconi
    ('''<summary><span id="dieBoxT" style="color:inherit">Monconi sfilabili</span> <span id="dieCount"></span></summary>
''',
     '''<summary><span id="dieBoxT" style="color:inherit">Monconi sfilabili</span> <span id="dieCount"></span></summary>
      <div id="dTipoBox" style="display:flex;flex-direction:column;gap:6px">
      <div class="seg" role="radiogroup" aria-label="Tipo di moncone">
        <label><input type="radio" name="dtipo" value="classico"><span>Classico</span></label>
        <label><input type="radio" name="dtipo" value="binari"><span>Con binari</span></label>
        <label><input type="radio" name="dtipo" value="click" checked><span>Con binari click</span></label>
      </div>
      <input type="hidden" id="dTipo" value="click">
      <p class="hint" id="dTipoHint" style="margin:0"></p>
      </div>
'''),
    ('<label>Offset XY binari <span>', '<label id="rowGapR">Offset XY binari <span>'),
    ('<label title="Dentino sul binario linguale, 0 = senza click">Click <span>',
     '<label id="rowClick" title="Dentino sul binario linguale, 0 = senza click">Click <span>'),
    ('<small>monconi RotoClick con click</small>', '<small>classici, con binari o con click</small>'),
]

# ---------------------------------------------------------------- codice principale (rcMain)
MAIN = [
    # parametri: tipo scelto
    ('const P={...DIE_DEF, neckM:g("dNeckM"), click:g("dClick"),',
     'const P={...DIE_DEF, tipo:document.getElementById("dTipo").value||"click", neckM:g("dNeckM"), click:g("dClick"),'),
    # calcolo: binari solo per "binari" e "click"
    ('  let shaft=W.Manifold.union([pin,body,bodyTop,rV,rL]); [pin,body,bodyTop,rV,rL].forEach(m=>m.delete());',
     '  const conBinari=P.tipo!=="classico";   // Classico: niente binari né gole, si centra sul corpo con la forma del margine\n'
     '  let shaft=W.Manifold.union(conBinari?[pin,body,bodyTop,rV,rL]:[pin,body,bodyTop]); [pin,body,bodyTop,rV,rL].forEach(m=>m.delete());'),
    # click solo per "click"
    ('  if(P.click>0){\n    const w=wOf(CS), hc=P.click,',
     '  if(P.click>0 && (P.tipo||"click")==="click"){\n    const w=wOf(CS), hc=P.click,'),
    # gole nel modello: per Classico la sede è solo il foro (sock = copia del foro)
    ('  let sock=W.Manifold.union([gV,gL].concat(clickNotch?[clickNotch]:[])); [gV,gL].concat(clickNotch?[clickNotch]:[]).forEach(m=>m.delete());\n'
     '  if(dz){ const t=sock.translate([F.a.x*dz,F.a.y*dz,F.a.z*dz]); sock.delete(); sock=t; }',
     '  let sock;\n'
     '  if(conBinari){ sock=W.Manifold.union([gV,gL].concat(clickNotch?[clickNotch]:[])); [gV,gL].concat(clickNotch?[clickNotch]:[]).forEach(m=>m.delete());\n'
     '    if(dz){ const t=sock.translate([F.a.x*dz,F.a.y*dz,F.a.z*dz]); sock.delete(); sock=t; } }\n'
     '  else { gV.delete(); gL.delete(); if(clickNotch) clickNotch.delete(); sock=hole.translate([0,0,0]); }'),
    ('  const grooveR=(t,u,add)=>{ u-=dz;',
     '  const grooveR=(t,u,add)=>{ if(!conBinari) return 0; u-=dz;'),
    # interfaccia: scelta del tipo, righe dei parametri, testo di aiuto
    ('["dNeckM","dClick","dTaper","dBelow","dStopPct","dG0","dIns","dGapB","dGapR","dZ","projName","dDitchD","dDitchW"].forEach(id=>document.getElementById(id).addEventListener("change",invalidateModels));',
     '["dNeckM","dClick","dTaper","dBelow","dStopPct","dG0","dIns","dGapB","dGapR","dZ","projName","dDitchD","dDitchW"].forEach(id=>document.getElementById(id).addEventListener("change",invalidateModels));\n'
     'function applyDieType(){ const v=(document.querySelector(\'input[name="dtipo"]:checked\')||{}).value||"click"; document.getElementById("dTipo").value=v;\n'
     '  document.getElementById("rowGapR").hidden = v==="classico"; document.getElementById("rowClick").hidden = v!=="click";\n'
     '  document.getElementById("dTipoHint").textContent = {classico:"Senza binari: il moncone si centra sul corpo con la forma del margine e appoggia sul fianco a 45°.", binari:"Due binari guidano l\'inserimento (largo vestibolare, stretto linguale), senza click.", click:"Due binari guidano l\'inserimento; il binario linguale ha un click che trattiene il moncone in sede."}[v];\n'
     '  invalidateModels(); }\n'
     'document.querySelectorAll(\'input[name="dtipo"]\').forEach(r=>r.addEventListener("change",applyDieType)); applyDieType();'),
    ('  document.getElementById("ditchOpts").hidden = !ditch; document.getElementById("dieOptsBox").hidden = ditch;',
     '  document.getElementById("ditchOpts").hidden = !ditch; document.getElementById("dieOptsBox").hidden = ditch; document.getElementById("dTipoBox").hidden = ditch;'),
]


def main():
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    src = open(sys.argv[1], encoding="utf-8").read()
    if 'name="dtipo"' in src:
        sys.exit("Il tool contiene già la scelta del tipo di moncone.")

    m = re.search(r'<script id="rcMain">', src) or re.search(r'<script[^>]*id="rcMain"[^>]*>', src)
    a = m.end(); b = src.index("</script>", a)
    head, main_js, tail = src[:a], src[a:b], src[b:]
    w = re.search(r'(<script[^>]*id="rcWorker"[^>]*>)(.*?)(</script>)', tail, re.S)
    W = json.loads(w.group(2))

    # modifiche al codice principale, con riallineamento dei tratti del worker
    edits = []
    for old, new in MAIN:
        n = main_js.count(old)
        if n != 1:
            sys.exit(f"Testo da modificare trovato {n} volte (atteso 1):\n{old[:120]}")
        edits.append((main_js.index(old), old, new))
    bounds = [x for r in W["ranges"] for x in r]
    for p, old, new in edits:
        for x in bounds:
            if p < x < p + len(old):
                sys.exit(f"Un confine del worker cade dentro una modifica (pos {x}).")
    old_core = "\n".join(main_js[s:e] for s, e in W["ranges"])
    new_ranges = []
    for s, e in W["ranges"]:
        ds = sum(len(new) - len(old) for p, old, new in edits if p + len(old) <= s)
        de = sum(len(new) - len(old) for p, old, new in edits if p + len(old) <= e)
        new_ranges.append([s + ds, e + de])
    for p, old, new in sorted(edits, reverse=True):
        main_js = main_js[:p] + new + main_js[p + len(old):]
    W["ranges"] = new_ranges
    new_core = "\n".join(main_js[s:e] for s, e in new_ranges)
    # controllo: il codice del worker cambia solo dove l'abbiamo modificato
    exp = old_core
    for p, old, new in edits:
        if old in exp:
            exp = exp.replace(old, new, 1)
    if exp != new_core:
        sys.exit("Controllo fallito: il codice del worker non corrisponde dopo il riallineamento.")
    nel_worker = sum(1 for p, old, new in edits if old in old_core)

    tail = tail[:w.start(2)] + json.dumps(W, ensure_ascii=False, separators=(",", ":")) + tail[w.end(2):]
    out = head + main_js + tail
    for old, new in HTML:
        n = out.count(old)
        if n != 1:
            sys.exit(f"Testo HTML trovato {n} volte (atteso 1):\n{old[:120]}")
        out = out.replace(old, new)
    open(sys.argv[2], "w", encoding="utf-8").write(out)
    print(f"OK: {len(MAIN)} modifiche al codice ({nel_worker} nel calcolo parallelo), {len(HTML)} all'interfaccia → {sys.argv[2]}")


if __name__ == "__main__":
    main()
