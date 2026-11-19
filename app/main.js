
// ==========================================
// BEHY MESSENGER — MAIN.JS
// Complete mobile messenger
// ==========================================

const config = window.SUPABASE_CONFIG;
const $ = id => document.getElementById(id);

function text(id, value) {
  const el = $(id);
  if (el) el.textContent = value ?? "";
}

function html(id, value) {
  const el = $(id);
  if (el) el.innerHTML = value ?? "";
}

function safe(value) {
  return String(value ?? "").replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;",
    '"': "&quot;", "'": "&#39;"
  }[c]));
}

function notify(message) {
  alert(message);
}

if (!config?.url || !config?.anonKey || !window.supabase?.createClient) {
  alert("تنظیمات اتصال بهی پیدا نشد. فایل config.js را بررسی کنید.");
  throw new Error("Supabase configuration missing");
}

const db = window.supabase.createClient(config.url, config.anonKey);

let currentUser = null;
let currentProfile = null;
let activeChat = null;
let realtimeChannel = null;
let authMode = "login";
let savedMode = false;
let busy = false;
let searchOpen = false;

const THEME_KEY = "behy-theme";

// ---------- Theme ----------

function applyTheme(theme) {
  const dark = theme === "dark";
  document.body.classList.toggle("dark", dark);
  document.documentElement.dataset.theme = dark ? "dark" : "light";

  const vars = document.documentElement.style;

  if (dark) {
    vars.setProperty("--bg", "#101923");
    vars.setProperty("--surface", "#172532");
    vars.setProperty("--text", "#edf4fa");
    vars.setProperty("--muted", "#9aabba");
    vars.setProperty("--border", "#293b4b");
    vars.setProperty("--hover", "#203343");
  } else {
    vars.setProperty("--bg", "#f4f7fb");
    vars.setProperty("--surface", "#ffffff");
    vars.setProperty("--text", "#17212b");
    vars.setProperty("--muted", "#8193a5");
    vars.setProperty("--border", "#e6edf3");
    vars.setProperty("--hover", "#f0f6fc");
  }

  localStorage.setItem(THEME_KEY, theme);
}

function toggleTheme() {
  const current = localStorage.getItem(THEME_KEY) || "light";
  applyTheme(current === "dark" ? "light" : "dark");
  if (currentProfile) showProfile();
}

// ---------- Navigation ----------

function showAuth() {
  if ($("auth-section")) $("auth-section").hidden = false;
  if ($("chat-section")) $("chat-section").hidden = true;
}

function showChatApp() {
  if ($("auth-section")) $("auth-section").hidden = true;
  if ($("chat-section")) $("chat-section").hidden = false;
}

function mobileList() {
  $("chat-layout")?.classList.remove("chat-open");
  $("chat-layout")?.classList.remove("mobile-chat-open");
}

function mobileChat() {
  if (window.matchMedia("(max-width:700px)").matches) {
    $("chat-layout")?.classList.add("chat-open");
  }
}

function mobileTab(tab) {
  document.querySelectorAll("[data-mobile-tab]").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.mobileTab === tab);
  });
}

function activeTab(id) {
  ["chats-tab", "contacts-tab", "profile-tab"].forEach(tab => {
    $(tab)?.classList.toggle("active", tab === id);
  });
}

// ---------- Search ----------

function toggleSearch() {
  const box = document.querySelector(".search-box");
  if (!box) return;

  searchOpen = !searchOpen;
  box.style.display = searchOpen ? "flex" : "none";

  if (searchOpen) {
    showChats();
    $("search-user")?.focus();
  } else {
    if ($("search-user")) $("search-user").value = "";
    html("search-results", "");
  }
}

function closeSearch() {
  searchOpen = false;
  const box = document.querySelector(".search-box");
  if (box) box.style.display = "none";
  if ($("search-user")) $("search-user").value = "";
  html("search-results", "");
}

// ---------- Authentication ----------

