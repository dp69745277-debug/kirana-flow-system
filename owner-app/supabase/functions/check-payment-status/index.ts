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
    const { transaction_id, simulate_success } = await req.json().catch(() => ({}));

    if (!transaction_id) {
      return new Response(JSON.stringify({ error: "transaction_id is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: tx, error: txError } = await admin
      .from("payment_transactions")
      .select("*")
      .eq("id", transaction_id)
      .maybeSingle();

    if (txError || !tx) {
      return new Response(JSON.stringify({ error: "Transaction not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // If already verified
    if (tx.status === "success") {
      return new Response(
        JSON.stringify({ ok: true, status: "success", utr: tx.utr_number, amount: tx.amount }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // In Test Mode / simulation button if requested
    if (simulate_success) {
      const simulatedUtr = `SIM_UTR_${Date.now()}`;
      await admin
        .from("payment_transactions")
        .update({
          status: "success",
          utr_number: simulatedUtr,
          verified_at: new Date().toISOString(),
          raw_response: { mode: "manual_or_test_verified", timestamp: new Date().toISOString() },
        })
        .eq("id", tx.id);

      // If purpose === 'khata_payment'
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
            notes: `Online UPI Payment • UTR: ${simulatedUtr}`,
          });

          await admin
            .from("wholesale_customers")
            .update({ current_khata_balance: newBalance })
            .eq("id", tx.customer_id);
        }
      }

      return new Response(
        JSON.stringify({ ok: true, status: "success", utr: simulatedUtr, amount: tx.amount }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Return current status
    return new Response(
      JSON.stringify({ ok: true, status: tx.status, utr: tx.utr_number, amount: tx.amount }),
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
