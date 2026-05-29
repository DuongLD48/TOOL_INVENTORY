const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const db = require('./db');
const vectorSearch = require('./vector_search');

const os = require('os');
const fs = require('fs');
const path = require('path');
const QRCode = require('qrcode');
const PDFDocument = require('pdfkit');
const { print, getPrinters } = require('pdf-to-printer');

// Tên máy in — có thể đổi ở đây nếu cần
const PRINTER_NAME = 'Xprinter XP-470B';
// Thư mục tạm để lưu PDF trước khi in
const TEMP_DIR = path.join(__dirname, 'temp_print');
if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR);

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Cấu hình phục vụ file tĩnh cho thư mục uploads
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)){
    fs.mkdirSync(uploadsDir);
}
app.use('/uploads', express.static(uploadsDir));

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// --- API ROUTES ---

// 0. Lấy IP mạng nội bộ để tạo QR Code
app.get('/api/network-ip', (req, res) => {
  const interfaces = os.networkInterfaces();
  let localIp = 'localhost';
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        localIp = iface.address;
        break;
      }
    }
  }
  res.json({ ip: localIp });
});


// 1. Lấy danh sách sản phẩm đang tồn kho (IN_STOCK hoặc PENDING)
app.get('/api/inventory', (req, res) => {
  db.all("SELECT * FROM products WHERE status = 'IN_STOCK' OR status = 'PENDING'", [], (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json({ data: rows });
  });
});

// 1.5. Tìm kiếm sản phẩm tồn kho bằng hình ảnh (Vector similarity search)
app.post('/api/inventory/search-image', async (req, res) => {
  const { imageUrl } = req.body;
  if (!imageUrl) {
    return res.status(400).json({ error: 'Vui lòng cung cấp hình ảnh thiết kế cần tìm.' });
  }

  try {
    const results = await vectorSearch.searchSimilarProducts(db, imageUrl, 10);
    res.json({ data: results });
  } catch (error) {
    console.error('Lỗi khi tìm kiếm bằng ảnh:', error.message);
    res.status(500).json({ error: error.message || 'Lỗi hệ thống khi xử lý tìm kiếm ảnh.' });
  }
});

// 2. Nhập kho (Tạo sản phẩm mới)
app.post('/api/inventory/import', (req, res) => {
  let { sku, location, shop, numberSku, productType, size, imageUrl } = req.body;
  
  // Validation cơ bản (tuỳ thuộc logic shop)
  if (shop === 'BATT-BFG' && (!imageUrl || !location)) {
    return res.status(400).json({ error: 'Shop BATT-BFG yêu cầu phải có ảnh (imageUrl) và vị trí (location).' });
  }

  const now = new Date().toISOString();

  // Xử lý lưu file ảnh nếu là dạng Base64
  if (imageUrl && imageUrl.startsWith('data:image/')) {
    try {
      const matches = imageUrl.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
      if (matches && matches.length === 3) {
        const imageExtension = matches[1].split('/')[1] || 'jpg';
        const imageData = matches[2];
        const buffer = Buffer.from(imageData, 'base64');
        const filename = `${Date.now()}_${Math.random().toString(36).slice(2)}.${imageExtension}`;
        const filepath = path.join(uploadsDir, filename);
        fs.writeFileSync(filepath, buffer);
        
        // Cập nhật imageUrl thành đường dẫn relative
        imageUrl = `/uploads/${filename}`;
      }
    } catch (e) {
      console.error('Lỗi khi lưu ảnh ra file:', e);
    }
  }

  const insertProduct = () => {
    const query = `
      INSERT INTO products (sku, location, shop, numberSku, productType, size, imageUrl, status, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'IN_STOCK', ?, ?)
    `;
    const params = [sku, location, shop, numberSku, productType, size, imageUrl, now, now];

    db.run(query, params, function(err) {
      if (err) {
        res.status(500).json({ error: err.message });
        return;
      }
      const newProduct = { id: this.lastID, sku, location, shop, numberSku, productType, size, imageUrl, status: 'IN_STOCK', createdAt: now, updatedAt: now };
      
      // Gửi sự kiện realtime cho các client khác cập nhật danh sách
      io.emit('inventory_updated', { type: 'IMPORT', product: newProduct });

      // Ghi nhật ký thao tác
      db.run("INSERT INTO logs (actionType, productId, sku, location, shop, details, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)",
        ['IMPORT', this.lastID, sku, location || 'N/A', shop, `Nhập kho sản phẩm mới (${productType} - Size ${size})`, now]
      );

      // Lập chỉ mục vector cho sản phẩm mới có ảnh
      if (imageUrl) {
        vectorSearch.indexProduct(db, this.lastID, imageUrl);
      }
      
      res.status(201).json({ message: 'Nhập kho thành công', data: newProduct });
    });
  };

  if (location && location.trim() !== '') {
    // Kiểm tra xem vị trí đã có người dùng chưa (bao gồm cả sản phẩm PENDING chờ lấy hàng)
    db.get("SELECT * FROM products WHERE location = ? AND (status = 'IN_STOCK' OR status = 'PENDING') LIMIT 1", [location], (err, existing) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      if (existing) {
        return res.status(400).json({ error: `Vị trí ${location} hiện đang chứa sản phẩm SKU: ${existing.sku}. Vui lòng chọn vị trí trống khác.` });
      }
      insertProduct();
    });
  } else {
    insertProduct();
  }
});