function setAuthMode(mode) {
  authMode = mode;

  $("login-tab")?.classList.toggle("primary", mode === "login");
  $("signup-tab")?.classList.toggle("primary", mode === "signup");

  text("auth-submit", mode === "signup" ? "ساخت حساب کاربری" : "ورود به حساب");

  if ($("password")) {
    $("password").autocomplete =
      mode === "signup" ? "new-password" : "current-password";
  }

  text("auth-message",
    mode === "signup"
      ? "نام کاربری و رمز عبور را وارد کنید."
      : "اطلاعات حساب خود را وارد کنید."
  );
}

function authMessage(message, error = false) {
  text("auth-message", message);
  const el = $("auth-message");
  if (el) el.style.color = error ? "#d33" : "#2481d7";
}

async function handleAuth(event) {
  event.preventDefault();
  if (busy) return;

  const username = ($("username")?.value || "").trim().toLowerCase();
  const password = $("password")?.value || "";

  if (!/^[a-z0-9_]{3,24}$/.test(username)) {
    authMessage("نام کاربری باید ۳ تا ۲۴ حرف انگلیسی، عدد یا زیرخط باشد.", true);
    return;
  }

  if (password.length < 8 || password.length > 128) {
    authMessage("رمز عبور باید بین ۸ تا ۱۲۸ کاراکتر باشد.", true);
    return;
  }

  busy = true;
  const button = $("auth-submit");
  if (button) {
    button.disabled = true;
    text("auth-submit", "در حال اتصال...");
  }

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
      throw new Error(result.error || "ورود ناموفق بود.");
    }

    const { error } = await db.auth.setSession({
      access_token: result.session.access_token,
      refresh_token: result.session.refresh_token
    });

    if (error) throw error;
    await loadUser();
  } catch (e) {
    console.error(e);
    authMessage(e.message || "اتصال ناموفق بود.", true);
  } finally {
    busy = false;
    if (button) button.disabled = false;
    text("auth-submit", authMode === "signup" ? "ساخت حساب کاربری" : "ورود به حساب");
  }
}

// ---------- Load Profile ----------

async function loadUser() {
  try {
    const { data, error } = await db.auth.getUser();
    if (error || !data?.user) {
      showAuth();
      return;
    }

    currentUser = data.user;

    const username =
      currentUser.user_metadata?.username ||
      currentUser.email?.split("@")[0] ||
      "user";

    const { data: profile, error: profileError } = await db
      .from("profiles")
      .select("*")
      .eq("id", currentUser.id)
      .maybeSingle();

    if (profileError) throw profileError;

    if (profile) {
      currentProfile = profile;
    } else {
      const { data: newProfile, error: insertError } = await db
        .from("profiles")
        .insert({
          id: currentUser.id,
          username,
          display_name: currentUser.user_metadata?.display_name || username
        })
        .select()
        .single();

      if (insertError) throw insertError;
      currentProfile = newProfile;
    }

    // Safe: no crash if current-user is missing from HTML
    text("current-user", currentProfile.display_name || currentProfile.username);

    showChatApp();
    closeSearch();
    showChats();
    subscribeMessages();
  } catch (e) {
    console.error("Load profile:", e);
    notify("خطا در ورود یا دریافت پروفایل: " + e.message);
    showAuth();
  }
}

// ---------- Edit Profile ----------

async function editProfile() {
  if (!currentProfile) return;

  const old = currentProfile.display_name || currentProfile.username;
  const input = prompt("نام نمایشی جدید:", old);
  if (input === null) return;

  const name = input.trim();
  if (name.length < 2 || name.length > 40) {
    notify("نام باید بین ۲ تا ۴۰ کاراکتر باشد.");
    return;
  }

  const { data, error } = await db.from("profiles")
    .update({ display_name: name })
    .eq("id", currentUser.id)
    .select()
    .single();

  if (error) {
    notify("ویرایش نام ناموفق بود: " + error.message);
    return;
  }

  currentProfile = data;
  text("current-user", data.display_name);
  showProfile();
}

// ---------- Custom ID ----------

