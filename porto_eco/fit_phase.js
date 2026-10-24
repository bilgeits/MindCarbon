// WLTP faz oranlarına (faz tüketimi / birleşik) göre dur-kalk ve geri kazanım parametrelerini uydurur.
const W=[[589,3095],[433,4756],[455,7162],[323,8254]];
const T={ // hedef oranlar
 petrol:{v:{mass:1350+100,cda:0.60},r:[1.32,1.02,0.87,0.98],src:'Octavia 1.5 TSI (autotijd.be)'},
 diesel:{v:{mass:1467+100,cda:0.62},r:[1.45,0.99,0.83,0.97],src:'Octavia Combi 2.0 TDI (autotijd.be)'},
 hev:{v:{mass:1400+100,cda:0.62},r:[0.89,0.80,0.87,1.26],src:'Corolla TS 1.8 HEV (wltpinfo.com)'},
 ev:{v:{mass:1836+100,cda:0.60},r:[0.80,0.85,0.95,1.20],src:'Model 3 (EVDB şehir 0,80 / otoyol 1,22) - ara fazlar enterpolasyon'},
};
const g0=9.81,RHO=1.2,CR=0.011;
function E(m,cda,r,d,t,a,b){const v=d/t;const F=m*g0*CR+0.5*RHO*cda*v*v;const acc=m*(a+b/Math.max(v,2))*d;return F*d+acc-r*acc;}
function ratios(pt,a,b,r,idle){const {mass,cda}=T[pt].v;const vals=W.map(([t,d])=>{const e=Math.max(E(mass,cda,r,d,t,a,b),0);return {e,t,d};});
 // kappa normalize: combined = 1
 const eS=vals.reduce((s,x)=>s+x.e,0),tS=1800,dS=23266;
 // per km relative: (k*e+idle*t)/d ; choose k so combined=1 per km unit: k*eS+idle*tS = dS (units arbitrary)
 const k=(dS-idle*tS)/eS; if(k<=0) return null;
 return vals.map(x=>(k*x.e+idle*x.t)/x.d);}
let best=null;
for(const [a,b] of [[0.10,0.5],[0.10,1.0],[0.15,1.0],[0.15,2.0],[0.05,1.5],[0.10,1.5],[0.2,0.5]]){let tot=0;const per={};
 for(const pt of Object.keys(T)){let bp=null;
  const rs=pt==='petrol'||pt==='diesel'?[0]:pt==='hev'?[0.3,0.4,0.5,0.6,0.7]:[0.5,0.6,0.7,0.8];
  for(const r of rs)for(let idle=0;idle<=12;idle+=0.1){const R=ratios(pt,a,b,r,idle);if(!R)continue;let err=0;for(let i=0;i<4;i++)err+=Math.log(R[i]/T[pt].r[i])**2;if(!bp||err<bp.err)bp={err,r,idle,R};}
  per[pt]=bp;tot+=bp.err;}
 console.log("a",a,"b",b,"hata",tot.toFixed(4),Object.entries(per).map(([k,p])=>k+":r"+p.r+",i"+p.idle.toFixed(1)+",["+p.R.map(x=>x.toFixed(2))+"]").join(" "));if(!best||tot<best.tot)best={tot,a,b,per};}
console.log('PKE a',best.a.toFixed(2),'b',best.b.toFixed(1),'toplam hata',best.tot.toFixed(4));
for(const pt in best.per){const p=best.per[pt];console.log(pt.padEnd(7),'r',p.r.toFixed(2),'idle(birim: km-eşdeğeri/s x1000)',(p.idle).toFixed(1),'model',p.R.map(x=>x.toFixed(2)).join('/'),'hedef',T[pt].r.join('/'));}
