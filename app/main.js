
/* Behy Messenger */

const config = window.SUPABASE_CONFIG;

if (!config || !config.url || !config.anonKey) {
  alert("تنظیمات اتصال به سرور پیدا نشد.");
  throw new Error("Supabase configuration missing");
}

const db = window.supabase.createClient(config.url, config.anonKey);
const $ = id => document.getElementById(id);

let currentUser = null;
let currentProfile = null;
let activeChat = null;
let realtimeChannel = null;
let authMode = "login";
let savedMode = false;

function showMessage(message, type = "info") {
  const el = $("auth-message");
  if (!el) return alert(message);
  el.textContent = message;
  el.style.color = type === "error" ? "#d33" : "#2481d7";
}

function cleanUsername(value) {
  return String(value || "").trim().toLowerCase();
}

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;",
    '"': "&quot;", "'": "&#039;"
  })[c]);
}

function showAuth() {
  $("auth-section").hidden = false;
  $("chat-section").hidden = true;
}

function showChat() {
  $("auth-section").hidden = true;
  $("chat-section").hidden = false;
}

function setAuthMode(mode) {
  authMode = mode;
  $("login-tab")?.classList.toggle("primary", mode === "login");
  $("signup-tab")?.classList.toggle("primary", mode === "signup");
  $("auth-submit").textContent =
    mode === "signup" ? "ساخت حساب کاربری" : "ورود به حساب";
  showMessage(mode === "signup"
    ? "نام کاربری و رمز عبور را وارد کنید."
    : "اطلاعات حساب خود را وارد کنید.");
}

async function handleAuth(event) {
  event.preventDefault();

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

  submit.disabled = true;

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

    if (!response.ok || !result.success) {
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
    submit.disabled = false;
  }
}

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
      display_name: currentUser.user_metadata?.display_name || username
    }, { onConflict: "id" })
    .select()
    .single();

  if (profileError) {
    console.error(profileError);
    alert("خطا در ساخت پروفایل: " + profileError.message);
    return;
  }

  currentProfile = profile;
  $("current-user").textContent = profile.display_name || profile.username;

  showChat();
  await loadConversations();
  subscribeToMessages();
}

