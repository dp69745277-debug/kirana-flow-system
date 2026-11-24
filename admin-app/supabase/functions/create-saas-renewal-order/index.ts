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

  try {
    const { store_id, plan_name = "pro", billing_cycle = "monthly", days_to_add = 30 } = await req.json().catch(() => ({}));

    if (!store_id) {
      return new Response(
        JSON.stringify({ error: "store_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // 1. Fetch store info
    const { data: store, error: storeError } = await admin
      .from("stores")
      .select("id, shop_name, owner_name, phone, custom_plan_price, plan_name")
      .eq("id", store_id)
      .maybeSingle();

    if (storeError || !store) {
      return new Response(
        JSON.stringify({ error: "Store not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. Fetch master platform & gateway settings (Admin's gateway)
    const { data: settings } = await admin
      .from("platform_settings")
      .select("*")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const provider = settings?.gateway_enabled ? (settings.gateway_provider || "manual_upi") : "manual_upi";
    const amount = Number(store.custom_plan_price || settings?.default_monthly_price || 499);
    const orderRef = `SAAS_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const webhookUrl = `${supabaseUrl}/functions/v1/verify-saas-renewal-webhook`;

    let gatewayOrderId = orderRef;
    let qrPayload = "";
    let paymentUrl = "";
    let rawResponse: Record<string, unknown> = {};

    // 3. Process via Admin's configured gateway
    if (provider === "custom_upi" && settings?.gateway_base_url) {
      try {
        const cleanBaseUrl = (settings.gateway_base_url || "").replace(/\/+$/, "");
        const res = await fetch(`${cleanBaseUrl}/api/create-order`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Merchant-Id": settings.gateway_merchant_id || "",
            "X-Api-Key": settings.gateway_api_key || "",
            "X-Api-Secret": settings.gateway_api_secret || "",
          },
          body: JSON.stringify({
            merchant_id: settings.gateway_merchant_id || settings.admin_upi_id,
            order_id: orderRef,
            amount,
            customer_name: store.shop_name,
            customer_phone: store.phone,
            callback_url: webhookUrl,
          }),
        });

        if (res.ok) {
          const data = await res.json();
          gatewayOrderId = data.gateway_order_id || data.order_id || orderRef;
          qrPayload = data.qr_payload || data.upi_intent || data.qr_code || "";
          paymentUrl = data.payment_url || data.short_url || qrPayload;
          rawResponse = data;
        }
      } catch (err) {
        console.warn("Custom UPI gateway call failed, falling back to dynamic UPI intent:", err);
      }
    } else if (provider === "razorpay" && settings?.gateway_api_key && settings?.gateway_api_secret) {
      try {
        const basicAuth = btoa(`${settings.gateway_api_key}:${settings.gateway_api_secret}`);
        const rzpRes = await fetch("https://api.razorpay.com/v1/orders", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Basic ${basicAuth}`,
          },
          body: JSON.stringify({
            amount: Math.round(amount * 100), // paise
            currency: "INR",
            receipt: orderRef.slice(0, 36),
            notes: {
              store_id,
              type: "saas_renewal",
              plan_name,
              days_to_add: String(days_to_add),
            },
          }),
        });

        if (rzpRes.ok) {
          const rzpData = await rzpRes.json();
          gatewayOrderId = rzpData.id;
          paymentUrl = `https://rzp.io/i/${rzpData.id}`;
          rawResponse = rzpData;
        }
      } catch (err) {
        console.warn("Razorpay order creation failed:", err);
      }
    }

    // Standard NPCI Dynamic UPI Intent Fallback
    const adminUpi = settings?.admin_upi_id || "kirana@upi";
    const cleanVpa = adminUpi.includes("@") ? adminUpi : `${adminUpi}@upi`;
    if (!qrPayload) {
      qrPayload = `upi://pay?pa=${encodeURIComponent(cleanVpa)}&pn=${encodeURIComponent(settings?.brand_name || "Kirana SaaS")}&am=${amount.toFixed(2)}&tr=${encodeURIComponent(gatewayOrderId)}&tn=${encodeURIComponent("SaaS Renewal " + store.shop_name)}&cu=INR`;
      paymentUrl = qrPayload;
    }

    // 4. Record pending payment in saas_payments
    const { data: paymentRecord, error: insertError } = await admin
      .from("saas_payments")
      .insert({
        store_id,
        amount,
        plan_name,
        billing_cycle,
        gateway_order_id: gatewayOrderId,
        status: "pending",
        days_added: Number(days_to_add) || 30,
        payment_method: provider,
        notes: `Renewal order generated for ${store.shop_name}`,
      })
      .select("id")
      .single();

    if (insertError) {
      console.error("Error creating saas_payment record:", insertError);
    }

    return new Response(
      JSON.stringify({
        success: true,
        payment_id: paymentRecord?.id,
        gateway_order_id: gatewayOrderId,
        provider,
        amount,
        admin_upi_id: cleanVpa,
        qr_payload: qrPayload,
        payment_url: paymentUrl,
        raw: rawResponse,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: unknown) {
    console.error("create-saas-renewal-order error:", err);
    return new Response(
      JSON.stringify({ error: (err as Error).message || "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