// 3. Xuất kho theo SKU hoặc ID (Lấy ra sản phẩm đang IN_STOCK và chuyển thành EXPORTED)
app.post('/api/inventory/export', (req, res) => {
  let { sku } = req.body;
  
  if (!sku) {
    return res.status(400).json({ error: 'Vui lòng cung cấp mã QR hợp lệ.' });
  }

  // Chỉ chấp nhận format ID#SKU (ví dụ: 15#0001SSRG-M)
  if (!sku.includes('#')) {
    return res.status(400).json({ error: 'Mã QR không hợp lệ. Vui lòng in lại tem mới theo định dạng ID#SKU.' });
  }
  const parts = sku.split('#');
  const prefix = parts[0];
  if (!/^\d+$/.test(prefix)) {
    return res.status(400).json({ error: 'Mã QR không hợp lệ. Phần ID phải là số nguyên.' });
  }
  const productId = parseInt(prefix, 10);

  // Tìm sản phẩm IN_STOCK hoặc PENDING khớp chính xác theo ID
  const queryStr = "SELECT * FROM products WHERE id = ? AND (status = 'IN_STOCK' OR status = 'PENDING') LIMIT 1";
  const queryParam = productId;

  db.get(queryStr, [queryParam], (err, product) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    if (!product) {
      return res.status(404).json({ error: `Không tìm thấy sản phẩm hoặc sản phẩm SKU: ${sku} đã hết hàng.` });
    }

    const now = new Date().toISOString();
    
    // Cập nhật trạng thái
    db.run("UPDATE products SET status = 'EXPORTED', updatedAt = ? WHERE id = ?", [now, product.id], function(updateErr) {
      if (updateErr) {
        return res.status(500).json({ error: updateErr.message });
      }
      
      const exportedProduct = { ...product, status: 'EXPORTED', updatedAt: now };
      
      // Báo cáo realtime cho toàn mạng nội bộ
      io.emit('inventory_updated', { type: 'EXPORT', product: exportedProduct });

      // Ghi nhật ký thao tác
      db.run("INSERT INTO logs (actionType, productId, sku, location, shop, details, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)",
        ['EXPORT', product.id, product.sku, product.location, product.shop, `Xuất kho sản phẩm (Đơn hàng gán: ${product.orderId || 'N/A'})`, now]
      );
      
      res.json({ message: 'Xuất kho thành công', data: exportedProduct });
    });
  });
});

// 4. Lấy lịch sử xuất kho (EXPORTED), mới nhất trước
app.get('/api/inventory/exported', (req, res) => {
  db.all("SELECT * FROM products WHERE status = 'EXPORTED' ORDER BY updatedAt DESC", [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ data: rows });
  });
});

// 4.5. Lấy danh sách toàn bộ thao tác (Audit Logs)
app.get('/api/logs', (req, res) => {
  db.all("SELECT * FROM logs ORDER BY createdAt DESC", [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ data: rows });
  });
});

// 5. Lấy danh sách sản phẩm chưa in tem (isPrinted = 0)
app.get('/api/inventory/unprinted', (req, res) => {
  db.all("SELECT * FROM products WHERE (status = 'IN_STOCK' OR status = 'PENDING') AND isPrinted = 0", [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ data: rows });
  });
});

