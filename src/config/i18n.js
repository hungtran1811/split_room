export const LANG = "vi";

export const i18n = {
  vi: {
    dashboard: "Tổng quan",
    loggedInAs: "Đăng nhập",
    group: "Nhóm",
    members: "Thành viên",
    logout: "Đăng xuất",
    phase2Done: "Phase 2 hoàn tất. Nhóm và thành viên đã sẵn sàng.",
    nextPhase4: "Tiếp theo: Phase 4 - Thêm chi tiêu",
    noMembers: "Chưa có thành viên",
    rawDebtsTitle: "Nợ thô (trước cân trừ)",
    rawDebtsMatrix: "Ma trận nợ thô (Con nợ -> Chủ nợ)",
    debtorCreditor: "Con nợ \\ Chủ nợ",
    engineDemo: "Demo tính nợ (dữ liệu mẫu)",
    balanceTitle: "Số dư nợ ròng",
    balanceDesc: "Được nhận - Phải trả",
    settleTitle: "Kết quả cân trừ",
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

export function formatVND(amount) {
  if (amount === null || amount === undefined) return "0 đ";

  const number = Number(amount);
  if (!Number.isFinite(number)) return "0 đ";

  return (
    number.toLocaleString("vi-VN", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }) + " đ"
  );
}
