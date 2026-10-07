import {describe,it,expect,vi,afterEach} from 'vitest';
import tcApi from '../../api/tc';
import probe from '../../api/tcprobe';
import {normJma,normGdacs,normHko,matchGdacs,circles,hav,type Storm} from '../../api/_tc';
import {ring,posAt,approach,track,fixes} from './geo';
const mkRes=()=>{const r:any={code:0,body:null,headers:{} as Record<string,string>,setHeader(k:string,v:string){r.headers[k]=v},status(c:number){r.code=c;return r},json(b:unknown){r.body=b}};return r};
afterEach(()=>vi.unstubAllGlobals());
const NOW=Date.UTC(2026,9,3,6,40,0)/1000;
const TARGETS=[{tropicalCyclone:'TC2633',typhoonNumber:'2627',category:'STS',issue:'2026-10-02T15:45:00+09:00'},{tropicalCyclone:'TC2632',typhoonNumber:'2626',category:'LOW',issue:'2026-10-02T03:50:00+09:00'}];
const gf=(o:Record<string,unknown>,c:[number,number])=>({type:'Feature',geometry:{type:'Point',coordinates:c},properties:{eventtype:'TC',iscurrent:'true',eventid:1,eventname:'X-26',episodealertlevel:'Green',episodealertscore:1,fromdate:'2026-09-30T00:00:00',todate:'2026-10-03T00:00:00',datemodified:'2026-10-03T06:29:26',source:'JTWC',country:'',severitydata:{severitytext:'Tropical Storm'},url:{report:'https://www.gdacs.org/report.aspx?eventid=1'},...o}});
const GD={type:'FeatureCollection',features:[
gf({eventid:1001332,eventname:'CHOI-WAN-26',country:'Guam, Northern Mariana Islands'},[145.3,18.6]),
gf({eventid:1001321,eventname:'NOLO-26',source:'NOAA'},[-168.5,23.4]),
gf({eventid:1001327,eventname:'SURIGAE-26',todate:'2026-09-30T12:00:00'},[138.8,31.8]),
gf({eventid:1001324,eventname:'ODALYS-26',iscurrent:'false'},[130,20]),
gf({eventid:1001399,eventname:'ELSEWHERE-26',url:{report:'javascript:alert(1)'}},[120.5,15.2])]};
const SPEC=[{part:'title'},{advancedHours:0,pressure:'985',maximumWind:{sustained:{kt:'55','m/s':'28'},gust:{kt:'80','m/s':'40'}},category:{jp:'台風',en:'Typhoon'},scale:'大型',intensity:'強い',speed:{'km/h':'20',kt:'11'},course:'北北西',location:'マリアナ諸島'},{advancedHours:24,pressure:'975',maximumWind:{sustained:{kt:'65','m/s':'33'},gust:{kt:'90','m/s':'45'}},category:{en:'Typhoon'}},{advancedHours:48,pressure:'-',maximumWind:{sustained:{kt:'-'}}}];
const FC=[{part:'title',typhoonNumber:'2627',name:{jp:'チョーイワン',en:'Choi-wan'},issue:{JST:'2026-10-02T15:45:00+09:00'}},
{advancedHours:0,validtime:{UTC:'2026-10-02T06:00:00Z'},center:[18.6,145.3],galeWarningArea:{center:[18.6,145.3],radius:300000},stormWarningArea:{arc:[[[18.6,145.3],150000,[0,360]]]},track:{typhoon:[[17.5,146.2],[18.6,145.3]],preTyphoon:[[16.8,147.0],[17.5,146.2]]}},
{advancedHours:24,validtime:{UTC:'2026-10-03T06:00:00Z'},center:[21.0,143.5],probabilityCircle:{radius:90000},stormWarningArea:{arc:[[[21,143.5],200000,[10,200]]]}},
{advancedHours:48,validtime:{UTC:'2026-10-04T06:00:00Z'},center:[24.5,141.0],probabilityCircle:{radius:170000},stormWarningArea:{unknown:true}},
{advancedHours:72,center:[28,138]}];
describe('JMA normalisation',()=>{
it('parses analysis, forecasts, tracks and intensity with units kept',()=>{
const s=normJma(TARGETS[0],FC,SPEC);
expect(s.nameEn).toBe('Choi-wan');expect(s.number).toBe(27);expect(s.year).toBe(2026);expect(s.catName).toBe('Severe tropical storm');
expect(s.now?.lat).toBe(18.6);expect(s.now?.lon).toBe(145.3);expect(s.now?.pressure).toBe(985);expect(s.now?.windKt).toBe(55);expect(s.now?.gustMs).toBe(40);
expect(s.now?.scale).toBe('Large');expect(s.now?.intensity).toBe('Strong');expect(s.course).toBe('NNW');expect(s.speedKt).toBe(11);
expect(s.fc.map(f=>f.h)).toEqual([24,48]);expect(s.fc[0].prob).toBe(90000);expect(s.fc[1].pressure).toBeNull();expect(s.fc[1].windKt).toBeNull();
expect(s.gale[0].r).toBe(300000);expect(s.past.length).toBe(2);expect(s.pre.length).toBe(2)});
it('flags sectors, unknown geometry and dropped fixes instead of hiding them',()=>{
const s=normJma(TARGETS[0],FC,SPEC);
expect(s.fc[0].storm[0].partial).toBe(true);expect(s.fc[1].storm).toEqual([]);
expect(s.notes.some(x=>/not recognised/.test(x))).toBe(true);expect(s.notes.some(x=>/sectors/.test(x))).toBe(true);expect(s.notes.some(x=>/\+72 h/.test(x))).toBe(true)});
it('survives missing forecast and specifications',()=>{
const s=normJma(TARGETS[1],null,null);
expect(s.now).toBeNull();expect(s.fc).toEqual([]);expect(s.catName).toBe('Low pressure area');expect(s.notes.length).toBeGreaterThan(0)});
it('rejects impossible coordinates and absurd radii',()=>{
expect(circles({center:[120,300],radius:1000})).toEqual([]);expect(circles({center:[10,100],radius:9e9})).toEqual([]);expect(circles({arc:[[[10,100],5000,[0,360]]]})[0].partial).toBe(false)});
});
describe('GDACS normalisation',()=>{
it('keeps only current, recent, in-domain cyclones',()=>{
const g=normGdacs(GD,NOW);
expect(g.map(x=>x.name).sort()).toEqual(['CHOI-WAN-26','ELSEWHERE-26']);
const c=g.find(x=>x.name==='CHOI-WAN-26');expect(c?.agency).toBe('JTWC');expect(c?.lat).toBe(18.6);expect(c?.to).toBe(Date.UTC(2026,9,3,0,0,0)/1000)});
it('drops non-GDACS report links',()=>{const g=normGdacs(GD,NOW);expect(g.find(x=>x.name==='ELSEWHERE-26')?.report).toBe('');expect(g.find(x=>x.name==='CHOI-WAN-26')?.report).toMatch(/^https:\/\/www\.gdacs\.org\//)});
it('throws on a malformed body',()=>{expect(()=>normGdacs({},NOW)).toThrow()});
});
describe('matching',()=>{
it('matches by name then by distance, once each, and returns the rest',()=>{
const ss=[normJma(TARGETS[0],FC,SPEC)],g=normGdacs(GD,NOW),rest=matchGdacs(ss,g);
expect(ss[0].gdacs?.name).toBe('CHOI-WAN-26');expect(rest.map(x=>x.name)).toEqual(['ELSEWHERE-26']);
const t=normJma(TARGETS[0],[{part:'title',name:{en:''}},FC[1]],SPEC);
expect(matchGdacs([t],g).length).toBe(1);expect(t.gdacs?.name).toBe('CHOI-WAN-26')});
});
describe('HKO',()=>{
it('lists warnings in force and ignores cancelled ones',()=>{
const w=normHko({WTCSGNL:{name:'Tropical Cyclone Warning Signal',code:'TC3',actionCode:'ISSUE',issueTime:'2026-10-03T06:00:00+08:00',updateTime:'2026-10-03T06:00:00+08:00'},WHOT:{name:'Hot Weather Warning',code:'WHOT',actionCode:'CANCEL'}});
expect(w.length).toBe(1);expect(w[0].tc).toBe(true);expect(w[0].issued).not.toBeNull()});
it('treats an empty object as no warnings and rejects other shapes',()=>{expect(normHko({})).toEqual([]);expect(()=>normHko([])).toThrow();expect(()=>normHko(null)).toThrow()});
});
describe('geometry',()=>{
const s=normJma(TARGETS[0],FC,SPEC) as Storm;
it('rings are closed and have the requested radius',()=>{
const r=ring(20,130,100000);expect(r[0]).toEqual(r[r.length-1]);
for(const p of r)expect(Math.abs(hav(20,130,p[1],p[0])-100)).toBeLessThan(0.5)});
it('interpolates in time only between analysis and last forecast',()=>{
const f=fixes(s);expect(posAt(s,f[0].t-1)).toBeNull();expect(posAt(s,f[f.length-1].t+1)).toBeNull();
const m=posAt(s,(f[0].t+f[1].t)/2);expect(m?.lat).toBeGreaterThan(18.6);expect(m?.lat).toBeLessThan(21);
const a=posAt(s,f[1].t);expect(Math.abs((a?.lat??0)-21)).toBeLessThan(1e-6)});
it('track starts at the analysis and ends at the last forecast',()=>{const t=track(s),f=fixes(s);expect(t[0]).toEqual([f[0].lon,f[0].lat]);expect(t[t.length-1][1]).toBeCloseTo(f[f.length-1].lat,6)});
it('finds closest approach and circle membership',()=>{
const a=approach(s,21.0,143.5);expect(a?.minKm).toBeLessThan(1);expect(a?.inCircle?.h).toBe(24);
const far=approach(s,5,100);expect(far?.inCircle).toBeNull();expect(far?.inWarn).toBeNull();expect((far?.minKm??0)>1000).toBe(true)});
});
describe('/api/tc',()=>{
const ok=(b:unknown)=>new Response(JSON.stringify(b),{status:200});
const net=(over:Record<string,()=>Response>={})=>vi.fn(async(u:string)=>{
for(const[k,f]of Object.entries(over))if(u.includes(k))return f();
if(u.includes('targetTc.json'))return ok(TARGETS);
if(u.includes('/TC2633/forecast.json'))return ok(FC);
if(u.includes('/TC2633/specifications.json'))return ok(SPEC);
if(u.includes('gdacs.org'))return ok({...GD,features:GD.features.map(f=>({...f,properties:{...f.properties,todate:new Date().toISOString().slice(0,19)}}))});
if(u.includes('weather.gov.hk'))return ok({});
return new Response('nf',{status:404})});
it('combines the three sources and notes a per-system failure',async()=>{
vi.stubGlobal('fetch',net());
const r=mkRes();await tcApi({},r);
expect(r.code).toBe(200);expect(r.headers['Cache-Control']).toMatch(/s-maxage=300/);
expect(r.body.sources.map((x:any)=>x.id+':'+x.ok)).toEqual(['jma:true','gdacs:true','hko:true','jtwc:false']);
const a=r.body.storms.find((x:Storm)=>x.id==='TC2633'),b=r.body.storms.find((x:Storm)=>x.id==='TC2632');
expect(a.gdacs?.name).toBe('CHOI-WAN-26');expect(a.now.windKt).toBe(55);
expect(b.notes.join(' ')).toMatch(/forecast\.json unavailable: HTTP 404/);
expect(r.body.warnings).toEqual([])});
it('reports a failed source without pretending there are no storms',async()=>{
vi.stubGlobal('fetch',net({'targetTc.json':()=>new Response('x',{status:503})}));
const r=mkRes();await tcApi({},r);
expect(r.code).toBe(200);expect(r.body.sources[0]).toMatchObject({id:'jma',ok:false,msg:'HTTP 503'});expect(r.body.storms).toEqual([])});
it('rejects ids that are not TC plus digits',async()=>{
const f=net({'targetTc.json':()=>ok([{tropicalCyclone:'../x',typhoonNumber:'1',category:'TY',issue:''}])});
vi.stubGlobal('fetch',f);const r=mkRes();await tcApi({},r);
expect(r.body.storms).toEqual([]);expect(f.mock.calls.some(c=>String(c[0]).includes('..'))).toBe(false)});
it('returns 502 when every source fails',async()=>{
vi.stubGlobal('fetch',vi.fn(async()=>new Response('x',{status:500})));
const r=mkRes();await tcApi({},r);expect(r.code).toBe(502);expect(r.body.sources.length).toBe(3)});
it('probe reports each candidate with its status and never throws',async()=>{
vi.stubGlobal('fetch',vi.fn(async(u:string)=>{if(u.includes('jma.go.jp'))return new Response('[]',{status:200,headers:{'content-type':'application/json'}});throw new Error('connect ETIMEDOUT')}));
const r=mkRes();await probe({},r);
expect(r.code).toBe(200);expect(r.body.results.length).toBe(6);
expect(r.body.results[0]).toMatchObject({id:'jma-targets',ok:true,http:200});
expect(r.body.results[3]).toMatchObject({ok:false,http:null,head:'connect ETIMEDOUT'})});
});