// 5. Đánh dấu sản phẩm đã in tem
app.post('/api/inventory/mark-printed', (req, res) => {
  const { ids } = req.body;
  if (!ids || !Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: 'Cần cung cấp mảng các ID sản phẩm.' });
  }
  const placeholders = ids.map(() => '?').join(',');
  const query = `UPDATE products SET isPrinted = 1 WHERE id IN (${placeholders})`;
  db.run(query, ids, function(err) {
    if (err) return res.status(500).json({ error: err.message });

    // Ghi nhật ký thao tác in tem
    const now = new Date().toISOString();
    db.all(`SELECT * FROM products WHERE id IN (${placeholders})`, ids, (selectErr, products) => {
      if (!selectErr && products) {
        db.serialize(() => {
          const logStmt = db.prepare("INSERT INTO logs (actionType, productId, sku, location, shop, details, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)");
          products.forEach(p => {
            logStmt.run(['PRINT', p.id, p.sku, p.location, p.shop, 'Đã đánh dấu in tem nhãn', now]);
          });
          logStmt.finalize();
        });
      }
    });

    res.json({ message: 'Đã đánh dấu in thành công.', updated: this.changes });
  });
});

// 7. Lấy danh sách máy in trong hệ thống
app.get('/api/printers', async (req, res) => {
  try {
    const printers = await getPrinters();
    res.json({ data: printers, current: PRINTER_NAME });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 7.5. In test — tạo PDF từ dữ liệu mẫu (không cần sản phẩm trong DB)
app.post('/api/inventory/print-test', async (req, res) => {
  const { printerName, pageWidth, pageHeight, orientation, mode } = req.body;

  // Dữ liệu 2 sản phẩm mẫu
  const testProducts = [
    { id: 0, sku: 'TEST-SKU-001', shop: 'SDR', numberSku: '0001', productType: 'SSRG', size: 'M', location: 'A1-1' },
    { id: 0, sku: 'TEST-SKU-002', shop: 'BATT-BFG', numberSku: '0002', productType: 'LSRG', size: 'XL', location: 'B2-3' },
  ];

  try {
    const targetPrinter = printerName || PRINTER_NAME;
    const targetWidth = pageWidth ? Number(pageWidth) : 100;
    const targetHeight = pageHeight ? Number(pageHeight) : 22;
    const targetOrientation = orientation || 'landscape';

    const MM = 2.8346;
    const PAGE_W = targetWidth * MM;
    const PAGE_H = targetHeight * MM;
    const LABEL_W = 35 * MM;
    const MARGIN_X = Math.max(0, (targetWidth - 70) / 2) * MM;
    const PAD = 1.5 * MM;

    const isPdfMode = mode === 'pdf';
    const pdfFilename = `test_labels_${Date.now()}.pdf`;
    const pdfPath = isPdfMode
      ? path.join(uploadsDir, pdfFilename)
      : path.join(TEMP_DIR, pdfFilename);

    const doc = new PDFDocument({ size: [PAGE_W, PAGE_H], margin: 0, autoFirstPage: false });
    const writeStream = fs.createWriteStream(pdfPath);
    doc.pipe(writeStream);

    // 1 trang duy nhất, 2 tem test
    doc.addPage();
    for (let j = 0; j < testProducts.length; j++) {
      const p = testProducts[j];
      const offsetX = MARGIN_X + (j * LABEL_W);
      const qrSize = 14 * MM;
      const qrGap = 2 * MM;
      const textMaxW = 16 * MM;
      const qrX = offsetX + PAD;
      const textX = qrX + qrSize + qrGap;
      const qrY = PAD + (19 * MM - qrSize) / 2;
      const textHeight = p.numberSku ? 34 : 26;
      const textStartY = qrY + (qrSize - textHeight) / 2;

      const qrBuffer = await QRCode.toBuffer(`${p.id}#${p.sku}`, {
        type: 'png', width: 300, margin: 0,
        color: { dark: '#000000', light: '#FFFFFF' }
      });

      doc.image(qrBuffer, qrX, qrY, { width: qrSize, height: qrSize });
      doc.font('Helvetica-Bold').fontSize(8.5).fillColor('black')
        .text(p.shop, textX, textStartY, { width: textMaxW });
      if (p.numberSku) {
        doc.text(p.numberSku, { width: textMaxW });
      }
      doc.text(`${p.productType}-${p.size}`, { width: textMaxW });
      doc.font('Helvetica').fontSize(7.5).text(`${p.location} #TEST`, { width: textMaxW });
    }

    doc.end();

    writeStream.on('finish', async () => {
      if (isPdfMode) {
        res.json({ message: 'Tạo PDF test thành công', pdfUrl: `/uploads/${pdfFilename}` });
      } else {
        try {
          await print(pdfPath, {
            printer: targetPrinter,
            silent: true,
            scale: 'noscale',
            orientation: targetOrientation
          });
          setTimeout(() => { try { fs.unlinkSync(pdfPath); } catch(_) {} }, 10000);
          res.json({ message: 'Đã gửi 2 tem test tới máy in.' });
        } catch (printErr) {
          res.status(500).json({ error: `Lỗi máy in: ${printErr.message}` });
        }
      }
    });

    writeStream.on('error', (e) => res.status(500).json({ error: `Lỗi tạo file: ${e.message}` }));
  } catch (e) {
    res.status(500).json({ error: `Lỗi tạo PDF test: ${e.message}` });
  }
});

// 8. In tem trực tiếp — tạo PDF rồi gửi tới máy in không qua hộp thoại
app.post('/api/inventory/print-now', async (req, res) => {
  const { ids, printerName, pageWidth, pageHeight, orientation } = req.body; // lấy cấu hình từ client
  if (!ids || !Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: 'Cần cung cấp mảng ID sản phẩm.' });
  }

  // Lấy thông tin sản phẩm
  const placeholders = ids.map(() => '?').join(',');
  db.all(`SELECT * FROM products WHERE id IN (${placeholders})`, ids, async (err, products) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!products.length) return res.status(404).json({ error: 'Không tìm thấy sản phẩm.' });

    try {
      // Cấu hình từ client hoặc dùng mặc định
      const targetPrinter = printerName || PRINTER_NAME;
      const targetWidth = pageWidth ? Number(pageWidth) : 100;
      const targetHeight = pageHeight ? Number(pageHeight) : 22;
      const targetOrientation = orientation || 'landscape';

      const MM = 2.8346;
      const PAGE_W = targetWidth * MM;  
      const PAGE_H = targetHeight * MM; 
      const LABEL_W = 35 * MM;  // mỗi label chiếm 35mm
      const MARGIN_X = Math.max(0, (targetWidth - 70) / 2) * MM; // Lề động dựa trên chiều rộng khổ giấy
      const PAD = 1.5 * MM;     // Padding 1.5mm theo create_label1.html

      const pdfPath = path.join(TEMP_DIR, `labels_${Date.now()}.pdf`);
      const doc = new PDFDocument({ size: [PAGE_W, PAGE_H], margin: 0, autoFirstPage: false });
      const writeStream = fs.createWriteStream(pdfPath);
      doc.pipe(writeStream);

      // Nhóm thành từng cặp (2 tem / trang)
      for (let i = 0; i < products.length; i += 2) {
        doc.addPage();
        const pair = [products[i], products[i + 1]].filter(Boolean);

        for (let j = 0; j < pair.length; j++) {
          const p = pair[j];
          const offsetX = MARGIN_X + (j * LABEL_W);

          // Kích thước tem từ create_label1.html: QR 14mm, Gap 2mm
          const qrSize = 14 * MM;
          const qrGap = 2 * MM;

          // Chiều rộng tối đa cho text bên phải: 35mm - (1.5mm * 2) - 14mm - 2mm = 16mm
          const textMaxW = 16 * MM;

          // Căn trái cho tem con (flex-start)
          const qrX = offsetX + PAD;
          const textX = qrX + qrSize + qrGap;

          // Căn giữa dọc: chiều cao 22mm, padding 2 bên 1.5mm -> chiều cao sử dụng 19mm
          // qrSize là 14mm -> qrY = 1.5mm + (19mm - 14mm) / 2 = 4mm
          const qrY = PAD + (19 * MM - qrSize) / 2;

          // Căn giữa chữ dọc theo mã QR (chiều cao chữ khoảng 34pt nếu có numberSku, 26pt nếu không)
          const textHeight = p.numberSku ? 34 : 26;
          const textStartY = qrY + (qrSize - textHeight) / 2;

          // Tạo QR code dưới dạng PNG buffer (độ phân giải cao để ảnh nét hơn khi in)
          const qrBuffer = await QRCode.toBuffer(`${p.id}#${p.sku}`, {
            type: 'png',
            width: 300, 
            margin: 0,
            color: { dark: '#000000', light: '#FFFFFF' }
          });

          // Vẽ QR
          doc.image(qrBuffer, qrX, qrY, { width: qrSize, height: qrSize });

          // Vẽ chữ theo cấu trúc yêu cầu: shop, numberSku (nếu có), productType-size (cùng font Helvetica-Bold size 8.5), và vị trí #ID (size 7.5)
          doc.font('Helvetica-Bold').fontSize(8.5).fillColor('black')
            .text(p.shop, textX, textStartY, { width: textMaxW });
          
          if (p.numberSku) {
            doc.text(p.numberSku, { width: textMaxW });
          }
          
          doc.text(`${p.productType}-${p.size}`, { width: textMaxW });
          
          doc.font('Helvetica').fontSize(7.5).text(`${p.location || ''} #${p.id}`, { width: textMaxW });
        }
      }

      doc.end();

      // Chờ file được ghi xong rồi mới in
      writeStream.on('finish', async () => {
        try {
          await print(pdfPath, { 
            printer: targetPrinter, 
            silent: true,
            scale: 'noscale',
            orientation: targetOrientation
          });
          // Dọn file tạm sau 10 giây
          setTimeout(() => { try { fs.unlinkSync(pdfPath); } catch(_) {} }, 10000);

          // Ghi nhật ký thao tác in tem trực tiếp
          const printTime = new Date().toISOString();
          db.serialize(() => {
            const logStmt = db.prepare("INSERT INTO logs (actionType, productId, sku, location, shop, details, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)");
            products.forEach(p => {
              logStmt.run(['PRINT', p.id, p.sku, p.location, p.shop, `Gửi lệnh in trực tiếp tới máy in: ${targetPrinter}`, printTime]);
            });
            logStmt.finalize();
          });

          // Trả về thành công — việc mark-printed do frontend gọi sau khi user xác nhận
          res.json({ message: `Đã gửi ${products.length} tem tới máy in.`, printed: products.length });
        } catch (printErr) {
          res.status(500).json({ error: `Lỗi máy in: ${printErr.message}` });
        }
      });

      writeStream.on('error', (e) => res.status(500).json({ error: `Lỗi tạo file: ${e.message}` }));

    } catch (e) {
      res.status(500).json({ error: `Lỗi tạo PDF: ${e.message}` });
    }
  });
});

