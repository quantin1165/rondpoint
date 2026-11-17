'use strict';
/* RondPoint · 11.65Lab — application de pilotage */

/* ---------- Constantes ---------- */
const STAGES = ['Estimation','Devis envoyé','Signé','Pré-production','Production','Post-production','Facturation','Clôturé'];
const STAGE_SHORT = ['Estimation','Devis envoyé','Signé','Pré-prod','Production','Post-prod','Facturation','Clôturé'];
const CHAPS = ['Préparation','Équipe technique','Équipe artistique','Matériel image','Son','Lumière','Régie & transport','Post-production','Frais divers'];
const UNITS = ['j','h','forfait','u','repas','km'];
const TYPES = ['Captation live','Film corporate','Témoignage client','Événementiel','Plateau','Post-production','Film promo','Location seule'];
const STATUTS = ['intermittent','freelance','prestataire','interne'];
const INV_ST = ['à émettre','émise','payée','en retard'];
const KINDS = ['client','project','person','gear','res','doc'];
const TODAY = (() => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString().slice(0,10); })();

/* ---------- État ---------- */
const DB = {client:[], project:[], person:[], gear:[], res:[], doc:[]};
/* Points d'extension des modules */
const SETTINGS_PANELS = [], DASH_PANELS = [], CLIENT_PANELS = [], CLIENT_HEAD = [], VIEWS = {}, ACTIONS = {}, BINDS = {}, SUBMITS = {}, EXTRA_ALERTS = [], PTABS = [['apercu','Aperçu'],['budget','Budget']], PTAB_FN = {};
const VER = {};
let SET = {id:'main', coef:1.65, dayH:8};
const SETX = {};
let FILES = [], USERS = [], ME = null, CSRF = '', MAXUP = 0;
const lsGet = k => { try { return localStorage.getItem(k); } catch { return null; } };
const lsSet = (k,v) => { try { localStorage.setItem(k,v); } catch {} };
let UNIT = lsGet('rp_unit') === 'h' ? 'h' : 'j';
const UI = { projFilter:'cours', group:true, timePerson:'all' };

/* ---------- Serveur ---------- */
async function api(a, body){
  const isForm = body instanceof FormData;
  const opt = {method: body === undefined ? 'GET' : 'POST', credentials:'same-origin', headers:{'X-CSRF': CSRF}};
  if (body !== undefined){ if (isForm) opt.body = body; else { opt.headers['Content-Type'] = 'application/json'; opt.body = JSON.stringify(body); } }
  let r, j = {};
  try { r = await fetch('api.php?a=' + a, opt); } catch { return {ok:false, status:0, error:'Connexion impossible : vérifiez votre accès Internet.'}; }
  try { j = await r.json(); } catch {}
  if (r.status === 401 && a !== 'login' && a !== 'me' && a !== 'password'){ ME = null; showLogin('Votre session a expiré, reconnectez-vous.'); }
  return {...j, ok: r.ok, status: r.status};
}
const uid = () => { const b = new Uint8Array(8); crypto.getRandomValues(b); return Array.from(b, x => (x % 36).toString(36)).join('') + Date.now().toString(36).slice(-4); };

function normProject(p){
  ['dl','lines','time','exp','inv','crew','sheets','deliv','versions'].forEach(k => { if (!Array.isArray(p[k])) p[k] = []; });
  if (!p.quote || typeof p.quote !== 'object') p.quote = {st: p.stage >= 2 ? 'accepté' : p.stage === 1 ? 'envoyé' : 'brouillon', level:'chapitre', prob:50};
  if (typeof p.stage !== 'number') p.stage = 0;
  return p;
}
async function loadAll(){
  const r = await api('bootstrap'); if (!r.ok) return false;
  KINDS.forEach(k => { DB[k] = []; });
  Object.keys(VER).forEach(k => delete VER[k]);
  KINDS.forEach(k => (r.entities[k] || []).forEach(e => { const d = k === 'project' ? normProject(e.d) : e.d; DB[k].push(d); VER[k + ':' + d.id] = e.v; }));
  (r.entities.setting || []).forEach(e => { if (!e.d) return; if (e.d.id === 'main'){ SET = {...SET, ...e.d}; VER['setting:main'] = e.v; } else { SETX[e.d.id] = e.d; VER['setting:' + e.d.id] = e.v; } });
  FILES = r.files || []; USERS = r.users || [];
  return true;
}

let pendingN = 0;
const timers = {}, chains = {};
function sync(state){ const el = document.getElementById('sync'); if (!el) return; el.className = 'sync ' + state; el.textContent = state === 'saving' ? 'Enregistrement…' : state === 'error' ? 'Non enregistré' : 'Tout est enregistré'; }
function persist(kind, obj, delay = 0){
  const k = kind + ':' + obj.id;
  if (!timers[k]) pendingN++;
  clearTimeout(timers[k]); sync('saving');
  timers[k] = setTimeout(() => { delete timers[k]; chains[k] = (chains[k] || Promise.resolve()).then(() => doSave(kind, obj)).finally(() => { pendingN--; if (!pendingN) sync('saved'); }); }, delay);
}
async function doSave(kind, obj){
  const k = kind + ':' + obj.id;
  const r = await api('save', {kind, id: obj.id, data: obj, version: VER[k] || 0});
  if (r.ok){ VER[k] = r.version; return; }
  if (r.status === 409){ applyRemote(kind, obj.id, r.current); toast('Cet élément venait d’être modifié par quelqu’un d’autre : la version à jour est affichée.'); render(); return; }
  if (r.status !== 401){ sync('error'); toast(r.error || 'Enregistrement impossible.'); }
}
function applyRemote(kind, id, cur){
  const k = kind + ':' + id;
  if (kind === 'setting'){ if (cur){ SET = {...SET, ...cur.d}; VER[k] = cur.v; } return; }
  const arr = DB[kind], i = arr.findIndex(x => x.id === id);
  if (!cur){ if (i >= 0) arr.splice(i,1); delete VER[k]; return; }
  const d = kind === 'project' ? normProject(cur.d) : cur.d;
  if (i >= 0) arr[i] = d; else arr.push(d);
  VER[k] = cur.v;
}
async function create(kind, obj){
  DB[kind].push(obj);
  const r = await api('save', {kind, id: obj.id, data: obj, version: 0});
  if (r.ok){ VER[kind + ':' + obj.id] = r.version; return true; }
  DB[kind] = DB[kind].filter(x => x !== obj); toast(r.error || 'Création impossible.'); return false;
}
async function removeEnt(kind, obj){
  const k = kind + ':' + obj.id;
  const r = await api('delete', {kind, id: obj.id, version: VER[k] || 0});
  if (r.ok){ DB[kind] = DB[kind].filter(x => x.id !== obj.id); delete VER[k]; return true; }
  if (r.status === 409){ applyRemote(kind, obj.id, r.current); toast('Cet élément venait d’être modifié : vérifiez-le avant de le supprimer.'); render(); return false; }
  toast(r.error || 'Suppression impossible.'); return false;
}
window.addEventListener('beforeunload', e => { if (pendingN > 0){ e.preventDefault(); e.returnValue = ''; } });
document.addEventListener('visibilitychange', async () => {
  if (document.visibilityState !== 'visible' || !ME || pendingN > 0 || document.getElementById('dlg').open) return;
  const a = document.activeElement; if (a && /INPUT|SELECT|TEXTAREA/.test(a.tagName)) return;
  if (await loadAll()) render();
});

/* ---------- Calculs ---------- */
const byId = (arr,id) => arr.find(x => x.id === id);
const P = id => byId(DB.person,id) || {id, name:'(intervenant supprimé)', role:'', st:'freelance', rate:0};
const C = id => byId(DB.client,id) || {id, name:'(client supprimé)', sector:'', contact:'', role:''};
const PR = id => byId(DB.project,id);
const G = id => byId(DB.gear,id) || {id, name:'(matériel supprimé)', cat:'', stock:0, val:0};
const dayNum = s => Date.parse(s + 'T00:00:00Z') / 864e5;
const diffDays = s => dayNum(s) - dayNum(TODAY);
const charge = u => u && u.st === 'intermittent' ? (+SET.coef || 1) : 1;
const lineCost = l => (+l.qty || 0) * (+l.cost || 0) * (l.p ? charge(P(l.p)) : 1);
const lineSale = l => lineCost(l) * (+l.coef || 0);
const tDays = e => e.unit === 'h' ? (+e.qty || 0) / (+SET.dayH || 8) : (+e.qty || 0);
const dayCost = u => (+u.rate || 0) * charge(u);
const tCost = e => tDays(e) * dayCost(P(e.p));
const timeChap = (p,e) => { const l = p.lines.find(l => l.p === e.p); return l ? l.ch : (P(e.p).st === 'interne' ? 'Préparation' : 'Équipe technique'); };
const chapList = p => CHAPS.filter(ch => p.lines.some(l => l.ch === ch)).concat([...new Set(p.lines.map(l => l.ch))].filter(ch => !CHAPS.includes(ch)));

function chapters(p){
  const m = {}; const get = ch => m[ch] || (m[ch] = {ch, plan:0, sold:0, real:0});
  p.lines.forEach(l => { const c = get(l.ch); c.plan += lineCost(l); c.sold += lineSale(l); if (l.g && p.stage >= 4) c.real += lineCost(l); });
  p.time.forEach(e => get(timeChap(p,e)).real += tCost(e));
  p.exp.forEach(e => get(e.ch || 'Frais divers').real += (+e.amt || 0));
  const keys = CHAPS.filter(k => m[k]).concat(Object.keys(m).filter(k => !CHAPS.includes(k)));
  return keys.map(k => { const c = m[k];
    c.land = p.stage === 7 ? c.real : p.stage === 6 ? (c.real > 0 ? c.real : c.plan) : Math.max(c.plan, c.real);
    return c; });
}
function fin(p){
  const ch = chapters(p);
  const sold = ch.reduce((a,c) => a + c.sold, 0), plan = ch.reduce((a,c) => a + c.plan, 0),
        real = ch.reduce((a,c) => a + c.real, 0), land = ch.reduce((a,c) => a + c.land, 0);
  const inv = p.inv.map(i => ({...i, amt: (+i.pct || 0) / 100 * sold}));
  const billed = inv.filter(i => i.st !== 'à émettre').reduce((a,i) => a + i.amt, 0);
  const paid = inv.filter(i => i.st === 'payée').reduce((a,i) => a + i.amt, 0);
  return {ch, sold, plan, real, land, mPlan: sold - plan, mLand: sold - land,
    rPlan: sold ? (sold - plan) / sold : 0, rLand: sold ? (sold - land) / sold : 0, inv, billed, paid, toBill: sold - billed};
}
const toDays = l => l.unit === 'h' ? (+l.qty || 0) / (+SET.dayH || 8) : l.unit === 'j' ? (+l.qty || 0) : 0;
const budgetDays = (p,u) => p.lines.filter(l => l.p === u).reduce((a,l) => a + toDays(l), 0);
const loggedDays = (p,u) => p.time.filter(e => e.p === u).reduce((a,e) => a + tDays(e), 0);
const crew = p => [...new Set(p.lines.filter(l => l.p).map(l => l.p).concat(p.time.map(e => e.p)))].map(P);
const nextDl = p => p.dl.filter(d => !d.x && d.d).sort((a,b) => a.d.localeCompare(b.d))[0];
const overlap = (a1,a2,b1,b2) => a1 <= b2 && b1 <= a2;
const projFiles = (p, tag='doc') => FILES.filter(f => f.project_id === p.id && f.tag === tag);
const shortTitle = t => String(t || '').split(' — ')[0];

