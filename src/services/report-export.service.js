import { formatVND } from "../config/i18n";

function escapeCsv(value) {
  const text = String(value ?? "");
  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

export function buildMonthlyReportCsv(report, period) {
  const rows = [];
  rows.push(["Báo cáo SplitRoom", period].map(escapeCsv).join(","));
  rows.push("");

  const stats = report?.stats || {};
  rows.push(["Chỉ số", "Giá trị"].map(escapeCsv).join(","));
  rows.push(["Tổng chi tiêu", formatVND(stats.expenseTotal || 0)].map(escapeCsv).join(","));
  rows.push(["Tổng thanh toán", formatVND(stats.paymentTotal || 0)].map(escapeCsv).join(","));
  rows.push(["Tiền nhà", formatVND(stats.rentTotal || 0)].map(escapeCsv).join(","));
  rows.push(["Số cấn trừ", String(stats.settlementCount || 0)].map(escapeCsv).join(","));
  rows.push("");

  rows.push(
    ["Thành viên", "Số dư ròng", "Phần tiền nhà", "Đã trả", "Còn thiếu"]
      .map(escapeCsv)
      .join(","),
  );

  for (const item of report?.memberSummaries || []) {
    const balance = Number(item.netBalance || 0);
    const balanceLabel =
      balance > 0
        ? `Được nhận ${formatVND(balance)}`
        : balance < 0
          ? `Phải trả ${formatVND(Math.abs(balance))}`
          : "Cân bằng";

    rows.push(
      [
        item.name,
        balanceLabel,
        formatVND(item.rentShare || 0),
        formatVND(item.rentPaid || 0),
        formatVND(item.rentRemaining || 0),
      ]
        .map(escapeCsv)
        .join(","),
    );
  }

  rows.push("");
  rows.push(["Cấn trừ cuối kỳ", "Số tiền"].map(escapeCsv).join(","));

  for (const item of report?.settlementPlan || []) {
    rows.push(
      [`${item.fromId} -> ${item.toId}`, formatVND(item.amount || 0)]
        .map(escapeCsv)
        .join(","),
    );
  }

  return `${rows.join("\n")}\n`;
}

export function downloadMonthlyReportCsv(report, period) {
  const csv = buildMonthlyReportCsv(report, period);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `splitroom-report-${period}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}
