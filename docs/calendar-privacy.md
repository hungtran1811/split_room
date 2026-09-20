# Lịch cá nhân và lịch chia sẻ

## Quyền sử dụng

| Lịch | Người xem và thêm sự kiện | Người sửa/xóa sự kiện |
| --- | --- | --- |
| Cả nhóm | Thành viên hiện tại của nhóm | Người tạo sự kiện |
| Cá nhân | Chủ lịch | Người tạo sự kiện |
| Chia sẻ riêng | Người có tên trong lịch và vẫn thuộc nhóm | Người tạo sự kiện |

Chủ lịch chia sẻ đổi tên và thêm/bỏ người xem. Quyền này không cho phép sửa hoặc xóa sự kiện của người khác. Thay đổi người xem áp dụng cho toàn bộ lịch sử: người mới được xem các sự kiện cũ; người bị bỏ mất quyền với cả sự kiện do mình tạo. Các sự kiện được giữ nguyên. Owner/admin nhóm không có quyền đặc biệt đối với lịch riêng.

Mỗi người có một lịch Cá nhân. Lịch chung dùng danh sách thành viên hiện tại, không cố định bốn tài khoản. Khi xem tổng hợp, sự kiện mới mặc định thuộc Cá nhân; khi xem riêng một lịch, biểu mẫu mặc định chọn lịch đó. Biểu mẫu luôn ghi người được xem.

Chuyển sự kiện chỉ dành cho tác giả, và được thực hiện nguyên tử: thành công cả thêm ở đích và xóa ở nguồn, hoặc không thay đổi gì. Lặp/sao chép tuần giữ lịch chứa sự kiện. Xóa cả lịch và chuyển quyền chủ lịch chưa được hỗ trợ.

## Lưu trữ và truy cập

- `groups/{groupId}/calendarEntries/{entryId}` tiếp tục là lịch Cả nhóm. Dữ liệu cũ không cần migration.
- `groups/{groupId}/calendars/{calendarId}` lưu tên, loại `private/shared`, chủ lịch, danh sách người xem và timestamps.
- `groups/{groupId}/calendars/{calendarId}/entries/{entryId}` lưu sự kiện kế thừa quyền của lịch chứa nó.
- Lịch Cá nhân có ID ổn định `private_{uid}` và không thể đổi chủ hoặc mở rộng người xem.
- Truy vấn danh sách lịch dùng `memberUids array-contains uid`. Mọi truy cập còn phải qua kiểm tra membership tại `groups/{groupId}/members/{uid}` trong Firestore Rules.
- Khóa hiển thị sự kiện chứa cả định danh lịch và ID tài liệu. Không sao chép dữ liệu riêng sang collection lịch chung để lọc ở frontend.

Ứng dụng chỉ hiển thị lịch sau xác nhận từ máy chủ, không dùng snapshot cache để xác lập quyền. Đổi tài khoản, mất quyền hoặc mất xác nhận kết nối sẽ xóa trạng thái lịch đang hiển thị và đóng chi tiết. Firebase persistence của ứng dụng vẫn giữ nguyên; thu hồi quyền không xóa được bản dữ liệu mà người dùng đã nhận trước đó. Bản đầu không hỗ trợ xem lịch riêng offline.

Ô trống có nghĩa là **Không có lịch hiển thị**, không khẳng định người khác rảnh. Số lượng sự kiện và nhãn trạng thái chỉ tính trên dữ liệu được phép xem.

## Kiểm tra thủ công với dữ liệu giả lập

1. Chuẩn bị bốn thành viên thử nghiệm A, B, C, D trong cùng nhóm. Mở hai phiên trình duyệt riêng cho A và B.
2. A tạo sự kiện trong Cả nhóm: cả bốn xem được, chỉ A sửa/xóa được.
3. A tạo sự kiện trong Cá nhân: B/C/D không thấy lịch, nội dung hoặc khung bận; đọc trực tiếp ID cũng bị từ chối.
4. A tạo lịch A–B. B thêm sự kiện; A xem được nhưng không sửa/xóa được sự kiện của B.
5. A thêm C: xác nhận thông báo toàn bộ lịch sử; C xem được lịch cũ. A bỏ B khi B đang mở chi tiết: chi tiết đóng và lịch biến mất. Sự kiện của B vẫn tồn tại cho A/C.
6. A chuyển sự kiện của mình từ Cả nhóm sang Cá nhân: sự kiện biến mất ở lịch chung và chỉ xuất hiện một lần ở đích. Giả lập lỗi quyền khi chuyển để kiểm tra nguồn còn nguyên.
7. Sao chép tuần và tạo lịch lặp, gồm ca qua đêm: lịch đích giữ nguyên và sao chép lại không tạo trùng.
8. Đăng xuất/đăng nhập tài khoản khác trên cùng trình duyệt, thử khi offline và sau kết nối lại: dữ liệu cũ không lóe lên trong giao diện.
9. Kiểm tra bộ chọn lịch, người xem và chi tiết trên điện thoại và máy tính; ô trống không gắn nhãn rảnh.

## Triển khai

Chạy `npm ci`, `npm test`, `npm run test:rules`, `npm run typecheck`, `npm run build`. Rules và indexes mới cần được triển khai trước giao diện production; việc triển khai Rules cần phê duyệt rõ ràng theo AGENTS.md. Chỉ triển khai phần nguồn sau kiểm tra, không sửa environment Netlify hoặc dữ liệu production.

Nếu quay lại phiên bản giao diện cũ, dữ liệu Cá nhân/Chia sẻ riêng vẫn ở collection riêng và không trở thành lịch chung. Giữ Rules bảo vệ các collection mới.
