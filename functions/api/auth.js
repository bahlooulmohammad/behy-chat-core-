
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

function internalEmail(username) {
  return `${username}@users.example.com`;
}

async function supabaseRequest(env, path, options = {}) {
  const response = await fetch(
    `${env.SUPABASE_URL}/auth/v1/${path}`,
    {
      ...options,
      headers: {
        "Content-Type": "application/json",
        "apikey": env.SUPABASE_SERVICE_ROLE_KEY,
        "Authorization": `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        ...(options.headers || {})
      }
    }
  );

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.msg || data.message || data.error_description || "خطا در ارتباط با سرور");
  }

  return data;
}

export async function onRequestPost({ request, env }) {
  try {
    if (
      !env.SUPABASE_URL ||
      !env.SUPABASE_SERVICE_ROLE_KEY ||
      !env.SUPABASE_ANON_KEY
    ) {
      return json({ error: "تنظیمات سرور کامل نیست." }, 500);
    }

    const body = await request.json();
    const action = body.action;
    const username = String(body.username || "").trim().toLowerCase();
    const password = String(body.password || "");

    if (!validUsername(username)) {
      return json({
        error: "نام کاربری باید ۳ تا ۲۴ حرف انگلیسی، عدد یا زیرخط باشد."
      }, 400);
    }

    if (password.length < 8 || password.length > 128) {
      return json({
        error: "رمز عبور باید بین ۸ تا ۱۲۸ کاراکتر باشد."
      }, 400);
    }

    const email = internalEmail(username);

    if (action === "register") {
      const created = await supabaseRequest(
        env,
        "admin/users",
        {
          method: "POST",
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

      const sessionResponse = await fetch(
        `${env.SUPABASE_URL}/auth/v1/token?grant_type=password`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "apikey": env.SUPABASE_ANON_KEY
          },
          body: JSON.stringify({ email, password })
        }
      );

      const session = await sessionResponse.json();

      if (!sessionResponse.ok) {
        return json({
          error: "حساب ساخته شد؛ ورود خودکار انجام نشد. دوباره وارد شوید."
        }, 400);
      }

      return json({
        success: true,
        user: session.user,
        session: {
          access_token: session.access_token,
          refresh_token: session.refresh_token
        }
      });
    }

    if (action === "login") {
      const response = await fetch(
        `${env.SUPABASE_URL}/auth/v1/token?grant_type=password`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "apikey": env.SUPABASE_ANON_KEY
          },
          body: JSON.stringify({ email, password })
        }
      );

      const data = await response.json();

      if (!response.ok) {
        return json({ error: "نام کاربری یا رمز عبور اشتباه است." }, 401);
      }

      return json({
        success: true,
        user: data.user,
        session: {
          access_token: data.access_token,
          refresh_token: data.refresh_token
        }
      });
    }

    return json({ error: "درخواست نامعتبر است." }, 400);

  } catch (error) {
    return json({
      error: error.message || "خطای غیرمنتظره در سرور"
    }, 400);
  }
}