// 8.5. Tạo file PDF tem nhãn mà không gửi tới máy in (trả về URL để frontend mở in qua trình duyệt)
app.post('/api/inventory/generate-pdf', async (req, res) => {
  const { ids, pageWidth, pageHeight, orientation } = req.body;
  if (!ids || !Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: 'Cần cung cấp mảng ID sản phẩm.' });
  }

  // Lấy thông tin sản phẩm
  const placeholders = ids.map(() => '?').join(',');
  db.all(`SELECT * FROM products WHERE id IN (${placeholders})`, ids, async (err, products) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!products.length) return res.status(404).json({ error: 'Không tìm thấy sản phẩm.' });

    try {
      const targetWidth = pageWidth ? Number(pageWidth) : 100;
      const targetHeight = pageHeight ? Number(pageHeight) : 22;
      const targetOrientation = orientation || 'landscape';

      const MM = 2.8346;
      const PAGE_W = targetWidth * MM;  
      const PAGE_H = targetHeight * MM; 
      const LABEL_W = 35 * MM;  // mỗi label chiếm 35mm
      const MARGIN_X = Math.max(0, (targetWidth - 70) / 2) * MM; // Lề động dựa trên chiều rộng khổ giấy
      const PAD = 1.5 * MM;     // Padding 1.5mm theo create_label1.html

      const pdfFilename = `labels_${Date.now()}.pdf`;
      const pdfPath = path.join(uploadsDir, pdfFilename); // Lưu vào uploads để truy cập được
      const doc = new PDFDocument({ size: [PAGE_W, PAGE_H], margin: 0, autoFirstPage: false });
      const writeStream = fs.createWriteStream(pdfPath);
      doc.pipe(writeStream);

      // Nhóm thành từng cặp (2 tem / trang)
      for (let i = 0; i < products.length; i += 2) {
        doc.addPage();
        const pair = [products[i], products[i + 1]].filter(Boolean);

        for (let j = 0; j < pair.length; j++) {
          const p = pair[j];
          const offsetX = MARGIN_X + (j * LABEL_W);

          // Kích thước tem từ create_label1.html: QR 14mm, Gap 2mm
          const qrSize = 14 * MM;
          const qrGap = 2 * MM;

          // Chiều rộng tối đa cho text bên phải: 35mm - (1.5mm * 2) - 14mm - 2mm = 16mm
          const textMaxW = 16 * MM;

          // Căn trái cho tem con (flex-start)
          const qrX = offsetX + PAD;
          const textX = qrX + qrSize + qrGap;

          // Căn giữa dọc: chiều cao 22mm, padding 2 bên 1.5mm -> chiều cao sử dụng 19mm
          // qrSize là 14mm -> qrY = 1.5mm + (19mm - 14mm) / 2 = 4mm
          const qrY = PAD + (19 * MM - qrSize) / 2;

          // Căn giữa chữ dọc theo mã QR (chiều cao chữ khoảng 34pt nếu có numberSku, 26pt nếu không)
          const textHeight = p.numberSku ? 34 : 26;
          const textStartY = qrY + (qrSize - textHeight) / 2;

          // Tạo QR code dưới dạng PNG buffer (độ phân giải cao để ảnh nét hơn khi in)
          const qrBuffer = await QRCode.toBuffer(`${p.id}#${p.sku}`, {
            type: 'png',
            width: 300, 
            margin: 0,
            color: { dark: '#000000', light: '#FFFFFF' }
          });

          // Vẽ QR
          doc.image(qrBuffer, qrX, qrY, { width: qrSize, height: qrSize });

          // Vẽ chữ theo cấu trúc yêu cầu: shop, numberSku (nếu có), productType-size (cùng font Helvetica-Bold size 8.5), và vị trí #ID (size 7.5)
          doc.font('Helvetica-Bold').fontSize(8.5).fillColor('black')
            .text(p.shop, textX, textStartY, { width: textMaxW });
          
          if (p.numberSku) {
            doc.text(p.numberSku, { width: textMaxW });
          }
          
          doc.text(`${p.productType}-${p.size}`, { width: textMaxW });
          
          doc.font('Helvetica').fontSize(7.5).text(`${p.location || ''} #${p.id}`, { width: textMaxW });
        }
      }

      doc.end();

      writeStream.on('finish', () => {
        // Ghi nhật ký tạo PDF tem nhãn
        const printTime = new Date().toISOString();
        db.serialize(() => {
          const logStmt = db.prepare("INSERT INTO logs (actionType, productId, sku, location, shop, details, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)");
          products.forEach(p => {
            logStmt.run(['PRINT', p.id, p.sku, p.location, p.shop, 'Tạo file PDF tem nhãn', printTime]);
          });
          logStmt.finalize();
        });
        res.json({ message: 'Tạo PDF thành công', pdfUrl: `/uploads/${pdfFilename}` });
      });

      writeStream.on('error', (e) => res.status(500).json({ error: `Lỗi tạo file: ${e.message}` }));

    } catch (e) {
      res.status(500).json({ error: `Lỗi tạo PDF: ${e.message}` });
    }
  });
});

