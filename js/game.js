/* GTCG 线上试玩 v2 - 规则 0.1（你 vs AI）
 * 场地拖拽版：按第一弹场地布局，手牌可拖入能量区/场上
 * 依赖 js/cards-data.js
 */
(function () {
  const $ = id => document.getElementById(id);
  const ATTR_NAME = { "光": "光", "土": "土", "虚": "虚" };
  // 阶段：抽牌 → 填能 → 主要 → 战斗（进入下一阶段后不能再做上一阶段的操作）
  const PHASE_NAME = { draw: "抽牌阶段", fill: "填能阶段", main: "主要阶段", battle: "战斗阶段", end: "回合结束" };
  const PHASE_ORDER = ["draw", "fill", "main", "battle"];
  let S = null, uidSeq = 0, busy = false, dragCard = null, dragUnit = null;

  // ================= 牌组与状态 =================
  // 随机兜底牌组（所选卡组缺失/非法时使用）
  function randomDeck() {
    const pool = CARDS.filter(c => c.id !== "card24");
    const deck = [];
    pool.forEach(c => { for (let i = 0; i < 4; i++) deck.push(c); });
    shuffle(deck);
    return deck.slice(0, 40);
  }
  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }
  // 按「我的卡组」构筑发牌；deckId 为空或卡组非法则回退随机
  function buildDeck(deckId) {
    const D = window.GTCG_DECKS;
    if (D && deckId) {
      const list = D.expand(deckId);
      if (list && list.length === D.DECK_SIZE && D.valid(deckId)) {
        const cards = list.map(id => CARDS.find(c => c.id === id)).filter(Boolean);
        if (cards.length === list.length) return shuffle(cards);
      }
    }
    return randomDeck();
  }
  function newSide(name, deckId) {
    const D = window.GTCG_DECKS;
    const legal = D && deckId && D.valid(deckId);
    return {
      name,
      deckId: legal ? deckId : null,
      deckName: legal ? `${D.name(deckId)}（卡组 ${deckId.toUpperCase()}）` : "随机卡组",
      deck: buildDeck(legal ? deckId : null),
      hand: [], field: [], energy: [], discard: [], resonance: 0,
      sword: { onField: false, tapped: false, summonedTurn: -1 },
      turns: 0, filledThisTurn: false
    };
  }
  function newUnit(card) {
    return {
      uid: "u" + (++uidSeq), card, tapped: false, playedTurn: S.turnCount,
      bonus: 0, tmpBuff: 0, dmgTaken: 0, battleBuff: 0,
      raidTurn: null, grantedGuard: false, cannotAttack: false,
      refreshedNoAttack: false, resonanceTurn: null, silenceEquip: false, equipCard: null
    };
  }
  function effPower(u) { return Math.max(0, (u.card.power || 0) + u.bonus + u.tmpBuff + u.battleBuff - u.dmgTaken); }
  function hasGuard(u) { return u.card.keywords.includes("守护") || u.grantedGuard; }
  function hasRaid(u) { return u.card.keywords.includes("突袭") || u.raidTurn === S.turnCount; }
  function canAttack(u, side) {
    if (u.tapped || u.cannotAttack || u.refreshedNoAttack) return false;
    if (u.playedTurn === S.turnCount && u.resonanceTurn !== S.turnCount) return false;
    return true;
  }
  function swordCanAttack(side) { return side.sword && side.sword.onField && !side.sword.tapped && side.sword.summonedTurn !== S.turnCount; }

  // ================= 日志 =================
  function log(msg, cls) {
    const el = $("g-log");
    if (!el) return;
    const d = document.createElement("div");
    d.className = "g-log-line" + (cls ? " " + cls : "");
    d.textContent = msg;
    el.prepend(d);
    while (el.children.length > 60) el.removeChild(el.lastChild);
  }

  // 轻提示（比 alert 柔和，移动端友好）
  let gToastTimer = null;
  function gToast(msg) {
    if (!msg) return;
    let el = document.getElementById("g-toast");
    if (!el) {
      el = document.createElement("div");
      el.id = "g-toast"; el.className = "deck-toast";
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.classList.add("on");
    clearTimeout(gToastTimer);
    gToastTimer = setTimeout(() => el.classList.remove("on"), 1900);
  }

  // ================= 选择弹窗（可被测试钩子接管） =================
  function choose(title, options) {
    if (window.GTCG_AUTO) return Promise.resolve(window.GTCG_AUTO(title, options));
    return new Promise(res => {
      const mask = document.createElement("div");
      mask.className = "modal-mask open";
      const opts = options.map((o, i) => `
        <div class="g-opt" data-i="${i}">
          ${o.img ? `<img src="${o.img}" class="g-opt-img">` : ""}
          <div><b>${o.label}</b>${o.sub ? `<div class="g-opt-sub">${o.sub}</div>` : ""}</div>
        </div>`).join("");
      mask.innerHTML = `<div class="modal col" style="max-width:620px"><h2 style="font-size:20px;color:#fff">${title}</h2><div class="g-opts">${opts}</div></div>`;
      document.body.appendChild(mask);
      mask.querySelectorAll(".g-opt").forEach(el => {
        el.addEventListener("click", () => { mask.remove(); res(options[+el.dataset.i].value); });
      });
    });
  }
  const sleep = ms => new Promise(r => setTimeout(r, window.GTCG_FAST ? 0 : ms));

  // 亮出牌库顶若干张（佩儿检索等）：让玩家真的「看到」检索过程
  // pickable：可选下标数组。长度 >1 时进入「点选」模式，返回玩家选中的下标；否则仅展示，返回 pickedIdx
  function revealModal(title, cards, pickedIdx, pickable) {
    const canPick = Array.isArray(pickable) && pickable.length > 1;
    if (window.GTCG_AUTO) return Promise.resolve(canPick ? pickable[0] : pickedIdx);
    return new Promise(res => {
      const mask = document.createElement("div");
      mask.className = "modal-mask open";
      const picked = pickedIdx >= 0 ? cards[pickedIdx] : null;
      const sub = canPick
        ? `其中共有 <b style="color:var(--gold)">${pickable.length}</b> 张「神威门」卡 —— 请点选其中 <b>1</b> 张加入手牌，其余 ${cards.length - 1} 张置于牌库底`
        : (picked
            ? `其中含有「神威门」卡：<b style="color:var(--gold)">「${picked.name}」</b>加入手牌，其余 ${cards.length - 1} 张置于牌库底`
            : `其中没有「神威门」卡，${cards.length} 张全部按原顺序置于牌库底`);
      mask.innerHTML = `<div class="modal col" style="max-width:660px">
        <h2 style="font-size:19px;margin-bottom:6px;color:#fff">${title}</h2>
        <div class="g-pay-sub">${sub}</div>
        <div class="g-reveal-grid">${cards.map((c, i) => {
          const can = canPick && pickable.includes(i);
          return `<div class="g-reveal-card${i === pickedIdx ? " picked" : ""}${can ? " pickable" : ""}" data-i="${i}"><img src="${c.img}"><div class="g-reveal-name">${c.name}</div>${can ? `<div class="g-reveal-tag">可加入手牌</div>` : ""}</div>`;
        }).join("")}</div>
        <div class="g-pay-foot"><span class="g-pay-count">共翻开 ${cards.length} 张</span><button class="btn primary" id="g-reveal-ok"${canPick ? " disabled" : ""}>确定</button></div>
      </div>`;
      document.body.appendChild(mask);
      const ok = mask.querySelector("#g-reveal-ok");
      let sel = -1;
      if (canPick) {
        mask.querySelectorAll(".g-reveal-card.pickable").forEach(el => {
          el.addEventListener("click", () => {
            mask.querySelectorAll(".g-reveal-card").forEach(x => x.classList.remove("sel"));
            el.classList.add("sel");
            sel = +el.dataset.i;
            ok.disabled = false;
            ok.textContent = "加入手牌";
          });
        });
      }
      ok.addEventListener("click", () => { mask.remove(); res(canPick ? sel : pickedIdx); });
    });
  }

  // ================= 支付费用 =================
  function pickPayment(side, card) {
    if (card.cost === null) return null;
    const free = side.energy.filter(e => !e.tapped);
    if (free.length < card.cost) return null;
    let picked = [];
    if (card.attr !== "无") {
      const match = free.find(e => e.card.attr === card.attr);
      if (!match) return null;
      picked.push(match);
    }
    for (const e of free) {
      if (picked.length >= card.cost) break;
      if (!picked.includes(e)) picked.push(e);
    }
    return picked;
  }
  function tryPay(side, card) {
    const picked = pickPayment(side, card);
    if (!picked) return null;
    picked.forEach(e => e.tapped = true);
    return picked;
  }
  function canPay(side, card) { return !!pickPayment(side, card); }

  // 让玩家自己挑横置哪几张能量卡（避免系统自动把想留的能量卡掉）
  function choosePayment(side, card) {
    if (window.GTCG_AUTO) return Promise.resolve(pickPayment(side, card));
    const free = side.energy.filter(e => !e.tapped);
    if (card.cost === null || !pickPayment(side, card)) return Promise.resolve(null);
    const needAttr = card.attr && card.attr !== "无" ? card.attr : null;
    return new Promise(res => {
      const mask = document.createElement("div");
      mask.className = "modal-mask open";
      mask.innerHTML = `<div class="modal col" style="max-width:680px">
        <h2 style="font-size:19px;margin-bottom:6px;color:#fff">支付费用 · ${card.name}</h2>
        <div class="g-pay-sub">费用 <b>${card.cost}</b> · 属性 <b>${card.attr}</b>${needAttr
          ? ` —— 请点选 ${card.cost} 张能量横置支付，其中至少 1 张为 <b>【${needAttr}】</b>属性`
          : ` —— 请点选 ${card.cost} 张能量横置支付`}</div>
        <div class="g-pay-grid">${free.map((e, i) => `<div class="g-pay-tile" data-i="${i}" title="${e.card.name}｜属性${e.card.attr}"><img src="${e.card.img}"><span class="g-pay-attr${needAttr === e.card.attr ? " match" : ""}">${e.card.attr}</span><span class="g-pay-name">${e.card.name}</span></div>`).join("")}</div>
        <div class="g-pay-foot">
          <span id="g-pay-count" class="g-pay-count">已选 0 / ${card.cost}</span>
          <span><button class="btn" id="g-pay-cancel">取消</button> <button class="btn primary" id="g-pay-ok" disabled>确认支付</button></span>
        </div>
      </div>`;
      document.body.appendChild(mask);
      const sel = [];
      const tiles = [...mask.querySelectorAll(".g-pay-tile")];
      const okBtn = mask.querySelector("#g-pay-ok");
      const cnt = mask.querySelector("#g-pay-count");
      const refresh = () => {
        const enough = sel.length === card.cost;
        const attrOk = !needAttr || sel.some(e => e.card.attr === needAttr);
        okBtn.disabled = !(enough && attrOk);
        cnt.textContent = `已选 ${sel.length} / ${card.cost}` + (enough && !attrOk ? `（还需 1 张【${needAttr}】）` : "");
      };
      tiles.forEach(t => t.addEventListener("click", () => {
        const e = free[+t.dataset.i];
        const at = sel.indexOf(e);
        if (at >= 0) { sel.splice(at, 1); t.classList.remove("sel"); }
        else if (sel.length < card.cost) { sel.push(e); t.classList.add("sel"); }
        refresh();
      }));
      mask.querySelector("#g-pay-cancel").addEventListener("click", () => { mask.remove(); res(null); });
      okBtn.addEventListener("click", () => { mask.remove(); sel.forEach(e => e.tapped = true); res(sel.slice()); });
    });
  }
  // 统一支付入口：AI/测试自动挑，玩家手动点选
  async function payFor(side, card, isAI) {
    if (isAI || window.GTCG_AUTO) return tryPay(side, card);
    return choosePayment(side, card);
  }

  // ================= 场面结算 =================
  function destroy(unit, side) {
    const i = side.field.indexOf(unit);
    if (i >= 0) side.field.splice(i, 1);
    side.discard.push(unit.card);
    if (unit.equipCard) side.discard.push(unit.equipCard);
    log(`${side.name} 的「${unit.card.name}」被击破`);
  }
  function addResonance(side, n) {
    if (side.resonance >= 12) return;
    side.resonance = Math.min(12, side.resonance + n);
    log(`💥 ${side.name} 命中对方本体，共鸣值 +1（${side.resonance}/12）`, "g-hot");
    if (side.resonance >= 12 && !side.sword.onField) {
      side.sword.onField = true;
      side.sword.tapped = false;
      side.sword.summonedTurn = S.turnCount;
      log(`✨ 共鸣值满 12 ——「冠军之剑」从 EX ZONE 移至 ${side.name} 的战场！（当回合不能攻击）`, "g-hot");
    }
    render();
  }
  function cleanupTurnEnd(side) {
    // 本回合内被降低／提升的战力（含反伤）在回合结束时恢复——**双方都恢复**，
    // 例如：AI 的回合里你守护挨了 2500，回合结束（轮到你时）就变回原战力。
    [S.p, S.a].forEach(s => s.field.forEach(u => { u.tmpBuff = 0; u.dmgTaken = 0; u.battleBuff = 0; }));
    side.field.forEach(u => {
      u.raidTurn = null; u.refreshedNoAttack = false;
      if (u.silenceEquip && u.resonanceTurn !== null && u.tapped) {
        u.tapped = false; u.refreshedNoAttack = true;
        log(`「沉默」[共鸣中]：「${u.card.name}」回合结束重整（本回合不能攻击）`);
      }
      u.resonanceTurn = null;
    });
  }

  // ================= 战斗 =================
  async function declareAttack(atkSide, defSide, atkUnit, target) {
    if (S.over) return;
    if (atkSide === S.p && S.phase !== "battle") { log("只有在战斗阶段才能发起攻击（先进主要阶段再进入战斗阶段）"); return; }
    log(`${atkSide.name} 的「${atkUnit.card.name}」宣告攻击 ${target === "player" ? "本体" : "「" + target.card.name + "」"}`);
    const used = await askResponse(defSide, atkUnit, atkSide);
    if (used) { atkUnit.tapped = true; log("攻击被[响应]打断，攻击者横置。"); render(); return; }

    let blocker = null;
    const targetIsGuardItself = target !== "player" && hasGuard(target) && !target.tapped;
    if (!targetIsGuardItself) blocker = await askGuard(defSide, atkUnit, target, atkSide);
    atkUnit.tapped = true;
    render();

    if (atkUnit.isSword) {
      if (blocker) {
        log(`「${blocker.card.name}」阻挡冠军之剑——阻挡者必死！`, "g-hot");
        destroy(blocker, defSide);
      } else {
        endGame(atkSide, "冠军之剑命中本体！");
      }
      render(); return;
    }
    if (blocker) {
      await battle(atkUnit, atkSide, blocker, defSide, true);
      if (defSide.field.includes(blocker)) blocker.tapped = true;
      render(); return;
    }
    if (target === "player") {
      addResonance(atkSide, 1);
    } else {
      await battle(atkUnit, atkSide, target, defSide, false);
    }
    render();
  }
  async function battle(atkUnit, atkSide, defUnit, defSide, isGuard) {
    if (atkUnit.card.id === "card02") { atkUnit.battleBuff += 2000; log(`「梅儿」[攻击时]：战力+2000（此次战斗）`); }
    if (isGuard && defUnit.card.id === "card10") { defUnit.battleBuff += 3000; log(`「克雷格」[守护时]：战力+3000（此次战斗）`); }
    if (atkUnit.equipCard && atkUnit.equipCard.id === "card13") {
      defUnit.tmpBuff -= 1000;
      log(`「利贝拉」[攻击时]：「${defUnit.card.name}」本回合战力-1000`);
    }
    const ap = effPower(atkUnit), dp = effPower(defUnit);
    log(`⚔ 战斗结算：${ap} vs ${dp}`);
    if (ap > dp) {
      atkUnit.dmgTaken += dp;
      destroy(defUnit, defSide);
      log(`「${atkUnit.card.name}」获胜，反伤：本回合战力变为 ${effPower(atkUnit)}（回合结束恢复）`);
      if (effPower(atkUnit) <= 0) destroy(atkUnit, atkSide);
    } else if (dp > ap) {
      defUnit.dmgTaken += ap;
      destroy(atkUnit, atkSide);
      log(`「${defUnit.card.name}」获胜，反伤：本回合战力变为 ${effPower(defUnit)}`);
      if (effPower(defUnit) <= 0) destroy(defUnit, defSide);
    } else {
      log(`平点（${ap} vs ${dp}）！双方同归于尽。`, "g-hot");
      destroy(defUnit, defSide); destroy(atkUnit, atkSide);
    }
  }

  // ================= 响应 / 守护 =================
  async function askResponse(defSide, atkUnit, atkSide) {
    const idx = defSide.hand.findIndex(c => c.id === "card21");
    if (idx < 0 || !canPay(defSide, defSide.hand[idx])) return false;
    if (defSide === S.a) {
      if (effPower(atkUnit) >= 2500) {
        const card = defSide.hand[idx];
        tryPay(defSide, card);
        defSide.hand.splice(idx, 1); defSide.discard.push(card);
        log(`AI 使用[响应]「让人想要哭泣的场景」！`); return true;
      }
      return false;
    }
    const use = await choose(`AI 的「${atkUnit.card.name}」宣告攻击！是否使用[响应]「让人想要哭泣的场景」（费用2·虚）使其横置、取消这次攻击？`, [
      { label: "使用响应卡（支付 2 费·至少 1 张虚）", value: true },
      { label: "不使用", value: false }
    ]);
    if (use) {
      const card = defSide.hand[idx];
      const paid = await payFor(defSide, card, false);
      if (!paid) return false;
      defSide.hand.splice(idx, 1); defSide.discard.push(card);
      log(`你使用[响应]「让人想要哭泣的场景」！`); return true;
    }
    return false;
  }
  async function askGuard(defSide, atkUnit, target, atkSide) {
    const guards = defSide.field.filter(u => hasGuard(u) && !u.tapped);
    if (!guards.length) return null;
    if (defSide === S.a) {
      if (atkUnit.isSword) return null; // 挡剑必死，AI 不挡
      const ap = effPower(atkUnit) + (atkUnit.card.id === "card02" ? 2000 : 0);
      if (target === "player") {
        const g = guards.find(u => effPower(u) + (u.card.id === "card10" ? 3000 : 0) > ap);
        if (g) { log(`AI 用「${g.card.name}」守护！`); return g; }
      }
      return null;
    }
    const opts = guards.map(u => ({
      label: `「${u.card.name}」（战力 ${effPower(u)}）`,
      sub: "与攻击者比战力（含反伤），守护后横置；一回合只能守护一次",
      img: u.card.img, value: u
    }));
    opts.push({ label: "不守护，硬吃这次攻击", value: null });
    const g = await choose(`${atkSide.name} 的「${atkUnit.card.name}」（战力 ${effPower(atkUnit)}${atkUnit.isSword ? " · 冠军之剑" : ""}）攻击${target === "player" ? "你的本体" : "你的「" + target.card.name + "」"}——用谁守护？`, opts);
    if (g) log(`你用「${g.card.name}」守护！`);
    return g;
  }

  // ================= 出牌 =================
  function equipOk(u, card) {
    if (card.exclusiveTo) return u.card.name === card.exclusiveTo;
    return u.card.weapons.includes(card.weapons[0]) || u.card.keywords.includes("泛用");
  }
  async function playCard(side, card, isAI, presetTarget) {
    if (side === S.p && S.phase !== "main") { log("只有在主要阶段才能出牌（填能阶段请先拖入费用区或点「跳过填能」）"); return false; }
    if (!(await payFor(side, card, isAI))) return false;
    side.hand.splice(side.hand.indexOf(card), 1);
    // 掌门陶禹：使用「神威门」卡牌时抽 1 张
    // 静态效果，检查的是「支付完成、卡牌尚未结算」这一刻已经在场的陶禹，故本次登场的陶禹自身不会触发自己
    if ((card.factions || []).includes("神威门")) {
      side.field.filter(u => u.card.id === "card03").forEach(() => {
        drawCards(side, 1);
        log(`${side.name}的「掌门陶禹」：使用「${card.name}」→ 抽 1 张`, "g-hot");
      });
    }
    if (card.type === "角色") {
      const u = newUnit(card);
      side.field.push(u);
      log(`${side.name} 登场「${card.name}」（战力 ${effPower(u)}，当回合不能攻击）`);
      await onEnter(side, u, isAI);
    } else if (card.type === "装备") {
      let bearer = presetTarget;
      if (!bearer) {
        const targets = side.field.filter(u => equipOk(u, card));
        if (!targets.length) { side.discard.push(card); log(`「${card.name}」没有可装备对象，进废弃区`); return true; }
        bearer = await choose(`「${card.name}」装备给谁？`, targets.map(u => ({
          label: `「${u.card.name}」`, sub: `战力 ${effPower(u)} → ${effPower(u) + (card.power || 0) + (u.card.id === "card09" ? 500 : 0)}`, img: u.card.img, value: u
        })));
      }
      applyEquip(side, bearer, card);
    } else if (card.type === "事件") {
      log(`${side.name} 使用事件「${card.name}」`);
      await resolveEvent(side, card, isAI);
      side.discard.push(card);
    }
    render();
    return true;
  }
  function applyEquip(side, bearer, card) {
    bearer.equipCard = card;
    bearer.bonus += card.power || 0;
    if (bearer.card.id === "card09") { bearer.bonus += 500; log(`「蠢脸骑士」装备武器：力量+500`); }
    if (card.exclusiveTo && bearer.card.name === card.exclusiveTo) {
      bearer.resonanceTurn = S.turnCount;
      log(`⚡ 「${card.name}」×「${bearer.card.name}」共鸣！当回合即可攻击`, "g-hot");
      if (card.id === "card13") { log(`「利贝拉」[共鸣时]：获得 1 点共鸣值`); addResonance(side, 1); }
      if (card.id === "card15") bearer.silenceEquip = true;
    }
    log(`${side.name} 装备「${card.name}」→「${bearer.card.name}」`);
  }
  async function onEnter(side, u, isAI) {
    const id = u.card.id;
    if (id === "card08") { u.cannotAttack = true; drawCards(side, 1); log(`「青叶」[登场时]：抽 1 张（此角色不能攻击）`); }
    if (id === "card01") {
      const top = side.deck.splice(0, Math.min(5, side.deck.length));
      const picks = top.map((c, k) => ({ c, k })).filter(x => x.c.factions.includes("神威门"));
      const many = picks.length > 1;
      // 只有 1 张→直接取；多张→玩家点选（AI/测试走取第一张）
      let i = picks.length ? picks[0].k : -1;
      if (many && !isAI && !window.GTCG_AUTO) {
        i = await revealModal("「佩儿」[登场时]：查看你的牌库顶 —— 请选择加入手牌的「神威门」卡", top, -1, picks.map(x => x.k));
      }
      if (i >= 0) {
        const got = top[i];
        side.hand.push(got);
        side.deck.push(...top.filter((_, k) => k !== i));
        log(`「佩儿」[登场时]：查看牌库顶 ${top.length} 张${many ? `（其中 ${picks.length} 张「神威门」卡）` : ""} → 将「${got.name}」加入手牌，其余 ${top.length - 1} 张置于牌库底`, "g-hot");
      } else {
        side.deck.push(...top);
        log(`「佩儿」[登场时]：查看牌库顶 ${top.length} 张（${top.map(c => c.name).join("、")}）——其中没有「神威门」卡，全部置于牌库底`);
      }
      // 无匹配 / 仅 1 张时用展示弹窗亮牌；多张时上面的点选弹窗已经把 5 张牌都亮过了
      if (!isAI && !many) await revealModal("「佩儿」[登场时]：查看你的牌库顶", top, i);
      render();
    }
    if (id === "card07") {
      const top = side.deck.splice(0, Math.min(3, side.deck.length));
      if (top.length) {
        let pick;
        if (isAI || window.GTCG_AUTO) { top.sort((a, b) => (b.cost ?? 0) - (a.cost ?? 0)); pick = top.shift(); }
        else {
          const sel = await choose("「旅馆老板娘」[登场时]：从牌库顶3张选1张加入手牌", top.map(c => ({ label: c.name, sub: `${c.type}·费用${c.cost ?? "-"}·${c.attr}`, img: c.img, value: c })));
          pick = sel; top.splice(top.indexOf(sel), 1);
        }
        side.hand.push(pick); side.deck.unshift(...top);
        log(`「旅馆老板娘」[登场时]：从牌库顶3张取 1 张`);
      }
    }
    if (id === "card06" || id === "card23") {
      const others = side.field.filter(x => x !== u);
      if (others.length) {
        let t;
        if (isAI || window.GTCG_AUTO) t = others.sort((a, b) => effPower(b) - effPower(a))[0];
        else {
          const isRaid = id === "card06";
          const sel = await choose(isRaid ? "「工程师玛丽安」[登场时]：使一名其他角色本回合获得[突袭]" : "「骑士团长伊娃」[登场时]：使一名其他角色获得[守护]（永久）",
            others.map(x => ({ label: x.card.name, sub: `战力 ${effPower(x)}`, img: x.card.img, value: x })));
          t = sel;
        }
        if (id === "card06") { t.raidTurn = S.turnCount; log(`「玛丽安」[登场时]：「${t.card.name}」本回合获得[突袭]`); }
        else { t.grantedGuard = true; log(`「伊娃」[登场时]：「${t.card.name}」获得[守护]（永久）`); }
      }
    }
  }
  async function resolveEvent(side, card, isAI) {
    const id = card.id;
    if (id === "card16") {
      drawCards(side, 2);
      const foes = opp(side).field;
      if (foes.length) {
        let t;
        if (isAI || window.GTCG_AUTO) t = foes.sort((a, b) => effPower(b) - effPower(a))[0];
        else {
          const sel = await choose("「霸王冰焰弹」：选择对方 1 名角色击破", foes.map(x => ({ label: x.card.name, sub: `战力 ${effPower(x)}`, img: x.card.img, value: x })));
          t = sel;
        }
        log(`「霸王冰焰弹」击破「${t.card.name}」！`, "g-hot");
        destroy(t, opp(side));
      }
    }
    if (id === "card17") { side.field.forEach(u => u.tmpBuff += 1000); log(`己方全体本回合战力+1000`); }
    if (id === "card22") { opp(side).field.forEach(u => u.tmpBuff -= 2000); log(`对方全体本回合战力-2000`); }
    if (id === "card18") {
      drawCards(side, 2);
      if (side.hand.length) {
        let c;
        if (isAI || window.GTCG_AUTO) c = [...side.hand].sort((a, b) => (a.cost ?? 0) - (b.cost ?? 0))[0];
        else {
          const sel = await choose("「塞西尔的演唱会」：弃置 1 张手牌", side.hand.map(x => ({ label: x.name, sub: `${x.type}·费用${x.cost ?? "-"}`, img: x.img, value: x })));
          c = sel;
        }
        side.hand.splice(side.hand.indexOf(c), 1); side.discard.push(c);
        log(`弃置「${c.name}」`);
      }
    }
    if (id === "card19") {
      if (!side.discard.length) return;
      let c;
      if (isAI || window.GTCG_AUTO) c = [...side.discard].sort((a, b) => (b.cost ?? 0) - (a.cost ?? 0))[0];
      else {
        const sel = await choose("「她一定会喜欢的」：从废弃区选 1 张置入能量区", side.discard.map(x => ({ label: x.name, sub: `${x.type}·费用${x.cost ?? "-"}·${x.attr}`, img: x.img, value: x })));
        c = sel;
      }
      side.discard.splice(side.discard.indexOf(c), 1);
      side.energy.push({ card: c, tapped: false });
      log(`「${c.name}」从废弃区置入能量区`);
    }
    if (id === "card20") {
      if (side.field.length) {
        let t;
        if (isAI || window.GTCG_AUTO) t = side.field.find(u => u.dmgTaken > 0) || [...side.field].sort((a, b) => effPower(b) - effPower(a))[0];
        else {
          const sel = await choose("「我只是路过」：将己方 1 名角色返回手牌", side.field.map(x => ({ label: x.card.name, sub: `战力 ${effPower(x)}（装备进废弃区）`, img: x.card.img, value: x })));
          t = sel;
        }
        side.field.splice(side.field.indexOf(t), 1);
        if (t.equipCard) side.discard.push(t.equipCard);
        side.hand.push(t.card);
        log(`「${t.card.name}」返回手牌`);
      }
      drawCards(side, 1);
    }
    if (id === "card21") {
      const foes = opp(side).field.filter(u => !u.tapped);
      if (foes.length) {
        let t;
        if (isAI || window.GTCG_AUTO) t = foes.sort((a, b) => effPower(b) - effPower(a))[0];
        else {
          const sel = await choose("「让人想要哭泣的场景」：使对手 1 名角色疲劳", foes.map(x => ({ label: x.card.name, sub: `战力 ${effPower(x)}`, img: x.card.img, value: x })));
          t = sel;
        }
        t.tapped = true;
        log(`「${t.card.name}」疲劳`);
      }
    }
  }
  function drawCards(side, n) {
    for (let i = 0; i < n; i++) {
      if (!side.deck.length) { endGame(opp(side), `${side.name} 必须抽牌但牌库已空`); return; }
      side.hand.push(side.deck.shift());
    }
  }
  function opp(side) { return side === S.p ? S.a : S.p; }
  function endGame(winner, reason) {
    S.over = true; busy = false;
    log(`🏆 ${winner.name} 获胜！${reason}`, "g-hot");
    const lbl = $("g-turn-label");
    if (lbl) lbl.innerHTML = `<span style="color:var(--gold);font-size:20px;font-weight:800">🏆 ${winner.name} 获胜！${reason}</span>`;
    const btn = $("g-end"); if (btn) btn.disabled = true;
  }

  // ================= 能量填充 =================
  function fillEnergy(side, card) {
    if (side === S.p && !(S.active === S.p && S.phase === "fill")) { log("填能只能在填能阶段进行（一旦进入主要阶段，本回合不能再填能）"); return false; }
    if (side.filledThisTurn) { log(`本回合已经填过能量了（每回合最多 1 张）`); return false; }
    side.hand.splice(side.hand.indexOf(card), 1);
    side.energy.push({ card, tapped: false });
    side.filledThisTurn = true;
    log(`${side.name} 将「${card.name}」填入能量区（本回合已填）`);
    // 玩家填能后自动进入下一个阶段（主要阶段）
    if (side === S.p && S.phase === "fill") {
      S.phase = "main";
      log("→ 填能完成，自动进入【主要阶段】可任意出牌", "g-turn");
    }
    render();
    return true;
  }

  // ================= AI =================
  function aiFillEnergy() {
    const s = S.a;
    if (s.filledThisTurn || !s.hand.length) return;
    [...s.hand].sort((a, b) => (b.cost ?? 0) - (a.cost ?? 0));
    const c = [...s.hand].sort((a, b) => (b.cost ?? 0) - (a.cost ?? 0))[0];
    s.hand.splice(s.hand.indexOf(c), 1);
    s.energy.push({ card: c, tapped: false });
    s.filledThisTurn = true;
    log(`AI 填 1 张能量`);
  }
  async function aiMain() {
    const s = S.a;
    let acted = true, guard = 0;
    while (acted && guard++ < 20) {
      acted = false;
      const playable = s.hand.filter(c => canPay(s, c)).sort((a, b) => (b.cost ?? 0) - (a.cost ?? 0));
      for (const c of playable) {
        if (c.type === "事件") {
          if (c.id === "card17" || c.id === "card22") {
            if (s.field.some(u => canAttack(u, s))) { await playCard(s, c, true); acted = true; break; }
          } else if (c.id === "card16") {
            if (S.p.field.length) { await playCard(s, c, true); acted = true; break; }
          } else if (c.id === "card19") {
            if (s.discard.some(dc => (dc.cost ?? 0) >= 3) && s.energy.length < 6) { await playCard(s, c, true); acted = true; break; }
          } else if (c.id === "card18") {
            if (s.deck.length >= 3) { await playCard(s, c, true); acted = true; break; }
          } else if (c.id === "card20") {
            if (s.field.some(u => u.dmgTaken > 0 || u.tapped)) { await playCard(s, c, true); acted = true; break; }
          } else if (c.id === "card21") { /* 留作响应 */ }
        } else if (c.type === "角色") { await playCard(s, c, true); acted = true; break; }
        else if (c.type === "装备") {
          const bearer = s.field.find(u => equipOk(u, c));
          if (bearer) { await playCard(s, c, true, bearer); acted = true; break; }
        }
      }
    }
  }
  async function aiBattle() {
    const s = S.a;
    for (const u of [...s.field]) {
      if (S.over) return;
      if (!canAttack(u, s) || u.tapped) continue;
      let target = "player";
      const candidates = hasRaid(u) ? S.p.field.filter(t => !t.cannotAttack) : S.p.field.filter(t => t.tapped);
      const ap = effPower(u) + (u.card.id === "card02" ? 2000 : 0);
      const winnable = candidates.filter(t => ap > effPower(t));
      if (winnable.length) target = winnable.sort((a, b) => effPower(b) - effPower(a))[0];
      await declareAttack(s, S.p, u, target);
      if (S.over) return;
      if (!window.GTCG_FAST) await sleep(500);
    }
    if (!S.over && swordCanAttack(s)) {
      await declareAttack(s, S.p, { isSword: true, card: { name: "冠军之剑" }, uid: "sword" }, "player");
    }
  }

  // ================= 开局：开始战斗 + 掷骰定先手 =================
  // 骰面点数分布（9 格中的哪几格有圆点）
  const DIE_PIPS = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
  function dieHtml(v) {
    const pips = DIE_PIPS[v] || [];
    return `<div class="die">` + Array.from({ length: 9 }, (_, i) => `<i class="${pips.indexOf(i) >= 0 ? "on" : ""}"></i>`).join("") + `</div>`;
  }
  // 掷骰：双方各一颗，保证不出现平局（平局则重掷）
  function rollDice(force) {
    const rnd = () => 1 + Math.floor(Math.random() * 6);
    let p, a;
    if (force === "p") { p = 6; a = 1 + Math.floor(Math.random() * 5); }
    else if (force === "a") { a = 6; p = 1 + Math.floor(Math.random() * 5); }
    else { do { p = rnd(); a = rnd(); } while (p === a); }
    return { p, a, first: p > a ? "p" : "a" };
  }
  // 掷骰动画弹窗：摇一摇 → 定格 → 点「开始对局」继续
  function diceModal(res) {
    if (window.GTCG_AUTO) return Promise.resolve();
    return new Promise(resolve => {
      const mask = document.createElement("div");
      mask.className = "modal-mask open";
      mask.innerHTML = `<div class="modal col dice-modal">
        <h2 style="font-size:20px;color:#fff">🎲 掷骰定先手</h2>
        <div class="g-pay-sub">双方各掷一颗骰子，点数大的一方先手；<b>先手第一回合不抽牌</b>，后手第一回合抽 1 张。</div>
        <div class="dice-row">
          <div class="dice-side"><div class="dice-who">你</div><div id="die-p">${dieHtml(res.p)}</div></div>
          <div class="dice-vs">VS</div>
          <div class="dice-side"><div class="dice-who">AI</div><div id="die-a">${dieHtml(res.a)}</div></div>
        </div>
        <div class="dice-result" id="dice-result">掷骰中…</div>
        <div class="g-pay-foot"><span class="g-pay-count" id="dice-count">…</span><button class="btn primary" id="dice-ok" disabled>开始对局</button></div>
      </div>`;
      document.body.appendChild(mask);
      const dp = mask.querySelector("#die-p"), da = mask.querySelector("#die-a");
      const resultEl = mask.querySelector("#dice-result"), okBtn = mask.querySelector("#dice-ok"), cntEl = mask.querySelector("#dice-count");
      const spin = setInterval(() => {
        dp.innerHTML = dieHtml(1 + Math.floor(Math.random() * 6));
        da.innerHTML = dieHtml(1 + Math.floor(Math.random() * 6));
      }, 70);
      setTimeout(() => {
        clearInterval(spin);
        dp.innerHTML = dieHtml(res.p); da.innerHTML = dieHtml(res.a);
        const youWin = res.first === "p";
        resultEl.innerHTML = `你 <b class="${youWin ? "win" : ""}">${res.p}</b> : <b class="${youWin ? "" : "win"}">${res.a}</b> AI —— <span class="${youWin ? "win" : "lose"}">${youWin ? "你先手！" : "AI 先手"}</span>`;
        cntEl.textContent = youWin ? "你执先手 · 第一回合不抽牌" : "AI 执先手 · 你第一回合抽 1 张";
        okBtn.disabled = false;
        okBtn.addEventListener("click", () => { mask.remove(); resolve(); });
      }, window.GTCG_FAST ? 5 : 900);
    });
  }
  // 开始战斗：掷骰 → 先手方开始回合（AI 先手则接着自动行动）
  async function startBattle(force) {
    if (!S || S.started || S.over || busy) return false;
    busy = true; render();
    const res = rollDice(force);
    await diceModal(res);
    S.started = true;
    S.firstSide = res.first;
    log(`🎲 掷骰：你 ${res.p} 点，AI ${res.a} 点 —— ${res.first === "p" ? "你" : "AI"}先手（先手第一回合不抽牌）。`, "g-hot");
    render();
    const first = res.first === "p" ? S.p : S.a;
    await startTurn(first);
    if (res.first === "p") { busy = false; render(); }
    else { await aiTurn(); }   // aiTurn 结束时会把 busy 复位
    return true;
  }

  // ================= 回合流程（阶段制：抽牌 → 填能 → 主要 → 战斗） =================
  async function startTurn(side) {
    S.turnCount++;
    side.turns++;
    S.active = side;
    S.phase = "draw";
    side.filledThisTurn = false;
    side.energy.forEach(e => e.tapped = false);
    side.field.forEach(u => { u.tapped = false; });
    if (side.sword.onField) side.sword.tapped = false;
    log(`—— ${side.name} 的回合（第 ${side.turns} 回合）——`, "g-turn");
    if (S.turnCount > 1) drawCards(side, 1);   // 先手第一回合不抽牌；后手第一回合抽 1 张
    S.phase = "fill";
    if (side === S.p) log(`【填能阶段】可拖 1 张手牌到费用区填入，或点右下按钮跳过填能直接进入主要阶段`, "g-hot");
    render();
  }
  // 推进到下一阶段（跳过当前阶段）
  async function nextPhase() {
    if (S.over || busy || S.active !== S.p) return;
    if (S.phase === "fill") {
      if (!S.p.filledThisTurn) log("跳过填能阶段——本回合不能再填能量了");
      S.phase = "main";
      log("→ 进入【主要阶段】可任意出牌（费用够就能用）", "g-turn");
      render();
    } else if (S.phase === "main") {
      S.phase = "battle";
      log("→ 进入【战斗阶段】拖动己方角色发起攻击", "g-turn");
      render();
    } else if (S.phase === "battle") {
      await endTurn();
    }
  }
  async function endTurn() {
    if (S.over || S.active !== S.p) return;
    busy = true;
    cleanupTurnEnd(S.p);
    S.phase = "end";
    render();
    await sleep(500);
    await startTurn(S.a);
    if (S.over) { busy = false; return; }
    await aiTurn();
  }
  async function aiTurn() {
    if (S.over) { busy = false; return; }
    await sleep(600);
    S.phase = "fill"; render();
    aiFillEnergy(); render();
    await sleep(600);
    S.phase = "main"; render();
    await aiMain(); if (S.over) { busy = false; return; }
    await sleep(500);
    S.phase = "battle"; render();
    await aiBattle(); if (S.over) { busy = false; return; }
    await sleep(400);
    cleanupTurnEnd(S.a);
    await startTurn(S.p);
    busy = false;
    render();
  }

  // ================= 渲染（增量更新：不重建已存在的卡图，避免整场闪屏） =================
  const memoHTML = {};
  function clearMemo() { for (const k in memoHTML) delete memoHTML[k]; }
  // 整块 HTML 更新，内容没变就完全不动 DOM
  function setHTML(id, html) {
    const el = $(id); if (!el) return;
    if (memoHTML[id] === html) return;
    el.innerHTML = html; memoHTML[id] = html;
  }
  // 牌库/废弃区：图片与数字分别增量更新（抽牌只改数字，不重建卡图）
  function setPile(id, src, num, emptyLabel) {
    const box = $(id); if (!box) return;
    let img = box.querySelector("img.g-pile-img"), label = box.querySelector("div.g-zone-empty");
    if (src) {
      if (label) label.remove();
      if (!img) { img = document.createElement("img"); img.className = "g-pile-img"; box.insertBefore(img, box.firstChild); }
      if (img.getAttribute("src") !== src) img.setAttribute("src", src);
    } else {
      if (img) img.remove();
      if (!label) { label = document.createElement("div"); label.className = "g-zone-empty"; box.insertBefore(label, box.firstChild); label.textContent = emptyLabel; }
      else if (label.textContent !== emptyLabel) label.textContent = emptyLabel;
    }
    let numEl = box.querySelector("div.g-pile-num");
    if (!numEl) { numEl = document.createElement("div"); numEl.className = "g-pile-num"; box.appendChild(numEl); }
    if (numEl.textContent !== String(num)) numEl.textContent = num;
  }
  // 键控同步：按 key 复用已有 DOM，只增删变化的那几张（已存在的卡图不会被重建 → 不闪）
  function syncKeyed(id, items, emptyHtml) {
    const box = $(id); if (!box) return;
    const keep = new Set(items.map(i => i.key));
    [...box.children].forEach(ch => { if (ch.dataset.key && !keep.has(ch.dataset.key)) ch.remove(); });
    const byKey = new Map();
    [...box.children].forEach(ch => { if (ch.dataset.key) byKey.set(ch.dataset.key, ch); });
    let prev = null;
    items.forEach(it => {
      let el = byKey.get(it.key);
      if (!el) {
        const tpl = document.createElement("template");
        tpl.innerHTML = it.html.trim();
        el = tpl.content.firstElementChild;
        el.dataset.key = it.key; el.dataset.sig = it.sig;
        box.insertBefore(el, prev ? prev.nextSibling : box.firstChild);
        if (it.bind) it.bind(el);
      } else {
        if (el.className !== it.cls) el.className = it.cls;
        if (el.dataset.sig !== it.sig) { el.innerHTML = it.inner; el.dataset.sig = it.sig; }
        if (it.attrs) for (const k in it.attrs) if (el.getAttribute(k) !== it.attrs[k]) el.setAttribute(k, it.attrs[k]);
        const want = prev ? prev.nextSibling : box.firstChild;
        if (want !== el) box.insertBefore(el, want);
      }
      prev = el;
    });
    const ph = box.querySelector(".g-zone-empty");
    if (!items.length) { if (!ph) box.innerHTML = emptyHtml; }
    else if (ph) ph.remove();
  }
  // 能量区等纯 img 区域
  function syncCards(id, list, emptyHtml) {
    const box = $(id); if (!box) return;
    const keep = new Set(list.map(i => i.key));
    [...box.children].forEach(ch => { if (ch.dataset.key && !keep.has(ch.dataset.key)) ch.remove(); });
    const byKey = new Map();
    [...box.children].forEach(ch => { if (ch.dataset.key) byKey.set(ch.dataset.key, ch); });
    let prev = null;
    list.forEach(it => {
      let el = byKey.get(it.key);
      if (!el) { el = document.createElement("img"); el.dataset.key = it.key; box.insertBefore(el, prev ? prev.nextSibling : box.firstChild); }
      else { const want = prev ? prev.nextSibling : box.firstChild; if (want !== el) box.insertBefore(el, want); }
      if (el.getAttribute("src") !== it.src) el.setAttribute("src", it.src);
      if (el.className !== it.cls) el.className = it.cls;
      if (el.title !== it.title) el.title = it.title;
      prev = el;
    });
    const ph = box.querySelector(".g-zone-empty");
    if (!list.length) { if (!ph) box.innerHTML = emptyHtml; }
    else if (ph) ph.remove();
  }
  function unitItem(u, mine) {
    const p = effPower(u);
    const badges = [];
    if (hasGuard(u)) badges.push("守护");
    if (hasRaid(u)) badges.push("突袭");
    if (u.cannotAttack) badges.push("不可攻击");
    if (u.resonanceTurn === S.turnCount) badges.push("⚡共鸣");
    if (u.equipCard) badges.push(`武·${u.equipCard.name}`);
    if (u.dmgTaken > 0) badges.push(`反伤-${u.dmgTaken}`);
    else if (u.tmpBuff > 0) badges.push(`+${u.tmpBuff}`);
    else if (u.tmpBuff < 0) badges.push(`${u.tmpBuff}`);
    const canAtk = mine && S.active === S.p && S.phase === "battle" && !S.over && !busy && canAttack(u, S.p);
    const cls = `g-unit${u.tapped ? " tapped" : ""}${canAtk ? " atk-ok" : ""}`;
    // 28px 小卡放不下名字/状态文字——收进 title 悬停查看；有状态时左上角亮圆点
    const title = u.card.name + (badges.length ? " · " + badges.join(" · ") : "");
    const inner = `<img src="${u.card.img}" class="g-unit-img"><div class="g-unit-info"><div class="g-unit-pow">⚔${p}</div></div>${badges.length ? `<div class="g-unit-badges"></div>` : ""}`;
    return { key: u.uid, cls, inner, sig: p + "|" + badges.join("·"), html: `<div class="${cls}" data-uid="${u.uid}" title="${title}">${inner}</div>` };
  }
  function swordItem(who) {
    const sw = who === "p" ? S.p.sword : S.a.sword;
    const canAtk = who === "p" && sw.onField && swordCanAttack(S.p) && S.active === S.p && S.phase === "battle" && !busy && !S.over;
    const cls = `g-sword-field${sw.tapped ? " tapped" : ""}${canAtk ? " atk-ok" : ""}`;
    const inner = `<img src="${CARDS.find(c => c.id === "card24").img}"><div class="g-unit-info"><div class="g-unit-pow">∞</div></div>`;
    return { key: "sword-" + who, cls, inner, sig: "sword", html: `<div class="${cls}" data-uid="sword" title="冠军之剑 ∞">${inner}</div>`, bind: who === "p" ? bindSword : null };
  }
  function render() {
    if (!S) return;
    $("res-p").textContent = S.p.resonance;
    $("res-a").textContent = S.a.resonance;
    $("res-bar-p").style.width = (S.p.resonance / 12 * 100) + "%";
    $("res-bar-a").style.width = (S.a.resonance / 12 * 100) + "%";
    if (!S.over) $("g-turn-label").textContent = !S.started ? "点【开始战斗】掷骰定先手" : (S.active === S.p ? "▶ 你的回合" : "▶ AI 行动中…");
    $("turn-num").textContent = S.started ? `第 ${S.turnCount} 回合` : "准备战斗";

    // 阶段指示 + 阶段按钮
    const curIdx = S.phase === "end" ? PHASE_ORDER.length : PHASE_ORDER.indexOf(S.phase);
    const curPh = $("g-cur-phase"); if (curPh) curPh.textContent = PHASE_NAME[S.phase] || "—";
    document.querySelectorAll("#g-phases span").forEach(el => {
      const i = PHASE_ORDER.indexOf(el.dataset.ph);
      el.classList.toggle("done", i >= 0 && i < curIdx);
      el.classList.toggle("on", el.dataset.ph === S.phase);
    });
    const endBtn = $("g-end");
    if (endBtn) {
      if (S.over) { endBtn.disabled = true; endBtn.textContent = "对局已结束"; }
      else if (!S.started) { endBtn.disabled = true; endBtn.textContent = "点【开始战斗】开局"; }
      else if (S.active !== S.p) { endBtn.disabled = true; endBtn.textContent = "AI 行动中…"; }
      else if (busy) { endBtn.disabled = true; endBtn.textContent = "请稍候…"; }
      else {
        endBtn.disabled = false;
        endBtn.textContent = S.phase === "fill" ? "跳过填能 → 主要阶段"
          : S.phase === "main" ? "进入战斗阶段 →"
          : S.phase === "battle" ? "结束回合" : "…";
      }
    }

    // 开局遮罩：未开始战斗时盖住场地，提示点【开始战斗】
    const ov = $("g-start");
    if (ov) {
      ov.classList.toggle("hide", !!S.started);
      const sub = $("g-start-sub");
      if (sub) sub.textContent = `${S.p.deckName}　VS　${S.a.deckName}　·　起手各 5 张`;
    }

    // 左栏：我的信息
    const myDn = $("my-deck-name"); if (myDn) myDn.textContent = S.p.deckName;
    $("my-hand-num").textContent = S.p.hand.length;
    $("my-energy-num").textContent = `${S.p.energy.filter(e => !e.tapped).length}/${S.p.energy.length}`;
    $("my-fill-state").textContent = S.p.filledThisTurn ? "已填" : (S.active === S.p && S.phase === "fill" ? "可填 1 张" : "未填");
    // 右栏：AI 信息
    const aiDn = $("ai-deck-name"); if (aiDn) aiDn.textContent = S.a.deckName;
    $("ai-res-num").textContent = S.a.resonance;
    $("ai-hand-num").textContent = S.a.hand.length;
    $("ai-deck-num").textContent = S.a.deck.length;
    $("ai-discard-num").textContent = S.a.discard.length;
    $("ai-energy-num").textContent = `${S.a.energy.filter(e => !e.tapped).length}/${S.a.energy.length}`;
    $("ai-sword-state").textContent = S.a.sword.onField ? "已入场战场！" : `EX 待命（${S.a.resonance}/12）`;

    // 牌库 / 废弃区（图片与数字分别增量更新，抽牌不重建卡图）
    setPile("z-deck", "assets/cardback.png", S.p.deck.length, "");
    const topDiscard = S.p.discard[S.p.discard.length - 1];
    setPile("z-discard", topDiscard ? topDiscard.img : null, S.p.discard.length, "废弃区");
    setPile("z-deck-a", "assets/cardback.png", S.a.deck.length, "");
    const topDiscardA = S.a.discard[S.a.discard.length - 1];
    setPile("z-discard-a", topDiscardA ? topDiscardA.img : null, S.a.discard.length, "废弃区");
    // EX ZONE：冠军之剑开局放置于此，满12共鸣移至战场
    const swordImg = CARDS.find(c => c.id === "card24").img;
    setHTML("z-ex", S.p.sword.onField
      ? `<div class="g-zone-empty">EX ZONE</div>`
      : `<img src="${swordImg}" class="g-ex-sword" title="你的冠军之剑——共鸣 ${S.p.resonance}/12，满 12 移至战场">`);
    setHTML("z-ex-a", S.a.sword.onField
      ? `<div class="g-zone-empty">EX ZONE</div>`
      : `<img src="${swordImg}" class="g-ex-sword" title="AI 的冠军之剑——共鸣 ${S.a.resonance}/12，满 12 移至战场">`);
    // 能量区（键控增量：只有新增/横置的那张会变）
    syncCards("z-energy", S.p.energy.map((e, i) => ({
      key: "e" + i, src: e.card.img, cls: "g-energy" + (e.tapped ? " tapped" : ""),
      title: `${e.card.name}·${e.card.attr}${e.tapped ? "（已横置）" : ""}`
    })), `<div class="g-zone-empty">你的费用区（填能阶段拖入手牌填入）</div>`);
    syncCards("z-energy-a", S.a.energy.map((e, i) => ({
      key: "e" + i, src: e.card.img, cls: "g-energy" + (e.tapped ? " tapped" : ""),
      title: `AI：${e.card.name}·${e.card.attr}${e.tapped ? "（已横置）" : ""}`
    })), `<div class="g-zone-empty">AI 费用区</div>`);
    // 场上（键控增量：新登场的只创建它自己，其余卡图完全不动）
    const itemsA = S.a.field.map(u => { const it = unitItem(u, false); it.bind = bindEnemyUnit; return it; });
    if (S.a.sword.onField) itemsA.push(swordItem("a"));
    syncKeyed("z-field-a", itemsA, `<div class="g-zone-empty">AI 战场</div>`);
    const itemsP = S.p.field.map(u => { const it = unitItem(u, true); it.bind = bindMineUnit; return it; });
    if (S.p.sword.onField) itemsP.push(swordItem("p"));
    syncKeyed("z-field-p", itemsP, `<div class="g-zone-empty">你的战场（主要阶段拖角色卡上场）</div>`);
    // 手牌（键控增量：只有离场/进场的那一张会动）
    const seen = {};
    syncKeyed("g-hand", S.p.hand.map((c, i) => {
      const n = (seen[c.id] = (seen[c.id] || 0) + 1);
      const playable = S.phase === "main" && canPay(S.p, c) && S.active === S.p && !S.over && !busy;
      const fillable = S.phase === "fill" && !S.p.filledThisTurn && S.active === S.p && !S.over && !busy;
      const inner = `<img src="${c.img}" title="${c.name}｜${c.type}·费用${c.cost ?? "-"}·${c.attr}${c.power != null ? "·战力" + c.power : ""}（主要阶段拖到自己半场打出 / 填能阶段拖到费用区填能量）">`;
      return {
        key: `${c.id}#${n}`, sig: c.id, inner, attrs: { "data-i": String(i) }, bind: bindHandCard,
        cls: `g-handcard${playable ? " playable" : ""}${fillable ? " fillable" : ""}`,
        html: `<div class="g-handcard${playable ? " playable" : ""}${fillable ? " fillable" : ""}" data-i="${i}" draggable="true">${inner}</div>`
      };
    }), `<div class="g-zone-empty" style="align-self:center">手牌为空</div>`);

    bindStatic();
    syncFillZone();
  }

  // ================= 交互绑定（DOM 元素会被复用，所以每个元素只绑定一次） =================
  // 拖动一张手牌：桌面 dragstart 与移动端触摸拖拽共用同一套状态与高亮
  // 前场填能区可见性：填能阶段且本回合还没填过时亮出，给用户一个不被手牌悬浮层
  // 遮挡的填能落点（费用区在棋盘 82% 处，横屏时正好被手牌 dock 压住）
  function syncFillZone() {
    const fz = $("g-fillzone");
    if (!fz) return;
    const show = S.started && !S.over && !busy && S.active === S.p && S.phase === "fill" && !S.p.filledThisTurn;
    fz.classList.toggle("show", show);
  }
  function startCardDrag(c) {
    dragCard = c;
    // 手牌是悬浮覆盖层：拖拽时让它退出命中测试，否则落点（费用区/自己半场）会被手牌挡住
    document.body.classList.add("dragging-card");
    const m = $("g-mat");
    if (S.phase === "main") m.classList.add("half-dragging");
    else if (S.phase === "fill" && !S.p.filledThisTurn) m.classList.add("energy-dragging");
    syncFillZone();
  }
  // 拖动自己场上的一个单位（准备攻击）
  function startUnitDrag(u) {
    dragUnit = u;
    $("g-mat").classList.add("unit-dragging");
    markTargets(u);
  }
  // 结束一切拖动：清状态 + 去高亮
  function endDrag() {
    dragCard = null; dragUnit = null;
    $("g-mat").classList.remove("half-dragging", "drop-ok", "energy-dragging", "unit-dragging", "body-ok");
    clearTargets();
    document.body.classList.remove("g-touch-dragging", "dragging-card");
    syncFillZone();
  }

  function bindHandCard(el) {
    if (el.dataset.bound) return; el.dataset.bound = "1";
    el.addEventListener("dragstart", e => {
      const c = S.p.hand[+el.dataset.i];
      if (!c) { e.preventDefault(); return; }
      startCardDrag(c);
      e.dataTransfer.setData("text/plain", String(el.dataset.i));
      e.dataTransfer.effectAllowed = "copyMove";
    });
    el.addEventListener("dragend", () => endDrag());
    // 移动端：触摸拖拽旁路（鼠标仍走上面的 HTML5 DnD）
    el.addEventListener("pointerdown", e => {
      if (e.pointerType === "mouse" || S.over || busy) return;
      tdDown(e, "card", S.p.hand[+el.dataset.i] || null, el);
    });
  }
  function clearTargets() { document.querySelectorAll(".atk-target").forEach(x => x.classList.remove("atk-target")); }
  function markTargets(u) {
    clearTargets();
    $("z-field-a").querySelectorAll(".g-unit").forEach(el => {
      const t = S.a.field.find(x => x.uid === el.dataset.uid);
      if (t && (t.tapped || hasRaid(u))) el.classList.add("atk-target");
    });
  }
  function bindMineUnit(el) {
    if (el.dataset.bound) return; el.dataset.bound = "1";
    el.addEventListener("dragstart", e => {
      const u = S.p.field.find(x => x.uid === el.dataset.uid);
      if (!u || busy || S.over || S.active !== S.p || S.phase !== "battle" || !canAttack(u, S.p)) { e.preventDefault(); return; }
      startUnitDrag(u);
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", "unit:" + u.uid);
    });
    el.addEventListener("dragend", () => endDrag());
    el.ondragover = e => { if (dragCard && dragCard.type === "装备" && S.phase === "main" && S.active === S.p && !busy && !S.over) { e.preventDefault(); el.classList.add("drag-over"); } };
    el.ondragleave = () => el.classList.remove("drag-over");
    el.ondrop = async e => {
      e.preventDefault(); e.stopPropagation(); el.classList.remove("drag-over");
      if (busy || S.over || S.active !== S.p || !dragCard) return;
      if (S.phase !== "main") { alert("装备只能在主要阶段进行"); dragCard = null; return; }
      const u = S.p.field.find(x => x.uid === el.dataset.uid);
      const c = dragCard; dragCard = null;
      if (!u || c.type !== "装备") return;
      if (!equipOk(u, c)) { alert("武器类型/专属不匹配"); return; }
      if (!canPay(S.p, c)) { alert("费用不足"); return; }
      busy = true; render();
      await playCard(S.p, c, false, u);
      busy = false; render();
    };
    el.addEventListener("click", async () => {
      const u = S.p.field.find(x => x.uid === el.dataset.uid);
      if (!u || busy || S.over || S.active !== S.p || S.phase !== "battle" || !canAttack(u, S.p)) return;
      const opts = [{ label: "直接攻击对方本体", sub: "命中 +1 共鸣值", value: "player" }];
      S.a.field.filter(t => t.tapped).forEach(t => opts.push({ label: `攻击「${t.card.name}」（疲劳·战力 ${effPower(t)}）`, sub: `你的战力 ${effPower(u)}，含反伤`, img: t.card.img, value: t }));
      if (hasRaid(u)) S.a.field.filter(t => !t.tapped).forEach(t => opts.push({ label: `[突袭]攻击「${t.card.name}」（活跃·战力 ${effPower(t)}）`, sub: `你的战力 ${effPower(u)}，含反伤`, img: t.card.img, value: t }));
      const t = await choose(`「${u.card.name}」（战力 ${effPower(u)}）攻击目标？`, opts);
      if (!t) return;
      busy = true; render();
      await declareAttack(S.p, S.a, u, t);
      busy = false; render();
    });
    // 移动端：触摸拖拽旁路（可攻击才允许起拖；短按则走上面的点击＝选攻击目标）
    el.addEventListener("pointerdown", e => {
      if (e.pointerType === "mouse" || S.over || busy) return;
      const u = S.p.field.find(x => x.uid === el.dataset.uid);
      tdDown(e, "unit", u || null, el);
    });
  }
  function bindEnemyUnit(el) {
    if (el.dataset.bound) return; el.dataset.bound = "1";
    el.ondragover = e => { if (dragUnit && S.phase === "battle") { e.preventDefault(); el.classList.add("drag-over"); } };
    el.ondragleave = () => el.classList.remove("drag-over");
    el.ondrop = async e => {
      e.preventDefault(); e.stopPropagation(); el.classList.remove("drag-over");
      if (!dragUnit || busy || S.over || S.active !== S.p || S.phase !== "battle") return;
      const t = S.a.field.find(x => x.uid === el.dataset.uid);
      const u = dragUnit; dragUnit = null;
      if (!t) return;
      if (!(t.tapped || hasRaid(u))) { alert("只能攻击疲劳（横置）的角色（突袭可打活跃）"); return; }
      busy = true; render();
      await declareAttack(S.p, S.a, u, t);
      busy = false; render();
    };
  }
  function bindSword(el) {
    if (el.dataset.bound) return; el.dataset.bound = "1";
    el.addEventListener("click", async () => {
      if (busy || S.over || S.active !== S.p || S.phase !== "battle" || !swordCanAttack(S.p)) return;
      busy = true; render();
      await declareAttack(S.p, S.a, { isSword: true, card: { name: "冠军之剑" } }, "player");
      if (S.p.sword) S.p.sword.tapped = true;
      busy = false; render();
    });
  }
  // 每帧刷新的部分（属性赋值幂等，不会累积监听）
  function bindStatic() {
    const mat = $("g-mat");
    const halfOf = e => { const r = mat.getBoundingClientRect(); return (e.clientY - r.top) > r.height / 2 ? "p" : "a"; };
    mat.ondragover = e => {
      if (dragUnit) {
        const bodyOk = S.phase === "battle" && halfOf(e) === "a";          // 拖己方单位 → 对面半场＝攻击本体
        mat.classList.toggle("body-ok", bodyOk);
        if (bodyOk) e.preventDefault();
        return;
      }
      if (!dragCard) return;
      if (S.phase !== "main") { mat.classList.remove("drop-ok"); return; }
      const mine = halfOf(e) === "p";
      mat.classList.toggle("drop-ok", mine);
      if (mine) e.preventDefault();
    };
    mat.ondragleave = e => { if (e.target === mat) mat.classList.remove("drop-ok", "body-ok"); };
    mat.ondrop = async e => {
      e.preventDefault(); mat.classList.remove("drop-ok", "body-ok");
      if (busy || S.over || S.active !== S.p) return;
      const mine = halfOf(e) === "p";
      // 拖动己方单位 → 攻击对方本体
      if (dragUnit) {
        const u = dragUnit; dragUnit = null;
        if (mine) { alert("攻击本体请拖到对面的半场（上半场）"); return; }
        if (S.phase !== "battle") { alert("只能在战斗阶段攻击：请先点「进入战斗阶段」"); return; }
        busy = true; render();
        await declareAttack(S.p, S.a, u, "player");
        busy = false; render();
        return;
      }
      if (!dragCard) return;
      if (mine === false) { alert("要拖到你自己的半场（下半场）"); return; }
      if (S.phase !== "main") { alert("出牌只能在主要阶段：填能阶段请拖到费用区，或点按钮进入主要阶段"); dragCard = null; return; }
      const c = dragCard; dragCard = null;
      if (c.type === "装备") { alert("装备卡请拖到具体的角色身上"); return; }
      if (c.type !== "角色" && c.type !== "事件") { alert("这张卡不能直接上场"); return; }
      if (!canPay(S.p, c)) { alert("费用不足或没有对应属性的能量"); return; }
      busy = true; render();
      await playCard(S.p, c, false);
      busy = false; render();
    };
    // 能量区 drop（仅填能阶段）
    const ze = $("z-energy");
    ze.ondragover = e => { if (dragCard && S.active === S.p && S.phase === "fill" && !S.p.filledThisTurn && !S.over && !busy) { e.preventDefault(); ze.classList.add("drag-over"); } };
    ze.ondragleave = () => ze.classList.remove("drag-over");
    ze.ondrop = e => {
      e.preventDefault(); e.stopPropagation(); ze.classList.remove("drag-over");
      if (busy || S.over || S.active !== S.p || !dragCard) return;
      if (S.phase !== "fill") { alert("填能只能在填能阶段进行（本回合已过填能阶段，不能再填）"); dragCard = null; return; }
      if (S.p.filledThisTurn) { alert("每回合最多填 1 张能量"); dragCard = null; return; }
      fillEnergy(S.p, dragCard); dragCard = null;
    };
    // 前场填能区 drop（与费用区同规则；费用区被手牌悬浮层压住时，这里是 visible 落点）
    const fz = $("g-fillzone");
    if (fz) {
      fz.ondragover = e => { if (dragCard && S.active === S.p && S.phase === "fill" && !S.p.filledThisTurn && !S.over && !busy) { e.preventDefault(); fz.classList.add("drag-over"); } };
      fz.ondragleave = () => fz.classList.remove("drag-over");
      fz.ondrop = e => {
        e.preventDefault(); e.stopPropagation(); fz.classList.remove("drag-over");
        if (busy || S.over || S.active !== S.p || !dragCard) return;
        if (S.phase !== "fill") { alert("填能只能在填能阶段进行（本回合已过填能阶段，不能再填）"); dragCard = null; return; }
        if (S.p.filledThisTurn) { alert("每回合最多填 1 张能量"); dragCard = null; return; }
        fillEnergy(S.p, dragCard); dragCard = null;
      };
    }
    // 玩家场上 drop（角色上场 / 装备上角色，仅主要阶段）
    const fp = $("z-field-p");
    fp.ondragover = e => { if (dragCard && S.active === S.p && S.phase === "main" && !S.over && !busy) { e.preventDefault(); fp.classList.add("drag-over"); } };
    fp.ondragleave = () => fp.classList.remove("drag-over");
    fp.ondrop = async e => {
      e.preventDefault(); e.stopPropagation(); fp.classList.remove("drag-over");
      if (busy || S.over || S.active !== S.p || !dragCard) return;
      if (S.phase !== "main") { alert("出牌只能在主要阶段进行"); dragCard = null; return; }
      const c = dragCard; dragCard = null;
      if (c.type === "装备") { alert("装备卡请拖到具体的角色身上"); return; }
      if (c.type !== "角色" && c.type !== "事件") return;
      if (!canPay(S.p, c)) { alert("费用不足或没有对应属性的能量"); return; }
      busy = true; render();
      await playCard(S.p, c, false);
      busy = false; render();
    };
    // 可攻击的单位才可拖动
    fp.querySelectorAll(".g-unit").forEach(el => {
      const u = S.p.field.find(x => x.uid === el.dataset.uid);
      const ok = !!u && S.active === S.p && S.phase === "battle" && !S.over && !busy && canAttack(u, S.p);
      if (ok) el.setAttribute("draggable", "true"); else el.removeAttribute("draggable");
    });
  }

  // ================= 移动端触摸拖拽（旁路：桌面仍走 HTML5 DnD） =================
  // 手机上 HTML5 drag&drop 根本不触发，且默认触摸手势会滚屏。这里用 Pointer Events
  // 自绘「牌影」跟随手指，落点向目标元素派发合成的 dragover / drop 事件，
  // 从而完整复用桌面那一套 drop 逻辑（属性门禁、阶段门禁、结算全部不变）。
  const TD = { on: false, kind: null, el: null, obj: null, ghost: null, hover: null, x0: 0, y0: 0, id: null, moved: false };
  const TD_TAP = 12;          // 位移小于它算「点击」而不是拖拽
  let TD_SUPPRESS = null;     // 吞掉 touchend 后浏览器补发的 click，避免重复触发

  document.addEventListener("click", e => {
    const s = TD_SUPPRESS;
    if (!s) return;
    if (Date.now() - s.at < 700 && s.el && (e.target === s.el || s.el.contains(e.target))) {
      e.stopPropagation(); e.preventDefault(); TD_SUPPRESS = null;
    }
  }, true);

  function tdDown(e, kind, obj, el) {
    if (TD.on || !obj) return;
    // 单位拖拽沿用桌面 dragstart 的准入门禁（可攻击才让拖）
    if (kind === "unit" && (S.active !== S.p || S.phase !== "battle" || !canAttack(obj, S.p))) return;
    TD.on = true; TD.kind = kind; TD.el = el; TD.obj = obj;
    TD.x0 = e.clientX; TD.y0 = e.clientY; TD.id = e.pointerId; TD.moved = false;
    // 全局监听，不用 setPointerCapture：起拖后手牌卡会被设成 pointer-events:none（让出落点），
    // 真机上这会直接打断指针捕获、后续 pointermove/pointerup 全部收不到——拖拽就死在第一步。
    // window 监听不依赖捕获：触摸事件按规范固定在起始元素上并冒泡到 window，一定能收到。
    window.addEventListener("pointermove", tdMove, { passive: false });
    window.addEventListener("pointerup", tdUp);
    window.addEventListener("pointercancel", tdCancel);
  }

  function tdMove(e) {
    if (!TD.on || e.pointerId !== TD.id) return;
    const dx = e.clientX - TD.x0, dy = e.clientY - TD.y0;
    if (!TD.moved) {
      if (dx * dx + dy * dy < TD_TAP * TD_TAP) return;   // 还没超过阈值：仍是点击
      tdBegin();
    }
    e.preventDefault();          // 阻止滚动 / 双指缩放
    tdGhostAt(e.clientX, e.clientY);
    tdHover(e.clientX, e.clientY);
  }

  function tdBegin() {
    TD.moved = true;
    document.body.classList.add("g-touch-dragging");   // 手牌退出命中测试，落点才能被 elementFromPoint 找到
    const isUnit = TD.kind === "unit";
    const g = document.createElement("div");
    g.className = "g-touch-ghost" + (isUnit ? " g-unit" : "");
    g.style.width = (isUnit ? 40 : 96) + "px";
    g.innerHTML = `<img src="${TD.obj.card ? TD.obj.card.img : TD.obj.img}" alt="">`;
    document.body.appendChild(g);
    TD.ghost = g;
    if (isUnit) startUnitDrag(TD.obj); else startCardDrag(TD.obj);
  }

  function tdGhostAt(x, y) {
    if (!TD.ghost) return;
    TD.ghost.style.left = x + "px";
    TD.ghost.style.top = y + "px";
  }

  // 手指下方最近的可放置目标。几何命中而不用 document.elementFromPoint：
  // 悬浮手牌层靠 pointer-events 让出命中测试，这套组合在真机上与指针捕获相互打断、
  // 且受 z-index/层级影响不可靠；而所有落点都是已知矩形，直接命中测试最稳。
  // 优先级与桌面 drop 冒泡路径一致：单位 > 半场/费用区/前场填能区 > 棋盘。
  function tdHover(x, y) {
    const inRect = r => r && x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
    let t = null;
    const units = document.querySelectorAll(".g-unit");
    for (const u of units) { if (inRect(u.getBoundingClientRect())) { t = u; break; } }
    if (!t) {
      for (const sel of ["#z-field-a", "#z-field-p", "#z-energy", "#g-fillzone"]) {
        const el = document.querySelector(sel);
        // 前场填能区只在亮出时才是落点（隐藏态不拦截）
        if (el && (sel !== "#g-fillzone" || el.classList.contains("show")) && inRect(el.getBoundingClientRect())) { t = el; break; }
      }
    }
    if (!t) { const m = $("g-mat"); if (inRect(m.getBoundingClientRect())) t = m; }
    if (t === TD.hover) return;
    if (TD.hover) { TD.hover.classList.remove("drag-over"); tdFire(TD.hover, "dragleave", x, y); }
    TD.hover = t;
    if (t) tdFire(t, "dragover", x, y);
  }

  function tdFire(el, type, x, y) {
    el.dispatchEvent(new MouseEvent(type, { bubbles: true, composed: true, cancelable: true, clientX: x, clientY: y }));
  }

  function tdOff() {
    window.removeEventListener("pointermove", tdMove);
    window.removeEventListener("pointerup", tdUp);
    window.removeEventListener("pointercancel", tdCancel);
    const el = TD.el;
    if (el && TD.id != null) { try { el.releasePointerCapture(TD.id); } catch (_) {} }
    TD.on = false; TD.id = null;
  }

  function tdTeardown() {
    if (TD.ghost) { TD.ghost.remove(); TD.ghost = null; }
    if (TD.hover) { TD.hover.classList.remove("drag-over"); TD.hover = null; }
    endDrag();
  }

  // 派发一次点击并屏蔽浏览器随后补发的那次
  function tdTap(el, x, y) {
    el.dispatchEvent(new MouseEvent("click", { bubbles: true, composed: true, cancelable: true, clientX: x, clientY: y }));
    TD_SUPPRESS = { el, at: Date.now() };
  }

  function tdUp(e) {
    if (!TD.on || e.pointerId !== TD.id) return;
    const el = TD.el, moved = TD.moved, kind = TD.kind, obj = TD.obj, x = e.clientX, y = e.clientY;
    tdOff();
    if (!moved) {                       // 短按＝点击：手牌弹操作菜单，单位走原有攻击流程
      tdTap(el, x, y);
      if (kind === "card") handCardMenu(obj);
      return;
    }
    const t = TD.hover; TD.hover = null;
    if (t) tdFire(t, "drop", x, y);     // 先落点结算（处理器会同步取走 dragCard / dragUnit）
    tdTeardown();
  }

  function tdCancel() { if (!TD.on) return; tdOff(); tdTeardown(); }

  // 手牌操作菜单：手机点一下手牌就能打出 / 填能（拖拽仍是备选）
  async function handCardMenu(card) {
    if (!card || S.over || busy || S.active !== S.p || !S.started) return;
    const opts = [];
    if (S.phase === "main" && card.type !== "装备") {
      opts.push({
        label: `打出「${card.name}」`,
        sub: (card.type === "角色" ? "登场到自己战场" : "结算效果后进废弃区") + ` · 费用 ${card.cost ?? "-"}`,
        img: card.img, value: "play"
      });
    }
    if (S.phase === "fill" && !S.p.filledThisTurn) {
      opts.push({ label: `「${card.name}」填入能量区`, sub: "本回合限填 1 张，活跃状态入区", img: card.img, value: "fill" });
    }
    if (S.phase === "main" && card.type === "装备") {
      opts.push({ label: `装备「${card.name}」`, sub: "请把这张卡拖到具体角色身上", img: card.img, value: "equip" });
    }
    if (!opts.length) { gToast(noActionReason(card)); return; }
    opts.push({ label: "取消", value: null });
    const v = await choose(`「${card.name}」要做什么？`, opts);
    if (v === "play") {
      if (!canPay(S.p, card)) { gToast("费用不足，或没有对应属性能量"); return; }
      busy = true; render();
      await playCard(S.p, card, false);
      busy = false; render();
    } else if (v === "fill") {
      fillEnergy(S.p, card);
    } else if (v === "equip") {
      gToast(`把「${card.name}」拖到要装备的角色身上`);
    }
  }
  function noActionReason(card) {
    if (!S.started) return "先点场地中央的【开始战斗】掷骰定先手";
    if (S.phase === "draw") return "现在是抽牌阶段，稍等一下";
    if (S.phase === "fill") return S.p.filledThisTurn ? "本回合已填过能量（每回合限 1 张）" : "";
    if (S.phase === "main") return "费用不足，或没有对应属性的能量";
    if (S.phase === "battle") return "现在是战斗阶段，只能发起攻击";
    return "现在不能使用这张卡";
  }

  // ================= 移动端横屏门禁 + 锁定页面滚动 =================
  // 场地按横向设计：竖屏触屏设备进试玩先弹「请横屏」，横过来才放行；
  // 试玩页期间锁定 body 滚动，保证拖动牌的时候页面不会上下划。

  // 棋盘宽度按「实测可用高度」定：导航/大标题/卡组条/侧栏的真实占位用 CSS
  // 公式算不准，所以这里直接把棋盘顶边到视口底部的距离量出来，反推棋盘尺寸，
  // 保证「棋盘 + 手牌」恰好一屏放得下——试玩页锁定了 body 滚动，放不下的
  // 部分会被直接裁掉（手牌在棋盘下方，首当其冲）。
  // 桌面与手机横屏共用这一套；侧栏限高到同一布局高度，超出部分栏内滚动。
  function fitBoard() {
    const mat = $("g-mat"), hand = $("g-hand");
    if (!mat || !hand) return;
    const left = document.querySelector(".play-left");
    const right = document.querySelector(".play-right");
    const inPlay = !!($("page-play") && $("page-play").classList.contains("active"));
    // 不在试玩页（页面隐藏、量不到尺寸）时清掉内联样式，交还 CSS 公式
    if (!inPlay || mat.getBoundingClientRect().height === 0) {
      if (mat.style.width) mat.style.width = "";
      [left, right].forEach(c => { if (c) { c.style.maxHeight = ""; c.style.overflowY = ""; } });
      return;
    }
    const top = mat.getBoundingClientRect().top;   // 棋盘上方全部占位（导航/标题/边距，实测）
    // 手牌已改为悬浮覆盖层（.g-hand-dock 固定视口底部），不再占布局高度，
    // 棋盘可以一直铺到屏底，浮着的手牌用左下角按钮收起
    const budget = Math.max(150, window.innerHeight - top - 8);
    const matH = Math.max(90, budget);
    const layoutH = matH;
    // 侧栏限高到「棋盘 + 手牌」，超出部分在栏内滚动（不把棋盘挤出去、不撑出视口）
    [left, right].forEach(c => { if (c) { c.style.maxHeight = layoutH + "px"; c.style.overflowY = "auto"; } });
    const w = Math.min(mat.parentElement.clientWidth, Math.floor(matH * 0.8571));
    mat.style.width = Math.floor(w) + "px";
  }

  let rotForced = false;
  function isTouchPortrait() {
    const portrait = window.matchMedia ? window.matchMedia("(orientation: portrait)").matches
                                       : window.innerHeight > window.innerWidth;
    if (!portrait) return false;
    const coarse = window.matchMedia && window.matchMedia("(hover: none) and (pointer: coarse)").matches;
    return !!(coarse || (navigator.maxTouchPoints || 0) > 0);
  }
  function syncRotate() {
    const gate = $("g-rotate");
    const inPlay = !!(gate && $("page-play") && $("page-play").classList.contains("active"));
    const need = inPlay && !rotForced && isTouchPortrait();
    if (gate) gate.classList.toggle("on", need);
    document.body.classList.toggle("g-locked", inPlay);
    return need;
  }
  (function initRotate() {
    const gate = $("g-rotate");
    if (!gate) return;
    const force = $("g-rotate-force");
    if (force) force.addEventListener("click", () => { rotForced = true; syncRotate(); });
    // 试玩页显隐 → 加/解锁定；离开时复位，下次进来重新拦
    if (window.MutationObserver && $("page-play")) {
      new MutationObserver(() => {
        if (!$("page-play").classList.contains("active")) rotForced = false;
        syncRotate();
        fitBoard();   // 页面刚显示/隐藏，尺寸变了必须重量
      }).observe($("page-play"), { attributes: true, attributeFilter: ["class"] });
    }
    window.addEventListener("resize", () => { syncRotate(); fitBoard(); });
    window.addEventListener("orientationchange", () => setTimeout(() => { syncRotate(); fitBoard(); }, 60));
    syncRotate();
    fitBoard();
    // 首帧内容（卡组名/手牌）渲染完再校准一次
    requestAnimationFrame(() => { fitBoard(); setTimeout(fitBoard, 120); });
  })();

  // 手牌悬浮层：dock 左侧按钮切换显示/隐藏
  (function initHandToggle() {
    const btn = $("g-hand-toggle");
    if (!btn) return;
    const sync = () => { btn.textContent = document.body.classList.contains("hand-hidden") ? "显示手牌" : "隐藏手牌"; };
    btn.addEventListener("click", () => { document.body.classList.toggle("hand-hidden"); sync(); });
    sync();
  })();

  // ================= 启动 =================
  function newGame() {
    const pick = (window.GTCG_DECKS && window.GTCG_DECKS.playPick()) || { p: "a", a: "b" };
    S = { p: newSide("你", pick.p), a: newSide("AI", pick.a), turnCount: 0, over: false, active: null, phase: null, started: false, firstSide: null };
    $("g-log").innerHTML = "";
    $("g-end").disabled = true;
    // 清空缓存与旧 DOM，避免键控增量渲染残留
    clearMemo();
    ["z-field-p", "z-field-a", "z-energy", "z-energy-a", "z-deck", "z-discard", "z-deck-a", "z-discard-a", "z-ex", "z-ex-a", "g-hand"].forEach(id => { const el = $(id); if (el) el.innerHTML = ""; });
    drawCards(S.p, 5); drawCards(S.a, 5);
    log(`对局准备：你使用「${S.p.deckName}」，AI 使用「${S.a.deckName}」，各 40 张，已起手 5 张。`, "g-hot");
    log("点场地中央的【开始战斗】掷骰定先手——点数大者先手，先手第一回合不抽牌。", "g-hot");
    if (!S.p.deckId || !S.a.deckId) log("提示：所选卡组不是合法的 40 张构筑，已回退随机牌组。到「坎友卡牌中心 → 我的卡组」构筑后再来。", "g-hot");
    render();
  }

  // 重新开始：移到视口右下角 + 二次确认，防误触
  $("g-restart").addEventListener("click", () => {
    if (busy) return;
    if (!confirm("确定要重新开始吗？当前对局的进度会全部丢失。")) return;
    newGame();
  });
  // 阶段按钮：跳过当前阶段（填能→主要→战斗→回合结束）
  $("g-end").addEventListener("click", async () => { await nextPhase(); });
  // 开始战斗：掷骰定先手
  const startBtn = $("g-start-btn");
  if (startBtn) startBtn.addEventListener("click", () => { startBattle(); });

  // ================= 调试/测试钩子 =================
  window.GTCG_DEBUG = {
    get S() { return S; },
    isBusy: () => busy,
    newGame,
    // 测试用：指定手牌/牌库/能量区/阶段
    rig: o => {
      if (!S) return false;
      if (o.hand) S.p.hand = o.hand.map(id => CARDS.find(c => c.id === id));
      if (o.deck) S.p.deck = o.deck.map(id => CARDS.find(c => c.id === id));
      if (o.energy) S.p.energy = o.energy.map(id => ({ card: CARDS.find(c => c.id === id), tapped: false }));
      if (o.enemy) S.a.field = o.enemy.map(id => { const u = newUnit(CARDS.find(c => c.id === id)); u.playedTurn = -1; return u; });
      if (o.phase) { S.phase = o.phase; S.active = S.p; }
      if (o.filledThisTurn !== undefined) S.p.filledThisTurn = o.filledThisTurn;
      render(); return true;
    },
    fill: i => { if (S && S.p.hand[i]) { S.phase = "fill"; return fillEnergy(S.p, S.p.hand[i]); } return false; },
    play: async i => { if (!S || !S.p.hand[i]) return false; S.phase = "main"; busy = true; try { return await playCard(S.p, S.p.hand[i], false); } finally { busy = false; } },
    equipTo: async (i, uid) => {
      const c = S.p.hand[i], u = S.p.field.find(x => x.uid === uid);
      if (!c || !u || !equipOk(u, c) || !canPay(S.p, c)) return false;
      S.phase = "main";
      tryPay(S.p, c); S.p.hand.splice(S.p.hand.indexOf(c), 1);
      applyEquip(S.p, u, c); render(); return true;
    },
    attack: async (uid, target) => {
      const u = S.p.field.find(x => x.uid === uid);
      if (!u) return false;
      S.phase = "battle";
      await declareAttack(S.p, S.a, u, target); return true;
    },
    nextPhase,
    startBattle,
    rollDice,
    diceHtml: dieHtml,
    // 移动端适配测试钩子
    rot: {
      sync: syncRotate,
      portrait: isTouchPortrait,
      force: v => { rotForced = !!v; syncRotate(); },
      shown: () => { const g = $("g-rotate"); return !!g && g.classList.contains("on"); },
      locked: () => document.body.classList.contains("g-locked"),
      fit: fitBoard,
      matW: () => { const m = $("g-mat"); return m ? Math.round(m.getBoundingClientRect().width) : -1; },
      overflow: () => document.documentElement.scrollHeight - window.innerHeight,
    },
    handCardMenu,
    td: { get state() { return { on: TD.on, kind: TD.kind, moved: TD.moved, hover: !!TD.hover }; } },
    endTurn: async () => { await endTurn(); },
    core: { tryPay, canPay, effPower, addResonance, pickPayment, choosePayment, payFor, destroy, hasGuard, hasRaid, canAttack, battle, fillEnergy, playCard, declareAttack, cleanupTurnEnd, startTurn },
    render
  };

  // 卡组改动（重命名/构筑）后刷新对局状态栏显示
  if (window.GTCG_DECKS) window.GTCG_DECKS.onChange = () => { if (S) render(); };

  newGame();
})();