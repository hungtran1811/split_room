# Split Room (P102)

Ứng dụng web chia bill phòng trọ cho nhóm P102.

**Stack:** Vite + React 19 + TypeScript + Firebase Auth + Firestore + PWA.  
**UI:** Exo 2 + trust blue — [docs/UI_SYSTEM.md](docs/UI_SYSTEM.md)  
**Production:** [splitfam.netlify.app](https://splitfam.netlify.app)

Kiến trúc ngắn: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)

## Tính năng

- Đăng nhập Google (allowlist UX + membership Firestore)
- Dashboard: số dư cá nhân, tóm tắt nợ/thuê, CTA thao tác
- Chi tiêu: CRUD, quick entry, lọc theo ngày/tháng
- Cấn trừ: gợi ý thanh toán, lịch sử, ma trận nợ
- Tiền nhà: nhập khoản, chia phần, theo dõi đã thu
- Chốt tháng + chuông thông báo in-app (email qua Functions khi đã deploy)
- Quản trị (owner): thành viên, promote/demote admin phụ

**Không còn:** màn Báo cáo, xuất CSV, sparkline/biểu đồ.

## Yêu cầu

- Node.js 20+
- Firebase project (Auth Google + Firestore)
- JDK (chỉ khi chạy `npm run test:rules` local)

## Cài đặt local

```bash
npm ci
cp .env.example .env.local
# Điền biến VITE_FB_* từ Firebase Console → Project settings
npm run dev
```

Mở `http://localhost:5173` (HashRouter: `#/dashboard`, …).

## Scripts

| Lệnh | Mô tả |
|------|--------|
| `npm run dev` | Dev server Vite |
| `npm run build` | Build production → `dist/` |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run preview` | Xem bản build local |
| `npm test` | Unit tests (Vitest) |
| `npm run test:rules` | Firestore rules (emulator) |
| `npm run backfill:rents -- P102` | Backfill collection `rents` |
| `npm run verify:data -- P102` | Kiểm tra dữ liệu rent |

## Deploy (Netlify)

- Build: `npm run build`
- Publish: `dist/`
- SPA redirect: `/* → /index.html`

Biến môi trường: tất cả `VITE_FB_*` như `.env.example`.  
Thêm domain Netlify vào **Firebase Auth → Authorized domains**.

Firestore/Functions deploy riêng — không tự deploy từ PR frontend.

## Cấu trúc

```
src/
  app/           # providers, router, shell
  pages/         # Dashboard, Expenses, Payments, Rent, Admin, Login
  features/      # helpers UI theo domain
  shared/ui/     # Button, Sheet, Toast, …
  domain/        # pure TS (tiền, settlement, rent)
  services/      # Firebase
  hooks/
  styles/
  config/
```

## Bảo mật

- Role chỉ từ `groups/{groupId}/members/{uid}`
- Không hard-elevate owner bằng UID
- Không commit `.env` / secrets
- Firestore rules là nguồn sự thật truy cập dữ liệu
