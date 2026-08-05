# Split Room — UI System

Typography: **Exo 2**. Accent: **#2563EB**. Canvas `#F5F7FA`.

## Components

| Component | Dùng |
|-----------|------|
| `OverviewSection` | Card chuẩn title/subtitle/action trên Tổng quan |
| `MoneyRow` | Avatar + title + amount (+ bar % tùy chọn) |
| `ExpenseDaySection` / `ExpenseRow` | Timeline chi tiêu theo ngày |
| `formatViDate` / `formatViDateShort` | Ngày tiếng Việt |

## Tổng quan

1. KPI 4 ô  
2. Sticky “Phần của bạn”  
3. Grid: Ai→ai + Số dư (bar)  
4. Nợ tháng trước / Chi gần đây / Tiền nhà  

## Chi tiêu (timeline)

```
[ Toolbar: ngày | bỏ lọc | + Thêm ]
[ Sticky day header: Thứ …, d/m · N khoản · tổng ]
  row: note · người trả · chips nợ (≤3 +N) · số tiền
```

Form thêm/sửa: BottomSheet đủ field (giữ nguyên).

## Money color

- `.money-due` — cần trả  
- `.money-receive` — sẽ nhận  
