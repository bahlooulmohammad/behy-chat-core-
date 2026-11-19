
/* Behy Messenger - Main Application */

const config = window.SUPABASE_CONFIG;

if (!config || !config.url || !config.anonKey) {
  alert("تنظیمات اتصال به سرور پیدا نشد.");
  throw new Error("Supabase configuration missing");
}

const db = window.supabase.createClient(config.url, config.anonKey);
const $ = (id) => document.getElementById(id);

let currentUser = null;
let currentProfile = null;
let activeChat = null;
let realtimeChannel = null;
let authMode = "login";

/* ---------- Helpers ---------- */

function showMessage(message, type = "info") {
  const el = $("auth-message");
  if (!el) {
    alert(message);
    return;
  }
  el.textContent = message;
  el.style.color = type === "error" ? "#ff7777" : "#65c9ff";
}

function cleanUsername(value) {
  return String(value || "").trim().toLowerCase();
}

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[char]);
}

function showAuth() {
  if ($("auth-section")) {
    $("auth-section").hidden = false;
    $("auth-section").style.display = "block";
  }
  if ($("chat-section")) {
    $("chat-section").hidden = true;
    $("chat-section").style.display = "none";
  }
}

function showChat() {
  if ($("auth-section")) {
    $("auth-section").hidden = true;
    $("auth-section").style.display = "none";
  }
  if ($("chat-section")) {
    $("chat-section").hidden = false;
    $("chat-section").style.display = "block";
  }
}

/* ---------- Authentication ---------- */

function setAuthMode(mode) {
  authMode = mode;

  $("login-tab")?.classList.toggle("active", mode === "login");
  $("signup-tab")?.classList.toggle("active", mode === "signup");

  if ($("auth-submit")) {
    $("auth-submit").textContent =
      mode === "signup" ? "ساخت حساب کاربری" : "ورود به حساب";
  }

  showMessage(
    mode === "signup"
      ? "نام کاربری و رمز عبور خود را وارد کنید."
      : "برای ورود اطلاعات حساب خود را وارد کنید."
  );
}

async function handleAuth(event) {
  event.preventDefault();

  const username = cleanUsername($("username")?.value);
  const password = $("password")?.value || "";
  const submit = $("auth-submit");

  if (!/^[a-z0-9_]{3,24}$/.test(username)) {
    showMessage("نام کاربری باید ۳ تا ۲۴ حرف انگلیسی، عدد یا زیرخط باشد.", "error");
    return;
  }

  if (password.length < 8 || password.length > 128) {
    showMessage("رمز عبور باید بین ۸ تا ۱۲۸ کاراکتر باشد.", "error");
    return;
  }

  if (submit) submit.disabled = true;

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

    showMessage("ورود موفق بود.");
    await loadUser();

  } catch (error) {
    console.error(error);
    showMessage(error.message || "ارتباط با سرور برقرار نشد.", "error");
  } finally {
    if (submit) submit.disabled = false;
  }
}

/* ---------- User Profile ---------- */

async function loadUser() {
  const { data: authData, error: authError } = await db.auth.getUser();

  if (authError || !authData.user) {
    showAuth();
    return;
  }

  currentUser = authData.user;

  const username =
    currentUser.user_metadata?.username ||
    currentUser.email?.split("@")[0];

  const { data: profile, error } = await db
    .from("profiles")
    .upsert({
      id: currentUser.id,
      username,
      display_name: currentUser.user_metadata?.display_name || username
    }, { onConflict: "id" })
    .select()
    .single();

  if (error) {
    console.error(error);
    showMessage("ساخت پروفایل ناموفق بود: " + error.message, "error");
    return;
  }

  currentProfile = profile;

  if ($("current-user")) {
    $("current-user").textContent = profile.display_name || profile.username;
  }

  showChat();
  await loadConversations();
  subscribeToMessages();
}

/* ---------- Search Users ---------- */

