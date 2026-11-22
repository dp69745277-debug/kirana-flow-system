import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { Store, WholesaleCustomer } from './types';
import { formatDate, formatDateTime } from './format';

interface InvoiceLine {
  name: string;
  qty: number;
  rate: number;
  total: number;
}

/**
 * Standard Indian Rupee format for PDF rendering.
 * Replaces Unicode '₹' with 'Rs. ' to avoid font encoding issues and weird character spacing
 * in standard jsPDF Helvetica fonts (e.g. 'Rs. 14,200' instead of '¹ 1 4 , 2 0 0').
 */
export function formatPDFCurrency(amount: number | null | undefined): string {
  const value = Number(amount ?? 0);
  return 'Rs. ' + value.toLocaleString('en-IN', { maximumFractionDigits: 2 });
}

export function generateCustomerInvoicePDF(opts: {
  store: Store;
  customer: WholesaleCustomer;
  orderNumber: string;
  items: InvoiceLine[];
  subtotal: number;
  discount: number;
  total: number;
  paymentMode: string | null;
  paidAmount: number;
  khataAmount: number;
  deliveredBy?: string | null;
  dateISO: string;
}) {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  // Ensure normal character spacing
  doc.setCharSpace(0);

  const s = opts.store;
  const c = opts.customer;

  // Header - Wholesaler Details (Left side, x=14)
  doc.setFontSize(18).setFont('helvetica', 'bold');
  doc.setTextColor(22, 101, 52); // emerald-800
  doc.text(s.shop_name, 14, 18);

  doc.setFontSize(9).setFont('helvetica', 'normal');
  doc.setTextColor(71, 85, 105);
  doc.text(`Store Code: ${s.store_code}`, 14, 24);
  if (s.address) doc.text(s.address, 14, 29, { maxWidth: 90 });
  const nextY = s.address ? 34 : 29;
  if (s.phone) doc.text(`Ph: +91 ${s.phone}`, 14, nextY);
  if (s.gstin) doc.text(`GSTIN: ${s.gstin}`, 14, nextY + 5);

  // Invoice Meta (Right side, x=196 right-aligned)
  doc.setFontSize(14).setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text('TAX INVOICE', 196, 18, { align: 'right' });

  doc.setFontSize(9).setFont('helvetica', 'normal');
  doc.setTextColor(100, 116, 139);
  doc.text(`Order #: ${opts.orderNumber}`, 196, 24, { align: 'right' });
  doc.text(`Date: ${formatDate(opts.dateISO)}`, 196, 29, { align: 'right' });

  // Customer Details (x=14)
  doc.setFontSize(10).setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text('Billed To (Customer):', 14, 48);

  doc.setFontSize(9).setFont('helvetica', 'normal');
  doc.setTextColor(51, 65, 85);
  doc.text(`${c.shop_name} (${c.name})`, 14, 53);
  doc.text(`Phone: +91 ${c.phone}`, 14, 58);
  if (c.address) doc.text(`Address: ${c.address}`, 14, 63, { maxWidth: 100 });

  const tableStartY = c.address ? 70 : 66;

  // Items Table (182mm width between 14mm margins)
  autoTable(doc, {
    startY: tableStartY,
    margin: { left: 14, right: 14 },
    tableWidth: 182,
    head: [[
      { content: '#', styles: { halign: 'center' } },
      { content: 'Item Name & Pack', styles: { halign: 'left' } },
      { content: 'Qty', styles: { halign: 'right' } },
      { content: 'Rate (Rs.)', styles: { halign: 'right' } },
      { content: 'Amount (Rs.)', styles: { halign: 'right' } },
    ]],
    body: opts.items.map((it, i) => [
      i + 1,
      it.name,
      it.qty,
      formatPDFCurrency(it.rate),
      formatPDFCurrency(it.total),
    ]),
    styles: {
      font: 'helvetica',
      fontSize: 9,
      cellPadding: { top: 2.5, bottom: 2.5, left: 3, right: 3 },
    },
    headStyles: {
      fillColor: [22, 163, 74], // emerald-600
      textColor: 255,
      fontStyle: 'bold',
      fontSize: 9,
    },
    columnStyles: {
      0: { cellWidth: 12, halign: 'center' },
      1: { cellWidth: 76, halign: 'left' },
      2: { cellWidth: 24, halign: 'right' },
      3: { cellWidth: 32, halign: 'right' },
      4: { cellWidth: 38, halign: 'right' },
    },
  });

  type DocWithTable = jsPDF & { lastAutoTable?: { finalY: number } };
  let y = ((doc as DocWithTable).lastAutoTable?.finalY ?? 100) + 6;

  // If table ran close to bottom, add new page
  if (y > 230) {
    doc.addPage();
    y = 20;
  }

  // Totals Breakdown Table
  const rows: [string, string][] = [
    ['Subtotal', formatPDFCurrency(opts.subtotal)],
  ];
  if (opts.discount > 0) {
    rows.push(['Discount', `- ${formatPDFCurrency(opts.discount)}`]);
  }
  rows.push(['Final Total', formatPDFCurrency(opts.total)]);
  if (opts.paymentMode) {
    rows.push(['Payment Mode', opts.paymentMode.toUpperCase()]);
  }
  if (opts.paidAmount > 0) {
    rows.push(['Paid Amount', formatPDFCurrency(opts.paidAmount)]);
  }
  if (opts.khataAmount > 0) {
    rows.push(['Added to Khata (Udhaar)', formatPDFCurrency(opts.khataAmount)]);
  }

  autoTable(doc, {
    startY: y,
    body: rows,
    theme: 'plain',
    margin: { left: 106, right: 14 },
    tableWidth: 90,
    styles: {
      font: 'helvetica',
      fontSize: 9,
      cellPadding: { top: 1.8, bottom: 1.8, left: 2.5, right: 3 },
    },
    columnStyles: {
      0: { cellWidth: 48, fontStyle: 'bold', halign: 'left' },
      1: { cellWidth: 42, halign: 'right' },
    },
  });

  y = ((doc as DocWithTable).lastAutoTable?.finalY ?? y) + 10;

  if (y > 275) {
    doc.addPage();
    y = 20;
  }

  // Footer notes
  doc.setFontSize(8).setFont('helvetica', 'normal').setTextColor(100);
  if (opts.deliveredBy) {
    doc.text(`Delivered / Handled by: ${opts.deliveredBy}`, 14, y);
    y += 4.5;
  }
  doc.text('Thank you for ordering with us!', 14, y);

  doc.save(`Invoice-${opts.orderNumber}.pdf`);
}

