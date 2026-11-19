/* =========================================
   BEHY MESSENGER — MAIN.JS
   Telegram-inspired mobile navigation
========================================= */

const config = window.SUPABASE_CONFIG;

if (!config?.url || !config?.anonKey) {
  alert("تنظیمات اتصال به سرور پیدا نشد.");
  throw new Error("Supabase config missing");
}

if (!window.supabase?.createClient) {
  alert("کتابخانه Supabase بارگذاری نشده است.");
  throw new Error("Supabase library missing");
}

const db = window.supabase.createClient(config.url, config.anonKey);
const $ = id => document.getElementById(id);

let currentUser = null;
let currentProfile = null;
let activeChat = null;
let realtimeChannel = null;
let authMode = "login";
let savedMode = false;
let isBusy = false;
let settingsOpen = false;
let searchOpen = false;

const THEME_KEY = "behy-theme";

/* ---------- Helpers ---------- */

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, c => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[c]);
}

function cleanUsername(value) {
  return String(value || "").trim().toLowerCase();
}

function cleanHandle(value) {
  return String(value || "").trim().toLowerCase().replace(/^@/, "");
}

function isMobile() {
  return window.matchMedia("(max-width: 700px)").matches;
}

function notify(message) {
  alert(message);
}

function formatTime(value) {
  if (!value) return "";
  return new Date(value).toLocaleTimeString("fa-IR", {
    hour: "2-digit",
    minute: "2-digit"
  });
}

function formatDate(value) {
  if (!value) return "";
  return new Date(value).toLocaleString("fa-IR", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function showMessage(message, type = "info") {
  const el = $("auth-message");
  if (!el) return;
  el.textContent = message;
  el.style.color = type === "error" ? "#d33" : "#2481d7";
}

function setBusy(button, busy, text) {
  if (!button) return;

  button.disabled = busy;

  if (busy) {
    button.dataset.oldText = button.innerHTML;
    button.textContent = text || "در حال انجام...";
  } else if (button.dataset.oldText) {
    button.innerHTML = button.dataset.oldText;
    delete button.dataset.oldText;
  }
}

/* ---------- Theme ---------- */

function applyTheme(theme) {
  const dark = theme === "dark";

  document.body.classList.toggle("dark", dark);
  document.documentElement.dataset.theme = dark ? "dark" : "light";

  const root = document.documentElement.style;

  if (dark) {
    root.setProperty("--bg", "#101923");
    root.setProperty("--surface", "#172532");
    root.setProperty("--text", "#edf4fa");
    root.setProperty("--muted", "#9aabba");
    root.setProperty("--border", "#293b4b");
    root.setProperty("--hover", "#203343");
  } else {
    root.setProperty("--bg", "#f4f7fb");
    root.setProperty("--surface", "#ffffff");
    root.setProperty("--text", "#17212b");
    root.setProperty("--muted", "#8193a5");
    root.setProperty("--border", "#e6edf3");
    root.setProperty("--hover", "#f0f6fc");
  }

  localStorage.setItem(THEME_KEY, theme);
}

function loadTheme() {
  applyTheme(localStorage.getItem(THEME_KEY) || "light");
}

function toggleTheme() {
  const current = localStorage.getItem(THEME_KEY) || "light";
  applyTheme(current === "dark" ? "light" : "dark");

  if (currentProfile) showProfile();
}

/* ---------- Navigation ---------- */

function setMobileTab(tab) {
  document.querySelectorAll("[data-mobile-tab]").forEach(button => {
    button.classList.toggle("active", button.dataset.mobileTab === tab);
  });
}

function showMobileList() {
  $("chat-layout")?.classList.remove("chat-open");
  $("chat-layout")?.classList.remove("mobile-chat-open");
}

function showMobileChat() {
  if (isMobile()) {
    $("chat-layout")?.classList.add("chat-open");
  }
}

function showAuth() {
  $("auth-section").hidden = false;
  $("chat-section").hidden = true;
}

function showChat() {
  $("auth-section").hidden = true;
  $("chat-section").hidden = false;
}

/* ---------- Search ---------- */

function toggleSearch() {
  const box = document.querySelector(".search-box");
  if (!box) return;

  searchOpen = !searchOpen;
  box.style.display = searchOpen ? "flex" : "none";

  if (searchOpen) {
    showChats();
    $("search-user")?.focus();
  } else {
    $("search-user").value = "";
    $("search-results").innerHTML = "";
  }
}

function closeSearch() {
  searchOpen = false;

  const box = document.querySelector(".search-box");
  if (box) box.style.display = "none";

  if ($("search-user")) $("search-user").value = "";
  if ($("search-results")) $("search-results").innerHTML = "";
}

/* ---------- Authentication ---------- */

function setAuthMode(mode) {
  authMode = mode;

  $("login-tab")?.classList.toggle("primary", mode === "login");
  $("signup-tab")?.classList.toggle("primary", mode === "signup");

  $("auth-submit").textContent =
    mode === "signup" ? "ساخت حساب کاربری" : "ورود به حساب";

  $("password").autocomplete =
    mode === "signup" ? "new-password" : "current-password";

  showMessage(
    mode === "signup"
      ? "نام کاربری و رمز عبور را وارد کنید."
      : "اطلاعات حساب خود را وارد کنید."
  );
}

async function handleAuth(event) {
  event.preventDefault();
  if (isBusy) return;

  const username = cleanUsername($("username").value);
  const password = $("password").value;
  const submit = $("auth-submit");

  if (!/^[a-z0-9_]{3,24}$/.test(username)) {
    showMessage("نام کاربری باید ۳ تا ۲۴ حرف انگلیسی، عدد یا زیرخط باشد.", "error");
    return;
  }

  if (password.length < 8 || password.length > 128) {
    showMessage("رمز عبور باید بین ۸ تا ۱۲۸ کاراکتر باشد.", "error");
    return;
  }

  isBusy = true;
  setBusy(submit, true, "در حال اتصال...");

  try {
    const response = await fetch("/api/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: authMode === "signup" ? "register" : "login",
        username,
        password
      })
    });

    const result = await response.json();

    if (!response.ok || !result.success || !result.session) {
      throw new Error(result.error || "ورود یا ثبت‌نام ناموفق بود.");
    }

    const { error } = await db.auth.setSession({
      access_token: result.session.access_token,
      refresh_token: result.session.refresh_token
    });

    if (error) throw error;

    await loadUser();
  } catch (error) {
    console.error(error);
    showMessage(error.message || "ارتباط با سرور برقرار نشد.", "error");
  } finally {
    isBusy = false;
    setBusy(submit, false);
  }
}