async function editHandle() {
  if (!currentUser || !currentProfile) return;

  const input = prompt(
    "آیدی اختصاصی (انگلیسی، عدد و زیرخط):",
    currentProfile.handle || ""
  );

  if (input === null) return;

  const handle = input.trim().replace(/^@/, "").toLowerCase();

  if (!/^[a-z0-9_]{3,24}$/.test(handle)) {
    notify("آیدی باید ۳ تا ۲۴ حرف، عدد یا زیرخط باشد.");
    return;
  }

  const { data: found, error: checkError } = await db
    .from("profiles")
    .select("id")
    .ilike("handle", handle)
    .neq("id", currentUser.id)
    .limit(1);

  if (checkError) {
    notify("بررسی آیدی ناموفق بود: " + checkError.message);
    return;
  }

  if (found?.length) {
    notify("این آیدی قبلاً انتخاب شده است.");
    return;
  }

  const { data, error } = await db.from("profiles")
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
  notify("آیدی شما ثبت شد: @" + handle);
}

// ---------- Search Users ----------

async function searchUsers() {
  if (!currentUser) return;

  const term = ($("search-user")?.value || "")
    .trim().replace(/^@/, "");

  const results = $("search-results");
  if (!results) return;

  if (term.length < 2) {
    results.textContent = "حداقل دو حرف وارد کنید.";
    return;
  }

  results.textContent = "در حال جستجو...";

  const { data, error } = await db
    .from("profiles")
    .select("id, username, display_name, handle")
    .or(`handle.ilike.%${term}%,username.ilike.%${term}%`)
    .neq("id", currentUser.id)
    .limit(30);

  if (error) {
    console.error(error);
    results.textContent = "جستجو ناموفق بود.";
    return;
  }

  if (!data?.length) {
    results.textContent = "کاربری پیدا نشد.";
    return;
  }

  results.innerHTML = data.map(u => `
    <button class="user-result" type="button" data-user-id="${safe(u.id)}">
      <strong>${safe(u.display_name || u.username)}</strong>
      <small>@${safe(u.handle || u.username)}</small>
    </button>
  `).join("");

  results.querySelectorAll("[data-user-id]").forEach(btn => {
    btn.addEventListener("click", () => {
      const user = data.find(u => u.id === btn.dataset.userId);
      if (user) openChat(user);
    });
  });
}

// ---------- Conversation List ----------

