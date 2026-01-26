// src/config/i18n.js

export const LANG = "vi"; // sau này có thể đổi "en"

export const i18n = {
  vi: {
    // ===== Dashboard =====
    dashboard: "Tổng quan",
    loggedInAs: "Đăng nhập",
    group: "Nhóm",
    members: "Thành viên",
    logout: "Đăng xuất",

    phase2Done: "Phase 2 hoàn tất ✅ Nhóm và thành viên đã sẵn sàng",
    nextPhase4: "Tiếp theo: Phase 4 — Thêm chi tiêu",

    noMembers: "Chưa có thành viên",

    // ===== Matrix =====
    rawDebtsTitle: "Nợ thô (trước cấn trừ)",
    rawDebtsMatrix: "Ma trận nợ thô (Con nợ → Chủ nợ)",
    debtorCreditor: "Con nợ \\ Chủ nợ",

    // ===== Engine =====
    engineDemo: "Demo tính nợ (dữ liệu mẫu)",

    balanceTitle: "Số dư nợ ròng",
    balanceDesc: "Được nhận − Phải trả",

    settleTitle: "Kết quả cấn trừ",
    settleDesc: "Ai cần chuyển khoản cho ai",

    receive: "Được nhận",
    pay: "Phải trả",
    even: "Cân bằng",
    noDebts: "Không có khoản nợ nào",
  },
};

export function t(key) {
  return i18n[LANG][key] || key;
}

/**
 * Format tiền VNĐ – GIỮ NGUYÊN SỐ LẺ
 * Ví dụ:
 *  1000       → 1.000 ₫
 *  30.5       → 30,5 ₫
 *  12345.75   → 12.345,75 ₫
 */
export function formatVND(amount) {
  if (amount === null || amount === undefined) return "0 ₫";

  const n = Number(amount);
  if (!Number.isFinite(n)) return "0 ₫";

  return (
    n.toLocaleString("vi-VN", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }) + " ₫"
  );
}
