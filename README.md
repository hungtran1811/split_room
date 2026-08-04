# Split Room (P102)

Ứng dụng web chia bill phòng trọ cho nhóm P102: tổng quan, chi tiêu, cấn trừ, tiền nhà, báo cáo và quản trị.

**Stack:** Vite + vanilla JavaScript + Firebase Auth + Firestore + Bootstrap 5 + PWA.

## Tính năng

- Đăng nhập Google (allowlist email)
- Dashboard: số dư, gợi ý thao tác, biểu đồ chi tiêu theo ngày
- Chi tiêu: ghi chi, lọc theo ngày, deep link `#/expenses?date=YYYY-MM-DD`
- Cấn trừ: gợi ý thanh toán, lịch sử, ma trận nợ; copy nhắc Zalo
- Tiền nhà: nhập khoản, chia phần, theo dõi đã thu
- Báo cáo: tổng hợp tháng, chốt tháng, xuất CSV
- Quản trị (admin chính): thành viên, admin phụ

## Yêu cầu

- Node.js 20+
- Firebase project (Auth Google + Firestore)
- JDK (chỉ khi chạy `npm run test:rules` local)

## Cài đặt local

```bash
npm install
cp .env.example .env.local
# Điền biến VITE_FB_* từ Firebase Console → Project settings
npm run dev
```

Mở `http://localhost:5173`. Dev mode tự tắt Service Worker cache để UI cập nhật ngay.

## Scripts

| Lệnh | Mô tả |
|------|--------|
| `npm run dev` | Dev server Vite |
| `npm run build` | Build production → `dist/` |
| `npm run preview` | Xem bản build local |
| `npm test` | Unit tests (Vitest) |
| `npm run test:rules` | Firestore rules (emulator) |
| `npm run backfill:rents -- P102` | Backfill collection `rents` |
| `npm run verify:data -- P102` | Kiểm tra dữ liệu rent sau migration |

## Deploy (Netlify)

Repo đã có `netlify.toml`:

- Build: `npm run build`
- Publish: `dist/`
- SPA redirect: `/* → /index.html`

### Checklist trước deploy

1. `npm run build`
2. `npm test`
3. `npm run test:rules`
4. Deploy Firestore rules + indexes
5. (Nếu cần) `npm run backfill:rents -- P102` và `npm run verify:data -- P102`
6. Deploy frontend + smoke test

Chi tiết: [docs/deploy-checklist.md](docs/deploy-checklist.md)

### Biến môi trường trên Netlify

Thêm tất cả biến `VITE_FB_*` như trong `.env.example`.

### Firebase

- Rules: `firestore.rules`
- Indexes: `firestore.indexes.json`
- Deploy rules/indexes qua Firebase CLI hoặc Console trước khi lên production.

Thêm domain Netlify vào **Firebase Auth → Authorized domains**.

## Cấu trúc thư mục

```
src/
  app.js              # Router, auth boot
  services/           # Firestore, auth, live-data-hub
  domain/             # Tính toán nợ, rent, báo cáo
  ui/pages/           # Trang theo route hash
  ui/views/           # HTML render tách khỏi controller
  styles/             # CSS theo module
docs/
  data-model.md       # Schema Firestore
  deploy-checklist.md
  upgrade-roadmap.md
public/
  sw.js               # Service Worker (PWA)
  manifest.webmanifest
```

## Tài liệu thêm

- [Data model](docs/data-model.md)
- [Upgrade roadmap](docs/upgrade-roadmap.md)

## License

Private — nhóm P102.
