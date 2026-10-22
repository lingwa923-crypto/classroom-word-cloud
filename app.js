const config = window.WORDCLOUD_CONFIG || {};
const app = document.querySelector('#app');
const toastNode = document.querySelector('#toast');
const DEMO_KEY = 'classroom-wordcloud-demo-v1';
const CLIENT_KEY = 'classroom-wordcloud-client-v1';
const hasCloud = Boolean(config.supabaseUrl && (config.supabaseKey || config.supabaseAnonKey) && window.supabase?.createClient);
const publicSupabaseKey = config.supabaseKey || config.supabaseAnonKey;
const cloud = hasCloud ? window.supabase.createClient(config.supabaseUrl, publicSupabaseKey) : null;

const state = {
  user: null,
  session: null,
  mode: hasCloud ? 'cloud' : 'demo',
  activities: [],
  activityCounts: {},
  selected: null,
  responses: [],
  busy: false,
  realtimeChannel: null,
  authMessage: '',
  authError: '',
  authMode: 'login'
};

const icons = {
  sparkle: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 1.8 6.2L20 11l-6.2 1.8L12 19l-1.8-6.2L4 11l6.2-1.8L12 3Z"/><path d="m19 15 .8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15Z"/></svg>',
  plus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
  display: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8M12 17v4"/></svg>',
  archive: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16v13H4zM3 4h18v3H3zM10 11h4"/></svg>',
  trash: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 14h10l1-14M9 7V4h6v3"/></svg>',
  download: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12m0 0 4-4m-4 4-4-4M4 17v4h16v-4"/></svg>',
  copy: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/></svg>',
  arrow: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14m-6-6 6 6-6 6"/></svg>',
  check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4L19 6"/></svg>',
  close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>',
  logout: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 17l5-5-5-5m5 5H3m9-9h7a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-7"/></svg>',
  users: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2m6-10a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm7-3a4 4 0 0 1 0 8m5 5v-2a4 4 0 0 0-3-3.87"/></svg>'
};

function esc(value = '') {
  return String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}

function toast(message, kind = 'success') {
  toastNode.textContent = message;
  toastNode.className = `toast show ${kind}`;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => toastNode.classList.remove('show'), 2800);
}

function getDemoStore() {
  try {
    return JSON.parse(localStorage.getItem(DEMO_KEY) || '{"activities":[],"responses":[]}');
  } catch {
    return { activities: [], responses: [] };
  }
}

function setDemoStore(store) {
  localStorage.setItem(DEMO_KEY, JSON.stringify(store));
  window.dispatchEvent(new CustomEvent('demo-store-updated'));
}

function isDemo() {
  return state.mode === 'demo';
}

function getActivityIdFromRoute() {
  const params = new URLSearchParams(location.search);
  return params.get('join') || params.get('screen');
}

function routeType() {
  const params = new URLSearchParams(location.search);
  if (params.has('join')) return 'join';
  if (params.has('screen')) return 'screen';
  return 'admin';
}

function linkFor(mode, id) {
  const url = new URL(location.href);
  url.search = '';
  url.hash = '';
  url.searchParams.set(mode, id);
  return url.toString();
}

function getClientId(activityId) {
  const key = `${CLIENT_KEY}:${activityId}`;
  let id = localStorage.getItem(key);
  if (!id) {
    id = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    localStorage.setItem(key, id);
  }
  return id;
}

function activityLabel(activity) {
  return activity.prompt?.trim() || '尚未設定題目';
}

function renderBanner() {
  if (!isDemo()) return '';
  return `<div class="demo-banner"><span class="demo-dot"></span><span><strong>本機示範模式</strong> · 資料只保存在這台裝置，設定 Supabase 後即可雲端同步。</span><a href="README.md" target="_blank" rel="noreferrer">查看設定步驟 ${icons.arrow}</a></div>`;
}

function header({ presentation = false, student = false } = {}) {
  return `<header class="topbar ${presentation ? 'topbar-present' : ''}">
    <a class="brand" href="./" aria-label="回到管理首頁"><span class="brand-mark">字</span><span class="brand-name">課堂文字雲<span>CLASSROOM WORD CLOUD</span></span></a>
    ${presentation ? '<div class="live-indicator"><i></i>即時同步</div>' : student ? '<span class="safe-label">匿名參與・無須登入</span>' : `<div class="topbar-actions"><span class="storage-label ${isDemo() ? 'local-label' : ''}"><i></i>${isDemo() ? '本機預覽' : '雲端已連線'}</span>${state.user ? `<span class="user-email">${esc(state.user.email || '')}</span><button class="icon-button" id="signout-button" title="登出" aria-label="登出">${icons.logout}</button>` : ''}</div>`}
  </header>`;
}

