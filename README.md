# Kim Flora · Floral Design & Creative Lab

Bản hiện tại cung cấp đăng nhập bằng mật khẩu riêng, đổi mật khẩu và đăng xuất. Logo chữ KF được thiết kế cho trang này. Khi đăng nhập lần đầu, màn hình yêu cầu chủ sở hữu đặt mật khẩu mới. Đổi mật khẩu sẽ kết thúc các phiên đã mở trên những thiết bị khác.

## Kiến trúc hiện tại

Trình duyệt tải giao diện từ `public/` và gọi API cùng nguồn tại `/api/auth`. Vercel chạy API Node.js. Supabase giữ bản băm mật khẩu và phiên bản đăng nhập trong bảng riêng của Creative Lab. Bảng chỉ cấp quyền đọc và cập nhật cho yêu cầu có khóa máy chủ đúng. Mật khẩu dùng scrypt với salt ngẫu nhiên. Phiên dùng cookie HttpOnly, Secure và SameSite=Strict trong tám giờ. API kiểm tra phiên bản phiên qua cơ sở dữ liệu và cập nhật mật khẩu có điều kiện để tránh hai lần đổi ghi đè nhau.

## Cấu hình triển khai

- Kết nối Vercel với nhánh `main` của repo này. Đồng bộ sơ đồ cơ sở dữ liệu bằng `db/001-auth.sql`.
- Đặt các biến sản xuất `LAB_DB_URL`, `LAB_DB_KEY` (khóa publishable) và `LAB_GATEWAY` (khóa ngẫu nhiên riêng cho máy chủ).
- Tạo bản ghi duy nhất có `id=1`. Lưu mã SHA-256 dạng hex của `LAB_GATEWAY` vào `gateway_digest`. Lưu mật khẩu khởi tạo dưới dạng `saltHex.hashHex` với salt ngẫu nhiên 24 byte được truyền vào scrypt dưới dạng chuỗi hex, đầu ra 64 byte, N=131072, r=8, p=1. Giữ `must_rotate=true` cho lần bàn giao đầu tiên.
- Khi đổi mật khẩu trong giao diện, cơ sở dữ liệu lưu thông tin mới dùng chung trên máy tính và điện thoại.
- Chủ tài khoản có thể phục hồi quyền truy cập qua quản trị Supabase nếu quên mật khẩu. Cập nhật bản băm, tăng `version` và đặt `must_rotate=true` để mật khẩu phục hồi chỉ dùng cho lần bàn giao mới.

## Thiết kế nền tảng cho năm mô-đun

Giai đoạn tiếp theo mở rộng từ một tài khoản chủ sở hữu sang quản lý danh tính và phân quyền theo vai trò. Dashboard dùng sidebar trên máy tính và điều hướng gọn trên điện thoại. Mỗi mô-đun có khu vực thao tác riêng, dùng chung thư viện ảnh và dự án. Mọi truy cập dữ liệu nội bộ phải được kiểm tra ở máy chủ.

| Mô-đun | Luồng làm việc | Dữ liệu dự kiến |
| --- | --- | --- |
| Floral Color Studio | Nhập hoặc lấy màu từ ảnh → phân tích → phối và điều chỉnh tỷ lệ → mô phỏng → lưu và xuất | Màu, hồ sơ màu, bảng màu, mục màu có tỷ lệ và vai trò |
| Floral Composition Analyzer | Chọn ảnh → đánh dấu hình bao, điểm nhấn và dòng chảy → phân tích → đối chiếu phương án | Ảnh, bản phân tích, lớp đánh dấu, phiên bản |
| Floral Recipe Builder | Chọn vật liệu → ghi định lượng và hao hụt → tính giá thành → lưu phiên bản | Công thức, dòng công thức, đơn vị, giá tại thời điểm tính |
| Flower Inventory | Khai báo nguyên liệu → nhập, xuất và điều chỉnh → theo dõi tồn, chi phí và hao hụt | Nguyên liệu, lô hàng, giao dịch kho |
| Floral Design Moodboard | Tạo dự án → thu thập ảnh, bảng màu, chất liệu → xem phương án → xuất moodboard | Dự án, bảng ý tưởng, mục ảnh và liên kết |

Mô hình dữ liệu dùng bảng dự án và thư viện ảnh chung. Moodboard và Recipe Builder tham chiếu bảng màu. Dòng công thức tham chiếu nguyên liệu và giữ giá lịch sử. Composition Analyzer có thể lấy ảnh từ công thức hoặc thư viện qua ID ảnh. Nhật ký lưu tác nhân, thời gian và phiên bản khi sửa dữ liệu. Triển khai nền tảng quản trị trước, rồi lần lượt xây năm mô-đun theo thứ tự trong bảng, kiểm thử lưu và truy xuất sau mỗi mô-đun.
