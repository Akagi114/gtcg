/* 坎友会 - 我的卡组（构筑器 + 对战接入）
 * 依赖：js/cards-data.js
 * 构筑规则（规则书 0.1）：卡组固定 40 张，同名卡最多 4 张；
 * 冠军之剑（card24）开局在双方 EX ZONE，不入卡组。
 */
(function () {
  const DECK_SIZE = 40, MAX_COPY = 4, STORE_KEY = "gtcg_decks_v1";
  const POOL = CARDS.filter(c => c.id !== "card24");
  const byId = id => CARDS.find(c => c.id === id);
  const $ = id => document.getElementById(id);
  const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const costOf = c => (c.cost === null || c.cost === undefined) ? 99 : c.cost;
  const costTxt = c => (c.cost === null || c.cost === undefined) ? "无" : String(c.cost);

  // ================= 预设卡组 =================
  // 预设版本：每次「默认卡组」变更时 +1，用于把未被玩家改动过的旧预设升级为新预设
  const PRESET_VERSION = 2;
  const PRESETS = {
    a: {
      name: "虚土·守护壁垒",
      attr: "虚 / 土",
      tag: "守护站场 · 大身材",
      cards: {
        // 1 费
        card04: 4, card12: 3, card15: 4, card20: 4,
        // 2 费
        card14: 2, card18: 2, card19: 2, card08: 3, card13: 2,
        // 3 费
        card06: 2, card22: 4,
        // 4 费
        card10: 4,
        // 5 费
        card05: 4
      }
    },
    b: {
      name: "虚光·神威门",
      attr: "虚 / 光",
      tag: "检索铺场 · 佩儿轴",
      cards: {
        // 1 费
        card12: 4, card17: 4, card20: 2,
        // 2 费
        card07: 4, card18: 2, card19: 2, card21: 4,
        // 3 费
        card01: 4, card02: 4, card23: 4,
        // 4 费
        card03: 4,
        // 5 费
        card16: 2
      }
    }
  };

  // 上一版（v1）预设，仅用于迁移比对：内容与它完全一致＝玩家没动过，可安全升级
  const LEGACY_PRESETS = {
    a: { card04: 4, card12: 2, card15: 2, card07: 3, card08: 3, card13: 2, card14: 2, card18: 2, card19: 2, card21: 2, card06: 3, card09: 2, card22: 2, card10: 3, card11: 3, card05: 3 },
    b: { card12: 4, card17: 4, card20: 2, card07: 4, card13: 2, card14: 2, card18: 2, card19: 2, card21: 2, card01: 4, card02: 3, card09: 2, card03: 2, card11: 3, card16: 2 }
  };
  function sameCards(x, y) {
    const a = x || {}, b = y || {};
    const ka = Object.keys(a).filter(k => a[k] > 0), kb = Object.keys(b).filter(k => b[k] > 0);
    if (ka.length !== kb.length) return false;
    return ka.every(k => a[k] === b[k]);
  }

  function clonePresets() {
    const d = { version: 1, presetVersion: PRESET_VERSION, active: "a", pick: { p: "a", a: "b" }, decks: {} };
    ["a", "b"].forEach(k => {
      d.decks[k] = {
        name: PRESETS[k].name,
        attr: PRESETS[k].attr,
        tag: PRESETS[k].tag,
        cards: Object.assign({}, PRESETS[k].cards)
      };
    });
    return d;
  }

  // 默认卡组升级：旧存档且该卡组内容仍等于旧预设（玩家没改过）→ 换成新预设；玩家改过的保留
  function upgradePresets(d) {
    if (!d || typeof d !== "object" || !d.decks) return d;
    if (d.presetVersion === PRESET_VERSION) return d;
    ["a", "b"].forEach(k => {
      const src = d.decks[k];
      if (src && sameCards(src.cards, LEGACY_PRESETS[k])) {
        src.name = PRESETS[k].name; src.attr = PRESETS[k].attr; src.tag = PRESETS[k].tag;
        src.cards = Object.assign({}, PRESETS[k].cards);
      }
    });
    d.presetVersion = PRESET_VERSION;
    return d;
  }

  function load() {
    const base = clonePresets();
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (!raw) return base;
      const d = JSON.parse(raw);
      if (!d || typeof d !== "object" || !d.decks) return base;
      ["a", "b"].forEach(k => {
        const src = d.decks[k];
        if (!src || typeof src !== "object") { d.decks[k] = base.decks[k]; return; }
        if (typeof src.name !== "string" || !src.name) src.name = base.decks[k].name;
        if (typeof src.attr !== "string") src.attr = base.decks[k].attr;
        if (typeof src.tag !== "string") src.tag = base.decks[k].tag;
        if (!src.cards || typeof src.cards !== "object") src.cards = base.decks[k].cards;
        const clean = {};
        Object.keys(src.cards).forEach(cid => {
          const n = Math.floor(Number(src.cards[cid]));
          if (byId(cid) && n > 0) clean[cid] = Math.min(n, MAX_COPY);
        });
        src.cards = clean;
      });
      upgradePresets(d);
      if (d.active !== "a" && d.active !== "b") d.active = "a";
      if (!d.pick || (d.pick.p !== "a" && d.pick.p !== "b")) d.pick = { p: "a", a: "b" };
      d.pick.a = d.pick.p === "a" ? "b" : "a";
      return d;
    } catch (e) {
      return base;
    }
  }

  let DATA = load();
  function save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(DATA)); } catch (e) { /* 隐私模式等：内存内仍可用 */ }
  }

  // ================= 数据查询 =================
  function expand(id) {
    const d = DATA.decks[id];
    if (!d) return [];
    const out = [];
    Object.keys(d.cards).forEach(cid => { for (let i = 0; i < d.cards[cid]; i++) out.push(cid); });
    return out;
  }
  function size(id) { return expand(id).length; }
  function overCopies(id) {
    const d = DATA.decks[id] || { cards: {} };
    return Object.keys(d.cards).filter(cid => d.cards[cid] > MAX_COPY)
      .map(cid => `「${byId(cid).name}」×${d.cards[cid]}`);
  }
  function valid(id) { return size(id) === DECK_SIZE && overCopies(id).length === 0; }
  function lockReason(id) {
    if (overCopies(id).length) return "同名超过 4 张：" + overCopies(id).join("、");
    if (size(id) !== DECK_SIZE) return `还需 ${DECK_SIZE - size(id)} 张`;
    return "";
  }
  function deckMeta(id) {
    const d = DATA.decks[id] || { cards: {} };
    const byCost = {}, byType = {}, byAttr = {};
    let power = 0, n = 0;
    Object.keys(d.cards).forEach(cid => {
      const c = byId(cid), k = d.cards[cid];
      byCost[costTxt(c)] = (byCost[costTxt(c)] || 0) + k;
      byType[c.type] = (byType[c.type] || 0) + k;
      byAttr[c.attr] = (byAttr[c.attr] || 0) + k;
      if (c.power != null && c.type === "角色") { power += c.power * k; n += k; }
    });
    return { byCost, byType, byAttr, avgPower: n ? Math.round(power / n) : 0, total: size(id) };
  }

  // ================= 小提示 =================
  let toastTimer = null;
  function toast(msg) {
    let el = $("deck-toast");
    if (!el) {
      el = document.createElement("div");
      el.id = "deck-toast";
      el.className = "deck-toast";
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.classList.add("on");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("on"), 1800);
  }

  // ================= 编辑操作 =================
  function addCard(deckId, cid) {
    if (!byId(cid)) return;
    if (size(deckId) >= DECK_SIZE) { toast(`「${DATA.decks[deckId].name}」已满 ${DECK_SIZE} 张，先移除一些卡`); return; }
    const d = DATA.decks[deckId];
    const n = d.cards[cid] || 0;
    if (n >= MAX_COPY) { toast(`「${byId(cid).name}」同名最多 ${MAX_COPY} 张`); return; }
    d.cards[cid] = n + 1;
    save(); renderAll();
  }
  function removeCard(deckId, cid) {
    const d = DATA.decks[deckId];
    if (!d || !d.cards[cid]) return;
    d.cards[cid] -= 1;
    if (!d.cards[cid]) delete d.cards[cid];
    save(); renderAll();
  }
  function setActive(deckId) { DATA.active = deckId; save(); renderAll(); }
  function setPick(deckId) { DATA.pick = { p: deckId, a: deckId === "a" ? "b" : "a" }; save(); renderAll(); }
  function resetDeck(deckId) {
    if (!confirm(`把「${DATA.decks[deckId].name}」恢复为预设卡组？当前编辑内容会丢失。`)) return;
    DATA.decks[deckId] = {
      name: PRESETS[deckId].name, attr: PRESETS[deckId].attr, tag: PRESETS[deckId].tag,
      cards: Object.assign({}, PRESETS[deckId].cards)
    };
    save(); renderAll();
  }
  function clearDeck(deckId) {
    if (!confirm(`清空「${DATA.decks[deckId].name}」的全部 ${size(deckId)} 张卡？`)) return;
    DATA.decks[deckId].cards = {};
    save(); renderAll();
  }
  function renameDeck(deckId) {
    const v = prompt("给这套卡组起个名字：", DATA.decks[deckId].name);
    if (v === null) return;
    const name = v.trim().slice(0, 16);
    if (!name) return;
    DATA.decks[deckId].name = name;
    save(); renderAll();
  }

  // ================= 渲染：卡组槽 =================
  function renderSlots() {
    const wrap = $("deck-slots");
    if (!wrap) return;
    wrap.innerHTML = ["a", "b"].map(id => {
      const d = DATA.decks[id], n = size(id), ok = valid(id);
      const isActive = DATA.active === id;
      const role = DATA.pick.p === id ? "你对战使用" : "AI 对战使用";
      return `<div class="deck-slot${isActive ? " on" : ""}" data-id="${id}">
        <div class="ds-top"><b>卡组 ${id.toUpperCase()}</b><span class="ds-role">${role}</span></div>
        <div class="ds-name">${esc(d.name)}</div>
        <div class="ds-meta"><span>${esc(d.attr)}</span><span>·</span><span>${esc(d.tag)}</span></div>
        <div class="ds-bar"><i style="width:${Math.min(100, n / DECK_SIZE * 100)}%"></i></div>
        <div class="ds-foot">
          <span class="${ok ? "ok" : "bad"}">${n} / ${DECK_SIZE}${ok ? "　✓ 可对战" : ""}</span>
          <button class="btn tiny" data-act="edit">${isActive ? "编辑中" : "编辑"}</button>
        </div>
        ${ok ? "" : `<div class="ds-warn">${esc(lockReason(id))}</div>`}
      </div>`;
    }).join("");
    wrap.querySelectorAll(".deck-slot").forEach(el => {
      el.addEventListener("click", () => setActive(el.dataset.id));
    });
  }

  // ================= 渲染：卡池 =================
  let poolFilter = { q: "", attr: null, type: null };
  function renderPool() {
    const wrap = $("deck-pool");
    if (!wrap) return;
    const cur = DATA.decks[DATA.active].cards;
    let list = POOL.filter(c => {
      if (poolFilter.attr && c.attr !== poolFilter.attr) return false;
      if (poolFilter.type && c.type !== poolFilter.type) return false;
      if (poolFilter.q) {
        const hay = [c.name, c.type, c.attr, ...c.factions, ...c.weapons, ...c.text].join(" ").toLowerCase();
        if (!hay.includes(poolFilter.q)) return false;
      }
      return true;
    }).sort((a, b) => costOf(a) - costOf(b) || (b.power || 0) - (a.power || 0));

    wrap.innerHTML = list.map(c => {
      const n = cur[c.id] || 0;
      const full = n >= MAX_COPY;
      return `<div class="dp-tile${n ? " in-deck" : ""}${full ? " capped" : ""}" data-id="${c.id}" title="${esc(c.name)}｜${c.type}·费用${costTxt(c)}·${c.attr}${c.power != null ? "·战力" + c.power : ""}">
        <img src="${c.img}" alt="${esc(c.name)}" loading="lazy">
        <span class="dp-cost">${costTxt(c)}</span>
        <span class="dp-attr" data-attr="${c.attr}">${c.attr}</span>
        ${n ? `<span class="dp-cnt">×${n}</span>` : `<span class="dp-add">＋</span>`}
        <div class="dp-name">${esc(c.name)}</div>
      </div>`;
    }).join("") || `<div class="no-result" style="grid-column:1/-1;padding:40px 0">没有匹配的卡</div>`;

    wrap.querySelectorAll(".dp-tile").forEach(el => {
      el.addEventListener("click", () => addCard(DATA.active, el.dataset.id));
    });
  }

  function renderPoolFilters() {
    const wrap = $("deck-pool-filters");
    if (!wrap) return;
    if (!wrap.dataset.built) {
      wrap.dataset.built = "1";
      wrap.innerHTML = `
        <div class="dpf-row" data-key="attr">
          <span class="fg-label">属性</span>
          ${["全部", "光", "土", "虚"].map(v => `<span class="chip${v === "全部" ? " on" : ""}" data-v="${v}">${v}</span>`).join("")}
        </div>
        <div class="dpf-row" data-key="type">
          <span class="fg-label">类型</span>
          ${["全部", "角色", "事件", "装备"].map(v => `<span class="chip${v === "全部" ? " on" : ""}" data-v="${v}">${v}</span>`).join("")}
        </div>`;
      wrap.querySelectorAll(".dpf-row").forEach(row => {
        row.querySelectorAll(".chip").forEach(chip => {
          chip.addEventListener("click", () => {
            const v = chip.dataset.v === "全部" ? null : chip.dataset.v;
            poolFilter[row.dataset.key] = v;
            row.querySelectorAll(".chip").forEach(c => c.classList.remove("on"));
            chip.classList.add("on");
            renderPool();
          });
        });
      });
      const q = $("deck-pool-search");
      if (q) q.addEventListener("input", e => { poolFilter.q = e.target.value.trim().toLowerCase(); renderPool(); });
    }
  }

  // ================= 渲染：当前卡组 =================
  function renderDeckList() {
    const wrap = $("deck-list");
    if (!wrap) return;
    const d = DATA.decks[DATA.active];
    const ids = Object.keys(d.cards).sort((x, y) => costOf(byId(x)) - costOf(byId(y)) || (byId(y).power || 0) - (byId(x).power || 0));
    if (!ids.length) {
      wrap.innerHTML = `<div class="no-result" style="padding:36px 0;font-size:13px">空卡组 —— 从左侧卡池点选卡牌加入</div>`;
    } else {
      const groups = {};
      ids.forEach(cid => { const k = costTxt(byId(cid)); (groups[k] = groups[k] || []).push(cid); });
      wrap.innerHTML = Object.keys(groups).sort((a, b) => (a === "无" ? 99 : +a) - (b === "无" ? 99 : +b)).map(k =>
        `<div class="dl-group">
          <div class="dl-cost">费用 ${k}<span>${groups[k].reduce((s, cid) => s + d.cards[cid], 0)} 张</span></div>
          <div class="dl-row">${groups[k].map(cid => {
            const c = byId(cid);
            return `<div class="dl-item" data-id="${cid}" title="${esc(c.name)}（点击移除 1 张）">
              <img src="${c.img}" alt="${esc(c.name)}" loading="lazy">
              <span class="dl-n">${d.cards[cid]}</span>
              <div class="dl-name">${esc(c.name)}</div>
            </div>`;
          }).join("")}</div>
        </div>`).join("");
      wrap.querySelectorAll(".dl-item").forEach(el => {
        el.addEventListener("click", () => removeCard(DATA.active, el.dataset.id));
      });
    }
    const n = size(DATA.active), ok = valid(DATA.active);
    const cnt = $("deck-count");
    if (cnt) {
      cnt.innerHTML = `<b class="${ok ? "ok" : "bad"}">${n}</b> / ${DECK_SIZE} 张` +
        (ok ? `　<span class="ok">✓ 符合构筑规则</span>` : `　<span class="bad">${esc(lockReason(DATA.active))}</span>`);
    }
    const nm = $("deck-cur-name");
    if (nm) nm.textContent = d.name;
  }

  function renderCurve() {
    const wrap = $("deck-curve");
    if (!wrap) return;
    const m = deckMeta(DATA.active);
    const costs = ["1", "2", "3", "4", "5"];
    const max = Math.max(1, ...costs.map(k => m.byCost[k] || 0));
    const types = ["角色", "事件", "装备"];
    wrap.innerHTML = `
      <div class="dc-title">费用曲线</div>
      <div class="dc-bars">${costs.map(k => {
        const v = m.byCost[k] || 0;
        return `<div class="dc-bar"><i style="height:${v / max * 100}%"></i><span>${v}</span><b>${k}</b></div>`;
      }).join("")}</div>
      <div class="dc-sum">
        <span>平均战力 <b>${m.avgPower}</b></span>
        ${types.map(t => `<span>${t} <b>${m.byType[t] || 0}</b></span>`).join("")}
      </div>`;
  }

  // ================= 渲染：对战卡组选择器 =================
  function renderPicker() {
    const wrap = $("deck-picker-row");
    if (!wrap) return;
    wrap.innerHTML = ["a", "b"].map(id => {
      const d = DATA.decks[id], n = size(id), ok = valid(id);
      const on = DATA.pick.p === id;
      return `<button class="dpk-btn${on ? " on" : ""}${ok ? "" : " bad"}" data-id="${id}">
        <span class="dpk-k">${on ? "你使用" : "AI 使用"} · 卡组 ${id.toUpperCase()}</span>
        <span class="dpk-name">${esc(d.name)}</span>
        <span class="dpk-meta">${esc(d.attr)} · ${n}/${DECK_SIZE}${ok ? "" : "　未完成"}</span>
      </button>`;
    }).join("");
    wrap.querySelectorAll(".dpk-btn").forEach(el => {
      el.addEventListener("click", () => pickDeck(el.dataset.id));
    });
    const note = $("deck-picker-note");
    if (note) {
      const p = DATA.decks[DATA.pick.p], a = DATA.decks[DATA.pick.a];
      note.innerHTML = `你使用 <b>${esc(p.name)}</b>，AI 使用 <b>${esc(a.name)}</b>（切换卡组会重新开局）`;
    }
  }

  function pickDeck(id) {
    if (DATA.pick.p === id) return;
    if (!valid(id)) { toast(`卡组 ${id.toUpperCase()}「${DATA.decks[id].name}」还不是 40 张合法卡组，先去构筑`); return; }
    const other = id === "a" ? "b" : "a";
    if (!valid(other)) { toast(`另一套卡组 ${other.toUpperCase()}「${DATA.decks[other].name}」尚未完成，AI 无卡组可用`); return; }
    const S = window.GTCG_DEBUG && window.GTCG_DEBUG.S;
    if (S && S.turnCount > 1 && !S.over) {
      if (!confirm(`切换到卡组 ${id.toUpperCase()} 会重新开局，当前对局进度丢失。继续？`)) return;
    }
    setPick(id);
    if (window.GTCG_DEBUG && window.GTCG_DEBUG.newGame) window.GTCG_DEBUG.newGame();
    toast(`已切换：你使用「${DATA.decks[id].name}」`);
  }

  // ================= 汇总渲染 =================
  function renderAll() {
    renderSlots();
    renderPool();
    renderDeckList();
    renderCurve();
    renderPicker();
    if (typeof window.GTCG_DECKS.onChange === "function") window.GTCG_DECKS.onChange();
  }

  // ================= 标签页 =================
  function initTabs() {
    const tabs = $("cards-tabs");
    if (!tabs) return;
    tabs.querySelectorAll(".tab").forEach(t => {
      t.addEventListener("click", () => {
        tabs.querySelectorAll(".tab").forEach(x => x.classList.toggle("on", x === t));
        ["codex", "deck"].forEach(k => {
          const p = $("tab-" + k);
          if (p) p.style.display = (k === t.dataset.tab) ? "" : "none";
        });
      });
    });
  }

  // ================= 编辑区操作按钮 =================
  function initActions() {
    const bind = (id, fn) => { const el = $(id); if (el) el.addEventListener("click", fn); };
    bind("deck-rename", () => renameDeck(DATA.active));
    bind("deck-reset", () => resetDeck(DATA.active));
    bind("deck-clear", () => clearDeck(DATA.active));
    bind("deck-export", () => {
      const d = DATA.decks[DATA.active];
      const lines = [`# ${d.name}（${d.attr}）${size(DATA.active)}/${DECK_SIZE}`];
      Object.keys(d.cards).sort((x, y) => costOf(byId(x)) - costOf(byId(y)))
        .forEach(cid => lines.push(`${byId(cid).name} ×${d.cards[cid]}`));
      const txt = lines.join("\n");
      if (navigator.clipboard) navigator.clipboard.writeText(txt).then(() => toast("卡组清单已复制到剪贴板"), () => prompt("复制卡组清单：", txt));
      else prompt("复制卡组清单：", txt);
    });
  }

  // ================= 对外 API（供 game.js 使用）=================
  window.GTCG_DECKS = {
    DECK_SIZE, MAX_COPY, POOL,
    expand, size, valid, lockReason, deckMeta,
    name: id => (DATA.decks[id] || {}).name || "卡组",
    attr: id => (DATA.decks[id] || {}).attr || "",
    playPick: () => ({ p: DATA.pick.p, a: DATA.pick.a }),
    setPick,
    reset: id => resetDeck(id),
    onChange: null,
    _data: () => DATA,
    _render: renderAll,
    _upgradePresets: raw => upgradePresets(JSON.parse(JSON.stringify(raw))),
    _presets: () => JSON.parse(JSON.stringify(PRESETS)),
    _legacy: () => JSON.parse(JSON.stringify(LEGACY_PRESETS)),
    PRESET_VERSION
  };

  // ================= 启动 =================
  function init() {
    save();                         // 落盘载入/迁移结果
    initTabs();
    initActions();
    renderPoolFilters();
    renderAll();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
