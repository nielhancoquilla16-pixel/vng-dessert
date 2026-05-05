const pesoFormatter = new Intl.NumberFormat('en-PH', {
  style: 'currency',
  currency: 'PHP',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export const REPORT_PAYMENT_OPTIONS = [
  { value: 'cash', label: 'Cash' },
  { value: 'gcash', label: 'GCash' },
  { value: 'online', label: 'Online' },
  { value: 'card', label: 'Card' },
  { value: 'other', label: 'Other' },
];

export const REPORT_PAYMENT_FILTER_OPTIONS = [
  { value: 'all', label: 'All Payment Types' },
  ...REPORT_PAYMENT_OPTIONS,
];

export const formatPeso = (value = 0) => pesoFormatter.format(Number(value) || 0);

export const formatPaymentType = (value = 'cash') => {
  const normalized = String(value || 'cash').toLowerCase();
  const matchedOption = REPORT_PAYMENT_OPTIONS.find((option) => option.value === normalized);
  return matchedOption ? matchedOption.label : 'Cash';
};

export const getCurrentDateInputValue = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const getMonthKey = (value = '') => {
  const normalized = String(value || '').trim();

  if (/^\d{4}-\d{2}$/.test(normalized)) {
    return normalized;
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    return normalized.slice(0, 7);
  }

  return '';
};

export const getMonthDateValue = (monthKey = '') => {
  const normalizedMonth = getMonthKey(monthKey);
  return normalizedMonth ? `${normalizedMonth}-01` : '';
};

export const formatMonthLabel = (value = '') => {
  const monthKey = getMonthKey(value);
  if (!monthKey) {
    return 'All Months';
  }

  const [year, month] = monthKey.split('-').map((part) => Number(part));
  const labelDate = new Date(year, month - 1, 1);
  return labelDate.toLocaleDateString('en-PH', {
    month: 'long',
    year: 'numeric',
  });
};

export const formatShortDate = (value = '') => {
  if (!value) {
    return 'No date';
  }

  const parsedDate = new Date(value);
  if (Number.isNaN(parsedDate.getTime())) {
    return value;
  }

  return parsedDate.toLocaleDateString('en-PH', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
};

export const formatDateTime = (value = '') => {
  if (!value) {
    return 'No timestamp';
  }

  const parsedDate = new Date(value);
  if (Number.isNaN(parsedDate.getTime())) {
    return value;
  }

  return parsedDate.toLocaleString('en-PH', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
};

export const filterSalesReports = (reports = [], filters = {}) => {
  const selectedMonth = getMonthKey(filters.month);
  const selectedStaffId = String(filters.staffId || '').trim();
  const selectedPaymentType = String(filters.paymentType || 'all').trim().toLowerCase();
  const dateFrom = String(filters.dateFrom || '').trim();
  const dateTo = String(filters.dateTo || '').trim();

  return reports.filter((report) => {
    const reportMonth = getMonthKey(report.reportMonth || report.reportDate);
    const reportDate = String(report.reportDate || '').trim();
    const paymentType = String(report.paymentType || '').toLowerCase();

    if (selectedMonth && reportMonth !== selectedMonth) {
      return false;
    }

    if (selectedStaffId && selectedStaffId !== 'all' && String(report.staffId) !== selectedStaffId) {
      return false;
    }

    if (selectedPaymentType && selectedPaymentType !== 'all' && paymentType !== selectedPaymentType) {
      return false;
    }

    if (dateFrom && reportDate && reportDate < dateFrom) {
      return false;
    }

    if (dateTo && reportDate && reportDate > dateTo) {
      return false;
    }

    return true;
  });
};

export const aggregateSalesReportItems = (reports = []) => {
  const itemMap = new Map();

  reports.forEach((report) => {
    (report.items || []).forEach((item) => {
      const itemName = String(item.itemName || '').trim();
      if (!itemName) {
        return;
      }

      const normalizedKey = itemName.toLowerCase();
      const existingItem = itemMap.get(normalizedKey);
      const quantity = Number(item.quantity) || 0;
      const totalSales = Number(item.totalSales) || 0;

      if (existingItem) {
        existingItem.quantity += quantity;
        existingItem.totalSales += totalSales;
        return;
      }

      itemMap.set(normalizedKey, {
        itemName,
        quantity,
        totalSales,
      });
    });
  });

  return Array.from(itemMap.values()).sort((left, right) => {
    if (right.totalSales !== left.totalSales) {
      return right.totalSales - left.totalSales;
    }

    return left.itemName.localeCompare(right.itemName);
  });
};

export const getSummaryTotals = (rows = []) => (
  rows.reduce((totals, row) => ({
    quantity: totals.quantity + (Number(row.quantity) || 0),
    sales: totals.sales + (Number(row.totalSales) || 0),
  }), {
    quantity: 0,
    sales: 0,
  })
);

const sanitizeFilenamePart = (value = '') => (
  String(value || '')
    .trim()
    // eslint-disable-next-line no-control-regex
    .replace(/[<>:"/\\|?*\x00-\x1F]+/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase()
);

const downloadBlob = (blob, filename) => {
  const objectUrl = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(objectUrl);
};

const escapeCsvValue = (value = '') => {
  const normalized = String(value ?? '');
  return /[",\n]/.test(normalized)
    ? `"${normalized.replace(/"/g, '""')}"`
    : normalized;
};

export const downloadSalesReportCsv = ({
  summaryRows = [],
  totals = { quantity: 0, sales: 0 },
  monthLabel = 'All Months',
  staffLabel = 'All Staff',
  paymentLabel = 'All Payment Types',
  reportCount = 0,
  returnRows = [],
  returnTotal = 0,
}) => {
  const csvLines = [
    ['Sales Report Summary', monthLabel, staffLabel, paymentLabel, `${reportCount} completed transaction(s)`],
    [],
    ['Item Name', 'Quantity Sold', 'Total Sales'],
    ...summaryRows.map((row) => [
      row.itemName,
      row.quantity,
      Number(row.totalSales || 0).toFixed(2),
    ]),
    [],
    ['Overall Total', totals.quantity, Number(totals.sales || 0).toFixed(2)],
    [],
    ['Returns History', `${returnTotal} returned item(s)`],
    ['Date', 'Product Name', 'Quantity Returned', 'Reason'],
    ...returnRows.map((row) => [
      row.date,
      row.productName,
      row.quantityReturned,
      row.reason,
    ]),
  ];

  const csvContent = csvLines
    .map((row) => row.map((cell) => escapeCsvValue(cell)).join(','))
    .join('\r\n');

  const monthKey = sanitizeFilenamePart(monthLabel) || 'sales-report';
  downloadBlob(
    new Blob([csvContent], { type: 'text/csv;charset=utf-8' }),
    `sales-report-${monthKey}.csv`,
  );
};

const escapeHtml = (value = '') => (
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
);

export const openSalesReportPrintView = ({
  mode = 'print',
  heading = 'Sales Report',
  monthLabel = 'All Months',
  staffLabel = 'All Staff',
  paymentLabel = 'All Payment Types',
  summaryRows = [],
  totals = { quantity: 0, sales: 0 },
  reportCount = 0,
  submittedReports = [],
  returnRows = [],
  returnTotal = 0,
}) => {
  const printWindow = window.open('', '_blank', 'noopener,noreferrer');

  if (!printWindow) {
    return false;
  }

  const summaryRowsHtml = summaryRows.length > 0
    ? summaryRows.map((row) => `
        <tr>
          <td>${escapeHtml(row.itemName)}</td>
          <td>${escapeHtml(row.quantity)}</td>
          <td>${escapeHtml(formatPeso(row.totalSales))}</td>
        </tr>
      `).join('')
    : `
      <tr>
        <td colspan="3" class="empty-row">No matching sales report entries for the selected filters.</td>
      </tr>
    `;

  const reportRowsHtml = submittedReports.length > 0
    ? submittedReports.map((report) => `
        <tr>
          <td>${escapeHtml(report.staff?.fullName || report.staff?.username || 'Staff')}</td>
          <td>${escapeHtml(formatShortDate(report.reportDate))}</td>
          <td>${escapeHtml(formatPaymentType(report.paymentType))}</td>
          <td>${escapeHtml(formatPeso(report.totalSales))}</td>
        </tr>
      `).join('')
    : `
      <tr>
        <td colspan="4" class="empty-row">No submitted reports found.</td>
      </tr>
    `;

  const returnRowsHtml = returnRows.length > 0
    ? returnRows.map((row) => `
        <tr>
          <td>${escapeHtml(row.date)}</td>
          <td>${escapeHtml(row.productName)}</td>
          <td>${escapeHtml(row.quantityReturned)}</td>
          <td>${escapeHtml(row.reason)}</td>
        </tr>
      `).join('')
    : `
      <tr>
        <td colspan="4" class="empty-row">No returned items found for the selected filters.</td>
      </tr>
    `;

  const helperNote = mode === 'pdf'
    ? 'Choose "Save as PDF" in the print dialog to download this report as a PDF file.'
    : 'Use your browser print dialog to print the current filtered sales report.';

  printWindow.document.write(`
    <!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <title>${escapeHtml(heading)}</title>
        <style>
          :root {
            color-scheme: light;
          }

          * {
            box-sizing: border-box;
          }

          body {
            margin: 0;
            font-family: "Segoe UI", Tahoma, Geneva, Verdana, sans-serif;
            background: #f8fafc;
            color: #0f172a;
          }

          .sheet {
            width: min(980px, 100%);
            margin: 0 auto;
            padding: 32px;
            background: white;
          }

          .sheet-head {
            display: flex;
            justify-content: space-between;
            gap: 24px;
            align-items: flex-start;
            margin-bottom: 24px;
          }

          .sheet-head h1 {
            margin: 0 0 8px;
            font-size: 30px;
          }

          .sheet-note {
            padding: 12px 16px;
            border-radius: 14px;
            background: #eff6ff;
            border: 1px solid #bfdbfe;
            color: #1d4ed8;
            font-size: 14px;
            line-height: 1.6;
            max-width: 360px;
          }

          .meta-grid {
            display: grid;
            grid-template-columns: repeat(3, minmax(0, 1fr));
            gap: 12px;
            margin-bottom: 20px;
          }

          .meta-card {
            border: 1px solid #e2e8f0;
            border-radius: 16px;
            padding: 16px 18px;
            background: #fffdf5;
          }

          .meta-card span {
            display: block;
            font-size: 12px;
            font-weight: 700;
            letter-spacing: 0.08em;
            text-transform: uppercase;
            color: #64748b;
            margin-bottom: 6px;
          }

          .meta-card strong {
            font-size: 18px;
          }

          .summary-grid {
            display: grid;
            grid-template-columns: repeat(3, minmax(0, 1fr));
            gap: 12px;
            margin-bottom: 24px;
          }

          .summary-card {
            background: #f8fafc;
            border: 1px solid #dbeafe;
            border-radius: 16px;
            padding: 16px 18px;
          }

          .summary-card span {
            display: block;
            font-size: 13px;
            color: #475569;
            margin-bottom: 6px;
          }

          .summary-card strong {
            font-size: 26px;
            color: #0f172a;
          }

          .summary-card strong.sales-total {
            color: #15803d;
          }

          .section-title {
            margin: 0 0 12px;
            font-size: 18px;
          }

          table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 22px;
          }

          thead {
            background: #f8fafc;
          }

          th,
          td {
            padding: 12px 14px;
            border: 1px solid #e2e8f0;
            text-align: left;
            vertical-align: top;
          }

          th {
            font-size: 13px;
            text-transform: uppercase;
            letter-spacing: 0.06em;
            color: #475569;
          }

          .total-row td {
            font-weight: 800;
            background: #f0fdf4;
          }

          .empty-row {
            color: #64748b;
            text-align: center;
          }

          @media print {
            body {
              background: white;
            }

            .sheet {
              width: 100%;
              padding: 0;
            }
          }
        </style>
      </head>
      <body>
        <main class="sheet">
          <section class="sheet-head">
            <div>
              <h1>${escapeHtml(heading)}</h1>
              <div>${escapeHtml(monthLabel)}</div>
            </div>
            <div class="sheet-note">${escapeHtml(helperNote)}</div>
          </section>

          <section class="meta-grid">
            <article class="meta-card">
              <span>Month</span>
              <strong>${escapeHtml(monthLabel)}</strong>
            </article>
            <article class="meta-card">
              <span>Staff</span>
              <strong>${escapeHtml(staffLabel)}</strong>
            </article>
            <article class="meta-card">
              <span>Payment</span>
              <strong>${escapeHtml(paymentLabel)}</strong>
            </article>
          </section>

          <section class="summary-grid">
            <article class="summary-card">
              <span>Total Sales</span>
              <strong class="sales-total">${escapeHtml(formatPeso(totals.sales))}</strong>
            </article>
            <article class="summary-card">
              <span>Total Items Sold</span>
              <strong>${escapeHtml(totals.quantity)}</strong>
            </article>
            <article class="summary-card">
            <span>Completed Transactions</span>
              <strong>${escapeHtml(reportCount)}</strong>
            </article>
            <article class="summary-card">
              <span>Total Returns</span>
              <strong>${escapeHtml(returnTotal)}</strong>
            </article>
          </section>

          <section>
            <h2 class="section-title">Item Summary</h2>
            <table>
              <thead>
                <tr>
                  <th>Item Name</th>
                  <th>Quantity Sold</th>
                  <th>Total Sales</th>
                </tr>
              </thead>
              <tbody>
                ${summaryRowsHtml}
                <tr class="total-row">
                  <td>Overall Total</td>
                  <td>${escapeHtml(totals.quantity)}</td>
                  <td>${escapeHtml(formatPeso(totals.sales))}</td>
                </tr>
              </tbody>
            </table>
          </section>

          <section>
            <h2 class="section-title">Completed Transactions</h2>
            <table>
              <thead>
                <tr>
                  <th>Staff</th>
                  <th>Completed Date</th>
                  <th>Payment Type</th>
                  <th>Total Sales</th>
                </tr>
              </thead>
              <tbody>
                ${reportRowsHtml}
              </tbody>
            </table>
          </section>

          <section>
            <h2 class="section-title">Returns History</h2>
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Product Name</th>
                  <th>Quantity Returned</th>
                  <th>Reason</th>
                </tr>
              </thead>
              <tbody>
                ${returnRowsHtml}
              </tbody>
            </table>
          </section>
        </main>
      </body>
    </html>
  `);

  printWindow.document.close();
  printWindow.focus();

  window.setTimeout(() => {
    printWindow.print();
  }, 250);

  return true;
};

export const buildSalesReportFilename = (prefix = 'sales-report', monthValue = '') => {
  const monthPart = sanitizeFilenamePart(formatMonthLabel(monthValue)) || 'all-months';
  return `${prefix}-${monthPart}`;
};