/* ---------- Profile Loading ---------- */

async function loadUser() {
  const { data, error } = await db.auth.getUser();

  if (error || !data.user) {
    showAuth();
    return;
  }

  currentUser = data.user;

  const username =
    currentUser.user_metadata?.username ||
    currentUser.email?.split("@")[0];

  const { data: existing, error: readError } = await db
    .from("profiles")
    .select("*")
    .eq("id", currentUser.id)
    .maybeSingle();

  if (readError) {
    notify("خطا در دریافت پروفایل: " + readError.message);
    return;
  }

  if (existing) {
    currentProfile = existing;
  } else {
    const { data: profile, error: insertError } = await db
      .from("profiles")
      .insert({
        id: currentUser.id,
        username,
        display_name:
          currentUser.user_metadata?.display_name || username
      })
      .select()
      .single();

    if (insertError) {
      notify("خطا در ساخت پروفایل: " + insertError.message);
      return;
    }

    currentProfile = profile;
  }

  $("current-user").textContent =
    currentProfile.display_name || currentProfile.username;

  showChat();
  closeSearch();
  showChats();
  await loadConversations();
  subscribeToMessages();
}

/* ---------- Edit Profile ---------- */

async function editProfile() {
  if (!currentProfile) return;

  const oldName = currentProfile.display_name || currentProfile.username;
  const newName = prompt("نام نمایشی جدید:", oldName);

  if (newName === null) return;

  const displayName = newName.trim();

  if (displayName.length < 2 || displayName.length > 40) {
    notify("نام نمایشی باید بین ۲ تا ۴۰ کاراکتر باشد.");
    return;
  }

  const { data, error } = await db
    .from("profiles")
    .update({ display_name: displayName })
    .eq("id", currentUser.id)
    .select()
    .single();

  if (error) {
    notify("ویرایش پروفایل ناموفق بود: " + error.message);
    return;
  }

  currentProfile = data;
  $("current-user").textContent = data.display_name;
  showProfile();
  notify("نام نمایشی تغییر کرد.");
}