// 8.55. Chuyển sản phẩm sang trạng thái PENDING (dành cho tìm kiếm bằng hình ảnh)
app.post('/api/inventory/mark-pending', (req, res) => {
  const { id } = req.body;
  if (!id) {
    return res.status(400).json({ error: 'Cần cung cấp ID sản phẩm.' });
  }

  const now = new Date().toISOString();
  db.run("UPDATE products SET status = 'PENDING', orderId = 'SEARCH_IMAGE', updatedAt = ? WHERE id = ? AND status = 'IN_STOCK'", [now, id], function(err) {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    if (this.changes === 0) {
      return res.status(404).json({ error: 'Không tìm thấy sản phẩm hoặc sản phẩm không ở trạng thái IN_STOCK.' });
    }

    db.get("SELECT * FROM products WHERE id = ?", [id], (getErr, row) => {
      if (!getErr && row) {
        // Ghi nhật ký gán PENDING từ tìm kiếm bằng ảnh
        db.run("INSERT INTO logs (actionType, productId, sku, location, shop, details, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)",
          ['MARK_PENDING', row.id, row.sku, row.location, row.shop, 'Gán PENDING (Tìm kiếm bằng ảnh)', now]
        );
        io.emit('inventory_updated', { type: 'ASSIGN_ORDERS', product: row });
      }
      res.json({ message: 'Đã chuyển trạng thái sản phẩm sang PENDING.', data: row });
    });
  });
});

