'use strict';
/* RondPoint — modules : production, finance, documents, revue vidéo, espaces client et intervenant */

/* ============ Outils communs ============ */
const BK_ST = ['pressenti','option','confirmé','annulé'];
const BK_CLS = {pressenti:'', option:'warn', confirmé:'good', annulé:'bad'};
const addDays = (s, n) => new Date(dayNum(s) * 864e5 + n * 864e5).toISOString().slice(0,10);
const firstName = n => String(n || '').split(/[\s.]/)[0];
const daysBetween = (a, b) => Math.round(dayNum(b) - dayNum(a)) + 1;
const projLink = p => `<button class="crumb" data-go="projet-${p.id}">${esc(p.code)}</button>`;
async function copyText(t){ try { await navigator.clipboard.writeText(t); toast('Texte copié'); } catch { toast('Copie bloquée ici : sélectionnez le texte et copiez-le.'); } }
function downloadText(name, text, type){
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], {type})); a.download = name;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
function textDialog(title, text, note){
  const dlg = document.getElementById('dlg');
  dlg.innerHTML = `<div class="dform"><header><h2>${esc(title)}</h2><button type="button" class="x" data-close aria-label="Fermer">×</button></header>
    <div class="dgrid"><div class="field full">${note ? `<small>${esc(note)}</small>` : ''}<textarea id="txt-out" rows="11">${esc(text)}</textarea></div></div>
    <footer><span style="flex:1"></span><button type="button" class="btn ghost" data-close>Fermer</button><button type="button" class="btn pri" id="txt-copy">Copier</button></footer></div>`;
  dlg.querySelectorAll('[data-close]').forEach(b => b.onclick = () => dlg.close());
  dlg.querySelector('#txt-copy').onclick = () => { const t = dlg.querySelector('#txt-out'); t.select(); copyText(t.value); };
  dlg.showModal();
}

/* ============ 1. Production : réservation des équipes ============ */
const activeBk = b => b.st === 'option' || b.st === 'confirmé';
function bookings(){ return DB.project.filter(p => p.stage < 7).flatMap(p => p.crew.map(b => ({...b, proj: p}))); }
function bookingConflicts(){
  const out = [], seen = new Set();
  const bs = bookings().filter(b => activeBk(b) && b.f && b.t);
  for (let i = 0; i < bs.length; i++) for (let j = i + 1; j < bs.length; j++){
    const a = bs[i], b = bs[j];
    if (a.p !== b.p || a.proj.id === b.proj.id || !overlap(a.f, a.t, b.f, b.t)) continue;
    const k = [a.p, a.proj.id, b.proj.id].join(); if (seen.has(k)) continue; seen.add(k);
    out.push({u: P(a.p), a: a.proj, b: b.proj, day: a.f > b.f ? a.f : b.f});
  }
  return out;
}
const bkConflict = (p, b) => activeBk(b) && bookingConflicts().some(c => c.u.id === b.p && (c.a.id === p.id || c.b.id === p.id));
const bkCost = b => daysBetween(b.f, b.t) * dayCost({...P(b.p), rate: b.rate ?? P(b.p).rate});

PTABS.push(['equipe','Équipe'], ['feuilles','Feuilles de service']);
PTAB_FN.equipe = p => {
  const rows = [...p.crew].map((b,i) => ({b,i})).sort((x,y) => BK_ST.indexOf(y.b.st) - BK_ST.indexOf(x.b.st) || String(x.b.f).localeCompare(String(y.b.f)));
  const inBudget = [...new Set(p.lines.filter(l => l.p && P(l.p).st !== 'interne').map(l => l.p))].filter(id => !p.crew.some(b => b.p === id));
  const conf = p.crew.filter(b => b.st === 'confirmé').length, opt = p.crew.filter(b => b.st === 'option').length;
  return `<div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:14px">
    <p class="lead" style="margin:0"><b>${conf}</b> confirmé${conf > 1 ? 's' : ''}, <b>${opt}</b> en option${p.shoot?.[0] ? ` pour le ${dshort(p.shoot[0])}${p.shoot[1] !== p.shoot[0] ? ' → ' + dshort(p.shoot[1]) : ''}` : ''}.</p>
    <div class="chips">${inBudget.length ? `<button class="btn" data-act="bk-import" data-p="${p.id}">Reprendre les ${inBudget.length} intervenant${inBudget.length > 1 ? 's' : ''} du budget</button>` : ''}<button class="btn pri" data-act="bk-new" data-p="${p.id}">Réserver un intervenant</button></div></div>
  <section class="panel"><div class="tw"><table><thead><tr><th>Intervenant</th><th>Poste</th><th>Dates</th><th>Statut</th><th>Option jusqu’au</th><th class="num">Coût prévu</th><th></th></tr></thead><tbody>
  ${rows.map(({b,i}) => { const u = P(b.p), cf = bkConflict(p,b), late = b.st === 'option' && b.optUntil && diffDays(b.optUntil) < 0;
    return `<tr><td><span class="t-title">${esc(u.name)}</span><span class="tag ${u.st === 'intermittent' ? 'int' : ''}">${esc(u.st)}${u.phone ? ' · ' + esc(u.phone) : ''}</span></td><td>${esc(b.role || u.role)}</td>
    <td class="mono">${dshort(b.f)}${b.t !== b.f ? ' → ' + dshort(b.t) : ''}</td>
    <td><select class="sel" data-bind="bk-st" data-p="${p.id}" data-i="${i}" aria-label="Statut de la réservation">${BK_ST.map(s => `<option ${s === b.st ? 'selected' : ''}>${s}</option>`).join('')}</select>${cf ? ' <span class="pill bad">Conflit</span>' : ''}${b.reply ? `<span class="tag">réponse : ${esc(b.reply)}</span>` : ''}</td>
    <td class="mono ${late ? 'sumbad' : ''}">${b.st === 'option' ? dshort(b.optUntil) : '—'}</td><td class="num">${eur(bkCost(b))}</td>
    <td style="white-space:nowrap"><button class="btn sm" data-act="bk-ask" data-p="${p.id}" data-i="${i}">Demande de dispo</button> <button class="btn sm ghost" data-act="bk-edit" data-p="${p.id}" data-i="${i}">Modifier</button> <button class="btn sm ghost" data-act="bk-ics" data-p="${p.id}" data-i="${i}" ${b.st === 'confirmé' ? '' : 'disabled'} title="Invitation agenda Google, Apple ou Outlook">Agenda</button></td></tr>`; }).join('') || '<tr><td colspan="7" class="empty">Personne de réservé. Reprenez les intervenants du budget ou réservez quelqu’un.</td></tr>'}
  </tbody></table></div></section>
  <p class="note">Une réservation confirmée apparaît dans le planning, sur la feuille de service du jour et dans l’agenda de la personne. Une option dépassée est signalée sur le tableau de bord.</p>`;
};
function bookingDialog(p, i){
  const b = i == null ? null : p.crew[i];
  formDialog({
    title: b ? 'Modifier la réservation' : 'Réserver un intervenant', submit: b ? 'Enregistrer' : 'Réserver',
    fields: [{k:'p', label:'Intervenant', type:'select', full:true, options: personOpts('Choisir…').slice(1)},
      {k:'role', label:'Poste sur ce projet', hint:'Vide = son poste habituel'}, {k:'st', label:'Statut', type:'select', options: BK_ST.map(s => [s,s])},
      {k:'f', label:'Du', type:'date', required:true}, {k:'t', label:'Au', type:'date', required:true},
      {k:'optUntil', label:'Option à lever avant le', type:'date'}, {k:'rate', label:'Tarif jour (€)', type:'number', hint:'Vide = son tarif habituel'},
      {k:'note', label:'Note', full:true}],
    values: b ? {...b, rate: b.rate ?? ''} : {st:'option', f: p.shoot?.[0] || TODAY, t: p.shoot?.[1] || p.shoot?.[0] || TODAY, optUntil: addDays(TODAY, 7)},
    onSubmit: v => {
      if (!v.p) return 'Choisissez un intervenant.';
      if (v.t < v.f) return 'La date de fin est avant la date de début.';
      const data = {p: v.p, role: v.role, st: v.st, f: v.f, t: v.t, optUntil: v.optUntil, rate: isNaN(v.rate) || v.rate === '' || v.rate === 0 ? null : v.rate, note: v.note};
      if (b) Object.assign(b, data); else p.crew.push({id: uid(), ...data});
      persist('project', p); render();
      const cf = bookingConflicts().find(c => c.u.id === v.p && (c.a.id === p.id || c.b.id === p.id));
      if (cf) toast(`${P(v.p).name} est déjà pris(e) sur ${cf.a.id === p.id ? cf.b.code : cf.a.code} à ces dates.`);
    },
    onDelete: b ? () => { p.crew.splice(i, 1); persist('project', p); return true; } : null,
  });
}
ACTIONS['bk-new'] = (el, d, p) => bookingDialog(p);
ACTIONS['bk-edit'] = (el, d, p) => bookingDialog(p, +d.i);
ACTIONS['bk-import'] = (el, d, p) => {
  const ids = [...new Set(p.lines.filter(l => l.p && P(l.p).st !== 'interne').map(l => l.p))].filter(id => !p.crew.some(b => b.p === id));
  const f = p.shoot?.[0] || TODAY, t = p.shoot?.[1] || f;
  ids.forEach(id => { const l = p.lines.find(x => x.p === id); p.crew.push({id: uid(), p: id, role: l.label, st:'pressenti', f, t, optUntil: addDays(TODAY, 7), rate: null, note:''}); });
  persist('project', p); render(); toast(`${ids.length} intervenant${ids.length > 1 ? 's' : ''} ajouté${ids.length > 1 ? 's' : ''} en « pressenti »`);
};
BINDS['bk-st'] = (el, d) => { const p = PR(d.p); p.crew[+d.i].st = el.value; if (el.value === 'confirmé') p.crew[+d.i].reply = ''; persist('project', p); render(); };
ACTIONS['bk-ask'] = (el, d, p) => {
  const b = p.crew[+d.i], u = P(b.p), sheet = p.sheets.find(s => s.d >= b.f && s.d <= b.t);
  const dates = b.f === b.t ? `le ${dlong(b.f)}` : `du ${dlong(b.f)} au ${dlong(b.t)}`;
  const txt = `Salut ${firstName(u.name)} !\n\nJe prépare « ${p.title} » pour ${C(p.c).name} (${p.type.toLowerCase()}).\nC’est ${dates}${sheet && sheet.lieu ? `, à ${sheet.lieu}` : ''}.\nPoste : ${b.role || u.role}.\n\nTu serais dispo ?${b.st === 'option' && b.optUntil ? ` Je te pose une option jusqu’au ${dlong(b.optUntil)}.` : ''}\n\nBelle journée,\n${firstName(ME.name)}`;
  textDialog(`Demande de dispo · ${u.name}`, txt, `À envoyer par SMS, WhatsApp ou e-mail${u.phone ? ` (${u.phone})` : ''}${u.email ? ` · ${u.email}` : ''}.`);
};
function icsFor(p, b){
  const u = P(b.p), dt = s => s.replace(/-/g, ''), stamp = new Date().toISOString().replace(/[-:]/g,'').slice(0,15) + 'Z';
  const sheet = p.sheets.find(s => s.d >= b.f && s.d <= b.t);
  const lines = ['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//11.65Lab//RondPoint//FR','CALSCALE:GREGORIAN','METHOD:PUBLISH','BEGIN:VEVENT',
    `UID:${b.id}@rondpoint.11-65lab.com`, `DTSTAMP:${stamp}`, `DTSTART;VALUE=DATE:${dt(b.f)}`, `DTEND;VALUE=DATE:${dt(addDays(b.t, 1))}`,
    `SUMMARY:${(p.code + ' · ' + shortTitle(p.title) + ' (' + (b.role || u.role) + ')').replace(/[,;]/g, ' ')}`,
    sheet && sheet.adresse ? `LOCATION:${(sheet.lieu + ' ' + sheet.adresse).replace(/[,;]/g, ' ')}` : '',
    `DESCRIPTION:${(C(p.c).name + ' · ' + p.type + (sheet && sheet.convoc ? ' · convocation ' + sheet.convoc : '')).replace(/[,;]/g, ' ')}`,
    'END:VEVENT','END:VCALENDAR'].filter(Boolean);
  return lines.join('\r\n');
}
ACTIONS['bk-ics'] = (el, d, p) => { const b = p.crew[+d.i]; downloadText(`${p.code}_${firstName(P(b.p).name)}.ics`, icsFor(p, b), 'text/calendar'); toast('Invitation créée : ouvrez le fichier pour l’ajouter à l’agenda (Google, Apple, Outlook).'); };
EXTRA_ALERTS.push(() => bookings().filter(b => b.st === 'option' && b.optUntil && diffDays(b.optUntil) <= 1).map(b => ({lv: diffDays(b.optUntil) < 0 ? 'bad' : 'warn', p: b.proj, t: `Option de ${P(b.p).name} ${diffDays(b.optUntil) < 0 ? 'expirée' : 'à lever'} (${dshort(b.optUntil)})`, s: `${b.role || P(b.p).role} · ${dshort(b.f)}`})));

