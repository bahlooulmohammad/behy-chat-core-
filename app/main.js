(() => {
  "use strict";

  const config = window.SUPABASE_CONFIG;

  if (!config || !config.url || !config.anonKey ||
      config.anonKey === "PASTE_YOUR_SB_PUBLISHABLE_KEY_HERE") {
    alert("ابتدا کلید عمومی Supabase را در فایل config.js وارد کنید.");
    return;
  }

  const db = window.supabase.createClient(config.url, config.anonKey);

  const $ = (id) => document.getElementById(id);

  let currentUser = null;
  let currentUsername = "";
  let activeChat = null;
  let realtimeChannel = null;
  let authMode = "login";

  function showMessage(text, error = false) {
    const el = $("auth-message");
    if (!el) return;
    el.textContent = text;
    el.style.color = error ? "#ff7777" : "#46b5ff";
  }

  function usernameEmail(username) {
    return username.trim().toLowerCase() + "@behy.invalid";
  }

  function setMode(mode) {
    authMode = mode;

    $("login-tab").classList.toggle("active", mode === "login");
    $("signup-tab").classList.toggle("active", mode === "signup");
    $("auth-submit").textContent =
      mode === "login" ? "ورود" : "ساخت حساب";

    $("password").autocomplete =
      mode === "login" ? "current-password" : "new-password";

    showMessage("");
  }

  $("login-tab").addEventListener("click", () => setMode("login"));
  $("signup-tab").addEventListener("click", () => setMode("signup"));

  async function loadProfile(user) {
    const { data, error } = await db
      .from("profiles")
      .select("username, display_name")
      .eq("id", user.id)
      .maybeSingle();

    if (error) throw error;

    if (!data) {
      throw new Error("پروفایل شما پیدا نشد. تنظیمات دیتابیس را بررسی کنید.");
    }

    currentUsername = data.username;
  }

  function showChatApp() {
    $("auth-section").hidden = true;
    $("chat-section").hidden = false;
    $("current-user").textContent = "@" + currentUsername;
    loadConversations();
    subscribeToMessages();
  }

  function showLogin() {
    $("auth-section").hidden = false;
    $("chat-section").hidden = true;
    $("messages").innerHTML = "";
    $("chat-header").innerHTML = "<p>یک گفتگو انتخاب کنید</p>";
    $("conversation-list").innerHTML = "";
    $("search-results").innerHTML = "";
    activeChat = null;
  }

  $("auth-form").addEventListener("submit", async (event) => {
    event.preventDefault();

    const username = $("username").value.trim().toLowerCase();
    const password = $("password").value;

    if (!/^[a-z0-9_]{3,24}$/.test(username)) {
      showMessage("نام کاربری باید ۳ تا ۲۴ حرف انگلیسی، عدد یا _ باشد.", true);
      return;
    }

    if (password.length < 8) {
      showMessage("رمز عبور باید حداقل ۸ کاراکتر باشد.", true);
      return;
    }

    $("auth-submit").disabled = true;
    showMessage("لطفاً صبر کنید...");

    try {
      const email = usernameEmail(username);

      if (authMode === "signup") {
        const { data, error } = await db.auth.signUp({
          email,
          password
        });

        if (error) throw error;

        if (!data.session) {
          showMessage("حساب ساخته شد. اگر تأیید ایمیل فعال است، باید تنظیمات Auth را تغییر دهیم تا ورود بدون ایمیل ممکن شود.");
          return;
        }

        currentUser = data.user;

        const { error: profileError } = await db
          .from("profiles")
          .insert({
            id: data.user.id,
            username,
            display_name: username
          });

        if (profileError) throw profileError;

      } else {
        const { data, error } = await db.auth.signInWithPassword({
          email,
          password
        });

        if (error) throw error;
        currentUser = data.user;
      }

      await loadProfile(currentUser);
      showChatApp();

    } catch (error) {
      showMessage(error.message || "خطایی رخ داد.", true);
    } finally {
      $("auth-submit").disabled = false;
    }
  });

  async function searchUsers() {
    const term = $("search-user").value.trim().toLowerCase();
    const results = $("search-results");
    results.innerHTML = "";

    if (term.length < 2) {
      results.textContent = "حداقل دو حرف وارد کنید.";
      return;
    }

    const { data, error } = await db
      .from("profiles")
      .select("id, username, display_name")
      .ilike("username", "%" + term + "%")
      .neq("id", currentUser.id)
      .limit(15);

    if (error) {
      results.textContent = "جستجو انجام نشد.";
      return;
    }

    if (!data || data.length === 0) {
      results.textContent = "کاربری پیدا نشد.";
      return;
    }

    data.forEach((profile) => {
      const button = document.createElement("button");
      button.textContent = "@" + profile.username;
      button.className = "primary";
      button.style.marginBottom = "8px";
      button.addEventListener("click", () => openChat(profile));
      results.appendChild(button);
    });
  }

  $("search-btn").addEventListener("click", searchUsers);

  $("search-user").addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      searchUsers();
    }
  });

  async function openChat(profile) {
    activeChat = profile;

    $("chat-header").textContent = "گفتگو با @" + profile.username;
    $("messages").innerHTML = "";

    await loadMessages();
  }

  async function loadMessages() {
    if (!activeChat) return;

    const { data, error } = await db
      .from("messages")
      .select("*")
      .or(
        `and(sender_id.eq.${currentUser.id},receiver_id.eq.${activeChat.id}),and(sender_id.eq.${activeChat.id},receiver_id.eq.${currentUser.id})`
      )
      .order("created_at", { ascending: true })
      .limit(200);

    if (error) {
      $("messages").textContent = "بارگذاری پیام‌ها ناموفق بود.";
      return;
    }

    $("messages").innerHTML = "";
    (data || []).forEach(renderMessage);
  }

  function renderMessage(message) {
    const container = $("messages");
    const bubble = document.createElement("div");
    const mine = message.sender_id === currentUser.id;

    bubble.textContent = message.content;
    bubble.style.cssText = `
      max-width: 80%;
      width: fit-content;
      padding: 11px 15px;
      margin: 8px 0;
      border-radius: 16px;
      overflow-wrap: anywhere;
      background: ${mine ? "#087cff" : "#1b293b"};
      color: white;
      ${mine ? "margin-right:auto;" : "margin-left:auto;"}
    `;

    container.appendChild(bubble);
    container.scrollTop = container.scrollHeight;
  }

  $("message-form").addEventListener("submit", async (event) => {
    event.preventDefault();

    const input = $("message-input");
    const content = input.value.trim();

    if (!content || !activeChat) return;

    const button = $("message-form").querySelector("button");
    button.disabled = true;

    const { data, error } = await db
      .from("messages")
      .insert({
        sender_id: currentUser.id,
        receiver_id: activeChat.id,
        content
      })
      .select()
      .single();

    button.disabled = false;

    if (error) {
      alert("پیام ارسال نشد: " + error.message);
      return;
    }

    input.value = "";
    renderMessage(data);
  });

  async function loadConversations() {
    const list = $("conversation-list");
    list.innerHTML = "";

    const { data, error } = await db
      .from("messages")
      .select("sender_id, receiver_id, created_at")
      .or(`sender_id.eq.${currentUser.id},receiver_id.eq.${currentUser.id}`)
      .order("created_at", { ascending: false })
      .limit(100);

    if (error || !data) return;

    const ids = [...new Set(data.map((message) =>
      message.sender_id === currentUser.id
        ? message.receiver_id
        : message.sender_id
    ))];

    if (ids.length === 0) {
      list.textContent = "هنوز گفتگویی ندارید.";
      return;
    }

    const { data: profiles } = await db
      .from("profiles")
      .select("id, username, display_name")
      .in("id", ids);

    (profiles || []).forEach((profile) => {
      const button = document.createElement("button");
      button.textContent = "@" + profile.username;
      button.className = "primary";
      button.style.marginBottom = "8px";
      button.addEventListener("click", () => openChat(profile));
      list.appendChild(button);
    });
  }

  function subscribeToMessages() {
    if (realtimeChannel) {
      db.removeChannel(realtimeChannel);
    }

    realtimeChannel = db
      .channel("behy-messages-" + currentUser.id)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages"
        },
        (payload) => {
          const message = payload.new;

          if (
            activeChat &&
            (
              (message.sender_id === currentUser.id &&
               message.receiver_id === activeChat.id) ||
              (message.sender_id === activeChat.id &&
               message.receiver_id === currentUser.id)
            )
          ) {
            if (message.sender_id !== currentUser.id) {
              renderMessage(message);
            }
          }

          if (message.receiver_id === currentUser.id) {
            loadConversations();
          }
        }
      )
      .subscribe();
  }

  $("logout-btn").addEventListener("click", async () => {
    if (realtimeChannel) {
      await db.removeChannel(realtimeChannel);
      realtimeChannel = null;
    }

    await db.auth.signOut();
    currentUser = null;
    currentUsername = "";
    showLogin();
  });

  async function restoreSession() {
    const { data } = await db.auth.getSession();

    if (!data.session) return;

    try {
      currentUser = data.session.user;
      await loadProfile(currentUser);
      showChatApp();
    } catch (error) {
      console.error(error);
      showLogin();
    }
  }

  restoreSession();
})();
