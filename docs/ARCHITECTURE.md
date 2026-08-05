# Split Room — Architecture (React)

Nguồn sự thật sau rebuild greenfield Vite + React 19 + TypeScript. Firebase Auth/Firestore và data `groups/P102` giữ nguyên.

## 1. Ai đăng nhập được

- Google Sign-In qua Firebase Auth.
- UX allowlist email (client) + membership thật trong `groups/P102/members/{uid}`.
- Role (`owner` | `admin` | `member`) **chỉ** lấy từ Firestore — không hard-elevate bằng UID.
- Tài khoản chưa có member doc → báo lỗi, không tự tạo quyền.

## 2. Bốn màn chính (+ Admin)

| Route | Việc làm |
| ----- | -------- |
| `#/dashboard` | Số dư cá nhân, tóm tắt nợ/thuê, CTA sang Chi / Cấn trừ |
| `#/expenses` | CRUD chi tiêu, quick entry, lọc theo ngày/tháng |
| `#/payments` | Gợi ý cấn trừ, lịch sử thanh toán, ma trận nợ |
| `#/rent` | Tiền nhà tháng: items, shares, paid, progress |
| `#/admin` | Danh sách thành viên, promote/demote admin phụ (owner) |

**Không có** `#/reports`, CSV export, sparkline/chart.

Shell: header + period chip + chuông thông báo + bottom nav 4 tab. Admin nằm trong menu profile.

## 3. Tiền chảy thế nào

```text
Expense (payer + debts)
  → gross matrix [debtor][creditor]
  → net balances (+ nhận / − trả)
  → payments điều chỉnh balance
  → settlement plan (ai chuyển ai bao nhiêu)
  → ghi Payment → balance tiến về 0
```

- Tiền lưu **integer VND**; công thức thuần trong `src/domain`.
- Rent riêng: `rents/{period}` với shares/paid; không trộn vào matrix chi tiêu.

## 4. Chốt tháng khóa gì

- Doc `periods/{YYYY-MM}` với `lockedSoft: true` + snapshot balances/settlement/rent.
- UI disable form khi locked; Firestore rules cũng chặn write.
- Callable `manualMonthClose` nếu có; fallback client write + fan-out `notifications` / `mailOutbox`.

## 5. Cây thư mục React

```text
src/
  app/           # providers, router, bootstrap
  pages/         # Dashboard, Expenses, Payments, Rent, Admin, Login
  features/      # form/logic UI theo domain
  shared/ui/     # Button, Sheet, Toast, MetricTile, …
  shared/lib/    # format tiền, period helpers
  domain/        # pure TS: whole-vnd, matrix, rent, month-close
  services/      # Firebase only
  hooks/         # useAuth, useLiveMonth, usePeriod, …
  styles/        # tokens + shell (Exo 2, blue-indigo)
  config/        # GROUP_ID, roster, firebase env
```

Router: **HashRouter**. State: React context (`user`, `groupId`, `memberProfile`, `members`, `selectedPeriod`). Realtime: `useLiveMonth(period)`.
