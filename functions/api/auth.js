
const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store"
    }
  });

function validUsername(value) {
  return /^[a-z0-9_]{3,24}$/.test(value);
}

function emailFor(username) {
  return `${username}@users.example.com`;
}

export async function onRequestPost({ request, env }) {
  try {
    const url = env.SUPABASE_URL;
    const secret = env.SUPABASE_SECRET_KEY;
    const publicKey = env.SUPABASE_ANON_KEY;

    if (!url || !secret || !publicKey) {
      return json({ error: "تنظیمات سرور ناقص است." }, 500);
    }

    const body = await request.json();
    const action = body.action;
    const username = String(body.username || "").trim().toLowerCase();
    const password = String(body.password || "");

    if (!validUsername(username)) {
      return json({ error: "نام کاربری نامعتبر است." }, 400);
    }

    if (password.length < 8 || password.length > 128) {
      return json({ error: "رمز باید بین ۸ تا ۱۲۸ کاراکتر باشد." }, 400);
    }

    const email = emailFor(username);

    if (action === "register") {
      const createResponse = await fetch(
        `${url}/auth/v1/admin/users`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "apikey": secret
          },
          body: JSON.stringify({
            email,
            password,
            email_confirm: true,
            user_metadata: {
              username,
              display_name: username
            }
          })
        }
      );

      const created = await createResponse.json();

      if (!createResponse.ok) {
        return json({
          error: createResponse.status === 422
            ? "این نام کاربری قبلاً ثبت شده است."
            : "ساخت حساب ناموفق بود. تنظیمات سرور را بررسی کنید."
        }, 400);
      }
    } else if (action !== "login") {
      return json({ error: "درخواست نامعتبر است." }, 400);
    }

    const loginResponse = await fetch(
      `${url}/auth/v1/token?grant_type=password`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "apikey": publicKey
        },
        body: JSON.stringify({ email, password })
      }
    );

    const session = await loginResponse.json();

    if (!loginResponse.ok) {
      return json({
        error: action === "login"
          ? "نام کاربری یا رمز عبور اشتباه است."
          : "حساب ساخته شد اما ورود خودکار ناموفق بود."
      }, 401);
    }

    return json({
      success: true,
      user: session.user,
      session: {
        access_token: session.access_token,
        refresh_token: session.refresh_token
      }
    });

  } catch (error) {
    return json({ error: "ارتباط با سرور برقرار نشد." }, 500);
  }
}