/* ============ 1. Production : planning ============ */
UI.planStart = null;
const mondayOf = s => { const d = new Date(s + 'T12:00:00Z'); const w = (d.getUTCDay() + 6) % 7; return addDays(s, -w); };
VIEWS.planning = () => {
  const start = UI.planStart || mondayOf(TODAY), N = 21, days = Array.from({length: N}, (_, i) => addDays(start, i));
  const end = days[N - 1];
  const bs = bookings().filter(b => b.st !== 'annulé' && b.f && overlap(b.f, b.t, start, end));
  const ppl = [...new Set(bs.map(b => b.p))].map(P).sort((a,b) => a.name.localeCompare(b.name));
  const conf = bookingConflicts();
  const wd = d => new Date(d + 'T12:00:00Z').toLocaleDateString('fr-FR', {weekday:'short', timeZone:'UTC'}).slice(0,2);
  const head = `<tr><th class="pl-name">Intervenant</th>${days.map(d => { const we = [0,6].includes(new Date(d + 'T12:00:00Z').getUTCDay()); return `<th class="pl-d ${d === TODAY ? 'today' : ''} ${we ? 'we' : ''}"><span>${wd(d)}</span>${Number(d.slice(8))}</th>`; }).join('')}</tr>`;
  const cell = (list, d) => {
    const on = list.filter(b => b.f <= d && d <= b.t);
    if (!on.length) return `<td class="pl-c ${d === TODAY ? 'today' : ''}"></td>`;
    const bad = on.filter(b => activeBk(b)).length > 1;
    return `<td class="pl-c ${d === TODAY ? 'today' : ''}">${on.map(b => `<button class="pl-b st-${b.st === 'confirmé' ? 'conf' : b.st}${bad ? ' clash' : ''}" data-go="projet-${b.proj.id}-equipe" title="${esc(b.proj.code + ' · ' + b.proj.title + ' · ' + b.st)}">${esc(b.proj.code.split('-')[1] || b.proj.code)}</button>`).join('')}</td>`;
  };
  const rows = ppl.map(u => `<tr><th class="pl-name">${esc(u.name)}<span class="tag">${esc(u.role)}</span></th>${days.map(d => cell(bs.filter(b => b.p === u.id), d)).join('')}</tr>`).join('');
  const rs = DB.res.filter(r => PR(r.p) && r.f && overlap(r.f, r.t, start, end));
  const gearRows = [...new Set(rs.map(r => r.g))].map(G).map(g => `<tr><th class="pl-name">${esc(g.name)}<span class="tag">${+g.stock || 0} en stock</span></th>${days.map(d => { const on = rs.filter(r => r.g === g.id && r.f <= d && d <= r.t); const q = on.reduce((a,r) => a + (+r.q || 0), 0); return `<td class="pl-c ${d === TODAY ? 'today' : ''}">${q ? `<span class="pl-q ${q > (+g.stock || 0) ? 'clash' : ''}" title="${esc(on.map(r => PR(r.p).code).join(', '))}">${q}</span>` : ''}</td>`; }).join('')}</tr>`).join('');
  const label = `${dshort(start)} → ${dshort(end)}`;
  return `<header class="ph"><div><p class="eyebrow">Production</p><h1>Planning</h1></div>
    <div class="chips" style="align-items:center"><button class="btn sm" data-act="pl-move" data-n="-7" aria-label="Semaine précédente">←</button><button class="btn sm" data-act="pl-move" data-n="0">Aujourd’hui</button><button class="btn sm" data-act="pl-move" data-n="7" aria-label="Semaine suivante">→</button><span class="mut mono">${label}</span></div></header>
  ${conf.map(c => `<div class="callout"><span class="dot"></span><p><b>${esc(c.u.name)}</b> est réservé(e) le ${dshort(c.day)} sur ${projLink(c.a)} et ${projLink(c.b)}.</p></div>`).join('')}
  <div class="legend" style="margin-bottom:10px"><span><i class="pl-lg st-conf"></i>confirmé</span><span><i class="pl-lg st-option"></i>option</span><span><i class="pl-lg st-pressenti"></i>pressenti</span><span><i class="pl-lg clash"></i>conflit</span></div>
  <section class="panel"><div class="tw"><table class="plan"><thead>${head}</thead><tbody>
    ${rows || `<tr><td colspan="${N + 1}" class="empty">Aucune réservation sur ces trois semaines. Les réservations se font dans l’onglet Équipe de chaque projet.</td></tr>`}
    ${gearRows ? `<tr class="grp"><td colspan="${N + 1}">Matériel du parc</td></tr>${gearRows}` : ''}
  </tbody></table></div></section>`;
};
ACTIONS['pl-move'] = (el, d) => { const n = +d.n; UI.planStart = n === 0 ? null : addDays(UI.planStart || mondayOf(TODAY), n); render(); };

