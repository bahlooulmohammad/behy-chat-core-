
async function handleAuth(event) {
  event.preventDefault();

  const username = cleanUsername($("username")?.value);
  const password = $("password")?.value || "";

  if (!/^[a-z0-9_]{3,24}$/.test(username)) {
    showMessage("نام کاربری باید ۳ تا ۲۴ حرف انگلیسی، عدد یا زیرخط باشد.", "error");
    return;
  }

  if (password.length < 8 || password.length > 128) {
    showMessage("رمز عبور باید حداقل ۸ کاراکتر باشد.", "error");
    return;
  }

  const submit = $("auth-submit");
  if (submit) submit.disabled = true;

  try {
    showMessage("در حال اتصال به سرور...");

    const response = await fetch("/api/auth", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        action: authMode === "signup" ? "register" : "login",
        username,
        password
      })
    });

    const result = await response.json();

    if (!response.ok || !result.success) {
      throw new Error(result.error || "ورود ناموفق بود.");
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
    showMessage(error.message || "ارتباط با سرور ناموفق بود.", "error");
  } finally {
    if (submit) submit.disabled = false;
  }
}
