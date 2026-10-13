/* 坎友会 - 页面逻辑 */
(function () {
  // ===== 页面切换 =====
  const pages = ["home", "cards", "play", "community", "rules"];
  function show(page) {
    pages.forEach(p => {
      document.getElementById("page-" + p).classList.toggle("active", p === page);
    });
    document.querySelectorAll(".nav-links a").forEach(a => {
      a.classList.toggle("active", a.dataset.page === page);
    });
    window.scrollTo(0, 0);
    location.hash = page;
  }
  document.querySelectorAll("[data-page]").forEach(el => {
    el.addEventListener("click", e => {
      e.preventDefault();
      show(el.dataset.page);
    });
  });

  // ===== 卡牌中心 =====
  const state = { q: "", type: null, faction: null, attr: null, cost: null, keyword: null, sort: "default" };

  const grid = document.getElementById("card-grid");
  const resultInfo = document.getElementById("result-info");

  function chipRow(id, values, label) {
    const wrap = document.getElementById(id);
    wrap.innerHTML = `<span class="fg-label">${label}</span>` + values.map(v =>
      `<span class="chip" data-v="${v}">${v === "全部" ? "全部" : v}</span>`).join("");
    const key = wrap.dataset.key;
    wrap.querySelectorAll(".chip").forEach(chip => {
      chip.addEventListener("click", () => {
        const v = chip.dataset.v === "全部" ? null : chip.dataset.v;
        state[key] = v;
        wrap.querySelectorAll(".chip").forEach(c => c.classList.remove("on"));
        chip.classList.add("on");
        render();
      });
    });
    wrap.querySelector('.chip[data-v="全部"]').classList.add("on");
  }

  chipRow("f-type", ["全部", ...TYPES], "类型");
  chipRow("f-faction", ["全部", ...FACTIONS], "阵营");
  chipRow("f-attr", ["全部", ...ATTRS], "属性");
  chipRow("f-cost", ["全部", "1", "2", "3", "4", "5", "无"], "费用");
  chipRow("f-keyword", ["全部", ...Object.keys(KEYWORD_DEFS)], "关键词");

  document.getElementById("search-input").addEventListener("input", e => {
    state.q = e.target.value.trim().toLowerCase();
    render();
  });
  document.getElementById("sort-select").addEventListener("change", e => {
    state.sort = e.target.value;
    render();
  });

  function matchFaction(card, f) {
    return card.factions.includes(f) || card.weapons.includes(f) || card.exclusiveTo === f;
  }

  function filtered() {
    let list = CARDS.filter(c => {
      if (state.type && c.type !== state.type) return false;
      if (state.faction && !matchFaction(c, state.faction)) return false;
      if (state.attr && c.attr !== state.attr) return false;
      if (state.cost) {
        if (state.cost === "无" && c.cost !== null) return false;
        if (state.cost !== "无" && c.cost !== Number(state.cost)) return false;
      }
      if (state.keyword && !c.keywords.includes(state.keyword)) return false;
      if (state.q) {
        const hay = [c.name, c.type, ...c.factions, ...c.weapons, ...c.text, ...(c.exclusiveTo ? [c.exclusiveTo] : [])]
          .join(" ").toLowerCase();
        if (!hay.includes(state.q)) return false;
      }
      return true;
    });
    const order = { "角色": 0, "事件": 1, "装备": 2, "特殊": 3 };
    if (state.sort === "cost-asc") list.sort((a, b) => (a.cost ?? 99) - (b.cost ?? 99) || (b.power ?? 0) - (a.power ?? 0));
    else if (state.sort === "cost-desc") list.sort((a, b) => (b.cost ?? -1) - (a.cost ?? -1) || (b.power ?? 0) - (a.power ?? 0));
    else if (state.sort === "power-desc") list.sort((a, b) => (b.power ?? -1) - (a.power ?? -1));
    else if (state.sort === "name") list.sort((a, b) => a.name.localeCompare(b.name, "zh-Hans-CN"));
    else list.sort((a, b) => order[a.type] - order[b.type] || a.id.localeCompare(b.id));
    return list;
  }

  function esc(s) { return s.replace(/&/g, "&amp;").replace(/</g, "&lt;"); }

  function render() {
    const list = filtered();
    resultInfo.textContent = `共 ${list.length} 张卡牌（第一弹全 24 张）`;
    if (!list.length) {
      grid.innerHTML = `<div class="no-result" style="grid-column:1/-1">没有找到匹配的卡牌，换个条件试试？</div>`;
      return;
    }
    grid.innerHTML = list.map(c => `
      <div class="card-tile" data-id="${c.id}">
        <img class="card-img" src="${c.img}" alt="${esc(c.name)}" loading="lazy">
        <div class="t-name">${esc(c.name)}</div>
      </div>`).join("");
    grid.querySelectorAll(".card-tile").forEach(t => {
      t.addEventListener("click", () => openModal(t.dataset.id));
    });
  }

  // ===== 详情弹窗 =====
  const mask = document.getElementById("modal-mask");
  function openModal(id) {
    const c = CARDS.find(x => x.id === id);
    if (!c) return;
    document.getElementById("m-img").src = c.img;
    document.getElementById("m-img").alt = c.name;
    document.getElementById("m-name").textContent = c.name;
    document.getElementById("m-type-line").innerHTML = [
      `<span class="badge gold">${c.type}</span>`,
      c.set === "set1" ? `<span class="badge">第一弹</span>` : "",
      c.attr !== "无" ? `<span class="badge cyan">属性·${c.attr}</span>` : "",
      ...c.factions.map(f => `<span class="badge cyan">${f}</span>`),
      ...(c.weapons.length ? [`<span class="badge">${c.weapons.join(" / ")}</span>`] : []),
      c.exclusiveTo ? `<span class="badge">${c.exclusiveTo}专属</span>` : ""
    ].join("");
    document.getElementById("m-stats").innerHTML =
      (c.cost !== null ? `<div class="m-stat"><div class="v">${c.cost}</div><div class="k">费用</div></div>` : "") +
      (c.power !== null ? `<div class="m-stat"><div class="v">${c.power}</div><div class="k">战力</div></div>` : "");
    const kwHtml = c.keywords.length
      ? `<p style="margin:10px 0 4px;color:var(--muted);font-size:13px">关联关键词（点击查看定义）：</p><div class="m-type-line">${c.keywords.map(k => `<span class="badge cyan" style="cursor:pointer" onclick="showKw('${k}')">${k}</span>`).join("")}</div><p id="kw-def" style="font-size:13px;color:var(--cyan);margin:6px 0 0"></p>`
      : "";
    document.getElementById("m-text").innerHTML =
      (c.text.length ? c.text.map(t => `<div class="eff">${esc(t)}</div>`).join("") : `<div class="eff" style="color:var(--muted)">（无效果文本）</div>`) + kwHtml;
    document.getElementById("m-flavor").textContent = c.flavor || "";
    document.getElementById("m-flavor").style.display = c.flavor ? "block" : "none";
    const note = document.getElementById("m-note");
    if (c.note) { note.style.display = "block"; note.textContent = "※ " + c.note; note.className = "m-note" + (c.note.includes("待") ? "" : " neutral"); }
    else note.style.display = "none";
    mask.classList.add("open");
  }
  window.showKw = function (k) {
    const el = document.getElementById("kw-def");
    if (el) el.textContent = KEYWORD_DEFS[k] || "";
  };
  document.getElementById("m-close").addEventListener("click", () => mask.classList.remove("open"));
  mask.addEventListener("click", e => { if (e.target === mask) mask.classList.remove("open"); });
  document.addEventListener("keydown", e => { if (e.key === "Escape") mask.classList.remove("open"); });

  // ===== 初始路由 =====
  const hash = location.hash.replace("#", "");
  show(pages.includes(hash) ? hash : "home");
  render();
})();
