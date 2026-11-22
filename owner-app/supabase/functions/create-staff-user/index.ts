import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace("Bearer ", "");
    if (!token) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Verify caller is an authenticated owner.
    const { data: userData, error: userError } = await admin.auth.getUser(token);
    if (userError || !userData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: callerRow } = await admin
      .from("store_users")
      .select("id, store_id, role, is_active")
      .eq("auth_user_id", userData.user.id)
      .eq("role", "owner")
      .eq("is_active", true)
      .maybeSingle();
    if (!callerRow) {
      return new Response(JSON.stringify({ error: "Only owners can add staff" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const name = (body.name ?? "").toString().trim();
    const phone = (body.phone ?? "").toString().replace(/\D/g, "");
    const password = (body.password ?? "").toString();

    if (!name || !/^\d{10}$/.test(phone) || password.length < 6) {
      return new Response(JSON.stringify({ error: "Name, 10-digit mobile and 6+ char password required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: store } = await admin
      .from("stores")
      .select("feature_flags")
      .eq("id", callerRow.store_id)
      .maybeSingle();
    const maxStaff = Number(store?.feature_flags?.max_staff_limit ?? 10);
    const { count: staffCount } = await admin
      .from("store_users")
      .select("id", { count: "exact", head: true })
      .eq("store_id", callerRow.store_id);
    if ((staffCount ?? 0) >= maxStaff + 1) {
      return new Response(JSON.stringify({ error: "Staff limit reached for your plan" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const email = `${phone}@kirana.app`;
    const { data: existingUser } = await admin
      .from("store_users")
      .select("id")
      .eq("store_id", callerRow.store_id)
      .eq("phone", phone)
      .maybeSingle();
    if (existingUser) {
      return new Response(JSON.stringify({ error: "This mobile number already exists in your store" }), {
        status: 409,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: authData, error: authError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { name, phone },
    });
    if (authError) {
      const conflict = authError.message.includes("already") || authError.status === 422;
      return new Response(
        JSON.stringify({ error: conflict ? "This mobile number is already registered on the platform" : authError.message }),
        { status: conflict ? 409 : 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { error: insertError } = await admin.from("store_users").insert({
      auth_user_id: authData.user.id,
      store_id: callerRow.store_id,
      name,
      phone,
      role: body.role === "manager" ? "staff" : "staff",
      permissions: body.permissions ?? {},
      max_discount_pct: Number(body.maxDiscountPct ?? 0),
      customer_access_mode: body.customerAccessMode === "selected" ? "selected" : "all",
    });

    if (insertError) {
      await admin.auth.admin.deleteUser(authData.user.id);
      return new Response(JSON.stringify({ error: insertError.message }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
