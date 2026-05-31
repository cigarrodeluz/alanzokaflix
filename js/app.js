'use strict';
const $ = s => document.querySelector(s);
const grid = $('#grid'), info = $('#result-info'), sentinel = $('#sentinel'), endNote = $('#end-note');
const MAXTRACK = 80, ROWBATCH = 6;
let ALL = [], idMap = new Map(), SECTIONS = [], exVisible = [], exRendered = 0;
let GROUPS = {}, VID2G = {}, META = {};
let state = { q: '', qraw: '', ch: 'all', sort: 'size' };

/* ---------- helpers ---------- */
const fmtViews = n => !n ? '' :
  n >= 1e6 ? (n / 1e6).toFixed(n >= 1e7 ? 0 : 1).replace('.0', '') + ' mi views'
  : n >= 1e3 ? Math.round(n / 1e3) + ' mil views' : n + ' views';
const fmtDur = s => {
  if (!s) return '';
  const h = s / 3600 | 0, m = (s % 3600) / 60 | 0, x = s % 60 | 0, p = v => String(v).padStart(2, '0');
  return h ? `${h}:${p(m)}:${p(x)}` : `${m}:${p(x)}`;
};
const fmtDate = s => /^\d{8}$/.test(s || '') ? `${s.slice(6, 8)}/${s.slice(4, 6)}/${s.slice(0, 4)}` : '';
const metaDate = id => fmtDate(META[id] && META[id][0]);
const chName = c => c === 'lives' ? 'Lives do alanzoka' : 'alanzoka';
const norm = s => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const esc = s => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const linkify = s => esc(s).replace(/(https?:\/\/[^\s]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');
const thumb = (id, hq) => `https://i.ytimg.com/vi/${id}/${hq ? 'maxresdefault' : 'mqdefault'}.jpg`;
const onload = "this.classList.add('loaded');this.parentNode.classList.add('done')";
const metaHtml = v => [chName(v.c), fmtViews(v.v), metaDate(v.id)].filter(Boolean)
  .map(x => `<span>${x}</span>`).join('<span class="dot"></span>');

/* ---------- data ---------- */
Promise.all([
  fetch('data/videos.json').then(r => r.json()),
  fetch('data/groups.json').then(r => r.json()).catch(() => ({ groups: {}, vid2g: {} })),
  fetch('data/meta.json').then(r => r.json()).catch(() => ({})),
]).then(([data, g, m]) => {
  ALL = data.videos; GROUPS = g.groups || {}; VID2G = g.vid2g || {}; META = m || {};
  ALL.forEach(v => { v._n = norm(v.t); idMap.set(v.id, v); });
  $('#search').placeholder = `Buscar entre ${ALL.length.toLocaleString('pt-BR')} vídeos…`;
  if (data.generatedAt) $('#foot-gen').textContent =
    'Acervo atualizado em ' + new Date(data.generatedAt).toLocaleDateString('pt-BR');
  buildBillboard(); buildRows(); buildSections(); apply();
  if (!auth.hidden) buildMosaic();
}).catch(() => { info.textContent = 'Não foi possível carregar o acervo (data/videos.json).'; });

/* ---------- billboard ---------- */
function buildBillboard() {
  const top = [...ALL].sort((a, b) => b.v - a.v).slice(0, 12);
  const v = top[Math.random() * top.length | 0];
  const bb = $('#billboard');
  bb.style.backgroundImage = `url(${thumb(v.id, true)})`;
  bb.innerHTML = `<div class="bb-content">
    <div class="bb-kicker"><b>alan</b>zoka • em destaque</div>
    <h1 class="bb-title">${esc(v.t)}</h1>
    <div class="bb-meta"><span class="green" style="color:#46d369;font-weight:700">${fmtViews(v.v)}</span>
      ${metaDate(v.id) ? `<span>${metaDate(v.id)}</span>` : ''}<span class="pill">${chName(v.c)}</span>${v.d ? `<span>${fmtDur(v.d)}</span>` : ''}</div>
    <div class="bb-actions">
      <button class="bb-play" data-id="${v.id}">▶ Assistir</button>
      <button class="bb-info-btn" data-id="${v.id}">ⓘ Mais informações</button>
    </div></div>`;
  bb.querySelectorAll('[data-id]').forEach(b => b.onclick = () => open(idMap.get(v.id)));
}

/* ---------- carousels (shared row builder) ---------- */
function rowEl(titleHtml, videos) {
  const row = document.createElement('section');
  row.className = 'row';
  row.innerHTML = `<h2 class="row-title">${titleHtml}</h2>
    <div class="row-wrap">
      <button class="arrow l" aria-label="Anterior">‹</button>
      <div class="track">${videos.map(rcard).join('')}</div>
      <button class="arrow r" aria-label="Próximo">›</button>
    </div>`;
  const tr = row.querySelector('.track');
  row.querySelector('.arrow.l').onclick = () => tr.scrollBy({ left: -tr.clientWidth * .85 });
  row.querySelector('.arrow.r').onclick = () => tr.scrollBy({ left: tr.clientWidth * .85 });
  return row;
}
function buildRows() {
  const main = ALL.filter(v => v.c === 'main'), lives = ALL.filter(v => v.c === 'lives');
  const byViews = a => [...a].sort((x, y) => y.v - x.v);
  const byRecent = a => [...a].sort((x, y) => x.o - y.o);
  const defs = [
    ['🔥 Em alta no acervo', byViews(ALL).slice(0, 24)],
    ['Novidades do alanzoka', byRecent(main).slice(0, 24)],
    ['Lives recentes', byRecent(lives).slice(0, 24)],
    ['Bombando nas lives', byViews(lives).slice(0, 24)],
    ['Maratona: os mais longos', [...ALL].sort((a, b) => b.d - a.d).slice(0, 24)],
  ];
  const frag = document.createDocumentFragment();
  defs.forEach(([title, items]) => frag.appendChild(rowEl(title, items)));
  $('#rows').appendChild(frag);
}
// séries/temas + avulsos, ordenados por tamanho (maiores primeiro)
function buildSections() {
  SECTIONS = Object.values(GROUPS).map(g => ({ title: g.title, type: g.type, ids: g.ids }))
    .sort((a, b) => b.ids.length - a.ids.length);
  const av = ALL.filter(v => !VID2G[v.id]).map(v => v.id);
  if (av.length) SECTIONS.push({ title: 'Vídeos avulsos', type: 'avulso', ids: av });
}
const rcard = v => `<article class="rcard" data-id="${v.id}">
  <img loading="lazy" decoding="async" src="${thumb(v.id)}" alt="" onload="${onload}" onerror="this.style.opacity=1">
  ${v.d ? `<span class="r-badge">${fmtDur(v.d)}</span>` : ''}
  <span class="r-play"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="12" fill="rgba(229,9,20,.95)"/><path d="M10 8l6 4-6 4z" fill="#fff"/></svg></span>
  <div class="rcard-grad"><span class="t">${esc(v.t)}</span><span class="m">${metaHtml(v)}</span></div>
</article>`;

/* ---------- explorar: navegação em rows (séries, temas e avulsos) ---------- */
function apply() {
  const q = state.q, ch = state.ch, inCh = id => ch === 'all' || (idMap.get(id) || {}).c === ch;
  let secs = [];
  if (q) {
    const vids = ALL.filter(v => inCh(v.id) && v._n.includes(q)).sort((a, b) => b.v - a.v).map(v => v.id);
    if (vids.length) secs.push({ title: `Vídeos: “${state.qraw}”`, type: 'busca', ids: vids });
    SECTIONS.forEach(s => {
      if (norm(s.title).includes(q)) { const ids = s.ids.filter(inCh); if (ids.length) secs.push({ ...s, ids }); }
    });
  } else {
    secs = ch === 'all' ? SECTIONS
      : SECTIONS.map(s => ({ ...s, ids: s.ids.filter(inCh) })).filter(s => s.ids.length);
  }
  if (state.sort === 'az') secs = [...secs].sort((a, b) => a.title.localeCompare(b.title, 'pt'));
  exVisible = secs; exRendered = 0; grid.innerHTML = ''; endNote.hidden = true;
  const ng = secs.filter(s => s.type !== 'busca').length;
  const nv = secs.reduce((n, s) => n + (s.type === 'busca' ? s.ids.length : 0), 0);
  info.innerHTML = q
    ? `<b>${nv.toLocaleString('pt-BR')}</b> vídeo(s) e <b>${ng}</b> série(s)/tema(s) para “${esc(state.qraw)}”`
    : `<b>${ng.toLocaleString('pt-BR')}</b> séries e temas`;
  if (!secs.length) { grid.innerHTML = '<div class="empty"><span>🔍</span>Nada encontrado.</div>'; sentinel.style.display = 'none'; return; }
  sentinel.style.display = ''; renderNext();
}
function renderNext() {
  const frag = document.createDocumentFragment();
  exVisible.slice(exRendered, exRendered + ROWBATCH).forEach(s => {
    const vids = s.ids.slice(0, MAXTRACK).map(id => idMap.get(id)).filter(Boolean);
    const chip = s.type === 'busca' ? '' : `<span class="rt-chip ${s.type}">${s.type === 'jogo' ? 'série' : s.type}</span>`;
    frag.appendChild(rowEl(`${esc(s.title)} <span class="rt-count">${s.ids.length}</span>${chip}`, vids));
  });
  exRendered += Math.min(ROWBATCH, exVisible.length - exRendered);
  grid.appendChild(frag);
  if (exRendered >= exVisible.length) { sentinel.style.display = 'none'; endNote.hidden = false; }
}
const card = v => `<div class="thumb">
    <span class="chip ${v.c}">${v.c === 'lives' ? 'live' : 'alanzoka'}</span>
    <img loading="lazy" decoding="async" src="${thumb(v.id)}" alt="" onload="${onload}" onerror="this.style.opacity=1">
    ${v.d ? `<span class="badge">${fmtDur(v.d)}</span>` : ''}
    <span class="play"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="12" fill="rgba(229,9,20,.95)"/><path d="M10 8l6 4-6 4z" fill="#fff"/></svg></span>
  </div>
  <div class="card-body"><div class="card-title">${esc(v.t)}</div>
    <div class="card-meta">${metaHtml(v)}</div>
  </div>`;

// descrição breve: ignora linhas de patrocínio/redes; senão vazio
const SPONSOR = /kabum|cupom|twitch\.tv|instagram|twitter|tiktok|youtube\.com|discord|^https?:|^\W*$|alanzoka/i;
function descBrief(id) {
  const d = META[id] && META[id][1];
  if (!d) return '';
  const line = d.split('\n').map(s => s.trim()).find(s => s.length > 20 && !SPONSOR.test(s));
  return line ? (line.length > 160 ? line.slice(0, 160) + '…' : line) : '';
}
// item de episódio (lista vertical estilo Netflix)
function ep(v, sel) {
  if (!v) return '';
  const meta = [metaDate(v.id), fmtDur(v.d), fmtViews(v.v)].filter(Boolean).join(' · ');
  const d = descBrief(v.id);
  return `<button class="ep${sel ? ' ep-sel' : ''}" data-id="${v.id}">
    <div class="ep-thumb"><img loading="lazy" decoding="async" src="${thumb(v.id)}" alt="" onload="${onload}" onerror="this.style.opacity=1">
      ${v.d ? `<span class="badge">${fmtDur(v.d)}</span>` : ''}${sel ? '<span class="ep-now">▶ assistindo</span>' : ''}</div>
    <div class="ep-info"><div class="ep-title">${esc(v.t)}</div><div class="ep-meta">${meta}</div>
      ${d ? `<p class="ep-desc">${esc(d)}</p>` : ''}</div>
  </button>`;
}

new IntersectionObserver(e => { if (e[0].isIntersecting && exRendered) renderNext(); }, { rootMargin: '700px' }).observe(sentinel);
$('#rows').addEventListener('click', e => { const r = e.target.closest('.rcard'); if (r) open(idMap.get(r.dataset.id)); });

/* ---------- controls ---------- */
let t; $('#search').addEventListener('input', e => {
  clearTimeout(t); const raw = e.target.value.trim();
  t = setTimeout(() => { state.q = norm(raw); state.qraw = raw; apply(); }, 220);
});
$('#channel-filter').addEventListener('click', e => {
  const b = e.target.closest('.seg-btn'); if (!b) return;
  $('#channel-filter .active').classList.remove('active'); b.classList.add('active'); state.ch = b.dataset.ch; apply();
});
$('#sort').addEventListener('change', e => { state.sort = e.target.value; apply(); });

/* ---------- detail modal (player + meta + related) ---------- */
const modal = $('#modal'), player = $('#modal-player');
function open(v) {
  if (!v) return;
  player.innerHTML = `<iframe src="https://www.youtube.com/embed/${v.id}?autoplay=1&rel=0&modestbranding=1"
    allow="accelerometer;autoplay;clipboard-write;encrypted-media;gyroscope;picture-in-picture" allowfullscreen></iframe>`;
  $('#modal-title').textContent = v.t;
  const date = metaDate(v.id);
  $('#modal-meta').innerHTML = `<span class="green">${fmtViews(v.v) || 'Vídeo'}</span>` +
    (date ? `<span>${date}</span>` : '') + `<span class="pill">${chName(v.c)}</span>` +
    (v.d ? `<span>${fmtDur(v.d)}</span>` : '');
  $('#modal-yt').href = 'https://www.youtube.com/watch?v=' + v.id;
  const desc = META[v.id] && META[v.id][1], dt = $('#desc-toggle'), dd = $('#modal-desc');
  dd.hidden = true; dt.textContent = 'Mostrar descrição ▾';
  dt.hidden = !desc;
  dd.innerHTML = desc ? linkify(desc) : '';
  // relacionados: mesma série em lista vertical (mais antigo no topo); senão aleatório
  const g = GROUPS[VID2G[v.id]], rl = $('#related');
  if (g && g.ids.length > 1) {
    $('#related-h').textContent = (g.type === 'tema' ? 'Mais de: ' : 'Da mesma série: ') + g.title + ` · ${g.ids.length} vídeos`;
    rl.className = 'related ep-list';
    rl.innerHTML = g.ids.map(id => ep(idMap.get(id), id === v.id)).join('');
  } else {
    $('#related-h').textContent = 'Você também pode gostar';
    rl.className = 'related';
    rl.innerHTML = [...ALL].sort(() => Math.random() - .5).slice(0, 12)
      .map(x => `<article class="card" data-id="${x.id}">${card(x)}</article>`).join('');
  }
  modal.hidden = false; modal.scrollTop = 0; document.body.style.overflow = 'hidden';
  const sel = rl.querySelector('.ep-sel'); if (sel) rl.scrollTop = sel.offsetTop - rl.clientHeight / 2;
}
function close() { modal.hidden = true; player.innerHTML = ''; document.body.style.overflow = ''; }
$('#desc-toggle').addEventListener('click', () => {
  const dd = $('#modal-desc'), open = dd.hidden;
  dd.hidden = !open; $('#desc-toggle').textContent = open ? 'Ocultar descrição ▴' : 'Mostrar descrição ▾';
});
$('#related').addEventListener('click', e => { const c = e.target.closest('[data-id]'); if (c) open(idMap.get(c.dataset.id)); });
grid.addEventListener('click', e => { const c = e.target.closest('.rcard'); if (c) open(idMap.get(c.dataset.id)); });
$('#modal-close').addEventListener('click', close);
$('#modal-backdrop').addEventListener('click', close);
addEventListener('keydown', e => { if (e.key === 'Escape' && !modal.hidden) close(); });

/* ---------- random + view switching + nav ---------- */
$('#surprise-top').addEventListener('click', () => open(ALL[Math.random() * ALL.length | 0]));
const nav = $('#nav'), toTop = $('#to-top');
const billboard = $('#billboard'), rowsEl = $('#rows'), acervo = $('#acervo');
let view = 'home';
function showView(v) {
  view = v; const home = v === 'home';
  billboard.hidden = rowsEl.hidden = !home; acervo.hidden = home;
  nav.classList.toggle('scrolled', !home);
  scrollTo({ top: 0 });
}
document.querySelectorAll('.nav-links a[href="#acervo"]').forEach(a => a.onclick = e => { e.preventDefault(); showView('browse'); });
document.querySelectorAll('.nav-links a[href="#rows"]').forEach(a => a.onclick = e => { e.preventDefault(); showView('home'); });
$('.brand').onclick = e => { e.preventDefault(); showView('home'); };

addEventListener('scroll', () => {
  nav.classList.toggle('scrolled', view === 'browse' || scrollY > 60);
  toTop.hidden = scrollY < 700;
}, { passive: true });
toTop.addEventListener('click', () => scrollTo({ top: 0, behavior: 'smooth' }));

/* ---------- login/cadastro (Supabase Auth) ---------- */
const auth = $('#auth');
const sb = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
function buildMosaic() {
  if (!ALL.length || $('#mosaic').children.length) return;
  const pool = [...ALL].sort((a, b) => b.v - a.v).slice(0, 240);
  const rows = 9, per = 14;
  $('#mosaic').innerHTML = Array.from({ length: rows }, (_, r) => {
    const tiles = Array.from({ length: per }, (_, i) =>
      `<div class="tile"><img src="${thumb(pool[(r * per + i) % pool.length].id)}" alt=""></div>`).join('');
    return `<div class="m-row" style="animation-duration:${70 + r * 10}s;animation-direction:${r % 2 ? 'reverse' : 'normal'}">${tiles}${tiles}${tiles}${tiles}</div>`;
  }).join('');
}
function showAuth(b) { auth.hidden = !b; document.body.style.overflow = b ? 'hidden' : ''; if (b) buildMosaic(); }
function authMsg(t, err) { const m = $('#auth-msg'); m.textContent = t || ''; m.classList.toggle('err', !!err); }

sb.auth.getSession().then(({ data }) => showAuth(!data.session));
sb.auth.onAuthStateChange((_e, session) => { if (session) { authMsg(''); showAuth(false); } });

$('#auth-form').addEventListener('submit', async e => {
  e.preventDefault();
  const email = $('#auth-email').value.trim(), password = $('#auth-pass').value;
  const signup = $('#auth-submit').textContent === 'Cadastrar';
  authMsg(signup ? 'Criando conta…' : 'Entrando…');
  const { data, error } = signup
    ? await sb.auth.signUp({ email, password })
    : await sb.auth.signInWithPassword({ email, password });
  if (error) authMsg(error.message, true);
  else if (signup && !data.session) authMsg('Conta criada! Confirme pelo link enviado ao seu email.');
});
$('#auth-google').addEventListener('click', async () => {
  authMsg('Abrindo o Google…');
  const { error } = await sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: location.origin + location.pathname } });
  if (error) authMsg('Login com Google ainda não foi ativado no painel. Use email e senha por enquanto.', true);
});
$('#auth-toggle').addEventListener('click', e => {
  e.preventDefault();
  const login = $('#auth-submit').textContent === 'Cadastrar';
  $('#auth-title').textContent = login ? 'Entrar' : 'Criar conta';
  $('#auth-submit').textContent = login ? 'Entrar' : 'Cadastrar';
  $('#auth-lead').textContent = login ? 'Novo por aqui?' : 'Já tem conta?';
  $('#auth-toggle').textContent = login ? 'Cadastre-se agora' : 'Entre';
  authMsg('');
});
$('#logout').addEventListener('click', async () => { await sb.auth.signOut(); showAuth(true); });
