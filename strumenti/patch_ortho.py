#!/usr/bin/env python3
"""Modello studio: base Standard oppure Ortho (zoccolo squadrato stile Tweed/ABO).

Uso:  python3 strumenti/patch_ortho.py  tool.html  tool-modificato.html
(applicare dopo patch_monconi.py)

Zoccolo Ortho, costruito nel sistema del modello (asse di estrusione verticale):
- retro perpendicolare alla linea mediana;
- lati a 65° (superiore) / 55° (inferiore) rispetto al retro, talloni smussati;
- davanti: superiore a punta (tagli a 30° dall'orizzontale), inferiore arrotondato da canino a canino;
- simmetrico rispetto alla linea mediana, a una distanza regolabile dall'arcata (default 3 mm);
- piano dello zoccolo proposto al fornice (altezza mediana del bordo della scansione rispetto alla piastra)
  e spostabile in mm: + = zoccolo più alto (copre più gengiva), − = più basso.
Con il nido d'ape anche lo zoccolo viene alleggerito (contorno Tweed e piano dello zoccolo); con Ortho l'opzione Cavo non c'è.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from patch_monconi import applica  # noqa: E402

HTML = [
    ('<small>senza monconi</small>', '<small>senza monconi, base standard o Ortho</small>'),
    ('<h3>Riempimento</h3>',
     '''<div id="orthoBox" style="display:flex;flex-direction:column;gap:8px">
      <h3>Base</h3>
      <div class="seg" role="radiogroup" aria-label="Base">
        <label><input type="radio" name="basetipo" value="std" checked><span>Standard</span></label>
        <label><input type="radio" name="basetipo" value="ortho"><span>Ortho (Tweed)</span></label>
      </div>
      <input type="hidden" id="baseTipo" value="std">
      <div class="params" id="orthoParams" hidden>
        <label title="Proposto al fornice: + = zoccolo più alto (copre più gengiva), − = più basso">Piano dello zoccolo dal fornice <span><input type="number" id="orthoOff" value="0" min="-6" max="6" step="0.5"> mm</span></label>
        <label>Distanza dall'arcata <span><input type="number" id="orthoMarg" value="3" min="1" max="8" step="0.5"> mm</span></label>
      </div>
      <p class="hint" id="orthoHint" style="margin:0" hidden>Zoccolo squadrato Tweed/ABO: retro perpendicolare alla linea mediana, lati a 65° (sup.) e 55° (inf.), talloni smussati; superiore a punta, inferiore arrotondato da canino a canino. Il piano dello zoccolo è proposto al fornice e si sposta in mm.</p>
      </div>
      <h3>Riempimento</h3>'''),
]

ORTHO_FN = r'''
  // zoccolo Ortho (Tweed/ABO): prisma convesso dal piano della piastra al piano dello zoccolo
  const orthoBase=(W,B,opt)=>{
    const P=B.P, T=B.T, zp=B.zPlate, s=B.s, up=s>0, isP=i=>Math.abs(P[i*3+2]-zp)<1e-6;
    let x0=Infinity, x1=-Infinity, y0=Infinity, y1=-Infinity, dMax=0; const xy=[];
    for(let i=0;i<P.length/3;i++){ if(isP(i)) continue; const x=P[i*3], y=P[i*3+1]; xy.push(x,y);
      x0=Math.min(x0,x); x1=Math.max(x1,x); y0=Math.min(y0,y); y1=Math.max(y1,y); dMax=Math.max(dMax, s*(zp-P[i*3+2])); }
    if(xy.length<20) return null;
    const mx=(x0+x1)/2, m=Math.max(0.5,+opt.orthoMarg||3), D=Math.PI/180, a=(up?65:55)*D;
    const N=[[0,-1],[Math.sin(a),Math.cos(a)],[-Math.sin(a),Math.cos(a)]];
    for(const sx of [1,-1]){ const nx=sx*Math.sin(a), ny=Math.cos(a)-1, l=Math.hypot(nx,ny); N.push([nx/l,ny/l]); }   // talloni
    if(up) N.push([Math.sin(30*D),Math.cos(30*D)],[-Math.sin(30*D),Math.cos(30*D)]);                                // punta anteriore
    else for(let f=-50; f<=50; f+=10) N.push([Math.sin(f*D),Math.cos(f*D)]);                                        // arco canino-canino
    // ogni lato tangente all'arcata + distanza, simmetrico rispetto alla linea mediana
    const H=N.map(([nx,ny])=>{ let h=-Infinity; for(let i=0;i<xy.length;i+=2){ const dx=xy[i]-mx, y=xy[i+1]; h=Math.max(h, nx*dx+ny*y, -nx*dx+ny*y); } return [nx,ny,h+m]; });
    let poly=[[mx-300,y0-300],[mx+300,y0-300],[mx+300,y1+300],[mx-300,y1+300]];
    for(const [nx,ny,h] of H){ const f=p=>nx*(p[0]-mx)+ny*p[1]-h, out=[];
      for(let i=0;i<poly.length;i++){ const A=poly[i], Q=poly[(i+1)%poly.length], fa=f(A), fb=f(Q);
        if(fa<=0) out.push(A); if((fa<0&&fb>0)||(fa>0&&fb<0)){ const t=fa/(fa-fb); out.push([A[0]+(Q[0]-A[0])*t, A[1]+(Q[1]-A[1])*t]); } }
      poly=out; if(poly.length<3) return null; }
    // piano proposto al fornice: altezza mediana del bordo della scansione (vertici collegati alle pareti) dalla piastra
    const bd=[], seen=new Set();
    for(let t=0;t<T.length;t+=3){ const q=[T[t],T[t+1],T[t+2]], np=q.filter(isP).length; if(np>0&&np<3) for(const v of q) if(!isP(v)&&!seen.has(v)){ seen.add(v); bd.push(s*(zp-P[v*3+2])); } }
    if(!bd.length) return null; bd.sort((p,q)=>p-q);
    const dF=bd[Math.floor(bd.length/2)], dL=Math.max(2, Math.min(dMax-3, dF+(+opt.orthoOff||0))), zL=zp-s*dL, hp=[];
    for(const p of poly) hp.push([p[0],p[1],zp],[p[0],p[1],zL]);
    let prism=W.Manifold.hull(hp), palato=0, palGrid=null;
    // il piano copre solo l'esterno (vestibolo e, sotto, lo spazio della lingua): le zone racchiuse dall'arcata
    // che stanno sotto il piano (il palato) restano anatomiche. Mappa delle altezze su griglia + riempimento dall'esterno.
    { const h=0.75; let gx0=Infinity, gx1=-Infinity, gy0=Infinity, gy1=-Infinity; for(const p of poly){ gx0=Math.min(gx0,p[0]); gx1=Math.max(gx1,p[0]); gy0=Math.min(gy0,p[1]); gy1=Math.max(gy1,p[1]); }
      gx0-=2*h; gy0-=2*h; const nx=Math.ceil((gx1-gx0)/h)+3, ny=Math.ceil((gy1-gy0)/h)+3, D=new Float32Array(nx*ny).fill(-1e9);
      const put=(x,y,d)=>{ const cx=Math.floor((x-gx0)/h), cy=Math.floor((y-gy0)/h); if(cx<0||cy<0||cx>=nx||cy>=ny) return; const k=cy*nx+cx; if(d>D[k]) D[k]=d; };
      for(let i=0;i<P.length/3;i++) if(!isP(i)) put(P[i*3],P[i*3+1],s*(zp-P[i*3+2]));
      // anche l'interno dei triangoli (scansioni con punti radi: niente buchi nella mappa)
      for(let t=0;t<T.length;t+=3){ const a=T[t],b=T[t+1],c=T[t+2]; if(isP(a)||isP(b)||isP(c)) continue;
        const ax=P[a*3],ay=P[a*3+1],bx=P[b*3],by=P[b*3+1],cx=P[c*3],cy=P[c*3+1], da=s*(zp-P[a*3+2]), db=s*(zp-P[b*3+2]), dc=s*(zp-P[c*3+2]);
        const den=(by-cy)*(ax-cx)+(cx-bx)*(ay-cy); if(Math.abs(den)<1e-9) continue;
        const i0=Math.max(0,Math.floor((Math.min(ax,bx,cx)-gx0)/h)), i1=Math.min(nx-1,Math.floor((Math.max(ax,bx,cx)-gx0)/h)), j0=Math.max(0,Math.floor((Math.min(ay,by,cy)-gy0)/h)), j1=Math.min(ny-1,Math.floor((Math.max(ay,by,cy)-gy0)/h));
        for(let j=j0;j<=j1;j++) for(let i=i0;i<=i1;i++){ const px=gx0+(i+0.5)*h, py=gy0+(j+0.5)*h, w1=((by-cy)*(px-cx)+(cx-bx)*(py-cy))/den, w2=((cy-ay)*(px-cx)+(ax-cx)*(py-cy))/den, w3=1-w1-w2;
          if(w1<-1e-6||w2<-1e-6||w3<-1e-6) continue; const d=w1*da+w2*db+w3*dc, k=j*nx+i; if(d>D[k]) D[k]=d; } }
      const sotto=k=>D[k]<dL-0.2, fuori=new Uint8Array(nx*ny), q=[];
      palGrid={gx0,gy0,h,nx,ny,D,fuori,sotto};
      for(let x=0;x<nx;x++) for(const y of [0,ny-1]){ const k=y*nx+x; if(sotto(k)&&!fuori[k]){ fuori[k]=1; q.push(k); } }
      for(let y=0;y<ny;y++) for(const x of [0,nx-1]){ const k=y*nx+x; if(sotto(k)&&!fuori[k]){ fuori[k]=1; q.push(k); } }
      while(q.length){ const k=q.pop(), x=k%nx, y=(k-x)/nx;
        for(const [a,b] of [[x+1,y],[x-1,y],[x,y+1],[x,y-1]]){ if(a<0||b<0||a>=nx||b>=ny) continue; const j=b*nx+a; if(!fuori[j]&&sotto(j)){ fuori[j]=1; q.push(j); } } }
      const rects=[];
      for(let y=0;y<ny;y++){ let x=0; while(x<nx){ const k=y*nx+x; if(D[k]>-1e8 && sotto(k) && !fuori[k]){ let e=x; while(e+1<nx){ const j=y*nx+e+1; if(D[j]>-1e8 && sotto(j) && !fuori[j]) e++; else break; }
            const X0=gx0+x*h-0.01, X1=gx0+(e+1)*h+0.01, Y0=gy0+y*h-0.01, Y1=gy0+(y+1)*h+0.01; rects.push(new W.CrossSection([[[X0,Y0],[X1,Y0],[X1,Y1],[X0,Y1]]])); palato+=e-x+1; x=e+1; } else x++; } }
      if(rects.length){ const cs=W.CrossSection.union(rects); rects.forEach(r=>r.delete());
        const z0=Math.min(zp,zL)-1, ex=W.Manifold.extrude(cs,Math.abs(zp-zL)+2), ext=ex.translate([0,0,z0]); ex.delete(); cs.delete();
        const t=prism.subtract(ext); prism.delete(); ext.delete(); prism=t; } }
    // per il nido d'ape: superficie del modello = piano dello zoccolo, tranne il palato (resta la scansione)
    const sL=s*zL, hmod=(x,y,hv)=>{ if(palGrid){ const g=palGrid, i=Math.floor((x-g.gx0)/g.h), j=Math.floor((y-g.gy0)/g.h);
        if(i>=0&&j>=0&&i<g.nx&&j<g.ny){ const k=j*g.nx+i; if(g.D[k]>-1e8 && g.sotto(k) && !g.fuori[k]) return hv; } }
      return hv===-Infinity ? sL : Math.min(hv, sL); };
    return {m:prism, poly, hmod, note:`zoccolo Ortho: piano a ${dL.toFixed(1)} mm dalla piastra (fornice ${dF.toFixed(1)} mm)`+(palato>20?", palato mantenuto":"")};
  };
'''

MAIN = [
    # opzioni passate al calcolo parallelo (il worker riceve solo i campi elencati)
    ('opt:{wall:opt.wall, rib:opt.rib, sup:opt.sup, name:opt.name, mode:S.mode}',
     'opt:{wall:opt.wall, rib:opt.rib, sup:opt.sup, name:opt.name, mode:S.mode, ortho:opt.ortho, orthoOff:opt.orthoOff, orthoMarg:opt.orthoMarg}'),
    # opzioni passate al calcolo
    ('name:document.getElementById("projName").value, mode:S.mode,',
     'name:document.getElementById("projName").value, mode:S.mode, ortho:document.getElementById("baseTipo").value==="ortho", orthoOff:+document.getElementById("orthoOff").value||0, orthoMarg:+document.getElementById("orthoMarg").value||3,'),
    # calcolo: zoccolo unito al modello prima dello svuotamento
    ('  const outer=toManifold(W,B.P,B.T); tick("outer",outer); let body=outer, note="";',
     ORTHO_FN +
     '  let outer=toManifold(W,B.P,B.T); tick("outer",outer); let note="";\n'
     '  let Bc=B;   // base per lo svuotamento: con lo zoccolo Ortho segue il contorno Tweed e il piano dello zoccolo\n'
     '  if(opt.ortho && opt.mode==="studio"){ const o=orthoBase(W,B,opt); if(o){ const t=outer.add(o.m); outer.delete(); o.m.delete(); outer=t; note=o.note;\n'
     '    Bc={...B, poly:o.poly.map(p=>({x:p[0],y:p[1]})), hmod:o.hmod}; } }\n'
     '  let body=outer;'),
    ('    const C=cavitySolid(W,B,opt.wall*kk);', '    const C=cavitySolid(W,Bc,opt.wall*kk);'),
    # cavità: altezza della superficie modificabile (zoccolo Ortho)
    ('  // dentro il contorno della base (scanline), poi erosione di "wall" con trasformata di distanza',
     '  if(B.hmod) for(let j=0;j<ny;j++) for(let i=0;i<nx;i++){ const k=i+nx*j; H[k]=B.hmod(x0+(i+0.5)*res, y0+(j+0.5)*res, H[k]); }\n'
     '  // dentro il contorno della base (scanline), poi erosione di "wall" con trasformata di distanza'),
    # interfaccia
    ('  document.getElementById("ditchOpts").hidden = !ditch; document.getElementById("dieOptsBox").hidden = ditch; document.getElementById("dTipoBox").hidden = ditch;',
     '  document.getElementById("ditchOpts").hidden = !ditch; document.getElementById("dieOptsBox").hidden = ditch; document.getElementById("dTipoBox").hidden = ditch;\n'
     '  document.getElementById("orthoBox").hidden = m!=="studio"; if(typeof applyBaseType==="function" && document.getElementById("baseTipo")) applyBaseType();'),
    ("document.querySelectorAll('input[name=\"dtipo\"]').forEach(r=>r.addEventListener(\"change\",applyDieType)); applyDieType();",
     "document.querySelectorAll('input[name=\"dtipo\"]').forEach(r=>r.addEventListener(\"change\",applyDieType)); applyDieType();\n"
     "function applyBaseType(){ const v=(document.querySelector('input[name=\"basetipo\"]:checked')||{}).value||\"std\"; document.getElementById(\"baseTipo\").value=v;\n"
     "  document.getElementById(\"orthoParams\").hidden = v!==\"ortho\"; document.getElementById(\"orthoHint\").hidden = v!==\"ortho\";\n"
     "  const on = v===\"ortho\" && S.mode===\"studio\", cavo=document.querySelector('input[name=fillr][value=hollow]');   // sullo zoccolo: solo nido d'ape o pieno\n"
     "  if(cavo){ cavo.closest(\"label\").hidden = on; if(on && cavo.checked){ const hn=document.querySelector('input[name=fillr][value=honey]'); hn.checked=true; hn.dispatchEvent(new Event(\"change\")); } }\n"
     "  invalidateModels(); }\n"
     "document.querySelectorAll('input[name=\"basetipo\"]').forEach(r=>r.addEventListener(\"change\",applyBaseType));\n"
     "[\"orthoOff\",\"orthoMarg\"].forEach(id=>document.getElementById(id).addEventListener(\"change\",invalidateModels)); applyBaseType();"),
]


def main():
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    src = open(sys.argv[1], encoding="utf-8").read()
    out = applica(src, HTML, MAIN, 'name="basetipo"', "base Ortho")
    open(sys.argv[2], "w", encoding="utf-8").write(out)


if __name__ == "__main__":
    main()
