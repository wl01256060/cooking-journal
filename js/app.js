/* 料理人之路 — 單頁應用（無框架）
 * 資料：data/recipes.json、data/config.json
 * 所有成就都由資料即時計算，不另外存檔。
 * 網址加上 ?demo 會產生假資料，方便預覽成就系統。
 */
(() => {
  'use strict';

  const DAY = 86400000;
  const MASTERY = [1, 3, 5];
  const SEASONS = [
    { key: '春', icon: '🌸', months: [3, 4, 5] },
    { key: '夏', icon: '🍉', months: [6, 7, 8] },
    { key: '秋', icon: '🍁', months: [9, 10, 11] },
    { key: '冬', icon: '❄️', months: [12, 1, 2] },
  ];
  const TECHNIQUES = [
    { key: '煎', icon: '🍳' }, { key: '炒', icon: '🥢' }, { key: '煮', icon: '🍲' },
    { key: '燉', icon: '🫕' }, { key: '烤', icon: '🔥' }, { key: '蒸', icon: '♨️' },
    { key: '炸', icon: '🍤' }, { key: '拌', icon: '🥗' }, { key: '滷', icon: '🥘' },
    { key: '烘焙', icon: '🥐' },
  ];
  const SKILL_LV = [{ at: 1, name: '入門' }, { at: 3, name: '熟練' }, { at: 6, name: '精通' }];
  const DIFF = { 1: '簡單', 2: '中等', 3: '挑戰' };

  const app = document.getElementById('app');
  const isDemo = new URLSearchParams(location.search).has('demo');
  let recipes = [];
  let config = {};
  let S = null; // computed stats
  const ui = { q: '', status: 'all', category: '', difficulty: '' };

  /* ---------- utils ---------- */
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const parseDate = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const today = () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), d.getDate()); };
  const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
  const daysBetween = (a, b) => Math.round((b - a) / DAY);
  const fmt = (d) => `${d.getMonth() + 1}/${d.getDate()}`;
  const fmtFull = (s) => { const d = parseDate(s); return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`; };
  const seasonOf = (d) => SEASONS.find((s) => s.months.includes(d.getMonth() + 1));
  const pct = (v, goal) => Math.max(0, Math.min(100, (v / goal) * 100));
  const store = {
    get(k, fb) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : fb; } catch { return fb; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* ignore */ } },
  };
  const starsFor = (n) => (n >= MASTERY[2] ? 3 : n >= MASTERY[1] ? 2 : n >= MASTERY[0] ? 1 : 0);
  const starsHtml = (n) => `<span class="stars" aria-label="熟練度 ${n} 星">${'★'.repeat(n)}<span class="off">${'★'.repeat(3 - n)}</span></span>`;
  const thumb = (r) => {
    const last = r.completions[r.completions.length - 1];
    if (last && last.photo) return last.photo;
    if (r.video && r.video.youtubeId) return `https://i.ytimg.com/vi/${r.video.youtubeId}/hqdefault.jpg`;
    return '';
  };
  const allIngredients = (r) => r.ingredients.flatMap((g) => g.items);

  /* ---------- stats ---------- */
  function compute() {
    const t = today();
    const comps = recipes
      .flatMap((r) => r.completions.map((c) => ({ ...c, recipe: r, d: parseDate(c.date) })))
      .sort((a, b) => a.d - b.d);
    const total = comps.length;
    const distinct = recipes.filter((r) => r.completions.length).length;

    // 稱號
    const titles = config.titles;
    let titleIdx = 0;
    titles.forEach((ti, i) => { if (total >= ti.at) titleIdx = i; });

    // 雙週節奏
    const start = parseDate(config.startDate);
    const pd = config.periodDays;
    const idxOf = (d) => Math.floor(daysBetween(start, d) / pd);
    const cur = idxOf(t);
    const covered = new Set(comps.map((c) => idxOf(c.d)).filter((i) => i >= 0));
    const periods = [];
    const vacUsed = {};
    const lastIdx = Math.max(cur, idxOf(new Date(t.getFullYear(), 11, 31)));
    for (let i = 0; i <= lastIdx; i++) {
      const s = addDays(start, i * pd);
      const e = addDays(s, pd - 1);
      const yr = s.getFullYear();
      let status;
      if (i > cur) status = 'future';
      else if (covered.has(i)) status = 'done';
      else if (i === cur) status = 'current';
      else if ((vacUsed[yr] || 0) < config.vacationPerYear) { vacUsed[yr] = (vacUsed[yr] || 0) + 1; status = 'vacation'; }
      else status = 'missed';
      periods.push({ i, s, e, yr, status, isCur: i === cur });
    }
    const alive = (p) => p.status === 'done' || p.status === 'vacation';
    let streak = 0;
    if (cur >= 0) {
      let j = periods[cur].status === 'done' ? cur : cur - 1;
      while (j >= 0 && alive(periods[j])) { if (periods[j].status === 'done') streak++; j--; }
    }
    let best = 0, run = 0;
    periods.filter((p) => p.i <= cur).forEach((p) => {
      if (p.status === 'done') { run++; best = Math.max(best, run); }
      else if (p.status !== 'vacation' && p.status !== 'current') run = 0;
    });
    const curPeriod = cur >= 0 ? periods[cur] : null;
    const vacLeft = config.vacationPerYear - (vacUsed[t.getFullYear()] || 0);

    // 每年全勤
    const years = [...new Set(periods.filter((p) => p.i <= cur).map((p) => p.yr))];
    const attendance = years.map((y) => {
      const ps = periods.filter((p) => p.yr === y && p.i <= cur);
      const broken = ps.some((p) => p.status === 'missed');
      return { year: y, broken, finished: t.getFullYear() > y, earned: t.getFullYear() > y && !broken };
    });

    // 四季
    const seasonsByYear = {};
    comps.forEach((c) => {
      const s = seasonOf(c.d);
      if ((c.recipe.seasons || []).includes(s.key)) {
        const y = c.d.getFullYear();
        (seasonsByYear[y] = seasonsByYear[y] || new Set()).add(s.key);
      }
    });
    const seasonsFull = Object.entries(seasonsByYear).filter(([, v]) => v.size === 4).map(([y]) => +y);

    // 獎勵
    const claims = config.claims || {};
    const rewards = [];
    config.rewards.forEach((rw) => {
      if (rw.type === 'count') {
        rewards.push({ ...rw, key: rw.id, earned: total >= rw.at, progress: Math.min(total, rw.at), goal: rw.at, claim: claims[rw.id] });
      } else if (rw.type === 'attendance') {
        attendance.filter((a) => a.earned).forEach((a) => rewards.push({ ...rw, key: `${rw.id}-${a.year}`, year: a.year, earned: true, claim: claims[`${rw.id}-${a.year}`] }));
      } else if (rw.type === 'seasons') {
        seasonsFull.forEach((y) => rewards.push({ ...rw, key: `${rw.id}-${y}`, year: y, earned: true, claim: claims[`${rw.id}-${y}`] }));
      }
    });
    const countRewards = rewards.filter((r) => r.type === 'count');
    const nextReward = countRewards.find((r) => !r.earned);
    const prevAt = [...countRewards].reverse().find((r) => r.earned)?.at || 0;
    const pendingRewards = rewards.filter((r) => r.earned && !r.claim);

    // 技法
    const techCount = {};
    comps.forEach((c) => (c.recipe.techniques || []).forEach((k) => { techCount[k] = (techCount[k] || 0) + 1; }));
    const techLit = TECHNIQUES.filter((x) => techCount[x.key]).length;
    const techMaster = TECHNIQUES.some((x) => (techCount[x.key] || 0) >= SKILL_LV[2].at);

    // 食材圖鑑
    const ingMap = {};
    comps.forEach((c) => allIngredients(c.recipe).forEach((it) => { ingMap[it.name] = (ingMap[it.name] || 0) + 1; }));

    const star3 = recipes.filter((r) => r.completions.length >= MASTERY[2]).length;
    const cats = new Set(comps.map((c) => c.recipe.category)).size;
    const hard = comps.some((c) => c.recipe.difficulty >= 3) ? 1 : 0;
    const improves = comps.filter((c) => c.improve).length;
    const variations = comps.filter((c) => c.variation).length;
    const ingN = Object.keys(ingMap).length;

    const badges = [
      { icon: '👣', name: '第一步', desc: '完成第一道料理', v: total, g: 1 },
      { icon: '📗', name: '圖鑑 10', desc: '完成 10 道不同料理', v: distinct, g: 10 },
      { icon: '📘', name: '圖鑑 25', desc: '完成 25 道不同料理', v: distinct, g: 25 },
      { icon: '📙', name: '圖鑑 50', desc: '完成 50 道不同料理', v: distinct, g: 50 },
      { icon: '📚', name: '圖鑑 100', desc: '完成 100 道不同料理', v: distinct, g: 100 },
      { icon: '⭐', name: '拿手菜', desc: '一道菜達到 ★★★（做 5 次）', v: star3, g: 1 },
      { icon: '🌟', name: '招牌三寶', desc: '三道菜達到 ★★★', v: star3, g: 3 },
      { icon: '🧭', name: '技法探索', desc: '點亮 5 種烹調技法', v: techLit, g: 5 },
      { icon: '🗺️', name: '全技法', desc: `點亮全部 ${TECHNIQUES.length} 種技法`, v: techLit, g: TECHNIQUES.length },
      { icon: '🥋', name: '技法精通', desc: '任一技法使用 6 次', v: techMaster ? 1 : 0, g: 1 },
      { icon: '🧗', name: '挑戰者', desc: '完成一道「挑戰」難度料理', v: hard, g: 1 },
      { icon: '🌏', name: '跨界料理人', desc: '完成 5 種不同分類', v: cats, g: 5 },
      { icon: '🔁', name: '三個月節奏', desc: '連續 6 期（約 3 個月）', v: best, g: 6 },
      { icon: '📅', name: '半年節奏', desc: '連續 13 期（約半年）', v: best, g: 13 },
      { icon: '🗓️', name: '一年節奏', desc: '連續 26 期（約一年）', v: best, g: 26 },
      { icon: '🏛️', name: '兩年節奏', desc: '連續 52 期（約兩年）', v: best, g: 52 },
      { icon: '🍀', name: '四季制霸', desc: '同一年集滿四季徽章', v: seasonsFull.length ? 4 : Math.max(0, ...Object.values(seasonsByYear).map((s) => s.size)), g: 4 },
      { icon: '🧺', name: '食材 30', desc: '食材圖鑑收集 30 種', v: ingN, g: 30 },
      { icon: '🛒', name: '食材 60', desc: '食材圖鑑收集 60 種', v: ingN, g: 60 },
      { icon: '🏪', name: '食材 100', desc: '食材圖鑑收集 100 種', v: ingN, g: 100 },
      { icon: '📝', name: '反思者', desc: '寫下 5 次「下次想改進」', v: improves, g: 5 },
      { icon: '🎨', name: '我的版本', desc: '做出一次自己的改良版', v: variations, g: 1 },
    ].map((b) => ({ ...b, on: b.v >= b.g }));

    return {
      comps, total, distinct, titleIdx, periods, cur, curPeriod, streak, best, vacLeft,
      attendance, seasonsByYear, rewards, countRewards, nextReward, prevAt, pendingRewards,
      techCount, ingMap, badges, t,
    };
  }

  /* ---------- views ---------- */
  function viewHome() {
    const s = S;
    const title = config.titles[s.titleIdx];
    const nextTitle = config.titles[s.titleIdx + 1];
    const nr = s.nextReward;
    const nrPct = nr ? pct(s.total - s.prevAt, nr.at - s.prevAt) : 100;
    const cp = s.curPeriod;
    const daysLeft = cp ? daysBetween(s.t, cp.e) + 1 : 0;
    const yr = s.t.getFullYear();
    const seasonSet = s.seasonsByYear[yr] || new Set();
    const nowSeason = seasonOf(s.t);
    const recent = s.periods.filter((p) => p.i <= s.cur).slice(-10);

    let rhythmBig, rhythmSub;
    if (!cp) { rhythmBig = '即將開始'; rhythmSub = `${fmtFull(config.startDate)} 起算`; }
    else if (cp.status === 'done') { rhythmBig = '本期完成 ✓'; rhythmSub = `下一期 ${fmt(addDays(cp.e, 1))} 開始`; }
    else { rhythmBig = `剩 ${daysLeft} 天`; rhythmSub = `本期 ${fmt(cp.s)}–${fmt(cp.e)}，做一道就達成`; }

    const cats = [...new Set(recipes.map((r) => r.category))].sort();

    return `
      ${demoBanner()}
      <section class="bento">
        <div class="card hero">
          <div>
            <div class="eyebrow">目前稱號</div>
            <div class="hero-title">${title.icon} ${esc(title.name)}</div>
            <div class="hero-count"><b class="num">${s.total}</b> 次完成 · <span class="num">${s.distinct}</span> 道不同料理${nextTitle ? ` · 再 ${nextTitle.at - s.total} 次晉升「${esc(nextTitle.name)}」` : ''}</div>
          </div>
          <div class="hero-next">
            ${nr ? `
              <div class="hero-next-row"><span>下一個獎勵</span><span class="num">${s.total} / ${nr.at}</span></div>
              <div class="hero-next-row"><strong>${nr.icon} ${esc(nr.title)}</strong><span>還差 <b class="num">${nr.at - s.total}</b> 道</span></div>
              <div class="bar"><span style="width:${nrPct}%"></span></div>` : '<div class="hero-next-row"><strong>🏆 所有里程碑都達成了！</strong></div>'}
          </div>
        </div>
        <div class="card stat-card">
          <div class="eyebrow">雙週節奏</div>
          <div class="big">${rhythmBig}</div>
          <div class="sub">${rhythmSub}</div>
          <div class="period-dots">${recent.map((p) => `<i class="dot ${p.status}${p.isCur ? ' current' : ''}" title="${fmt(p.s)}–${fmt(p.e)}"></i>`).join('')}</div>
        </div>
        <div class="card stat-card">
          <div class="eyebrow">連續節奏</div>
          <div class="big num">${s.streak}<small>期</small></div>
          <div class="sub">最佳 ${s.best} 期 · 今年休假券剩 ${Math.max(0, s.vacLeft)} 張 🏖️</div>
        </div>
        <div class="card stat-card">
          <div class="eyebrow">料理圖鑑</div>
          <div class="big num">${s.distinct}<small>/ ${recipes.length}</small></div>
          <div class="bar"><span style="width:${pct(s.distinct, recipes.length || 1)}%"></span></div>
          <div class="sub">食材圖鑑 ${Object.keys(s.ingMap).length} 種</div>
        </div>
        <div class="card stat-card">
          <div class="eyebrow">${yr} 四季徽章</div>
          <div class="season-row">${SEASONS.map((x) => `<span class="season${seasonSet.has(x.key) ? ' on' : ''}${x === nowSeason ? ' now' : ''}" title="${x.key}">${x.icon}</span>`).join('')}</div>
          <div class="sub">現在是${nowSeason.key}季，做一道標有「${nowSeason.key}」的當季料理</div>
        </div>
      </section>
      ${s.pendingRewards.map((r) => `
        <a class="reward-alert" href="#/achievements">
          <span class="ico">${r.icon}</span>
          <span><b>獎勵待兌現：${esc(r.title)}${r.year ? `（${r.year}）` : ''}</b><span class="muted">去享受吧！兌現後告訴 Claude 幫你標記 ✓</span></span>
        </a>`).join('')}

      <section class="section">
        <h2 class="h2">📖 食譜</h2>
        <div class="toolbar">
          <label class="search"><span aria-hidden="true">🔍</span>
            <input id="q" type="search" placeholder="搜尋料理名稱或食材，例如：雞蛋" value="${esc(ui.q)}" autocomplete="off">
          </label>
          <div class="seg" role="group" aria-label="完成狀態">
            ${[['all', '全部'], ['todo', '未完成'], ['done', '已完成']].map(([k, l]) => `<button data-status="${k}" class="${ui.status === k ? 'on' : ''}">${l}</button>`).join('')}
          </div>
          <select class="select" id="cat" aria-label="分類">
            <option value="">所有分類</option>
            ${cats.map((c) => `<option ${ui.category === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}
          </select>
          <select class="select" id="diff" aria-label="難度">
            <option value="">所有難度</option>
            ${Object.entries(DIFF).map(([k, v]) => `<option value="${k}" ${ui.difficulty === k ? 'selected' : ''}>${v}</option>`).join('')}
          </select>
        </div>
        <div id="list"></div>
      </section>`;
  }

  function renderList() {
    const el = document.getElementById('list');
    if (!el) return;
    const q = ui.q.trim().toLowerCase();
    const list = recipes.filter((r) => {
      const done = r.completions.length > 0;
      if (ui.status === 'done' && !done) return false;
      if (ui.status === 'todo' && done) return false;
      if (ui.category && r.category !== ui.category) return false;
      if (ui.difficulty && String(r.difficulty) !== ui.difficulty) return false;
      if (!q) return true;
      const hay = [r.name, r.category, ...(r.techniques || []), ...allIngredients(r).map((i) => i.name)].join(' ').toLowerCase();
      return q.split(/\s+/).every((w) => hay.includes(w));
    });
    // 未完成的排前面（想做清單），同狀態依加入時間新到舊
    list.sort((a, b) => (a.completions.length > 0) - (b.completions.length > 0) || String(b.addedAt).localeCompare(String(a.addedAt)));
    el.innerHTML = `
      <div class="result-count">共 ${list.length} 道</div>
      ${list.length ? `<div class="grid">${list.map(cardHtml).join('')}</div>` : '<div class="empty">找不到符合的料理 🥲<br>換個關鍵字試試</div>'}`;
  }

  function cardHtml(r) {
    const n = r.completions.length;
    const img = thumb(r);
    const matchedIng = ui.q.trim() ? allIngredients(r).filter((i) => ui.q.trim().split(/\s+/).some((w) => i.name.toLowerCase().includes(w.toLowerCase()))).map((i) => i.name) : [];
    return `
      <a class="rcard${n ? '' : ' locked'}" href="#/r/${encodeURIComponent(r.id)}">
        <div class="rcard-img">
          ${img ? `<img src="${esc(img)}" alt="" loading="lazy">` : `<span class="emoji">${r.emoji || '🍽️'}</span>`}
          <span class="badge ${n ? 'done' : ''}">${n ? `✓ 完成 ${n} 次` : '想做'}</span>
        </div>
        <div class="rcard-body">
          <div class="rcard-title"><span>${r.emoji || ''} ${esc(r.name)}</span>${starsHtml(starsFor(n))}</div>
          <div class="rcard-meta">
            <span class="chip violet">${esc(r.category)}</span>
            <span class="chip">${DIFF[r.difficulty] || ''}</span>
            ${matchedIng.slice(0, 2).map((m) => `<span class="chip blue">🥕 ${esc(m)}</span>`).join('')}
          </div>
        </div>
      </a>`;
  }

  function viewRecipe(id) {
    const r = recipes.find((x) => x.id === id);
    if (!r) return `<a class="back" href="#/">← 返回</a><div class="empty">找不到這道料理</div>`;
    const n = r.completions.length;
    const st = starsFor(n);
    const nextAt = MASTERY.find((m) => n < m);
    const last = r.completions[n - 1];
    const prog = store.get(`prog:${r.id}`, { ing: [], step: -1 });
    const yt = r.video && r.video.youtubeId;

    return `
      <a class="back" href="#/">← 返回食譜</a>
      <div class="detail-head">
        <div>
          ${yt ? `<div class="video" id="video">
              <img src="https://i.ytimg.com/vi/${esc(yt)}/hqdefault.jpg" alt="">
              <button class="play" id="play" aria-label="播放影片"><span>▶</span></button>
            </div>` : `<div class="video"><img src="${esc(thumb(r))}" alt=""></div>`}
        </div>
        <div>
          <div class="eyebrow">${esc(r.category)}</div>
          <h1 class="h1">${r.emoji || ''} ${esc(r.name)}</h1>
          <div class="meta-row">
            <span class="chip violet">${DIFF[r.difficulty] || ''}</span>
            <span class="chip">🍽 ${esc(r.servings)}</span>
            ${r.cost ? `<span class="chip">💰 ${esc(r.cost)}</span>` : ''}
            ${(r.techniques || []).map((x) => `<span class="chip blue">${esc(x)}</span>`).join('')}
            ${(r.seasons || []).map((x) => `<span class="chip">${SEASONS.find((s) => s.key === x)?.icon || ''} ${esc(x)}季</span>`).join('')}
          </div>
          <div class="mastery">
            <div class="mastery-top"><span>熟練度 ${starsHtml(st)}</span><span class="num">完成 ${n} 次</span></div>
            <div class="bar"><span style="width:${nextAt ? pct(n, nextAt) : 100}%"></span></div>
            <div class="muted" style="font-size:13px;margin-top:6px">${nextAt ? `再做 ${nextAt - n} 次升到 ${'★'.repeat(st + 1)}` : '已經是拿手菜了！'}</div>
          </div>
          ${last && last.improve ? `<div class="improve-note">📝 <b>上次想改進：</b>${esc(last.improve)}</div>` : ''}
          ${r.pending && r.pending.length ? `<div class="pending-note">⚠️ <b>待確認</b>（影片中沒講清楚）<ul>${r.pending.map((p) => `<li>${esc(p)}</li>`).join('')}</ul></div>` : ''}
          ${r.video ? `<div class="source">來源：<a href="${esc(r.video.url)}" target="_blank" rel="noopener">${esc(r.video.channel)} ↗</a></div>` : ''}
        </div>
      </div>

      <div class="detail-body">
        <div class="card">
          <h2 class="h2">🥕 食材</h2>
          <p class="hint">點一下打勾，備料時使用</p>
          ${r.ingredients.map((g, gi) => `
            <div class="ing-group">
              <h4>${esc(g.group)}</h4>
              ${g.items.map((it, ii) => {
                const k = `${gi}-${ii}`;
                const on = prog.ing.includes(k);
                return `<label class="ing${on ? ' checked' : ''}" data-ing="${k}">
                  <input type="checkbox" ${on ? 'checked' : ''}>
                  <span class="name">${esc(it.name)}${it.note ? `<small>${esc(it.note)}</small>` : ''}</span>
                  <span class="amt">${esc(it.amount)}</span></label>`;
              }).join('')}
            </div>`).join('')}
        </div>
        <div>
          <div class="card">
            <h2 class="h2">👩‍🍳 步驟</h2>
            <p class="hint">點一下步驟標記目前進度</p>
            <ol class="steps">
              ${r.steps.map((x, i) => `<li data-step="${i}" class="${i < prog.step ? 'done' : i === prog.step ? 'on' : ''}">${esc(x)}</li>`).join('')}
            </ol>
            <div style="margin-top:12px"><button class="btn ghost" id="reset">重新開始</button></div>
          </div>
          ${r.tips && r.tips.length ? `<div class="card" style="margin-top:16px"><h2 class="h2">💡 小技巧</h2><ul class="tips">${r.tips.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>` : ''}
        </div>
      </div>

      <section class="section">
        <h2 class="h2">📸 完成紀錄</h2>
        ${n ? `<div class="history">${[...r.completions].reverse().map((c) => `
          <div class="hist">
            ${c.photo ? `<img src="${esc(c.photo)}" alt="${esc(r.name)} ${esc(c.date)}" loading="lazy">` : ''}
            <div class="hist-body">
              <div class="date"><span>${fmtFull(c.date)}</span>${c.rating ? `<span class="stars">${'★'.repeat(c.rating)}</span>` : ''}</div>
              ${c.note ? `<p>${esc(c.note)}</p>` : ''}
              ${c.variation ? `<p>🎨 ${esc(c.variation)}</p>` : ''}
              ${c.improve ? `<p>📝 下次：${esc(c.improve)}</p>` : ''}
            </div>
          </div>`).join('')}</div>`
        : '<div class="empty">還沒做過這道菜<br>完成後把照片交給 Claude，就會解鎖圖鑑 ✨</div>'}
      </section>`;
  }

  function bindRecipe(id) {
    const key = `prog:${id}`;
    const prog = store.get(key, { ing: [], step: -1 });
    const play = document.getElementById('play');
    const r = recipes.find((x) => x.id === id);
    if (play && r) play.onclick = () => {
      document.getElementById('video').innerHTML =
        `<iframe src="https://www.youtube-nocookie.com/embed/${encodeURIComponent(r.video.youtubeId)}?autoplay=1&rel=0" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen title="${esc(r.video.title)}"></iframe>`;
    };
    app.querySelectorAll('.ing').forEach((el) => {
      el.querySelector('input').onchange = (e) => {
        const k = el.dataset.ing;
        prog.ing = e.target.checked ? [...new Set([...prog.ing, k])] : prog.ing.filter((x) => x !== k);
        el.classList.toggle('checked', e.target.checked);
        store.set(key, prog);
      };
    });
    app.querySelectorAll('.steps li').forEach((el) => {
      el.onclick = () => {
        const i = +el.dataset.step;
        prog.step = prog.step === i ? i + 1 : i;
        app.querySelectorAll('.steps li').forEach((li) => {
          const j = +li.dataset.step;
          li.className = j < prog.step ? 'done' : j === prog.step ? 'on' : '';
        });
        store.set(key, prog);
      };
    });
    const reset = document.getElementById('reset');
    if (reset) reset.onclick = () => { store.set(key, { ing: [], step: -1 }); render(); };
  }

  function viewAchievements() {
    const s = S;
    const yr = s.t.getFullYear();
    const yearPeriods = s.periods.filter((p) => p.yr === yr);
    const att = s.attendance.find((a) => a.year === yr);
    const seasonSet = s.seasonsByYear[yr] || new Set();

    const rewardRow = (r) => {
      const cls = r.claim ? 'claimed' : r.earned ? 'ready' : 'locked';
      const state = r.claim ? `<span class="state claimed">✓ 已兌現${r.claim.date ? `<br><span class="muted" style="font-weight:500">${fmtFull(r.claim.date)}</span>` : ''}</span>`
        : r.earned ? '<span class="state ready">🎉 待兌現</span>' : `<span class="state muted num">${r.progress} / ${r.goal}</span>`;
      return `<div class="reward ${cls}${r.major ? ' major' : ''}">
        <span class="ico">${r.icon}</span>
        <div class="txt">
          <b>${esc(r.title)}${r.year ? `（${r.year}）` : ''}</b>
          <div class="sub">${r.type === 'count' ? `累計完成 ${r.at} 次${!r.earned ? ` · 約 ${Math.round(((r.at - s.total) * config.periodDays) / 30)} 個月後` : ''}` : esc(r.desc)}</div>
          ${!r.earned && r.type === 'count' ? `<div class="bar"><span style="width:${pct(r.progress, r.goal)}%"></span></div>` : ''}
        </div>
        ${state}
      </div>`;
    };
    const recurring = config.rewards.filter((r) => r.type !== 'count');

    return `
      ${demoBanner()}
      <div class="eyebrow">成就</div>
      <h1 class="h1">料理人之路 <span class="grad-text">${config.titles[s.titleIdx].icon}</span></h1>

      <section class="section">
        <h2 class="h2">🧭 稱號</h2>
        <div class="title-path">
          ${config.titles.map((ti, i) => `<div class="tp ${i < s.titleIdx ? 'on' : ''}${i === s.titleIdx ? ' current' : ''}">
            <div class="ico">${ti.icon}</div><div class="nm">${esc(ti.name)}</div><div class="at">${ti.at === 0 ? '起點' : `${ti.at} 次`}</div></div>`).join('')}
        </div>
      </section>

      <section class="section">
        <h2 class="h2">🎁 里程碑獎勵</h2>
        <div class="rewards">
          ${s.rewards.filter((r) => r.type !== 'count').map(rewardRow).join('')}
          ${s.countRewards.map(rewardRow).join('')}
        </div>
        <h3 class="h2" style="font-size:16px;margin-top:22px">🔄 每年可以拿一次</h3>
        <div class="rewards">
          ${recurring.map((r) => {
            const prog = r.type === 'attendance'
              ? (att ? (att.broken ? '今年已中斷，明年再挑戰' : '今年全勤中 💪') : '尚未開始')
              : `今年 ${seasonSet.size} / 4 季`;
            return `<div class="reward locked"><span class="ico">${r.icon}</span><div class="txt"><b>${esc(r.title)}</b><div class="sub">${esc(r.desc)} · ${prog}</div></div></div>`;
          }).join('')}
        </div>
      </section>

      <section class="section two-col">
        <div class="card">
          <h2 class="h2">📅 ${yr} 雙週節奏</h2>
          <div class="rhythm-grid">${yearPeriods.map((p) => `<i class="dot ${p.status}${p.isCur ? ' current' : ''}" title="${fmt(p.s)}–${fmt(p.e)}"></i>`).join('')}</div>
          <div class="legend">
            <span><i class="dot done"></i>完成</span><span><i class="dot vacation"></i>休假券</span>
            <span><i class="dot missed"></i>中斷</span><span><i class="dot"></i>未來</span>
          </div>
          <p class="muted" style="font-size:13.5px;margin:12px 0 0">目前連續 <b>${s.streak}</b> 期 · 最佳 <b>${s.best}</b> 期 · 今年休假券剩 <b>${Math.max(0, s.vacLeft)}</b> 張（沒做的那期會自動使用）</p>
        </div>
        <div class="card">
          <h2 class="h2">🍃 ${yr} 四季徽章</h2>
          <div class="season-row" style="gap:12px">${SEASONS.map((x) => `<span class="season${seasonSet.has(x.key) ? ' on' : ''}" style="width:64px;height:64px;font-size:30px;border-radius:18px">${x.icon}</span>`).join('')}</div>
          <p class="muted" style="font-size:13.5px;margin:12px 0 0">在該季節做一道標有該季節的當季料理，就能點亮。集滿四季可以兌換獎勵 🌸</p>
        </div>
      </section>

      <section class="section">
        <h2 class="h2">🌳 技能樹</h2>
        <div class="skills">
          ${TECHNIQUES.map((x) => {
            const c = s.techCount[x.key] || 0;
            const lv = [...SKILL_LV].reverse().find((l) => c >= l.at);
            return `<div class="skill${c ? ' on' : ''}"><div class="ico">${x.icon}</div><div class="nm">${x.key}</div>
              <div class="lv">${lv ? lv.name : '未解鎖'} · ${c} 次</div>
              <div class="pips">${SKILL_LV.map((l) => `<i class="${c >= l.at ? 'on' : ''}"></i>`).join('')}</div></div>`;
          }).join('')}
        </div>
      </section>

      <section class="section">
        <h2 class="h2">🏅 徽章 <span class="chip violet">${s.badges.filter((b) => b.on).length} / ${s.badges.length}</span></h2>
        <div class="badges">
          ${s.badges.map((b) => `<div class="bdg${b.on ? ' on' : ''}"><div class="ico">${b.icon}</div><div class="nm">${esc(b.name)}</div><div class="ds">${esc(b.desc)}</div>
            ${b.on ? '' : `<div class="bar"><span style="width:${pct(b.v, b.g)}%"></span></div><div class="ds num">${Math.min(b.v, b.g)} / ${b.g}</div>`}</div>`).join('')}
        </div>
      </section>`;
  }

  function viewCollection() {
    const s = S;
    const byYear = {};
    s.comps.forEach((c) => { (byYear[c.d.getFullYear()] = byYear[c.d.getFullYear()] || []).push(c); });
    const years = Object.keys(byYear).map(Number).sort((a, b) => b - a);
    const seen = new Set();
    const newByYear = {};
    [...years].reverse().forEach((y) => {
      newByYear[y] = 0;
      byYear[y].forEach((c) => { if (!seen.has(c.recipe.id)) { seen.add(c.recipe.id); newByYear[y]++; } });
    });
    const ings = Object.entries(s.ingMap).sort((a, b) => b[1] - a[1]);

    return `
      ${demoBanner()}
      <div class="eyebrow">收藏</div>
      <h1 class="h1">年度回顧</h1>
      <section class="section">
        ${years.length ? years.map((y) => `
          <div class="year-block">
            <div class="year-head">
              <span class="yr grad-text">${y}</span>
              <span class="muted">完成 <b>${byYear[y].length}</b> 次 · 新料理 <b>${newByYear[y]}</b> 道</span>
            </div>
            <div class="mosaic">
              ${[...byYear[y]].reverse().map((c) => `<a href="#/r/${encodeURIComponent(c.recipe.id)}" title="${esc(c.recipe.name)}">
                ${c.photo ? `<img src="${esc(c.photo)}" alt="" loading="lazy">` : `<span class="emoji">${c.recipe.emoji || '🍽️'}</span>`}
                <span class="cap">${esc(c.recipe.name)} · ${fmt(c.d)}</span></a>`).join('')}
            </div>
          </div>`).join('') : '<div class="empty">第一道料理完成後，這裡會開始累積你的年度回顧 📸</div>'}
      </section>
      <section class="section">
        <h2 class="h2">🧺 食材圖鑑 <span class="chip violet">${ings.length} 種</span></h2>
        ${ings.length ? `<div class="ing-cloud">${ings.map(([k, v]) => `<span class="chip">${esc(k)}<b>×${v}</b></span>`).join('')}</div>`
          : '<div class="empty">完成料理後，用過的食材會收集到這裡</div>'}
      </section>`;
  }

  const demoBanner = () => (isDemo ? '<div class="demo-banner">👀 預覽模式：以下是假資料，用來展示成就系統。拿掉網址上的 ?demo 就是真實資料。</div>' : '');

  /* ---------- router ---------- */
  function render() {
    const h = location.hash.replace(/^#\/?/, '');
    const [route, arg] = h.split('/');
    document.querySelectorAll('[data-nav]').forEach((a) => {
      a.classList.toggle('active', (a.dataset.nav === 'home' && (route === '' || route === 'r')) || a.dataset.nav === route);
    });
    if (route === 'r') {
      app.innerHTML = viewRecipe(decodeURIComponent(arg || ''));
      bindRecipe(decodeURIComponent(arg || ''));
      const r = recipes.find((x) => x.id === decodeURIComponent(arg || ''));
      document.title = r ? `${r.name}｜料理人之路` : '料理人之路';
    } else if (route === 'achievements') {
      app.innerHTML = viewAchievements(); document.title = '成就｜料理人之路';
    } else if (route === 'collection') {
      app.innerHTML = viewCollection(); document.title = '收藏｜料理人之路';
    } else {
      app.innerHTML = viewHome(); document.title = '料理人之路';
      bindHome();
    }
  }

  function bindHome() {
    renderList();
    const q = document.getElementById('q');
    q.oninput = () => { ui.q = q.value; renderList(); };
    app.querySelectorAll('[data-status]').forEach((b) => {
      b.onclick = () => {
        ui.status = b.dataset.status;
        app.querySelectorAll('[data-status]').forEach((x) => x.classList.toggle('on', x === b));
        renderList();
      };
    });
    document.getElementById('cat').onchange = (e) => { ui.category = e.target.value; renderList(); };
    document.getElementById('diff').onchange = (e) => { ui.difficulty = e.target.value; renderList(); };
  }

  let lastRoute = '';
  window.addEventListener('hashchange', () => {
    render();
    const route = location.hash;
    if (route !== lastRoute) window.scrollTo(0, 0);
    lastRoute = route;
  });

  /* ---------- demo data ---------- */
  function makeDemo() {
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const D = [
      ['紅燒肉', '🍖', '中式', ['燉', '滷'], 3, ['冬']], ['蒜香義大利麵', '🍝', '西式', ['煮', '炒'], 1, []],
      ['日式馬鈴薯燉肉', '🥔', '日式', ['燉'], 2, ['秋', '冬']], ['清蒸鱸魚', '🐟', '中式', ['蒸'], 2, ['秋']],
      ['韓式拌飯', '🍚', '韓式', ['拌', '炒'], 2, []], ['酥炸雞塊', '🍗', '家常菜', ['炸'], 2, []],
      ['烤雞腿', '🍗', '西式', ['烤'], 1, []], ['香煎鮭魚', '🐟', '家常菜', ['煎'], 1, ['秋']],
      ['涼拌小黃瓜', '🥒', '家常菜', ['拌'], 1, ['夏']], ['香蕉磅蛋糕', '🍌', '甜點', ['烘焙'], 3, []],
      ['竹筍排骨湯', '🍲', '湯品', ['煮'], 2, ['夏']], ['草莓鬆餅', '🍓', '甜點', ['煎'], 2, ['春']],
      ['麻婆豆腐', '🌶️', '中式', ['炒'], 2, []], ['味噌湯', '🍜', '日式', ['煮'], 1, []],
    ];
    const base = recipes[0];
    const extra = D.map(([name, emoji, category, techniques, difficulty, seasons], i) => ({
      ...base, id: `demo-${i}`, name, emoji, category, techniques, difficulty, seasons,
      video: null, addedAt: `2025-0${(i % 9) + 1}-01`, completions: [], pending: [],
      ingredients: [{ group: '食材', items: [{ name: ['豬五花', '義大利麵', '馬鈴薯', '鱸魚', '白飯', '雞腿肉', '雞腿', '鮭魚', '小黃瓜', '香蕉', '竹筍', '草莓', '豆腐', '味噌'][i], amount: '適量' }, { name: '蒜頭', amount: '3 瓣' }, { name: ['醬油', '橄欖油', '洋蔥', '薑', '雞蛋', '麵粉', '迷迭香', '檸檬', '辣椒', '奶油', '排骨', '牛奶', '絞肉', '豆腐'][i], amount: '適量' }] }],
    }));
    recipes = [{ ...base, completions: [] }, ...extra];
    const t = today();
    const start = addDays(t, -14 * 30);
    config = { ...config, startDate: `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-${String(start.getDate()).padStart(2, '0')}`, claims: { c1: { date: '2025-09-01' }, c6: { date: '2025-12-01' } } };
    for (let p = 0; p < 30; p++) {
      if (rnd() < 0.12) continue;
      const d = addDays(start, p * 14 + Math.floor(rnd() * 13));
      if (d > t) break;
      const pool = rnd() < 0.35 ? recipes.slice(0, 4) : recipes;
      const r = pool[Math.floor(rnd() * pool.length)];
      r.completions.push({
        date: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
        rating: 3 + Math.floor(rnd() * 3), note: '好吃！', improve: rnd() < 0.4 ? '火可以再小一點' : '',
      });
    }
  }

  /* ---------- boot ---------- */
  Promise.all([
    fetch('data/recipes.json', { cache: 'no-cache' }).then((r) => r.json()),
    fetch('data/config.json', { cache: 'no-cache' }).then((r) => r.json()),
  ]).then(([rs, cfg]) => {
    recipes = rs.map((r) => ({ ...r, completions: [...(r.completions || [])].sort((a, b) => a.date.localeCompare(b.date)) }));
    config = cfg;
    if (isDemo) makeDemo();
    S = compute();
    render();
  }).catch((err) => {
    app.innerHTML = `<div class="empty">資料載入失敗：${esc(err.message)}<br>（需要透過網頁伺服器開啟，不能直接雙擊 index.html）</div>`;
  });
})();