/* ---------- Handle ---------- */

async function editHandle() {
  if (!currentUser || !currentProfile) return;

  const oldHandle = currentProfile.handle || "";

  const value = prompt(
    "آیدی اختصاصی شما (فقط انگلیسی، عدد و زیرخط):",
    oldHandle
  );

  if (value === null) return;

  const handle = cleanHandle(value);

  if (!/^[a-z0-9_]{3,24}$/.test(handle)) {
    notify("آیدی باید ۳ تا ۲۴ حرف انگلیسی، عدد یا زیرخط باشد.");
    return;
  }

  const { data: taken, error: checkError } = await db
    .from("profiles")
    .select("id")
    .ilike("handle", handle)
    .neq("id", currentUser.id)
    .limit(1);

  if (checkError) {
    notify("بررسی آیدی ناموفق بود: " + checkError.message);
    return;
  }

  if (taken?.length) {
    notify("این آیدی قبلاً گرفته شده است.");
    return;
  }

  const { data, error } = await db
    .from("profiles")
    .update({ handle })
    .eq("id", currentUser.id)
    .select()
    .single();

  if (error) {
    notify("ثبت آیدی ناموفق بود: " + error.message);
    return;
  }

  currentProfile = data;
  showProfile();
  notify("آیدی ثبت شد: @" + handle);
}

/* ---------- User Search ---------- */

async function searchUsers() {
  if (!currentUser) return;

  const term = cleanHandle($("search-user").value);
  const results = $("search-results");

  if (term.length < 2) {
    results.textContent = "حداقل دو حرف وارد کنید.";
    return;
  }

  results.textContent = "در حال جست‌وجو...";

  const { data, error } = await db
    .from("profiles")
    .select("id, username, display_name, handle")
    .or(`handle.ilike.%${term}%,username.ilike.%${term}%`)
    .neq("id", currentUser.id)
    .limit(30);

  if (error) {
    console.error(error);
    results.textContent = "خطا در جست‌وجو.";
    return;
  }

  if (!data?.length) {
    results.textContent = "کاربری پیدا نشد.";
    return;
  }

  results.innerHTML = data.map(user => `
    <button class="user-result"
      type="button"
      data-user-id="${escapeHTML(user.id)}">
      <strong>${escapeHTML(user.display_name || user.username)}</strong>
      <small>@${escapeHTML(user.handle || user.username)}</small>
    </button>
  `).join("");

  results.querySelectorAll("[data-user-id]").forEach(button => {
    button.addEventListener("click", () => {
      const user = data.find(u => u.id === button.dataset.userId);
      if (user) openChat(user);
    });
  });
}

/* ---------- Conversation List ---------- */