async function loadConversations() {
  if (!currentUser) return;

  const list = $("conversation-list");
  if (!list) return;

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

  (messages || []).forEach(m => {
    const other = m.sender_id === currentUser.id ? m.receiver_id : m.sender_id;
    if (other && !latest.has(other)) latest.set(other, m);
  });

  const ids = [...latest.keys()];

  if (!ids.length) {
    list.innerHTML = `
      <div class="welcome-chat">
        <p>هنوز گفتگویی ندارید.</p>
        <p>برای شروع روی ذره‌بین بزنید و آیدی جستجو کنید.</p>
      </div>`;
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

  const sorted = (users || []).sort((a, b) =>
    new Date(latest.get(b.id)?.created_at || 0) -
    new Date(latest.get(a.id)?.created_at || 0)
  );

  list.innerHTML = sorted.map(u => {
    const last = latest.get(u.id);
    return `
      <button class="conversation-item" type="button" data-user-id="${safe(u.id)}">
        <strong>${safe(u.display_name || u.username)}</strong>
        <small>@${safe(u.handle || u.username)}</small>
        <small>${safe(last?.content || "")}</small>
      </button>`;
  }).join("");

  list.querySelectorAll("[data-user-id]").forEach(btn => {
    btn.addEventListener("click", () => {
      const u = sorted.find(x => x.id === btn.dataset.userId);
      if (u) openChat(u);
    });
  });
}

// ---------- Chat Header ----------

function renderHeader(title, subtitle, icon = "fa-solid fa-user") {
  const header = $("chat-header");
  if (!header) return;

  header.innerHTML = `
    <button id="mobile-back-btn" type="button" aria-label="بازگشت">
      <i class="fa-solid fa-arrow-right"></i>
    </button>
    <div class="empty-avatar"><i class="${safe(icon)}"></i></div>
    <div class="chat-header-info">
      <strong>${safe(title)}</strong>
      <p>${safe(subtitle)}</p>
    </div>
    <button id="chat-info-btn" type="button" aria-label="اطلاعات">
      <i class="fa-solid fa-ellipsis-vertical"></i>
    </button>`;

  $("mobile-back-btn")?.addEventListener("click", mobileList);
  $("chat-info-btn")?.addEventListener("click", () => {
    if (activeChat) {
      notify("نام: " + (activeChat.display_name || activeChat.username) +
        "\nآیدی: @" + (activeChat.handle || activeChat.username));
    } else {
      notify("پیام‌های ذخیره‌شده شما");
    }
  });
}

// ---------- Open Chat ----------

async function openChat(user) {
  if (!user?.id) return;

  savedMode = false;
  activeChat = user;
  mobileTab("chats");

  renderHeader(
    user.display_name || user.username,
    "@" + (user.handle || user.username)
  );

  if ($("message-input")) {
    $("message-input").disabled = false;
    $("message-input").placeholder = "پیام خود را بنویسید...";
  }

  mobileChat();
  await loadMessages();
}

// ---------- Load Messages ----------

async function loadMessages() {
  if (!currentUser || !activeChat || savedMode) return;

  const other = activeChat.id;
  const container = $("messages");
  if (!container) return;

  const { data, error } = await db.from("messages")
    .select("*")
    .or(`and(sender_id.eq.${currentUser.id},receiver_id.eq.${other}),and(sender_id.eq.${other},receiver_id.eq.${currentUser.id})`)
    .order("created_at", { ascending: true })
    .limit(300);

  if (error) {
    console.error(error);
    container.textContent = "خطا در دریافت پیام‌ها.";
    return;
  }

  if (!data?.length) {
    container.innerHTML = `
      <div class="welcome-chat">
        <div class="welcome-logo">B</div>
        <h2>گفتگو شروع شد</h2>
        <p>اولین پیام خود را ارسال کنید.</p>
      </div>`;
    return;
  }

  container.innerHTML = data.map(m => `
    <div class="message ${m.sender_id === currentUser.id ? "sent" : "received"}">
      <div>${safe(m.content)}</div>
      <small>${safe(new Date(m.created_at).toLocaleTimeString("fa-IR", {
        hour: "2-digit", minute: "2-digit"
      }))}</small>
      <button class="save-message-btn" type="button"
        data-content="${safe(encodeURIComponent(m.content || ""))}">
        <i class="fa-solid fa-bookmark"></i> ذخیره
      </button>
    </div>`).join("");

  container.querySelectorAll(".save-message-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      try {
        saveMessage(decodeURIComponent(btn.dataset.content || ""));
      } catch {}
    });
  });

  container.scrollTop = container.scrollHeight;
}

// ---------- Send Messages ----------

async function sendMessage(event) {
  event.preventDefault();

  if (!currentUser) return;

  const input = $("message-input");
  const content = (input?.value || "").trim();

  if (!content) return;
  if (content.length > 5000) {
    notify("پیام خیلی طولانی است.");
    return;
  }

  const send = $("message-form")?.querySelector('[type="submit"]');
  if (send) send.disabled = true;

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
  } catch (e) {
    console.error(e);
    notify("ارسال پیام ناموفق: " + e.message);
  } finally {
    if (send) send.disabled = false;
  }
}

// ---------- Saved Messages ----------

async function saveMessage(content) {
  if (!currentUser || !content) return;

  const { error } = await db.from("saved_messages").insert({
    user_id: currentUser.id,
    content
  });

  if (error) {
    notify("ذخیره پیام ناموفق: " + error.message);
    return;
  }

  notify("پیام ذخیره شد.");
}

async function openSaved() {
  if (!currentUser) return;

  savedMode = true;
  activeChat = null;
  mobileTab("chats");

  renderHeader("پیام‌های ذخیره‌شده", "فضای خصوصی شما", "fa-solid fa-bookmark");

  if ($("message-input")) {
    $("message-input").disabled = false;
    $("message-input").placeholder = "یادداشت خصوصی بنویسید...";
  }

  mobileChat();
  await loadSavedMessages();
}