// 8.6 Cập nhật trạng thái sản phẩm ghép đơn (chuyển thành PENDING và gán orderId)
app.post('/api/inventory/assign-orders', (req, res) => {
  const { assignments } = req.body; // Mảng các { productId, orderId }
  if (!assignments || !Array.isArray(assignments) || assignments.length === 0) {
    return res.status(400).json({ error: 'Cần cung cấp danh sách phân bổ.' });
  }

  const now = new Date().toISOString();
  
  db.serialize(() => {
    let errorOccurred = false;
    let completed = 0;
    
    // Sử dụng statement chuẩn bị sẵn để tối ưu hiệu năng và bảo mật SQL Injection
    const stmt = db.prepare("UPDATE products SET status = 'PENDING', orderId = ?, updatedAt = ? WHERE id = ? AND status = 'IN_STOCK'");
    
    assignments.forEach((item) => {
      stmt.run([item.orderId, now, item.productId], function(err) {
        if (err) {
          errorOccurred = true;
          console.error(`Lỗi cập nhật sản phẩm ID ${item.productId}:`, err.message);
        } else if (this.changes > 0) {
          // Ghi nhật ký gán PENDING ghép đơn hàng
          db.get("SELECT * FROM products WHERE id = ?", [item.productId], (getErr, row) => {
            if (!getErr && row) {
              db.run("INSERT INTO logs (actionType, productId, sku, location, shop, details, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)",
                ['MARK_PENDING', row.id, row.sku, row.location, row.shop, `Ghép đơn hàng #${item.orderId}`, now]
              );
            }
          });
        }
        completed++;
        if (completed === assignments.length) {
          stmt.finalize();
          if (errorOccurred) {
            return res.status(500).json({ error: 'Có lỗi xảy ra khi cập nhật một số sản phẩm.' });
          }
          // Gửi sự kiện realtime để cập nhật giao diện các máy khác
          io.emit('inventory_updated', { type: 'ASSIGN_ORDERS', assignments });
          res.json({ message: `Đã phân bổ và chuyển ${assignments.length} sản phẩm sang trạng thái PENDING.` });
        }
      });
    });
  });
});