function renderAuth() {
  const registering = state.authMode === 'signup';
  app.innerHTML = `${renderBanner()}${header()}<main class="auth-wrap"><section class="auth-card">
    <div class="auth-visual"><div class="visual-orbit orbit-a"></div><div class="visual-orbit orbit-b"></div><div class="visual-word word-one">想法</div><div class="visual-word word-two">參與</div><div class="visual-word word-three">共創</div><div class="visual-word word-four">提問</div><div class="visual-center">${icons.sparkle}</div><div class="visual-caption">每一個聲音<br><strong>都能成為課堂風景</strong></div></div>
    <div class="auth-content"><div class="eyebrow">讓互動，自然發生</div><h1>${registering ? '建立講師帳號' : '歡迎回到課堂'}</h1><p class="muted">${registering ? '建立帳號後，即可建立活動並保存歷史場次。' : '登入後建立活動、管理題目，讓學生的想法即時成為文字雲。'}</p>
    ${state.authError ? `<div class="form-alert error">${esc(state.authError)}</div>` : ''}${state.authMessage ? `<div class="form-alert success-alert">${esc(state.authMessage)}</div>` : ''}
    ${isDemo() ? `<div class="demo-card"><div class="demo-card-icon">${icons.sparkle}</div><div><strong>先試用示範版</strong><p>不需帳號，建立的示範資料只會留在本機。</p></div><button class="button button-primary" id="enter-demo">開始體驗 ${icons.arrow}</button></div>` : `<form id="auth-form" class="auth-form"><label>電子郵件<input required type="email" autocomplete="email" name="email" placeholder="teacher@example.com" /></label><label>密碼<input required type="password" minlength="8" autocomplete="${registering ? 'new-password' : 'current-password'}" name="password" placeholder="至少 8 個字元" /></label><button class="button button-primary button-wide" type="submit" ${state.busy ? 'disabled' : ''}>${state.busy ? '請稍候…' : registering ? '建立帳號' : '登入管理後台'} ${icons.arrow}</button></form><p class="auth-switch">${registering ? '已有帳號？' : '第一次使用？'} <button class="text-button" id="auth-switch">${registering ? '返回登入' : '建立講師帳號'}</button></p>`}
    <div class="auth-footnote"><span class="lock-mark">⌑</span> 管理資料只對登入的講師開放</div>
    </div></section><p class="page-foot">為每一堂課，留下一片能被看見的想法。</p></main>`;

  document.querySelector('#enter-demo')?.addEventListener('click', () => {
    state.mode = 'demo';
    state.user = { email: '本機示範' };
    renderAdmin();
  });
  document.querySelector('#auth-switch')?.addEventListener('click', () => {
    state.authMode = registering ? 'login' : 'signup';
    state.authError = '';
    state.authMessage = '';
    renderAuth();
  });
  document.querySelector('#auth-form')?.addEventListener('submit', onAuthSubmit);
}

async function onAuthSubmit(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const email = String(form.get('email') || '').trim();
  const password = String(form.get('password') || '');
  state.busy = true;
  state.authError = '';
  renderAuth();
  try {
    if (state.authMode === 'signup') {
      const { data, error } = await cloud.auth.signUp({ email, password });
      if (error) throw error;
      if (data.session) {
        state.session = data.session;
        state.user = data.user;
        await continueAfterAuth();
      } else {
        state.busy = false;
        state.authMessage = '帳號已建立。請先到信箱完成驗證，再回來登入。';
        renderAuth();
      }
    } else {
      const { data, error } = await cloud.auth.signInWithPassword({ email, password });
      if (error) throw error;
      state.session = data.session;
      state.user = data.user;
      await continueAfterAuth();
    }
  } catch (error) {
    state.busy = false;
    state.authError = error.message || '登入失敗，請稍後再試。';
    renderAuth();
  }
}

async function continueAfterAuth() {
  if (routeType() === 'screen') await renderScreen(getActivityIdFromRoute());
  else await loadAdmin();
}

async function signOut() {
  if (isDemo()) {
    state.user = null;
    state.activities = [];
    state.selected = null;
    renderAuth();
    return;
  }
  await cloud.auth.signOut();
  state.user = null;
  state.session = null;
  state.activities = [];
  state.selected = null;
  renderAuth();
}

async function loadAdmin() {
  if (isDemo()) {
    const store = getDemoStore();
    state.activities = store.activities.sort((a, b) => b.created_at.localeCompare(a.created_at));
    state.activityCounts = Object.fromEntries(state.activities.map(activity => {
      const responses = store.responses.filter(item => item.activity_id === activity.id);
      return [activity.id, { total: responses.length, approved: responses.filter(item => item.status === 'approved').length, held: responses.filter(item => item.status === 'held').length }];
    }));
    state.selected = state.activities.find(item => item.id === state.selected?.id) || state.activities.find(item => item.status === 'active') || state.activities[0] || null;
    await loadResponses(state.selected?.id);
    renderAdmin();
    return;
  }
  const { data, error } = await cloud.from('activities').select('id,owner_id,prompt,status,blocked_words,created_at,updated_at').order('created_at', { ascending: false });
  if (error) {
    state.authError = error.message;
    renderAuth();
    return;
  }
  state.activities = data || [];
  state.activityCounts = {};
  if (state.activities.length) {
    const { data: responseCounts } = await cloud.from('responses').select('activity_id,status').in('activity_id', state.activities.map(item => item.id)).limit(10000);
    for (const response of responseCounts || []) {
      const count = state.activityCounts[response.activity_id] ||= { total: 0, approved: 0, held: 0 };
      count.total += 1;
      count[response.status] = (count[response.status] || 0) + 1;
    }
  }
  state.selected = state.activities.find(item => item.id === state.selected?.id) || state.activities.find(item => item.status === 'active') || state.activities[0] || null;
  await loadResponses(state.selected?.id);
  renderAdmin();
}