function gearConflicts(){
  const out = [];
  DB.gear.forEach(g => {
    const rs = DB.res.filter(r => r.g === g.id && r.f && r.t && PR(r.p));
    const days = new Set(); rs.forEach(r => { for (let d = dayNum(r.f); d <= dayNum(r.t) && d - dayNum(r.f) < 400; d++) days.add(d); });
    [...days].sort((a,b) => a - b).forEach(d => {
      const on = rs.filter(r => dayNum(r.f) <= d && d <= dayNum(r.t)); const q = on.reduce((a,r) => a + (+r.q || 0), 0);
      if (q > (+g.stock || 0)) out.push({g, day: new Date(d * 864e5).toISOString().slice(0,10), q, list: on});
    });
  });
  return out;
}
function crewConflicts(){
  if (typeof bookingConflicts === 'function') return bookingConflicts();
  const out = []; const act = DB.project.filter(p => p.shoot && p.shoot[0] && p.stage < 7);
  DB.person.forEach(u => {
    const ps = act.filter(p => p.lines.some(l => l.p === u.id && !['Préparation','Post-production'].includes(l.ch)));
    for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++){
      const a1 = ps[i].shoot[0], a2 = ps[i].shoot[1] || a1, b1 = ps[j].shoot[0], b2 = ps[j].shoot[1] || b1;
      if (overlap(a1,a2,b1,b2)) out.push({u, a: ps[i], b: ps[j], day: a1 > b1 ? a1 : b1});
    }
  });
  return out;
}
function alertsFor(p){
  const f = fin(p), out = [];
  f.inv.filter(i => i.st === 'en retard' || (i.st === 'émise' && i.d && diffDays(i.d) < 0)).forEach(i => out.push({lv:'bad', p, t:`${i.l} en retard de paiement`, s:`${eur(i.amt)} · échéance ${dshort(i.d)}`}));
  p.dl.filter(d => !d.x && d.d && diffDays(d.d) < 0).forEach(d => out.push({lv:'bad', p, t:`Échéance dépassée : ${d.l}`, s:`prévue le ${dshort(d.d)}`}));
  f.ch.filter(c => c.plan > 0 && c.real > c.plan * 1.05).forEach(c => out.push({lv:'warn', p, t:`${c.ch} : ${eur(c.real)} engagés pour ${eur(c.plan)} prévus`, s:`dépassement de ${pct((c.real - c.plan) / c.plan)}`}));
  crew(p).forEach(u => { const b = budgetDays(p,u.id), g = loggedDays(p,u.id); if (b > 0 && g > b + 1e-9) out.push({lv:'warn', p, t:`${u.name} : ${tfmt(g)} saisis pour ${tfmt(b)} budgétés`, s:u.role}); });
  if (p.stage >= 2 && p.inv.length){ const s = p.inv.reduce((a,i) => a + (+i.pct || 0), 0); if (Math.abs(s - 100) > .5) out.push({lv:'warn', p, t:`L’échéancier de facturation couvre ${num(s)} % du projet`, s:'ajustez les pourcentages pour arriver à 100 %'}); }
  return out;
}