async function loadConversations() {
  if (!currentUser) return;

  const list = $("conversation-list");

  const { data: messages, error } = await db
    .from("messages")
    .select("sender_id, receiver_id, content, created_at")
    .or(`sender_id.eq.${currentUser.id},receiver_id.eq.${currentUser.id}`)
    .order("created_at", { ascending: false })
    .limit(300);

  if (error) {
    console.error(error);
    list.textContent = "خطا در دریافت گفتگوها.";
    return;
  }

  const latest = new Map();

  (messages || []).forEach(message => {
    const otherId = message.sender_id === currentUser.id
      ? message.receiver_id
      : message.sender_id;

    if (otherId && !latest.has(otherId)) latest.set(otherId, message);
  });

  const ids = [...latest.keys()];

  if (!ids.length) {
    list.innerHTML = `
      <div class="welcome-chat">
        <p>هنوز گفتگویی ندارید.</p>
        <p>برای شروع روی ذره‌بین بزنید و آیدی دوستتان را جستجو کنید.</p>
      </div>
    `;
    return;
  }

  const { data: users, error: userError } = await db
    .from("profiles")
    .select("id, username, display_name, handle")
    .in("id", ids);

  if (userError) {
    list.textContent = "خطا در دریافت کاربران.";
    return;
  }

  const sorted = (users || []).sort((a, b) => {
    const ta = new Date(latest.get(a.id)?.created_at || 0).getTime();
    const tb = new Date(latest.get(b.id)?.created_at || 0).getTime();
    return tb - ta;
  });

  list.innerHTML = sorted.map(user => {
    const last = latest.get(user.id);
    const title = user.display_name || user.username;

    return `
      <button class="conversation-item"
        type="button"
        data-user-id="${escapeHTML(user.id)}">
        <strong>${escapeHTML(title)}</strong>
        <small>@${escapeHTML(user.handle || user.username)}</small>
        <small>${escapeHTML(last?.content || "")}</small>
        <small>${escapeHTML(formatTime(last?.created_at))}</small>
      </button>
    `;
  }).join("");

  list.querySelectorAll("[data-user-id]").forEach(button => {
    button.addEventListener("click", () => {
      const user = sorted.find(u => u.id === button.dataset.userId);
      if (user) openChat(user);
    });
  });
}

/* ---------- Chat Header ---------- */

function renderChatHeader(title, subtitle, icon = "fa-solid fa-user") {
  $("chat-header").innerHTML = `
    <button id="mobile-back-btn"
      class="mobile-back-btn"
      type="button"
      aria-label="بازگشت">
      <i class="fa-solid fa-arrow-right"></i>
    </button>

    <div class="empty-avatar">
      <i class="${escapeHTML(icon)}"></i>
    </div>

    <div class="chat-header-info">
      <strong>${escapeHTML(title)}</strong>
      <p>${escapeHTML(subtitle)}</p>
    </div>

    <button id="chat-info-btn" type="button" aria-label="اطلاعات گفتگو">
      <i class="fa-solid fa-ellipsis-vertical"></i>
    </button>
  `;

  $("mobile-back-btn")?.addEventListener("click", showMobileList);

  $("chat-info-btn")?.addEventListener("click", () => {
    if (activeChat) {
      notify(
        "نام: " + (activeChat.display_name || activeChat.username) +
        "\nآیدی: @" + (activeChat.handle || activeChat.username)
      );
    } else {
      notify("پیام‌های ذخیره‌شده شما");
    }
  });
}

/* ---------- Open Chat ---------- */

async function openChat(user) {
  if (!user?.id) return;

  savedMode = false;
  activeChat = user;
  settingsOpen = false;

  setMobileTab("chats");

  renderChatHeader(
    user.display_name || user.username,
    "@" + (user.handle || user.username)
  );

  $("message-input").placeholder = "پیام خود را بنویسید...";
  $("message-input").disabled = false;

  showMobileChat();
  await loadMessages();
}

/* ---------- Load Messages ---------- */