async function loadResponses(id) {
  if (!id) {
    state.responses = [];
    return;
  }
  if (isDemo()) {
    state.responses = getDemoStore().responses.filter(item => item.activity_id === id).sort((a, b) => b.created_at.localeCompare(a.created_at));
    return;
  }
  const { data, error } = await cloud.from('responses').select('id,activity_id,content,status,moderation_reason,created_at').eq('activity_id', id).order('created_at', { ascending: false }).limit(2000);
  if (error) {
    toast(`無法載入回答：${error.message}`, 'error');
    state.responses = [];
    return;
  }
  state.responses = data || [];
}

function selectedSummary(activity) {
  if (!activity) return { approved: 0, held: 0, total: 0 };
  if (activity.id !== state.selected?.id) return state.activityCounts[activity.id] || { approved: 0, held: 0, total: 0 };
  const responses = getResponseView(activity.id);
  const approved = responses.filter(item => item.status === 'approved').length;
  const held = responses.filter(item => item.status === 'held').length;
  const counts = { approved, held, total: approved + held };
  state.activityCounts[activity.id] = counts;
  return counts;
}

function getResponseView(id) {
  return id === state.selected?.id ? state.responses : isDemo() ? getDemoStore().responses.filter(item => item.activity_id === id) : [];
}

function renderAdmin() {
  state.realtimeChannel?.unsubscribe?.();
  state.realtimeChannel = null;
  const items = state.activities.map(activity => {
    const counts = selectedSummary(activity);
    return `<button class="activity-row ${state.selected?.id === activity.id ? 'active' : ''}" data-activity="${esc(activity.id)}"><span class="activity-row-icon ${activity.status === 'archived' ? 'archived' : ''}">${activity.status === 'archived' ? icons.archive : icons.sparkle}</span><span class="activity-row-copy"><strong>${esc(activityLabel(activity))}</strong><small>${new Date(activity.created_at).toLocaleDateString('zh-TW')} · ${counts.total} 則回答</small></span><span class="activity-status-dot ${activity.status === 'archived' ? 'off' : ''}"></span></button>`;
  }).join('');
  const activity = state.selected;
  const counts = activity ? selectedSummary(activity) : { approved: 0, held: 0, total: 0 };
  app.innerHTML = `${renderBanner()}${header()}<main class="dashboard">
    <div class="dashboard-intro"><div><div class="eyebrow">講師工作室</div><h1>讓想法，聚在一起。</h1><p>建立一個問題，邀請每位學生把答案放進文字雲。</p></div><button class="button button-primary" id="new-activity">${icons.plus} 建立新活動</button></div>
    <div class="workspace-grid"><aside class="activity-sidebar"><div class="sidebar-heading"><div><span class="section-kicker">你的活動</span><strong>活動場次 <span>${state.activities.length}</span></strong></div><button class="round-plus" id="new-activity-side" title="建立新活動">${icons.plus}</button></div>
      <div class="activity-list">${items || `<div class="empty-list"><span class="empty-orb">${icons.sparkle}</span><strong>還沒有活動</strong><p>建立第一個課堂問題，讓學生開始參與。</p><button class="text-button" id="create-first">建立第一場 ${icons.arrow}</button></div>`}</div>
      <div class="sidebar-note"><div class="note-icon">✦</div><div><strong>每一場都是新的開始</strong><p>封存的活動仍可隨時查看和重新開啟。</p></div></div>
    </aside>
    <section class="activity-detail">${activity ? renderActivityDetail(activity, counts) : renderEmptyDetail()}</section></div>
    <footer class="dashboard-foot"><span>課堂文字雲</span><span>為每一個想法，留下一點空間。</span></footer>
    </main>`;
  bindAdminEvents();
  if (activity && !isDemo()) subscribeToResponses(activity.id);
}

function renderEmptyDetail() {
  return `<div class="empty-detail"><div class="empty-illustration"><div class="float-word f-one">發想</div><div class="float-word f-two">提問</div><div class="float-word f-three">共鳴</div><div class="illustration-core">${icons.sparkle}</div></div><span class="section-kicker">準備好了嗎？</span><h2>建立你的第一場活動</h2><p>給學生一道問題，讓每個想法都成為文字雲的一部分。</p><button class="button button-primary" id="create-first-detail">${icons.plus} 建立新活動</button></div>`;
}

