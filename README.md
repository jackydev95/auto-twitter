# X Auto-Follow Studio (`auto-twitter`)

Bộ công cụ **Next.js + pnpm + Vercel Redis (`@upstash/redis`)** giúp xác thực và lấy Token X (Twitter) OAuth 2.0, quản lý danh sách Users & Tokens trên trang Adminify Dashboard, và chạy Cron Jobs tự động đi Follow Users khác trên X.

## 🌐 Live Production Domains (Vercel)

- **Trang User Portal (Lấy Token & Cấu hình Cron)**: https://auto-twitter.vercel.app
- **Trang Admin Dashboard (Quản lý Users & Tokens)**: https://auto-twitter.vercel.app/admin
- **OAuth 2.0 Callback URI (Dùng trong X Developer Portal)**: `https://auto-twitter.vercel.app/api/auth/twitter/callback`
- **Cron Job API Endpoint**: `https://auto-twitter.vercel.app/api/cron/auto-follow`

---

## ✨ Tính năng chính

1. **Xác thực & Lấy Token X (Twitter) OAuth 2.0 PKCE** (`/`)
   - Lấy `access_token` và `refresh_token` với các quyền: `tweet.read`, `users.read`, `follows.read`, `follows.write`, `offline.access`.
   - Hỗ trợ dán trực tiếp Token có sẵn hoặc tạo **Sandbox Token** 1-click để test nhanh.
2. **Trang Adminify Quản lý Users & Tokens** (`/admin`)
   - Quản lý tập trung toàn bộ Users, `Access Token (AT)`, `Refresh Token (RT)`, thời hạn token và trạng thái bật/tắt Cron của từng User.
   - Cho phép **Refresh Token**, **Chạy Follow Ngay** cho từng User, hoặc thêm/sửa/xóa User & Token.
3. **Cơ sở dữ liệu Vercel Redis (`@upstash/redis`)**
   - Lưu trữ toàn bộ Users, Tokens, Follow Queue, Logs (`auto_twitter:db:v1`) và Distributed Cron Lock (`auto_twitter:cron_lock`) trên Vercel Redis.
4. **Cron Jobs Tự động đi Follow Users khác trên X**
   - Tự động kiểm tra hạn token và gọi `refresh_token` trước mỗi chu kỳ Cron.
   - Giới hạn số lượng follow mỗi lần chạy (`maxFollowsPerRun`), giới hạn an toàn mỗi ngày (`dailyFollowLimit`) và độ trễ ngẫu nhiên (jitter delay).

---

## 🚀 Cài đặt & Chạy Local

Chạy nhanh chỉ với 1 lệnh qua `start.sh` (tự động kiểm tra `pnpm`, cài đặt packages, khởi chạy server kèm tiến trình ngầm gọi API Auto-Follow):

```bash
chmod +x start.sh
./start.sh
```

Các chế độ hỗ trợ trong `start.sh`:
- `./start.sh` (hoặc `./start.sh dev`): Chạy môi trường Development + Auto-Follow Worker ngầm.
- `./start.sh prod`: Build và chạy bản Production (`pnpm build && pnpm start`).
- `./start.sh cron`: Gọi trực tiếp API `POST /api/cron/auto-follow` ngay lập tức.

Hoặc chạy thủ công bằng `pnpm`:

```bash
pnpm install
pnpm dev
```

Mở trình duyệt tại:
- User Portal: `http://localhost:8000`
- Admin Dashboard: `http://localhost:8000/admin`
