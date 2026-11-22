import type { Lang } from './types';

type Dict = Record<string, [string, string, string]>; // [en, hinglish, hi]

const DICT: Dict = {
  // Navigation
  shop: ['Shop', 'Shop', 'दुकान'],
  cart: ['Cart', 'Cart', 'कार्ट'],
  orders: ['Orders', 'Orders', 'ऑर्डर'],
  khata: ['Khata', 'Khata', 'खाता'],
  profile: ['Profile', 'Profile', 'प्रोफ़ाइल'],
  logout: ['Logout', 'Logout', 'लॉगआउट'],
  
  // Header / Common
  due: ['Due', 'Baki', 'बाकी'],
  searchPlaceholder: ['Search items or brands...', 'Item ya brand khojein...', 'सामान या ब्रांड खोजें...'],
  all: ['All', 'Sabhi', 'सभी'],
  inStockOnly: ['In Stock Only', 'Sirf Stock Mein', 'सिर्फ उपलब्ध माल'],
  buyAgain: ['Buy Again / Frequent Items', 'Pehle Mangwaya Hua Samaan', 'बार-बार मंगाया गया सामान'],
  activeOrderBanner: ['You have an active order', 'Aapka active order chal raha hai', 'आपका एक सक्रिय ऑर्डर चल रहा है'],
  trackLive: ['Tap to Track Live', 'Live Track Karein', 'लाइव ट्रैक करें'],

  // Product Card
  inStock: ['In Stock', 'Stock Mein Hai', 'उपलब्ध है'],
  lowStock: ['Low Stock', 'Kam Stock', 'कम स्टॉक'],
  outOfStock: ['Out of Stock', 'Khatam', 'स्टॉक खत्म'],
  add: ['Add', 'Jodein', 'जोड़ें'],
  addToCart: ['Add to Cart', 'Cart Mein Dalein', 'कार्ट में डालें'],
  onlyLeft: ['left', 'bache hain', 'बचे हैं'],

  // Cart & Checkout
  myCart: ['My Cart', 'Mera Cart', 'मेरा कार्ट'],
  emptyCart: ['Your cart is empty', 'Aapka cart khali hai', 'आपकी कार्ट खाली है'],
  emptyCartSub: ['Add items from the wholesale catalog to get started.', 'Wholesale catalog se item jodein.', 'थोक कैटलॉग से सामान जोड़ें।'],
  startShopping: ['Start Shopping', 'Kharidari Karein', 'खरीदारी शुरू करें'],
  activeOrderDetected: ['Active Open Order Found', 'Pehle Ka Khula Order Mila', 'सक्रिय खुला ऑर्डर मिला'],
  mergeIntoOrder: ['Merge into Order', 'Isi Order Mein Jodein', 'इसी ऑर्डर में जोड़ें'],
  placeSeparateOrder: ['Place as Separate Order', 'Alag Se Naya Order Karein', 'अलग नया ऑर्डर करें'],
  mergeNotice: ['Items will be added to your current open order without extra delivery delay.', 'Ye items aapke open order mein jud jayenge.', 'सामान आपके चालू ऑर्डर में जुड़ जाएगा।'],
  fulfillmentMode: ['Fulfillment Mode', 'Maal Kaise Chahiye', 'डिलीवरी का तरीका'],
  staffDelivery: ['Staff Delivery', 'Dukan Pe Delivery', 'स्टाफ डिलीवरी'],
  staffDeliveryDesc: ['Wholesaler staff will deliver directly to your shop', 'Wholesaler ka staff aapki dukan pe pahunchayega', 'थोक व्यापारी का स्टाफ आपकी दुकान पर डिलीवर करेगा'],
  selfPickup: ['Self-Pickup (At Shop)', 'Dukan Se Khud Lenge', 'दुकान से खुद लेंगे'],
  selfPickupDesc: ['Pick up directly from wholesaler counter', 'Wholesaler ki counter se khud maal uthayein', 'थोक व्यापारी की दुकान से स्वयं प्राप्त करें'],
  deliveryAddress: ['Delivery Address', 'Delivery Pata', 'डिलीवरी का पता'],
  wholesalerAddress: ['Wholesaler Shop Address', 'Wholesaler ki Dukan ka Pata', 'थोक दुकान का पता'],
  orderNotes: ['Order Note / Special Instructions (Optional)', 'Koi Khaas Baat / Note (Optional)', 'कोई विशेष निर्देश (वैकल्पिक)'],
  orderNotesPlaceholder: ['e.g., Send fresh batch, deliver before 4 PM...', 'Jaise: 4 baje se pehle bhejein...', 'उदा: ताज़ा लॉट भेजें, शाम 4 बजे से पहले...'],
  billSummary: ['Bill Summary', 'Bill ka Hisaab', 'बिल विवरण'],
  totalItems: ['Total Items', 'Kul Items', 'कुल आइटम'],
  totalUnits: ['Total Units', 'Kul Units', 'कुल यूनिट'],
  estimatedTotal: ['Estimated Total', 'Anumanit Kul Total', 'अनुमानित कुल राशि'],
  billDisclaimer: ['* Final bill may reflect any on-the-spot rate/discount agreed at delivery or pickup.', '* Delivery ke time rate ya discount alag ho sakta hai.', '* डिलीवरी या पिकअप के समय तय छूट के अनुसार अंतिम बिल में बदलाव हो सकता है।'],
  placeOrder: ['Place Order', 'Order Confirm Karein', 'ऑर्डर भेजें'],
  orderPlacedSuccess: ['Order Placed Successfully!', 'Order Lag Gaya!', 'ऑर्डर सफलतापूर्वक भेजा गया!'],

  // Orders Screen
  activeOrders: ['Active Orders', 'Chal Rahe Orders', 'सक्रिय ऑर्डर'],
  orderHistory: ['Order History', 'Purane Orders', 'पुराने ऑर्डर'],
  noOrders: ['No orders found', 'Koi order nahi mila', 'कोई ऑर्डर नहीं मिला'],
  liveStatus: ['Live Status', 'Live Status', 'लाइव स्थिति'],
  orderNumber: ['Order Number', 'Order Number', 'ऑर्डर नंबर'],
  stepPlaced: ['Order Placed', 'Order Bheja Gaya', 'ऑर्डर दिया गया'],
  stepSeen: ['Seen', 'Dekha Gaya', 'देखा गया'],
  stepPacked: ['Packed', 'Pack Ho Gaya', 'पैक हुआ'],
  stepOutForDelivery: ['Out for Delivery', 'Raste Mein Hai', 'डिलीवरी के लिए निकला'],
  stepReadyForPickup: ['Ready for Pickup', 'Pickup ke Liye Taiyar', 'पिकअप के लिए तैयार'],
  stepDelivered: ['Delivered', 'Delivered Ho Gaya', 'डिलीवर हुआ'],
  stepCompleted: ['Completed', 'Poora Hua', 'पूर्ण हुआ'],
  addMoreItems: ['+ Add More Items', '+ Aur Samaan Jodein', '+ और सामान जोड़ें'],
  cancelOrder: ['Cancel Order', 'Order Cancel Karein', 'ऑर्डर रद्द करें'],
  confirmCancel: ['Are you sure you want to cancel this order?', 'Kya aap pakka is order ko cancel karna chahte hain?', 'क्या आप वाकई इस ऑर्डर को रद्द करना चाहते हैं?'],
  downloadInvoice: ['Download Invoice PDF', 'Invoice PDF Download Karein', 'बिल PDF डाउनलोड करें'],
  reorderAll: ['Reorder All Items', 'Yehi Sab Dobara Mangwayein', 'यही सामान फिर से मंगाएं'],
  billingTransparency: ['Pricing & Adjustment Breakdown', 'Rate Aur Discount Ka Hisaab', 'रेट और डिस्काउंट विवरण'],
  originalRate: ['Original Rate', 'Pehle Ka Rate', 'शुरुआती रेट'],
  finalRate: ['Final Rate', 'Aakhri Rate', 'अंतिम रेट'],
  discountGiven: ['Discount Given', 'Mili Chhoot', 'मिली छूट'],
  paymentBreakdown: ['Payment Settlement Breakdown', 'Payment Kaha Gaya', 'भुगतान का विवरण'],
  paidCash: ['Paid via Cash', 'Cash Diya', 'नकद भुगतान'],
  paidUPI: ['Paid via UPI', 'UPI se Diya', 'UPI भुगतान'],
  addedToKhata: ['Added to Khata (Udhaar)', 'Khate Mein Likha (Udhaar)', 'खाते में दर्ज (उधार)'],
  proofPhoto: ['Delivery Proof Photo', 'Delivery Ka Photo', 'डिलीवरी का फोटो प्रमाण'],

  // Khata Screen
  pendingBalance: ['Pending Khata Balance', 'Aapka Baki Hisaab', 'बाकी खाता बैलेंस'],
  settledClear: ['All Clear! No Pending Dues', 'Khata Bilkul Nil Hai', 'कोई बकाया नहीं है!'],
  creditLimit: ['Credit Limit', 'Credit Limit', 'उधार सीमा'],
  billedThisMonth: ['Billed This Month', 'Is Mahine Ka Maal', 'इस महीने का कुल सामान'],
  paidThisMonth: ['Paid This Month', 'Is Mahine Diya', 'इस महीने दिया'],
  payViaUPI: ['Pay via UPI', 'UPI se Payment Karein', 'UPI से भुगतान करें'],
  payKhataNow: ['Pay Khata Now (Instant Auto-Update)', 'Khata Pay Karein (Turant Auto-Update)', 'खाता भुगतान करें (तुरंत ऑटो-अपडेट)'],
  customAmount: ['Custom Amount', 'Apni Marzi Ka Amount', 'मनचाही राशि'],
  fullDue: ['Full Due', 'Poora Baki', 'पूरा बकाया'],
  copyUpiId: ['Copy UPI ID', 'UPI ID Copy Karein', 'UPI ID कॉपी करें'],
  copied: ['Copied!', 'Copy Ho Gaya!', 'कॉपी हो गया!'],
  passbook: ['Khata Passbook', 'Khata Passbook', 'खाता पासबुक'],
  filterAll: ['All', 'Sabhi', 'सभी'],
  filterDebit: ['Udhaar (Debit)', 'Udhaar', 'उधार'],
  filterCredit: ['Payments (Credit)', 'Jama / Payment', 'जमा / भुगतान'],
  filterMonth: ['This Month', 'Is Mahine', 'इस महीने'],
  filterThreeMonths: ['Last 3 Months', 'Pichhle 3 Mahine', 'पिछले 3 महीने'],
  downloadStatement: ['Download Statement PDF', 'Statement PDF Download Karein', 'स्टेटमेंट PDF डाउनलोड करें'],
  balanceAfter: ['Balance After', 'Bacha Balance', 'शेष बैलेंस'],
  handledBy: ['Handled by', 'Kisne kiya', 'किसके द्वारा'],
  tapToViewOrder: ['Tap to view itemized order bill', 'Bill dekhne ke liye tap karein', 'बिल देखने के लिए टैप करें'],
  paymentReceipt: ['Payment Confirmed', 'Payment Ho Gaya', 'भुगतान सफल'],
  scanAndPay: ['Scan & Pay via any UPI App', 'Kisi bhi UPI App se Scan Karke Pay Karein', 'किसी भी UPI ऐप से स्कैन करके भुगतान करें'],
  openInUpi: ['Open in UPI App (GPay / PhonePe / Paytm)', 'UPI App Mein Kholein', 'UPI ऐप में खोलें'],
  downloadQR: ['Download QR', 'QR Download Karein', 'QR डाउनलोड करें'],
  waitingConfirmation: ['Waiting for payment confirmation...', 'Payment confirm hone ka intezaar...', 'भुगतान पुष्टि की प्रतीक्षा...'],
  checkStatus: ['Check Status', 'Status Check Karein', 'स्थिति जांचें'],
  simulateSuccess: ['Test Mode: Simulate Payment Success', 'Test Mode: Payment Simulate Karein', 'टेस्ट मोड: भुगतान सिमुलेट करें'],

  // Profile & Support
  myProfile: ['Customer Profile', 'Mera Profile', 'ग्राहक प्रोफ़ाइल'],
  connectedWholesaler: ['Connected Wholesaler', 'Wholesaler Dukan', 'जुड़ा हुआ थोक व्यापारी'],
  language: ['Language', 'Bhasha', 'भाषा'],
  callWholesaler: ['Call Wholesaler', 'Call Karein', 'कॉल करें'],
  whatsappWholesaler: ['WhatsApp', 'WhatsApp Karein', 'व्हाट्सएप करें'],

  // Suspended & Inactive screens
  storeSuspendedTitle: ['Service Temporarily Suspended', 'Dukan Ki Service Band Hai', 'सेवा अस्थायी रूप से निलंबित है'],
  storeSuspendedDesc: ['This wholesaler store is currently suspended. Please contact the store owner.', 'Yeh wholesaler abhi uplabdh nahi hai. Kripya dukan malik se baat karein.', 'यह थोक दुकान वर्तमान में उपलब्ध नहीं है। कृपया दुकान मालिक से संपर्क करें।'],
  accountInactiveTitle: ['Your Account is Inactive', 'Aapka Account Band Hai', 'आपका खाता निष्क्रिय है'],
  accountInactiveDesc: ['Your account has been deactivated by the wholesaler. Please contact your wholesaler to re-activate it.', 'Aapke wholesaler ne account band kiya hai. Re-activate karne ke liye unhe call karein.', 'थोक व्यापारी द्वारा आपका खाता निष्क्रिय कर दिया गया है। कृपया पुनः सक्रिय करने के लिए उनसे संपर्क करें।'],
  storeTypeMismatchTitle: ['Wholesale Access Only', 'Sirf Wholesale Dukan Ke Liye', 'केवल थोक दुकान हेतु'],
  storeTypeMismatchDesc: ['This portal is reserved for wholesale customers of registered wholesale/mix Kirana stores.', 'Yeh portal sirf wholesale dukanon ke retail gahak ke liye hai.', 'यह पोर्टल पंजीकृत थोक/मिक्स किराना दुकानों के ग्राहकों के लिए है।'],
};

export function t(key: string, lang: Lang): string {
  const entry = DICT[key];
  if (!entry) return key;
  const idx = lang === 'en' ? 0 : lang === 'hinglish' ? 1 : 2;
  return entry[idx] ?? entry[0];
}