/* ============ 1. Production : feuilles de service ============ */
const SHEET_TYPES = ['Tournage','Captation','Installation','Repérage','Déplacement','Démontage','Plateau'];
UI.sheet = {};
PTAB_FN.feuilles = p => {
  const ss = [...p.sheets].sort((a,b) => a.d.localeCompare(b.d));
  const cur = ss.find(s => s.id === UI.sheet[p.id]) || ss[0];
  return `<div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:14px">
    <div class="chips">${ss.map(s => `<button class="chip" data-act="sh-pick" data-p="${p.id}" data-id="${s.id}" aria-pressed="${cur && s.id === cur.id}">${dshort(s.d)} · ${esc(s.type)}</button>`).join('') || '<span class="mut">Aucune feuille de service.</span>'}</div>
    <button class="btn pri" data-act="sh-new" data-p="${p.id}">Nouvelle feuille</button></div>
  ${cur ? `<div class="chips" style="margin-bottom:12px"><button class="btn" data-act="sh-edit" data-p="${p.id}" data-id="${cur.id}">Modifier</button><button class="btn" data-act="sh-dup" data-p="${p.id}" data-id="${cur.id}">Dupliquer au lendemain</button><button class="btn" data-act="sh-text" data-p="${p.id}" data-id="${cur.id}">Texte pour WhatsApp</button><button class="btn" data-act="sh-print">Imprimer / PDF</button></div>${sheetDoc(p, cur)}` : '<section class="panel empty-hero"><div class="panel-b"><h2>Une feuille par journée</h2><p class="mut">Lieu, convocation, déroulé, contacts sur place, logistique. L’équipe confirmée et le matériel réservé ce jour-là s’ajoutent tout seuls.</p></div></section>'}`;
};
function sheetCrew(p, s){ return p.crew.filter(b => b.st === 'confirmé' && b.f <= s.d && s.d <= b.t).map(b => ({...b, u: P(b.p)})); }
function sheetGear(p, s){ return DB.res.filter(r => r.p === p.id && r.f <= s.d && s.d <= r.t).map(r => ({...r, g: G(r.g)})); }
function sheetDoc(p, s){
  const crewL = sheetCrew(p, s), gearL = sheetGear(p, s), plan = String(s.planning || '').split('\n').map(l => l.trim()).filter(Boolean);
  return `<article class="sheet-doc panel">
    <header class="sd-h"><div><b class="wm" role="img" aria-label="11.65Lab">11<i></i>65Lab</b><p class="eyebrow" style="margin-top:8px">Feuille de service · ${esc(s.type)}</p><h2>${esc(p.title)}</h2><p class="sub">${esc(C(p.c).name)} · <span class="mono">${esc(p.code)}</span></p></div>
      <div class="sd-date"><span>${dlong(s.d)}</span><strong>${esc(s.convoc || '—')}</strong><small>convocation${s.fin ? ` · fin prévue ${esc(s.fin)}` : ''}</small></div></header>
    <div class="sd-grid">
      <section><h3>Lieu</h3><p><b>${esc(s.lieu || '—')}</b><br>${esc(s.adresse || '')}</p>${s.acces ? `<p class="mut">${esc(s.acces)}</p>` : ''}${s.adresse ? `<p><a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(s.adresse)}" target="_blank" rel="noopener">Itinéraire</a></p>` : ''}</section>
      <section><h3>Contacts sur place</h3><p style="white-space:pre-line">${esc(s.contacts || '—')}</p></section>
    </div>
    ${plan.length ? `<section><h3>Déroulé</h3><ul class="sd-plan">${plan.map(l => { const m = l.match(/^(\d{1,2}[h:]\d{0,2})\s+(.*)$/); return `<li>${m ? `<span class="mono">${esc(m[1])}</span><span>${esc(m[2])}</span>` : `<span></span><span>${esc(l)}</span>`}</li>`; }).join('')}</ul></section>` : ''}
    <section><h3>Équipe (${crewL.length})</h3>${crewL.length ? `<div class="tw"><table><thead><tr><th>Nom</th><th>Poste</th><th>Téléphone</th></tr></thead><tbody>${crewL.map(b => `<tr><td>${esc(b.u.name)}</td><td>${esc(b.role || b.u.role)}</td><td class="mono">${esc(b.u.phone || '—')}</td></tr>`).join('')}</tbody></table></div>` : '<p class="empty">Aucun intervenant confirmé sur cette date (onglet Équipe).</p>'}</section>
    ${gearL.length ? `<section><h3>Matériel</h3><ul class="sd-list">${gearL.map(r => `<li>${r.q} × ${esc(r.g.name)}</li>`).join('')}</ul></section>` : ''}
    ${s.logistique ? `<section><h3>Logistique</h3><p style="white-space:pre-line">${esc(s.logistique)}</p></section>` : ''}
    ${s.notes ? `<section><h3>Notes</h3><p style="white-space:pre-line">${esc(s.notes)}</p></section>` : ''}
  </article>`;
}
function sheetDialog(p, s, preset){
  formDialog({
    title: s ? 'Modifier la feuille de service' : 'Nouvelle feuille de service', submit: s ? 'Enregistrer' : 'Créer',
    fields: [{k:'d', label:'Date', type:'date', required:true}, {k:'type', label:'Type de journée', type:'select', options: SHEET_TYPES.map(t => [t,t])},
      {k:'convoc', label:'Convocation', type:'time'}, {k:'fin', label:'Fin prévue', type:'time'},
      {k:'lieu', label:'Lieu', full:true}, {k:'adresse', label:'Adresse', full:true}, {k:'acces', label:'Accès, parking, badge', full:true},
      {k:'contacts', label:'Contacts sur place (un par ligne)', type:'textarea', full:true},
      {k:'planning', label:'Déroulé (une ligne par créneau, ex. « 08:00 Installation régie »)', type:'textarea', full:true},
      {k:'logistique', label:'Logistique (transport, hôtel, repas)', type:'textarea', full:true}, {k:'notes', label:'Notes', type:'textarea', full:true}],
    values: s || preset || {d: p.shoot?.[0] || TODAY, type:'Tournage', convoc:'08:00'},
    onSubmit: v => { if (s) Object.assign(s, v); else { const n = {id: uid(), ...v}; p.sheets.push(n); UI.sheet[p.id] = n.id; } persist('project', p); render(); },
    onDelete: s ? () => { p.sheets = p.sheets.filter(x => x !== s); persist('project', p); return true; } : null,
  });
}
ACTIONS['sh-new'] = (el, d, p) => sheetDialog(p);
ACTIONS['sh-edit'] = (el, d, p) => sheetDialog(p, p.sheets.find(s => s.id === d.id));
ACTIONS['sh-pick'] = (el, d, p) => { UI.sheet[p.id] = d.id; render(); };
ACTIONS['sh-dup'] = (el, d, p) => { const s = p.sheets.find(x => x.id === d.id); sheetDialog(p, null, {...s, id: undefined, d: addDays(s.d, 1)}); };
ACTIONS['sh-print'] = () => { try { window.print(); } catch {} };
ACTIONS['sh-text'] = (el, d, p) => {
  const s = p.sheets.find(x => x.id === d.id), crewL = sheetCrew(p, s);
  const t = `${p.title} · ${C(p.c).name}\n${s.type} · ${dlong(s.d)}\n\nConvocation : ${s.convoc || '—'}${s.fin ? ` · fin prévue ${s.fin}` : ''}\nLieu : ${s.lieu || ''}${s.adresse ? '\n' + s.adresse : ''}${s.acces ? '\n' + s.acces : ''}\n${s.planning ? '\nDéroulé :\n' + s.planning + '\n' : ''}${s.contacts ? '\nContacts :\n' + s.contacts + '\n' : ''}\nÉquipe : ${crewL.map(b => `${b.u.name} (${b.role || b.u.role})`).join(', ') || '—'}${s.logistique ? '\n\nLogistique :\n' + s.logistique : ''}`;
  textDialog('Feuille de service à partager', t, 'À coller dans le groupe WhatsApp ou un SMS.');
};

/* ============ 2. Devis ============ */
const Q_ST = ['brouillon','envoyé','relancé','accepté','refusé','expiré'];
const Q_CLS = {brouillon:'', envoyé:'acc', relancé:'warn', accepté:'good', refusé:'bad', expiré:'bad'};
const qPill = st => `<span class="pill ${Q_CLS[st] || ''}">${esc(st)}</span>`;
const company = () => SETX.company || {id:'company'};
const qNum = p => 'DEV-' + p.code;
const relanceDue = p => ['envoyé','relancé'].includes(p.quote.st) && p.quote.relance && diffDays(p.quote.relance) <= 0;
PTABS.splice(2, 0, ['devis','Devis']);
PTAB_FN.devis = p => {
  const q = p.quote, f = fin(p);
  return `<div class="grid2 rev"><div class="stack">${quoteDoc(p, f)}</div><div class="stack">
    <section class="panel"><div class="panel-h"><h2>Suivi du devis</h2>${qPill(q.st)}</div><div class="panel-b qform">
      <div class="field"><label for="q-st">Statut</label><select id="q-st" data-bind="q" data-p="${p.id}" data-k="st">${Q_ST.map(s => `<option ${s === q.st ? 'selected' : ''}>${s}</option>`).join('')}</select></div>
      <div class="field"><label for="q-sent">Envoyé le</label><input id="q-sent" type="date" value="${esc(q.sent || '')}" data-bind="q" data-p="${p.id}" data-k="sent"></div>
      <div class="field"><label for="q-rel">Relance prévue le</label><input id="q-rel" type="date" value="${esc(q.relance || '')}" data-bind="q" data-p="${p.id}" data-k="relance"></div>
      <div class="field"><label for="q-val">Valable jusqu’au</label><input id="q-val" type="date" value="${esc(q.valid || '')}" data-bind="q" data-p="${p.id}" data-k="valid"></div>
      <div class="field"><label for="q-prob">Chances de signature (%)</label><input id="q-prob" type="text" inputmode="decimal" value="${numIn(q.prob ?? '')}" data-bind="q" data-p="${p.id}" data-k="prob"></div>
      ${q.st === 'refusé' ? `<div class="field"><label for="q-motif">Motif du refus</label><input id="q-motif" value="${esc(q.motif || '')}" data-bind="q" data-p="${p.id}" data-k="motif"></div>` : ''}
      <div class="field"><label>Détail présenté au client</label><div class="seg">${[['ligne','Ligne à ligne'],['chapitre','Par chapitre'],['forfait','Forfait']].map(([k,l]) => `<button type="button" data-act="q-level" data-p="${p.id}" data-k="${k}" aria-pressed="${(q.level || 'chapitre') === k}">${l}</button>`).join('')}</div></div>
      <div class="chips">${['brouillon'].includes(q.st) ? `<button class="btn pri" data-act="q-sent" data-p="${p.id}">Marquer comme envoyé</button>` : ''}${['envoyé','relancé'].includes(q.st) ? `<button class="btn" data-act="q-relance" data-p="${p.id}">Relance faite</button><button class="btn pri" data-act="q-accept" data-p="${p.id}">Devis accepté</button>` : ''}
        <button class="btn" data-act="sh-print">Imprimer / PDF</button><button class="btn" data-act="q-mail" data-p="${p.id}">Texte d’envoi</button></div>
    </div></section>
    <section class="panel"><div class="panel-b" style="padding-top:14px"><h3>Ce que voit le client</h3><p class="note" style="margin-top:4px">Les coûts, coefficients et noms des intervenants n’apparaissent jamais sur le devis. Le devis légal et la facture restent émis dans Tiime : celui-ci sert de base et de suivi.</p></div></section>
  </div></div>`;
};
function quoteDoc(p, f){
  const q = p.quote, c = C(p.c), co = company(), lvl = q.level || 'chapitre', tva = f.sold * .2;
  let rows = '';
  if (lvl === 'forfait') rows = `<tr><td>${esc(p.title)}<span class="tag">${esc(chapList(p).join(', '))}</span></td><td class="num">1</td><td>forfait</td><td class="num">${eurC(f.sold)}</td><td class="num">${eurC(f.sold)}</td></tr>`;
  else chapList(p).forEach(ch => {
    const ls = p.lines.filter(l => l.ch === ch), tot = ls.reduce((a,l) => a + lineSale(l), 0);
    if (lvl === 'chapitre') rows += `<tr><td>${esc(ch)}<span class="tag">${esc(ls.map(l => l.label).join(', '))}</span></td><td class="num">1</td><td>forfait</td><td class="num">${eurC(tot)}</td><td class="num">${eurC(tot)}</td></tr>`;
    else rows += `<tr class="grp"><td colspan="4">${esc(ch)}</td><td class="num">${eurC(tot)}</td></tr>` + ls.map(l => `<tr><td>${esc(l.label)}</td><td class="num">${num(+l.qty || 0, 2)}</td><td>${esc(l.unit)}</td><td class="num">${eurC((+l.qty ? lineSale(l) / +l.qty : 0))}</td><td class="num">${eurC(lineSale(l))}</td></tr>`).join('');
  });
  const terms = p.inv.length ? p.inv.map(i => `${esc(i.l)} : ${num(+i.pct || 0)} %`).join(' · ') : 'Acompte de 30 % à la commande, solde à la livraison.';
  return `<article class="sheet-doc panel quote-doc">
    <header class="sd-h"><div><b class="wm" role="img" aria-label="11.65Lab">11<i></i>65Lab</b><p class="mut" style="margin-top:8px;white-space:pre-line;font-size:12.5px">${esc([co.name, co.address, co.siret ? 'SIRET ' + co.siret : '', co.tva ? 'TVA ' + co.tva : ''].filter(Boolean).join('\n')) || '<button class="crumb" data-act="co-edit">Ajouter les coordonnées de la société</button>'}</p></div>
      <div class="sd-date"><span>Devis ${esc(qNum(p))}</span><small>${q.sent ? 'du ' + dlong(q.sent) : 'brouillon'}${q.valid ? ' · valable jusqu’au ' + dshort(q.valid) : ''}</small><p style="margin-top:10px;text-align:right"><b>${esc(c.name)}</b><br><span class="mut">${esc([c.contact, c.email].filter(Boolean).join(' · '))}</span></p></div></header>
    <section><h3>Objet</h3><p><b>${esc(p.title)}</b>${p.shoot?.[0] ? ` · ${dlong(p.shoot[0])}${p.shoot[1] !== p.shoot[0] ? ' au ' + dlong(p.shoot[1]) : ''}` : ''}</p>${p.brief ? `<p class="mut" style="white-space:pre-line">${esc(p.brief)}</p>` : ''}</section>
    <div class="tw"><table><thead><tr><th>Désignation</th><th class="num">Qté</th><th>Unité</th><th class="num">PU HT</th><th class="num">Total HT</th></tr></thead><tbody>${rows || '<tr><td colspan="5" class="empty">Le budget est vide.</td></tr>'}</tbody>
      <tfoot><tr class="tot"><td colspan="4">Total HT</td><td class="num">${eurC(f.sold)}</td></tr><tr><td colspan="4" class="mut">TVA 20 %</td><td class="num mut">${eurC(tva)}</td></tr><tr class="tot"><td colspan="4">Total TTC</td><td class="num">${eurC(f.sold + tva)}</td></tr></tfoot></table></div>
    <section><h3>Conditions</h3><p>${terms}</p><p class="mut">Bon pour accord : date, signature et cachet du client.</p></section>
  </article>`;
}
function setQuote(p, k, v){
  const q = p.quote; q[k] = v;
  if (k === 'st'){
    if (v === 'envoyé'){ q.sent = q.sent || TODAY; q.relance = q.relance || addDays(TODAY, 7); q.valid = q.valid || addDays(TODAY, 30); if (p.stage < 1) p.stage = 1; }
    if (v === 'accepté'){ q.prob = 100; if (p.stage < 2) p.stage = 2; if (!p.inv.length) p.inv.push({l:'Acompte', pct:30, st:'à émettre', d:TODAY}, {l:'Solde', pct:70, st:'à émettre', d: p.shoot?.[1] ? addDays(p.shoot[1], 7) : ''}); toast('Devis accepté : projet signé, échéancier 30 / 70 créé.'); }
    if (v === 'refusé') q.prob = 0;
  }
  persist('project', p); render();
}
BINDS.q = (el, d) => { const p = PR(d.p); let v = el.value; if (d.k === 'prob'){ v = toNum(v); if (isNaN(v)) return toast('Pourcentage invalide.'); v = Math.max(0, Math.min(100, v)); } setQuote(p, d.k, v); };
ACTIONS['q-level'] = (el, d, p) => { p.quote.level = d.k; persist('project', p); render(); };
ACTIONS['q-sent'] = (el, d, p) => setQuote(p, 'st', 'envoyé');
ACTIONS['q-accept'] = (el, d, p) => setQuote(p, 'st', 'accepté');
ACTIONS['q-relance'] = (el, d, p) => { p.quote.st = 'relancé'; p.quote.relance = addDays(TODAY, 7); persist('project', p); render(); toast('Relance notée, prochaine dans 7 jours.'); };
ACTIONS['q-mail'] = (el, d, p) => { const c = C(p.c), f = fin(p);
  textDialog('Texte d’envoi du devis', `Bonjour ${firstName(c.contact) || ''},\n\nVoici notre proposition pour « ${p.title} » : ${eur(f.sold)} HT.\n${p.quote.valid ? `Elle est valable jusqu’au ${dlong(p.quote.valid)}.\n` : ''}\nJe reste disponible pour en parler et l’ajuster si besoin.\n\nBelle journée,\n${firstName(ME.name)}\n11.65Lab`, 'À coller dans votre e-mail, avec le devis PDF en pièce jointe.'); };
ACTIONS['co-edit'] = () => { const co = company();
  formDialog({title:'Coordonnées de la société', fields:[{k:'name', label:'Raison sociale', full:true}, {k:'address', label:'Adresse', type:'textarea', full:true}, {k:'siret', label:'SIRET'}, {k:'tva', label:'N° de TVA'}, {k:'email', label:'E-mail', type:'email'}, {k:'phone', label:'Téléphone', type:'tel'}],
    values: co, onSubmit: v => { SETX.company = {...co, ...v, id:'company'}; persist('setting', SETX.company); render(); } }); };
EXTRA_ALERTS.push(() => DB.project.filter(relanceDue).map(p => ({lv:'warn', p, t:`Relancer le devis ${p.code}`, s:`${C(p.c).name} · envoyé le ${dshort(p.quote.sent)} · ${eur(fin(p).sold)}`})));
UI.qf = 'cours';
VIEWS.devis = () => {
  const all = DB.project.map(p => ({p, f: fin(p)}));
  const open = all.filter(x => ['brouillon','envoyé','relancé'].includes(x.p.quote.st));
  const sentOpen = open.filter(x => x.p.quote.st !== 'brouillon');
  const won = all.filter(x => x.p.quote.st === 'accepté'), lost = all.filter(x => ['refusé','expiré'].includes(x.p.quote.st));
  const weighted = sentOpen.reduce((a,x) => a + x.f.sold * (+x.p.quote.prob || 0) / 100, 0);
  const rate = won.length + lost.length ? won.length / (won.length + lost.length) : NaN;
  const flt = {cours: x => ['brouillon','envoyé','relancé'].includes(x.p.quote.st), gagnes: x => x.p.quote.st === 'accepté', perdus: x => ['refusé','expiré'].includes(x.p.quote.st), tous: () => true}[UI.qf];
  const rows = all.filter(flt).sort((a,b) => String(b.p.quote.sent || '9').localeCompare(String(a.p.quote.sent || '9')));
  return `<header class="ph"><div><p class="eyebrow">Finance</p><h1>Devis</h1></div><div class="chips"><button class="btn" data-act="co-edit">Coordonnées de la société</button><button class="btn pri" data-act="project-new">Nouveau devis</button></div></header>
  <section class="kpis">
    <div class="kpi"><span class="k-l">En attente de réponse</span><strong>${eur(sentOpen.reduce((a,x) => a + x.f.sold, 0))}</strong><span class="k-s">${sentOpen.length} devis envoyé${sentOpen.length > 1 ? 's' : ''}${open.length - sentOpen.length ? ` · ${open.length - sentOpen.length} brouillon${open.length - sentOpen.length > 1 ? 's' : ''}` : ''}</span></div>
    <div class="kpi"><span class="k-l">Pipeline pondéré</span><strong>${eur(weighted)}</strong><span class="k-s">montant × chances de signature</span></div>
    <div class="kpi"><span class="k-l">Taux de transformation</span><strong>${isNaN(rate) ? '—' : pct(rate)}</strong><span class="k-s">${won.length} accepté${won.length > 1 ? 's' : ''}, ${lost.length} perdu${lost.length > 1 ? 's' : ''}</span></div>
    <div class="kpi"><span class="k-l">Relances à faire</span><strong>${all.filter(x => relanceDue(x.p)).length}</strong><span class="k-s">aujourd’hui ou en retard</span></div>
  </section>
  <div class="chips" style="margin-bottom:12px">${[['cours','En cours'],['gagnes','Acceptés'],['perdus','Perdus'],['tous','Tous']].map(([k,l]) => `<button class="chip" data-act="qf" data-k="${k}" aria-pressed="${UI.qf === k}">${l}</button>`).join('')}</div>
  <section class="panel"><div class="tw"><table><thead><tr><th>Devis</th><th>Client</th><th>Statut</th><th>Envoyé</th><th>Relance</th><th class="num">Chances</th><th class="num">Montant HT</th><th></th></tr></thead><tbody>
  ${rows.map(({p,f}) => `<tr class="link" data-go="projet-${p.id}-devis"><td><span class="t-code">${esc(qNum(p))}</span><span class="t-title">${esc(p.title)}</span>${p.quote.motif ? `<span class="tag">${esc(p.quote.motif)}</span>` : ''}</td><td class="mut">${esc(C(p.c).name)}</td><td>${qPill(p.quote.st)}</td>
    <td class="mono">${p.quote.sent ? dshort(p.quote.sent) : '—'}</td><td class="mono ${relanceDue(p) ? 'sumbad' : ''}">${['envoyé','relancé'].includes(p.quote.st) && p.quote.relance ? dueLabel(p.quote.relance) : '—'}</td>
    <td class="num">${p.quote.prob != null && p.quote.prob !== '' ? num(+p.quote.prob) + ' %' : '—'}</td><td class="num">${eur(f.sold)}</td>
    <td>${relanceDue(p) ? `<button class="btn sm" data-act="q-relance" data-p="${p.id}">Relance faite</button>` : ''}</td></tr>`).join('') || '<tr><td colspan="8" class="empty">Aucun devis dans ce filtre.</td></tr>'}
  </tbody></table></div></section>
  <p class="note">Un devis = un projet à l’étape Estimation ou Devis envoyé. Quand il est accepté, le projet passe en « Signé » et l’échéancier de facturation se crée.</p>`;
};
ACTIONS.qf = (el, d) => { UI.qf = d.k; render(); };

/* ============ 2. Facturation ============ */
const invLate = i => i.st === 'en retard' || (i.st === 'émise' && i.d && diffDays(i.d) < 0);
UI.ff = 'ouvertes';
VIEWS.factures = () => {
  const all = DB.project.flatMap(p => { const f = fin(p); return f.inv.map((i,k) => ({...i, k, p})); });
  const flt = {ouvertes: i => i.st !== 'payée', emettre: i => i.st === 'à émettre', retard: invLate, payees: i => i.st === 'payée', toutes: () => true}[UI.ff];
  const rows = all.filter(flt).sort((a,b) => String(a.d || '9').localeCompare(String(b.d || '9')));
  const sum = fn => all.filter(fn).reduce((a,i) => a + i.amt, 0);
  const eom = new Date(Date.UTC(+TODAY.slice(0,4), +TODAY.slice(5,7), 0)).toISOString().slice(0,10);
  const paidMonth = all.filter(i => i.st === 'payée' && i.paidAt && i.paidAt.slice(0,7) === TODAY.slice(0,7));
  return `<header class="ph"><div><p class="eyebrow">Finance</p><h1>Facturation</h1></div></header>
  <section class="kpis">
    <div class="kpi"><span class="k-l">À émettre d’ici fin du mois</span><strong>${eur(sum(i => i.st === 'à émettre' && i.d && i.d <= eom))}</strong><span class="k-s">${eur(sum(i => i.st === 'à émettre'))} au total</span></div>
    <div class="kpi"><span class="k-l">Émises, en attente</span><strong>${eur(sum(i => i.st === 'émise' && !invLate(i)))}</strong><span class="k-s">dans les délais</span></div>
    <div class="kpi"><span class="k-l">En retard</span><strong>${eur(sum(invLate))}</strong><span class="k-s ${sum(invLate) ? 'bad' : ''}">${all.filter(invLate).length} facture${all.filter(invLate).length > 1 ? 's' : ''}</span></div>
    <div class="kpi"><span class="k-l">Encaissé ce mois-ci</span><strong>${eur(paidMonth.reduce((a,i) => a + i.amt, 0))}</strong><span class="k-s">${eur(sum(i => i.st === 'payée'))} encaissés au total</span></div>
  </section>
  <div class="chips" style="margin-bottom:12px">${[['ouvertes','Non payées'],['emettre','À émettre'],['retard','En retard'],['payees','Payées'],['toutes','Toutes']].map(([k,l]) => `<button class="chip" data-act="ff" data-k="${k}" aria-pressed="${UI.ff === k}">${l}</button>`).join('')}</div>
  <section class="panel"><div class="tw"><table><thead><tr><th>Date</th><th>Projet</th><th>Client</th><th>Échéance</th><th class="num">HT</th><th class="num">TTC</th><th>Statut</th></tr></thead><tbody>
  ${rows.map(i => `<tr><td class="mono ${invLate(i) ? 'sumbad' : ''}">${i.d ? dshort(i.d) : '—'}${invLate(i) && i.d ? `<span class="tag">${-diffDays(i.d)} j de retard</span>` : ''}</td><td>${projLink(i.p)}<span class="tag">${esc(shortTitle(i.p.title))}</span></td><td class="mut">${esc(C(i.p.c).name)}</td>
    <td>${esc(i.l)} <span class="tag">${num(+i.pct || 0)} %</span></td><td class="num">${eurC(i.amt)}</td><td class="num mut">${eurC(i.amt * 1.2)}</td>
    <td><select class="sel" data-bind="inv-st2" data-p="${i.p.id}" data-i="${i.k}" aria-label="Statut">${INV_ST.map(s => `<option ${s === i.st ? 'selected' : ''}>${s}</option>`).join('')}</select></td></tr>`).join('') || '<tr><td colspan="7" class="empty">Rien dans ce filtre.</td></tr>'}
  </tbody></table></div></section>
  <p class="note">Les factures officielles restent émises dans Tiime. Ici, tu suis l’échéancier de chaque projet et les paiements reçus. Passer une facture en « payée » met à jour le tableau de bord et la trésorerie.</p>`;
};
ACTIONS.ff = (el, d) => { UI.ff = d.k; render(); };
BINDS['inv-st2'] = (el, d) => { const p = PR(d.p), i = p.inv[+d.i]; i.st = el.value; if (el.value === 'payée') i.paidAt = TODAY; persist('project', p); render(); };

/* ============ 2. Trésorerie ============ */
const lastOfMonth = s => new Date(Date.UTC(+s.slice(0,4), +s.slice(5,7), 0)).toISOString().slice(0,10);
function cashMoves(){
  const t = SETX.treso || {}, start = t.at || TODAY, end = addDays(TODAY, 90), mv = [];
  DB.project.forEach(p => { const f = fin(p); f.inv.forEach(i => {
    if (i.st === 'payée' || !i.amt) return;
    let d = i.st === 'à émettre' ? (i.d ? addDays(i.d, 30) : null) : (i.d || TODAY);
    if (!d) return; if (d < TODAY) d = addDays(TODAY, 7);
    mv.push({d, l: `${i.l} ${i.st === 'à émettre' ? '(à émettre)' : ''}`.trim(), p, in: i.amt, late: invLate(i)});
  }); });
  bookings().filter(b => activeBk(b) && b.t).forEach(b => { const d = lastOfMonth(b.t); if (d >= start) mv.push({d, l: `Paie ${P(b.p).name}${P(b.p).st === 'intermittent' ? ' (chargée)' : ''}`, p: b.proj, out: bkCost(b)}); });
  if (+t.fixed){ for (let m = 0; m < 4; m++){ const base = new Date(Date.UTC(+TODAY.slice(0,4), +TODAY.slice(5,7) - 1 + m, 5)).toISOString().slice(0,10); if (base > TODAY && base <= end) mv.push({d: base, l: 'Charges fixes du mois', out: +t.fixed}); } }
  return mv.filter(m => m.d <= end).sort((a,b) => a.d.localeCompare(b.d));
}
VIEWS.treso = () => {
  const t = SETX.treso || {id:'treso', balance:0, at:TODAY, fixed:0};
  const mv = cashMoves(); let bal = +t.balance || 0;
  mv.forEach(m => { bal += (m.in || 0) - (m.out || 0); m.bal = bal; });
  const at = d => { let b = +t.balance || 0; mv.forEach(m => { if (m.d <= d) b = m.bal; }); return b; };
  const pts = Array.from({length: 91}, (_, i) => { const d = addDays(TODAY, i); return {d, b: at(d)}; });
  const low = pts.reduce((a,x) => x.b < a.b ? x : a, pts[0]);
  return `<header class="ph"><div><p class="eyebrow">Finance</p><h1>Trésorerie</h1></div><button class="btn" data-act="tr-edit">Mettre à jour le solde</button></header>
  <section class="kpis">
    <div class="kpi"><span class="k-l">Solde bancaire</span><strong>${eur(+t.balance || 0)}</strong><span class="k-s">relevé le ${dshort(t.at || TODAY)}</span></div>
    <div class="kpi"><span class="k-l">Dans 30 jours</span><strong>${eur(at(addDays(TODAY,30)))}</strong><span class="k-s">dans 60 j : ${eur(at(addDays(TODAY,60)))}</span></div>
    <div class="kpi"><span class="k-l">Dans 90 jours</span><strong>${eur(at(addDays(TODAY,90)))}</strong><span class="k-s">${eur(mv.reduce((a,m) => a + (m.in || 0), 0))} attendus · ${eur(mv.reduce((a,m) => a + (m.out || 0), 0))} à payer</span></div>
    <div class="kpi"><span class="k-l">Point bas</span><strong class="${low.b < 0 ? 'neg' : ''}">${eur(low.b)}</strong><span class="k-s ${low.b < 0 ? 'bad' : ''}">le ${dshort(low.d)}</span></div>
  </section>
  <section class="panel" style="margin-bottom:16px"><div class="panel-h"><h2>Solde prévu sur 90 jours</h2><span class="mut">montants HT</span></div><div class="panel-b">${cashChart(pts, low)}</div></section>
  <section class="panel"><div class="panel-h"><h2>Mouvements prévus</h2></div><div class="tw"><table><thead><tr><th>Date</th><th>Mouvement</th><th>Projet</th><th class="num">Entrée</th><th class="num">Sortie</th><th class="num">Solde après</th></tr></thead><tbody>
  ${mv.map(m => `<tr><td class="mono">${dshort(m.d)}</td><td>${esc(m.l)}${m.late ? ' <span class="pill bad">en retard</span>' : ''}</td><td>${m.p ? projLink(m.p) : '<span class="mut">—</span>'}</td><td class="num" style="color:var(--good)">${m.in ? '+' + eur(m.in) : ''}</td><td class="num">${m.out ? '−' + eur(m.out) : ''}</td><td class="num ${m.bal < 0 ? 'sumbad' : ''}">${eur(m.bal)}</td></tr>`).join('') || '<tr><td colspan="6" class="empty">Aucun mouvement prévu.</td></tr>'}
  </tbody></table></div></section>
  <p class="note">Entrées : factures non payées, à leur échéance (factures à émettre : date prévue + 30 jours ; factures en retard : dans 7 jours). Sorties : paies des intervenants réservés, en fin de mois, et charges fixes le 5 du mois. Mettez à jour le solde bancaire de temps en temps pour garder la projection juste.</p>`;
};
function cashChart(pts, low){
  const W = 760, H = 240, L = 64, R = 16, T = 16, B = 30, iw = W - L - R, ih = H - T - B;
  const vals = pts.map(p => p.b), mn = Math.min(0, ...vals), mx = Math.max(...vals, 1);
  const step = (() => { const r = (mx - mn) / 4, p = Math.pow(10, Math.floor(Math.log10(r || 1))); return [1,2,2.5,5,10].map(m => m * p).find(s => s >= r) || r; })();
  const y0 = Math.floor(mn / step) * step, y1 = Math.ceil(mx / step) * step;
  const X = i => L + i / (pts.length - 1) * iw, Y = v => T + (1 - (v - y0) / ((y1 - y0) || 1)) * ih;
  const ticks = []; for (let v = y0; v <= y1 + 1e-6; v += step) ticks.push(v);
  let d = `M${X(0)} ${Y(pts[0].b)}`; pts.forEach((p,i) => { if (i){ d += `H${X(i)}V${Y(p.b)}`; } });
  const area = d + `V${Y(Math.max(y0, 0))}H${X(0)}Z`;
  const months = pts.map((p,i) => ({p,i})).filter(({p,i}) => i && p.d.slice(8) === '01');
  const k = v => Math.abs(v) >= 1000 ? num(v / 1000, Math.abs(v) >= 10000 ? 0 : 1) + ' k€' : eur(v);
  const li = pts.indexOf(low);
  return `<div class="tw"><svg class="cash" viewBox="0 0 ${W} ${H}" role="img" aria-label="Solde de trésorerie prévu sur 90 jours" style="width:100%;min-width:520px;height:auto">
    ${ticks.map(v => `<line x1="${L}" x2="${W - R}" y1="${Y(v)}" y2="${Y(v)}" stroke="var(--line)" ${v === 0 ? 'stroke="var(--muted)" stroke-width="1.2"' : ''}/><text x="${L - 8}" y="${Y(v) + 4}" text-anchor="end" font-size="11" fill="var(--faint)" font-family="var(--f-mono)">${k(v)}</text>`).join('')}
    ${months.map(({p,i}) => `<line x1="${X(i)}" x2="${X(i)}" y1="${T}" y2="${T + ih}" stroke="var(--line)" stroke-dasharray="3 3"/><text x="${X(i) + 4}" y="${H - 10}" font-size="11" fill="var(--muted)">${new Date(p.d + 'T12:00:00Z').toLocaleDateString('fr-FR',{month:'short', timeZone:'UTC'})}</text>`).join('')}
    <path d="${area}" fill="var(--brand)" fill-opacity=".10"/>
    <path d="${d}" fill="none" stroke="var(--brand)" stroke-width="2"/>
    <circle cx="${X(0)}" cy="${Y(pts[0].b)}" r="4" fill="var(--fg)"/><text x="${X(0) + 8}" y="${Y(pts[0].b) - 8}" font-size="11.5" fill="var(--fg)" font-weight="600">aujourd’hui ${k(pts[0].b)}</text>
    ${li > 0 ? `<circle cx="${X(li)}" cy="${Y(low.b)}" r="4.5" fill="${low.b < 0 ? 'var(--bad)' : 'var(--fg)'}"/><text x="${Math.min(X(li) + 8, W - 170)}" y="${Math.min(Y(low.b) + 18, T + ih - 4)}" font-size="11.5" fill="${low.b < 0 ? 'var(--bad)' : 'var(--fg)'}" font-weight="600">point bas ${k(low.b)} · ${dshort(low.d)}</text>` : ''}
    <circle cx="${X(pts.length - 1)}" cy="${Y(pts[pts.length - 1].b)}" r="4" fill="var(--brand)"/>
  </svg></div>`;
}
ACTIONS['tr-edit'] = () => { const t = SETX.treso || {id:'treso', balance:0, at:TODAY, fixed:0};
  formDialog({title:'Solde et charges fixes', fields:[{k:'balance', label:'Solde bancaire (€)', type:'number', required:true}, {k:'at', label:'Relevé le', type:'date', required:true}, {k:'fixed', label:'Charges fixes mensuelles (€)', type:'number', hint:'Loyer, abonnements, assurances, salaires permanents…', def:0, full:true}],
    values:{...t, at: TODAY}, onSubmit: v => { SETX.treso = {...t, ...v, id:'treso'}; persist('setting', SETX.treso); render(); } }); };
EXTRA_ALERTS.push(() => { if (!SETX.treso) return []; const mv = cashMoves(); let b = +SETX.treso.balance || 0, low = null; mv.forEach(m => { b += (m.in || 0) - (m.out || 0); if (b < 0 && !low) low = m; }); return low ? [{lv:'bad', t:`Trésorerie négative prévue le ${dshort(low.d)}`, s:'voir Trésorerie'}] : []; });

/* ============ 3. Suivi client : notes et échanges ============ */
CLIENT_PANELS.push(c => {
  const notes = [...(c.notes || [])].sort((a,b) => b.d.localeCompare(a.d));
  return `<section class="panel" style="margin-top:16px"><div class="panel-h"><h2>Notes et échanges</h2><span class="mut">${notes.length} note${notes.length > 1 ? 's' : ''}</span></div><div class="panel-b">
    <form class="inline-add" data-form="note" data-c="${c.id}" style="border-top:0;margin-top:0;padding-top:0;margin-bottom:8px"><input type="date" name="d" value="${TODAY}" aria-label="Date" required><input type="text" name="t" placeholder="Compte rendu d’appel, demande, info utile…" aria-label="Note" required><button class="btn sm" type="submit">Ajouter</button></form>
    <ul class="list timeline">${notes.map(n => `<li><span class="when">${dshort(n.d)}</span><div class="grow" style="white-space:pre-line">${esc(n.text)}<span class="tag">${esc(n.who || '')}</span></div><button class="x" data-act="note-del" data-c="${c.id}" data-id="${n.id}" aria-label="Supprimer la note">×</button></li>`).join('') || '<li class="empty">Aucune note. Gardez ici les comptes rendus de rendez-vous et ce qu’il faut retenir du client.</li>'}</ul>
  </div></section>`;
});
SUBMITS.note = (f, v) => { const c = byId(DB.client, f.dataset.c); c.notes = c.notes || []; c.notes.push({id: uid(), d: v.d || TODAY, text: v.t.trim(), who: ME.name}); persist('client', c); render(); };
ACTIONS['note-del'] = (el, d) => { const c = byId(DB.client, d.c); c.notes = (c.notes || []).filter(n => n.id !== d.id); persist('client', c); render(); };

/* ============ 3. Documents de l'entreprise ============ */
const DOC_TYPES = ['Kbis','Attestation URSSAF','Assurance','Licence','Contrat','Statuts','Autre'];
const docState = d => !d.expires ? {k:'none', l:'sans échéance', c:''} : diffDays(d.expires) < 0 ? {k:'exp', l:'expiré', c:'bad'} : diffDays(d.expires) <= 30 ? {k:'soon', l:`expire ${dueLabel(d.expires)}`, c:'warn'} : {k:'ok', l:'valide', c:'good'};
VIEWS.documents = () => {
  const docs = [...DB.doc].sort((a,b) => (a.expires || '9999').localeCompare(b.expires || '9999'));
  const fileOf = d => d.fileId && FILES.find(f => f.id === d.fileId);
  return `<header class="ph"><div><p class="eyebrow">Ressources</p><h1>Documents</h1></div><button class="btn pri" data-act="doc-new">Ajouter un document</button></header>
  <p class="lead">Les documents de la société, avec leur date d’expiration. RondPoint prévient 30 jours avant qu’une attestation ou une assurance expire.</p>
  <section class="panel"><div class="tw"><table><thead><tr><th>Document</th><th>Type</th><th>Expire le</th><th>État</th><th>Fichier</th></tr></thead><tbody>
  ${docs.map(d => { const st = docState(d), f = fileOf(d); return `<tr class="link" data-act="doc-edit" data-id="${d.id}"><td class="t-title">${esc(d.label)}</td><td class="mut">${esc(d.type)}</td><td class="mono">${d.expires ? dshort(d.expires) : '—'}</td><td><span class="pill ${st.c}">${esc(st.l)}</span></td>
    <td>${f ? `<a class="flink" href="${fileUrl(f)}" target="_blank" rel="noopener">${esc(f.name)}</a>` : `<label class="btn sm upl">Joindre<input type="file" data-up="docfile" data-id="${d.id}" accept=".pdf,image/*"></label>`}</td></tr>`; }).join('') || '<tr><td colspan="5" class="empty">Aucun document. Ajoutez le Kbis, l’attestation URSSAF, les assurances…</td></tr>'}
  </tbody></table></div></section>`;
};
function docDialog(d){
  formDialog({title: d ? 'Modifier le document' : 'Nouveau document', submit: d ? 'Enregistrer' : 'Ajouter',
    fields:[{k:'label', label:'Nom', required:true, full:true}, {k:'type', label:'Type', type:'select', options: DOC_TYPES.map(t => [t,t])}, {k:'expires', label:'Expire le', type:'date', hint:'Laisser vide si pas d’échéance'}],
    values: d || {type:'Attestation URSSAF'},
    onSubmit: async v => { if (d){ Object.assign(d, v); persist('doc', d); render(); return; } if (!(await create('doc', {id: uid(), ...v, fileId: null}))) return 'Ajout impossible.'; render(); },
    onDelete: d ? () => removeEnt('doc', d) : null });
}
ACTIONS['doc-new'] = () => docDialog();
ACTIONS['doc-edit'] = (el, d) => docDialog(byId(DB.doc, d.id));
document.addEventListener('change', async e => {
  const el = e.target; if (el.dataset.up !== 'docfile' || !el.files.length) return;
  const d = byId(DB.doc, el.dataset.id); const f = await uploadFile('company', el.files[0], 'doc');
  if (f){ d.fileId = f.id; persist('doc', d); toast('Fichier joint'); } render();
});
EXTRA_ALERTS.push(() => DB.doc.filter(d => ['exp','soon'].includes(docState(d).k)).map(d => ({lv: docState(d).k === 'exp' ? 'bad' : 'warn', t: `${d.label} : ${docState(d).l}`, s: 'Documents de la société'})));

/* ============ 4. Post-production et revue vidéo ============ */
const DELIV_STEPS = ['À démarrer','Dérush','Montage','Étalonnage et mixage','V1 envoyée','Retours en cours','VDEF livrée'];
const V_ST = ['en attente de retours','à corriger','validée'];
const V_CLS = {'en attente de retours':'acc', 'à corriger':'warn', 'validée':'good'};
const fps = () => +SET.fps || 25;
const tcFmt = s => { const f = fps(), tf = Math.round((+s || 0) * f), fr = tf % f, sec = Math.floor(tf / f); const pad = n => String(n).padStart(2,'0'); return `${pad(Math.floor(sec / 3600))}:${pad(Math.floor(sec / 60) % 60)}:${pad(sec % 60)}:${pad(fr)}`; };
const tcParse = t => { const p = String(t || '').trim().split(/[:;.]/).map(Number); if (p.some(isNaN) || !p.length) return NaN; const f = fps();
  if (p.length === 4) return p[0] * 3600 + p[1] * 60 + p[2] + p[3] / f; if (p.length === 3) return p[0] * 3600 + p[1] * 60 + p[2]; if (p.length === 2) return p[0] * 60 + p[1]; return p[0]; };
UI.ver = {};
PTABS.push(['postprod','Post-prod et versions']);
PTAB_FN.postprod = p => {
  const vs = [...p.versions].sort((a,b) => String(b.date).localeCompare(String(a.date)));
  const cur = vs.find(v => v.id === UI.ver[p.id]) || vs[0];
  return `<section class="panel" style="margin-bottom:16px"><div class="panel-h"><h2>Livrables</h2><span class="mut">${p.deliv.filter(d => d.step === DELIV_STEPS.length - 1).length} / ${p.deliv.length} livrés</span></div>
    <div class="tw"><table><thead><tr><th>Livrable</th><th>Étape</th><th style="min-width:120px">Avancement</th><th>Échéance</th><th>Monteur</th><th></th></tr></thead><tbody>
    ${p.deliv.map((d,i) => `<tr><td class="t-title">${esc(d.l)}</td><td><select class="sel" data-bind="dv" data-p="${p.id}" data-i="${i}" data-k="step" aria-label="Étape">${DELIV_STEPS.map((s,k) => `<option value="${k}" ${k === +d.step ? 'selected' : ''}>${s}</option>`).join('')}</select></td>
      <td><div class="meter"><i style="width:${(+d.step || 0) / (DELIV_STEPS.length - 1) * 100}%"></i></div></td><td class="mono ${d.due && diffDays(d.due) < 0 && +d.step < DELIV_STEPS.length - 1 ? 'sumbad' : ''}">${d.due ? dshort(d.due) : '—'}</td>
      <td><select class="sel" data-bind="dv" data-p="${p.id}" data-i="${i}" data-k="who" aria-label="Monteur">${personOpts('—').map(([v,l]) => `<option value="${esc(v)}" ${v === (d.who || '') ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></td>
      <td><button class="x" data-act="dv-del" data-p="${p.id}" data-i="${i}" aria-label="Supprimer">×</button></td></tr>`).join('') || '<tr><td colspan="6" class="empty">Aucun livrable : ajoutez le film, ses déclinaisons, les formats réseaux…</td></tr>'}
    </tbody></table></div>
    <form class="form" data-form="dv" data-p="${p.id}"><div class="field grow"><label for="dv-l">Nouveau livrable</label><input id="dv-l" name="l" placeholder="Ex. Film 2 min 16:9 + version 9:16" required></div><div class="field"><label for="dv-d">Échéance</label><input id="dv-d" type="date" name="d"></div><button class="btn" type="submit">Ajouter</button></form></section>
  <div class="grid2 rev"><section class="panel">${cur ? versionPane(p, cur) : '<div class="panel-b empty-hero" style="padding:28px 20px"><h2>Revue des versions</h2><p class="mut">Déposez une version (fichier vidéo ou lien Frame.io, Vimeo, NAS) : vous et le client la commentez au timecode, puis vous la validez.</p></div>'}</section>
  <section class="panel"><div class="panel-h"><h2>Versions</h2><button class="btn sm pri" data-act="ver-new" data-p="${p.id}">Nouvelle version</button></div><div class="panel-b"><ul class="list">
    ${vs.map(v => { const open = v.comments.filter(c => !c.done).length; return `<li><button class="vpick ${cur && v.id === cur.id ? 'on' : ''}" data-act="ver-pick" data-p="${p.id}" data-id="${v.id}"><b>${esc(v.label)}</b><span class="tag">${dshort(v.date)} · ${v.comments.length} commentaire${v.comments.length > 1 ? 's' : ''}${open ? `, ${open} à traiter` : ''}</span></button><span class="pill ${V_CLS[v.st] || ''}">${esc(v.st)}</span></li>`; }).join('') || '<li class="empty">Aucune version.</li>'}
  </ul></div></section></div>`;
};
function versionPane(p, v){
  const file = v.fileId && FILES.find(f => f.id === v.fileId);
  const cs = [...v.comments].sort((a,b) => a.tc - b.tc);
  return `<div class="panel-h"><h2>${esc(v.label)}</h2><select class="sel" data-bind="ver-st" data-p="${p.id}" data-id="${v.id}" aria-label="Statut de la version">${V_ST.map(s => `<option ${s === v.st ? 'selected' : ''}>${s}</option>`).join('')}</select></div>
  <div class="panel-b">
    ${file ? `<video id="vplayer" controls preload="metadata" src="${fileUrl(file)}"></video>` : `<div class="vph"><label class="btn sm upl" style="margin-bottom:8px">Joindre le fichier vidéo<input type="file" id="ver-file" accept="video/*" data-p="${p.id}" data-id="${v.id}"></label>${v.link ? `<p>Version hébergée ailleurs.</p><a class="btn" href="${esc(v.link)}" target="_blank" rel="noopener">Ouvrir la vidéo</a><p class="note">Notez le timecode affiché par le lecteur dans chaque commentaire.</p>` : '<p class="mut">Aucun fichier vidéo pour cette version.</p>'}</div>`}
    <form class="inline-add" data-form="vc" data-p="${p.id}" data-id="${v.id}"><input type="text" name="tc" id="vc-tc" value="${tcFmt(0)}" class="mono" style="width:120px;flex:0 0 auto" aria-label="Timecode">${file ? '<button class="btn sm" type="button" data-act="vc-now">Position actuelle</button>' : ''}<input type="text" name="t" placeholder="Commentaire sur ce passage" aria-label="Commentaire" required><button class="btn sm pri" type="submit">Commenter</button></form>
    <ul class="list vcomments">${cs.map(c => `<li class="${c.done ? 'is-done' : ''}"><button class="tc" data-act="vc-seek" data-tc="${c.tc}" title="Aller à ce passage">${tcFmt(c.tc)}</button><div class="grow"><span class="${c.done ? 'done-txt' : ''}">${esc(c.text)}</span><span class="tag">${esc(c.who)} · ${dshort(c.at)}</span></div>
      <label class="check" style="padding:0"><input type="checkbox" data-act="vc-done" data-p="${p.id}" data-id="${v.id}" data-c="${c.id}" ${c.done ? 'checked' : ''}> traité</label><button class="x" data-act="vc-del" data-p="${p.id}" data-id="${v.id}" data-c="${c.id}" aria-label="Supprimer">×</button></li>`).join('') || '<li class="empty">Aucun commentaire.</li>'}</ul>
  </div>`;
}
const findVer = (p, id) => p.versions.find(v => v.id === id);
BINDS.dv = (el, d) => { const p = PR(d.p), x = p.deliv[+d.i]; x[d.k] = d.k === 'step' ? +el.value : el.value; persist('project', p); render(); };
SUBMITS.dv = (f, v) => { const p = PR(f.dataset.p); p.deliv.push({id: uid(), l: v.l.trim(), step: 0, due: v.d || '', who: ''}); persist('project', p); render(); };
ACTIONS['dv-del'] = (el, d, p) => { p.deliv.splice(+d.i, 1); persist('project', p); render(); };
ACTIONS['ver-pick'] = (el, d, p) => { UI.ver[p.id] = d.id; render(); };
ACTIONS['ver-new'] = (el, d, p) => {
  const n = p.versions.length + 1;
  formDialog({title:'Nouvelle version', submit:'Ajouter',
    fields:[{k:'label', label:'Nom', required:true, full:true}, {k:'link', label:'Lien externe (Frame.io, Vimeo, NAS…)', type:'url', full:true, hint:'Ou joignez le fichier vidéo juste après.'}],
    values:{label:`V${n}`},
    onSubmit: v => { const ver = {id: uid(), label: v.label, link: v.link, date: TODAY, st:'en attente de retours', fileId: null, comments: []}; p.versions.push(ver); UI.ver[p.id] = ver.id; persist('project', p); render();
      setTimeout(() => { const inp = document.getElementById('ver-file'); if (!v.link && inp) inp.click(); }, 50); } });
};
document.addEventListener('change', async e => {
  const el = e.target; if (el.id !== 'ver-file' || !el.files.length) return;
  const p = PR(el.dataset.p), v = findVer(p, el.dataset.id); const f = await uploadFile(p.id, el.files[0], 'video');
  if (f){ v.fileId = f.id; persist('project', p); toast('Vidéo ajoutée'); } render();
});
BINDS['ver-st'] = (el, d) => { const p = PR(d.p), v = findVer(p, d.id); v.st = el.value; if (el.value === 'validée') v.validatedAt = TODAY; persist('project', p); render(); };
ACTIONS['vc-now'] = () => { const vid = document.getElementById('vplayer'); if (vid){ vid.pause(); document.getElementById('vc-tc').value = tcFmt(vid.currentTime); document.querySelector('[data-form="vc"] [name=t]').focus(); } };
ACTIONS['vc-seek'] = (el, d) => { const vid = document.getElementById('vplayer'); if (vid){ vid.currentTime = +d.tc; vid.pause(); vid.scrollIntoView({block:'nearest', behavior:'smooth'}); } else toast(`Aller à ${tcFmt(+d.tc)} dans le lecteur externe.`); };
ACTIONS['vc-done'] = (el, d, p) => { const c = findVer(p, d.id).comments.find(x => x.id === d.c); c.done = el.checked; persist('project', p); render(); };
ACTIONS['vc-del'] = (el, d, p) => { const v = findVer(p, d.id); v.comments = v.comments.filter(x => x.id !== d.c); persist('project', p); render(); };
SUBMITS.vc = (f, v) => { const p = PR(f.dataset.p), ver = findVer(p, f.dataset.id), tc = tcParse(v.tc);
  if (isNaN(tc)) return toast('Timecode invalide : écrivez par exemple 00:01:23:12.');
  ver.comments.push({id: uid(), tc, who: f.dataset.who || ME.name, text: v.t.trim(), done: false, at: TODAY}); persist('project', p); render(); };
EXTRA_ALERTS.push(() => DB.project.filter(p => p.stage < 7).flatMap(p => p.deliv.filter(d => d.due && diffDays(d.due) < 0 && +d.step < DELIV_STEPS.length - 1).map(d => ({lv:'bad', p, t:`Livrable en retard : ${d.l}`, s:`prévu le ${dshort(d.due)} · ${DELIV_STEPS[+d.step]}`}))));

/* ============ 5. Espace client (aperçu) ============ */
const CLIENT_STEPS = ['Proposition','Préparation','Production','Post-production','Livraison'];
const clientStep = st => st <= 1 ? 0 : st <= 3 ? 1 : st === 4 ? 2 : st === 5 ? 3 : 4;
CLIENT_HEAD.push(c => `<button class="btn" data-go="portail-${c.id}">Voir l’espace client</button>`);
function portalTop(label, back){ return `<div class="portal-top"><span><b>Aperçu</b> · ${esc(label)}</span><button class="btn sm" data-go="${back}">Revenir à RondPoint</button></div>`; }
VIEWS.portail = r => {
  const c = byId(DB.client, r.id); if (!c) return vClients();
  const ps = DB.project.filter(p => p.c === c.id && (p.stage < 7 || p.versions.length) && p.stage >= 1);
  const who = (c.contact || c.name) + ' (client)';
  return `${portalTop(`ce que voit ${c.contact || c.name} une fois connecté(e)`, 'client-' + c.id)}
  <header class="portal-h"><b class="wm" role="img" aria-label="11.65Lab">11<i></i>65Lab</b><div><p class="eyebrow">Espace client</p><h1>${esc(c.name)}</h1><p class="sub">Bonjour ${esc(firstName(c.contact) || '')}, voici l’avancement de vos projets avec 11.65Lab.</p></div></header>
  ${ps.map(p => { const f = fin(p), step = clientStep(p.stage), dls = p.dl.filter(d => !d.x && d.d).sort((a,b) => a.d.localeCompare(b.d)).slice(0, 3);
    const toReview = p.versions.filter(v => v.st !== 'validée'), done = p.versions.filter(v => v.st === 'validée');
    const invs = f.inv.filter(i => i.st !== 'à émettre'), quoteOpen = ['envoyé','relancé'].includes(p.quote.st);
    return `<section class="panel pp"><div class="panel-h"><div><h2>${esc(p.title)}</h2><p class="sub" style="margin:2px 0 0">${p.shoot?.[0] ? `${dlong(p.shoot[0])}${p.shoot[1] !== p.shoot[0] ? ' au ' + dlong(p.shoot[1]) : ''}` : esc(p.type)}</p></div><span class="pill acc">${CLIENT_STEPS[step]}</span></div>
      <div class="panel-b"><ol class="pp-steps">${CLIENT_STEPS.map((s,i) => `<li class="${i < step ? 'done' : i === step ? 'cur' : ''}"><span></span>${s}</li>`).join('')}</ol>
      <div class="grid2e" style="margin-top:16px">
        <div class="stack">
          ${dls.length ? `<div><h3>Prochaines étapes</h3><ul class="list">${dls.map(d => `<li><span class="when">${dshort(d.d)}</span><div class="grow">${esc(d.l)}</div></li>`).join('')}</ul></div>` : ''}
          ${toReview.map(v => clientVersion(p, v, who)).join('')}
          ${done.length ? `<p class="note">Versions validées : ${done.map(v => esc(v.label)).join(', ')}.</p>` : ''}
        </div>
        <div class="stack">
          <div><h3>Fichiers partagés</h3>${filesList(p)}<label class="btn sm upl" style="margin-top:10px">Nous envoyer des fichiers<input type="file" multiple data-up="doc" data-p="${p.id}"></label></div>
          ${quoteOpen ? `<div><h3>Proposition en attente</h3><ul class="list"><li><div class="grow">Devis ${esc(qNum(p))}<span class="tag">valable jusqu’au ${dshort(p.quote.valid)}</span></div><span class="num">${eurC(f.sold * 1.2)} TTC</span></li></ul></div>` : ''}
          ${invs.length ? `<div><h3>Factures</h3><ul class="list">${invs.map(i => `<li><div class="grow">${esc(i.l)}<span class="tag">échéance ${dshort(i.d)}</span></div><span class="num">${eurC(i.amt * 1.2)} TTC</span><span class="pill ${i.st === 'payée' ? 'good' : invLate(i) ? 'bad' : 'acc'}">${i.st === 'payée' ? 'réglée' : invLate(i) ? 'en retard' : 'à régler'}</span></li>`).join('')}</ul></div>` : ''}
        </div></div></div></section>`; }).join('') || '<section class="panel empty-hero"><div class="panel-b"><h2>Aucun projet en cours</h2><p class="mut">Les projets apparaissent ici dès que le devis est envoyé.</p></div></section>'}
  <p class="note" style="margin-top:16px">Le client ne voit ni les coûts, ni les marges, ni les autres clients. Les accès clients se créeront dans Paramètres au lot 2.</p>`;
};
function clientVersion(p, v, who){
  const file = v.fileId && FILES.find(f => f.id === v.fileId), cs = [...v.comments].sort((a,b) => a.tc - b.tc);
  return `<div class="pp-ver"><h3>À valider · ${esc(v.label)}</h3>
    ${file ? `<video id="vplayer" controls preload="metadata" src="${fileUrl(file)}"></video>` : v.link ? `<a class="btn sm" href="${esc(v.link)}" target="_blank" rel="noopener">Voir la vidéo</a>` : ''}
    <ul class="list vcomments">${cs.map(c => `<li><button class="tc" data-act="vc-seek" data-tc="${c.tc}">${tcFmt(c.tc)}</button><div class="grow"><span class="${c.done ? 'done-txt' : ''}">${esc(c.text)}</span><span class="tag">${esc(c.who)}${c.done ? ' · pris en compte' : ''}</span></div></li>`).join('')}</ul>
    <form class="inline-add" data-form="vc" data-p="${p.id}" data-id="${v.id}" data-who="${esc(who)}"><input type="text" name="tc" id="vc-tc" value="${tcFmt(0)}" class="mono" style="width:120px;flex:0 0 auto" aria-label="Timecode">${file ? '<button class="btn sm" type="button" data-act="vc-now">Position actuelle</button>' : ''}<input type="text" name="t" placeholder="Votre retour sur ce passage" aria-label="Commentaire" required><button class="btn sm" type="submit">Envoyer</button></form>
    <button class="btn pri" style="margin-top:10px" data-act="ver-validate" data-p="${p.id}" data-id="${v.id}">Valider cette version</button></div>`;
}
ACTIONS['ver-validate'] = (el, d, p) => { const v = findVer(p, d.id); v.st = 'validée'; v.validatedAt = TODAY; persist('project', p); render(); toast(`${v.label} validée`); };

/* ============ 5. Espace intervenant (aperçu) ============ */
VIEWS.equipier = r => {
  const u = byId(DB.person, r.id); if (!u) return vTeam();
  const bs = DB.project.flatMap(p => p.crew.filter(b => b.p === u.id && b.st !== 'annulé').map(b => ({b, p}))).sort((x,y) => String(x.b.f).localeCompare(String(y.b.f)));
  const upcoming = bs.filter(x => (x.b.t || '') >= TODAY), confirmed = upcoming.filter(x => x.b.st === 'confirmé');
  const sheets = confirmed.flatMap(({b,p}) => p.sheets.filter(s => b.f <= s.d && s.d <= b.t).map(s => ({s, p}))).sort((a,b) => a.s.d.localeCompare(b.s.d));
  const projs = [...new Set(upcoming.map(x => x.p))];
  return `${portalTop(`ce que voit ${u.name} une fois connecté(e)`, 'equipe')}
  <header class="portal-h"><b class="wm" role="img" aria-label="11.65Lab">11<i></i>65Lab</b><div><p class="eyebrow">Espace intervenant</p><h1>${esc(u.name)}</h1><p class="sub">${esc(u.role)}</p></div></header>
  <div class="grid2"><div class="stack">
    <section class="panel"><div class="panel-h"><h2>Mes dates</h2></div><div class="panel-b"><ul class="list">
      ${upcoming.map(({b,p}) => `<li><span class="when">${dshort(b.f)}${b.t !== b.f ? '<br>→ ' + dshort(b.t) : ''}</span><div class="grow"><b>${esc(p.title)}</b><span class="tag">${esc(b.role || u.role)} · ${esc(C(p.c).name)}</span></div>
        ${b.st === 'confirmé' ? '<span class="pill good">confirmé</span>' : `<span class="pill ${BK_CLS[b.st]}">${esc(b.st)}${b.st === 'option' && b.optUntil ? ' jusqu’au ' + dshort(b.optUntil) : ''}</span><span class="chips"><button class="btn sm" data-act="eq-reply" data-p="${p.id}" data-id="${b.id}" data-v="dispo" aria-pressed="${b.reply === 'dispo'}">Dispo</button><button class="btn sm ghost" data-act="eq-reply" data-p="${p.id}" data-id="${b.id}" data-v="pas dispo">Pas dispo</button></span>`}</li>`).join('') || '<li class="empty">Aucune date à venir.</li>'}
    </ul></div></section>
    ${sheets.map(({s,p}) => `<details class="panel pp-sheet"><summary><b>Feuille de service · ${dshort(s.d)}</b> <span class="mut">${esc(shortTitle(p.title))} · convocation ${esc(s.convoc || '—')}</span></summary>${sheetDoc(p, s)}</details>`).join('')}
  </div><div class="stack">
    <section class="panel"><div class="panel-h"><h2>Note de frais</h2></div>
      ${projs.length ? `<form class="form" data-form="eq-exp" data-u="${u.id}" style="border-radius:0 0 10px 10px">
        <div class="field grow"><label for="eq-p">Projet</label><select id="eq-p" name="p">${projs.map(p => `<option value="${p.id}">${esc(shortTitle(p.title))}</option>`).join('')}</select></div>
        <div class="field"><label for="eq-d">Date</label><input id="eq-d" type="date" name="d" value="${TODAY}"></div>
        <div class="field grow"><label for="eq-l">Dépense</label><input id="eq-l" name="l" placeholder="Ex. Péage, parking, repas" required></div>
        <div class="field"><label for="eq-a">Montant TTC (€)</label><input id="eq-a" type="text" inputmode="decimal" name="a" style="width:100px" required></div>
        <div class="field"><label for="eq-f">Justificatif</label><input id="eq-f" type="file" name="f" accept="image/*,.pdf" style="width:190px"></div>
        <button class="btn pri" type="submit">Envoyer</button></form>` : '<div class="panel-b"><p class="empty">Disponible quand vous êtes sur un projet.</p></div>'}
    </section>
    <section class="panel"><div class="panel-h"><h2>Mes coordonnées</h2></div><div class="panel-b"><ul class="list"><li><div class="grow">Téléphone</div><span class="mono">${esc(u.phone || '—')}</span></li><li><div class="grow">E-mail</div><span>${esc(u.email || '—')}</span></li></ul></div></section>
  </div></div>
  <p class="note" style="margin-top:16px">L’intervenant ne voit que ses propres dates, les feuilles de service de ses journées confirmées et ses notes de frais. Ni budget, ni tarifs des autres.</p>`;
};
ACTIONS['eq-reply'] = (el, d, p) => { const b = p.crew.find(x => x.id === d.id); b.reply = d.v; persist('project', p); render(); toast(d.v === 'dispo' ? 'Réponse envoyée : disponible' : 'Réponse envoyée : pas disponible'); };
SUBMITS['eq-exp'] = async (f, v) => {
  const p = PR(v.p), u = P(f.dataset.u), amt = toNum(v.a); if (!(amt >= 0)) return toast('Montant invalide : écrivez par exemple 12,50.');
  let receipt = null; if (v.f && v.f.size){ const up = await uploadFile(p.id, v.f, 'justif'); if (up) receipt = up.id; }
  p.exp.push({d: v.d || TODAY, label: `${v.l} (note de frais ${u.name})`, ch: 'Régie & transport', amt: Math.round(amt / 1.2 * 100) / 100, rebill: false, receipt, by: u.id, pending: true});
  persist('project', p); toast('Note de frais envoyée : elle apparaît dans les dépenses du projet.'); render();
};

/* ============ Accueil ============ */
function weekEvents(d){
  const ev = [];
  DB.project.filter(p => p.stage >= 1 && p.stage < 7 && p.shoot?.[0] && p.shoot[0] <= d && d <= (p.shoot[1] || p.shoot[0])).forEach(p => {
    const sh = p.sheets.find(s => s.d === d);
    ev.push({k:'shoot', t: shortTitle(p.title), s: sh ? `${sh.type}${sh.convoc ? ' · ' + sh.convoc : ''}` : p.type, go:`projet-${p.id}${sh ? '-feuilles' : ''}`});
  });
  DB.project.forEach(p => p.dl.filter(x => !x.x && x.d === d).forEach(x => ev.push({k:'dl', t: x.l, s: shortTitle(p.title), go:`projet-${p.id}`})));
  DB.project.forEach(p => p.deliv.filter(x => x.due === d && +x.step < DELIV_STEPS.length - 1).forEach(x => ev.push({k:'dl', t: x.l, s: 'livrable', go:`projet-${p.id}-postprod`})));
  DB.project.forEach(p => p.inv.filter(i => i.st === 'à émettre' && i.d === d).forEach(i => ev.push({k:'money', t: `Facturer : ${i.l}`, s: shortTitle(p.title), go:'factures'})));
  return ev;
}
function todoItems(){
  const out = [];
  DB.project.filter(relanceDue).forEach(p => out.push({t:`Relancer ${C(p.c).contact || C(p.c).name} pour le devis « ${shortTitle(p.title)} »`, go:`projet-${p.id}-devis`, b:'Voir le devis'}));
  bookings().filter(b => b.st === 'option' && b.optUntil && diffDays(b.optUntil) <= 3).forEach(b => out.push({t:`Lever ou confirmer l’option de ${P(b.p).name} (${dueLabel(b.optUntil)})`, go:`projet-${b.proj.id}-equipe`, b:'Équipe'}));
  DB.project.forEach(p => fin(p).inv.filter(i => i.st === 'à émettre' && i.d && diffDays(i.d) <= 3).forEach(i => out.push({t:`Émettre « ${i.l} » pour ${shortTitle(p.title)} dans Tiime`, go:'factures', b:'Facturation'})));
  DB.project.forEach(p => fin(p).inv.filter(invLate).forEach(i => out.push({t:`Relancer le paiement « ${i.l} » de ${C(p.c).name}`, go:'factures', b:'Facturation'})));
  DB.project.filter(p => p.stage < 7).forEach(p => p.versions.filter(v => v.st === 'à corriger').forEach(v => { const n = v.comments.filter(c => !c.done).length; if (n) out.push({t:`${n} retour${n > 1 ? 's' : ''} à traiter sur ${v.label}`, go:`projet-${p.id}-postprod`, b:'Versions'}); }));
  DB.doc.filter(d => ['exp','soon'].includes(docState(d).k)).forEach(d => out.push({t:`Renouveler : ${d.label}`, go:'documents', b:'Documents'}));
  return out;
}
VIEWS.accueil = () => {
  const h = new Date().getHours(), hello = h < 5 || h >= 18 ? 'Bonsoir' : 'Bonjour';
  const start = mondayOf(TODAY), days = Array.from({length: 7}, (_, i) => addDays(start, i));
  const evs = days.map(d => ({d, ev: weekEvents(d)}));
  const shoots = new Set(evs.flatMap(x => x.ev.filter(e => e.k === 'shoot').map(e => e.t))).size;
  const dls = evs.reduce((a,x) => a + x.ev.filter(e => e.k === 'dl').length, 0);
  const todo = todoItems();
  const act = DB.project.filter(p => p.stage >= 2 && p.stage < 7).sort((a,b) => String((nextDl(a) || {}).d || '9').localeCompare(String((nextDl(b) || {}).d || '9')));
  const summary = [shoots ? `${shoots} tournage${shoots > 1 ? 's' : ''}` : '', dls ? `${dls} échéance${dls > 1 ? 's' : ''}` : '', todo.length ? `${todo.length} chose${todo.length > 1 ? 's' : ''} à faire` : ''].filter(Boolean);
  const wd = d => new Date(d + 'T12:00:00Z').toLocaleDateString('fr-FR', {weekday:'long', timeZone:'UTC'});
  const monthPaid = DB.project.flatMap(p => fin(p).inv).filter(i => i.st === 'payée' && i.paidAt && i.paidAt.slice(0,7) === TODAY.slice(0,7)).reduce((a,i) => a + i.amt, 0);
  return `<section class="home-hero"><p class="eyebrow">${dlong(TODAY)}</p><h1>${hello} ${esc(firstName(ME.name))}</h1>
    <p class="home-sum">${summary.length ? 'Cette semaine : ' + summary.join(', ') + '.' : 'Semaine calme : rien de prévu pour l’instant.'}</p>
    <div class="chips"><button class="btn pri" data-act="project-new">Nouveau projet</button><button class="btn" data-go="temps">Saisir du temps</button><button class="btn" data-go="planning">Planning</button><button class="btn" data-act="client-new">Nouveau client</button></div></section>
  <section class="week" aria-label="Cette semaine">${evs.map(({d, ev}) => `<div class="day ${d === TODAY ? 'today' : ''} ${d < TODAY ? 'past' : ''}"><div class="day-h"><span>${wd(d)}</span><b>${Number(d.slice(8))}</b></div>
    ${ev.slice(0, 4).map(e => `<button class="ev ev-${e.k}" data-go="${e.go}"><b>${esc(e.t)}</b><span>${esc(e.s)}</span></button>`).join('')}${ev.length > 4 ? `<span class="ev-more">+ ${ev.length - 4}</span>` : ''}</div>`).join('')}</section>
  <div class="home-grid">
    <section class="panel soft"><div class="panel-h"><h2>À faire</h2>${todo.length ? `<span class="mut">${todo.length}</span>` : ''}</div><div class="panel-b">
      ${todo.length ? `<ul class="todo">${todo.slice(0, 7).map(x => `<li><span class="tick" aria-hidden="true"></span><span class="grow">${esc(x.t)}</span><button class="btn sm ghost" data-go="${x.go}">${esc(x.b)}</button></li>`).join('')}</ul>${todo.length > 7 ? `<p class="note">Et ${todo.length - 7} autre${todo.length - 7 > 1 ? 's' : ''} sur le tableau de bord.</p>` : ''}` : '<p class="empty">Rien d’urgent. Profite.</p>'}
    </div></section>
    <section class="panel soft"><div class="panel-h"><h2>Projets en cours</h2><button class="btn sm ghost" data-go="projets">Tous</button></div><div class="panel-b"><ul class="proj-mini">
      ${act.slice(0, 6).map(p => { const n = nextDl(p), step = clientStep(p.stage); return `<li><button data-go="projet-${p.id}"><span class="grow"><b>${esc(shortTitle(p.title))}</b><span class="tag">${esc(C(p.c).name)}${n ? ` · prochaine étape : ${esc(n.l)}, ${dueLabel(n.d)}` : ''}</span></span>
        <span class="mini-steps" title="${CLIENT_STEPS[step]}">${CLIENT_STEPS.map((s,i) => `<i class="${i < step ? 'done' : i === step ? 'cur' : ''}"></i>`).join('')}</span></button></li>`; }).join('') || '<li class="empty">Aucun projet en cours.</li>'}
    </ul></div></section>
  </div>
  <p class="home-foot">${monthPaid ? `${eur(monthPaid)} encaissés ce mois-ci. ` : ''}Les chiffres détaillés sont sur le <button class="crumb" data-go="dashboard">tableau de bord</button>.</p>`;
};

/* ============ 6. Import Tiime ============ */
/* Lecteur .xlsx minimal (zip + XML), sans bibliothèque : fonctionne dans tout navigateur récent. */
async function readXlsx(file){
  const buf = new Uint8Array(await file.arrayBuffer()), dv = new DataView(buf.buffer), td = new TextDecoder();
  let e = buf.length - 22; while (e >= 0 && dv.getUint32(e, true) !== 0x06054b50) e--;
  if (e < 0) throw new Error(`« ${file.name} » n’est pas un fichier Excel (.xlsx).`);
  const n = dv.getUint16(e + 10, true); let p = dv.getUint32(e + 16, true); const files = {};
  for (let i = 0; i < n; i++){
    const nl = dv.getUint16(p + 28, true), xl = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true);
    files[td.decode(buf.subarray(p + 46, p + 46 + nl))] = {m: dv.getUint16(p + 10, true), cs: dv.getUint32(p + 20, true), o: dv.getUint32(p + 42, true)};
    p += 46 + nl + xl + cl;
  }
  const get = async name => { const f = files[name]; if (!f) return null;
    const st = f.o + 30 + dv.getUint16(f.o + 26, true) + dv.getUint16(f.o + 28, true), data = buf.subarray(st, st + f.cs);
    if (f.m === 0) return td.decode(data);
    return td.decode(await new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer()); };
  const xml = s => new DOMParser().parseFromString(s, 'application/xml');
  const ssx = await get('xl/sharedStrings.xml');
  const strings = ssx ? [...xml(ssx).getElementsByTagName('si')].map(si => [...si.getElementsByTagName('t')].map(t => t.textContent).join('')) : [];
  const sheet = Object.keys(files).filter(k => /^xl\/worksheets\/sheet\d+\.xml$/.test(k)).sort()[0];
  if (!sheet) throw new Error(`Aucune feuille dans « ${file.name} ».`);
  const col = ref => { let c = 0; for (const ch of ref.replace(/\d+/g, '')) c = c * 26 + ch.charCodeAt(0) - 64; return c - 1; };
  const out = [];
  for (const r of xml(await get(sheet)).getElementsByTagName('row')){
    const row = [];
    for (const c of r.getElementsByTagName('c')){
      const t = c.getAttribute('t'), v = c.getElementsByTagName('v')[0];
      row[col(c.getAttribute('r'))] = t === 's' ? strings[+v.textContent] : t === 'inlineStr' ? c.textContent : t === 'str' ? (v ? v.textContent : '') : t === 'b' ? (v && v.textContent === '1') : v ? Number(v.textContent) : null;
    }
    out.push(row);
  }
  const head = (out.shift() || []).map(h => String(h ?? '').trim().toLowerCase());
  return {head, rows: out.filter(r => r.some(x => x !== null && x !== undefined && x !== '')).map(r => Object.fromEntries(head.map((h,i) => [h, r[i] ?? null])))};
}
const xDate = v => v == null || v === '' ? '' : typeof v === 'number' ? new Date(Math.round((v - 25569) * 864e5)).toISOString().slice(0,10) : (String(v).match(/^\d{4}-\d{2}-\d{2}/) || [String(v).split('/').reverse().join('-')])[0];
const xNum = v => typeof v === 'number' ? v : toNum(v) || 0;
const normName = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const TQ = {'accepté':'accepté', 'refusé':'refusé', 'annulée':'annulé', 'annulé':'annulé', 'sauvegardée':'en attente', 'sauvegardé':'en attente', 'envoyé':'en attente', 'envoyée':'en attente'};
function parseTiime(sets){
  const res = {clients: [], devis: [], factures: []};
  for (const {head, rows} of sets){
    if (head.includes('numéro de facture')) res.factures = rows.map(r => ({tid: r['id'], no: r['numéro de facture'], d: xDate(r['date de facture']), label: r['intitulé'] || '', st: String(r['statut de la facture'] || '').trim(), client: r['nom du client'] || '', ht: xNum(r['montant ht']), ttc: xNum(r['montant ttc']), devisNo: +((String(r['intitulé'] || '').match(/devis n°\s*(\d+)/i) || [])[1]) || null, txn: r['transaction(s) liée(s)'] || ''}));
    else if (head.includes('numéro du devis')) res.devis = rows.map(r => ({tid: r['id'], no: r['numéro du devis'], d: xDate(r['date du devis']), label: r['intitulé'] || '', st: TQ[String(r['statut du devis'] || '').trim().toLowerCase()] || String(r['statut du devis'] || '').trim(), client: r['nom du client'] || '', ht: xNum(r['montant ht']), ttc: xNum(r['montant ttc']), factures: String(r['facture(s) liée(s)'] ?? '').split(/[^\d]+/).filter(Boolean).map(Number)}));
    else if (head.includes('nom') && head.includes('encours')) res.clients = rows.map(r => ({tid: r['id'], name: r['nom'] || '', email: r['email'] || '', phone: r['téléphone'] ? String(r['téléphone']) : '', siret: r['siren/siret'] ? String(r['siren/siret']) : '', address: [r['adresse'], r["complément d'adresse"], [r['code postal'], r['ville']].filter(Boolean).join(' '), r['pays'] && r['pays'] !== 'France' ? r['pays'] : ''].filter(Boolean).join(', '), ht: xNum(r['facturé ht']), paid: xNum(r['encaissé']), due: xNum(r['encours']), st: r['statut'] || ''}));
  }
  res.devis.forEach(d => d.factures.forEach(no => { const f = res.factures.find(x => x.no === no); if (f && !f.devisNo) f.devisNo = d.no; }));
  return res;
}
const T = () => SETX.tiime || null;
const dY = s => s ? new Date(s + 'T12:00:00Z').toLocaleDateString('fr-FR',{day:'numeric',month:'short',year:'2-digit',timeZone:'UTC'}) : '—';
const cleanLbl = s => String(s || '').replace(/\s*facture issue du devis n°\s*\d+/i, '').trim();
const tInvLate = f => f.st === 'Facturée' && f.d && diffDays(f.d) < -30;
const tOpen = f => f.st === 'Facturée' && f.ttc > 0;
const tClientKey = c => normName(c.tiime || c.name);
SETTINGS_PANELS.push(() => { const t = T();
  return `<section class="panel"><div class="panel-h"><h2>Import Tiime</h2>${t ? `<span class="mut">dernier import ${dshort(t.at)}</span>` : ''}</div><div class="panel-b">
    <p class="mut" style="margin:0 0 10px">Dans Tiime, exportez vos données puis déposez ici <b>clients.xlsx</b>, <b>devis.xlsx</b> et <b>factures.xlsx</b> (les trois en même temps). Les clients manquants sont créés, et RondPoint affiche le chiffre d’affaires facturé, les statuts de devis et les factures en attente de paiement. Rien n’est renvoyé vers Tiime.</p>
    ${t ? `<ul class="list"><li><div class="grow">${t.clients.length} clients · ${t.devis.length} devis · ${t.factures.length} factures</div><span class="pill good">à jour au ${dshort(t.at)}</span></li></ul>` : ''}
    <label class="btn ${t ? '' : 'pri'} upl" style="margin-top:10px">${t ? 'Mettre à jour depuis un nouvel export' : 'Choisir les fichiers Tiime'}<input type="file" id="tiime-files" multiple accept=".xlsx"></label></div></section>`; });
document.addEventListener('change', async e => {
  if (e.target.id !== 'tiime-files' || !e.target.files.length) return;
  let data; try { data = parseTiime(await Promise.all([...e.target.files].map(readXlsx))); } catch (x) { toast(x.message || 'Lecture du fichier impossible.'); return; }
  if (!data.factures.length && !data.devis.length && !data.clients.length) return toast('Ces fichiers ne ressemblent pas à un export Tiime (clients, devis, factures).');
  const known = new Set(DB.client.map(tClientKey));
  const names = [...new Set([...data.clients.map(c => c.name), ...data.devis.map(d => d.client), ...data.factures.map(f => f.client)].filter(Boolean))];
  const fresh = names.filter(n => !known.has(normName(n)) && normName(n) !== 'nouveau client');
  const open = data.factures.filter(tOpen);
  const dlg = document.getElementById('dlg');
  dlg.innerHTML = `<div class="dform"><header><h2>Import Tiime</h2><button type="button" class="x" data-close aria-label="Fermer">×</button></header><div class="dgrid"><div class="field full">
    <ul class="list"><li><div class="grow">Clients</div><b>${names.length}</b><span class="tag">${fresh.length} à créer</span></li><li><div class="grow">Devis</div><b>${data.devis.length}</b></li><li><div class="grow">Factures</div><b>${data.factures.length}</b><span class="tag">${open.length} en attente de paiement</span></li></ul>
    <p class="note">Les ${fresh.length} nouveaux clients sont ajoutés avec leurs coordonnées. Les devis et factures restent un historique en lecture : Tiime reste la référence.</p></div></div>
    <footer><span style="flex:1"></span><button type="button" class="btn ghost" data-close>Annuler</button><button type="button" class="btn pri" id="tiime-go">Importer</button></footer></div>`;
  dlg.querySelectorAll('[data-close]').forEach(b => b.onclick = () => dlg.close());
  dlg.querySelector('#tiime-go').onclick = async () => {
    const go = dlg.querySelector('#tiime-go'); go.disabled = true; let k = 0;
    for (const name of fresh){
      go.textContent = `Import… ${++k} / ${fresh.length}`;
      const c = data.clients.find(x => normName(x.name) === normName(name)) || {};
      const [org, contact] = name.split(/\s+-\s+/);
      await create('client', {id: uid(), name: contact ? org : name, contact: contact || '', role: '', sector: '', email: c.email || '', phone: c.phone || '', siret: c.siret || '', address: c.address || '', tiime: name, notes: []});
    }
    DB.client.forEach(c => { const tc = data.clients.find(x => normName(x.name) === tClientKey(c)); if (tc){ let ch = false; ['email','phone','siret','address'].forEach(k => { if (!c[k] && tc[k]){ c[k] = tc[k]; ch = true; } }); if (!c.tiime){ c.tiime = tc.name; ch = true; } if (ch) persist('client', c); } });
    const prev = T() || {};
    SETX.tiime = {...prev, id:'tiime', at: TODAY, clients: data.clients.length ? data.clients : (prev.clients || []), devis: data.devis.length ? data.devis : (prev.devis || []), factures: data.factures.length ? data.factures : (prev.factures || [])};
    persist('setting', SETX.tiime); dlg.close(); render(); toast(`Import terminé : ${fresh.length} client${fresh.length > 1 ? 's' : ''} créé${fresh.length > 1 ? 's' : ''}, ${data.factures.length} factures, ${data.devis.length} devis.`);
  };
  dlg.showModal(); e.target.value = '';
});

/* --- Chiffre d'affaires facturé (Tiime) sur le tableau de bord --- */
const MONTHS = ['janv.','févr.','mars','avr.','mai','juin','juil.','août','sept.','oct.','nov.','déc.'];
function tiimeCA(){
  const t = T(); if (!t) return null;
  const y = +TODAY.slice(0,4), by = {}; t.factures.filter(f => f.st !== 'Brouillon' && f.d).forEach(f => { const k = f.d.slice(0,7); by[k] = (by[k] || 0) + f.ht; });
  const ytd = yr => Object.entries(by).filter(([k]) => +k.slice(0,4) === yr && +k.slice(5,7) <= +TODAY.slice(5,7)).reduce((a,[,v]) => a + v, 0);
  const year = yr => Object.entries(by).filter(([k]) => +k.slice(0,4) === yr).reduce((a,[,v]) => a + v, 0);
  return {by, y, ytd: ytd(y), ytdPrev: ytd(y - 1), prevYear: year(y - 1), open: t.factures.filter(tOpen), late: t.factures.filter(f => tOpen(f) && tInvLate(f))};
}
DASH_PANELS.push(() => {
  const ca = tiimeCA(); if (!ca) return '';
  const months = Array.from({length: 12}, (_, i) => ({i, cur: ca.by[`${ca.y}-${String(i + 1).padStart(2,'0')}`] || 0, prev: ca.by[`${ca.y - 1}-${String(i + 1).padStart(2,'0')}`] || 0}));
  const W = 760, H = 230, L = 52, R = 10, Tp = 14, B = 26, iw = W - L - R, ih = H - Tp - B, max = Math.max(1, ...months.flatMap(m => [m.cur, m.prev]));
  const step = [1000,2000,5000,10000,20000,25000,50000].find(s => max / s <= 5) || 100000, top = Math.ceil(max / step) * step;
  const Y = v => Tp + ih - v / top * ih, bw = iw / 12, cm = +TODAY.slice(5,7) - 1;
  const ticks = []; for (let v = 0; v <= top; v += step) ticks.push(v);
  const k = v => v >= 1000 ? num(v / 1000, 0) + ' k€' : eur(v);
  const delta = ca.ytdPrev ? (ca.ytd - ca.ytdPrev) / ca.ytdPrev : NaN;
  return `<section class="panel"><div class="panel-h"><div><h2>Chiffre d’affaires facturé</h2><p class="sub" style="margin:2px 0 0">${eur(ca.ytd)} HT depuis janvier${isNaN(delta) ? '' : `, ${delta >= 0 ? '+' : '−'}${num(Math.abs(delta) * 100, 0)} % sur la même période en ${ca.y - 1}`}</p></div>
    <div class="legend"><span><i class="lg-bar cur"></i>${ca.y}</span><span><i class="lg-bar prev"></i>${ca.y - 1} (${k(ca.prevYear)} sur l’année)</span></div></div>
    <div class="panel-b"><div class="tw"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Chiffre d'affaires facturé par mois, ${ca.y} et ${ca.y - 1}" style="width:100%;min-width:520px;height:auto">
      ${ticks.map(v => `<line x1="${L}" x2="${W - R}" y1="${Y(v)}" y2="${Y(v)}" stroke="var(--line)"/><text x="${L - 8}" y="${Y(v) + 4}" text-anchor="end" font-size="11" fill="var(--faint)" font-family="var(--f-mono)">${k(v)}</text>`).join('')}
      ${months.map(m => { const x = L + m.i * bw; return `<rect x="${x + bw * .14}" y="${Y(m.prev)}" width="${bw * .34}" height="${Tp + ih - Y(m.prev)}" rx="2" fill="var(--line-2)"><title>${MONTHS[m.i]} ${ca.y - 1} : ${eur(m.prev)}</title></rect>
        ${m.i <= cm ? `<rect x="${x + bw * .52}" y="${Y(m.cur)}" width="${bw * .34}" height="${Tp + ih - Y(m.cur)}" rx="2" fill="var(--brand)"${m.i === cm ? ' fill-opacity=".55"' : ''}><title>${MONTHS[m.i]} ${ca.y} : ${eur(m.cur)}</title></rect>` : ''}
        <text x="${x + bw / 2}" y="${H - 8}" text-anchor="middle" font-size="11" fill="${m.i === cm ? 'var(--fg)' : 'var(--muted)'}">${MONTHS[m.i]}</text>`; }).join('')}
    </svg></div><p class="note" style="margin-top:6px">Source : factures Tiime (hors brouillons), importées le ${dshort(T().at)}. Le mois en cours est en clair.</p></div></section>`;
});
EXTRA_ALERTS.push(() => { const ca = tiimeCA(); if (!ca) return []; const late = ca.late; if (!late.length) return [];
  const byC = {}; late.forEach(f => { byC[f.client] = (byC[f.client] || 0) + f.ttc; });
  return Object.entries(byC).sort((a,b) => b[1] - a[1]).map(([c, v]) => ({lv:'bad', t:`${c} : ${eur(v)} TTC impayés depuis plus de 30 jours`, s:'factures Tiime'})); });

/* --- Facturation : factures Tiime en attente --- */
const _factures = VIEWS.factures;
VIEWS.factures = r => { const t = T(); const base = _factures(r); if (!t) return base;
  const open = t.factures.filter(tOpen).sort((a,b) => a.d.localeCompare(b.d)), tot = open.reduce((a,f) => a + f.ttc, 0), late = open.filter(tInvLate).reduce((a,f) => a + f.ttc, 0);
  const zero = t.factures.filter(f => f.st === 'Facturée' && !f.ttc);
  const panel = `<section class="panel" style="margin-bottom:16px"><div class="panel-h"><div><h2>Dans Tiime : ${eur(tot)} TTC à encaisser</h2><p class="sub" style="margin:2px 0 0">${open.length} facture${open.length > 1 ? 's' : ''} émise${open.length > 1 ? 's' : ''}${late ? `, dont <b class="sumbad">${eur(late)}</b> depuis plus de 30 jours` : ''} · import du ${dshort(t.at)}</p></div></div>
    <div class="tw"><table><thead><tr><th>N°</th><th>Date</th><th>Client</th><th>Intitulé</th><th class="num">TTC</th><th>Retard</th></tr></thead><tbody>
    ${open.map(f => `<tr><td class="mono">${f.no ?? '—'}</td><td class="mono" style="white-space:nowrap">${dY(f.d)}</td><td>${esc(f.client)}</td><td class="mut">${esc(cleanLbl(f.label))}</td><td class="num">${eurC(f.ttc)}</td><td>${tInvLate(f) ? `<span class="pill bad">${-diffDays(f.d)} j</span>` : '<span class="pill">dans les délais</span>'}</td></tr>`).join('') || '<tr><td colspan="6" class="empty">Aucune facture en attente dans Tiime.</td></tr>'}
    </tbody></table></div>${zero.length ? `<p class="note" style="padding:0 16px 14px">À vérifier dans Tiime : ${zero.map(f => 'n°' + f.no).join(', ')} ${zero.length > 1 ? 'sont marquées' : 'est marquée'} « facturée » pour 0 €.</p>` : ''}</section>`;
  return base.replace('<section class="kpis">', panel + '<section class="kpis">'); };

/* --- Fiche client : historique Tiime --- */
CLIENT_PANELS.push(c => { const t = T(); if (!t) return '';
  const key = tClientKey(c), fs = t.factures.filter(f => normName(f.client) === key && f.st !== 'Brouillon').sort((a,b) => b.d.localeCompare(a.d)), ds = t.devis.filter(d => normName(d.client) === key).sort((a,b) => b.d.localeCompare(a.d));
  if (!fs.length && !ds.length) return '';
  const ht = fs.reduce((a,f) => a + f.ht, 0), due = fs.filter(tOpen).reduce((a,f) => a + f.ttc, 0), acc = ds.filter(d => d.st === 'accepté').length, ref = ds.filter(d => d.st === 'refusé').length;
  const years = [...new Set(fs.map(f => f.d.slice(0,4)))].sort().reverse();
  const qcls = {accepté:'good', refusé:'bad', annulé:'', 'en attente':'acc'};
  return `<section class="panel" style="margin-top:16px"><div class="panel-h"><div><h2>Historique Tiime</h2><p class="sub" style="margin:2px 0 0">${eur(ht)} HT facturés depuis ${fs.length ? fs[fs.length - 1].d.slice(0,4) : '—'}${years.length > 1 ? ' · ' + years.slice(0,3).map(y => `${y} : ${eur(fs.filter(f => f.d.startsWith(y)).reduce((a,f) => a + f.ht, 0))}`).join(' · ') : ''}${due ? ` · <b class="sumbad">${eur(due)} TTC à encaisser</b>` : ''}</p></div><span class="mut">${acc} devis accepté${acc > 1 ? 's' : ''}, ${ref} refusé${ref > 1 ? 's' : ''}</span></div>
    <div class="grid2e" style="padding:0 16px 16px"><div><h3 class="h3s">Devis</h3><div class="tw"><table><tbody>${ds.slice(0, 8).map(d => `<tr><td class="mono">${d.no}</td><td class="mono" style="white-space:nowrap">${dY(d.d)}</td><td>${esc(d.label)}</td><td class="num">${eur(d.ht)}</td><td><span class="pill ${qcls[d.st] || ''}">${esc(d.st)}</span></td></tr>`).join('')}</tbody></table></div>${ds.length > 8 ? `<p class="note">+ ${ds.length - 8} plus anciens</p>` : ''}</div>
    <div><h3 class="h3s">Factures</h3><div class="tw"><table><tbody>${fs.slice(0, 8).map(f => `<tr><td class="mono">${f.no ?? '—'}</td><td class="mono" style="white-space:nowrap">${dY(f.d)}</td><td>${esc(cleanLbl(f.label))}</td><td class="num">${eur(f.ht)}</td><td><span class="pill ${f.st === 'Payée' ? 'good' : tInvLate(f) ? 'bad' : 'acc'}">${f.st === 'Payée' ? 'payée' : tInvLate(f) ? 'en retard' : 'émise'}</span></td></tr>`).join('')}</tbody></table></div>${fs.length > 8 ? `<p class="note">+ ${fs.length - 8} plus anciennes</p>` : ''}</div></div></section>`; });

/* --- Devis : lien avec le devis Tiime, statistiques historiques --- */
const _pdevis = PTAB_FN.devis;
PTAB_FN.devis = (p, f) => { const t = T(), html = _pdevis(p, f); if (!t) return html;
  const td = p.quote.tiimeNo && t.devis.find(d => d.no === +p.quote.tiimeNo), fs = td ? t.factures.filter(x => x.devisNo === td.no || td.factures.includes(x.no)) : [];
  const box = `<section class="panel"><div class="panel-h"><h2>Devis Tiime</h2>${td ? `<span class="pill ${td.st === 'accepté' ? 'good' : td.st === 'refusé' ? 'bad' : 'acc'}">${esc(td.st)}</span>` : ''}</div><div class="panel-b qform">
    <div class="field"><label for="q-tiime">Numéro du devis dans Tiime</label><input id="q-tiime" inputmode="numeric" placeholder="Ex. 1182" value="${esc(p.quote.tiimeNo || '')}" data-bind="q-tiime" data-p="${p.id}"></div>
    ${td ? `<p style="margin:0">${esc(td.label)} · ${eur(td.ht)} HT · du ${dshort(td.d)}${Math.abs(td.ht - f.sold) > 1 ? ` <span class="tag sumbad">écart de ${eur(td.ht - f.sold)} avec le budget RondPoint</span>` : ''}</p>
      ${fs.length ? `<ul class="list">${fs.map(x => `<li><div class="grow">Facture ${x.no ?? 'brouillon'}<span class="tag">${dshort(x.d)}</span></div><span class="num">${eur(x.ht)}</span><span class="pill ${x.st === 'Payée' ? 'good' : tInvLate(x) ? 'bad' : 'acc'}">${x.st === 'Payée' ? 'payée' : x.st === 'Brouillon' ? 'brouillon' : tInvLate(x) ? 'en retard' : 'émise'}</span></li>`).join('')}</ul>` : '<p class="note" style="margin:0">Aucune facture liée dans Tiime pour l’instant.</p>'}`
      : p.quote.tiimeNo ? '<p class="note sumbad" style="margin:0">Ce numéro n’est pas dans le dernier import Tiime.</p>' : '<p class="note" style="margin:0">Indiquez le numéro pour suivre ici le statut et les factures liées dans Tiime.</p>'}
  </div></section>`;
  return html.replace('<section class="panel"><div class="panel-b" style="padding-top:14px"><h3>Ce que voit le client</h3>', box + '<section class="panel"><div class="panel-b" style="padding-top:14px"><h3>Ce que voit le client</h3>'); };
BINDS['q-tiime'] = (el, d) => { const p = PR(d.p), no = parseInt(el.value, 10); p.quote.tiimeNo = isNaN(no) ? '' : no;
  const td = T() && T().devis.find(x => x.no === no); if (td && td.st === 'accepté' && p.quote.st !== 'accepté') return setQuote(p, 'st', 'accepté'); if (td && td.st === 'refusé') return setQuote(p, 'st', 'refusé'); persist('project', p); render(); };
const _devis = VIEWS.devis;
VIEWS.devis = r => { const t = T(), html = _devis(r); if (!t) return html;
  const yrs = [...new Set(t.devis.map(d => d.d.slice(0,4)))].sort().reverse().slice(0, 4);
  const rows = yrs.map(y => { const ds = t.devis.filter(d => d.d.startsWith(y)), a = ds.filter(d => d.st === 'accepté'), rf = ds.filter(d => d.st === 'refusé'); return {y, n: ds.length, a: a.length, r: rf.length, rate: a.length + rf.length ? a.length / (a.length + rf.length) : NaN, ht: a.reduce((s,d) => s + d.ht, 0)}; });
  const pend = t.devis.filter(d => d.st === 'en attente').sort((a,b) => b.d.localeCompare(a.d));
  const panel = `<section class="panel" style="margin-top:16px"><div class="panel-h"><h2>Historique des devis Tiime</h2><span class="mut">import du ${dshort(t.at)}</span></div>
    <div class="tw"><table><thead><tr><th>Année</th><th class="num">Devis</th><th class="num">Acceptés</th><th class="num">Refusés</th><th class="num">Taux de transformation</th><th class="num">Montant accepté HT</th></tr></thead><tbody>
    ${rows.map(x => `<tr><td class="mono">${x.y}</td><td class="num">${x.n}</td><td class="num">${x.a}</td><td class="num">${x.r}</td><td class="num">${isNaN(x.rate) ? '—' : pct(x.rate)}</td><td class="num">${eur(x.ht)}</td></tr>`).join('')}</tbody></table></div>
    ${pend.length ? `<div class="panel-b"><h3 class="h3s" style="margin-top:8px">Encore « sauvegardés » dans Tiime (${pend.length})</h3><p class="note" style="margin:0 0 6px">Ni acceptés ni refusés : à relancer ou à classer dans Tiime.</p><div class="tw"><table><tbody>${pend.map(d => `<tr><td class="mono">${d.no}</td><td class="mono ${diffDays(d.d) < -60 ? 'sumbad' : ''}">${dshort(d.d)} ${d.d.slice(0,4) !== TODAY.slice(0,4) ? d.d.slice(0,4) : ''}</td><td>${esc(d.client)}</td><td class="mut">${esc(d.label)}</td><td class="num">${eur(d.ht)}</td></tr>`).join('')}</tbody></table></div></div>` : ''}</section>`;
  return html.replace('<p class="note">Un devis = un projet', panel + '<p class="note">Un devis = un projet'); };

/* --- Accueil : une ligne de contexte --- */
const _accueil = VIEWS.accueil;
VIEWS.accueil = r => { const html = _accueil(r), ca = tiimeCA(); if (!ca) return html;
  return html.replace('<p class="home-foot">', `<p class="home-foot">${eur(ca.ytd)} HT facturés depuis janvier${ca.open.length ? `, ${eur(ca.open.reduce((a,f) => a + f.ttc, 0))} TTC en attente de paiement` : ''}. `); };