async function searchUsers() {
  const term = cleanUsername($("search-user")?.value);

  if (term.length < 2) {
    if ($("search-results")) {
      $("search-results").innerHTML = "<p>حداقل دو حرف وارد کنید.</p>";
    }
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
    $("search-results").textContent = "خطا در جست‌وجوی کاربران";
    return;
  }

  const results = $("search-results");
  if (!results) return;

  if (!data.length) {
    results.innerHTML = "<p>کاربری پیدا نشد.</p>";
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
      const user = data.find(item => item.id === button.dataset.userId);
      if (user) openChat(user);
    });
  });
}

/* ---------- Conversations ---------- */

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

  const ids = [...new Set(messages.map(message =>
    message.sender_id === currentUser.id
      ? message.receiver_id
      : message.sender_id
  ))];

  if (!ids.length) {
    if ($("conversation-list")) {
      $("conversation-list").innerHTML = "<p>هنوز گفت‌وگویی ندارید.</p>";
    }
    return;
  }

  const { data: users, error: profileError } = await db
    .from("profiles")
    .select("id, username, display_name")
    .in("id", ids);

  if (profileError) {
    console.error(profileError);
    return;
  }

  const list = $("conversation-list");
  if (!list) return;

  list.innerHTML = users.map(user => `
    <button class="conversation-item" data-user-id="${escapeHTML(user.id)}">
      ${escapeHTML(user.display_name || user.username)}
      <small>@${escapeHTML(user.username)}</small>
    </button>
  `).join("");

  list.querySelectorAll("[data-user-id]").forEach(button => {
    button.addEventListener("click", () => {
      const user = users.find(item => item.id === button.dataset.userId);
      if (user) openChat(user);
    });
  });
}

/* ---------- Chat ---------- */

async function openChat(user) {
  activeChat = user;

  if ($("chat-header")) {
    $("chat-header").textContent = user.display_name || user.username;
  }

  await loadMessages();
  $("message-input")?.focus();
}

async function loadMessages() {
  if (!activeChat) return;

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
  if (!container) return;

  container.innerHTML = data.map(message => `
    <div class="message ${message.sender_id === currentUser.id ? "sent" : "received"}">
      <div>${escapeHTML(message.content)}</div>
      <small>${new Date(message.created_at).toLocaleTimeString("fa-IR", {
        hour: "2-digit",
        minute: "2-digit"
      })}</small>
    </div>
  `).join("");

  container.scrollTop = container.scrollHeight;
}

async function sendMessage(event) {
  event.preventDefault();

  if (!activeChat) {
    alert("ابتدا یک گفت‌وگو انتخاب کنید.");
    return;
  }

  const input = $("message-input");
  const content = input?.value.trim();

  if (!content) return;

  if (content.length > 5000) {
    alert("پیام بیش از حد طولانی است.");
    return;
  }

  const { error } = await db.from("messages").insert({
    sender_id: currentUser.id,
    receiver_id: activeChat.id,
    content
  });

  if (error) {
    console.error(error);
    alert("ارسال پیام ناموفق بود: " + error.message);
    return;
  }

  input.value = "";
  await loadMessages();
  await loadConversations();
}

/* ---------- Realtime ---------- */

function subscribeToMessages() {
  if (realtimeChannel) {
    db.removeChannel(realtimeChannel);
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
          activeChat &&
          (message.sender_id === activeChat.id ||
           message.receiver_id === activeChat.id)
        ) {
          await loadMessages();
        }
      }
    })
    .subscribe();
}

/* ---------- Logout ---------- */

async function logout() {
  if (realtimeChannel) {
    await db.removeChannel(realtimeChannel);
    realtimeChannel = null;
  }

  await db.auth.signOut();

  currentUser = null;
  currentProfile = null;
  activeChat = null;

  showAuth();
}

/* ---------- Start ---------- */

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

  setAuthMode("login");

  const { data } = await db.auth.getSession();

  if (data.session) {
    await loadUser();
  }
});