async function loadSavedMessages() {
  if (!currentUser) return;

  const container = $("messages");
  if (!container) return;

  const { data, error } = await db.from("saved_messages")
    .select("*")
    .eq("user_id", currentUser.id)
    .order("created_at", { ascending: true });

  if (error) {
    container.textContent = "خطا در دریافت پیام‌های ذخیره‌شده.";
    return;
  }

  if (!data?.length) {
    container.innerHTML = `
      <div class="welcome-chat">
        <div class="welcome-logo">B</div>
        <h2>پیام‌های ذخیره‌شده</h2>
        <p>یادداشت‌های خصوصی شما اینجا قرار می‌گیرند.</p>
      </div>`;
    return;
  }

  container.innerHTML = data.map(item => `
    <div class="message sent">
      <div>${safe(item.content)}</div>
      <small>${safe(new Date(item.created_at).toLocaleString("fa-IR"))}</small>
      <button class="delete-saved-btn" type="button" data-id="${safe(item.id)}">
        <i class="fa-solid fa-trash"></i> حذف
      </button>
    </div>`).join("");

  container.querySelectorAll(".delete-saved-btn").forEach(btn => {
    btn.addEventListener("click", () => deleteSaved(btn.dataset.id));
  });

  container.scrollTop = container.scrollHeight;
}

async function deleteSaved(id) {
  if (!currentUser || !id || !confirm("این پیام حذف شود؟")) return;

  const { error } = await db.from("saved_messages")
    .delete()
    .eq("id", id)
    .eq("user_id", currentUser.id);

  if (error) {
    notify("حذف ناموفق: " + error.message);
    return;
  }

  await loadSavedMessages();
}

// ---------- Realtime ----------

function subscribeMessages() {
  if (!currentUser) return;

  if (realtimeChannel) {
    db.removeChannel(realtimeChannel);
  }

  realtimeChannel = db.channel("behy-" + currentUser.id)
    .on("postgres_changes", {
      event: "INSERT",
      schema: "public",
      table: "messages"
    }, async payload => {
      const m = payload.new;

      if (m.sender_id !== currentUser.id && m.receiver_id !== currentUser.id) {
        return;
      }

      await loadConversations();

      if (!savedMode && activeChat &&
        (m.sender_id === activeChat.id || m.receiver_id === activeChat.id)) {
        await loadMessages();
      }
    })
    .subscribe();
}

// ---------- Main Tabs ----------

function showChats() {
  mobileList();
  activeTab("chats-tab");
  mobileTab("chats");

  text("list-heading", "گفتگوها");
  html("search-results", "");
  html("conversation-list", "");

  if ($("message-input")) {
    $("message-input").placeholder = "پیام خود را بنویسید...";
  }

  loadConversations();
}

function showContacts() {
  mobileList();
  activeTab("contacts-tab");
  mobileTab("contacts");

  text("list-heading", "مخاطبین");
  html("search-results", "");

  html("conversation-list", `
    <div class="welcome-chat">
      <div class="welcome-logo"><i class="fa-solid fa-users"></i></div>
      <h2>مخاطبین</h2>
      <p>برای پیدا کردن کاربران، ذره‌بین را بزنید و آیدی را جستجو کنید.</p>
    </div>`);
}

// ---------- Profile ----------