export function generateCustomerKhataPDF(opts: {
  store: Store;
  customer: WholesaleCustomer;
  rangeLabel: string;
  openingBalance: number;
  entries: { date: string; ref: string; detail: string; debit: number; credit: number; balance: number }[];
  closingBalance: number;
}) {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  // Ensure normal character spacing
  doc.setCharSpace(0);

  const s = opts.store;
  const c = opts.customer;

  // Header - Wholesaler Details
  doc.setFontSize(18).setFont('helvetica', 'bold');
  doc.setTextColor(22, 101, 52); // emerald-800
  doc.text(s.shop_name, 14, 18);

  doc.setFontSize(9).setFont('helvetica', 'normal');
  doc.setTextColor(71, 85, 105);
  doc.text(`Store Code: ${s.store_code}`, 14, 24);
  if (s.address) doc.text(s.address, 14, 29, { maxWidth: 90 });
  const nextY = s.address ? 34 : 29;
  if (s.phone) doc.text(`Ph: +91 ${s.phone}`, 14, nextY);
  if (s.upi_id) doc.text(`UPI for Payment: ${s.upi_id}`, 14, nextY + 5);

  // Title & Period (Right side, x=196 right-aligned)
  doc.setFontSize(13).setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text('CUSTOMER KHATA STATEMENT', 196, 18, { align: 'right' });

  doc.setFontSize(9).setFont('helvetica', 'normal');
  doc.setTextColor(100, 116, 139);
  doc.text(`Period: ${opts.rangeLabel}`, 196, 24, { align: 'right' });
  doc.text(`Generated: ${formatDateTime(new Date().toISOString())}`, 196, 29, { align: 'right' });

  // Customer Card
  doc.setFontSize(10).setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text('Customer Account:', 14, 48);

  doc.setFontSize(9).setFont('helvetica', 'normal');
  doc.setTextColor(51, 65, 85);
  doc.text(`${c.shop_name} (${c.name})`, 14, 53);
  doc.text(`Phone: +91 ${c.phone}`, 14, 58);
  if (c.address) doc.text(`Address: ${c.address}`, 14, 63, { maxWidth: 100 });

  const tableStartY = c.address ? 70 : 66;

  // Ledger Table (182mm width between 14mm margins)
  autoTable(doc, {
    startY: tableStartY,
    margin: { left: 14, right: 14 },
    tableWidth: 182,
    head: [[
      { content: 'Date & Time', styles: { halign: 'left' } },
      { content: 'Reference', styles: { halign: 'left' } },
      { content: 'Particulars', styles: { halign: 'left' } },
      { content: 'Debit (Rs.)', styles: { halign: 'right' } },
      { content: 'Credit (Rs.)', styles: { halign: 'right' } },
      { content: 'Balance (Rs.)', styles: { halign: 'right' } },
    ]],
    body: opts.entries.map((e) => [
      e.date,
      e.ref,
      e.detail,
      e.debit ? formatPDFCurrency(e.debit) : '—',
      e.credit ? formatPDFCurrency(e.credit) : '—',
      formatPDFCurrency(e.balance),
    ]),
    styles: {
      font: 'helvetica',
      fontSize: 8,
      cellPadding: { top: 2.2, bottom: 2.2, left: 2.5, right: 3 },
    },
    headStyles: {
      fillColor: [15, 118, 110], // teal-700
      textColor: 255,
      fontStyle: 'bold',
      fontSize: 8,
    },
    columnStyles: {
      0: { cellWidth: 32, halign: 'left' },
      1: { cellWidth: 26, halign: 'left' },
      2: { cellWidth: 44, halign: 'left' },
      3: { cellWidth: 26, halign: 'right' },
      4: { cellWidth: 26, halign: 'right' },
      5: { cellWidth: 28, halign: 'right' },
    },
  });

  type DocWithTable = jsPDF & { lastAutoTable?: { finalY: number } };
  let y = ((doc as DocWithTable).lastAutoTable?.finalY ?? 100) + 6;

  if (y > 240) {
    doc.addPage();
    y = 20;
  }

  // Summary Box (Opening & Closing Balance)
  autoTable(doc, {
    startY: y,
    body: [
      ['Opening Balance:', formatPDFCurrency(opts.openingBalance)],
      ['Closing Balance (Current Due):', formatPDFCurrency(opts.closingBalance)],
    ],
    theme: 'plain',
    margin: { left: 96, right: 14 },
    tableWidth: 100,
    styles: {
      font: 'helvetica',
      fontSize: 9,
      cellPadding: { top: 2, bottom: 2, left: 3, right: 3 },
    },
    columnStyles: {
      0: { cellWidth: 56, fontStyle: 'bold', halign: 'left' },
      1: { cellWidth: 44, halign: 'right', fontStyle: 'bold' },
    },
  });

  y = ((doc as DocWithTable).lastAutoTable?.finalY ?? y) + 10;

  if (y > 275) {
    doc.addPage();
    y = 20;
  }

  // Payment note at bottom
  if (s.upi_id) {
    doc.setFontSize(8.5).setFont('helvetica', 'normal').setTextColor(71, 85, 105);
    doc.text(`For online payment, please pay via UPI to: ${s.upi_id}`, 14, y);
    y += 4.5;
  }
  doc.setFontSize(8).setFont('helvetica', 'normal').setTextColor(148, 163, 184);
  doc.text('This is a computer-generated statement and does not require a physical signature.', 14, y);

  doc.save(`Khata-Statement-${c.shop_name.replace(/\s+/g, '-')}.pdf`);
}
