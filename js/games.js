/* 游戏攻略注册表
 *
 * 首页展示 GAME_REGISTRY 里的每个游戏，点进去读取对应的攻略数据。
 * 每个游戏的攻略数据都放在 games/ 下，整个站点可以独立部署，不依赖其他目录。
 *
 * 新增一款游戏（标准结构，无需改 app.js）：
 *   1) 新建 games/<id>.js：
 *        window.GAMES_DATA = window.GAMES_DATA || {};
 *        window.GAMES_DATA['moon'] = {
 *          chapters: [{ id:'ch0', name:'第一章 · 出发', en:'Chapter 1', intro:'章节简介' }],
 *          items: [{
 *            id:'m1', no:1, ch:0, name:'升空', en:'Liftoff',
 *            who:['主角'], opt:false, desc:'任务简介',
 *            steps:['第一步', '第二步'],            // 分步流程
 *            tips:['易失败点'],                     // 要点提示
 *            branch:{ title:'方案分支', note:'说明', options:[{name:'A 方案', items:['准备 1']}] },
 *            links:[{ label:'图文原文', url:'https://…', cls:'g' }]
 *          }]
 *        };
 *   2) 在下面 GAME_REGISTRY 里加一项：
 *        { id:'moon', name:'月球任务', sub:'主线 12 关', badge:'月',
 *          color1:'#1d2732', color2:'#8fb7e6', color3:'#5a86b8',
 *          source:'games/moon.js' }
 *   3) 把 games/<id>.js 加进 sw.js 的 ASSETS，离线也能看。
 */
(function (global) {
  'use strict';

  var GTA_CHAR = { M: '麦克尔', F: '富兰克林', T: '崔佛' };

  /* 把 games/gta5-data.js 的数据转成通用结构 */
  function adaptGTA5() {
    var D = global.GTA5;
    if (!D) throw new Error('GTA5 数据未加载');

    var B = D.BASE;
    var chapters = D.CHAPTERS.map(function (c) {
      return { id: c.id, name: c.name, en: c.en, intro: c.intro };
    });

    var items = D.MISSIONS.map(function (m) {
      var links = [
        { label: 'Game8 图文', url: B.g8 + (m.g8 || '377144'), cls: 'g' },
        { label: '金牌条件', url: B.gold, cls: 'g' },
        { label: '中文图文', url: B.cn1 }
      ];
      if (m.gp) links.splice(1, 0, { label: 'Gamepressure 逐步', url: B.gp + m.gp });

      return {
        id: m.id,
        no: m.no,
        ch: m.ch,
        name: m.zh,
        en: m.en,
        who: String(m.c || '').split('').map(function (k) { return GTA_CHAR[k]; }).filter(Boolean),
        opt: !!m.opt,
        desc: m.desc,
        steps: m.steps || [],
        tips: m.tips || [],
        branch: m.b || null,
        links: links
      };
    });

    return {
      chapters: chapters,
      items: items,
      /* 沿用旧进度 key，之前的打卡记录不会丢 */
      progress: { key: D.KEY, load: D.loadDone, save: D.saveDone }
    };
  }

  global.GAME_REGISTRY = [
    {
      id: 'gta5',
      name: 'GTA 5',
      sub: '侠盗猎车手 V · 剧情主线 69 任务',
      badge: 'V',
      color1: '#212a20',
      color2: '#e8c46a',
      color3: '#b98f38',
      searchHint: '搜索任务名 / 关键词（如：劫案、刺杀）…',
      /* 封面图：直接用游戏的实体盘封面 */
      cover: 'icons/covers/gta5.jpg',
      source: 'games/gta5-data.js',
      adapt: adaptGTA5
    },
    {
      id: 'cyberpunk2077',
      name: '赛博朋克 2077',
      sub: '夜之城 · 主线 32 条 · 结局分支',
      badge: '2077',
      color1: '#2b2410',
      color2: '#fcee0a',
      color3: '#c9b800',
      searchHint: '搜索任务 / 关键词（如：帕南、结局、荒坂）…',
      cover: 'icons/covers/cyberpunk2077.jpg',
      source: 'games/cyberpunk2077.js'
    }
  ];
})(window);
