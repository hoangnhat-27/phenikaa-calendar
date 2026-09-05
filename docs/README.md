# 📅 Phenikaa Calendar

Lấy **lịch học** và **lịch thi** của bạn trên cổng sinh viên Phenikaa, rồi đưa vào
**Google Calendar / Lịch điện thoại**, hoặc xem **ngay cả khi không có mạng**.
Không cần cài phần mềm, dùng được trên **cả máy tính lẫn điện thoại**.

> 🔒 Công cụ chỉ đọc lịch của **chính bạn**, ngay trên phiên bạn đã tự đăng nhập.
> Không hỏi, không lưu, không gửi mật khẩu đi đâu cả.

---

## ✨ Làm được gì

- 📆 Xem thời khóa biểu theo tuần — đi tới/lui, nhảy tới ngày bất kỳ.
- 📝 Xem danh sách các **môn thi sắp tới**.
- ✅ Đưa toàn bộ lịch vào **Google Calendar** chỉ với vài chạm.
- ⬇️ Tải về để nạp vào **Lịch iPhone / Outlook**.
- 📴 Lưu lại để **xem offline** như một ứng dụng trên màn hình chính.

---

## 🚀 Cài đặt (chỉ làm 1 lần)

Mở trang: **https://hoangnhat-27.github.io/phenikaa-calendar/**

**Trên máy tính (Chrome / Edge / Cốc Cốc):**
1. Hiện thanh dấu trang: nhấn `Ctrl` + `Shift` + `B`.
2. **Kéo** nút *📅 Phenikaa Calendar* trên trang lên thanh dấu trang. Xong!

**Trên điện thoại (iPhone / Android):**
1. Bấm nút **📋 Sao chép mã** trên trang.
2. Lưu một trang bất kỳ vào Dấu trang (Bookmark).
3. Mở lại dấu trang đó → **Sửa** → xóa địa chỉ cũ, **dán mã vừa chép vào** → đặt tên
   “Phenikaa Calendar” → Lưu.

> 💡 Chỉ cài đúng **một lần**. Về sau công cụ có thêm tính năng mới, dấu trang **tự cập nhật** —
> bạn không phải cài hay chỉnh lại gì.

---

## 📖 Cách dùng

1. Đăng nhập **cổng sinh viên Phenikaa** như bình thường (đang ở trang nào trong cổng cũng được).
2. Bấm dấu trang **📅 Phenikaa Calendar** → bấm **Xem thời khóa biểu**.
3. Lịch cả kỳ hiện lên ngay. Tại đây bạn chọn một trong ba:

| Nút | Dùng để |
|---|---|
| **📥 Đưa vào Google Calendar** | Nhập thẳng lịch vào Google Calendar của bạn. Dùng được với **mọi email**, không cần đăng nhập gì thêm. |
| **⬇️ Tải .ics** | Lấy một file lịch để nạp vào **Lịch iPhone** hoặc **Outlook**. |
| **💾 Lưu offline** | Lưu lại để mở xem sau, **kể cả khi không có mạng**. |

**Xem offline như một app:** sau khi bấm *💾 Lưu offline*, mở lại trang lịch rồi chọn
**“Thêm vào màn hình chính”** trong menu trình duyệt. Từ đó mở nhanh như một ứng dụng.

---

## ❓ Câu hỏi thường gặp

**Có lộ mật khẩu hay tài khoản không?**
Không. Công cụ chỉ đọc lịch đang hiển thị trên phiên bạn *đã tự đăng nhập*; không lưu,
không gửi mật khẩu đi đâu.

**Xem được lịch của người khác không?**
Không. Chỉ lấy lịch của **chính tài khoản đang đăng nhập** trên máy bạn.

**Bấm nút mà không thấy gì?**
Kiểm tra xem đã đăng nhập cổng sinh viên chưa, rồi bấm lại. Nếu điện thoại chặn, mở lại
trang và bấm **Xem thời khóa biểu** thêm một lần.

**Môn đã thi xong có còn hiện trong “lịch thi” không?**
Không — mục lịch thi chỉ hiển thị các môn **chưa thi**.

---

*Công cụ không chính thức, không liên kết với Trường Đại học Phenikaa.*

<details>
<summary>🛠️ Dành cho người tự cài đặt / vận hành (không cần đọc nếu chỉ dùng)</summary>

<br>

**Chạy thử trên máy:**
```bash
cd docs
node serve.js      # rồi mở http://localhost:8080
```

**Đưa lên mạng (miễn phí, bằng GitHub Pages):**
1. Đẩy mã nguồn lên GitHub.
2. Vào **Settings → Pages → Source = “GitHub Actions”**.
3. Mỗi lần cập nhật và đẩy lên, trang tự động được đóng gói và xuất bản lại. Xong.

**Bật nút đồng bộ Google “một chạm” (không bắt buộc):**
Cách *Đưa vào Google Calendar* ở trên đã chạy cho mọi người mà không cần cấu hình gì.
Nếu muốn thêm nút đồng bộ tự động một chạm, cần đăng ký một ứng dụng miễn phí trên
[Google Cloud Console](https://console.cloud.google.com/) và điền mã ứng dụng vào phần
cấu hình. Với đa số người dùng thì **không cần** bước này.

</details>