async function loadMessages() {
  if (!activeChat || savedMode || !currentUser) return;

  const otherId = activeChat.id;

  const { data, error } = await db
    .from("messages")
    .select("*")
    .or(
      `and(sender_id.eq.${currentUser.id},receiver_id.eq.${otherId}),and(sender_id.eq.${otherId},receiver_id.eq.${currentUser.id})`
    )
    .order("created_at", { ascending: true })
    .limit(300);

  if (error) {
    console.error(error);
    $("messages").textContent = "خطا در دریافت پیام‌ها.";
    return;
  }

  const container = $("messages");

  if (!data?.length) {
    container.innerHTML = `
      <div class="welcome-chat">
        <div class="welcome-logo">B</div>
        <h2>گفتگو شروع شد</h2>
        <p>اولین پیام خود را ارسال کنید.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = data.map(message => `
    <div class="message ${message.sender_id === currentUser.id ? "sent" : "received"}">
      <div>${escapeHTML(message.content)}</div>
      <small>${escapeHTML(formatTime(message.created_at))}</small>
      <button type="button"
        class="save-message-btn"
        data-content="${escapeHTML(encodeURIComponent(message.content || ""))}">
        <i class="fa-solid fa-bookmark"></i>
        ذخیره
      </button>
    </div>
  `).join("");

  container.querySelectorAll(".save-message-btn").forEach(button => {
    button.addEventListener("click", () => {
      let content = "";
      try {
        content = decodeURIComponent(button.dataset.content);
      } catch {}
      if (content) saveMessage(content);
    });
  });

  container.scrollTop = container.scrollHeight;
}

/* ---------- Send Message ---------- */

async function sendMessage(event) {
  event.preventDefault();
  if (!currentUser) return;

  const input = $("message-input");
  const content = input.value.trim();

  if (!content) return;

  if (content.length > 5000) {
    notify("پیام بیش از حد طولانی است.");
    return;
  }

  const sendButton = $("message-form").querySelector('button[type="submit"]');
  if (sendButton) sendButton.disabled = true;

  try {
    if (savedMode) {
      const { error } = await db.from("saved_messages").insert({
        user_id: currentUser.id,
        content
      });

      if (error) throw error;

      input.value = "";
      await loadSavedMessages();
      return;
    }

    if (!activeChat) {
      notify("ابتدا یک گفتگو انتخاب کنید.");
      return;
    }

    const { error } = await db.from("messages").insert({
      sender_id: currentUser.id,
      receiver_id: activeChat.id,
      content
    });

    if (error) throw error;

    input.value = "";
    await loadMessages();
    await loadConversations();
  } catch (error) {
    console.error(error);
    notify("ارسال پیام ناموفق بود: " + error.message);
  } finally {
    if (sendButton) sendButton.disabled = false;
  }
}

/* ---------- Saved Messages ---------- */

async function saveMessage(content) {
  if (!currentUser || !content) return;

  const { error } = await db.from("saved_messages").insert({
    user_id: currentUser.id,
    content
  });

  if (error) {
    notify("ذخیره پیام ناموفق بود: " + error.message);
    return;
  }

  notify("پیام ذخیره شد.");
}

async function openSavedMessages() {
  if (!currentUser) return;

  savedMode = true;
  activeChat = null;

  setMobileTab("chats");

  renderChatHeader(
    "پیام‌های ذخیره‌شده",
    "فضای خصوصی شما",
    "fa-solid fa-bookmark"
  );

  $("message-input").placeholder = "یادداشت خصوصی بنویسید...";
  $("message-input").disabled = false;

  showMobileChat();
  await loadSavedMessages();
}

async function loadSavedMessages() {
  if (!currentUser) return;

  const { data, error } = await db
    .from("saved_messages")
    .select("*")
    .eq("user_id", currentUser.id)
    .order("created_at", { ascending: true });

  if (error) {
    $("messages").textContent = "خطا در دریافت پیام‌های ذخیره‌شده.";
    return;
  }

  const container = $("messages");

  if (!data?.length) {
    container.innerHTML = `
      <div class="welcome-chat">
        <div class="welcome-logo">B</div>
        <h2>پیام‌های ذخیره‌شده</h2>
        <p>اینجا می‌توانید پیام‌ها و یادداشت‌های خصوصی خودتان را ذخیره کنید.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = data.map(item => `
    <div class="message sent">
      <div>${escapeHTML(item.content)}</div>
      <small>${escapeHTML(formatDate(item.created_at))}</small>
      <button type="button"
        class="delete-saved-btn"
        data-id="${escapeHTML(item.id)}">
        <i class="fa-solid fa-trash"></i>
        حذف
      </button>
    </div>
  `).join("");

  container.querySelectorAll(".delete-saved-btn").forEach(button => {
    button.addEventListener("click", () => deleteSavedMessage(button.dataset.id));
  });

  container.scrollTop = container.scrollHeight;
}

async function deleteSavedMessage(id) {
  if (!currentUser || !id) return;
  if (!confirm("این پیام حذف شود؟")) return;

  const { error } = await db
    .from("saved_messages")
    .delete()
    .eq("id", id)
    .eq("user_id", currentUser.id);

  if (error) {
    notify("حذف پیام ناموفق بود: " + error.message);
    return;
  }

  await loadSavedMessages();
}

/* ---------- Realtime ---------- */

function subscribeToMessages() {
  if (!currentUser) return;

  if (realtimeChannel) {
    db.removeChannel(realtimeChannel);
    realtimeChannel = null;
  }

  realtimeChannel = db
    .channel("behy-messages-" + currentUser.id)
    .on("postgres_changes", {
      event: "INSERT",
      schema: "public",
      table: "messages"
    }, async payload => {
      const message = payload.new;

      if (
        message.sender_id === currentUser.id ||
        message.receiver_id === currentUser.id
      ) {
        await loadConversations();

        if (
          !savedMode &&
          activeChat &&
          (
            message.sender_id === activeChat.id ||
            message.receiver_id === activeChat.id
          )
        ) {
          await loadMessages();
        }
      }
    })
    .subscribe();
}

/* ---------- Tabs ---------- */

function setActiveTab(id) {
  ["chats-tab", "contacts-tab", "profile-tab"].forEach(tab => {
    $(tab)?.classList.toggle("active", tab === id);
  });
}

function showChats() {
  showMobileList();
  setActiveTab("chats-tab");
  setMobileTab("chats");

  settingsOpen = false;
  $("list-heading").textContent = "گفتگوها";
  $("search-results").innerHTML = "";
  $("conversation-list").innerHTML = "";

  if ($("message-input")) {
    $("message-input").placeholder = "پیام خود را بنویسید...";
  }

  loadConversations();
}

function showContacts() {
  showMobileList();
  setActiveTab("contacts-tab");
  setMobileTab("contacts");

  settingsOpen = false;
  $("list-heading").textContent = "مخاطبین";
  $("search-results").innerHTML = "";
  $("conversation-list").innerHTML = `
    <div class="welcome-chat">
      <div class="welcome-logo">
        <i class="fa-solid fa-users"></i>
      </div>
      <h2>مخاطبین</h2>
      <p>برای پیدا کردن کاربران بهی، ذره‌بین بالای صفحه را بزنید و آیدی را جستجو کنید.</p>
    </div>
  `;
}

/* ---------- Profile & Settings ---------- */

function showProfile() {
  if (!currentProfile) return;

  showMobileList();
  closeSearch();
  setActiveTab("profile-tab");
  setMobileTab("profile");

  settingsOpen = false;
  $("list-heading").textContent = "پروفایل";
  $("search-results").innerHTML = "";

  const handle = currentProfile.handle || "";
  const theme = localStorage.getItem(THEME_KEY) || "light";

  $("conversation-list").innerHTML = `
    <div class="welcome-chat profile-view">

      <div class="welcome-logo">
        <i class="fa-solid fa-user"></i>
      </div>

      <h2>${escapeHTML(currentProfile.display_name || currentProfile.username)}</h2>

      <p>نام کاربری</p>
      <strong>@${escapeHTML(currentProfile.username)}</strong>

      <div style="margin:18px 0;padding:16px;border-radius:14px;background:var(--hover)">
        <p style="margin:0 0 8px">آیدی اختصاصی</p>
        <strong style="font-size:20px">
          ${handle ? "@" + escapeHTML(handle) : "هنوز انتخاب نشده"}
        </strong>
      </div>

      <button id="edit-handle-btn" class="primary" type="button">
        <i class="fa-solid fa-at"></i>
        ${handle ? "تغییر آیدی" : "انتخاب آیدی"}
      </button>

      <br><br>

      <button id="edit-profile-btn" type="button">
        <i class="fa-solid fa-pen"></i>
        تغییر نام نمایشی
      </button>

      <br><br>

      <button id="profile-settings-btn" type="button">
        <i class="fa-solid fa-gear"></i>
        تنظیمات
      </button>

      <div id="profile-settings" hidden style="margin-top:14px;padding:15px;border-radius:14px;background:var(--hover)">
        <button id="theme-toggle-btn" type="button">
          <i class="fa-solid fa-moon"></i>
          تغییر پوسته (${theme === "dark" ? "تیره" : "روشن"})
        </button>

        <br><br>

        <button id="profile-about-btn" type="button">
          <i class="fa-solid fa-circle-info"></i>
          درباره بهی
        </button>

        <br><br>

        <button id="profile-logout-btn" type="button" style="color:#e45454">
          <i class="fa-solid fa-right-from-bracket"></i>
          خروج از حساب
        </button>
      </div>

    </div>
  `;

  $("edit-handle-btn")?.addEventListener("click", editHandle);
  $("edit-profile-btn")?.addEventListener("click", editProfile);

  $("profile-settings-btn")?.addEventListener("click", () => {
    const panel = $("profile-settings");
    panel.hidden = !panel.hidden;
  });

  $("theme-toggle-btn")?.addEventListener("click", toggleTheme);
  $("profile-about-btn")?.addEventListener("click", showAbout);
  $("profile-logout-btn")?.addEventListener("click", logout);
}

/* ---------- About ---------- */

function showAbout() {
  notify(
    "Behy Messenger\nپیام‌رسان بهی\n\n" +
    "نسخه آزمایشی\nپیام‌رسانی ساده و سریع"
  );
}

/* ---------- Attachments ---------- */

function handleAttachment() {
  notify(
    "ارسال فایل هنوز فعال نشده است.\n" +
    "برای فعال‌سازی باید فضای ذخیره‌سازی تنظیم شود."
  );
}

/* ---------- Logout ---------- */

async function logout() {
  if (!confirm("از حساب کاربری خارج می‌شوید؟")) return;

  if (realtimeChannel) {
    await db.removeChannel(realtimeChannel);
    realtimeChannel = null;
  }

  const { error } = await db.auth.signOut();

  if (error) {
    notify("خروج ناموفق بود: " + error.message);
    return;
  }

  currentUser = null;
  currentProfile = null;
  activeChat = null;
  savedMode = false;
  settingsOpen = false;

  $("messages").innerHTML = "";
  $("conversation-list").innerHTML = "";

  showAuth();
}

/* ---------- Initialize ---------- */

document.addEventListener("DOMContentLoaded", async () => {
  loadTheme();
  showAuth();

  // سرچ در ابتدا بسته باشد
  const searchBox = document.querySelector(".search-box");
  if (searchBox) searchBox.style.display = "none";

  $("login-tab")?.addEventListener("click", () => setAuthMode("login"));
  $("signup-tab")?.addEventListener("click", () => setAuthMode("signup"));
  $("auth-form")?.addEventListener("submit", handleAuth);

  $("search-btn")?.addEventListener("click", searchUsers);

  $("search-user")?.addEventListener("keydown", event => {
    if (event.key === "Enter") {
      event.preventDefault();
      searchUsers();
    }
  });

  $("message-form")?.addEventListener("submit", sendMessage);

  $("saved-messages-btn")?.addEventListener("click", openSavedMessages);
  $("chats-tab")?.addEventListener("click", showChats);
  $("contacts-tab")?.addEventListener("click", showContacts);
  $("profile-tab")?.addEventListener("click", showProfile);
  $("attach-btn")?.addEventListener("click", handleAttachment);

  // ذره‌بین هدر
  $("new-chat-btn")?.addEventListener("click", toggleSearch);

  // منوی پایین موبایل
  document.querySelectorAll("[data-mobile-tab]").forEach(button => {
    button.addEventListener("click", () => {
      const tab = button.dataset.mobileTab;

      if (tab === "chats") showChats();
      if (tab === "contacts") showContacts();
      if (tab === "profile") showProfile();
    });
  });

  setAuthMode("login");

  try {
    const { data, error } = await db.auth.getSession();
    if (error) throw error;
    if (data.session) await loadUser();
  } catch (error) {
    console.error("Session error:", error);
    showAuth();
  }
});