function renderActivityDetail(activity, counts) {
  const studentUrl = linkFor('join', activity.id);
  const screenUrl = linkFor('screen', activity.id);
  const held = state.responses.filter(item => item.status === 'held');
  const approved = state.responses.filter(item => item.status === 'approved');
  return `<div class="detail-heading"><div><div class="eyebrow">${activity.status === 'archived' ? '已封存的活動' : '進行中的活動'}</div><h2>${esc(activityLabel(activity))}</h2></div><span class="status-pill ${activity.status === 'archived' ? 'pill-archived' : ''}"><i></i>${activity.status === 'archived' ? '已封存' : '收集中'}</span></div>
  <div class="metric-strip"><div class="metric-card"><span class="metric-icon blue">${icons.users}</span><div><small>收到回答</small><strong>${counts.total}</strong></div></div><div class="metric-card"><span class="metric-icon green">${icons.check}</span><div><small>顯示中</small><strong>${counts.approved}</strong></div></div><div class="metric-card"><span class="metric-icon amber">⌕</span><div><small>待確認</small><strong>${counts.held}</strong></div></div><div class="metric-state"><i></i>${isDemo() ? '本機資料' : '雲端即時同步'}</div></div>
  <div class="detail-grid"><section class="panel question-panel"><div class="panel-heading"><div><span class="section-kicker">01 · 活動問題</span><h3>想問學生什麼？</h3></div><span class="panel-step">可隨時修改</span></div><form id="activity-form"><label class="field-label" for="prompt-input">投影與作答頁都會顯示這個問題</label><textarea id="prompt-input" name="prompt" maxlength="140" rows="3" placeholder="例如：今天這堂課，哪個概念最讓你有感？" ${activity.status === 'archived' ? 'disabled' : ''}>${esc(activity.prompt || '')}</textarea><div class="field-bottom"><span>建議用一句簡短、開放式的問題</span><span id="prompt-count">${(activity.prompt || '').length}/140</span></div><label class="field-label filter-label" for="blocked-input">封鎖字詞 <span>選填，用逗號分隔；包含這些字詞的回答會被拒絕。</span></label><input id="blocked-input" name="blocked" value="${esc((activity.blocked_words || []).join(', '))}" placeholder="例如：測試詞、垃圾字" ${activity.status === 'archived' ? 'disabled' : ''} /><div class="form-actions"><span class="save-note" id="save-note">${activity.status === 'archived' ? '封存活動需先重新開啟才能編輯' : '修改只會影響接下來的作答'}</span><button class="button button-primary" type="submit" ${activity.status === 'archived' ? 'disabled' : ''}>儲存修改 ${icons.check}</button></div></form></section>
  <section class="panel invite-panel"><div class="panel-heading"><div><span class="section-kicker">02 · 邀請參與</span><h3>掃描 QR Code</h3></div><span class="invite-lock">學生無須登入</span></div><div class="invite-content"><div class="qr-frame"><canvas id="admin-qr" width="184" height="184" aria-label="學生作答 QR Code"></canvas><div class="qr-fallback" id="admin-qr-fallback">QR Code 載入中…</div></div><div class="invite-copy"><strong>把問題交給全班</strong><p>學生掃描後，在手機上輸入一個想法即可。</p><div class="short-link" title="${esc(studentUrl)}"><span>${esc(studentUrl.replace(/^https?:\/\//, ''))}</span></div><button class="button button-light button-small" id="copy-link">${icons.copy} 複製作答網址</button></div></div><div class="invite-actions"><a class="button button-dark" href="${esc(screenUrl)}" target="_blank" rel="noreferrer">${icons.display} 開啟投影畫面</a><span>大螢幕顯示回答時，QR Code 也會留在畫面上</span></div></section></div>
  <section class="panel responses-panel"><div class="panel-heading response-heading"><div><span class="section-kicker">03 · 回答管理</span><h3>學生的想法 <span class="response-total">${counts.total}</span></h3></div><div class="response-actions"><div class="tab-pills"><button class="response-tab active" data-tab="approved">顯示中 <span>${approved.length}</span></button><button class="response-tab" data-tab="held">待確認 <span>${held.length}</span></button></div><button class="button button-light button-small" id="export-csv" ${counts.total ? '' : 'disabled'}>${icons.download} 匯出 CSV</button></div></div>
  <div class="response-list">${renderResponseRows(state.responses, 'approved')}</div><div class="response-empty-note ${counts.total ? 'hidden' : ''}"><span>✧</span> 第一個回答進來時，會即時出現在這裡。</div></section>
  <div class="danger-zone"><div><span class="section-kicker">結束這場活動</span><strong>${activity.status === 'archived' ? '已封存的活動' : '活動整理'}</strong><p>${activity.status === 'archived' ? '可重新開啟這場活動，繼續接收新回答。' : '封存後學生將無法再提交，歷史回答仍會保留。'}</p></div><div class="danger-actions"><button class="button button-light button-small" id="clear-responses" ${counts.total ? '' : 'disabled'}>${icons.trash} 清空回答</button><button class="button ${activity.status === 'archived' ? 'button-primary' : 'button-outline'} button-small" id="toggle-archive">${icons.archive} ${activity.status === 'archived' ? '重新開啟' : '封存活動'}</button></div></div>`;
}

function renderResponseRows(responses, tab) {
  const visible = responses.filter(item => item.status === tab);
  if (!visible.length) return `<div class="response-empty-inline">${tab === 'held' ? '目前沒有待確認的回答。' : '目前還沒有回答，邀請學生掃描 QR Code 開始吧。'}</div>`;
  return visible.map(item => `<article class="response-row"><span class="response-avatar">${esc(Array.from(item.content || '想')[0] || '想')}</span><div class="response-text"><strong>${esc(item.content)}</strong><small>${new Date(item.created_at).toLocaleString('zh-TW', { hour: '2-digit', minute: '2-digit' })}${item.status === 'held' ? ` · ${esc(item.moderation_reason || '等待確認')}` : ''}</small></div><div class="response-row-actions">${item.status === 'held' ? `<button class="approve-button" data-approve="${esc(item.id)}">${icons.check} 顯示</button>` : ''}<button class="delete-response" data-delete-response="${esc(item.id)}" title="刪除此回答">${icons.trash}</button></div></article>`).join('');
}

