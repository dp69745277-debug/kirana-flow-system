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
  if (req.method === "PATCH") {
    return handlePatch(req);
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const body = await req.json();
    const shopName = (body.shopName ?? "").toString().trim();
    const ownerName = (body.ownerName ?? "").toString().trim();
    const phone = (body.phone ?? "").toString().replace(/\D/g, "");
    const password = (body.password ?? "").toString();
    const address = (body.address ?? "").toString().trim() || null;
    const storeType = ["retail", "wholesale", "mix"].includes(body.storeType) ? body.storeType : null;

    if (!shopName || !ownerName || !password || !storeType) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!/^\d{10}$/.test(phone)) {
      return new Response(JSON.stringify({ error: "Mobile number must be exactly 10 digits" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (password.length < 8) {
      return new Response(JSON.stringify({ error: "Password must be at least 8 characters, with a letter and a number" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // One auth user per store phone. Email is a derived login handle.
    const email = `${phone}@kirana.app`;
    const { data: existing } = await admin
      .from("stores")
      .select("id")
      .eq("phone", phone)
      .maybeSingle();
    if (existing) {
      return new Response(JSON.stringify({ error: "This mobile number is already registered" }), {
        status: 409,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: authData, error: authError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { name: ownerName, phone },
    });
    if (authError) {
      // Only a genuine duplicate maps to "already registered"; everything else
      // surfaces its real message so the user is never misled.
      const genuineDuplicate = authError.message.toLowerCase().includes("already registered");
      if (genuineDuplicate) {
        // Orphan from a previous partial signup? Clean it up and retry once.
        const { data: dupList } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
        const dup = dupList?.users?.find((u) => u.email === email);
        if (dup) await admin.auth.admin.deleteUser(dup.id);
        const retry = await admin.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: { name: ownerName, phone },
        });
        if (retry.error) {
          return new Response(JSON.stringify({ error: "This mobile number is already registered" }), {
            status: 409,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        return continueSignup(admin, retry.data.user!, { shopName, ownerName, phone, address, storeType, password });
      }
      return new Response(JSON.stringify({ error: authError.message }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return continueSignup(admin, authData.user, { shopName, ownerName, phone, address, storeType, password });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

async function continueSignup(
  admin: ReturnType<typeof createClient>,
  authUser: { id: string },
  opts: { shopName: string; ownerName: string; phone: string; address: string | null; storeType: string; password: string }
): Promise<Response> {
  try {
    const storeType = opts.storeType;
    const featureFlags: Record<string, boolean | number> = {
      retail_module: true,
      godown_inventory: true,
      daily_hisaab: true,
      agencies: true,
      dead_stock_tracker: true,
      reports: true,
      staff_module: true,
      wholesale_module: storeType === "wholesale" || storeType === "mix",
      wholesale_orders: storeType === "wholesale" || storeType === "mix",
      customer_directory: storeType === "wholesale" || storeType === "mix",
      khata_ledger: storeType === "wholesale" || storeType === "mix",
      whatsapp_reminders: storeType === "wholesale" || storeType === "mix",
      customer_app_accounts: storeType === "wholesale" || storeType === "mix",
      pdf_exports: true,
      max_staff_limit: 10,
    };

    const { data: store, error: storeError } = await admin
      .from("stores")
      .insert({
        shop_name: opts.shopName,
        owner_name: opts.ownerName,
        phone: opts.phone,
        address: opts.address,
        store_type: storeType,
        feature_flags: featureFlags,
      })
      .select("id, store_code")
      .single();
    if (storeError || !store) {
      await admin.auth.admin.deleteUser(authUser.id);
      return new Response(JSON.stringify({ error: storeError?.message ?? "Store creation failed" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { error: userRowError } = await admin.from("store_users").insert({
      auth_user_id: authUser.id,
      store_id: store.id,
      name: opts.ownerName,
      phone: opts.phone,
      role: "owner",
      permissions: { all: true },
    });
    if (userRowError) {
      await admin.from("stores").delete().eq("id", store.id);
      await admin.auth.admin.deleteUser(authUser.id);
      return new Response(JSON.stringify({ error: userRowError.message }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: sessionData, error: sessionError } = await admin.auth.signInWithPassword({
      email: `${opts.phone}@kirana.app`,
      password: opts.password,
    });
    if (sessionError || !sessionData?.session) {
      return new Response(
        JSON.stringify({ error: "Account created but sign-in failed. Please log in.", storeCode: store.store_code }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        storeCode: store.store_code,
        session: {
          access_token: sessionData.session.access_token,
          refresh_token: sessionData.session.refresh_token,
        },
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
}

async function handlePatch(req: Request): Promise<Response> {
  try {
    const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
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
    const { data: userData, error: userErr } = await admin.auth.getUser(token);
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const body = await req.json();
    const storeType = ["retail", "wholesale", "mix"].includes(body.storeType) ? body.storeType : null;
    if (!storeType) {
      return new Response(JSON.stringify({ error: "Invalid store type" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { data: ownerRow } = await admin
      .from("store_users")
      .select("store_id, role")
      .eq("auth_user_id", userData.user.id)
      .eq("role", "owner")
      .maybeSingle();
    if (!ownerRow) {
      return new Response(JSON.stringify({ error: "Owner not found" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const featureFlags: Record<string, boolean | number> = {
      retail_module: true,
      godown_inventory: true,
      daily_hisaab: true,
      agencies: true,
      dead_stock_tracker: true,
      reports: true,
      staff_module: true,
      wholesale_module: storeType === "wholesale" || storeType === "mix",
      wholesale_orders: storeType === "wholesale" || storeType === "mix",
      customer_directory: storeType === "wholesale" || storeType === "mix",
      khata_ledger: storeType === "wholesale" || storeType === "mix",
      whatsapp_reminders: storeType === "wholesale" || storeType === "mix",
      customer_app_accounts: storeType === "wholesale" || storeType === "mix",
      pdf_exports: true,
      max_staff_limit: 10,
    };
    const { error: updErr } = await admin
      .from("stores")
      .update({ store_type: storeType, feature_flags: featureFlags })
      .eq("id", ownerRow.store_id);
    if (updErr) {
      return new Response(JSON.stringify({ error: updErr.message }), {
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
}
