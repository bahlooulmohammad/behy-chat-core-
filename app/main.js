
/* =========================================
   BEHY MESSENGER
   Main application script
========================================= */

const config = window.SUPABASE_CONFIG;

if (!config || !config.url || !config.anonKey) {
  alert("تنظیمات اتصال به سرور پیدا نشد.");
  throw new Error("Supabase configuration missing");
}

if (!window.supabase?.createClient) {
  alert("کتابخانه اتصال به سرور بارگذاری نشده است.");
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

function isMobile() {
  return window.matchMedia("(max-width: 760px)").matches;
}

function notify(message) {
  alert(message);
}

function setBusy(button, busy, text) {
  if (!button) return;

  button.disabled = busy;

  if (busy) {
    button.dataset.oldText = button.textContent;
    button.textContent = text || "لطفاً صبر کنید...";
  } else if (button.dataset.oldText) {
    button.textContent = button.dataset.oldText;
    delete button.dataset.oldText;
  }
}

function showMessage(message, type = "info") {
  const el = $("auth-message");

  if (!el) {
    notify(message);
    return;
  }

  el.textContent = message;
  el.style.color = type === "error" ? "#d33" : "#2481d7";
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

/* ---------- Theme ---------- */

function applyTheme(theme) {
  const dark = theme === "dark";

  document.documentElement.dataset.theme = dark ? "dark" : "light";

  const root = document.documentElement.style;

  if (dark) {
    root.setProperty("--bg", "#101923");
    root.setProperty("--white", "#172532");
    root.setProperty("--text", "#edf4fa");
    root.setProperty("--muted", "#9aabba");
    root.setProperty("--border", "#293b4b");
    root.setProperty("--hover", "#203343");
    root.setProperty("--green", "#244c3a");
  } else {
    root.setProperty("--bg", "#f4f7fb");
    root.setProperty("--white", "#ffffff");
    root.setProperty("--text", "#17212b");
    root.setProperty("--muted", "#8193a5");
    root.setProperty("--border", "#e6edf3");
    root.setProperty("--hover", "#f0f6fc");
    root.setProperty("--green", "#d9fdd3");
  }

  localStorage.setItem(THEME_KEY, dark ? "dark" : "light");
}

function loadTheme() {
  applyTheme(localStorage.getItem(THEME_KEY) || "light");
}

function toggleTheme() {
  const current = localStorage.getItem(THEME_KEY) || "light";
  applyTheme(current === "dark" ? "light" : "dark");
  openSettings();
}

/* ---------- Mobile navigation ---------- */

function setMobileTab(tab) {
  document.querySelectorAll("[data-mobile-tab]").forEach(button => {
    button.classList.toggle("active", button.dataset.mobileTab === tab);
  });
}

function showMobileList() {
  $("chat-layout")?.classList.remove("mobile-chat-open");
}

function showMobileChat() {
  if (isMobile()) {
    $("chat-layout")?.classList.add("mobile-chat-open");
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

/* ---------- Authentication ---------- */

function setAuthMode(mode) {
  authMode = mode;

  $("login-tab")?.classList.toggle("primary", mode === "login");
  $("signup-tab")?.classList.toggle("primary", mode === "signup");

  if ($("password")) {
    $("password").autocomplete =
      mode === "signup" ? "new-password" : "current-password";
  }

  if ($("auth-submit")) {
    $("auth-submit").textContent =
      mode === "signup" ? "ساخت حساب کاربری" : "ورود به حساب";
  }

  showMessage(
    mode === "signup"
      ? "نام کاربری و رمز عبور را وارد کنید."
      : "اطلاعات حساب خود را وارد کنید."
  );
}

async function handleAuth(event) {
  event.preventDefault();

  if (isBusy) return;

  const username = cleanUsername($("username")?.value);
  const password = $("password")?.value || "";
  const submit = $("auth-submit");

  if (!/^[a-z0-9_]{3,24}$/.test(username)) {
    showMessage(
      "نام کاربری باید ۳ تا ۲۴ حرف انگلیسی، عدد یا زیرخط باشد.",
      "error"
    );
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

    let result;

    try {
      result = await response.json();
    } catch {
      throw new Error("پاسخ سرور قابل خواندن نیست.");
    }

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
    console.error("Authentication error:", error);
    showMessage(error.message || "ارتباط با سرور برقرار نشد.", "error");
  } finally {
    isBusy = false;
    setBusy(submit, false);
  }
}

/* ---------- User profile ---------- */

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

  const { data: profile, error: profileError } = await db
    .from("profiles")
    .upsert({
      id: currentUser.id,
      username,
      display_name:
        currentUser.user_metadata?.display_name || username
    }, { onConflict: "id" })
    .select()
    .single();

  if (profileError) {
    console.error("Profile error:", profileError);
    notify("خطا در دریافت پروفایل: " + profileError.message);
    return;
  }

  currentProfile = profile;

  $("current-user").textContent =
    profile.display_name || profile.username;

  showChat();
  showChats();

  await loadConversations();
  subscribeToMessages();
}

async function editProfile() {
  if (!currentProfile) return;

  const oldName =
    currentProfile.display_name || currentProfile.username;

  const newName = prompt("نام نمایشی جدید را وارد کنید:", oldName);

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
    console.error(error);
    notify("ویرایش پروفایل انجام نشد: " + error.message);
    return;
  }

  currentProfile = data;
  $("current-user").textContent = data.display_name;

  showProfile();
  notify("نام نمایشی با موفقیت تغییر کرد.");
}

/* ---------- Search users ---------- */

async function searchUsers() {
  if (!currentUser) return;

  const term = cleanUsername($("search-user")?.value);
  const results = $("search-results");

  if (term.length < 2) {
    results.textContent = "حداقل دو حرف وارد کنید.";
    return;
  }

  results.textContent = "در حال جست‌وجو...";

  const { data, error } = await db
    .from("profiles")
    .select("id, username, display_name")
    .ilike("username", `%${term}%`)
    .neq("id", currentUser.id)
    .limit(20);

  if (error) {
    console.error(error);
    results.textContent = "خطا در جست‌وجوی کاربران.";
    return;
  }

  if (!data.length) {
    results.textContent = "کاربری پیدا نشد.";
    return;
  }

  results.innerHTML = data.map(user => `
    <button class="user-result"
      type="button"
      data-user-id="${escapeHTML(user.id)}">
      ${escapeHTML(user.display_name || user.username)}
      <small>@${escapeHTML(user.username)}</small>
    </button>
  `).join("");

  results.querySelectorAll("[data-user-id]").forEach(button => {
    button.addEventListener("click", () => {
      const user = data.find(u => u.id === button.dataset.userId);
      if (user) openChat(user);
    });
  });
}

/* ---------- Conversations ---------- */

async function loadConversations() {
  if (!currentUser) return;

  const list = $("conversation-list");

  const { data: messages, error } = await db
    .from("messages")
    .select("sender_id, receiver_id, content, created_at")
    .or(
      `sender_id.eq.${currentUser.id},receiver_id.eq.${currentUser.id}`
    )
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) {
    console.error("Conversation error:", error);
    list.textContent = "خطا در دریافت گفتگوها.";
    return;
  }

  const latest = new Map();

  messages.forEach(message => {
    const otherId =
      message.sender_id === currentUser.id
        ? message.receiver_id
        : message.sender_id;

    if (otherId && !latest.has(otherId)) {
      latest.set(otherId, message);
    }
  });

  const ids = [...latest.keys()];

  if (!ids.length) {
    list.textContent = "هنوز گفت‌وگویی ندارید.";
    return;
  }

  const { data: users, error: userError } = await db
    .from("profiles")
    .select("id, username, display_name")
    .in("id", ids);

  if (userError) {
    console.error(userError);
    list.textContent = "خطا در دریافت کاربران.";
    return;
  }

  const sortedUsers = users.sort((a, b) => {
    const aTime = new Date(latest.get(a.id)?.created_at || 0).getTime();
    const bTime = new Date(latest.get(b.id)?.created_at || 0).getTime();
    return bTime - aTime;
  });

  list.innerHTML = sortedUsers.map(user => {
    const last = latest.get(user.id);

    return `
      <button class="conversation-item"
        type="button"
        data-user-id="${escapeHTML(user.id)}">
        <strong>${escapeHTML(user.display_name || user.username)}</strong>
        <small>@${escapeHTML(user.username)}</small>
        <small>${escapeHTML(last?.content || "")}</small>
        <small>${escapeHTML(formatTime(last?.created_at))}</small>
      </button>
    `;
  }).join("");

  list.querySelectorAll("[data-user-id]").forEach(button => {
    button.addEventListener("click", () => {
      const user = sortedUsers.find(u => u.id === button.dataset.userId);
      if (user) openChat(user);
    });
  });
}

/* ---------- Chat header ---------- */

function renderChatHeader(title, subtitle, icon) {
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

    <div>
      <strong>${escapeHTML(title)}</strong>
      <p>${escapeHTML(subtitle)}</p>
    </div>

    <div class="chat-actions">
      <button id="chat-info-btn"
        type="button"
        aria-label="اطلاعات">
        <i class="fa-solid fa-ellipsis-vertical"></i>
      </button>
    </div>
  `;

  $("mobile-back-btn")?.addEventListener("click", showMobileList);

  $("chat-info-btn")?.addEventListener("click", () => {
    if (activeChat) {
      notify(
        "گفتگو با " +
        (activeChat.display_name || activeChat.username) +
        "\nنام کاربری: @" + activeChat.username
      );
    } else {
      notify("پیام‌های ذخیره‌شده شما");
    }
  });
}

/* ---------- Open chat ---------- */

async function openChat(user) {
  if (!user || !user.id) return;

  savedMode = false;
  activeChat = user;

  setMobileTab("chats");

  renderChatHeader(
    user.display_name || user.username,
    "@" + user.username,
    "fa-solid fa-user"
  );

  $("message-input").placeholder = "پیام خود را بنویسید...";
  $("message-input").disabled = false;

  showMobileChat();
  await loadMessages();
}

/* ---------- Load messages ---------- */

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
    console.error("Message loading error:", error);
    $("messages").textContent = "خطا در دریافت پیام‌ها.";
    return;
  }

  const container = $("messages");

  if (!data.length) {
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
    <div class="message ${
      message.sender_id === currentUser.id ? "sent" : "received"
    }">
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
      } catch {
        content = "";
      }

      if (content) saveMessage(content);
    });
  });

  container.scrollTop = container.scrollHeight;
}

/* ---------- Send messages ---------- */

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

  const sendButton = $("message-form")?.querySelector(
    'button[type="submit"]'
  );

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
    console.error("Send message error:", error);
    notify("ارسال پیام ناموفق بود: " + error.message);
  } finally {
    if (sendButton) sendButton.disabled = false;
  }
}

/* ---------- Saved messages ---------- */

async function saveMessage(content) {
  if (!currentUser || !content) return;

  const { error } = await db.from("saved_messages").insert({
    user_id: currentUser.id,
    content
  });

  if (error) {
    console.error(error);
    notify("ذخیره پیام ناموفق بود: " + error.message);
    return;
  }

  notify("پیام در پیام‌های ذخیره‌شده ثبت شد.");
}

async function openSavedMessages() {
  if (!currentUser) return;

  savedMode = true;
  activeChat = null;

  setMobileTab("saved");

  renderChatHeader(
    "پیام‌های ذخیره‌شده",
    "فضای خصوصی شما",
    "fa-solid fa-bookmark"
  );

  $("message-input").placeholder = "یادداشت خصوصی خود را بنویسید...";
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
    console.error(error);
    $("messages").textContent = "خطا در دریافت پیام‌های ذخیره‌شده.";
    return;
  }

  const container = $("messages");

  if (!data.length) {
    container.innerHTML = `
      <div class="welcome-chat">
        <div class="welcome-logo">B</div>
        <h2>پیام‌های ذخیره‌شده</h2>
        <p>هنوز چیزی ذخیره نکرده‌اید. یادداشت خود را در کادر پایین بنویسید.</p>
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
    button.addEventListener("click", () => {
      deleteSavedMessage(button.dataset.id);
    });
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
    .subscribe(status => {
      console.log("Realtime status:", status);
    });
}

/* ---------- Main tabs ---------- */

function setActiveTab(id) {
  ["chats-tab", "contacts-tab", "profile-tab"].forEach(tab => {
    $(tab)?.classList.toggle("active", tab === id);
  });
}

function showProfile() {
  if (!currentProfile) return;

  showMobileList();
  setActiveTab("profile-tab");
  setMobileTab("profile");

  $("list-heading").textContent = "پروفایل من";
  $("search-results").innerHTML = "";

  $("conversation-list").innerHTML = `
    <div class="welcome-chat">
      <div class="welcome-logo">B</div>
      <h3>${escapeHTML(
        currentProfile.display_name || currentProfile.username
      )}</h3>
      <p>@${escapeHTML(currentProfile.username)}</p>
      <p>شناسه حساب:</p>
      <small>${escapeHTML(currentUser.id)}</small>
      <br><br>
      <button type="button" id="edit-profile-btn" class="primary">
        <i class="fa-solid fa-pen"></i>
        ویرایش نام نمایشی
      </button>
    </div>
  `;

  $("edit-profile-btn")?.addEventListener("click", editProfile);
}

function showContacts() {
  showMobileList();
  setActiveTab("contacts-tab");
  setMobileTab("contacts");

  $("list-heading").textContent = "مخاطبین";
  $("search-results").textContent =
    "برای پیدا کردن مخاطب، نام کاربری را جست‌وجو کنید.";
  $("conversation-list").innerHTML = "";
}

function showChats() {
  showMobileList();
  setActiveTab("chats-tab");
  setMobileTab("chats");

  $("list-heading").textContent = "گفتگوهای من";
  $("search-results").innerHTML = "";

  if ($("message-input")) {
    $("message-input").placeholder = "پیام خود را بنویسید...";
  }

  loadConversations();
}

/* ---------- Settings ---------- */

function openSettings() {
  if (!currentUser) return;

  showMobileList();
  setMobileTab("settings");

  const currentTheme = localStorage.getItem(THEME_KEY) || "light";

  $("list-heading").textContent = "تنظیمات";

  $("search-results").innerHTML = "";

  $("conversation-list").innerHTML = `
    <div class="welcome-chat">
      <div class="welcome-logo">
        <i class="fa-solid fa-gear"></i>
      </div>

      <h3>تنظیمات بهی</h3>
      <p>تنظیمات ظاهری و حساب کاربری</p>

      <br>

      <button type="button" id="theme-toggle-btn">
        <i class="fa-solid fa-moon"></i>
        تغییر پوسته
        (${currentTheme === "dark" ? "تیره" : "روشن"})
      </button>

      <br><br>

      <button type="button" id="settings-profile-btn">
        <i class="fa-solid fa-user-pen"></i>
        ویرایش پروفایل
      </button>

      <br><br>

      <button type="button" id="settings-about-btn">
        <i class="fa-solid fa-circle-info"></i>
        درباره بهی
      </button>

      <br><br>

      <button type="button" id="settings-logout-btn">
        <i class="fa-solid fa-right-from-bracket"></i>
        خروج از حساب
      </button>
    </div>
  `;

  $("theme-toggle-btn")?.addEventListener("click", toggleTheme);
  $("settings-profile-btn")?.addEventListener("click", editProfile);
  $("settings-about-btn")?.addEventListener("click", showAbout);
  $("settings-logout-btn")?.addEventListener("click", logout);
}

/* ---------- About ---------- */

function showAbout() {
  notify(
    "Behy Messenger\n" +
    "پیام‌رسان بهی\n\n" +
    "نسخه آزمایشی\n" +
    "ارتباطی ساده، سریع و امن"
  );
}

/* ---------- Attachments ---------- */

function handleAttachment() {
  notify(
    "ارسال فایل هنوز فعال نشده است.\n" +
    "برای فعال‌سازی آن باید فضای ذخیره‌سازی فایل در Supabase تنظیم شود."
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
    console.error(error);
    notify("خروج ناموفق بود: " + error.message);
    return;
  }

  currentUser = null;
  currentProfile = null;
  activeChat = null;
  savedMode = false;

  $("messages").innerHTML = "";
  $("conversation-list").innerHTML = "";

  showAuth();
}

/* ---------- Initialization ---------- */

document.addEventListener("DOMContentLoaded", async () => {
  loadTheme();
  showAuth();

  $("login-tab")?.addEventListener("click", () => {
    setAuthMode("login");
  });

  $("signup-tab")?.addEventListener("click", () => {
    setAuthMode("signup");
  });

  $("auth-form")?.addEventListener("submit", handleAuth);

  $("search-btn")?.addEventListener("click", searchUsers);

  $("search-user")?.addEventListener("keydown", event => {
    if (event.key === "Enter") {
      event.preventDefault();
      searchUsers();
    }
  });

  $("message-form")?.addEventListener("submit", sendMessage);

  $("logout-btn")?.addEventListener("click", logout);

  $("saved-messages-btn")?.addEventListener(
    "click",
    openSavedMessages
  );

  $("chats-tab")?.addEventListener("click", showChats);
  $("contacts-tab")?.addEventListener("click", showContacts);
  $("profile-tab")?.addEventListener("click", showProfile);

  $("settings-btn")?.addEventListener("click", openSettings);

  $("about-btn")?.addEventListener("click", showAbout);

  $("new-chat-btn")?.addEventListener("click", () => {
    $("search-user")?.focus();
    $("search-user")?.scrollIntoView({
      behavior: "smooth",
      block: "center"
    });
  });

  $("attach-btn")?.addEventListener("click", handleAttachment);

  document.querySelectorAll("[data-mobile-tab]").forEach(button => {
    button.addEventListener("click", () => {
      const tab = button.dataset.mobileTab;

      if (tab === "chats") showChats();
      if (tab === "contacts") showContacts();
      if (tab === "saved") openSavedMessages();
      if (tab === "profile") showProfile();
      if (tab === "settings") openSettings();
    });
  });

  setAuthMode("login");

  try {
    const { data, error } = await db.auth.getSession();

    if (error) throw error;

    if (data.session) {
      await loadUser();
    }
  } catch (error) {
    console.error("Session error:", error);
    showAuth();
  }
});
