# Hướng dẫn Hệ thống Thiết kế & Phong cách Giao diện (Design System & Styling)

Tài liệu này tổng hợp toàn bộ các token màu sắc, quy chuẩn bố cục, các lớp tiện ích (utility classes) và phong cách thiết kế đặc thù đang được áp dụng trong hệ thống quản lý kho **INV SYS**.

Hệ thống được phát triển theo phong cách **Glassmorphism Tối giản & Hiện đại (Premium Dark UI)** với các hiệu ứng kính mờ, chuyển sắc tuyến tính (gradients) và các chuyển động micro-interaction mượt mà.

---

## 1. Token Thiết kế & Hệ Màu sắc (Design Tokens)

Các biến CSS được định nghĩa tập trung tại `:root` trong tệp [index.css](file:///e:/FINAL/TOOL_INVENTORY/frontend/src/index.css):

| Biến CSS | Giá trị thực tế | Mô tả mục đích sử dụng |
| :--- | :--- | :--- |
| `--bg-primary` | `#0f172a` | Nền chính của toàn bộ trang web (Dark Slate Blue). |
| `--bg-secondary`| `#1e293b` | Nền thứ cấp cho các phần tử độc lập hoặc ô tùy chọn. |
| `--text-primary` | `#f8fafc` | Màu chữ chính (trắng sáng) có độ tương phản cao. |
| `--text-secondary`| `#94a3b8` | Màu chữ phụ (xám xanh) cho mô tả hoặc nhãn tiêu đề nhỏ. |
| `--accent-primary`| `#3b82f6` | Màu thương hiệu/chính (xanh dương) - dùng cho nút bấm, badge chính. |
| `--accent-hover`  | `#2563eb` | Trạng thái hover của màu thương hiệu. |
| `--accent-success`| `#10b981` | Màu chỉ thị trạng thái thành công, có hàng (xanh lá cây). |
| `--accent-danger` | `#ef4444` | Màu chỉ thị nguy hiểm, nút xóa, nút xuất kho (đỏ). |
| `--glass-bg`      | `rgba(30, 41, 59, 0.7)` | Màu nền kính mờ có độ mờ đục 70%. |
| `--glass-border`  | `rgba(255, 255, 255, 0.1)` | Đường viền mờ phát sáng nhẹ cho các khối kính mờ. |

---

## 2. Phông chữ & Kiểu chữ (Typography)

* **Phông chữ sử dụng**: `'Outfit', sans-serif` (được nhúng từ Google Fonts).
* **Đặc tính kiểu chữ**:
  * Tạo cảm giác hình khối hiện đại, thanh thoát và vô cùng cao cấp.
  * Các tiêu đề lớn sử dụng font-weight dày (`600`, `700`, `800`) cùng màu trắng sáng.
  * Các nhãn nhỏ hơn sử dụng `font-weight: 500` hoặc chữ hoa kèm khoảng cách ký tự (`letter-spacing`).

---

## 3. Các Lớp Tiện ích Glassmorphism (Utility Classes)

### Bảng kính mờ (`.glass-panel`)
Lớp tạo hiệu ứng chiều sâu không gian nhờ khả năng lọc làm mờ phần tử phía sau:
```css
.glass-panel {
  background: var(--glass-bg);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid var(--glass-border);
  border-radius: 16px;
  box-shadow: 0 4px 30px rgba(0, 0, 0, 0.1);
}
```

### Các Nút bấm (`.btn`, `.btn-primary`, `.btn-success`)
Có hiệu ứng chuyển đổi mượt mà và chuyển động dịch chuyển nhẹ khi hover:
```css
.btn {
  padding: 10px 20px;
  border-radius: 8px;
  border: none;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s ease;
  font-family: 'Outfit', sans-serif;
}
.btn-primary {
  background: var(--accent-primary);
  color: white;
}
.btn-primary:hover {
  background: var(--accent-hover);
  transform: translateY(-2px); /* Bay nhẹ lên trên */
}
```

### Trường Nhập liệu (`.input-field`)
Thiết kế tối màu hòa quyện vào giao diện nền tối với bo góc `8px`:
* **Select Dropdown**: Tự tùy biến mũi tên dropdown qua ảnh SVG tích hợp sẵn trong CSS để đồng bộ trên mọi nền tảng di động và trình duyệt.

---

## 4. Giao diện Cấu trúc & Bố cục (Layout Structure)

Được chia thành 2 phần chính nhờ Grid và Flexbox tại [Layout.jsx](file:///e:/FINAL/TOOL_INVENTORY/frontend/src/components/Layout.jsx):
* **Sidebar (Thanh điều hướng trái)**:
  * Chiều rộng cố định `250px`.
  * Có khung kính mờ bo dọc, chứa các liên kết trang (`NavLink`) được tạo hiệu ứng active đổi màu nền và màu biểu tượng.
  * Phía cuối sidebar tích hợp một thẻ **QR Code** màu trắng bo viền tròn góc để quét mở nhanh giao diện trên điện thoại.
* **Main Content (Nội dung chính)**:
  * Sử dụng thuộc tính `flex: 1` và `overflow-y: auto` để tự động tạo thanh cuộn độc lập khi nội dung quá dài.

---

## 5. Các Thiết kế Trang Đặc thù (Page-Specific Styling)

### 5.1. Sơ đồ Kệ kho Trực quan (`Dashboard.jsx`)
* **Khối chứa Kệ (Shelf Blocks)**: Khối kệ Trái (A-B) và Khối kệ Phải (C-F) được bao phủ bởi các hộp kính mờ `rgba(30, 41, 59, 0.4)` với tiêu đề in hoa thanh lịch. Các ô cách nhau bởi khoảng giãn `10px`.
* **Trạng thái Ô chứa**:
  * **Có hàng**: Sử dụng dải màu gradient tuyến tính và màu viền bóng mờ động theo cửa hàng ký gửi hàng hóa:
    * *Cửa hàng SDR*: `linear-gradient(135deg, rgba(59, 130, 246, 0.25), rgba(29, 78, 216, 0.15))` (Bóng mờ màu xanh).
    * *Cửa hàng BATT-BFG*: `linear-gradient(135deg, rgba(168, 85, 247, 0.25), rgba(126, 34, 206, 0.15))` (Bóng mờ màu tím).
    * *Hỗn hợp cả 2 shop*: `linear-gradient(135deg, rgba(16, 185, 129, 0.25), rgba(4, 120, 87, 0.15))` (Bóng mờ màu xanh lá).
  * **Ô trống**: Sử dụng viền đứt nét mảnh `1px dashed rgba(255, 255, 255, 0.1)`.
* **Hiệu ứng Micro-interaction khi hover ô**:
  * Ô có sản phẩm: Tự động nhấc nhẹ lên `translateY(-2px)`, tăng độ sáng viền và bóng đổ mờ để tạo cảm giác xúc giác sống động.
  * Ô trống: Đổi màu nền sáng nhẹ và chuyển màu văn bản từ xám mờ sang trắng.
* **Hiệu ứng lọc mờ (Filtering)**: Khi người dùng tìm kiếm SKU hoặc chọn khu vực, các ô không khớp sẽ giảm độ mờ về `opacity: 0.15` để làm nổi bật vị trí cần tìm mà vẫn giữ được cấu trúc tổng thể của sơ đồ kho vật lý.

### 5.2. Dialog / Hộp thoại Modal Thống nhất
Toàn bộ các dialog cài đặt hoặc chi tiết kệ ô đều tuân thủ thiết kế kính mờ cao cấp:
```javascript
// Cấu trúc CSS Overlay của Dialog
position: 'fixed';
inset: 0;
background: 'rgba(0, 0, 0, 0.75)';
backdropFilter: 'blur(6px)';
zIndex: 99999;
display: 'flex';
alignItems: 'center';
justifyContent: 'center';

// Khung chứa chính (Dialog Box)
background: 'linear-gradient(135deg, rgba(30, 30, 50, 0.98), rgba(20, 20, 40, 0.98))';
border: '1px solid rgba(255, 255, 255, 0.12)';
borderRadius: '20px';
boxShadow: 'rgba(0, 0, 0, 0.6) 0px 32px 80px';
```
* **Kỹ thuật chống lỗi layout**: Sử dụng React Portal (`createPortal` gắn vào `document.body`) để đưa các Modal ra khỏi phân cấp layout thông thường, tránh lỗi bị che khuất hoặc lỗi backdrop đen bởi stacking context của container chính.

### 5.3. Cấu trúc Tem nhãn in nhiệt (`BatchPrintPage.jsx`)
Được đo đạc tỉ mỉ theo đơn vị milimét (`mm`) để khớp chính xác với kích thước giấy in tem thực tế:
* **Khổ Tem đơn**: `35mm x 22mm`.
* **Cặp tem song song**: Được bọc trong khối in `70mm x 22mm` để hiển thị đồng thời hai nhãn tem ghép lại.
* **Layout Tem**: Mã QR Code SVG nằm bên trái chiếm `14mm` cố định, bên phải là thông tin SKU dạng in đậm kích cỡ chữ nhỏ `9px - 9.5px` để tránh bị tràn chữ ra ngoài tem giấy.

### 5.4. Hoạt ảnh Máy quét Mã vạch (`ExportPage.jsx`)
Sử dụng dòng quét la-ze màu xanh lá chạy dọc lặp lại vô tận để giả lập trạng thái camera quét mã:
```css
@keyframes scan-line {
  0% { transform: translateY(-40px); opacity: 0; }
  10% { opacity: 1; }
  90% { opacity: 1; }
  100% { transform: translateY(40px); opacity: 0; }
}
```

---

## 6. Thiết kế Đáp ứng trên Di động (Responsive Layout)

Dưới kích thước màn hình `@media (max-width: 768px)`:
1. **Chuyển đổi Sidebar**: Sidebar biến đổi từ bảng dọc bên trái thành **Bottom Navigation Bar** cố định ở cạnh đáy màn hình (chiều cao `70px`), các nhãn chữ thu nhỏ và biểu tượng xếp dọc để dễ dàng thao tác bằng một ngón tay cái.
2. **Ẩn các phần tử phụ**: Các biểu trưng lớn, tên hệ thống và vùng QR quét di động của sidebar tự động ẩn đi để tiết kiệm diện tích.
3. **Responsive Grid & Flex**: Các bố cục lưới nhiều cột (ví dụ form nhập hàng 5 cột, các khung preview in tem) tự động giãn thành `grid-template-columns: 1fr` (1 cột duy nhất) chồng xếp lên nhau theo chiều dọc giúp hiển thị hoàn hảo trên màn hình dọc của điện thoại.

---

## 7. Tổ chức Tách biệt Style CSS (Styles Separation)

Để dễ dàng mở rộng, bảo trì và tối ưu hóa hiệu năng render của React, toàn bộ mã CSS Inline thô trước đây đã được bóc tách triệt để vào các tệp CSS mô-đun riêng biệt tương ứng với từng trang và thành phần giao diện:

* **Bố cục chính**:
  * [Layout.css](file:///e:/FINAL/TOOL_INVENTORY/frontend/src/components/Layout.css) - Quản lý sidebar, logo nhãn hiệu và khối QR kết nối điện thoại.
* **Các trang nghiệp vụ**:
  * [Dashboard.css](file:///e:/FINAL/TOOL_INVENTORY/frontend/src/pages/Dashboard.css) - Chứa định nghĩa lưới sơ đồ kệ kho, cấu trúc ô trống/có hàng động theo cửa hàng, các hiệu ứng hover nhấc nổi 3D, và hộp thoại kính mờ chi tiết kệ ô.
  * [ImportPage.css](file:///e:/FINAL/TOOL_INVENTORY/frontend/src/pages/ImportPage.css) - Định dạng form lưới nhập hàng 5 cột, căn chỉnh bề rộng ô vị trí, ảnh xem trước camera và hiệu ứng mờ trường nhập liệu bị khóa.
  * [ExportPage.css](file:///e:/FINAL/TOOL_INVENTORY/frontend/src/pages/ExportPage.css) - Phong cách khu vực mô phỏng quét laser la-ze la-de, hoạt ảnh chạy dòng la-ze quét (`scan-line`), và danh sách nhật ký xuất kho.
  * [BatchPrintPage.css](file:///e:/FINAL/TOOL_INVENTORY/frontend/src/pages/BatchPrintPage.css) - Quy chuẩn tem in nhiệt millimeter thực tế (`35x22mm`, `70x22mm`), cài đặt máy in, và hộp kiểm tra bản in thành công.
  * [HistoryPage.css](file:///e:/FINAL/TOOL_INVENTORY/frontend/src/pages/HistoryPage.css) - Kiểu dáng dòng lịch sử timeline xuất kho, nhãn chỉ ngày tháng sắc cam-vàng chủ đạo và cột mốc thời gian xuất nhập chi tiết.

