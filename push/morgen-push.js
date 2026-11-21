// Morgen-Nachricht um 8 Uhr: „Guten Morgen, … – du hast heute X Termine und Y To-dos“
// Läuft per GitHub Actions (.github/workflows/morgen.yml). Geheimnisse nur aus Umgebungsvariablen:
//   STORE_KEY      Speicher-Schlüssel (wie im Einladungslink)
//   VAPID_PUBLIC / VAPID_PRIVATE   Push-Schlüsselpaar
// Optional: ONLY=Ramon (nur an eine Person), FORCE=1 (Uhrzeit-Check überspringen), DRY=1 (nur anzeigen)
const webpush = require('web-push');

const PEOPLE = ['Julia', 'Joris', 'Ramon'];
const GREET = { Julia: 'Guten Morgen, Chefin', Joris: 'Guten Morgen, mein Sonnenschein', Ramon: 'Guten Morgen, Ramon' };
const TZ = 'Europe/Berlin';
const { STORE_KEY, VAPID_PUBLIC, VAPID_PRIVATE, ONLY, FORCE, DRY } = process.env;
const URL_ = 'https://textdb.dev/api/data/' + STORE_KEY;

// Datum/Uhrzeit in deutscher Zeit (GitHub läuft in UTC)
const parts = d => Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hour12: false })
  .formatToParts(d).map(p => [p.type, p.value]));
const ymd = d => { const p = parts(d); return `${p.year}-${p.month}-${p.day}`; };

const answer = (e, p) => p === e.createdBy ? 'yes' : e.rsvp?.[p]?.s || null;
const isMine = (t, p) => t.assignees.includes(p) || (t.workers || []).includes(p);
const doneFor = (t, p) => t.status === 'done' || (t.assignees.includes(p) && (t.dones || []).includes(p));

function message(data, me, now) {
  const t = ymd(now), tmw = ymd(new Date(now.getTime() + 864e5));
  const evs = (data.events || []).filter(e => e.date <= t && t <= e.endDate && e.people.includes(me) && answer(e, me) !== 'no');
  const due = (data.tasks || []).filter(x => isMine(x, me) && !doneFor(x, me) && x.due).map(x => ymd(new Date(x.due)));
  const heute = due.filter(d => d === t).length, morgen = due.filter(d => d === tmw).length;
  const n = (k, one, many) => `${k} ${k === 1 ? one : many}`;
  let body = !evs.length && !heute ? 'Heute steht nichts an – genieß den Tag ✨'
    : `Du hast heute ${evs.length ? n(evs.length, 'Termin', 'Termine') : 'keine Termine'} und ${heute ? n(heute, 'To-do', 'To-dos') : 'keine To-dos'} zu erledigen.`;
  if (morgen) body += ` (+${morgen} bis morgen)`;
  return { title: GREET[me] || 'Guten Morgen, ' + me, body, tag: 'morgen-' + t };
}

async function get(url) { const r = await fetch(url + '?t=' + Date.now()); const s = await r.text(); return s.trim() ? JSON.parse(s) : {}; }

const post = (url, d) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify(d) });

(async () => {
  if (!STORE_KEY || !VAPID_PUBLIC || !VAPID_PRIVATE) throw new Error('Geheimnisse fehlen (STORE_KEY / VAPID_*)');
  const now = new Date(), today = ymd(now);
  if (!FORCE && parts(now).hour !== '08') { console.log('nicht 8 Uhr in Berlin – nichts zu tun'); return; }
  // GitHub startet zwei Zeitpläne (Sommer/Winter) und manchmal verspätet → pro Tag nur einmal senden
  const log = await get(URL_ + '-push-log');
  if (!FORCE && log.last === today) { console.log('heute schon verschickt'); return; }
  webpush.setVapidDetails('https://ramon1301.github.io/julias-mitarbeiter-express/', VAPID_PUBLIC, VAPID_PRIVATE);
  const [data, subs] = await Promise.all([get(URL_), get(URL_ + '-push')]);
  const dead = new Set();
  for (const p of PEOPLE) {
    if (ONLY && p !== ONLY) continue;
    const msg = message(data, p, now);
    const list = Array.isArray(subs[p]) ? subs[p] : [];
    if (DRY) { console.log(`${p}: ${list.length} Gerät(e) – ${msg.title} | ${msg.body}`); continue; }
    for (const s of list) {
      // bei Netzwerk-Aussetzern (z. B. „socket hang up“) bis zu 3 Versuche
      const send = async (n = 0) => { try { return await webpush.sendNotification(s, JSON.stringify(msg), { TTL: 4 * 3600, urgency: 'high' }); }
        catch (e) { if (!e.statusCode && n < 2) { await new Promise(r => setTimeout(r, 2000)); return send(n + 1); } throw e; } };
      try { const r = await send(); console.log(`${p}: ok ${r.statusCode}`); }
      catch (e) {
        console.log(`${p}: Fehler ${e.statusCode || e.message}`);   // Inhalte nie ins (öffentliche) Log schreiben
        if (e.statusCode === 404 || e.statusCode === 410) dead.add(s.endpoint);   // Gerät hat sich abgemeldet
      }
    }
  }
  if (DRY) return;
  if (!FORCE) await post(URL_ + '-push-log', { last: today, at: Date.now() });
  if (dead.size) {   // frisch laden, damit gerade neu angemeldete Geräte nicht verloren gehen
    const cur = await get(URL_ + '-push');
    for (const p of Object.keys(cur)) if (Array.isArray(cur[p])) cur[p] = cur[p].filter(x => !dead.has(x.endpoint));
    await post(URL_ + '-push', cur);
  }
})().catch(e => { console.error(e.message || e); process.exit(1); });