function bindAdminEvents() {
  document.querySelector('#signout-button')?.addEventListener('click', signOut);
  document.querySelectorAll('[data-activity]').forEach(button => button.addEventListener('click', async () => {
    state.selected = state.activities.find(item => item.id === button.dataset.activity) || null;
    await loadResponses(state.selected?.id);
    renderAdmin();
  }));
  document.querySelector('#new-activity')?.addEventListener('click', createActivity);
  document.querySelector('#new-activity-side')?.addEventListener('click', createActivity);
  document.querySelector('#create-first')?.addEventListener('click', createActivity);
  document.querySelector('#create-first-detail')?.addEventListener('click', createActivity);
  const prompt = document.querySelector('#prompt-input');
  prompt?.addEventListener('input', () => { document.querySelector('#prompt-count').textContent = `${prompt.value.length}/140`; });
  document.querySelector('#activity-form')?.addEventListener('submit', saveActivity);
  document.querySelector('#copy-link')?.addEventListener('click', () => copyText(linkFor('join', state.selected.id), '作答網址已複製'));
  document.querySelector('#export-csv')?.addEventListener('click', exportCsv);
  document.querySelector('#clear-responses')?.addEventListener('click', clearResponses);
  document.querySelector('#toggle-archive')?.addEventListener('click', toggleArchive);
  document.querySelectorAll('.response-tab').forEach(button => button.addEventListener('click', () => {
    document.querySelectorAll('.response-tab').forEach(tab => tab.classList.toggle('active', tab === button));
    document.querySelector('.response-list').innerHTML = renderResponseRows(state.responses, button.dataset.tab);
    bindResponseButtons();
  }));
  bindResponseButtons();
  if (state.selected) drawQr('#admin-qr', linkFor('join', state.selected.id), '#admin-qr-fallback');
}

function bindResponseButtons() {
  document.querySelectorAll('[data-approve]').forEach(button => button.addEventListener('click', () => updateResponse(button.dataset.approve, 'approved')));
  document.querySelectorAll('[data-delete-response]').forEach(button => button.addEventListener('click', () => deleteResponse(button.dataset.deleteResponse)));
}

