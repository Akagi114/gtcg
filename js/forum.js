/* 坎友圈 - 云端论坛版块
 * 数据存于云数据库（forum_threads / forum_replies），发帖回帖点赞全员可见。
 * 本地只保存身份（昵称/uid）与点赞记录。
 */
(function () {
  const CATS = ["综合闲聊", "卡牌讨论", "规则讨论", "同人创作", "组队招新"];
  const LS_NICK = "kyh_nick";
  const LS_UID = "kyh_uid";
  const LS_LIKED = "kyh_liked";

  // ===== 云客户端（CDN 全局 WorkBuddyCloud） =====
  const cloud = WorkBuddyCloud.createWorkBuddyCloud({
    endpoint: PUBLIC_CONFIG.endpoint,
    oauthRelayBaseUrl: PUBLIC_CONFIG.oauthRelayBaseUrl,
    publishableKey: PUBLIC_CONFIG.publishableKey
  });

  // ===== 本地身份 =====
  let uid = localStorage.getItem(LS_UID);
  if (!uid) { uid = "u_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8); localStorage.setItem(LS_UID, uid); }
  let nick = localStorage.getItem(LS_NICK) || "";
  let liked = [];
  try { liked = JSON.parse(localStorage.getItem(LS_LIKED) || "[]"); } catch (e) { liked = []; }
  function saveLiked() { localStorage.setItem(LS_LIKED, JSON.stringify(liked)); }

  // ===== 状态 =====
  let threads = [];          // [{...row, replies:[...]}]
  let cloudError = null;
  let loading = true;
  let currentCat = "全部";
  let currentThread = null;

  const $ = id => document.getElementById(id);
  function esc(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
  function timeAgo(ts) {
    const d = Date.now() - ts;
    if (d < 60e3) return "刚刚";
    if (d < 3600e3) return Math.floor(d / 60e3) + " 分钟前";
    if (d < 86400e3) return Math.floor(d / 3600e3) + " 小时前";
    if (d < 30 * 86400e3) return Math.floor(d / 86400e3) + " 天前";
    return new Date(ts).toLocaleDateString("zh-CN");
  }
  function avatarOf(name) {
    if (name === "小骑士") return "🛡️";
    const pool = ["😊", "😎", "🦊", "🐱", "⚔️", "🌟", "🍀", "🔥", "🎧", "🧪"];
    let h = 0; for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) % 997;
    return pool[h % pool.length];
  }
  function catBadge(cat) { return `<span class="cat-badge c${CATS.indexOf(cat) >= 0 ? CATS.indexOf(cat) : 0}">${esc(cat)}</span>`; }
  function isLiked(type, id) { return liked.includes(type + id); }

  // ===== 云端数据加载 =====
  async function loadAll() {
    loading = true; cloudError = null; renderList();
    try {
      const [tRes, rRes] = await Promise.all([
        cloud.database.from("forum_threads").select("*").order("created_at", { ascending: false }),
        cloud.database.from("forum_replies").select("*").order("created_at", { ascending: true }).limit(2000)
      ]);
      if (tRes.error) throw tRes.error;
      if (rRes.error) throw rRes.error;
      const repliesByThread = {};
      (rRes.data || []).forEach(r => {
        (repliesByThread[r.thread_id] = repliesByThread[r.thread_id] || []).push(r);
      });
      threads = (tRes.data || []).map(t => Object.assign({}, t, { replies: repliesByThread[t.id] || [] }));
    } catch (err) {
      cloudError = (err && err.message) || String(err);
      threads = [];
    }
    loading = false;
    renderList();
  }

  function errBanner() {
    return `<div class="forum-empty">⚠️ 坎友圈云端加载失败：${esc(cloudError)}<br>
      <span style="font-size:13px">请检查网络后重试</span><br><br>
      <span class="chip" id="retry-load">重新加载</span></div>`;
  }

  // ===== 分类标签 =====
  function renderCats() {
    const wrap = $("forum-cats");
    wrap.innerHTML = ["全部", ...CATS].map(c =>
      `<span class="chip${c === currentCat ? " on" : ""}" data-c="${esc(c)}">${esc(c)}</span>`).join("");
    wrap.querySelectorAll(".chip").forEach(ch => ch.addEventListener("click", () => {
      currentCat = ch.dataset.c;
      renderCats(); renderList();
    }));
  }

  // ===== 列表视图 =====
  function renderList() {
    $("forum-list-view").style.display = "block";
    $("forum-detail-view").style.display = "none";
    const el = $("thread-list");
    if (loading) { el.innerHTML = `<div class="forum-empty">正在从云端加载坎友圈…</div>`; return; }
    if (cloudError) { el.innerHTML = errBanner(); const b = $("retry-load"); if (b) b.addEventListener("click", loadAll); return; }

    const list = threads.filter(t => currentCat === "全部" || t.cat === currentCat);
    if (!list.length) { el.innerHTML = `<div class="forum-empty">这个版块还没有帖子，来发第一帖吧！</div>`; return; }
    el.innerHTML = list.map(t => `
      <div class="thread" data-id="${t.id}">
        <div class="t-top">${catBadge(t.cat)}</div>
        <h4>${esc(t.title)}</h4>
        <div class="t-snip">${esc(t.content)}</div>
        <div class="t-meta">
          <span>👤 ${esc(t.poster_name)}</span>
          <span>🕐 ${timeAgo(Date.parse(t.created_at))}</span>
          <span>💬 ${t.replies.length} 回复</span>
          <span>❤️ ${t.likes}</span>
        </div>
      </div>`).join("");
    el.querySelectorAll(".thread").forEach(t => t.addEventListener("click", () => openThread(Number(t.dataset.id))));
  }

  // ===== 详情视图 =====
  function openThread(id) {
    const t = threads.find(x => x.id === id);
    if (!t) return;
    currentThread = t;
    $("forum-list-view").style.display = "none";
    $("forum-detail-view").style.display = "block";
    renderDetail();
    window.scrollTo(0, 0);
  }

  function renderDetail() {
    const t = currentThread;
    $("thread-detail").innerHTML = `
      <div class="detail-card">
        <div class="d-top">${catBadge(t.cat)}<span class="badge">坎友圈 · 云端</span></div>
        <h3>${esc(t.title)}</h3>
        <div class="d-author">👤 ${esc(t.poster_name)} · 🕐 ${timeAgo(Date.parse(t.created_at))}</div>
        <div class="d-content">${esc(t.content)}</div>
        <div class="d-actions">
          <span class="like-btn${isLiked("t", t.id) ? " on" : ""}" id="d-like">❤️ ${t.likes}${isLiked("t", t.id) ? " 已赞" : " 点赞"}</span>
        </div>
      </div>
      <h3 style="margin:26px 0 14px;color:var(--gold);font-size:18px">回复（${t.replies.length}）</h3>
      ${t.replies.length ? t.replies.map(r => `
        <div class="reply-item">
          <div class="r-avatar">${avatarOf(r.poster_name)}</div>
          <div class="r-body">
            <div class="r-head"><span class="r-author">${esc(r.poster_name)}</span><span class="r-time">${timeAgo(Date.parse(r.created_at))}</span></div>
            <div class="r-content">${esc(r.content)}</div>
            <div class="r-actions">
              <span class="like-btn${isLiked("r", r.id) ? " on" : ""}" data-r="${r.id}">❤️ ${r.likes}</span>
            </div>
          </div>
        </div>`).join("") : `<div class="forum-empty" style="padding:30px 0">还没有回复，抢个沙发！</div>`}
    `;
    $("d-like").addEventListener("click", () => toggleLike("t", t.id));
    document.querySelectorAll(".reply-item .like-btn").forEach(b =>
      b.addEventListener("click", () => toggleLike("r", Number(b.dataset.r))));
  }

  // ===== 点赞（云端持久化；本地记录防重复） =====
  async function toggleLike(type, id) {
    const isT = type === "t";
    const row = isT ? threads.find(x => x.id === id) || currentThread
      : (currentThread.replies.find(x => x.id === id));
    if (!row) return;
    const key = type + id;
    const delta = isLiked(type, id) ? -1 : 1;
    // 乐观更新
    if (delta === 1) liked.push(key); else liked = liked.filter(k => k !== key);
    row.likes = Math.max(0, (row.likes || 0) + delta);
    saveLiked();
    renderDetail();
    const { error } = await cloud.database
      .from(isT ? "forum_threads" : "forum_replies")
      .update({ likes: row.likes })
      .eq("id", id);
    if (error) {
      // 回滚并提示
      if (delta === 1) liked = liked.filter(k => k !== key); else liked.push(key);
      row.likes = Math.max(0, (row.likes || 0) - delta);
      saveLiked(); renderDetail();
      alert("点赞失败：" + (error.message || "网络异常，请稍后再试"));
    }
  }

  // ===== 发帖 =====
  $("f-post").addEventListener("click", async () => {
    const btn = $("f-post");
    const n = $("f-nick").value.trim();
    const title = $("f-title").value.trim();
    const content = $("f-content").value.trim();
    const cat = $("f-cat").value;
    if (!n) { $("f-nick").value = ""; $("f-nick").placeholder = "请先填写昵称！"; $("f-nick").focus(); return; }
    if (!title || !content) { alert("标题和内容都要填写哦～"); return; }
    nick = n; localStorage.setItem(LS_NICK, nick);
    btn.disabled = true; btn.textContent = "发布中…";
    const { data, error } = await cloud.database.from("forum_threads").insert({
      poster_uid: uid, poster_name: nick, cat, title, content
    }).select();
    btn.disabled = false; btn.textContent = "发布帖子";
    if (error) { alert("发布失败：" + (error.message || "网络异常，请稍后再试")); return; }
    const row = data && data[0];
    if (row) threads.unshift(Object.assign({}, row, { replies: [] }));
    $("f-title").value = ""; $("f-content").value = "";
    if (cat !== currentCat && currentCat !== "全部") { currentCat = cat; renderCats(); }
    renderList();
    if (row) openThread(row.id);
  });

  // ===== 回复 =====
  $("r-post").addEventListener("click", async () => {
    const btn = $("r-post");
    const t = currentThread;
    if (!t) return;
    const n = $("r-nick").value.trim();
    const content = $("r-content").value.trim();
    if (!n) { $("r-nick").focus(); $("r-nick").placeholder = "请先填写昵称！"; return; }
    if (!content) { alert("回复内容不能为空～"); return; }
    nick = n; localStorage.setItem(LS_NICK, nick);
    btn.disabled = true; btn.textContent = "回复中…";
    const { data, error } = await cloud.database.from("forum_replies").insert({
      thread_id: t.id, poster_uid: uid, poster_name: nick, content
    }).select();
    btn.disabled = false; btn.textContent = "回复";
    if (error) { alert("回复失败：" + (error.message || "网络异常，请稍后再试")); return; }
    if (data && data[0]) t.replies.push(data[0]);
    $("r-content").value = "";
    renderDetail();
  });

  // ===== 返回列表 =====
  document.querySelectorAll(".back-link").forEach(el => el.addEventListener("click", renderList));

  // ===== 初始化 =====
  $("f-cat").innerHTML = CATS.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join("");
  if (nick) { $("f-nick").value = nick; $("r-nick").value = nick; }
  renderCats();
  loadAll();
})();
