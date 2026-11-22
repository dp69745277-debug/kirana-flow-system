import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { createCustomUpiOrder } from "./customUpiAdapter.ts";

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
    const { store_id, customer_id, order_id, purpose, amount } = await req.json();

    if (!store_id || !amount || Number(amount) <= 0) {
      return new Response(
        JSON.stringify({ error: "store_id and valid amount are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Fetch store info
    const { data: store, error: storeError } = await admin
      .from("stores")
      .select("id, shop_name, upi_id")
      .eq("id", store_id)
      .maybeSingle();

    if (storeError || !store) {
      return new Response(
        JSON.stringify({ error: "Store not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch store payment gateway credentials (secured server-side)
    const { data: gateway } = await admin
      .from("store_payment_gateways")
      .select("*")
      .eq("store_id", store_id)
      .maybeSingle();

    const provider = gateway?.is_enabled ? (gateway.provider || "manual_upi") : "manual_upi";
    const numAmount = Number(amount);
    const orderRef = `KRN_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const webhookUrl = `${supabaseUrl}/functions/v1/verify-payment-webhook`;

    let gatewayOrderId = orderRef;
    let qrPayload = "";
    let paymentUrl = "";
    let rawResponse: Record<string, unknown> = {};

    if (provider === "custom_upi" && gateway) {
      const result = await createCustomUpiOrder({
        apiBaseUrl: gateway.api_base_url || "",
        merchantId: gateway.merchant_id || store.upi_id || "kirana@upi",
        apiKey: gateway.api_key || "",
        apiSecret: gateway.api_secret || "",
        orderId: orderRef,
        amount: numAmount,
        customerName: store.shop_name,
        webhookUrl,
      });
      gatewayOrderId = result.gatewayOrderId;
      qrPayload = result.qrPayload;
      paymentUrl = result.paymentUrl;
      rawResponse = result.raw as Record<string, unknown>;
    } else if (provider === "razorpay" && gateway?.api_key && gateway?.api_secret) {
      try {
        const basicAuth = btoa(`${gateway.api_key}:${gateway.api_secret}`);
        const rzpRes = await fetch("https://api.razorpay.com/v1/orders", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Basic ${basicAuth}`,
          },
          body: JSON.stringify({
            amount: Math.round(numAmount * 100), // in paise
            currency: "INR",
            receipt: orderRef.slice(0, 36),
            notes: {
              store_id,
              order_id: order_id || "",
              purpose: purpose || "order_delivery",
            },
          }),
        });

        if (rzpRes.ok) {
          const rzpData = await rzpRes.json();
          gatewayOrderId = rzpData.id;
          paymentUrl = `https://rzp.io/i/${rzpData.id}`;
          // Standard dynamic UPI payload for Razorpay order
          qrPayload = `upi://pay?pa=${encodeURIComponent(gateway.merchant_id || "razorpay@icici")}&pn=${encodeURIComponent(store.shop_name)}&am=${numAmount.toFixed(2)}&tr=${gatewayOrderId}&tn=${encodeURIComponent(orderRef)}&cu=INR`;
          rawResponse = rzpData;
        } else {
          const errText = await rzpRes.text();
          console.warn("Razorpay order creation returned non-200:", errText);
          // Fallback to dynamic UPI intent
          qrPayload = `upi://pay?pa=${encodeURIComponent(store.upi_id || "kirana@upi")}&pn=${encodeURIComponent(store.shop_name)}&am=${numAmount.toFixed(2)}&tr=${orderRef}&cu=INR`;
          paymentUrl = qrPayload;
        }
      } catch (err) {
        console.warn("Razorpay API request error:", err);
        qrPayload = `upi://pay?pa=${encodeURIComponent(store.upi_id || "kirana@upi")}&pn=${encodeURIComponent(store.shop_name)}&am=${numAmount.toFixed(2)}&tr=${orderRef}&cu=INR`;
        paymentUrl = qrPayload;
      }
    } else {
      // Manual UPI fallback
      const upiId = store.upi_id || "kirana@upi";
      qrPayload = `upi://pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent(store.shop_name)}&am=${numAmount.toFixed(2)}&tr=${orderRef}&cu=INR`;
      paymentUrl = qrPayload;
      rawResponse = { mode: "manual_upi", upi_id: upiId };
    }

    // Insert pending row into payment_transactions
    const { data: tx, error: txError } = await admin
      .from("payment_transactions")
      .insert({
        store_id,
        customer_id: customer_id || null,
        order_id: order_id || null,
        purpose: purpose || "order_delivery",
        provider,
        amount: numAmount,
        gateway_order_id: gatewayOrderId,
        qr_payload: qrPayload,
        payment_url: paymentUrl,
        status: "pending",
        raw_response: rawResponse,
      })
      .select()
      .single();

    if (txError) {
      return new Response(
        JSON.stringify({ error: txError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        ok: true,
        transactionId: tx.id,
        gatewayOrderId,
        qrPayload,
        paymentUrl,
        provider,
        amount: numAmount,
        mode: gateway?.mode || "test",
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
