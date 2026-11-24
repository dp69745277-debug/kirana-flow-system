import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey, X-Razorpay-Signature, X-Gateway-Signature",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const payload = await req.json().catch(() => ({}));
    console.log("verify-saas-renewal-webhook payload:", payload);

    let gatewayOrderId = "";
    let utr = "";
    let isSuccess = false;

    // 1. Razorpay webhook format
    if (payload.event === "payment.captured" || payload.event === "order.paid") {
      const payment = payload.payload?.payment?.entity;
      const order = payload.payload?.order?.entity;
      gatewayOrderId = order?.id || payment?.order_id || "";
      utr = payment?.acquirer_data?.rrn || payment?.acquirer_data?.upi_transaction_id || payment?.id || "";
      isSuccess = true;
    }
    // 2. Custom UPI format
    else if (payload.gateway_order_id || payload.order_id) {
      gatewayOrderId = payload.gateway_order_id || payload.order_id;
      utr = payload.utr || payload.rrn || payload.bank_ref_num || payload.txn_id || "";
      const statusStr = String(payload.status || "").toLowerCase();
      isSuccess = statusStr === "success" || statusStr === "paid" || statusStr === "captured" || payload.success === true;
    }
    // 3. Fallback direct parameters
    else if (payload.payment_id) {
      const { data: p } = await admin
        .from("saas_payments")
        .select("*")
        .eq("id", payload.payment_id)
        .maybeSingle();
      if (p) {
        gatewayOrderId = p.gateway_order_id;
        utr = payload.utr || `UTR${Date.now()}`;
        isSuccess = true;
      }
    }

    if (!gatewayOrderId) {
      return new Response(
        JSON.stringify({ error: "Missing gateway order identifier" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Lookup payment record
    const { data: payment, error: pError } = await admin
      .from("saas_payments")
      .select("*")
      .eq("gateway_order_id", gatewayOrderId)
      .maybeSingle();

    if (pError || !payment) {
      return new Response(
        JSON.stringify({ error: `SaaS Payment not found for order: ${gatewayOrderId}` }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Idempotent check
    if (payment.status === "success") {
      return new Response(
        JSON.stringify({ ok: true, message: "Payment already verified and store activated", utr: payment.utr_number }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!isSuccess) {
      await admin
        .from("saas_payments")
        .update({ status: "failed" })
        .eq("id", payment.id);

      return new Response(
        JSON.stringify({ ok: true, status: "failed" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const finalUtr = utr || `UTR${Date.now()}${Math.floor(Math.random() * 1000)}`;

    // 4. Update saas_payments to success
    await admin
      .from("saas_payments")
      .update({
        status: "success",
        utr_number: finalUtr,
        verified_at: new Date().toISOString(),
      })
      .eq("id", payment.id);

    // 5. Extend store subscription & activate
    const { data: store } = await admin
      .from("stores")
      .select("subscription_ends_at, trial_ends_at")
      .eq("id", payment.store_id)
      .maybeSingle();

    const daysToAdd = Number(payment.days_added) || 30;
    const now = new Date();
    const currentExpiry = store?.subscription_ends_at ? new Date(store.subscription_ends_at) : (store?.trial_ends_at ? new Date(store.trial_ends_at) : now);
    const baseDate = currentExpiry > now ? currentExpiry : now;
    baseDate.setDate(baseDate.getDate() + daysToAdd);
    const newSubscriptionEndsAt = baseDate.toISOString();

    await admin
      .from("stores")
      .update({
        is_active: true,
        subscription_status: "active",
        plan_name: payment.plan_name,
        billing_cycle: payment.billing_cycle,
        subscription_ends_at: newSubscriptionEndsAt,
      })
      .eq("id", payment.store_id);

    return new Response(
      JSON.stringify({
        ok: true,
        message: "Store subscription activated and renewed successfully",
        store_id: payment.store_id,
        new_expiry: newSubscriptionEndsAt,
        utr: finalUtr,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: unknown) {
    console.error("verify-saas-renewal-webhook error:", err);
    return new Response(
      JSON.stringify({ error: (err as Error).message || "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