/* ---------- Format ---------- */
const nf0 = new Intl.NumberFormat('fr-FR',{style:'currency',currency:'EUR',maximumFractionDigits:0});
const nf2 = new Intl.NumberFormat('fr-FR',{style:'currency',currency:'EUR',minimumFractionDigits:2,maximumFractionDigits:2});
const eur = n => nf0.format(Math.round(n || 0));
const eurC = n => Number.isInteger(Math.round((n || 0) * 100) / 100) ? eur(n) : nf2.format(n);
const num = (n,d=1) => new Intl.NumberFormat('fr-FR',{maximumFractionDigits:d}).format(n || 0);
const pct = n => isFinite(n) ? num(n * 100, 0) + ' %' : '—';
const toNum = s => { const v = parseFloat(String(s ?? '').replace(/[\s  €%]/g,'').replace(',','.')); return isNaN(v) ? NaN : v; };
const dshort = s => s ? new Date(s + 'T12:00:00Z').toLocaleDateString('fr-FR',{day:'numeric',month:'short',timeZone:'UTC'}) : '—';
const dlong = s => new Date(s + 'T12:00:00Z').toLocaleDateString('fr-FR',{weekday:'long',day:'numeric',month:'long',year:'numeric',timeZone:'UTC'});
const tfmt = days => UNIT === 'h' ? num(days * (+SET.dayH || 8)) + ' h' : num(days) + ' j';
const fmtSize = b => b >= 1073741824 ? num(b / 1073741824) + ' Go' : b >= 1048576 ? num(b / 1048576) + ' Mo' : num(Math.max(1, b / 1024), 0) + ' Ko';
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const numIn = n => (n === '' || n == null || isNaN(n)) ? '' : String(n).replace('.', ',');
function stagePill(i){ const cls = i === 4 ? 'live' : i === 6 ? 'warn' : i === 7 ? 'good' : i >= 2 ? 'acc' : ''; return `<span class="pill ${cls}">${STAGE_SHORT[i] || '—'}</span>`; }
function deltaChip(a,b){ const d = (b - a) * 100; const cls = d >= -1 ? 'good' : d >= -6 ? 'warn' : 'bad'; return `<span class="delta ${cls}">${d >= 0 ? '+' : '−'}${num(Math.abs(d),0)} pts</span>`; }
function dueLabel(d){ if (!d) return '—'; const n = diffDays(d); if (n === 0) return "aujourd'hui"; if (n === 1) return 'demain'; if (n < 0) return `il y a ${-n} j`; if (n < 7) return `dans ${n} j`; return dshort(d); }
function toast(msg){ const t = document.getElementById('toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('on'), 3200); }
const fileUrl = f => (window.rpBlobUrl && window.rpBlobUrl(f.id)) || 'api.php?a=file&id=' + encodeURIComponent(f.id);

/* ---------- Fenêtre de saisie ---------- */
function fieldHtml(f, val){
  const id = 'f_' + f.k, v = val ?? f.def ?? '', req = f.required ? 'required' : '';
  let ctl;
  if (f.type === 'select') ctl = `<select id="${id}" name="${f.k}" ${req}>${f.options.map(([ov,ol]) => `<option value="${esc(ov)}" ${String(ov) === String(v) ? 'selected' : ''}>${esc(ol)}</option>`).join('')}</select>`;
  else if (f.type === 'textarea') ctl = `<textarea id="${id}" name="${f.k}" rows="4" ${req}>${esc(v)}</textarea>`;
  else if (f.type === 'number') ctl = `<input id="${id}" name="${f.k}" type="text" inputmode="decimal" value="${esc(numIn(v))}" ${req}>`;
  else ctl = `<input id="${id}" name="${f.k}" type="${f.type || 'text'}" value="${esc(v)}" ${req} ${f.minlength ? `minlength="${f.minlength}"` : ''} autocomplete="${f.ac || 'off'}">`;
  return `<div class="field ${f.full ? 'full' : ''}"><label for="${id}">${esc(f.label)}</label>${ctl}${f.hint ? `<small>${esc(f.hint)}</small>` : ''}</div>`;
}
function formDialog({title, fields, values = {}, submit = 'Enregistrer', onSubmit, onDelete}){
  const dlg = document.getElementById('dlg');
  dlg.innerHTML = `<form class="dform" novalidate><header><h2>${esc(title)}</h2><button type="button" class="x" data-close aria-label="Fermer">×</button></header>
    <div class="dgrid">${fields.map(f => fieldHtml(f, values[f.k])).join('')}</div><p class="derr" hidden></p>
    <footer>${onDelete ? '<button type="button" class="btn danger" data-del>Supprimer</button>' : ''}<span style="flex:1"></span><button type="button" class="btn ghost" data-close>Annuler</button><button class="btn pri" type="submit">${esc(submit)}</button></footer></form>`;
  const form = dlg.querySelector('form'), err = form.querySelector('.derr');
  const fail = m => { err.textContent = m; err.hidden = false; };
  form.onsubmit = async e => {
    e.preventDefault(); err.hidden = true;
    const v = {};
    for (const f of fields){
      const el = form.elements[f.k]; if (!el) continue;
      const raw = el.value.trim();
      if (f.required && raw === '') return fail(`Renseignez « ${f.label} ».`);
      if (f.type === 'number'){ v[f.k] = raw === '' ? (f.def ?? 0) : toNum(raw); if (isNaN(v[f.k])) return fail(`« ${f.label} » doit être un nombre, par exemple 42,50.`); }
      else v[f.k] = f.type === 'password' ? el.value : raw;
    }
    const btn = form.querySelector('[type=submit]'); btn.disabled = true;
    let res; try { res = await onSubmit(v); } catch (x) { res = String(x.message || x); }
    btn.disabled = false;
    if (typeof res === 'string') return fail(res);
    dlg.close();
  };
  dlg.querySelectorAll('[data-close]').forEach(b => b.onclick = () => dlg.close());
  if (onDelete) form.querySelector('[data-del]').onclick = async () => { if (!confirm('Supprimer définitivement ?')) return; const r = await onDelete(); if (r !== false){ dlg.close(); render(); } };
  dlg.showModal();
  const first = form.querySelector('.dgrid input, .dgrid select, .dgrid textarea'); if (first) first.focus();
}

/* ---------- Connexion ---------- */
function brandHtml(){ return `<div class="brand"><div><b class="wm" role="img" aria-label="11.65Lab">11<i></i>65Lab</b><span>RondPoint</span></div></div>`; }
function showLogin(msg){
  document.getElementById('dlg').open && document.getElementById('dlg').close();
  document.getElementById('root').innerHTML = `<div class="login"><form id="login">${brandHtml()}
    <div class="field"><label for="l-mail">E-mail</label><input id="l-mail" type="email" name="email" autocomplete="username" required></div>
    <div class="field"><label for="l-pass">Mot de passe</label><input id="l-pass" type="password" name="password" autocomplete="current-password" required></div>
    <p class="derr" ${msg ? '' : 'hidden'}>${esc(msg || '')}</p>
    <button class="btn pri" type="submit">Se connecter</button></form></div>`;
  const f = document.getElementById('login');
  f.onsubmit = async e => {
    e.preventDefault(); const b = f.querySelector('button'); b.disabled = true;
    const r = await api('login', {email: f.email.value, password: f.password.value});
    b.disabled = false;
    if (!r.ok){ const p = f.querySelector('.derr'); p.textContent = r.error || 'Connexion impossible.'; p.hidden = false; return; }
    boot();
  };
  document.getElementById('l-mail').focus();
}
async function boot(){
  const r = await api('me');
  if (!r.ok){
    if (r.install){ document.getElementById('root').innerHTML = `<div class="login"><form>${brandHtml()}<p>RondPoint n’est pas encore installé.</p><a class="btn pri" href="install.php">Lancer l’installation</a></form></div>`; return; }
    return showLogin();
  }
  ME = r.user; CSRF = r.csrf; MAXUP = r.maxUpload || 0;
  document.getElementById('root').innerHTML = '<p class="loading">Chargement des données…</p>';
  if (!(await loadAll())){ document.getElementById('root').innerHTML = '<p class="loading">Impossible de charger les données. Rechargez la page.</p>'; return; }
  document.getElementById('root').innerHTML = `<div class="app"><aside class="side">${brandHtml()}<nav class="nav" id="nav" aria-label="Navigation principale"></nav>
    <div class="side-foot"><span id="sync" class="sync saved">Tout est enregistré</span><span><b>${esc(ME.name)}</b></span><button class="btn sm ghost" data-act="logout" style="align-self:flex-start;padding-left:0">Se déconnecter</button></div></aside><main id="main"></main></div>`;
  lastRoute = ''; render();
}

/* ---------- Navigation ---------- */
const NAV = [['','',[['accueil','Accueil'],['dashboard','Tableau de bord']]],['Production','',[['clients','Clients'],['projets','Projets'],['planning','Planning'],['temps','Temps passé']]],['Finance','',[['devis','Devis'],['factures','Facturation'],['treso','Trésorerie']]],['Ressources','',[['equipe','Intervenants'],['materiel','Matériel'],['documents','Documents']]],['','',[['parametres','Paramètres']]]];
let lastRoute = '';
function route(){ const h = (location.hash || '#accueil').slice(1).split('-'); return {v: h[0] || 'accueil', id: h[1], tab: h[2] || 'apercu'}; }
function render(){
  if (!ME || !document.getElementById('main')) return;
  const r = route(), key = location.hash;
  const navKey = r.v === 'projet' ? 'projets' : r.v === 'client' ? 'clients' : r.v;
  const counts = {clients: DB.client.length, projets: DB.project.filter(p => p.stage >= 2 && p.stage < 7).length};
  document.getElementById('nav').innerHTML = NAV.map(([g,,items]) => (g ? `<span class="nav-g">${g}</span>` : '') + items.filter(([k]) => k === 'dashboard' || k === 'parametres' || k === 'accueil' || ['clients','projets','temps','equipe','materiel'].includes(k) || VIEWS[k]).map(([k,l]) => `<button data-go="${k}" ${k === navKey ? 'aria-current="page"' : ''}>${l}${counts[k] ? `<span class="count">${counts[k]}</span>` : ''}</button>`).join('')).join('');
  if (r.v === 'portail' || r.v === 'equipier') document.querySelector('.app').classList.add('portal'); else document.querySelector('.app').classList.remove('portal');
  const V = {dashboard:vDash, clients:vClients, client:vClient, projets:vProjects, projet:vProject, temps:vTime, equipe:vTeam, materiel:vGear, parametres:vSettings, ...VIEWS}[r.v] || vDash;
  document.getElementById('main').innerHTML = V(r);
  if (key !== lastRoute){ window.scrollTo(0,0); lastRoute = key; }
}
window.addEventListener('hashchange', render);

/* ---------- Tableau de bord ---------- */
function vDash(){
  const head = `<header class="ph"><div><p class="eyebrow">${dlong(TODAY)}</p><h1>Tableau de bord</h1></div>${DB.client.length ? '<button class="btn pri" data-act="project-new">Nouveau projet</button>' : ''}</header>`;
  if (!DB.project.length && !(SETX.tiime && SETX.tiime.factures)) return head + `<section class="panel empty-hero"><div class="panel-b">
    <h2>${DB.client.length ? 'Créez votre premier projet' : 'Commencez par vos clients'}</h2>
    <p class="mut">Le tableau de bord se remplit au fur et à mesure : chiffre d’affaires signé, encaissements, marge prévue et réelle, échéances et alertes.</p>
    <p class="mut">Ajoutez aussi vos intervenants et votre matériel : ils servent à construire les budgets en quelques clics.</p>
    <div class="chips" style="margin-top:6px">${DB.client.length ? '<button class="btn pri" data-act="project-new">Créer un projet</button>' : '<button class="btn pri" data-act="client-new">Créer un client</button>'}<button class="btn" data-go="equipe">Intervenants</button><button class="btn" data-go="materiel">Matériel</button></div></div></section>`;
  const act = DB.project.filter(p => p.stage >= 2 && p.stage < 7);
  const signed = DB.project.filter(p => p.stage >= 2);
  const F = signed.map(fin);
  const ca = F.reduce((a,f) => a + f.sold, 0), paid = F.reduce((a,f) => a + f.paid, 0);
  const due = F.reduce((a,f) => a + f.billed - f.paid, 0);
  const late = signed.flatMap(p => alertsFor(p).filter(a => a.t.includes('retard de paiement')));
  const lateAmt = F.flatMap(f => f.inv).filter(i => i.st === 'en retard' || (i.st === 'émise' && i.d && diffDays(i.d) < 0)).reduce((a,i) => a + i.amt, 0);
  const mp = F.reduce((a,f) => a + f.mPlan, 0) / (ca || 1), ml = F.reduce((a,f) => a + f.mLand, 0) / (ca || 1);
  const pipe = DB.project.filter(p => p.stage === 1).reduce((a,p) => a + fin(p).sold, 0);
  const al = DB.project.filter(p => p.stage < 7).flatMap(alertsFor);
  gearConflicts().forEach(c => al.push({lv:'bad', t:`${c.g.name} : ${c.q} réservés pour ${c.g.stock} en stock`, s:`le ${dshort(c.day)} · ${c.list.map(r => PR(r.p).code).join(' + ')}`}));
  crewConflicts().forEach(c => al.push({lv:'bad', t:`${c.u.name} prévu(e) sur deux projets`, s:`le ${dshort(c.day)} · ${c.a.code} et ${c.b.code}`}));
  EXTRA_ALERTS.forEach(fn => { try { al.push(...fn()); } catch (x) { console.error(x); } });
  al.sort((a,b) => (a.lv === 'bad' ? 0 : 1) - (b.lv === 'bad' ? 0 : 1));
  const dls = DB.project.flatMap(p => p.dl.filter(d => !d.x && d.d && diffDays(d.d) <= 14).map(d => ({...d, p}))).sort((a,b) => a.d.localeCompare(b.d));
  return head + `
  <section class="kpis">
    <div class="kpi"><span class="k-l">CA signé</span><strong>${eur(ca)}</strong><span class="k-s">${signed.length} projets signés, ${act.length} en cours${pipe ? ` · ${eur(pipe)} en devis` : ''}</span></div>
    <div class="kpi"><span class="k-l">Encaissé</span><strong>${eur(paid)}</strong><span class="k-s">${pct(paid / (ca || 1))} du signé</span></div>
    <div class="kpi"><span class="k-l">Factures en attente</span><strong>${eur(due)}</strong><span class="k-s ${late.length ? 'bad' : ''}">${late.length ? `dont ${eur(lateAmt)} en retard` : 'aucun retard'}</span></div>
    <div class="kpi"><span class="k-l">Marge brute</span><strong>${pct(ml)}</strong><span class="k-s">atterrissage, pour ${pct(mp)} prévue</span></div>
  </section>
  <div class="grid2">
    <div class="stack">
      ${DASH_PANELS.map(fn => fn()).join('')}
      ${act.length ? `<section class="panel"><div class="panel-h"><h2>Marge par projet en cours</h2>
        <div class="legend"><span><i class="lg-pl"></i>prévue au budget</span><span><i class="lg-ld"></i>atterrissage</span></div></div>
        <div class="panel-b">${marginChart(act)}</div></section>` : ''}
      <section class="panel"><div class="panel-h"><h2>Projets en cours</h2><button class="btn sm ghost" data-go="projets">Tous les projets</button></div>
        <div class="tw"><table><thead><tr><th>Projet</th><th>Client</th><th>Étape</th><th>Prochaine échéance</th><th class="num">Reste à facturer</th></tr></thead><tbody>
        ${act.map(p => { const n = nextDl(p), f = fin(p); return `<tr class="link" data-go="projet-${p.id}"><td><span class="t-code">${esc(p.code)}</span><span class="t-title">${esc(p.title)}</span></td>
          <td class="mut">${esc(C(p.c).name)}</td><td>${stagePill(p.stage)}</td><td>${n ? `${esc(n.l)}<span class="tag">${dueLabel(n.d)}</span>` : '<span class="mut">—</span>'}</td><td class="num">${eur(f.toBill)}</td></tr>`; }).join('') || '<tr><td colspan="5" class="empty">Aucun projet signé en cours.</td></tr>'}
        </tbody></table></div></section>
    </div>
    <div class="stack">
      <section class="panel"><div class="panel-h"><h2>À surveiller</h2><span class="mut">${al.length} point${al.length > 1 ? 's' : ''}</span></div>
        <div class="panel-b">${al.length ? al.map(a => `<div class="alert"><span class="dot ${a.lv === 'bad' ? 'bad' : ''}"></span><div><p>${esc(a.t)}</p><small>${a.p ? `<button class="crumb" data-go="projet-${a.p.id}">${esc(a.p.code)}</button> · ` : ''}${esc(a.s)}</small></div></div>`).join('') : '<p class="empty">Rien à signaler.</p>'}</div></section>
      <section class="panel"><div class="panel-h"><h2>Échéances à 14 jours</h2></div>
        <div class="panel-b"><ul class="list">${dls.map(d => `<li><span class="when ${diffDays(d.d) < 0 ? 'bad' : ''}">${dueLabel(d.d)}</span><div class="grow">${esc(d.l)}<span class="tag"><button class="crumb" data-go="projet-${d.p.id}">${esc(d.p.code)}</button> · ${esc(C(d.p.c).name)}</span></div></li>`).join('') || '<li class="empty">Aucune échéance.</li>'}</ul></div></section>
    </div>
  </div>`;
}
function marginChart(list){
  const top = Math.max(.6, ...list.map(p => { const f = fin(p); return Math.max(f.rPlan, f.rLand); }));
  const max = Math.ceil(top * 5) / 5, x = v => Math.max(0, Math.min(v, max)) / max * 100;
  const ticks = []; for (let t = 0; t <= max + 1e-9; t += .2) ticks.push(Math.round(t * 10) / 10);
  return `<div class="mchart">${list.map(p => { const f = fin(p); const col = f.rLand >= f.rPlan - .01 ? 'var(--good)' : f.rLand >= f.rPlan - .06 ? 'var(--warn)' : 'var(--bad)';
    return `<div class="mrow"><span class="nm" title="${esc(p.title)}">${esc(shortTitle(p.title))}</span>
      <div class="mtrack">${ticks.map(t => `<span class="gl" style="left:${x(t)}%"></span>`).join('')}<span class="pl" style="width:${x(f.rPlan)}%"></span><span class="ld" style="width:${x(f.rLand)}%;background:${col}"></span></div>
      <span class="vals">${pct(f.rLand)} ${deltaChip(f.rPlan, f.rLand)}</span></div>`; }).join('')}
    <div class="maxis"><span></span><div class="ticks">${ticks.map(t => `<span style="left:${x(t)}%">${Math.round(t * 100)} %</span>`).join('')}</div><span></span></div></div>`;
}

/* ---------- Clients ---------- */
function vClients(){
  return `<header class="ph"><div><p class="eyebrow">${DB.client.length} client${DB.client.length > 1 ? 's' : ''}</p><h1>Clients</h1></div>
    <button class="btn pri" data-act="client-new">Nouveau client</button></header>
  ${DB.client.length ? '' : '<section class="panel empty-hero"><div class="panel-b"><h2>Aucun client pour l’instant</h2><p class="mut">Chaque client regroupe ses projets en parallèle, ses briefs, ses fichiers et son chiffre d’affaires.</p></div></section>'}
  <div class="cards">${[...DB.client].sort((a,b) => a.name.localeCompare(b.name)).map(c => { const ps = DB.project.filter(p => p.c === c.id), open = ps.filter(p => p.stage < 7);
    const ca = ps.filter(p => p.stage >= 2).reduce((a,p) => a + fin(p).sold, 0);
    const n = ps.map(nextDl).filter(Boolean).sort((a,b) => a.d.localeCompare(b.d))[0];
    return `<button class="card" data-go="client-${c.id}"><div><h2>${esc(c.name)}</h2><p class="sub">${esc([c.sector, c.contact].filter(Boolean).join(' · ')) || '&nbsp;'}</p></div>
      <div class="row"><span class="mut">Prochaine échéance</span><span>${n ? `${esc(n.l)} · ${dueLabel(n.d)}` : '—'}</span></div>
      <div class="mini"><div><b>${open.length}</b><span>projets ouverts</span></div><div><b>${eur(ca)}</b><span>CA signé</span></div><div><b>${ps.length}</b><span>au total</span></div></div></button>`; }).join('')}</div>`;
}
function vClient(r){
  const c = byId(DB.client, r.id); if (!c) return vClients();
  const ps = DB.project.filter(p => p.c === c.id).sort((a,b) => a.stage - b.stage);
  const open = ps.filter(p => p.stage < 7), signed = ps.filter(p => p.stage >= 2);
  const F = signed.map(fin), ca = F.reduce((a,f) => a + f.sold, 0), m = F.reduce((a,f) => a + f.mLand, 0);
  const toBill = F.reduce((a,f) => a + f.toBill, 0);
  const contact = [c.contact, c.role].filter(Boolean).join(', ');
  const reach = [c.email, c.phone].filter(Boolean).join(' · ');
  return `<header class="ph"><div><p class="eyebrow"><button class="crumb" data-go="clients">Clients</button>${c.sector ? ' / ' + esc(c.sector) : ''}</p><h1>${esc(c.name)}</h1>
    ${contact || reach ? `<p class="sub">${esc(contact)}${contact && reach ? ' · ' : ''}${esc(reach)}</p>` : ''}</div>
    <div class="chips">${CLIENT_HEAD.map(fn => fn(c)).join('')}<button class="btn" data-act="client-edit" data-id="${c.id}">Modifier</button><button class="btn pri" data-act="project-new" data-c="${c.id}">Nouveau projet</button></div></header>
  <section class="kpis">
    <div class="kpi"><span class="k-l">Projets ouverts en parallèle</span><strong>${open.length}</strong><span class="k-s">${ps.length} projet${ps.length > 1 ? 's' : ''} au total</span></div>
    <div class="kpi"><span class="k-l">CA signé</span><strong>${eur(ca)}</strong><span class="k-s">${signed.length} projet${signed.length > 1 ? 's' : ''} signé${signed.length > 1 ? 's' : ''}</span></div>
    <div class="kpi"><span class="k-l">Marge brute</span><strong>${signed.length ? pct(m / (ca || 1)) : '—'}</strong><span class="k-s">atterrissage, tous projets</span></div>
    <div class="kpi"><span class="k-l">Reste à facturer</span><strong>${eur(toBill)}</strong><span class="k-s">sur les projets signés</span></div>
  </section>
  <section class="panel" style="margin-bottom:16px"><div class="panel-h"><h2>Projets du client</h2></div>
    <div class="tw"><table><thead><tr><th>Projet</th><th>Étape</th><th>Prochaine échéance</th><th>Responsable</th><th class="num">Vendu</th><th class="num">Marge prévue</th><th class="num">Atterrissage</th></tr></thead><tbody>
    ${ps.map(p => { const f = fin(p), n = nextDl(p); return `<tr class="link" data-go="projet-${p.id}"><td><span class="t-code">${esc(p.code)}</span><span class="t-title">${esc(p.title)}</span></td><td>${stagePill(p.stage)}</td>
      <td>${n ? `${esc(n.l)}<span class="tag">${dueLabel(n.d)}</span>` : '<span class="mut">—</span>'}</td><td>${p.lead ? esc(P(p.lead).name) : '<span class="mut">—</span>'}</td><td class="num">${eur(f.sold)}</td><td class="num">${pct(f.rPlan)}</td><td class="num">${pct(f.rLand)} ${deltaChip(f.rPlan, f.rLand)}</td></tr>`; }).join('') || '<tr><td colspan="7" class="empty">Aucun projet pour ce client.</td></tr>'}
    </tbody></table></div></section>
  <div class="grid2e">${open.map(p => `<section class="panel"><div class="panel-h"><div style="min-width:0"><span class="t-code">${esc(p.code)}</span><h2>${esc(p.title)}</h2></div><button class="btn sm ghost" data-go="projet-${p.id}">Ouvrir</button></div>
    <div class="panel-b"><h3>Brief</h3><p class="brief ${p.brief ? '' : 'mut'}" style="margin:4px 0 12px;white-space:pre-line">${esc(p.brief || 'Brief à compléter.')}</p><h3>Éléments reçus</h3>${filesList(p)}</div></section>`).join('')}</div>
  ${CLIENT_PANELS.map(fn => fn(c)).join('')}`;
}
function filesList(p, del = false){
  const fs = projFiles(p);
  if (!fs.length) return '<p class="empty">Aucun fichier pour l’instant.</p>';
  return `<ul class="list">${fs.map(f => `<li><span class="file-ic">${esc((f.name.split('.').pop() || '').slice(0,4))}</span><div class="grow" style="overflow:hidden;text-overflow:ellipsis"><a class="flink" href="${fileUrl(f)}" target="_blank" rel="noopener">${esc(f.name)}</a><span class="tag">${fmtSize(f.size)} · ajouté le ${dshort(f.uploaded_at.slice(0,10))}</span></div>${del ? `<button class="x" data-act="file-del" data-id="${f.id}" aria-label="Supprimer le fichier">×</button>` : ''}</li>`).join('')}</ul>`;
}
function clientDialog(c){
  formDialog({
    title: c ? 'Modifier le client' : 'Nouveau client',
    fields: [{k:'name', label:'Nom', required:true, full:true}, {k:'sector', label:'Secteur'}, {k:'contact', label:'Contact principal'}, {k:'role', label:'Fonction du contact'}, {k:'email', label:'E-mail', type:'email'}, {k:'phone', label:'Téléphone', type:'tel'}],
    values: c || {},
    submit: c ? 'Enregistrer' : 'Créer le client',
    onSubmit: async v => {
      if (c){ Object.assign(c, v); persist('client', c); render(); return; }
      const n = {id: uid(), ...v}; if (!(await create('client', n))) return 'Création impossible.';
      location.hash = 'client-' + n.id; toast('Client créé');
    },
    onDelete: c ? async () => { if (DB.project.some(p => p.c === c.id)){ toast('Ce client a des projets : supprimez-les ou rattachez-les à un autre client d’abord.'); return false; } const ok = await removeEnt('client', c); if (ok) location.hash = 'clients'; return ok; } : null,
  });
}

/* ---------- Projets ---------- */
function vProjects(){
  const flt = {tous: () => true, cours: p => p.stage >= 2 && p.stage < 7, avenir: p => p.stage < 2, termines: p => p.stage === 7};
  const ps = DB.project.filter(flt[UI.projFilter]);
  const row = p => { const f = fin(p), n = nextDl(p); return `<tr class="link" data-go="projet-${p.id}"><td><span class="t-code">${esc(p.code)}</span><span class="t-title">${esc(p.title)}</span></td>
    ${UI.group ? '' : `<td class="mut">${esc(C(p.c).name)}</td>`}<td>${stagePill(p.stage)}</td><td>${n ? `${esc(n.l)}<span class="tag">${dueLabel(n.d)}</span>` : '<span class="mut">—</span>'}</td><td>${p.lead ? esc(P(p.lead).name) : '<span class="mut">—</span>'}</td>
    <td class="num">${eur(f.sold)}</td><td class="num">${pct(f.rPlan)}</td><td class="num">${pct(f.rLand)} ${deltaChip(f.rPlan, f.rLand)}</td></tr>`; };
  const head = `<tr><th>Projet</th>${UI.group ? '' : '<th>Client</th>'}<th>Étape</th><th>Prochaine échéance</th><th>Responsable</th><th class="num">Vendu</th><th class="num">Marge prévue</th><th class="num">Atterrissage</th></tr>`;
  const cols = UI.group ? 7 : 8;
  const body = UI.group ? [...DB.client].sort((a,b) => a.name.localeCompare(b.name)).map(c => { const g = ps.filter(p => p.c === c.id); return g.length ? `<tr class="grp"><td colspan="${cols}"><button class="crumb" data-go="client-${c.id}">${esc(c.name)}</button> <span class="mut">· ${g.length} projet${g.length > 1 ? 's' : ''}</span></td></tr>${g.map(row).join('')}` : ''; }).join('') : ps.map(row).join('');
  return `<header class="ph"><div><p class="eyebrow">${DB.project.length} projet${DB.project.length > 1 ? 's' : ''}</p><h1>Projets</h1></div>
    <button class="btn pri" data-act="project-new">Nouveau projet</button></header>
  <div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:12px">
    <div class="chips">${[['cours','En cours'],['avenir','À venir'],['termines','Terminés'],['tous','Tous']].map(([k,l]) => `<button class="chip" data-act="pf" data-k="${k}" aria-pressed="${UI.projFilter === k}">${l}</button>`).join('')}</div>
    <div class="seg"><button data-act="grp" data-v="1" aria-pressed="${UI.group}">Par client</button><button data-act="grp" data-v="0" aria-pressed="${!UI.group}">Liste</button></div></div>
  <section class="panel"><div class="tw"><table><thead>${head}</thead><tbody>${body || `<tr><td colspan="${cols}" class="empty">${UI.projFilter === 'cours' ? 'Aucun projet signé en cours. Les projets en estimation ou en devis sont dans « À venir ».' : 'Aucun projet dans ce filtre.'}</td></tr>`}</tbody></table></div></section>`;
}
function nextCode(clientId){
  const y = TODAY.slice(0,4);
  const ns = DB.project.filter(p => String(p.code || '').startsWith(y + '-')).map(p => parseInt(String(p.code).split('-')[1], 10) || 0);
  const seq = String((ns.length ? Math.max(...ns) : 0) + 1).padStart(3,'0');
  const tag = (C(clientId).name || '').normalize('NFD').replace(/[^A-Za-z]/g,'').slice(0,4).toUpperCase() || 'PROJ';
  return `${y}-${seq}-${tag}`;
}
const personOpts = (empty = '—') => [['', empty], ...[...DB.person].sort((a,b) => a.name.localeCompare(b.name)).map(u => [u.id, `${u.name}${u.role ? ' · ' + u.role : ''}`])];
function projectDialog(p, presetClient){
  if (!DB.client.length){ toast('Créez d’abord un client.'); return clientDialog(); }
  const internal = DB.person.filter(u => u.st === 'interne');
  formDialog({
    title: p ? 'Modifier le projet' : 'Nouveau projet',
    fields: [
      {k:'title', label:'Titre', required:true, full:true},
      {k:'c', label:'Client', type:'select', options: [...DB.client].sort((a,b) => a.name.localeCompare(b.name)).map(c => [c.id, c.name])},
      {k:'type', label:'Type', type:'select', options: TYPES.map(t => [t,t])},
      {k:'lead', label:'Responsable', type:'select', options: personOpts('À définir'), hint: internal.length ? '' : 'Ajoutez-vous dans Intervenants avec le statut « interne ».'},
      {k:'code', label:'Code projet', hint: p ? '' : 'Proposé automatiquement, modifiable.'},
      {k:'s1', label:'Début du tournage ou de l’événement', type:'date'},
      {k:'s2', label:'Fin', type:'date'},
      {k:'brief', label:'Brief', type:'textarea', full:true},
    ],
    values: p ? {...p, s1: p.shoot?.[0] || '', s2: p.shoot?.[1] || ''} : {c: presetClient || DB.client[0].id, type: TYPES[0], lead: internal[0]?.id || '', code: nextCode(presetClient || DB.client[0].id)},
    submit: p ? 'Enregistrer' : 'Créer et ouvrir le budget',
    onSubmit: async v => {
      if (v.s2 && v.s1 && v.s2 < v.s1) return 'La date de fin est avant la date de début.';
      const shoot = v.s1 ? [v.s1, v.s2 || v.s1] : null;
      const data = {title: v.title, c: v.c, type: v.type, lead: v.lead || null, code: v.code || nextCode(v.c), shoot, brief: v.brief};
      if (p){ Object.assign(p, data); persist('project', p); render(); return; }
      const n = normProject({id: uid(), stage: 0, created: TODAY, ...data, lines: [], time: [], exp: [], dl: [], inv: []});
      if (!(await create('project', n))) return 'Création impossible.';
      location.hash = `projet-${n.id}-budget`; toast('Projet créé : construisez le budget.');
    },
    onDelete: p ? async () => {
      const ok = await removeEnt('project', p); if (!ok) return false;
      for (const r of DB.res.filter(r => r.p === p.id)) await removeEnt('res', r);
      location.hash = 'client-' + p.c; toast('Projet supprimé'); return true;
    } : null,
  });
}
function vProject(r){
  const p = PR(r.id); if (!p) return vProjects();
  const tabs = PTABS.concat([['temps','Temps passé'],['depenses','Dépenses'],['marge','Marge']]);
  const f = fin(p), c = C(p.c), tab = tabs.some(([k]) => k === r.tab) ? r.tab : 'apercu';
  const shoot = p.shoot && p.shoot[0] ? ` · tournage ${dshort(p.shoot[0])}${p.shoot[1] && p.shoot[1] !== p.shoot[0] ? ' → ' + dshort(p.shoot[1]) : ''}` : '';
  return `<header class="ph" style="margin-bottom:0"><div style="min-width:0"><p class="eyebrow"><button class="crumb" data-go="client-${c.id}">${esc(c.name)}</button> / <span class="mono">${esc(p.code)}</span> · ${esc(p.type)}</p>
    <h1>${esc(p.title)}</h1><p class="sub">Responsable ${p.lead ? esc(P(p.lead).name) : 'à définir'}${shoot}</p></div>
    <div class="chips" style="align-items:center">${stagePill(p.stage)}<button class="btn" data-act="project-edit" data-id="${p.id}">Modifier</button></div></header>
  <ol class="stepper" aria-label="Étapes du projet">${STAGES.map((s,i) => `<li class="${i < p.stage ? 'done' : i === p.stage ? 'cur' : ''}"><button data-act="stage" data-p="${p.id}" data-i="${i}" title="Passer à l'étape ${s}"><span class="bar"></span><span class="lab">${STAGE_SHORT[i]}</span></button></li>`).join('')}</ol>
  <div class="strip">
    <div><span class="k-l">Vendu HT</span><strong data-c="sum-sold">${eur(f.sold)}</strong><small data-c="sum-billed">${eur(f.billed)} facturés</small></div>
    <div><span class="k-l">Coût prévu</span><strong data-c="sum-plan">${eur(f.plan)}</strong><small data-c="sum-mplan">marge prévue ${pct(f.rPlan)}</small></div>
    <div><span class="k-l">Coût réel à date</span><strong data-c="sum-real">${eur(f.real)}</strong><small>${pct(f.plan ? f.real / f.plan : 0)} du prévu</small></div>
    <div><span class="k-l">Marge à l'atterrissage</span><strong data-c="sum-land">${eur(f.mLand)}</strong><small data-c="sum-rland">${pct(f.rLand)} · ${deltaChip(f.rPlan, f.rLand)}</small></div>
  </div>
  <nav class="tabs" role="tablist">${tabs.map(([k,l]) => `<button role="tab" aria-selected="${k === tab}" data-go="projet-${p.id}-${k}">${l}</button>`).join('')}</nav>
  ${({apercu:tApercu, budget:tBudget, temps:tTemps, depenses:tDep, marge:tMarge, ...PTAB_FN})[tab](p, f)}`;
}
function tApercu(p, f){
  const al = alertsFor(p), rs = DB.res.filter(x => x.p === p.id), gc = gearConflicts();
  const invSum = p.inv.reduce((a,i) => a + (+i.pct || 0), 0);
  return `<div class="grid2"><div class="stack">
    ${al.length ? `<section class="panel"><div class="panel-h"><h2>À surveiller</h2></div><div class="panel-b">${al.map(a => `<div class="alert"><span class="dot ${a.lv === 'bad' ? 'bad' : ''}"></span><div><p>${esc(a.t)}</p><small>${esc(a.s)}</small></div></div>`).join('')}</div></section>` : ''}
    <section class="panel"><div class="panel-h"><h2>Échéances</h2><span class="mut">${p.dl.filter(d => d.x).length} / ${p.dl.length} faites</span></div><div class="panel-b"><ul class="list">
      ${p.dl.map((d,i) => ({d,i})).sort((a,b) => (a.d.d || '9').localeCompare(b.d.d || '9')).map(({d,i}) => `<li><input type="checkbox" id="dl-${i}" data-act="dl" data-p="${p.id}" data-i="${i}" ${d.x ? 'checked' : ''}><label for="dl-${i}" class="grow ${d.x ? 'done-txt' : ''}">${esc(d.l)}</label><span class="when ${!d.x && d.d && diffDays(d.d) < 0 ? 'bad' : ''}">${dshort(d.d)}</span><button class="x" data-act="dl-del" data-p="${p.id}" data-i="${i}" aria-label="Supprimer l'échéance">×</button></li>`).join('') || '<li class="empty">Aucune échéance.</li>'}
    </ul><form class="inline-add" data-form="dl" data-p="${p.id}"><input type="text" name="l" placeholder="Nouvelle échéance, ex. V1 au client" aria-label="Libellé de l'échéance" required><input type="date" name="d" aria-label="Date" required><button class="btn sm" type="submit">Ajouter</button></form></div></section>
    <section class="panel"><div class="panel-h"><h2>Brief et fichiers</h2><label class="btn sm upl">Ajouter des fichiers<input type="file" multiple data-up="doc" data-p="${p.id}"></label></div>
      <div class="panel-b"><p class="brief ${p.brief ? '' : 'mut'}" style="margin:0 0 12px;white-space:pre-line">${esc(p.brief || 'Brief à compléter : bouton Modifier en haut de la page.')}</p>${filesList(p, true)}
      ${MAXUP ? `<p class="note">Jusqu’à ${fmtSize(MAXUP)} par fichier. Les rushes restent sur le NAS.</p>` : ''}</div></section>
  </div><div class="stack">
    <section class="panel"><div class="panel-h"><h2>Équipe</h2><span class="mut">saisi / budgété</span></div><div class="panel-b"><ul class="list">
      ${crew(p).map(u => { const b = budgetDays(p,u.id), g = loggedDays(p,u.id); return `<li><div class="grow">${esc(u.name)}<span class="tag ${u.st === 'intermittent' ? 'int' : ''}">${esc(u.role)} · ${esc(u.st)}</span></div>
        <div style="width:86px"><div class="meter"><i class="${g > b && b ? 'over' : ''}" style="width:${b ? Math.min(100, g / b * 100) : (g ? 100 : 0)}%"></i></div></div><span class="when">${tfmt(g)} / ${b ? tfmt(b) : '—'}</span></li>`; }).join('') || '<li class="empty">Personne pour l’instant : affectez des intervenants aux lignes du budget.</li>'}
    </ul></div></section>
    <section class="panel"><div class="panel-h"><h2>Matériel réservé</h2><button class="btn sm" data-act="res-new" data-p="${p.id}">Réserver</button></div><div class="panel-b"><ul class="list">
      ${rs.map(x => { const g = G(x.g), cf = gc.some(c => c.g.id === g.id && c.list.includes(x)); return `<li><div class="grow">${esc(g.name)}<span class="tag">${x.q} sur ${g.stock} · ${dshort(x.f)}${x.t !== x.f ? ' → ' + dshort(x.t) : ''}</span></div>${cf ? '<span class="pill bad">Conflit</span>' : '<span class="pill good">OK</span>'}<button class="x" data-act="res-del" data-id="${x.id}" aria-label="Annuler la réservation">×</button></li>`; }).join('') || '<li class="empty">Aucune réservation.</li>'}
    </ul></div></section>
    <section class="panel"><div class="panel-h"><h2>Facturation</h2><button class="btn sm" data-act="inv-new" data-p="${p.id}">Ajouter une échéance</button></div><div class="panel-b"><ul class="list">
      ${f.inv.map((i,k) => `<li><div class="grow">${esc(i.l)}<span class="tag">${num(+i.pct || 0)} % · ${i.st === 'à émettre' ? 'prévue le' : 'échéance'} ${dshort(i.d)}</span></div><span class="num">${eur(i.amt)}</span>
        <select class="sel" data-bind="inv-st" data-p="${p.id}" data-i="${k}" aria-label="Statut de la facture">${INV_ST.map(s => `<option ${s === i.st ? 'selected' : ''}>${s}</option>`).join('')}</select><button class="x" data-act="inv-del" data-p="${p.id}" data-i="${k}" aria-label="Supprimer">×</button></li>`).join('') || '<li class="empty">Pas encore d’échéancier. Ajoutez par exemple un acompte de 30 % et un solde de 70 %.</li>'}
    </ul>${p.inv.length ? `<p class="note ${Math.abs(invSum - 100) > .5 ? 'sumbad' : ''}">Total de l’échéancier : ${num(invSum)} % du vendu.</p>` : ''}</div></section>
  </div></div>`;
}
function whoCell(p, l, i){
  const v = l.p ? 'p:' + l.p : l.g ? 'g:' + l.g : '';
  const note = l.p ? (P(l.p).st === 'intermittent' ? `brut × ${num(+SET.coef || 1, 2)}` : P(l.p).st === 'interne' ? 'coût interne' : 'HT') : l.g ? 'parc propre' : '';
  return `<select class="sel" data-bind="who" data-p="${p.id}" data-i="${i}" aria-label="Intervenant ou matériel"><option value="">—</option>
    ${DB.person.length ? `<optgroup label="Intervenants">${[...DB.person].sort((a,b) => a.name.localeCompare(b.name)).map(u => `<option value="p:${u.id}" ${v === 'p:' + u.id ? 'selected' : ''}>${esc(u.name)}${u.role ? ' · ' + esc(u.role) : ''}</option>`).join('')}</optgroup>` : ''}
    ${DB.gear.length ? `<optgroup label="Matériel">${[...DB.gear].sort((a,b) => a.name.localeCompare(b.name)).map(g => `<option value="g:${g.id}" ${v === 'g:' + g.id ? 'selected' : ''}>${esc(g.name)}</option>`).join('')}</optgroup>` : ''}
  </select>${note ? `<span class="tag ${l.p && P(l.p).st === 'intermittent' ? 'int' : ''}">${note}</span>` : ''}`;
}
function tBudget(p){
  const chs = chapList(p), missing = CHAPS.filter(ch => !chs.includes(ch));
  let body = '';
  chs.forEach((ch,k) => {
    const ls = p.lines.map((l,i) => ({l,i})).filter(x => x.l.ch === ch);
    body += `<tr class="grp"><td colspan="5">${esc(ch)}</td><td class="num" data-c="chc-${k}"></td><td></td><td class="num" data-c="chs-${k}"></td><td class="num" data-c="chm-${k}"></td><td></td></tr>`;
    body += ls.map(({l,i}) => `<tr><td><input class="in in-l" id="bl-${i}-label" data-bind="line" data-p="${p.id}" data-i="${i}" data-f="label" value="${esc(l.label)}" aria-label="Libellé"></td><td>${whoCell(p,l,i)}</td>
      <td class="num"><input class="in in-n" type="text" inputmode="decimal" id="bl-${i}-qty" data-bind="line" data-p="${p.id}" data-i="${i}" data-f="qty" value="${numIn(l.qty)}" aria-label="Quantité"></td>
      <td><select class="sel unit" data-bind="unit" data-p="${p.id}" data-i="${i}" aria-label="Unité">${UNITS.concat(UNITS.includes(l.unit) ? [] : [l.unit]).map(u => `<option ${u === l.unit ? 'selected' : ''}>${esc(u)}</option>`).join('')}</select></td>
      <td class="num"><input class="in in-n" type="text" inputmode="decimal" id="bl-${i}-cost" data-bind="line" data-p="${p.id}" data-i="${i}" data-f="cost" value="${numIn(l.cost)}" aria-label="Coût unitaire"></td>
      <td class="num" data-c="cost-${i}"></td>
      <td class="num"><input class="in in-c" type="text" inputmode="decimal" id="bl-${i}-coef" data-bind="line" data-p="${p.id}" data-i="${i}" data-f="coef" value="${numIn(l.coef)}" aria-label="Coefficient de vente"></td>
      <td class="num" data-c="sale-${i}"></td><td class="num" data-c="marg-${i}"></td><td><button class="x" data-act="line-del" data-p="${p.id}" data-i="${i}" aria-label="Supprimer la ligne">×</button></td></tr>`).join('');
    body += `<tr><td colspan="10"><button class="btn sm ghost" data-act="line-add" data-p="${p.id}" data-ch="${esc(ch)}">+ Ligne dans ${esc(ch)}</button></td></tr>`;
  });
  setTimeout(() => refreshBudget(p), 0);
  return `<p class="lead">Chaque ligne calcule son coût et son prix de vente. Les intermittents sont chargés à <b>× ${num(+SET.coef || 1, 2)}</b> sur le brut ; choisir un intervenant ou du matériel reprend son tarif quand le coût est vide.</p>
  <section class="panel"><div class="tw"><table><thead><tr><th>Ligne</th><th>Intervenant / matériel</th><th class="num">Qté</th><th>Unité</th><th class="num">Coût unit.</th><th class="num">Coût</th><th class="num">Coef.</th><th class="num">Prix de vente</th><th class="num">Marge</th><th></th></tr></thead>
  <tbody>${body || '<tr><td colspan="10" class="empty">Budget vide : ajoutez un premier chapitre ci-dessous.</td></tr>'}</tbody>
  <tfoot><tr class="tot"><td colspan="5">Total HT</td><td class="num" data-c="tot-cost"></td><td></td><td class="num" data-c="tot-sale"></td><td class="num" data-c="tot-marg"></td><td></td></tr></tfoot></table></div>
  <div class="form"><div class="field"><label for="addch">Ajouter un chapitre</label><select id="addch">${missing.map(ch => `<option>${esc(ch)}</option>`).join('')}${missing.length ? '' : '<option disabled>Tous les chapitres sont utilisés</option>'}</select></div>
    <button class="btn" data-act="chap-add" data-p="${p.id}" ${missing.length ? '' : 'disabled'}>Ajouter</button><span style="flex:1"></span>
    <button class="btn" data-act="csv" data-p="${p.id}" ${p.lines.length ? '' : 'disabled'}>Exporter le budget (CSV)</button></div></section>`;
}
function refreshBudget(p){
  const set = (k,v) => { const el = document.querySelector(`[data-c="${k}"]`); if (el) el.innerHTML = v; };
  p.lines.forEach((l,i) => { const c = lineCost(l), s = lineSale(l); set(`cost-${i}`, eur(c)); set(`sale-${i}`, eur(s)); set(`marg-${i}`, `<span class="mut">${pct(s ? (s - c) / s : 0)}</span>`); });
  chapList(p).forEach((ch,k) => { const ls = p.lines.filter(l => l.ch === ch); const c = ls.reduce((a,l) => a + lineCost(l), 0), s = ls.reduce((a,l) => a + lineSale(l), 0);
    set(`chc-${k}`, eur(c)); set(`chs-${k}`, eur(s)); set(`chm-${k}`, eur(s - c)); });
  const f = fin(p);
  set('tot-cost', eur(f.plan)); set('tot-sale', eur(f.sold)); set('tot-marg', `${eur(f.mPlan)} · ${pct(f.rPlan)}`);
  set('sum-sold', eur(f.sold)); set('sum-billed', `${eur(f.billed)} facturés`); set('sum-plan', eur(f.plan)); set('sum-mplan', `marge prévue ${pct(f.rPlan)}`);
  set('sum-land', eur(f.mLand)); set('sum-rland', `${pct(f.rLand)} · ${deltaChip(f.rPlan, f.rLand)}`);
}
function exportCsv(p){
  const r2 = n => Math.round(n * 100) / 100;
  const rows = [['Chapitre','Ligne','Intervenant / matériel','Quantité','Unité','Coût unitaire','Coût','Coefficient','Prix de vente HT']];
  chapList(p).forEach(ch => p.lines.filter(l => l.ch === ch).forEach(l => rows.push([l.ch, l.label, l.p ? P(l.p).name : l.g ? G(l.g).name : '', +l.qty || 0, l.unit, +l.cost || 0, r2(lineCost(l)), +l.coef || 0, r2(lineSale(l))])));
  const f = fin(p); rows.push([]); rows.push(['Total', '', '', '', '', '', r2(f.plan), '', r2(f.sold)]);
  const cell = c => { const s = typeof c === 'number' ? String(c).replace('.', ',') : String(c ?? ''); return /[;"\n]/.test(s) ? '"' + s.replace(/"/g,'""') + '"' : s; };
  const csv = '﻿' + rows.map(r => r.map(cell).join(';')).join('\r\n');
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], {type:'text/csv;charset=utf-8'})); a.download = `${p.code}_budget.csv`;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
function unitSeg(){ return `<div class="seg" aria-label="Unité d'affichage"><button data-act="unit" data-u="h" aria-pressed="${UNIT === 'h'}">Heures</button><button data-act="unit" data-u="j" aria-pressed="${UNIT === 'j'}">Jours</button></div>`; }
function timeForm(pid){
  if (!DB.person.length) return `<div class="form"><p class="empty" style="margin:0">Ajoutez d’abord vos intervenants pour saisir du temps. <button class="crumb" data-go="equipe">Intervenants</button></p></div>`;
  const projs = DB.project.filter(p => p.stage < 7);
  if (!pid && !projs.length) return '';
  const pp = pid ? PR(pid) : null; const def = pp ? (crew(pp)[0]?.id || '') : '';
  return `<form class="form" data-form="time">
    ${pid ? `<input type="hidden" name="proj" value="${pid}">` : `<div class="field"><label for="tf-proj">Projet</label><select id="tf-proj" name="proj">${projs.map(p => `<option value="${p.id}">${esc(p.code)} · ${esc(shortTitle(p.title))}</option>`).join('')}</select></div>`}
    <div class="field"><label for="tf-p">Personne</label><select id="tf-p" name="p">${[...DB.person].sort((a,b) => a.name.localeCompare(b.name)).map(u => `<option value="${u.id}" ${u.id === def ? 'selected' : ''}>${esc(u.name)}${u.role ? ' · ' + esc(u.role) : ''}</option>`).join('')}</select></div>
    <div class="field"><label for="tf-d">Date</label><input id="tf-d" type="date" name="d" value="${TODAY}" required></div>
    <div class="field"><label for="tf-q">Durée</label><input id="tf-q" type="text" inputmode="decimal" name="q" value="1" style="width:80px" required></div>
    <div class="field"><label>Unité</label><div class="seg"><button type="button" data-act="fu" data-u="h" aria-pressed="${UNIT === 'h'}">h</button><button type="button" data-act="fu" data-u="j" aria-pressed="${UNIT === 'j'}">j</button></div><input type="hidden" name="u" value="${UNIT}"></div>
    <div class="field grow"><label for="tf-t">Tâche</label><input id="tf-t" name="t" placeholder="Ex. Montage V2" required></div>
    <button class="btn pri" type="submit">Ajouter</button></form>`;
}
function tTemps(p){
  const tot = p.time.reduce((a,e) => a + tDays(e), 0), totB = p.lines.filter(l => l.p).reduce((a,l) => a + toDays(l), 0);
  return `<div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:14px"><p class="lead" style="margin:0"><b>${tfmt(tot)}</b> saisis sur ce projet pour <b>${tfmt(totB)}</b> budgétés. Une journée compte ${num(+SET.dayH || 8)} h.</p>${unitSeg()}</div>
  <div class="grid2"><section class="panel"><div class="panel-h"><h2>Saisies</h2></div><div class="tw"><table><thead><tr><th>Date</th><th>Personne</th><th>Tâche</th><th class="num">Saisi</th><th class="num">Durée</th><th class="num">Coût</th><th></th></tr></thead><tbody>
    ${p.time.map((e,i) => ({e,i})).sort((a,b) => b.e.d.localeCompare(a.e.d)).map(({e,i}) => `<tr><td class="mono">${dshort(e.d)}</td><td>${esc(P(e.p).name)}</td><td>${esc(e.task)}</td><td class="num mut">${num(+e.qty,2)} ${esc(e.unit)}</td><td class="num">${tfmt(tDays(e))}</td><td class="num">${eur(tCost(e))}</td><td><button class="x" data-act="time-del" data-p="${p.id}" data-i="${i}" aria-label="Supprimer">×</button></td></tr>`).join('') || '<tr><td colspan="7" class="empty">Aucune saisie.</td></tr>'}
    </tbody></table></div>${timeForm(p.id)}</section>
    <section class="panel"><div class="panel-h"><h2>Par personne</h2><span class="mut">saisi / budgété</span></div><div class="panel-b"><ul class="list">
    ${crew(p).map(u => { const b = budgetDays(p,u.id), g = loggedDays(p,u.id); return `<li><div class="grow">${esc(u.name)}<span class="tag">${esc(u.role)}</span></div><div style="width:90px"><div class="meter"><i class="${g > b && b ? 'over' : ''}" style="width:${b ? Math.min(100, g / b * 100) : (g ? 100 : 0)}%"></i></div></div><span class="when">${tfmt(g)} / ${b ? tfmt(b) : '—'}</span></li>`; }).join('') || '<li class="empty">Personne pour l’instant.</li>'}
    </ul></div></section></div>`;
}
function tDep(p){
  const chs = [...new Set(chapList(p).concat(CHAPS))];
  const tot = p.exp.reduce((a,e) => a + (+e.amt || 0), 0), reb = p.exp.filter(e => e.rebill).reduce((a,e) => a + (+e.amt || 0), 0);
  const rec = e => { const f = e.receipt && FILES.find(x => x.id === e.receipt); return f ? `<a class="flink pill good" href="${fileUrl(f)}" target="_blank" rel="noopener">Voir</a>` : ''; };
  return `<p class="lead"><b>${eurC(tot)}</b> de dépenses saisies, dont <b>${eurC(reb)}</b> à refacturer au client.</p>
  <section class="panel"><div class="tw"><table><thead><tr><th>Date</th><th>Dépense</th><th>Poste du budget</th><th class="num">Montant HT</th><th>Justificatif</th><th>Refacturable</th><th></th></tr></thead><tbody>
  ${p.exp.map((e,i) => ({e,i})).sort((a,b) => b.e.d.localeCompare(a.e.d)).map(({e,i}) => `<tr><td class="mono">${dshort(e.d)}</td><td>${esc(e.label)}</td><td class="mut">${esc(e.ch)}</td><td class="num">${eurC(+e.amt || 0)}</td>
    <td>${rec(e) || `<label class="btn sm upl">Joindre<input type="file" accept="image/*,.pdf" data-up="justif" data-p="${p.id}" data-i="${i}"></label>`}</td>
    <td><input type="checkbox" id="rb-${i}" data-act="rebill" data-p="${p.id}" data-i="${i}" ${e.rebill ? 'checked' : ''} aria-label="Refacturable"></td><td><button class="x" data-act="exp-del" data-p="${p.id}" data-i="${i}" aria-label="Supprimer">×</button></td></tr>`).join('') || '<tr><td colspan="7" class="empty">Aucune dépense.</td></tr>'}
  </tbody></table></div>
  <form class="form" data-form="exp" data-p="${p.id}">
    <div class="field"><label for="ef-d">Date</label><input id="ef-d" type="date" name="d" value="${TODAY}" required></div>
    <div class="field grow"><label for="ef-l">Dépense</label><input id="ef-l" name="l" placeholder="Ex. Location ruban LED" required></div>
    <div class="field"><label for="ef-c">Poste du budget</label><select id="ef-c" name="c">${chs.map(c => `<option>${esc(c)}</option>`).join('')}</select></div>
    <div class="field"><label for="ef-a">Montant HT (€)</label><input id="ef-a" type="text" inputmode="decimal" name="a" placeholder="Ex. 42,50" style="width:110px" required></div>
    <div class="field"><label for="ef-f">Justificatif</label><input id="ef-f" type="file" name="f" accept="image/*,.pdf" style="width:200px"></div>
    <label class="check"><input type="checkbox" name="r"> Refacturable</label>
    <button class="btn pri" type="submit">Ajouter</button></form></section>`;
}
function tMarge(p, f){
  const closed = p.stage === 7;
  if (!f.ch.length) return '<p class="lead">La marge apparaîtra dès que le budget aura des lignes.</p>';
  const msg = closed ? `Projet clôturé : la marge finale est de <b>${eur(f.mLand)}</b>, soit <b>${pct(f.rLand)}</b>, pour <b>${pct(f.rPlan)}</b> prévue au budget.`
    : `Si la suite se déroule comme prévu, la marge finale sera de <b>${eur(f.mLand)}</b>, soit <b>${pct(f.rLand)}</b>, pour <b>${pct(f.rPlan)}</b> prévue au budget.`;
  return `<p class="lead">${msg}</p>
  <section class="panel"><div class="tw"><table><thead><tr><th>Poste</th><th class="num">Prévu</th><th class="num">Réel à date</th><th style="min-width:160px">Consommé</th><th class="num">Atterrissage</th><th class="num">Écart</th></tr></thead><tbody>
  ${f.ch.map(c => { const d = c.land - c.plan; return `<tr><td>${esc(c.ch)}</td><td class="num">${eur(c.plan)}</td><td class="num">${eur(c.real)}</td>
    <td><div class="meter" style="height:8px"><i class="${c.real > c.plan * 1.05 ? 'over' : ''}" style="width:${c.plan ? Math.min(100, c.real / c.plan * 100) : 100}%"></i></div></td>
    <td class="num">${eur(c.land)}</td><td class="num"><span class="delta ${d > c.plan * .05 ? 'bad' : d > 0 ? 'warn' : 'good'}">${d > 0 ? '+' : d < 0 ? '−' : ''}${eur(Math.abs(d))}</span></td></tr>`; }).join('')}
  </tbody><tfoot><tr class="tot"><td>Total coûts</td><td class="num">${eur(f.plan)}</td><td class="num">${eur(f.real)}</td><td></td><td class="num">${eur(f.land)}</td><td class="num">${eur(f.land - f.plan)}</td></tr>
  <tr class="tot"><td>Marge brute</td><td class="num">${eur(f.mPlan)}</td><td></td><td></td><td class="num">${eur(f.mLand)}</td><td class="num">${deltaChip(f.rPlan, f.rLand)}</td></tr></tfoot></table></div></section>
  <p class="note">Tant que le projet n’est pas terminé, l’atterrissage retient pour chaque poste le plus élevé entre le prévu et le réel. Le matériel du parc compte comme engagé dès l’étape Production.</p>`;
}

/* ---------- Temps global ---------- */
function vTime(){
  const all = DB.project.flatMap(p => p.time.map((e,i) => ({...e, proj:p, i})));
  const list = all.filter(e => UI.timePerson === 'all' || e.p === UI.timePerson).sort((a,b) => b.d.localeCompare(a.d)).slice(0, 300);
  const month = all.filter(e => e.d.slice(0,7) === TODAY.slice(0,7));
  const byP = DB.person.map(u => ({u, d: month.filter(e => e.p === u.id).reduce((a,e) => a + tDays(e), 0)})).filter(x => x.d > 0).sort((a,b) => b.d - a.d);
  const monthLabel = new Date(TODAY + 'T12:00:00Z').toLocaleDateString('fr-FR',{month:'long',year:'numeric',timeZone:'UTC'});
  return `<header class="ph"><div><p class="eyebrow">Tous projets</p><h1>Temps passé</h1></div>${unitSeg()}</header>
  <div class="grid2"><section class="panel"><div class="panel-h"><h2>Saisies</h2>
    <div class="field" style="flex-direction:row;align-items:center;gap:8px"><label for="tp-f">Personne</label><select id="tp-f" data-bind="tp" style="border:1px solid var(--line-2);border-radius:7px;padding:5px 8px;background:var(--surface)"><option value="all">Toute l'équipe</option>${DB.person.map(u => `<option value="${u.id}" ${UI.timePerson === u.id ? 'selected' : ''}>${esc(u.name)}</option>`).join('')}</select></div></div>
    <div class="tw"><table><thead><tr><th>Date</th><th>Personne</th><th>Projet</th><th>Tâche</th><th class="num">Durée</th><th class="num">Coût</th></tr></thead><tbody>
    ${list.map(e => `<tr><td class="mono">${dshort(e.d)}</td><td>${esc(P(e.p).name)}</td><td><button class="crumb" data-go="projet-${e.proj.id}-temps">${esc(e.proj.code)}</button></td><td>${esc(e.task)}</td><td class="num">${tfmt(tDays(e))}</td><td class="num">${eur(tCost(e))}</td></tr>`).join('') || '<tr><td colspan="6" class="empty">Aucune saisie.</td></tr>'}
    </tbody></table></div>${timeForm(null)}</section>
    <section class="panel"><div class="panel-h"><h2>Ce mois-ci</h2><span class="mut">${monthLabel}</span></div><div class="panel-b"><ul class="list">
      ${byP.map(x => `<li><div class="grow">${esc(x.u.name)}<span class="tag">${esc(x.u.role)}</span></div><span class="when">${tfmt(x.d)}</span></li>`).join('') || '<li class="empty">Rien ce mois-ci.</li>'}</ul></div></section></div>`;
}

/* ---------- Intervenants ---------- */
function vTeam(){
  const cc = crewConflicts();
  const next = u => DB.project.filter(p => p.shoot && p.shoot[0] && p.stage < 7 && (p.shoot[1] || p.shoot[0]) >= TODAY && p.lines.some(l => l.p === u.id)).sort((a,b) => a.shoot[0].localeCompare(b.shoot[0]))[0];
  const ext = DB.person.filter(u => u.st !== 'interne').length, intl = DB.person.length - ext;
  return `<header class="ph"><div><p class="eyebrow">${ext} externe${ext > 1 ? 's' : ''} · ${intl} interne${intl > 1 ? 's' : ''}</p><h1>Intervenants</h1></div>
    <button class="btn pri" data-act="person-new">Ajouter un intervenant</button></header>
  ${cc.map(c => `<div class="callout"><span class="dot"></span><p><b>${esc(c.u.name)}</b> est prévu(e) le ${dshort(c.day)} sur <button class="crumb" data-go="projet-${c.a.id}">${esc(shortTitle(c.a.title))}</button> et sur <button class="crumb" data-go="projet-${c.b.id}">${esc(shortTitle(c.b.title))}</button>.</p></div>`).join('')}
  <section class="panel"><div class="tw"><table><thead><tr><th>Nom</th><th>Poste</th><th>Statut</th><th class="num">Tarif jour</th><th class="num">Coût employeur / j</th><th class="num">Projets</th><th>Prochaine date</th><th></th></tr></thead><tbody>
  ${[...DB.person].sort((a,b) => a.name.localeCompare(b.name)).map(u => { const n = next(u), np = DB.project.filter(p => p.lines.some(l => l.p === u.id) || p.time.some(e => e.p === u.id)).length; const conf = cc.some(c => c.u.id === u.id);
    return `<tr class="link" data-act="person-edit" data-id="${u.id}"><td class="t-title">${esc(u.name)}${u.phone || u.email ? `<span class="tag">${esc([u.phone, u.email].filter(Boolean).join(' · '))}</span>` : ''}</td><td>${esc(u.role)}</td><td><span class="pill ${u.st === 'intermittent' ? 'warn' : u.st === 'freelance' ? 'acc' : ''}">${esc(u.st)}</span></td>
    <td class="num">${eur(+u.rate || 0)} <span class="tag">${u.st === 'intermittent' ? 'brut' : u.st === 'interne' ? 'interne' : 'HT'}</span></td><td class="num">${eur(dayCost(u))}</td><td class="num">${np}</td>
    <td>${n ? `${dshort(n.shoot[0])} · <button class="crumb" data-go="projet-${n.id}">${esc(n.code)}</button>${conf ? ' <span class="pill bad">Conflit</span>' : ''}` : '<span class="mut">—</span>'}</td><td>${VIEWS.equipier && u.st !== 'interne' ? `<button class="btn sm ghost" data-go="equipier-${u.id}">Son espace</button>` : ''}</td></tr>`; }).join('') || '<tr><td colspan="8" class="empty">Aucun intervenant. Ajoutez vos techniciens, freelances et vous-même (statut « interne »).</td></tr>'}
  </tbody></table></div></section>
  <p class="note">Le coût employeur des intermittents applique le coefficient de ${num(+SET.coef || 1, 2)} réglé dans les paramètres.</p>`;
}
function personDialog(u){
  formDialog({
    title: u ? 'Modifier l’intervenant' : 'Nouvel intervenant',
    fields: [{k:'name', label:'Nom', required:true}, {k:'role', label:'Poste', hint:'Ex. Cadreur, Ingé son, Monteur'},
      {k:'st', label:'Statut', type:'select', options: STATUTS.map(s => [s,s])}, {k:'rate', label:'Tarif jour (€)', type:'number', hint:'Brut pour un intermittent, HT pour un freelance', def:0},
      {k:'phone', label:'Téléphone', type:'tel'}, {k:'email', label:'E-mail', type:'email'}],
    values: u || {st:'intermittent'},
    submit: u ? 'Enregistrer' : 'Ajouter',
    onSubmit: async v => { if (u){ Object.assign(u, v); persist('person', u); render(); return; } if (!(await create('person', {id: uid(), ...v}))) return 'Ajout impossible.'; render(); toast('Intervenant ajouté'); },
    onDelete: u ? async () => { const used = DB.project.some(p => p.lines.some(l => l.p === u.id) || p.time.some(e => e.p === u.id)); if (used && !confirm('Cet intervenant apparaît dans des budgets ou du temps saisi. Le supprimer quand même ?')) return false; return removeEnt('person', u); } : null,
  });
}

/* ---------- Matériel ---------- */
function vGear(){
  const gc = gearConflicts();
  return `<header class="ph"><div><p class="eyebrow">Parc propre · ${DB.gear.reduce((a,g) => a + (+g.stock || 0), 0)} éléments</p><h1>Matériel</h1></div>
    <button class="btn pri" data-act="gear-new">Ajouter du matériel</button></header>
  ${gc.map(c => `<div class="callout"><span class="dot"></span><p><b>${esc(c.g.name)}</b> : ${c.q} réservés le ${dshort(c.day)} pour ${c.g.stock} en stock (${c.list.map(r => `${r.q} sur ${esc(PR(r.p).code)}`).join(', ')}). Prévoir une location complémentaire.</p></div>`).join('')}
  <section class="panel"><div class="tw"><table><thead><tr><th>Matériel</th><th>Catégorie</th><th class="num">Stock</th><th class="num">Valeur loc. / j</th><th>Réservations à venir</th><th>État</th></tr></thead><tbody>
  ${[...DB.gear].sort((a,b) => (a.cat || '').localeCompare(b.cat || '') || a.name.localeCompare(b.name)).map(g => { const rs = DB.res.filter(r => r.g === g.id && r.t >= TODAY && PR(r.p)); const cf = gc.some(c => c.g.id === g.id);
    return `<tr class="link" data-act="gear-edit" data-id="${g.id}"><td class="t-title">${esc(g.name)}</td><td class="mut">${esc(g.cat)}</td><td class="num">${+g.stock || 0}</td><td class="num">${eur(+g.val || 0)}</td>
    <td>${rs.map(r => `<span class="tag" style="font-size:12px;color:var(--fg)">${r.q} × ${dshort(r.f)}${r.t !== r.f ? '→' + dshort(r.t) : ''} · <button class="crumb" data-go="projet-${r.p}">${esc(PR(r.p).code)}</button></span>`).join('') || '<span class="mut">—</span>'}</td>
    <td>${cf ? '<span class="pill bad">Conflit</span>' : rs.length ? '<span class="pill acc">Réservé</span>' : '<span class="pill good">Disponible</span>'}</td></tr>`; }).join('') || '<tr><td colspan="6" class="empty">Aucun matériel. Ajoutez votre parc pour le réserver sur les projets et l’intégrer aux budgets.</td></tr>'}
  </tbody></table></div></section>`;
}
function gearDialog(g){
  formDialog({
    title: g ? 'Modifier le matériel' : 'Nouveau matériel',
    fields: [{k:'name', label:'Nom', required:true, full:true}, {k:'cat', label:'Catégorie', hint:'Ex. Caméra, Régie, Son, Lumière'}, {k:'stock', label:'Quantité en stock', type:'number', def:1}, {k:'val', label:'Valeur de location par jour (€)', type:'number', def:0, hint:'Coût interne utilisé dans les budgets'}],
    values: g || {stock:1},
    submit: g ? 'Enregistrer' : 'Ajouter',
    onSubmit: async v => { if (g){ Object.assign(g, v); persist('gear', g); render(); return; } if (!(await create('gear', {id: uid(), ...v}))) return 'Ajout impossible.'; render(); toast('Matériel ajouté'); },
    onDelete: g ? async () => { const ok = await removeEnt('gear', g); if (ok) for (const r of DB.res.filter(r => r.g === g.id)) await removeEnt('res', r); return ok; } : null,
  });
}
function resDialog(p){
  if (!DB.gear.length){ toast('Ajoutez d’abord votre matériel.'); location.hash = 'materiel'; return; }
  formDialog({
    title: 'Réserver du matériel', submit: 'Réserver',
    fields: [{k:'g', label:'Matériel', type:'select', full:true, options: [...DB.gear].sort((a,b) => a.name.localeCompare(b.name)).map(g => [g.id, `${g.name} (${+g.stock || 0} en stock)`])}, {k:'q', label:'Quantité', type:'number', def:1}, {k:'f', label:'Du', type:'date', required:true}, {k:'t', label:'Au', type:'date', required:true}],
    values: {f: p.shoot?.[0] || TODAY, t: p.shoot?.[1] || p.shoot?.[0] || TODAY, q:1},
    onSubmit: async v => { if (v.t < v.f) return 'La date de fin est avant la date de début.'; if (!(v.q > 0)) return 'Quantité invalide.'; if (!(await create('res', {id: uid(), p: p.id, ...v}))) return 'Réservation impossible.'; render(); const cf = gearConflicts().some(c => c.g.id === v.g); toast(cf ? 'Réservé, mais le stock est dépassé sur ces dates.' : 'Matériel réservé'); },
  });
}

/* ---------- Paramètres ---------- */
function vSettings(){
  const admin = ME.role === 'admin';
  return `<header class="ph"><div><p class="eyebrow">Réglages</p><h1>Paramètres</h1></div></header>
  <div class="grid2e"><section class="panel"><div class="panel-h"><h2>Calculs</h2></div><div class="panel-b" style="display:flex;flex-direction:column;gap:14px">
    <div class="field"><label for="s-coef">Coefficient de charges des intermittents (brut → coût employeur)</label><input id="s-coef" type="text" inputmode="decimal" value="${numIn(SET.coef)}" data-bind="set" data-k="coef" style="width:110px;border:1px solid var(--line-2);border-radius:7px;padding:6px 9px;background:var(--surface)"></div>
    <div class="field"><label for="s-day">Durée d'une journée de travail (heures)</label><input id="s-day" type="text" inputmode="decimal" value="${numIn(SET.dayH)}" data-bind="set" data-k="dayH" style="width:110px;border:1px solid var(--line-2);border-radius:7px;padding:6px 9px;background:var(--surface)"></div>
    <div class="field"><label>Unité d'affichage du temps (pour vous)</label>${unitSeg()}</div>
    <p class="note" style="margin:0">Le coefficient et la durée de journée s’appliquent à toute l’équipe et recalculent budgets, coûts réels et marges.</p></div></section>
  <section class="panel"><div class="panel-h"><h2>Mon compte</h2></div><div class="panel-b"><ul class="list">
    <li><div class="grow">${esc(ME.name)}<span class="tag">${esc(ME.email)} · ${ME.role === 'admin' ? 'administrateur' : 'membre'}</span></div></li></ul>
    <div class="chips" style="margin-top:10px"><button class="btn" data-act="pwd">Changer mon mot de passe</button><button class="btn ghost" data-act="logout">Se déconnecter</button></div></div></section>
  ${admin ? `<section class="panel"><div class="panel-h"><h2>Comptes d’accès</h2><button class="btn sm" data-act="user-new">Ajouter un compte</button></div><div class="tw"><table><thead><tr><th>Nom</th><th>E-mail</th><th>Rôle</th><th>Dernière connexion</th></tr></thead><tbody>
    ${USERS.map(u => `<tr class="link" data-act="user-edit" data-id="${u.id}"><td class="t-title">${esc(u.name)}${u.id === ME.id ? ' <span class="tag">vous</span>' : ''}</td><td class="mut">${esc(u.email)}</td><td>${u.role === 'admin' ? '<span class="pill acc">administrateur</span>' : '<span class="pill">membre</span>'}</td><td class="mono">${u.last_login ? dshort(u.last_login.slice(0,10)) : 'jamais'}</td></tr>`).join('')}
  </tbody></table></div><p class="note" style="padding:0 16px 14px">Un compte d’accès permet de se connecter à RondPoint. Les membres voient tout ; seuls les administrateurs gèrent les comptes.</p></section>` : ''}
  ${SETTINGS_PANELS.map(fn => fn()).join('')}
  <section class="panel"><div class="panel-h"><h2>Connexions à venir</h2></div><div class="panel-b"><ul class="list">
    <li><div class="grow">Movinmotion<span class="tag">Import CSV des contrats et de la paie</span></div><span class="pill">Prochaine version</span></li>
    <li><div class="grow">NAS Synology<span class="tag">Liens de dépôt et de partage clients</span></div><span class="pill">Lot 2</span></li></ul></div></section></div>`;
}
function userDialog(u){
  formDialog({
    title: u ? 'Modifier le compte' : 'Nouveau compte d’accès',
    fields: [{k:'name', label:'Nom', required:true}, {k:'email', label:'E-mail', type:'email', required:true},
      {k:'role', label:'Rôle', type:'select', options: [['member','Membre'],['admin','Administrateur']]},
      {k:'password', label: u ? 'Nouveau mot de passe (laisser vide pour ne pas changer)' : 'Mot de passe provisoire', type:'password', required: !u, ac:'new-password', hint:'10 caractères minimum. Transmettez-le de vive voix ou par SMS.'}],
    values: u || {role:'member'},
    submit: u ? 'Enregistrer' : 'Créer le compte',
    onSubmit: async v => { const r = await api('user_save', {id: u ? u.id : 0, ...v}); if (!r.ok) return r.error || 'Enregistrement impossible.'; USERS = r.users; render(); toast(u ? 'Compte mis à jour' : 'Compte créé'); },
    onDelete: u && u.id !== ME.id ? async () => { const r = await api('user_delete', {id: u.id}); if (!r.ok){ toast(r.error); return false; } USERS = r.users; toast('Compte supprimé'); return true; } : null,
  });
}

/* ---------- Envoi de fichiers ---------- */
async function uploadFile(pid, file, tag){
  if (MAXUP && file.size > MAXUP){ toast(`« ${file.name} » dépasse la taille acceptée par l’hébergement (${fmtSize(MAXUP)}).`); return null; }
  const fd = new FormData(); fd.append('project_id', pid); fd.append('tag', tag); fd.append('file', file);
  sync('saving'); toast(`Envoi de « ${file.name} »…`);
  const r = await api('upload', fd);
  if (!r.ok){ sync('error'); toast(r.error || 'Envoi impossible.'); return null; }
  FILES.unshift(r.file); sync('saved'); return r.file;
}

/* ---------- Interactions ---------- */
document.addEventListener('click', async e => {
  const act = e.target.closest('[data-act]'), go = e.target.closest('[data-go]');
  if (act && !(act.tagName === 'TR' && e.target.closest('button,a,input,select,label'))){
    const d = act.dataset, p = d.p ? PR(d.p) : null;
    switch (d.act){
      case 'logout': await api('logout', {}); ME = null; location.hash = ''; return showLogin();
      case 'stage': p.stage = +d.i; persist('project', p); toast(`Étape : ${STAGES[p.stage]}`); return render();
      case 'dl': p.dl[+d.i].x = act.checked; persist('project', p); return render();
      case 'dl-del': p.dl.splice(+d.i,1); persist('project', p); return render();
      case 'pf': UI.projFilter = d.k; return render();
      case 'grp': UI.group = d.v === '1'; return render();
      case 'unit': UNIT = d.u; lsSet('rp_unit', UNIT); return render();
      case 'fu': { const f = act.closest('form'); f.querySelectorAll('[data-act="fu"]').forEach(b => b.setAttribute('aria-pressed', b === act)); f.elements.u.value = d.u; return; }
      case 'line-add': { p.lines.push({ch: d.ch, label:'Nouvelle ligne', qty:1, unit:'j', cost:0, coef:1.3, p:null, g:null}); persist('project', p); render(); const el = document.getElementById(`bl-${p.lines.length - 1}-label`); if (el){ el.focus(); el.select(); } return; }
      case 'chap-add': { const ch = document.getElementById('addch').value; p.lines.push({ch, label:'Nouvelle ligne', qty:1, unit:'j', cost:0, coef:1.3, p:null, g:null}); persist('project', p); return render(); }
      case 'line-del': p.lines.splice(+d.i,1); persist('project', p); return render();
      case 'time-del': p.time.splice(+d.i,1); persist('project', p); return render();
      case 'exp-del': p.exp.splice(+d.i,1); persist('project', p); return render();
      case 'rebill': p.exp[+d.i].rebill = act.checked; persist('project', p); return render();
      case 'inv-del': p.inv.splice(+d.i,1); persist('project', p); return render();
      case 'inv-new': return formDialog({title:'Échéance de facturation', submit:'Ajouter',
        fields:[{k:'l', label:'Libellé', required:true, full:true}, {k:'pct', label:'Part du vendu (%)', type:'number', required:true}, {k:'d', label:'Date prévue ou échéance', type:'date'}, {k:'st', label:'Statut', type:'select', options: INV_ST.map(s => [s,s])}],
        values: p.inv.length ? {l:'Solde', pct: Math.max(0, 100 - p.inv.reduce((a,i) => a + (+i.pct || 0), 0)), st:'à émettre'} : {l:'Acompte', pct:30, st:'à émettre', d: TODAY},
        onSubmit: v => { p.inv.push(v); persist('project', p); render(); } });
      case 'csv': return exportCsv(p);
      case 'file-del': { if (!confirm('Supprimer ce fichier ?')) return; const r = await api('delete_file', {id: d.id}); if (r.ok){ FILES = FILES.filter(f => f.id !== d.id); render(); } else toast(r.error || 'Suppression impossible.'); return; }
      case 'client-new': return clientDialog();
      case 'client-edit': return clientDialog(byId(DB.client, d.id));
      case 'project-new': return projectDialog(null, d.c);
      case 'project-edit': return projectDialog(PR(d.id));
      case 'person-new': return personDialog();
      case 'person-edit': return personDialog(byId(DB.person, d.id));
      case 'gear-new': return gearDialog();
      case 'gear-edit': return gearDialog(byId(DB.gear, d.id));
      case 'res-new': return resDialog(p);
      case 'res-del': { const r = byId(DB.res, d.id); if (r && await removeEnt('res', r)) render(); return; }
      case 'user-new': return userDialog();
      case 'user-edit': return userDialog(USERS.find(u => String(u.id) === d.id));
      case 'pwd': return formDialog({title:'Changer mon mot de passe', submit:'Changer',
        fields:[{k:'current', label:'Mot de passe actuel', type:'password', required:true, full:true, ac:'current-password'}, {k:'new', label:'Nouveau mot de passe', type:'password', required:true, ac:'new-password', hint:'10 caractères minimum'}, {k:'new2', label:'Confirmer', type:'password', required:true, ac:'new-password'}],
        onSubmit: async v => { if (v.new !== v.new2) return 'Les deux mots de passe ne correspondent pas.'; const r = await api('password', v); if (!r.ok) return r.error || 'Changement impossible.'; toast('Mot de passe changé'); } });
      default: if (ACTIONS[d.act]) return ACTIONS[d.act](act, d, p, e);
    }
    return;
  }
  if (go && !e.target.closest('input,select,label')) location.hash = go.dataset.go;
});
document.addEventListener('input', e => {
  const el = e.target, d = el.dataset;
  if (d.bind === 'line'){
    const p = PR(d.p), l = p && p.lines[+d.i]; if (!l) return;
    if (d.f === 'label') l.label = el.value;
    else { const v = toNum(el.value); if (isNaN(v)) return; l[d.f] = v; refreshBudget(p); }
    persist('project', p, 700);
  }
});
document.addEventListener('change', async e => {
  const el = e.target, d = el.dataset;
  if (d.bind && BINDS[d.bind]) return BINDS[d.bind](el, d);
  if (d.bind === 'tp'){ UI.timePerson = el.value; return render(); }
  if (d.bind === 'set'){ const v = toNum(el.value); if (!(v > 0)){ toast('Valeur invalide.'); return; } SET[d.k] = v; persist('setting', SET); toast('Paramètre enregistré, calculs mis à jour.'); return; }
  if (d.bind === 'unit'){ const p = PR(d.p); p.lines[+d.i].unit = el.value; persist('project', p); return refreshBudget(p); }
  if (d.bind === 'inv-st'){ const p = PR(d.p); p.inv[+d.i].st = el.value; persist('project', p); return render(); }
  if (d.bind === 'who'){
    const p = PR(d.p), l = p.lines[+d.i], [t, id] = el.value.split(':');
    l.p = t === 'p' ? id : null; l.g = t === 'g' ? id : null;
    if (!(+l.cost)){ if (l.p) l.cost = +P(l.p).rate || 0; if (l.g) l.cost = +G(l.g).val || 0; }
    if (l.label === 'Nouvelle ligne'){ if (l.p) l.label = P(l.p).role || P(l.p).name; if (l.g) l.label = G(l.g).name; }
    persist('project', p); return render();
  }
  if (d.up === 'doc' || d.up === 'justif'){
    const files = [...el.files]; if (!files.length) return;
    const p = PR(d.p);
    if (d.up === 'justif'){ const f = await uploadFile(p.id, files[0], 'justif'); if (f){ p.exp[+d.i].receipt = f.id; persist('project', p); } return render(); }
    let n = 0; for (const f of files){ if (await uploadFile(p.id, f, 'doc')) n++; }
    if (n) toast(`${n} fichier${n > 1 ? 's' : ''} ajouté${n > 1 ? 's' : ''}`); return render();
  }
});
document.addEventListener('submit', async e => {
  const f = e.target; if (!f.dataset.form) return; e.preventDefault();
  const v = Object.fromEntries(new FormData(f));
  if (SUBMITS[f.dataset.form]) return SUBMITS[f.dataset.form](f, v);
  if (f.dataset.form === 'time'){
    const q = toNum(v.q); if (!(q > 0)) return toast('Durée invalide : écrivez par exemple 1,5.');
    const p = PR(v.proj); p.time.push({p: v.p, d: v.d || TODAY, qty: q, unit: v.u, task: v.t});
    persist('project', p); toast(`${num(q,2)} ${v.u} ajouté${q > 1 ? 's' : ''} sur ${p.code}`); return render();
  }
  if (f.dataset.form === 'exp'){
    const p = PR(f.dataset.p), amt = toNum(v.a);
    if (!(amt >= 0)) return toast('Montant invalide : écrivez par exemple 42,50.');
    const btn = f.querySelector('[type=submit]'); btn.disabled = true;
    let receipt = null; if (v.f && v.f.size){ const up = await uploadFile(p.id, v.f, 'justif'); if (up) receipt = up.id; }
    p.exp.push({d: v.d || TODAY, label: v.l, ch: v.c, amt: Math.round(amt * 100) / 100, rebill: !!v.r, receipt});
    persist('project', p); toast('Dépense ajoutée'); return render();
  }
  if (f.dataset.form === 'dl'){
    const p = PR(f.dataset.p); p.dl.push({l: v.l.trim(), d: v.d, x: false}); persist('project', p); return render();
  }
});

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else setTimeout(boot, 0);