function showProfile() {
  if (!currentProfile) return;

  mobileList();
  closeSearch();
  activeTab("profile-tab");
  mobileTab("profile");

  text("list-heading", "پروفایل");

  const handle = currentProfile.handle || "";
  const theme = localStorage.getItem(THEME_KEY) || "light";

  html("conversation-list", `
    <div class="welcome-chat profile-view">
      <div class="welcome-logo"><i class="fa-solid fa-user"></i></div>

      <h2>${safe(currentProfile.display_name || currentProfile.username)}</h2>

      <p>نام کاربری</p>
      <strong>@${safe(currentProfile.username)}</strong>

      <div style="margin:18px 0;padding:16px;border-radius:14px;background:var(--hover)">
        <p>آیدی اختصاصی</p>
        <strong style="font-size:20px">
          ${handle ? "@" + safe(handle) : "انتخاب نشده"}
        </strong>
      </div>

      <button id="edit-handle-btn" class="primary" type="button">
        <i class="fa-solid fa-at"></i>
        ${handle ? "تغییر آیدی" : "انتخاب آیدی"}
      </button>

      <br><br>

      <button id="edit-profile-btn" type="button">
        <i class="fa-solid fa-pen"></i> تغییر نام نمایشی
      </button>

      <br><br>

      <button id="profile-settings-btn" type="button">
        <i class="fa-solid fa-gear"></i> تنظیمات
      </button>

      <div id="profile-settings" hidden style="margin-top:15px;padding:15px;background:var(--hover);border-radius:14px">
        <button id="theme-toggle-btn" type="button">
          <i class="fa-solid fa-moon"></i>
          تغییر پوسته (${theme === "dark" ? "تیره" : "روشن"})
        </button>

        <br><br>

        <button id="profile-about-btn" type="button">
          <i class="fa-solid fa-circle-info"></i> درباره بهی
        </button>

        <br><br>

        <button id="profile-logout-btn" type="button" style="color:#e45454">
          <i class="fa-solid fa-right-from-bracket"></i> خروج از حساب
        </button>
      </div>
    </div>`);

  $("edit-handle-btn")?.addEventListener("click", editHandle);
  $("edit-profile-btn")?.addEventListener("click", editProfile);

  $("profile-settings-btn")?.addEventListener("click", () => {
    const panel = $("profile-settings");
    if (panel) panel.hidden = !panel.hidden;
  });

  $("theme-toggle-btn")?.addEventListener("click", toggleTheme);
  $("profile-about-btn")?.addEventListener("click", showAbout);
  $("profile-logout-btn")?.addEventListener("click", logout);
}

// ---------- About ----------

function showAbout() {
  notify("بهی مسنجر\nنسخه آزمایشی\nپیام‌رسان ساده و سریع");
}

// ---------- Attachments ----------

function handleAttachment() {
  notify("ارسال فایل هنوز فعال نشده است.");
}

// ---------- Logout ----------

async function logout() {
  if (!confirm("از حساب خارج می‌شوید؟")) return;

  if (realtimeChannel) {
    await db.removeChannel(realtimeChannel);
    realtimeChannel = null;
  }

  const { error } = await db.auth.signOut();
  if (error) {
    notify("خروج ناموفق: " + error.message);
    return;
  }

  currentUser = null;
  currentProfile = null;
  activeChat = null;
  savedMode = false;

  html("messages", "");
  html("conversation-list", "");
  showAuth();
}

// ---------- Initialize ----------

document.addEventListener("DOMContentLoaded", async () => {
  applyTheme(localStorage.getItem(THEME_KEY) || "light");
  showAuth();

  const searchBox = document.querySelector(".search-box");
  if (searchBox) searchBox.style.display = "none";

  $("login-tab")?.addEventListener("click", () => setAuthMode("login"));
  $("signup-tab")?.addEventListener("click", () => setAuthMode("signup"));
  $("auth-form")?.addEventListener("submit", handleAuth);

  $("search-btn")?.addEventListener("click", searchUsers);

  $("search-user")?.addEventListener("keydown", e => {
    if (e.key === "Enter") {
      e.preventDefault();
      searchUsers();
    }
  });

  $("message-form")?.addEventListener("submit", sendMessage);

  $("saved-messages-btn")?.addEventListener("click", openSaved);
  $("chats-tab")?.addEventListener("click", showChats);
  $("contacts-tab")?.addEventListener("click", showContacts);
  $("profile-tab")?.addEventListener("click", showProfile);
  $("attach-btn")?.addEventListener("click", handleAttachment);
  $("new-chat-btn")?.addEventListener("click", toggleSearch);

  document.querySelectorAll("[data-mobile-tab]").forEach(btn => {
    btn.addEventListener("click", () => {
      const tab = btn.dataset.mobileTab;
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
  } catch (e) {
    console.error("Session error:", e);
    showAuth();
  }
});