function subscribeToResponses(id) {
  if (!cloud || !state.session) return;
  state.realtimeChannel = cloud.channel(`responses-${id}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'responses', filter: `activity_id=eq.${id}` }, async () => {
      await loadResponses(id);
      const currentTab = document.querySelector('.response-tab.active')?.dataset.tab || 'approved';
      renderAdmin();
      const tab = document.querySelector(`[data-tab="${currentTab}"]`);
      if (tab) {
        tab.click();
      }
    })
    .subscribe();
}

function drawQr(canvasSelector, value, fallbackSelector) {
  const canvas = document.querySelector(canvasSelector);
  const fallback = document.querySelector(fallbackSelector);
  if (!canvas || !window.QRCode?.toCanvas) {
    if (fallback) fallback.textContent = 'QR Code 載入失敗，請複製網址';
    return;
  }
  window.QRCode.toCanvas(canvas, value, { width: canvas.width, margin: 1, color: { dark: '#17243a', light: '#ffffff' }, errorCorrectionLevel: 'M' }, error => {
    if (error && fallback) fallback.textContent = 'QR Code 載入失敗，請複製網址';
    else if (fallback) fallback.classList.add('hidden');
  });
}

function createActivity() {
  const id = isDemo() ? crypto.randomUUID() : crypto.randomUUID();
  const activity = { id, prompt: '今天這堂課，哪個想法讓你印象最深？', status: 'active', blocked_words: [], created_at: new Date().toISOString() };
  if (isDemo()) {
    const store = getDemoStore();
    store.activities.unshift(activity);
    setDemoStore(store);
    state.activities = store.activities;
    state.activityCounts[activity.id] = { approved: 0, held: 0, total: 0 };
    state.selected = activity;
    state.responses = [];
    renderAdmin();
    document.querySelector('#prompt-input')?.focus();
    return;
  }
  cloud.from('activities').insert({ owner_id: state.user.id, prompt: activity.prompt, status: 'active', blocked_words: [] }).select('id,owner_id,prompt,status,blocked_words,created_at,updated_at').single().then(async ({ data, error }) => {
    if (error) return toast(`無法建立活動：${error.message}`, 'error');
    state.activities.unshift(data);
    state.selected = data;
    state.activityCounts[data.id] = { approved: 0, held: 0, total: 0 };
    state.responses = [];
    renderAdmin();
    document.querySelector('#prompt-input')?.focus();
  });
}

async function saveActivity(event) {
  event.preventDefault();
  if (!state.selected || state.selected.status === 'archived') return;
  const prompt = document.querySelector('#prompt-input').value.trim();
  if (!prompt) return toast('請先輸入一個問題。', 'error');
  const blocked_words = document.querySelector('#blocked-input').value.split(/[,，\n]/).map(word => word.trim()).filter(Boolean).slice(0, 30);
  if (isDemo()) {
    const store = getDemoStore();
    const activity = store.activities.find(item => item.id === state.selected.id);
    Object.assign(activity, { prompt, blocked_words, updated_at: new Date().toISOString() });
    setDemoStore(store);
    state.activities = store.activities;
    state.selected = activity;
  } else {
    const { data, error } = await cloud.from('activities').update({ prompt, blocked_words }).eq('id', state.selected.id).select('id,owner_id,prompt,status,blocked_words,created_at,updated_at').single();
    if (error) return toast(`無法儲存：${error.message}`, 'error');
    state.selected = data;
    state.activities = state.activities.map(item => item.id === data.id ? data : item);
  }
  renderAdmin();
  toast('活動設定已儲存');
}

async function updateResponse(id, status) {
  if (isDemo()) {
    const store = getDemoStore();
    const response = store.responses.find(item => item.id === id);
    if (response) response.status = status;
    setDemoStore(store);
    state.responses = store.responses.filter(item => item.activity_id === state.selected.id).sort((a, b) => b.created_at.localeCompare(a.created_at));
  } else {
    const { error } = await cloud.from('responses').update({ status, moderation_reason: null }).eq('id', id);
    if (error) return toast(`無法審核：${error.message}`, 'error');
    await loadResponses(state.selected.id);
  }
  renderAdmin();
  document.querySelector('[data-tab="held"]')?.click();
  toast('已將回答加入文字雲');
}

async function deleteResponse(id) {
  if (isDemo()) {
    const store = getDemoStore();
    store.responses = store.responses.filter(item => item.id !== id);
    setDemoStore(store);
    state.responses = store.responses.filter(item => item.activity_id === state.selected.id).sort((a, b) => b.created_at.localeCompare(a.created_at));
  } else {
    const { error } = await cloud.from('responses').delete().eq('id', id);
    if (error) return toast(`無法刪除回答：${error.message}`, 'error');
    await loadResponses(state.selected.id);
  }
  renderAdmin();
  toast('回答已刪除');
}

async function clearResponses() {
  if (!state.selected || !confirm('確定清空這場活動的所有回答？這個動作無法復原。')) return;
  if (isDemo()) {
    const store = getDemoStore();
    store.responses = store.responses.filter(item => item.activity_id !== state.selected.id);
    setDemoStore(store);
  } else {
    const { error } = await cloud.from('responses').delete().eq('activity_id', state.selected.id);
    if (error) return toast(`無法清空：${error.message}`, 'error');
  }
  state.responses = [];
  renderAdmin();
  toast('這場活動的回答已清空');
}

async function toggleArchive() {
  const status = state.selected.status === 'archived' ? 'active' : 'archived';
  if (isDemo()) {
    const store = getDemoStore();
    const activity = store.activities.find(item => item.id === state.selected.id);
    activity.status = status;
    setDemoStore(store);
    state.activities = store.activities;
    state.selected = activity;
  } else {
    const { data, error } = await cloud.from('activities').update({ status }).eq('id', state.selected.id).select('id,owner_id,prompt,status,blocked_words,created_at,updated_at').single();
    if (error) return toast(`無法更新活動：${error.message}`, 'error');
    state.activities = state.activities.map(item => item.id === data.id ? data : item);
    state.selected = data;
  }
  renderAdmin();
  toast(status === 'archived' ? '活動已封存，學生不能再提交' : '活動已重新開啟');
}

function exportCsv() {
  if (!state.selected || !state.responses.length) return;
  const rows = [['活動問題', '學生回答', '審核狀態', '收到時間'], ...state.responses.map(item => [state.selected.prompt, item.content, item.status === 'held' ? '待確認' : '顯示中', new Date(item.created_at).toLocaleString('zh-TW')])];
  const csv = '\ufeff' + rows.map(row => row.map(cell => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(',')).join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `課堂文字雲_${new Date().toISOString().slice(0, 10)}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}

async function copyText(text, message) {
  try {
    await navigator.clipboard.writeText(text);
    toast(message);
  } catch {
    const input = document.createElement('textarea');
    input.value = text;
    document.body.append(input);
    input.select();
    document.execCommand('copy');
    input.remove();
    toast(message);
  }
}

function tokenCounts(responses) {
  const approved = responses.filter(item => item.status === 'approved');
  const counts = new Map();
  const stop = new Set(['的', '了', '是', '我', '也', '很', '有', '在', '和', '就', '都', '而', '及', '與', '或', '一個', '可以', '這個', '那個', '我們', '你們', '他們', '自己', '沒有', '不是', '因為', '所以', '什麼', '這堂', '今天', '覺得']);
  const segmenter = typeof Intl.Segmenter === 'function' ? new Intl.Segmenter('zh-TW', { granularity: 'word' }) : null;
  for (const response of approved) {
    const text = (response.content || '').trim();
    const segments = segmenter ? [...segmenter.segment(text)].filter(segment => segment.isWordLike).map(segment => segment.segment) : text.match(/[\p{L}\p{N}]+/gu) || [];
    const answerTokens = [...new Set(segments.map(token => token.trim()).filter(token => (token.length > 1 || /\p{Script=Han}/u.test(token)) && !stop.has(token)))];
    for (const token of answerTokens) counts.set(token, (counts.get(token) || 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'zh-Hant')).slice(0, 80);
}

function renderCloud(responses, emptyText = '等待第一個想法加入…') {
  const words = tokenCounts(responses);
  if (!words.length) return `<div class="cloud-empty"><div class="cloud-empty-icon">${icons.sparkle}</div><strong>${esc(emptyText)}</strong><span>掃描 QR Code，讓想法開始聚集。</span></div>`;
  const max = Math.max(...words.map(([, count]) => count));
  const min = Math.min(...words.map(([, count]) => count));
  const colors = ['#5576ee', '#e66d52', '#21a58a', '#a25fc5', '#d49a26', '#277caf', '#e06b8c'];
  return `<div class="word-cloud">${words.map(([word, count], index) => {
    const ratio = max === min ? 0.55 : (count - min) / (max - min);
    const size = Math.round(22 + ratio * 58);
    const rotate = index % 11 === 4 ? -3 : index % 9 === 6 ? 2 : 0;
    return `<span class="cloud-word" style="--word-size:${size}px;--word-color:${colors[index % colors.length]};--word-rotate:${rotate}deg" title="${count} 人提到">${esc(word)}${count > 1 ? `<small>${count}</small>` : ''}</span>`;
  }).join('')}</div>`;
}

async function renderJoin(id) {
  let activity;
  if (isDemo()) activity = getDemoStore().activities.find(item => item.id === id);
  else {
    const { data, error } = await cloud.rpc('get_public_activity', { p_activity_id: id });
    if (error) return renderStudentError('目前無法讀取題目，請確認連線後重試。');
    activity = Array.isArray(data) ? data[0] : data;
  }
  if (!activity) return renderStudentError('找不到這場活動。請確認 QR Code 或作答網址正確。');
  const closed = activity.status !== 'active';
  const alreadySent = localStorage.getItem(`classroom-wordcloud-submitted:${id}`) === 'yes';
  app.innerHTML = `${renderBanner()}${header({ student: true })}<main class="student-page"><div class="student-card"><div class="student-topline"><span class="student-chip"><i></i>${closed ? '本場已結束' : '課堂進行中'}</span><span class="student-brand-mini">課堂文字雲</span></div><div class="student-symbol">${icons.sparkle}</div><div class="eyebrow">講師想問大家</div><h1>${esc(activityLabel(activity))}</h1><p class="student-instruction">想一想，輸入一個關鍵字或簡短句子<br />你的回答會即時加入大螢幕上的文字雲。</p>
    ${alreadySent ? `<div class="submitted-state"><div class="submitted-check">${icons.check}</div><strong>想法已送出，謝謝你！</strong><p>看看大螢幕，你的回答已經加入課堂文字雲。</p></div>` : closed ? `<div class="closed-state">這場活動已封存，目前不再收答案。</div>` : `<form id="student-form"><label class="visually-hidden" for="student-answer">輸入你的回答</label><textarea id="student-answer" maxlength="120" rows="3" placeholder="輸入一個想法…" required></textarea><div class="student-form-bottom"><span id="answer-count">0 / 120</span><span>請保持友善，讓每個人都能自在參與</span></div><button class="button button-primary button-wide student-submit" type="submit">送出我的想法 ${icons.arrow}</button><div id="student-feedback" class="student-feedback" aria-live="polite"></div></form>`}
    <div class="student-privacy"><span class="privacy-icon">⌑</span>不需要登入；每台裝置每場活動限送出一次</div></div><p class="student-footer">讓每一個想法，都有被看見的機會。</p></main>`;
  const textarea = document.querySelector('#student-answer');
  textarea?.addEventListener('input', () => { document.querySelector('#answer-count').textContent = `${textarea.value.length} / 120`; });
  document.querySelector('#student-form')?.addEventListener('submit', event => submitAnswer(event, activity));
}

function renderStudentError(message) {
  app.innerHTML = `${header({ student: true })}<main class="student-page"><div class="student-card student-error"><div class="student-symbol">${icons.sparkle}</div><h1>暫時無法開啟</h1><p>${esc(message)}</p><a href="./" class="button button-light">回到首頁</a></div></main>`;
}

async function submitAnswer(event, activity) {
  event.preventDefault();
  const text = document.querySelector('#student-answer').value.trim();
  const feedback = document.querySelector('#student-feedback');
  const button = document.querySelector('.student-submit');
  if (!text) return;
  button.disabled = true;
  button.innerHTML = '正在送出…';
  feedback.textContent = '';
  try {
    if (isDemo()) {
      const rejected = (activity.blocked_words || []).some(word => word && text.toLowerCase().includes(word.toLowerCase()));
      if (rejected) throw new Error('這則回答包含活動封鎖的字詞，請修改後再送出。');
      const store = getDemoStore();
      const digest = getClientId(activity.id);
      if (store.responses.some(item => item.activity_id === activity.id && item.session_digest === digest)) {
        localStorage.setItem(`classroom-wordcloud-submitted:${activity.id}`, 'yes');
        await renderJoin(activity.id);
        return;
      }
      store.responses.push({ id: crypto.randomUUID(), activity_id: activity.id, content: text, status: /https?:\/\/|www\./i.test(text) ? 'held' : 'approved', moderation_reason: /https?:\/\/|www\./i.test(text) ? '內容含有外部連結，等待講師確認' : null, created_at: new Date().toISOString(), session_digest: digest });
      setDemoStore(store);
    } else {
      const response = await fetch(`${config.supabaseUrl}/functions/v1/submit-response`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', apikey: publicSupabaseKey },
        body: JSON.stringify({ activityId: activity.id, content: text, sessionId: getClientId(activity.id) })
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.accepted) {
        const messages = { blocked: '這則回答包含活動封鎖的字詞，請修改後再送出。', duplicate: '這台裝置已經送出過回答。', rate_limited: '目前送出的人很多，請稍候片刻再試。', inactive: '本場活動已結束。', not_found: '找不到這場活動，請重新掃描 QR Code。', too_long: '回答請控制在 120 個字以內。' };
        throw new Error(messages[result.reason] || '送出失敗，請確認網路後重試。');
      }
    }
    localStorage.setItem(`classroom-wordcloud-submitted:${activity.id}`, 'yes');
    await renderJoin(activity.id);
  } catch (error) {
    feedback.textContent = error.message || '送出失敗，請再試一次。';
    feedback.classList.add('error');
    button.disabled = false;
    button.innerHTML = `送出我的想法 ${icons.arrow}`;
  }
}

async function renderScreen(id) {
  if (!isDemo() && !state.user) {
    renderAuth();
    return;
  }
  let activity;
  let responses = [];
  if (isDemo()) {
    const store = getDemoStore();
    activity = store.activities.find(item => item.id === id);
    responses = store.responses.filter(item => item.activity_id === id);
  } else {
    const { data, error } = await cloud.from('activities').select('id,prompt,status').eq('id', id).maybeSingle();
    if (error || !data) return renderStudentError('無法開啟投影畫面，請確認講師已登入並且活動存在。');
    activity = data;
    const responseResult = await cloud.from('responses').select('id,activity_id,content,status,created_at').eq('activity_id', id).order('created_at', { ascending: true }).limit(2000);
    if (responseResult.error) return renderStudentError(`無法讀取回答：${responseResult.error.message}`);
    responses = responseResult.data || [];
  }
  if (!activity) return renderStudentError('找不到這場活動。');
  state.selected = activity;
  state.responses = responses;
  app.innerHTML = `<main class="presentation-screen"><div class="present-grain"></div><header class="present-header"><a class="brand present-brand" href="./" aria-label="回到管理頁"><span class="brand-mark">字</span><span class="brand-name">課堂文字雲<span>CLASSROOM WORD CLOUD</span></span></a><div class="live-indicator"><i></i>即時同步</div><button id="fullscreen-button" class="present-fullscreen">全螢幕 ${icons.display}</button></header><section class="present-main"><div class="present-question"><span class="present-eyebrow">講師想問大家</span><h1>${esc(activityLabel(activity))}</h1><div class="present-rule"></div><div class="present-answer-count"><span class="present-count-number" id="present-count">${responses.filter(item => item.status === 'approved').length}</span><span>個想法已加入</span></div></div><div class="present-cloud-wrap" id="present-cloud">${renderCloud(responses)}</div></section><aside class="present-qr-card"><div class="present-qr-head"><span class="present-qr-kicker">加入這場對話</span><strong>掃描 QR Code 作答</strong></div><div class="present-qr-frame"><canvas id="screen-qr" width="166" height="166"></canvas><div class="qr-fallback" id="screen-qr-fallback">QR Code 載入中…</div></div><p>打開手機相機，<br />掃描後輸入你的想法。</p><span class="present-anon">匿名參與・無須登入</span></aside><footer class="present-footer"><span>讓每個想法，都成為課堂的一部分。</span><span>課堂文字雲 · ${isDemo() ? '本機示範' : '即時雲端'}</span></footer></main>`;
  document.querySelector('#fullscreen-button').addEventListener('click', toggleFullscreen);
  drawQr('#screen-qr', linkFor('join', id), '#screen-qr-fallback');
  if (!isDemo()) subscribeToScreen(id);
  else window.addEventListener('demo-store-updated', () => refreshScreenDemo(id));
}

function subscribeToScreen(id) {
  state.realtimeChannel?.unsubscribe?.();
  state.realtimeChannel = cloud.channel(`screen-${id}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'responses', filter: `activity_id=eq.${id}` }, refreshScreenCloud)
    .subscribe();
}

async function refreshScreenCloud() {
  if (!state.selected) return;
  const { data } = await cloud.from('responses').select('id,activity_id,content,status,created_at').eq('activity_id', state.selected.id).order('created_at', { ascending: true }).limit(2000);
  state.responses = data || [];
  const cloudNode = document.querySelector('#present-cloud');
  if (!cloudNode) return;
  cloudNode.innerHTML = renderCloud(state.responses);
  document.querySelector('#present-count').textContent = state.responses.filter(item => item.status === 'approved').length;
}

function refreshScreenDemo(id) {
  const cloudNode = document.querySelector('#present-cloud');
  if (!cloudNode) return;
  state.responses = getDemoStore().responses.filter(item => item.activity_id === id);
  cloudNode.innerHTML = renderCloud(state.responses);
  document.querySelector('#present-count').textContent = state.responses.filter(item => item.status === 'approved').length;
}

async function toggleFullscreen() {
  try {
    if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
    else await document.exitFullscreen();
  } catch {
    toast('瀏覽器未允許進入全螢幕', 'error');
  }
}

function route() {
  const id = getActivityIdFromRoute();
  if (routeType() === 'join') return renderJoin(id);
  if (routeType() === 'screen') {
    if (isDemo()) return renderScreen(id);
    cloud.auth.getSession().then(({ data }) => {
      state.session = data.session;
      state.user = data.session?.user || null;
      if (state.user) renderScreen(id);
      else renderAuth();
    });
    return;
  }
  if (isDemo()) {
    state.user = null;
    return renderAuth();
  }
  cloud.auth.getSession().then(({ data }) => {
    state.session = data.session;
    state.user = data.session?.user || null;
    if (state.user) loadAdmin();
    else renderAuth();
  });
}

if (cloud) {
  cloud.auth.onAuthStateChange((event, session) => {
    state.session = session;
    state.user = session?.user || null;
    if (event === 'SIGNED_OUT' && routeType() === 'admin') renderAuth();
  });
}

window.addEventListener('storage', event => {
  if (event.key === DEMO_KEY) {
    if (routeType() === 'screen') refreshScreenDemo(getActivityIdFromRoute());
    else if (routeType() === 'admin' && isDemo() && state.user) loadAdmin();
  }
});

route();

