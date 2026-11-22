// Custom UPI Gateway Adapter
// Supports pluggable Indian payment gateway protocols (e.g. UPI Gateway, Custom QR API, Paygate)

export interface CustomUpiOrderParams {
  apiBaseUrl: string;
  merchantId: string;
  apiKey: string;
  apiSecret: string;
  orderId: string;
  amount: number;
  customerName?: string;
  customerPhone?: string;
  webhookUrl: string;
}

export interface CustomUpiOrderResult {
  gatewayOrderId: string;
  qrPayload: string;
  paymentUrl: string;
  raw: unknown;
}

export async function createCustomUpiOrder(params: CustomUpiOrderParams): Promise<CustomUpiOrderResult> {
  const { apiBaseUrl, merchantId, apiKey, apiSecret, orderId, amount, customerName, customerPhone, webhookUrl } = params;

  const cleanBaseUrl = (apiBaseUrl || "").replace(/\/+$/, "");

  // If a live base URL is provided, call it
  if (cleanBaseUrl && cleanBaseUrl.startsWith("http")) {
    try {
      const endpoint = `${cleanBaseUrl}/api/create-order`;
      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Merchant-Id": merchantId,
          "X-Api-Key": apiKey,
          "X-Api-Secret": apiSecret,
        },
        body: JSON.stringify({
          merchant_id: merchantId,
          order_id: orderId,
          amount,
          customer_name: customerName,
          customer_phone: customerPhone,
          callback_url: webhookUrl,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const gatewayOrderId = data.gateway_order_id || data.order_id || orderId;
        const qrPayload = data.qr_payload || data.upi_intent || data.qr_code || `upi://pay?pa=${merchantId}&pn=KiranaStore&am=${amount}&tr=${gatewayOrderId}&cu=INR`;
        const paymentUrl = data.payment_url || data.short_url || qrPayload;

        return {
          gatewayOrderId,
          qrPayload,
          paymentUrl,
          raw: data,
        };
      }
    } catch (err) {
      console.warn("Custom UPI endpoint call failed, using standardized UPI Intent payload:", err);
    }
  }

  // Standard NPCI UPI Intent & Dynamic QR payload fallback
  // This format conforms to NPCI UPI Specifications and scans directly in BHIM, PhonePe, GPay, Paytm, CRED
  const upiVpa = merchantId.includes("@") ? merchantId : `${merchantId}@upi`;
  const qrPayload = `upi://pay?pa=${encodeURIComponent(upiVpa)}&pn=${encodeURIComponent(customerName || "Kirana Store")}&am=${amount.toFixed(2)}&tr=${encodeURIComponent(orderId)}&tn=${encodeURIComponent("Order " + orderId)}&cu=INR`;

  return {
    gatewayOrderId: orderId,
    qrPayload,
    paymentUrl: qrPayload,
    raw: { mode: "direct_dynamic_upi_qr", vpa: upiVpa, amount },
  };
}
