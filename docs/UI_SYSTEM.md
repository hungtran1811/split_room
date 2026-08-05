# Split Room — UI System (“Ledger Clear”)

Nguồn sự thật visual + UX sau redesign. Copy tiếng Việt; data/Firebase không đổi.

## Palette

| Token | Hex | Dùng |
|-------|-----|------|
| `--ink` | `#0B1220` | Chữ chính |
| `--ink-muted` | `#5A6A75` | Phụ |
| `--surface-0` | `#F3F7F8` | Nền app |
| `--surface-1` | `#FFFFFF` | Panel |
| `--surface-2` | `#E8F2F1` | Soft teal wash |
| `--accent` | `#0F766E` | Primary teal |
| `--accent-soft` | `#CCFBF1` | Soft accent |
| `--coral` / danger CTA | `#E11D48` | Nợ / CTA gấp |
| `--success` | `#059669` | Ổn / đã thu |
| `--warning` | `#D97706` | Chờ / lock soft |

Atmosphere: lưới chấm rất nhẹ + band teal→mint mép trên. Không purple glow.

## Typography

- Font: **Sora** 400–700
- Scale: xs 0.75 → 2xl 1.85rem (display hero)
- Số tiền: `font-variant-numeric: tabular-nums`, weight 700

## Spacing & shape

- Space: 4 / 8 / 12 / 16 / 20 / 24 / 32
- Radius: 12 / 16 / 20 (ít pill; chip/segment mới dùng radius-md)
- Touch min: 44px
- Content max: 800px

## Shell

```
[ Brand· ] [ ‹ Tháng M/YYYY › ] [ lock | bell | avatar ]
main (padded)
[ Tổng quan | Chi tiêu | Cấn trừ | Tiền nhà ]
```

- Admin: menu profile → “Quản trị nhóm” (owner)
- Soft-lock: chip “Đã chốt” + `LockBanner` trên form

## Components

| Component | Việc |
|-----------|------|
| `Button` | primary (teal) / ghost / danger (coral soft) / coral (urgent) |
| `BottomSheet` | sheet slide |
| `PageHeader` | title + subtitle + optional action |
| `ListRow` | title / subtitle / amount / actions |
| `LockBanner` | tháng đã chốt |
| `EmptyState` | title + text + action |
| `MetricTile` | số phụ |
| `SegmentedTabs` | underline/teal active |
| `Toast` | feedback |

## Per-page UX

| Page | Above fold | Primary action | Empty / Locked |
|------|------------|----------------|----------------|
| Login | Brand Split Room | Google | — |
| Dashboard | Hero còn nợ/ổn | Đi Cấn trừ hoặc Thêm chi | Rent hint; close secondary |
| Expenses | Filter + list | + Thêm (sheet quick→chi tiết) | CTA thêm; banner nếu lock |
| Payments | Tabs; Gợi ý default | Đủ / Một phần | Empty + sang Chi tiêu |
| Rent | Stepper 3 bước | Lưu bước / Lưu hết | Banner lock |
| Admin | Member cards | Promote/demote | Empty members |

## Motion

1. Sheet slide-up  
2. Hero amount fade-in  
3. Tab active underline  

## A11y checklist

- [ ] Contrast ink/surface ≥ AA  
- [ ] Focus ring teal soft  
- [ ] Period / nav / icon ≥ 44px  
- [ ] Dialog Escape + backdrop  
- [ ] Labels tiếng Việt trên control  
