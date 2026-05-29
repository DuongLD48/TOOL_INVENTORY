# Database Schema

Cấu trúc JSON gốc cho sản phẩm trong hệ thống quản lý tồn kho:

```json
{
  "id": "1", // Mã định danh duy nhất (có thể tự động sinh hoặc gộp từ các thuộc tính)
  "sku": "0001SSRG-M", // Mã SKU hoàn chỉnh dùng để tạo QR code
  "location": "A1", // Vị trí trong kho (VD: A1, B3)
  "shop": "SDR", // Giá trị: "SDR" hoặc "BATT-BFG"
  "numberSku": "0001", // Số SKU (VD: 0001, 0206)
  "productType": "SSRG", // Giá trị: "SSRG", "LSRG", "WSRG", "WLRG", "FSHO", "GSHO", "WRES", "WWRE"
  "size": "L", // Giá trị: "2XS", "XS", "S", "M", "L", "XL", "2XL", "3XL", "4XL", "5XL"
  "imageUrl": "", // Đường dẫn ảnh (Trống nếu là SDR, bắt buộc có link ảnh nếu là BATT-BFG)
  "status": "IN_STOCK", // Trạng thái: "IN_STOCK" (Tồn kho) hoặc "EXPORTED" (Đã xuất)
  "createdAt": "2026-05-25T15:54:35Z", // Thời gian nhập kho
  "updatedAt": "2026-05-25T15:54:35Z" // Thời gian cập nhật cuối cùng (VD: lúc xuất kho)
}
```

## Logic Xử Lý & Ràng Buộc
1. **Quét / Nhập Thông Tin**:
   - Nếu `shop === "SDR"`: Bỏ qua chụp ảnh (`imageUrl` có thể để trống).
   - Nếu `shop === "BATT-BFG"`: Bắt buộc chụp ảnh và điền `location`.
2. **In Label**: 
   - Mã QR sẽ được sinh ra từ trường `sku`.
   - Trên label bao gồm: QR code, `location`, `sku`.
3. **Hiển Thị Vị Trí**: 
   - Truy xuất các item có `status === "IN_STOCK"` để hiển thị vị trí trên trang chủ.
4. **Xuất Kho**: 
   - Quét mã QR (đọc `sku`).
   - Cập nhật `status` thành `EXPORTED` và cập nhật lại `updatedAt`.
