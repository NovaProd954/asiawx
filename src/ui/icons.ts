const P:Record<string,string>={
search:'<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.4-4.4"/>',
locate:'<circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="7.5"/><path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22"/>',
zin:'<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.4-4.4M11 8v6M8 11h6"/>',
zout:'<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.4-4.4M8 11h6"/>',
layers:'<path d="m12 3 9 5-9 5-9-5z"/><path d="m3 12.5 9 5 9-5"/><path d="m3 16.5 9 5 9-5"/>',
fit:'<path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3"/><circle cx="12" cy="12" r="2"/>',
full:'<path d="M14 4h6v6M10 20H4v-6M20 4l-7 7M4 20l7-7"/>',
info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v6"/><circle cx="12" cy="7.6" r=".6" fill="currentColor"/>',
close:'<path d="m6 6 12 12M18 6 6 18"/>',
chev:'<path d="m6 9 6 6 6-6"/>',
prev:'<path d="m15 5-7 7 7 7"/>',
next:'<path d="m9 5 7 7-7 7"/>',
model:'<rect x="6" y="6" width="12" height="12" rx="2.5"/><path d="M9 2.5V6M15 2.5V6M9 18v3.5M15 18v3.5M2.5 9H6M2.5 15H6M18 9h3.5M18 15h3.5"/><path d="M10 12h4"/>',
wind:'<path d="M3 8.5h9.5a3 3 0 1 0-3-3M3 12.5h14a3 3 0 1 1-3 3M3 16.5h6.5a2.5 2.5 0 1 1-2.5 2.5"/>',
sat:'<g transform="rotate(45 12 12)"><rect x="9.6" y="8.5" width="4.8" height="7" rx="1"/><path d="M9.6 10.2H4.8v3.6h4.8M14.4 10.2h4.8v3.6h-4.8M12 8.5V5.5M12 15.5v3"/></g>',
tc:'<circle cx="12" cy="12" r="2.2"/><path d="M12 9.8C12 5.6 8.2 3.4 4.3 5.2M12 14.2c0 4.2 3.8 6.4 7.7 4.6"/><path d="M9.8 12C5.6 12 3.4 15.8 5.2 19.7M14.2 12c4.2 0 6.4-3.8 4.6-7.7" opacity=".55"/>',
pin:'<path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.3"/>',
map:'<path d="m3.5 6.5 5.5-2.5 6 2.5 5.5-2.5v13l-5.5 2.5-6-2.5-5.5 2.5z"/><path d="M9 4v13.5M15 6.5V20"/>',
therm:'<path d="M10 14.5V5a2 2 0 1 1 4 0v9.5a4 4 0 1 1-4 0z"/>',
storm:'<circle cx="12" cy="12" r="2"/><path d="M12 10C12 6 8.5 4 5 5.5M12 14c0 4 3.5 6 7 4.5"/>',
compare:'<rect x="3.5" y="5" width="17" height="14" rx="2.5"/><path d="M12 5v14"/><path d="M7.5 10.5 6 12l1.5 1.5M16.5 10.5 18 12l-1.5 1.5"/>',
field:'<path d="M3 7.5c3-3 6 3 9 0s6-3 9 0"/><path d="M3 12.5c3-3 6 3 9 0s6-3 9 0"/><path d="M3 17.5c3-3 6 3 9 0s6-3 9 0"/>',
trash:'<path d="M5 7h14M10 7V4.5h4V7M7 7l.8 12.5h8.4L17 7"/>'};
export function icon(n:string,s=20,fill=false){return`<svg class="i" width="${s}" height="${s}" viewBox="0 0 24 24" aria-hidden="true" fill="${fill?'currentColor':'none'}" stroke="${fill?'none':'currentColor'}" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${P[n]??''}</svg>`}
export const PLAYI='<svg class="i" width="24" height="24" viewBox="0 0 24 24" aria-hidden="true"><path d="M8.5 5.5v13l10.5-6.5z" fill="currentColor" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>';
export const PAUSEI='<svg class="i" width="24" height="24" viewBox="0 0 24 24" aria-hidden="true"><rect x="6.5" y="5" width="3.8" height="14" rx="1" fill="currentColor"/><rect x="13.7" y="5" width="3.8" height="14" rx="1" fill="currentColor"/></svg>';
export const esc=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c] as string));
export const openCards=new Set<string>(['wind']);
export interface CardOpts{id:string;icon:string;label:string;sub?:string;sw?:{id:string;on:boolean};body?:string}
export function card(o:CardOpts):string{
const open=openCards.has(o.id),body=o.body??'';
return`<section class="card${open?' open':''}" data-c="${o.id}"><div class="card-h"><button type="button" class="card-t" data-card="${o.id}" aria-expanded="${open}" aria-controls="cb-${o.id}"><span class="tile">${icon(o.icon,20)}</span><span class="lab"><b>${esc(o.label)}</b>${o.sub?`<small>${esc(o.sub)}</small>`:''}</span><span class="chev">${icon('chev',18)}</span></button>${o.sw?`<label class="swt"><span class="vh">${esc(o.label)}</span><input type="checkbox" role="switch" id="${o.sw.id}" ${o.sw.on?'checked':''}><span class="trk"></span></label>`:''}</div><div class="card-b" id="cb-${o.id}" ${open?'':'hidden'}>${body}</div></section>`}
export function radios(name:string,label:string,items:{v:string;l:string;s?:string}[],cur:string){
return`<div class="opts" role="radiogroup" aria-label="${esc(label)}">${items.map(x=>`<label class="opt"><input type="radio" name="${name}" value="${esc(x.v)}" ${x.v===cur?'checked':''}><span><b>${esc(x.l)}</b>${x.s?`<small>${esc(x.s)}</small>`:''}</span></label>`).join('')}</div>`}
