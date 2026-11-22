import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { Store } from '@/lib/types';
import { formatDate } from '@/lib/format';
import { playSuccess } from '@/lib/sound';

interface InvoiceLine {
  name: string;
  qty: number;
  rate: number;
  total: number;
}

function formatPDFCurrency(amount: number | null | undefined): string {
  const value = Number(amount ?? 0);
  return 'Rs. ' + value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function generateInvoicePDF(opts: {
  store: Store;
  orderNumber: string;
  customerName: string;
  customerShop: string;
  customerPhone: string;
  items: InvoiceLine[];
  subtotal: number;
  discount: number;
  total: number;
  paymentMode: string;
  paidAmount: number;
  khataAmount: number;
  deliveredBy: string;
  dateISO: string;
}) {
  const doc = new jsPDF();
  const s = opts.store;

  // Header Details
  doc.setFontSize(18).setFont('helvetica', 'bold');
  doc.text(s.shop_name, 14, 18);
  doc.setFontSize(9).setFont('helvetica', 'normal');
  doc.text(`Store ID: ${s.store_code}`, 14, 24);
  if (s.address) doc.text(s.address, 14, 29, { maxWidth: 90 });
  if (s.phone) doc.text(`Ph: +91 ${s.phone}`, 14, s.address ? 34 : 29);
  if (s.gstin) doc.text(`GSTIN: ${s.gstin}`, 14, s.address ? 39 : 34);

  doc.setFontSize(14).setFont('helvetica', 'bold');
  doc.text('TAX INVOICE', 196, 18, { align: 'right' });
  doc.setFontSize(9).setFont('helvetica', 'normal');
  doc.text(`Order: ${opts.orderNumber}`, 196, 24, { align: 'right' });
  doc.text(`Date: ${formatDate(opts.dateISO)}`, 196, 29, { align: 'right' });

  doc.setFontSize(10).setFont('helvetica', 'bold');
  doc.text('Billed To:', 14, 48);
  doc.setFontSize(9).setFont('helvetica', 'normal');
  doc.text(`${opts.customerShop} (${opts.customerName})`, 14, 53);
  doc.text(`+91 ${opts.customerPhone}`, 14, 58);

  // Items Table
  autoTable(doc, {
    startY: 64,
    head: [['#', 'Item', 'Qty', 'Rate', 'Amount']],
    body: opts.items.map((it, i) => [
      i + 1,
      it.name,
      it.qty,
      formatPDFCurrency(it.rate),
      formatPDFCurrency(it.total),
    ]),
    styles: { fontSize: 9, cellPadding: 2.5, charSpace: 0 },
    headStyles: { fillColor: [16, 185, 129], textColor: 255 },
    columnStyles: {
      0: { cellWidth: 10, halign: 'center' },
      1: { cellWidth: 'auto', halign: 'left' },
      2: { cellWidth: 20, halign: 'right' },
      3: { cellWidth: 32, halign: 'right' },
      4: { cellWidth: 36, halign: 'right' },
    },
  });

  type DocWithTable = jsPDF & { lastAutoTable?: { finalY: number } };
  let y = ((doc as DocWithTable).lastAutoTable?.finalY ?? 100) + 6;

  // Invoice Summary Totals
  const rows: [string, string][] = [
    ['Subtotal', formatPDFCurrency(opts.subtotal)],
  ];
  if (opts.discount > 0) {
    rows.push(['Discount', `- ${formatPDFCurrency(opts.discount)}`]);
  }
  rows.push(['Total', formatPDFCurrency(opts.total)]);
  rows.push(['Payment Mode', opts.paymentMode || 'N/A']);
  rows.push(['Paid', formatPDFCurrency(opts.paidAmount)]);
  if (opts.khataAmount > 0) {
    rows.push(['Added to Khata', formatPDFCurrency(opts.khataAmount)]);
  }

  autoTable(doc, {
    startY: y,
    body: rows,
    theme: 'plain',
    styles: { fontSize: 9, cellPadding: 1.5, charSpace: 0 },
    columnStyles: {
      0: { cellWidth: 42, fontStyle: 'bold', halign: 'left' },
      1: { cellWidth: 40, halign: 'right' },
    },
    tableWidth: 82,
    margin: { left: 114 },
  });

  y = ((doc as DocWithTable).lastAutoTable?.finalY ?? y) + 10;

  // Footer notes
  doc.setFontSize(8).setTextColor(100);
  doc.text(`Delivered by: ${opts.deliveredBy || 'Store Staff'}`, 14, y);
  doc.text('Thank you for your business!', 14, y + 5);

  doc.save(`Invoice-${opts.orderNumber}.pdf`);
  playSuccess();
}

export function generateKhataStatementPDF(opts: {
  store: Store;
  customerName: string;
  customerShop: string;
  customerPhone: string;
  rangeLabel: string;
  openingBalance: number;
  entries: { date: string; ref: string; detail: string; debit: number; credit: number; balance: number }[];
  closingBalance: number;
}) {
  const doc = new jsPDF();
  const s = opts.store;

  // Header Details
  doc.setFontSize(18).setFont('helvetica', 'bold');
  doc.text(s.shop_name, 14, 18);
  doc.setFontSize(9).setFont('helvetica', 'normal');
  doc.text(`Store ID: ${s.store_code}`, 14, 24);
  if (s.address) doc.text(s.address, 14, 29, { maxWidth: 90 });
  if (s.upi_id) doc.text(`UPI: ${s.upi_id}`, 14, s.address ? 34 : 29);

  doc.setFontSize(13).setFont('helvetica', 'bold');
  doc.text('KHATA LEDGER STATEMENT', 196, 18, { align: 'right' });
  doc.setFontSize(9).setFont('helvetica', 'normal');
  doc.text(opts.rangeLabel, 196, 24, { align: 'right' });

  doc.setFontSize(10).setFont('helvetica', 'bold');
  doc.text('Customer:', 14, 48);
  doc.setFontSize(9).setFont('helvetica', 'normal');
  doc.text(`${opts.customerShop} (${opts.customerName})`, 14, 53);
  doc.text(`+91 ${opts.customerPhone}`, 14, 58);

  // Statement Table
  autoTable(doc, {
    startY: 64,
    head: [['Date', 'Reference', 'Details', 'Debit', 'Credit', 'Balance']],
    body: opts.entries.map((e) => [
      e.date,
      e.ref,
      e.detail,
      e.debit ? formatPDFCurrency(e.debit) : '',
      e.credit ? formatPDFCurrency(e.credit) : '',
      formatPDFCurrency(e.balance),
    ]),
    styles: { fontSize: 8, cellPadding: 2, charSpace: 0 },
    headStyles: { fillColor: [13, 148, 136], textColor: 255 },
    columnStyles: {
      0: { cellWidth: 24, halign: 'left' },
      1: { cellWidth: 26, halign: 'left' },
      2: { cellWidth: 'auto', halign: 'left' },
      3: { cellWidth: 28, halign: 'right' },
      4: { cellWidth: 28, halign: 'right' },
      5: { cellWidth: 32, halign: 'right' },
    },
  });

  type DocWithTable = jsPDF & { lastAutoTable?: { finalY: number } };
  let y = ((doc as DocWithTable).lastAutoTable?.finalY ?? 100) + 8;

  doc.setFontSize(10).setFont('helvetica', 'bold');
  doc.text(`Opening Balance: ${formatPDFCurrency(opts.openingBalance)}`, 14, y);
  doc.text(`Closing Balance: ${formatPDFCurrency(opts.closingBalance)}`, 14, y + 6);

  doc.save(`Khata-Statement-${opts.customerShop.replace(/\s+/g, '-')}.pdf`);
  playSuccess();
}