async function searchUsers() {
  const term = cleanUsername($("search-user").value);

  if (term.length < 2) {
    $("search-results").textContent = "حداقل دو حرف وارد کنید.";
    return;
  }

  const { data, error } = await db
    .from("profiles")
    .select("id, username, display_name")
    .ilike("username", `%${term}%`)
    .neq("id", currentUser.id)
    .limit(20);

  if (error) {
    console.error(error);
    $("search-results").textContent = "خطا در جست‌وجوی کاربران.";
    return;
  }

  const results = $("search-results");

  if (!data.length) {
    results.textContent = "کاربری پیدا نشد.";
    return;
  }

  results.innerHTML = data.map(user => `
    <button class="user-result" data-user-id="${escapeHTML(user.id)}">
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

async function loadConversations() {
  const { data: messages, error } = await db
    .from("messages")
    .select("sender_id, receiver_id, created_at")
    .or(`sender_id.eq.${currentUser.id},receiver_id.eq.${currentUser.id}`)
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) {
    console.error(error);
    return;
  }

  const ids = [...new Set(messages.map(m =>
    m.sender_id === currentUser.id ? m.receiver_id : m.sender_id
  ))];

  const list = $("conversation-list");

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
    return;
  }

  list.innerHTML = users.map(user => `
    <button class="conversation-item" data-user-id="${escapeHTML(user.id)}">
      ${escapeHTML(user.display_name || user.username)}
      <small>@${escapeHTML(user.username)}</small>
    </button>
  `).join("");

  list.querySelectorAll("[data-user-id]").forEach(button => {
    button.addEventListener("click", () => {
      const user = users.find(u => u.id === button.dataset.userId);
      if (user) openChat(user);
    });
  });
}

async function openChat(user) {
  savedMode = false;
  activeChat = user;

  $("chat-header").innerHTML = `
    <div class="empty-avatar"><i class="fa-solid fa-user"></i></div>
    <div>
      <strong>${escapeHTML(user.display_name || user.username)}</strong>
      <p>@${escapeHTML(user.username)}</p>
    </div>
  `;

  $("message-input").placeholder = "پیام خود را بنویسید...";
  $("message-input").disabled = false;
  await loadMessages();
}

async function loadMessages() {
  if (!activeChat || savedMode) return;

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
    return;
  }

  const container = $("messages");

  container.innerHTML = data.map(message => `
    <div class="message ${message.sender_id === currentUser.id ? "sent" : "received"}">
      <div>${escapeHTML(message.content)}</div>
      <small>${new Date(message.created_at).toLocaleTimeString("fa-IR", {
        hour: "2-digit", minute: "2-digit"
      })}</small>
      <button type="button" class="save-message-btn"
        data-content="${encodeURIComponent(message.content)}">
        <i class="fa-solid fa-bookmark"></i>
        ذخیره
      </button>
    </div>
  `).join("");

  container.querySelectorAll(".save-message-btn").forEach(button => {
    button.addEventListener("click", () => {
      saveMessage(decodeURIComponent(button.dataset.content));
    });
  });

  container.scrollTop = container.scrollHeight;
}

async function sendMessage(event) {
  event.preventDefault();

  const input = $("message-input");
  const content = input.value.trim();

  if (!content) return;

  if (content.length > 5000) {
    alert("پیام بیش از حد طولانی است.");
    return;
  }

  if (savedMode) {
    const { error } = await db.from("saved_messages").insert({
      user_id: currentUser.id,
      content
    });

    if (error) {
      alert("ذخیره پیام ناموفق بود: " + error.message);
      return;
    }

    input.value = "";
    await loadSavedMessages();
    return;
  }

  if (!activeChat) {
    alert("ابتدا یک گفتگو انتخاب کنید.");
    return;
  }

  const { error } = await db.from("messages").insert({
    sender_id: currentUser.id,
    receiver_id: activeChat.id,
    content
  });

  if (error) {
    alert("ارسال پیام ناموفق بود: " + error.message);
    return;
  }

  input.value = "";
  await loadMessages();
  await loadConversations();
}

async function saveMessage(content) {
  const { error } = await db.from("saved_messages").insert({
    user_id: currentUser.id,
    content
  });

  if (error) {
    alert("ذخیره پیام ناموفق بود: " + error.message);
    return;
  }

  alert("پیام در پیام‌های ذخیره‌شده ثبت شد.");
}

async function openSavedMessages() {
  savedMode = true;
  activeChat = null;

  $("chat-header").innerHTML = `
    <div class="empty-avatar"><i class="fa-solid fa-bookmark"></i></div>
    <div>
      <strong>پیام‌های ذخیره‌شده</strong>
      <p>فضای خصوصی شما</p>
    </div>
  `;

  $("message-input").placeholder = "یادداشت خصوصی خود را بنویسید...";
  $("message-input").disabled = false;

  await loadSavedMessages();
}

async function loadSavedMessages() {
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
      <small>${new Date(item.created_at).toLocaleString("fa-IR")}</small>
      <button type="button" class="delete-saved-btn" data-id="${escapeHTML(item.id)}">
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
  if (!confirm("این پیام حذف شود؟")) return;

  const { error } = await db
    .from("saved_messages")
    .delete()
    .eq("id", id)
    .eq("user_id", currentUser.id);

  if (error) {
    alert("حذف پیام ناموفق بود: " + error.message);
    return;
  }

  await loadSavedMessages();
}

function subscribeToMessages() {
  if (realtimeChannel) db.removeChannel(realtimeChannel);

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
          !savedMode && activeChat &&
          (message.sender_id === activeChat.id ||
           message.receiver_id === activeChat.id)
        ) {
          await loadMessages();
        }
      }
    })
    .subscribe();
}

async function logout() {
  if (realtimeChannel) {
    await db.removeChannel(realtimeChannel);
    realtimeChannel = null;
  }

  await db.auth.signOut();
  currentUser = null;
  currentProfile = null;
  activeChat = null;
  savedMode = false;
  showAuth();
}

function setActiveTab(id) {
  ["chats-tab", "contacts-tab", "profile-tab"].forEach(tab => {
    $(tab)?.classList.toggle("active", tab === id);
  });
}

function showProfile() {
  setActiveTab("profile-tab");
  $("list-heading").textContent = "پروفایل من";
  $("search-results").innerHTML = "";
  $("conversation-list").innerHTML = `
    <div class="welcome-chat">
      <h3>${escapeHTML(currentProfile.display_name || currentProfile.username)}</h3>
      <p>@${escapeHTML(currentProfile.username)}</p>
      <p>شناسه حساب: ${escapeHTML(currentUser.id)}</p>
    </div>
  `;
}

function showContacts() {
  setActiveTab("contacts-tab");
  $("list-heading").textContent = "مخاطبین";
  $("search-user").focus();
  $("search-results").textContent = "برای پیدا کردن مخاطب، نام کاربری را جستجو کنید.";
}

function showChats() {
  setActiveTab("chats-tab");
  $("list-heading").textContent = "گفتگوهای من";
  $("search-results").innerHTML = "";
  loadConversations();
}

document.addEventListener("DOMContentLoaded", async () => {
  showAuth();

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
  $("logout-btn")?.addEventListener("click", logout);

  $("saved-messages-btn")?.addEventListener("click", openSavedMessages);
  $("chats-tab")?.addEventListener("click", showChats);
  $("contacts-tab")?.addEventListener("click", showContacts);
  $("profile-tab")?.addEventListener("click", showProfile);

  $("settings-btn")?.addEventListener("click", () => {
    alert("بخش تنظیمات بهی در حال آماده‌سازی است.");
  });

  $("about-btn")?.addEventListener("click", () => {
    alert("Behy Messenger\nپیام‌رسان بهی");
  });

  $("new-chat-btn")?.addEventListener("click", () => {
    $("search-user").focus();
    $("search-user").scrollIntoView({ behavior: "smooth", block: "center" });
  });

  $("chat-info-btn")?.addEventListener("click", () => {
    alert(activeChat
      ? "گفتگو با " + (activeChat.display_name || activeChat.username)
      : "هنوز گفتگویی انتخاب نشده است.");
  });

  $("attach-btn")?.addEventListener("click", () => {
    alert("ارسال فایل هنوز فعال نشده است.");
  });

  setAuthMode("login");

  const { data } = await db.auth.getSession();
  if (data.session) await loadUser();
});
