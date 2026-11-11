/* 攻略本 · PWA 应用逻辑（原生 JS，无需构建） */
(function () {
  'use strict';

  var appEl = document.getElementById('app');
  var toastEl = document.getElementById('toast');
  var REG = window.GAME_REGISTRY || [];

  var ICON = {
    back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>',
    search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.6-3.6" stroke-linecap="round"/></svg>'
  };

  var cache = {};          // id -> Promise<game>
  var ready = {};          // id -> game
  var cur = null;          // { meta, data, done }
  var ui = { q: '', ch: null, hideDone: false };
  var token = 0;

  /* ---------- 工具 ---------- */
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function shortName(name) {
    var parts = String(name || '').split('·');
    return (parts[parts.length - 1] || '').trim();
  }
  function readSet(key) {
    try { return new Set(JSON.parse(localStorage.getItem(key) || '[]')); } catch (e) { return new Set(); }
  }
  function writeSet(key, set) {
    try { localStorage.setItem(key, JSON.stringify(Array.from(set))); } catch (e) {}
  }
  function statKey(id) { return 'gg:stats:' + id; }
  function readStat(id) {
    try { return JSON.parse(localStorage.getItem(statKey(id)) || 'null'); } catch (e) { return null; }
  }
  function writeStat(id, n, total) {
    try { localStorage.setItem(statKey(id), JSON.stringify({ n: n, total: total, t: Date.now() })); } catch (e) {}
  }
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }

  var toastTimer;
  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add('on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove('on'); }, 1500);
  }

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = src;
      s.async = true;
      s.onload = function () { resolve(); };
      s.onerror = function () { reject(new Error('攻略资源加载失败：' + src)); };
      document.head.appendChild(s);
    });
  }

  /* ---------- 数据 ---------- */
  function normalizeGame(meta, raw) {
    var chapters = (raw.chapters || []).map(function (c, i) {
      return {
        id: c.id || ('ch' + i),
        name: c.name || '',
        short: c.short || shortName(c.name),
        en: c.en || '',
        intro: c.intro || ''
      };
    });

    var items = (raw.items || []).map(function (m, i) {
      return {
        id: String(m.id != null ? m.id : 'i' + (i + 1)),
        no: m.no != null ? m.no : i + 1,
        ch: m.ch != null ? m.ch : 0,
        name: m.name || '',
        en: m.en || '',
        who: m.who || [],
        opt: !!m.opt,
        desc: m.desc || '',
        steps: m.steps || [],
        tips: m.tips || [],
        branch: m.branch || null,
        links: (m.links || []).filter(function (l) { return l && l.url; })
      };
    });

    var prog = raw.progress || {};
    var key = prog.key || ('gg:progress:' + meta.id);

    return {
      meta: meta,
      chapters: chapters,
      items: items,
      progressKey: key,
      load: prog.load || function () { return readSet(key); },
      save: prog.save || function (set) { writeSet(key, set); }
    };
  }

  function loadGameData(meta) {
    if (cache[meta.id]) return cache[meta.id];
    var p = Promise.resolve()
      .then(function () { return meta.source ? loadScript(meta.source) : null; })
      .then(function () {
        var raw = meta.adapt ? meta.adapt() : (window.GAMES_DATA && window.GAMES_DATA[meta.id]);
        if (!raw) throw new Error('未找到该游戏的攻略数据');
        return normalizeGame(meta, raw);
      });
    cache[meta.id] = p;
    p.catch(function () { delete cache[meta.id]; });
    return p;
  }

  /* ---------- 首页 ---------- */
  function isIOS() {
    return /iphone|ipad|ipod/i.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  }
  function isStandalone() {
    return window.navigator.standalone === true ||
      (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches);
  }
  function installTipHtml() {
    if (!isIOS() || isStandalone() || lsGet('gg:hideInstall') === '1') return '';
    return '<div class="install-tip" id="installTip">' +
      '<span>添加到主屏幕：点 Safari 底部「分享」→「添加到主屏幕」，之后可全屏、离线打开。</span>' +
      '<button class="close" data-act="hideTip" aria-label="关闭提示">✕</button></div>';
  }

  function renderHome() {
    cur = null;
    ui = { q: '', ch: null, hideDone: false };

    var cards = REG.map(function (meta) {
      var st = readStat(meta.id) || { n: 0, total: 0 };
      var pct = st.total ? Math.round(st.n / st.total * 100) : 0;
      var label = st.total ? st.n + ' / ' + st.total + ' · ' + pct + '%' : '未开始';
      var badge = meta.badge || String(meta.name || '').slice(0, 2);
      var thumb = meta.cover
        ? '<img class="gc-cover" src="' + esc(meta.cover) + '" alt="' + esc(meta.name) + ' 封面" loading="lazy" decoding="async">'
        : '<div class="gc-badge' + (badge.length > 2 ? ' sm' : '') + '">' + esc(badge) + '</div>';
      return '<a class="game-card" href="#/g/' + esc(meta.id) + '" data-game="' + esc(meta.id) + '"' +
        ' style="--gc1:' + esc(meta.color1 || '#1d2732') + ';--gc2:' + esc(meta.color2 || '#e8c46a') +
        ';--gc1b:' + esc(meta.color3 || '#b98f38') + '">' +
        '<div class="gc-top">' +
          thumb +
          '<div style="min-width:0">' +
            '<div class="gc-title">' + esc(meta.name) + '</div>' +
            '<div class="gc-sub">' + esc(meta.sub || '') + '</div>' +
          '</div>' +
          '<span class="gc-go">›</span>' +
        '</div>' +
        '<div class="gc-meta">' +
          '<span class="gc-count" data-count>' + esc(label) + '</span>' +
          '<span class="gc-bar"><i class="gc-fill" data-fill style="width:' + pct + '%"></i></span>' +
        '</div></a>';
    }).join('');

    appEl.innerHTML = '<div class="library">' +
      '<header class="lib-head">' +
        '<div class="lib-kicker">Game Guides</div>' +
        '<h1 class="lib-title">攻略本</h1>' +
        '<p class="lib-sub">' + REG.length + ' 款游戏 · 分步流程 · 离线可看 · 进度存在本机</p>' +
      '</header>' +
      installTipHtml() +
      '<div class="games">' + (cards || '<div class="empty"><b>还没有攻略</b>在 js/games.js 里注册游戏即可</div>') + '</div>' +
      '<div class="lib-foot">攻略内容按游戏分册存放，打卡进度只保存在本机浏览器。<br>' +
      '外出没网也能查：所有页面与数据都已缓存到本地。</div>' +
    '</div>';

    /* 首页也把已打开过的游戏进度刷新成真实值 */
    REG.forEach(function (meta) {
      loadGameData(meta).then(function (g) {
        var card = appEl.querySelector('[data-game="' + meta.id.replace(/"/g, '') + '"]');
        if (!card) return;
        var done = g.load() || new Set();
        var total = g.items.length;
        var n = g.items.filter(function (m) { return done.has(m.id); }).length;
        var pct = total ? Math.round(n / total * 100) : 0;
        card.querySelector('[data-count]').textContent = total ? n + ' / ' + total + ' · ' + pct + '%' : '未开始';
        card.querySelector('[data-fill]').style.width = pct + '%';
        writeStat(meta.id, n, total);
      }).catch(function () {});
    });
  }

  /* ---------- 攻略页 ---------- */
  function topbarHtml(title) {
    return '<header class="topbar">' +
      '<div class="tb-row">' +
        '<a class="back" href="#/" aria-label="返回攻略库">' + ICON.back + '攻略库</a>' +
        '<span class="tb-title">' + esc(title) + '</span>' +
        '<span class="tb-count" id="tbCount">—</span>' +
      '</div>' +
      '<div class="tb-line"><i id="tbFill"></i></div>' +
    '</header>';
  }

  function renderGameShell(g) {
    appEl.innerHTML = topbarHtml(g.meta.name) +
      '<div class="tools">' +
        '<div class="search">' + ICON.search +
          '<input id="q" type="search" placeholder="' + esc(g.meta.searchHint || '搜索任务名 / 关键词…') + '" autocomplete="off" enterkeyhint="search" value="' + esc(ui.q) + '">' +
        '</div>' +
        '<div class="chips" id="chips"></div>' +
        '<div class="tool-foot">' +
          '<button class="toggle" id="hideDone" data-act="hideDone"><span class="dot"></span>只看未完成</button>' +
          '<span id="resultInfo" style="margin-left:auto"></span>' +
        '</div>' +
      '</div>' +
      '<div class="list" id="list"></div>';

    var q = document.getElementById('q');
    q.addEventListener('input', function () {
      ui.q = this.value;
      renderList();
    });
  }

  function chapterStats() {
    var map = {};
    cur.data.chapters.forEach(function (c, i) {
      var list = cur.data.items.filter(function (m) { return m.ch === i; });
      map[c.id] = {
        total: list.length,
        n: list.filter(function (m) { return cur.done.has(m.id); }).length
      };
    });
    return map;
  }

  function renderChips() {
    var box = document.getElementById('chips');
    if (!box) return;
    var stats = chapterStats();
    var total = cur.data.items.length;
    var n = cur.data.items.filter(function (m) { return cur.done.has(m.id); }).length;

    var html = '<button class="chip' + (ui.ch ? '' : ' on') + '" data-ch="">全部<span class="n">' + n + '/' + total + '</span></button>';
    cur.data.chapters.forEach(function (c) {
      var s = stats[c.id] || { n: 0, total: 0 };
      if (!s.total) return;
      html += '<button class="chip' + (ui.ch === c.id ? ' on' : '') + '" data-ch="' + esc(c.id) + '">' +
        esc(c.short || c.name) + '<span class="n">' + s.n + '/' + s.total + '</span></button>';
    });
    box.innerHTML = html;
  }

  function matches(m, q) {
    var hay = [m.name, m.en, m.desc, m.who.join(' '), m.steps.join(' '), m.tips.join(' ')].join(' ').toLowerCase();
    return hay.indexOf(q) >= 0;
  }

  function branchHtml(b) {
    if (!b || !b.options || !b.options.length) return '';
    return '<div class="branch"><h4>方案分支 · ' + esc(b.title || '') + '</h4>' +
      (b.note ? '<div class="bn">' + esc(b.note) + '</div>' : '') +
      '<div class="bcols">' + b.options.map(function (o, i) {
        return '<div class="bcol' + (i ? ' alt' : '') + '"><h5>' + esc(o.name) + '</h5><ul>' +
          (o.items || []).map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') +
          '</ul></div>';
      }).join('') + '</div></div>';
  }

  function itemHtml(m) {
    var done = cur.done.has(m.id);
    var sub = [m.en, m.who.join(' · '), m.opt ? '可选' : ''].filter(Boolean).join(' · ');

    var body = '<p class="desc">' + esc(m.desc) + '</p>';
    if (m.steps.length) {
      body += '<div class="sec-t">分步流程</div><ol class="steps">' +
        m.steps.map(function (s, i) {
          return '<li><span class="sn">' + (i + 1) + '</span><div>' + esc(s) + '</div></li>';
        }).join('') + '</ol>';
    }
    if (m.tips.length) {
      body += '<div class="sec-t">要点提示</div><ul class="tips">' +
        m.tips.map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('') + '</ul>';
    }
    body += branchHtml(m.branch);
    if (m.links.length) {
      body += '<div class="links">' + m.links.map(function (l) {
        return '<a class="' + esc(l.cls || '') + '" href="' + esc(l.url) + '" target="_blank" rel="noopener noreferrer">' +
          esc(l.label) + ' ↗</a>';
      }).join('') + '</div>';
    }
    body += '<button class="mark' + (done ? ' on' : '') + '" data-act="check">' +
      (done ? '✓ 已完成' : '标记完成') + '</button>';

    return '<details class="item' + (done ? ' is-done' : '') + '" data-id="' + esc(m.id) + '" id="it-' + esc(m.id) + '">' +
      '<summary>' +
        '<span class="check' + (done ? ' on' : '') + '" role="checkbox" aria-checked="' + (done ? 'true' : 'false') + '" data-act="check" aria-label="标记完成">✓</span>' +
        '<span class="it-main">' +
          '<span class="it-title"><span class="it-no">' + esc(m.no) + '</span>' +
          '<span class="it-name">' + esc(m.name) + '</span></span>' +
          '<span class="it-sub">' + esc(sub) + '</span>' +
        '</span>' +
        '<span class="chev">›</span>' +
      '</summary>' +
      '<div class="it-body">' + body + '</div>' +
    '</details>';
  }

  function renderList() {
    var box = document.getElementById('list');
    if (!box || !cur) return;

    var q = ui.q.trim().toLowerCase();
    var html = '';
    var shown = 0;

    cur.data.chapters.forEach(function (c, i) {
      if (ui.ch && ui.ch !== c.id) return;
      var list = cur.data.items.filter(function (m) { return m.ch === i; });
      if (q) list = list.filter(function (m) { return matches(m, q); });
      if (ui.hideDone) list = list.filter(function (m) { return !cur.done.has(m.id); });
      if (!list.length) return;

      var total = cur.data.items.filter(function (m) { return m.ch === i; }).length;
      var dn = cur.data.items.filter(function (m) { return m.ch === i && cur.done.has(m.id); }).length;
      shown += list.length;

      html += '<section class="chapter" id="' + esc(c.id) + '">' +
        '<div class="ch-head"><h2>' + esc(c.name) + '</h2>' +
        '<span class="ch-en">' + esc(c.en) + '</span>' +
        '<span class="ch-n">' + dn + '/' + total + '</span></div>' +
        (q ? '' : '<p class="ch-intro">' + esc(c.intro) + '</p>') +
        list.map(itemHtml).join('') +
      '</section>';
    });

    box.innerHTML = html || '<div class="empty"><b>' +
      (q ? '没有匹配的任务' : '这个筛选下没有任务了') + '</b>' +
      (q ? '换个关键词试试，或点「全部」查看所有章节' : '点上面「全部」或关闭「只看未完成」') + '</div>';

    var info = document.getElementById('resultInfo');
    if (info) info.textContent = q ? shown + ' 条结果' : '';
  }

  function updateProgress() {
    if (!cur) return;
    var total = cur.data.items.length;
    var n = cur.data.items.filter(function (m) { return cur.done.has(m.id); }).length;
    var pct = total ? (n / total * 100) : 0;

    var count = document.getElementById('tbCount');
    var fill = document.getElementById('tbFill');
    if (count) count.textContent = n + ' / ' + total;
    if (fill) fill.style.width = pct + '%';

    renderChips();
    writeStat(cur.meta.id, n, total);
  }

  function syncItemDom() {
    if (!cur) return;
    Array.prototype.forEach.call(document.querySelectorAll('.list .item'), function (el) {
      var on = cur.done.has(el.dataset.id);
      el.classList.toggle('is-done', on);
      var chk = el.querySelector('.check');
      if (chk) {
        chk.classList.toggle('on', on);
        chk.setAttribute('aria-checked', on ? 'true' : 'false');
      }
      var btn = el.querySelector('.mark');
      if (btn) {
        btn.classList.toggle('on', on);
        btn.textContent = on ? '✓ 已完成' : '标记完成';
      }
    });
  }

  function toggleDone(id) {
    if (!cur) return;
    var was = cur.done.has(id);
    if (was) cur.done.delete(id); else cur.done.add(id);
    cur.data.save(cur.done);
    syncItemDom();
    updateProgress();
    /* 只看未完成时，勾掉的卡片会淡出消失，提示一下免得以为是 bug */
    if (ui.hideDone && !was) {
      toast('已完成，已从未完成列表移除');
    } else {
      toast(was ? '已取消完成' : '已完成 ✓');
    }
  }

  function openItem(id) {
    var target = null;
    Array.prototype.forEach.call(document.querySelectorAll('.list .item'), function (el) {
      if (el.dataset.id === id) target = el;
    });
    if (!target) return;
    target.open = true;
    target.classList.add('hl');
    setTimeout(function () {
      target.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }, 60);
    setTimeout(function () { target.classList.remove('hl'); }, 2400);
  }

  function mountGame(meta, g, itemId) {
    cur = { meta: meta, data: g, done: g.load() || new Set() };
    ui = { q: '', ch: null, hideDone: false };

    renderGameShell(g);
    renderChips();
    renderList();
    updateProgress();

    if (itemId) setTimeout(function () { openItem(itemId); }, 80);
    else window.scrollTo(0, 0);
  }

  function openGame(id, itemId) {
    var meta = REG.filter(function (m) { return m.id === id; })[0];
    if (!meta) { location.hash = '#/'; return; }

    var myToken = ++token;

    if (ready[id]) {
      mountGame(meta, ready[id], itemId);
      return;
    }

    appEl.innerHTML = topbarHtml(meta.name) +
      '<div class="empty"><b>正在载入 ' + esc(meta.name) + ' 攻略</b>首次打开需要读取任务数据…</div>';

    loadGameData(meta).then(function (g) {
      if (myToken !== token) return;
      ready[id] = g;
      mountGame(meta, g, itemId);
    }).catch(function (err) {
      if (myToken !== token) return;
      appEl.innerHTML = topbarHtml(meta.name) +
        '<div class="empty"><b>没能载入攻略</b>' + esc(err && err.message) +
        '<br>请检查网络后重试，或回到攻略库重新进入。</div>';
    });
  }

  /* ---------- 路由 ---------- */
  function parseRoute() {
    var raw = (location.hash || '').replace(/^#/, '');
    var p = raw.split('/').filter(Boolean);
    if (p[0] === 'g' && p[1]) {
      return {
        name: 'game',
        id: decodeURIComponent(p[1]),
        item: p[2] === 'i' && p[3] ? decodeURIComponent(p[3]) : null
      };
    }
    return { name: 'home' };
  }

  function route() {
    var r = parseRoute();
    if (r.name === 'game') {
      openGame(r.id, r.item);
    } else {
      renderHome();
      window.scrollTo(0, 0);
    }
    syncTopBtn();
  }

  /* ---------- 回到顶部 ---------- */
  var topBtn = document.getElementById('toTop');
  function syncTopBtn() {
    topBtn.classList.toggle('on', !!cur && window.scrollY > 900);
  }
  window.addEventListener('scroll', syncTopBtn, { passive: true });
  topBtn.addEventListener('click', function () {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  /* ---------- 事件 ---------- */
  appEl.addEventListener('click', function (e) {
    var actEl = e.target.closest('[data-act]');

    if (actEl) {
      var act = actEl.dataset.act;
      if (act === 'check') {
        e.preventDefault();
        e.stopPropagation();
        var item = actEl.closest('.item');
        if (item) toggleDone(item.dataset.id);
        return;
      }
      if (act === 'hideTip') {
        lsSet('gg:hideInstall', '1');
        var tip = document.getElementById('installTip');
        if (tip) tip.remove();
        return;
      }
      if (act === 'hideDone') {
        ui.hideDone = !ui.hideDone;
        actEl.classList.toggle('on', ui.hideDone);
        renderList();
        return;
      }
    }

    var chip = e.target.closest('.chip');
    if (chip) {
      ui.ch = chip.dataset.ch || null;
      renderChips();
      renderList();
    }
  });

  /* 章节切换后刷新，兼容浏览器前进/后退 */
  window.addEventListener('hashchange', route);

  /* 多标签同步打卡进度 */
  window.addEventListener('storage', function (e) {
    if (!cur || !e.key || e.key !== cur.data.progressKey) return;
    try {
      cur.done = new Set(JSON.parse(e.newValue || '[]'));
      syncItemDom();
      updateProgress();
    } catch (err) {}
  });

  /* ---------- 启动 ---------- */
  route();

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js').catch(function () {});
    });
  }
})();
