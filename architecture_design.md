# Kế Hoạch Thiết Kế Chi Tiết (Detailed Architecture Plan)

Để tránh mất context, tôi sẽ tổng hợp toàn bộ thiết kế hệ thống, cơ sở dữ liệu, API, sự kiện Real-time và cấu trúc thư mục vào tài liệu này. Chúng ta sẽ bám sát vào tài liệu này trong quá trình phát triển.

---

## 1. Cơ Sở Dữ Liệu (SQLite: `inventory.db`)

Chúng ta sẽ tạo một bảng duy nhất là `products` với các trường tương ứng JSON schema đã chốt.

**Bảng: `products`**
- `id` (TEXT, PRIMARY KEY): Định danh duy nhất (VD: `SDR-MEN-LS-RG-0001-L`)
- `sku` (TEXT): Dùng để in QR (VD: `0001SSRG-M`)
- `location` (TEXT): Vị trí (VD: `A1`)
- `shop` (TEXT): `SDR` hoặc `BATT-BFG`
- `numberSku` (TEXT): `0001`
- `productType` (TEXT): `SSRG`, `LSRG`, `WSRG`, `WLRG`, `FSHO`, `GSHO`, `WRES`, `WWRE`
- `size` (TEXT): `2XS` đến `5XL`
- `imageUrl` (TEXT): Link ảnh chụp (Null nếu shop SDR)
- `status` (TEXT): `IN_STOCK` hoặc `EXPORTED`
- `createdAt` (DATETIME): Thời gian tạo
- `updatedAt` (DATETIME): Thời gian cập nhật

---

## 2. Thiết Kế Backend (Express + Socket.io)

### Các API Endpoints (RESTful)
| Method | Endpoint | Payload / Query | Chức năng |
|--------|----------|-----------------|-----------|
| GET | `/api/products` | `?status=IN_STOCK` | Lấy danh sách sản phẩm đang tồn kho (để hiển thị trên trang chủ) |
| POST | `/api/products` | JSON của Product | Tạo sản phẩm mới (Nhập kho). Nếu thành công, kích hoạt sự kiện Socket `product_added` |
| POST | `/api/products/export` | `{ sku: string }` | Quét mã xuất kho. Tìm sản phẩm theo `sku` và cập nhật `status = EXPORTED`. Kích hoạt sự kiện Socket `product_exported` |

### Các Sự Kiện Socket (Real-time)
| Tên Sự Kiện | Gửi từ | Dữ liệu mang theo | Tác dụng |
|-------------|--------|--------------------|----------|
| `product_added` | Server -> Tất cả Client | Thông tin Product vừa tạo | Client sẽ tự động chèn sản phẩm này vào danh sách hiển thị vị trí trên màn hình. |
| `product_exported`| Server -> Tất cả Client | ID hoặc SKU của Product | Client tự động xóa hoặc làm mờ sản phẩm đó khỏi danh sách hiển thị trên màn hình. |

---

## 3. Thiết Kế Frontend (React + Vite + TailwindCSS)

### Cấu trúc Component
```text
frontend/src/
├── components/
│   ├── layout/
│   │   ├── Sidebar.jsx       // Menu điều hướng
│   │   └── Header.jsx        // Hiển thị trạng thái kết nối server
│   ├── inventory/
│   │   ├── ProductCard.jsx   // Hiển thị 1 sản phẩm (Có ảnh hoặc không)
│   │   └── QRCodeLabel.jsx   // Component để ẩn/hiện và gọi lệnh in (Print)
│   └── scanner/
│       └── BarcodeListener.jsx // Lắng nghe sự kiện gõ phím từ Máy quét mã vạch
├── pages/
│   ├── Dashboard.jsx         // TRANG CHỦ: Hiển thị sơ đồ/danh sách vị trí sản phẩm realtime.
│   └── ImportProduct.jsx     // TRANG NHẬP KHO: Form điền thông tin và nút In Label.
├── hooks/
│   └── useSocket.js          // Hook quản lý kết nối Socket.io
└── utils/
    └── constants.js          // Chứa các danh sách: SHOP, SEX, SLEEVE, PRODUCT_TYPE, SIZE
```

### Logic Xử Lý Máy Quét Mã Vạch (Barcode Scanner)
Máy quét mã vạch cắm USB hoạt động như một bàn phím tốc độ cao, gõ từng ký tự và kết thúc bằng phím `Enter`.
- **Giải pháp**: Tạo một component `BarcodeListener.jsx` chạy ngầm. 
- Component này lắng nghe sự kiện `keydown`. Nếu nhận được một chuỗi ký tự kết thúc bằng `Enter` trong thời gian cực ngắn (VD: dưới 100ms), nó sẽ tự động gửi chuỗi đó lên API `/api/products/export`.

---

## 4. Quy Trình Luồng Hoạt Động Cụ Thể

**A. Quy trình Nhập Kho (Nhân viên A trên Máy tính 1):**
1. Vào trang Nhập Kho (`/import`).
2. Chọn các thuộc tính (Shop, Type, Size...).
3. Nếu chọn `BATT-BFG`, form sẽ yêu cầu up ảnh + Vị trí. Nếu `SDR`, bỏ qua.
4. Bấm "Lưu". FE gọi API `POST /api/products`.
5. Sau khi lưu thành công, FE hiện Popup chứa mã QR để in Label. Đồng thời, Server phát Broadcast `product_added`.

**B. Quy trình Theo Dõi (Nhân viên B trên Laptop 2):**
1. Đang mở trang chủ (`/`).
2. Tự động nhận được sự kiện `product_added` qua Socket. Danh sách hàng tồn kho tự động được cập nhật xuất hiện sản phẩm mới của nhân viên A vừa nhập.

**C. Quy trình Xuất Kho:**
1. Nhân viên cầm máy quét mã vạch, quét vào Label.
2. `BarcodeListener` bắt được mã SKU.
3. FE gọi API `POST /api/products/export` với mã SKU đó.
4. Server cập nhật `EXPORTED` -> Server phát Broadcast `product_exported`.
5. Tất cả màn hình của Nhân viên A và B tự động xóa/cập nhật lại sản phẩm đó thành đã xuất.

---

## 5. Các Giai Đoạn Phát Triển (Phases)

- `[ ]` **Phase 1: Project Setup**
  - Tạo cấu trúc thư mục `backend` và `frontend`.
  - Cài đặt các thư viện cần thiết cho Backend (Express, Socket.io, SQLite).
  - Khởi tạo Frontend bằng React/Vite.

- `[ ]` **Phase 2: Backend Development**
  - Thiết lập máy chủ Express & Socket.io.
  - Khởi tạo Database SQLite (`inventory.db`) theo cấu trúc JSON đã chốt.
  - Viết logic xử lý (API & Realtime event) cho Nhập kho và Xuất kho.

- `[ ]` **Phase 3: Frontend Development**
  - Thiết lập cấu trúc giao diện và Router (Trang chủ, Nhập kho).
  - Tích hợp Socket.io-client để nhận dữ liệu realtime.
  - Phát triển chức năng **Nhập kho** và sinh Label QR.
  - Phát triển chức năng **Xuất kho** (Bắt sự kiện gõ phím từ Máy quét mã vạch).
  - Xây dựng **Trang chủ** hiển thị vị trí các sản phẩm.

- `[ ]` **Phase 4: Testing & Verification**
  - Chạy thử ứng dụng trên môi trường local.
  - Đảm bảo tính năng realtime hoạt động mượt mà.