// 8.7 Khôi phục trạng thái từ PENDING về IN_STOCK
app.post('/api/inventory/restore-stock', (req, res) => {
  const { id } = req.body;
  if (!id) {
    return res.status(400).json({ error: 'Cần cung cấp ID sản phẩm.' });
  }

  const now = new Date().toISOString();
  db.run("UPDATE products SET status = 'IN_STOCK', orderId = NULL, updatedAt = ? WHERE id = ? AND status = 'PENDING'", [now, id], function(err) {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    if (this.changes === 0) {
      return res.status(404).json({ error: 'Không tìm thấy sản phẩm ở trạng thái PENDING.' });
    }

    db.get("SELECT * FROM products WHERE id = ?", [id], (getErr, row) => {
      if (!getErr && row) {
        // Ghi nhật ký khôi phục trạng thái
        db.run("INSERT INTO logs (actionType, productId, sku, location, shop, details, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)",
          ['RESTORE_STOCK', row.id, row.sku, row.location, row.shop, 'Khôi phục từ PENDING về Tồn kho', now]
        );
        io.emit('inventory_updated', { type: 'RESTORE_STOCK', product: row });
      }
      res.json({ message: 'Khôi phục sản phẩm về Tồn kho thành công.', data: row });
    });
  });
});

// --- SOCKET.IO ---
io.on('connection', (socket) => {
  console.log('Có client kết nối:', socket.id);
  
  socket.on('disconnect', () => {
    console.log('Client ngắt kết nối:', socket.id);
  });
});

// --- START SERVER ---
const PORT = 3001;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server Backend (API & Realtime) đang chạy tại http://localhost:${PORT}`);
  // Khởi tạo vector search model và chạy tự động indexing
  vectorSearch.init(db);
});
