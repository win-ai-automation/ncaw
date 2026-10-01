# Netfintax Content Automation — starter kit

MVP này nhận URL hoặc nội dung thô, chuẩn hoá đầu vào, gọi OpenAI để tạo bản nháp có cấu trúc và **dừng ở trạng thái chờ duyệt**. Nó không tự đăng bài. Đây là ranh giới an toàn cần giữ cho đến khi Slack/GHL đã được kiểm thử bằng tài khoản sandbox.

## Website MVP cho nhân viên

Giao diện review prototype dùng Next.js App Router và hiện dùng dữ liệu mẫu để kiểm chứng quy trình thao tác. App shell, logo, font và hệ màu được đồng bộ với dashboard EDUVO tại `D:\eduvo`.

```powershell
npm install
npm run dev
```

Mở <http://localhost:3000>. Bản production được tạo bằng `npm run build` và chạy bằng `npm start`.

Prototype đã có: hàng chờ, tìm kiếm/lọc, gửi URL mới, so sánh nguồn với bản AI, chỉnh sửa draft, cảnh báo rủi ro và duyệt/yêu cầu sửa. Dữ liệu hiện chỉ nằm trong bộ nhớ trình duyệt; bước tiếp theo là nối API/database và xác thực người dùng.

## Supabase authentication

The app includes email/password sign-up, sign-in, forgot-password, reset-password, session refresh, protected dashboard routes, and sign-out.

1. Fill in `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` in `.env.local`.
2. Run `supabase/migrations/202609300001_content_desk.sql` in the Supabase SQL Editor or deploy it with the Supabase CLI.
3. In Supabase **Authentication → URL Configuration**, set the local Site URL to `http://localhost:3000` and add `http://localhost:3000/auth/callback` to Redirect URLs. Add the equivalent production URL before deployment.
4. Keep email confirmation enabled for production. The app redirects confirmation and recovery links through `/auth/callback`.

Auth routes: `/auth/sign-in`, `/auth/sign-up`, `/auth/forgot-password`, and `/auth/reset-password`.

## Khởi động

1. Sao chép `.env.example` thành `.env` và thay toàn bộ `CHANGE_ME`.
2. Chạy `docker compose config` để kiểm tra cấu hình.
3. Chạy `docker compose up -d`.
4. Mở <http://localhost:5678>, tạo tài khoản owner đầu tiên.
5. Import `workflows/01-content-intake.json`, sau đó Activate workflow.

PowerShell:

```powershell
Copy-Item .env.example .env
docker compose config
docker compose up -d
```

## Gửi bài thử

Webhook yêu cầu header `x-content-secret`. Có thể gửi `content` trực tiếp (ổn định nhất cho MVP) hoặc chỉ gửi `url`; URL công khai sẽ được đọc qua Jina Reader.

```powershell
$headers = @{ 'x-content-secret' = 'SECRET_TRONG_ENV' }
$body = @{
  url = 'https://example.com/article'
  content = 'Nội dung nguồn cần chuyển đổi'
  notes = 'Ưu tiên LinkedIn; không nêu tên khách hàng'
} | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri 'http://localhost:5678/webhook/content-submit' -Headers $headers -ContentType 'application/json' -Body $body
```

Nếu workflow chưa Activate, dùng URL test hiển thị trong editor (`/webhook-test/content-submit`).

## Những gì đã sửa so với tài liệu gốc

- JSON trong tài liệu có comment `//`, nên không phải JSON import hợp lệ.
- Không dùng tên Apify actor giả định; MVP nhận content hoặc dùng generic reader cho trang công khai.
- AI chỉ tạo draft JSON. Không coi AI là công cụ xác minh thuế; mọi số liệu phải có nguồn và người chuyên môn duyệt.
- Không publish trực tiếp từ callback Slack. Approval cần lưu record, kiểm tra reviewer, chống replay và lấy lại đúng version nội dung.
- Không đưa Google Drive share-link vào Slack trước khi node upload thực sự trả về link.
- GHL sẽ được tích hợp sau khi xác minh endpoint/scopes hiện hành và test location.

## Lộ trình production

1. Chạy 10 mẫu thật chỉ tới bước draft, chốt prompt và schema.
2. Thêm Postgres table cho content/version/audit log.
3. Thêm review UI hoặc Slack app có chữ ký request; chỉ reviewer trong allowlist được duyệt.
4. Kết nối Drive/S3 bằng credentials của n8n, không dùng public links.
5. Kết nối GHL sandbox, idempotency key và lịch đăng theo từng platform.
6. Đặt n8n sau HTTPS reverse proxy; không public cổng 5678 trực tiếp.

## Lưu ý vận hành

- Các mốc thuế ghi trong tài liệu gốc là số liệu năm 2024 và không được hard-code làm “fact check” cho năm hiện tại.
- Nội dung từ mạng xã hội có thể bị giới hạn bởi đăng nhập, robots, điều khoản nền tảng và quyền tác giả.
- Không gửi PII/tài liệu khách hàng vào model trước khi có bước redaction và chính sách dữ liệu được phê duyệt.
- `.env` đã được git-ignore. Không chụp màn hình hay gửi file này qua chat.

