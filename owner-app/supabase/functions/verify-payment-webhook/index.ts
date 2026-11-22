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
    console.log("Webhook received payload:", payload);

    // Identify gateway order ID and UTR / status from either Razorpay, Custom UPI, or direct post
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
    // 2. Custom UPI Gateway webhook format
    else if (payload.gateway_order_id || payload.order_id) {
      gatewayOrderId = payload.gateway_order_id || payload.order_id;
      utr = payload.utr || payload.rrn || payload.bank_ref_num || payload.txn_id || "";
      const statusStr = String(payload.status || "").toLowerCase();
      isSuccess = statusStr === "success" || statusStr === "paid" || statusStr === "captured" || payload.success === true;
    }
    // 3. Fallback generic parameters
    else if (payload.transaction_id) {
      const { data: t } = await admin
        .from("payment_transactions")
        .select("*")
        .eq("id", payload.transaction_id)
        .maybeSingle();
      if (t) {
        gatewayOrderId = t.gateway_order_id;
        utr = payload.utr || "UPI" + Date.now();
        isSuccess = true;
      }
    }

    if (!gatewayOrderId) {
      return new Response(JSON.stringify({ error: "Missing gateway order identifier" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Lookup transaction
    const { data: tx, error: txError } = await admin
      .from("payment_transactions")
      .select("*")
      .eq("gateway_order_id", gatewayOrderId)
      .maybeSingle();

    if (txError || !tx) {
      return new Response(JSON.stringify({ error: "Transaction not found for order: " + gatewayOrderId }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Idempotent completion check
    if (tx.status === "success") {
      return new Response(
        JSON.stringify({ ok: true, message: "Transaction already processed as success", utr: tx.utr_number }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!isSuccess) {
      await admin
        .from("payment_transactions")
        .update({ status: "failed", raw_response: payload })
        .eq("id", tx.id);

      return new Response(JSON.stringify({ ok: true, status: "failed" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const finalUtr = utr || `UTR${Date.now()}${Math.floor(Math.random() * 1000)}`;

    // Update transaction to success
    await admin
      .from("payment_transactions")
      .update({
        status: "success",
        utr_number: finalUtr,
        verified_at: new Date().toISOString(),
        raw_response: payload,
      })
      .eq("id", tx.id);

    // Business Logic: purpose === 'khata_payment'
    if (tx.purpose === "khata_payment" && tx.customer_id) {
      const { data: customer } = await admin
        .from("wholesale_customers")
        .select("id, current_khata_balance")
        .eq("id", tx.customer_id)
        .maybeSingle();

      if (customer) {
        const newBalance = Math.max(0, Number(customer.current_khata_balance) - Number(tx.amount));

        await admin.from("khata_transactions").insert({
          store_id: tx.store_id,
          customer_id: tx.customer_id,
          type: "credit_payment",
          amount: Number(tx.amount),
          payment_mode: "upi",
          balance_after: newBalance,
          notes: `Online UPI Payment • UTR: ${finalUtr}`,
        });

        await admin
          .from("wholesale_customers")
          .update({ current_khata_balance: newBalance })
          .eq("id", tx.customer_id);
      }
    }

    // Business Logic: purpose === 'order_delivery'
    // Marks the transaction success so staff client or background automatically records it
    if (tx.purpose === "order_delivery" && tx.order_id) {
      const { data: order } = await admin
        .from("orders")
        .select("id, status, paid_amount, final_total")
        .eq("id", tx.order_id)
        .maybeSingle();

      if (order && order.status !== "delivered") {
        await admin
          .from("orders")
          .update({
            status: "delivered",
            payment_mode: "upi",
            paid_amount: Number(tx.amount),
            khata_amount: Math.max(0, Number(order.final_total) - Number(tx.amount)),
            notes: (order as any).notes ? `${(order as any).notes} | UPI UTR: ${finalUtr}` : `UPI UTR: ${finalUtr}`,
            updated_at: new Date().toISOString(),
          })
          .eq("id", tx.order_id);
      }
    }

    return new Response(
      JSON.stringify({ ok: true, status: "success", utr: finalUtr }),
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
