require('dotenv').config();
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
const bwipjs = require('bwip-js');

// Cấu hình máy in duy nhất trên Server Local
let PRINTER_CONFIG = {
  printerName: process.env.PRINTER_NAME || 'Xprinter XP-470B',
  pageWidth: Number(process.env.PAGE_WIDTH) || 100,
  pageHeight: Number(process.env.PAGE_HEIGHT) || 150,
  orientation: process.env.ORIENTATION || 'portrait'
};

const configPath = path.join(__dirname, 'printer_config.json');
if (fs.existsSync(configPath)) {
  try {
    const savedConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    if (savedConfig.printerName) PRINTER_CONFIG.printerName = savedConfig.printerName;
    if (savedConfig.pageWidth) PRINTER_CONFIG.pageWidth = Number(savedConfig.pageWidth) || 100;
    if (savedConfig.pageHeight) PRINTER_CONFIG.pageHeight = Number(savedConfig.pageHeight) || 150;
    if (savedConfig.orientation) PRINTER_CONFIG.orientation = savedConfig.orientation;
    console.log(`[Printer Config] Đã tải cấu hình máy in:`, PRINTER_CONFIG);
  } catch (e) {
    console.error('[Printer Config] Lỗi đọc file cấu hình, sử dụng mặc định:', e.message);
  }
}

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

// Cấu hình tải danh sách shop động
const shopsConfigPath = path.join(__dirname, 'shops_config.json');
let shopsConfig = [];

const loadShopsConfig = () => {
  try {
    if (fs.existsSync(shopsConfigPath)) {
      const data = fs.readFileSync(shopsConfigPath, 'utf8');
      shopsConfig = JSON.parse(data);
      console.log('Đã tải cấu hình shop:', shopsConfig.map(s => s.name).join(', '));
    } else {
      console.warn('Tệp shops_config.json không tồn tại. Sử dụng cấu hình mặc định.');
      shopsConfig = [
        {
          "id": "SDR",
          "name": "SDR",
          "skuPrefix": "SYC",
          "requireNumberSku": true,
          "requireCamera": false,
          "autoImageFolder": true
        },
        {
          "id": "BATT-BFG",
          "name": "BATT-BFG",
          "skuPrefix": "",
          "requireNumberSku": false,
          "requireCamera": true,
          "autoImageFolder": false
        }
      ];
    }
  } catch (e) {
    console.error('Lỗi khi đọc shops_config.json:', e);
  }
};
loadShopsConfig();

// Đăng ký tự động các thư mục tĩnh cho shop có autoImageFolder
shopsConfig.forEach(shop => {
  if (shop.autoImageFolder) {
    const shopDirName = `${shop.id.toLowerCase()}_images`;
    const shopImagesDir = path.join(__dirname, shopDirName);
    if (!fs.existsSync(shopImagesDir)){
      fs.mkdirSync(shopImagesDir);
    }
    app.use(`/${shopDirName}`, express.static(shopImagesDir));
    console.log(`Đã đăng ký thư mục tĩnh: /${shopDirName} -> ${shopImagesDir}`);
  }
});

// Hàm tìm kiếm ảnh cho bất kỳ shop nào được cấu hình autoImageFolder
const findShopImage = (shopId, numberSku, productType) => {
  if (!shopId || !numberSku || !productType) return null;

  const shop = shopsConfig.find(s => s.id.toUpperCase() === shopId.toUpperCase());
  if (!shop || !shop.autoImageFolder) return null;

  const skuPrefix = (shop.skuPrefix || '').trim().toUpperCase();
  const cleanNumber = numberSku.trim();
  let cleanType = productType.trim().toUpperCase();
  if (cleanType === 'WWRE' || cleanType === 'KWRE') {
    cleanType = 'WRES';
  }
  
  const shopDirName = `${shop.id.toLowerCase()}_images`;
  const shopImagesDir = path.join(__dirname, shopDirName);

  try {
    if (!fs.existsSync(shopImagesDir)) return null;

    const items = fs.readdirSync(shopImagesDir);
    for (const item of items) {
      const itemPath = path.join(shopImagesDir, item);
      const stat = fs.statSync(itemPath);

      if (stat.isDirectory()) {
        const targetSuffix = `${skuPrefix}${cleanNumber}`.toUpperCase();
        if (item.toUpperCase().endsWith(targetSuffix)) {
          const typePath = path.join(itemPath, cleanType);
          if (fs.existsSync(typePath) && fs.statSync(typePath).isDirectory()) {
            const files = fs.readdirSync(typePath);
            const imageExtensions = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];
            
            // Xác định hậu tố của ảnh được ưu tiên (FSHO: 01, còn lại: 02)
            const preferredSuffix = cleanType === 'FSHO' ? '01' : '02';
            
            // 1. Tìm ảnh khớp với hậu tố ưu tiên (ví dụ FSHO-01.jpg hoặc LSRG-02.jpg)
            let imageFile = files.find(file => {
              const ext = path.extname(file).toLowerCase();
              if (!imageExtensions.includes(ext)) return false;
              const nameWithoutExt = path.basename(file, ext).toUpperCase();
              return nameWithoutExt.endsWith(`-${preferredSuffix}`) || nameWithoutExt.includes(preferredSuffix);
            });
            
            // 2. Nếu không tìm thấy ảnh có hậu tố ưu tiên, lấy ảnh hợp lệ đầu tiên làm fallback
            if (!imageFile) {
              imageFile = files.find(file => {
                return imageExtensions.includes(path.extname(file).toLowerCase());
              });
            }

            if (imageFile) {
              return `/${shopDirName}/${item}/${cleanType}/${imageFile}`;
            }
          }
        }
      }
    }
  } catch (e) {
    console.error(`Lỗi khi quét thư mục ảnh cho shop ${shopId}:`, e);
  }
  return null;
};


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

// 0.5. Lấy danh sách các shop cấu hình trong hệ thống
app.get('/api/shops', (req, res) => {
  res.json({ success: true, data: shopsConfig });
});

// 0.6. Tìm kiếm ảnh cho shop dựa theo ID shop, numberSku và productType
const handleShopImageRequest = (req, res) => {
  const { shop, numberSku, productType } = req.query;
  const targetShop = shop || 'SDR'; // Fallback nếu không truyền shop
  try {
    const imageUrl = findShopImage(targetShop, numberSku, productType);
    res.json({ success: true, imageUrl });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
app.get('/api/shop-image', handleShopImageRequest);
app.get('/api/sdr-image', handleShopImageRequest);

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
  const { imageUrl, shop } = req.body;
  if (!imageUrl) {
    return res.status(400).json({ error: 'Vui lòng cung cấp hình ảnh thiết kế cần tìm.' });
  }

  try {
    const results = await vectorSearch.searchSimilarProducts(db, imageUrl, 10, shop);
    res.json({ data: results });
  } catch (error) {
    console.error('Lỗi khi tìm kiếm bằng ảnh:', error.message);
    res.status(500).json({ error: error.message || 'Lỗi hệ thống khi xử lý tìm kiếm ảnh.' });
  }
});

// 2. Nhập kho (Tạo sản phẩm mới)
app.post('/api/inventory/import', (req, res) => {
  let { sku, location, shop, numberSku, productType, size, imageUrl } = req.body;
  
  // Lấy cấu hình shop để validation động
  const shopObj = shopsConfig.find(s => s.id === shop);
  if (shopObj) {
    if (shopObj.requireCamera && !imageUrl) {
      return res.status(400).json({ error: `Shop ${shop} yêu cầu phải có ảnh.` });
    }
    if (shopObj.id === 'BATT-BFG' && !location) {
      return res.status(400).json({ error: 'Shop BATT-BFG yêu cầu phải có vị trí (location).' });
    }
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

  // Tự động tìm kiếm ảnh từ thư mục nếu được cấu hình autoImageFolder
  if (shopObj && shopObj.autoImageFolder && (!imageUrl || imageUrl === '')) {
    const matchedImg = findShopImage(shop, numberSku, productType);
    if (matchedImg) {
      imageUrl = matchedImg;
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

// 2.5. Đồng bộ hóa toàn bộ ảnh của các shop có autoImageFolder với thư mục ảnh tương ứng
const handleSyncShopImages = (req, res) => {
  const autoShops = shopsConfig.filter(s => s.autoImageFolder).map(s => s.id);
  
  if (autoShops.length === 0) {
    return res.json({ message: 'Không có shop nào cấu hình tự động quét ảnh.', updatedCount: 0 });
  }

  const placeholders = autoShops.map(() => '?').join(',');
  const queryStr = `SELECT * FROM products WHERE shop IN (${placeholders}) AND (status = 'IN_STOCK' OR status = 'PENDING')`;

  db.all(queryStr, autoShops, async (err, products) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }

    if (!products || products.length === 0) {
      return res.json({ message: 'Không có sản phẩm nào cần đồng bộ.', updatedCount: 0 });
    }

    let updatedCount = 0;
    const now = new Date().toISOString();

    for (const product of products) {
      const matchedImg = findShopImage(product.shop, product.numberSku, product.productType);
      
      // Nếu tìm thấy ảnh mới và ảnh này khác ảnh hiện tại trong db
      if (matchedImg && matchedImg !== product.imageUrl) {
        try {
          await new Promise((resolve, reject) => {
            db.run("UPDATE products SET imageUrl = ?, updatedAt = ? WHERE id = ?", [matchedImg, now, product.id], function(updateErr) {
              if (updateErr) reject(updateErr);
              else resolve();
            });
          });
          
          updatedCount++;

          // Cập nhật Vector Index cho sản phẩm này
          vectorSearch.indexProduct(db, product.id, matchedImg);
          
          // Phát tin realtime
          io.emit('inventory_updated', { 
            type: 'UPDATE_IMAGE', 
            product: { ...product, imageUrl: matchedImg, updatedAt: now } 
          });
        } catch (e) {
          console.error(`Lỗi đồng bộ ảnh cho sản phẩm ID ${product.id}:`, e);
        }
      } else {
        // Nếu không tìm thấy ảnh khớp mới hoặc giữ nguyên, kiểm tra xem ảnh hiện tại trong DB có tồn tại trên đĩa không
        if (product.imageUrl && product.imageUrl.trim() !== '') {
          const absoluteImagePath = path.join(__dirname, product.imageUrl);
          if (!fs.existsSync(absoluteImagePath)) {
            console.warn(`[Sync] Không tìm thấy ảnh tại ${absoluteImagePath} cho SKU ${product.sku}. Đang xóa link ảnh lỗi khỏi database.`);
            try {
              await new Promise((resolve, reject) => {
                db.run("UPDATE products SET imageUrl = '', embedding = NULL, updatedAt = ? WHERE id = ?", [now, product.id], function(updateErr) {
                  if (updateErr) reject(updateErr);
                  else resolve();
                });
              });
              
              // Phát tin realtime để UI cập nhật (xóa ảnh xem trước)
              io.emit('inventory_updated', { 
                type: 'UPDATE_IMAGE', 
                product: { ...product, imageUrl: '', embedding: null, updatedAt: now } 
              });
            } catch (e) {
              console.error(`Lỗi dọn dẹp ảnh lỗi cho sản phẩm ID ${product.id}:`, e);
            }
          }
        }
      }
    }

    res.json({ message: `Đồng bộ hoàn tất. Đã cập nhật ảnh cho ${updatedCount} sản phẩm.`, updatedCount });
  });
};

app.post('/api/inventory/sync-shop-images', handleSyncShopImages);
app.post('/api/inventory/sync-sdr-images', handleSyncShopImages);

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
  db.all("SELECT logs.*, products.imageUrl FROM logs LEFT JOIN products ON logs.productId = products.id ORDER BY logs.createdAt DESC", [], (err, rows) => {
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

// 5.5. Lấy lịch sử in tem nhãn gom nhóm theo lượt in (createdAt)
app.get('/api/inventory/print-history', (req, res) => {
  const query = `
    SELECT createdAt, details, GROUP_CONCAT(productId) as productIds
    FROM logs
    WHERE actionType = 'PRINT'
    GROUP BY createdAt, details
    ORDER BY createdAt DESC
    LIMIT 30
  `;
  db.all(query, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    
    const allIds = new Set();
    rows.forEach(r => {
      if (r.productIds) {
        r.productIds.split(',').forEach(id => {
          if (id) allIds.add(Number(id));
        });
      }
    });
    
    if (allIds.size === 0) {
      return res.json({ data: [] });
    }
    
    const idList = Array.from(allIds);
    const placeholders = idList.map(() => '?').join(',');
    db.all(`SELECT * FROM products WHERE id IN (${placeholders})`, idList, (prodErr, products) => {
      if (prodErr) return res.status(500).json({ error: prodErr.message });
      
      const productMap = {};
      products.forEach(p => {
        productMap[p.id] = p;
      });
      
      const batches = rows.map(row => {
        const ids = row.productIds ? row.productIds.split(',').map(Number) : [];
        const batchProducts = ids.map(id => productMap[id]).filter(Boolean);
        return {
          createdAt: row.createdAt,
          details: row.details,
          products: batchProducts
        };
      }).filter(b => b.products.length > 0);
      
      res.json({ data: batches });
    });
  });
});

// 5.6. Hoàn tác in tem nhãn (Đưa các sản phẩm quay lại hàng chờ in)
app.post('/api/inventory/revert-printed', (req, res) => {
  const { ids } = req.body;
  if (!ids || !Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: 'Cần cung cấp mảng ID sản phẩm.' });
  }
  const placeholders = ids.map(() => '?').join(',');
  const query = `UPDATE products SET isPrinted = 0 WHERE id IN (${placeholders})`;
  db.run(query, ids, function(err) {
    if (err) return res.status(500).json({ error: err.message });
    
    const now = new Date().toISOString();
    db.all(`SELECT * FROM products WHERE id IN (${placeholders})`, ids, (selectErr, products) => {
      if (!selectErr && products) {
        db.serialize(() => {
          const logStmt = db.prepare("INSERT INTO logs (actionType, productId, sku, location, shop, details, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)");
          products.forEach(p => {
            logStmt.run(['PRINT_REVERT', p.id, p.sku, p.location, p.shop, 'Đưa lại vào danh sách chờ in tem', now]);
          });
          logStmt.finalize();
        });
      }
    });
    
    res.json({ message: 'Đã đưa sản phẩm quay lại hàng chờ in thành công.', updated: this.changes });
  });
});

// 7. Lấy danh sách máy in trong hệ thống
app.get('/api/printers', async (req, res) => {
  try {
    const printers = await getPrinters();
    res.json({ data: printers, current: PRINTER_CONFIG.printerName });
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
    const targetPrinter = printerName || PRINTER_CONFIG.printerName;
    const targetWidth = pageWidth ? Number(pageWidth) : PRINTER_CONFIG.pageWidth;
    const targetHeight = pageHeight ? Number(pageHeight) : PRINTER_CONFIG.pageHeight;
    const targetOrientation = orientation || PRINTER_CONFIG.orientation;

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
      const targetPrinter = printerName || PRINTER_CONFIG.printerName;
      const targetWidth = pageWidth ? Number(pageWidth) : PRINTER_CONFIG.pageWidth;
      const targetHeight = pageHeight ? Number(pageHeight) : PRINTER_CONFIG.pageHeight;
      const targetOrientation = orientation || PRINTER_CONFIG.orientation;

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
      const targetWidth = pageWidth ? Number(pageWidth) : PRINTER_CONFIG.pageWidth;
      const targetHeight = pageHeight ? Number(pageHeight) : PRINTER_CONFIG.pageHeight;
      const targetOrientation = orientation || PRINTER_CONFIG.orientation;

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

// 8.8 Cập nhật trực tiếp hình ảnh sản phẩm
app.post('/api/inventory/update-image', (req, res) => {
  let { id, imageUrl } = req.body;
  if (!id) {
    return res.status(400).json({ error: 'Cần cung cấp ID sản phẩm.' });
  }
  if (!imageUrl) {
    return res.status(400).json({ error: 'Cần cung cấp hình ảnh sản phẩm.' });
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
        const filename = `${Date.now()}_update_${Math.random().toString(36).slice(2)}.${imageExtension}`;
        const filepath = path.join(uploadsDir, filename);
        fs.writeFileSync(filepath, buffer);
        
        // Cập nhật imageUrl thành đường dẫn relative
        imageUrl = `/uploads/${filename}`;
      }
    } catch (e) {
      console.error('Lỗi khi lưu ảnh ra file:', e);
      return res.status(500).json({ error: 'Lỗi khi lưu hình ảnh trên server.' });
    }
  }

  db.run("UPDATE products SET imageUrl = ?, updatedAt = ? WHERE id = ?", [imageUrl, now, id], function(err) {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    if (this.changes === 0) {
      return res.status(404).json({ error: 'Không tìm thấy sản phẩm.' });
    }

    db.get("SELECT * FROM products WHERE id = ?", [id], (getErr, row) => {
      if (!getErr && row) {
        // Ghi nhật ký thao tác
        db.run("INSERT INTO logs (actionType, productId, sku, location, shop, details, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)",
          ['UPDATE_IMAGE', row.id, row.sku, row.location, row.shop, 'Cập nhật trực tiếp hình ảnh sản phẩm', now]
        );
        // Gửi sự kiện realtime cho các client khác cập nhật danh sách
        io.emit('inventory_updated', { type: 'UPDATE_IMAGE', product: row });
        
        // Lập chỉ mục vector cho sản phẩm mới có ảnh
        vectorSearch.indexProduct(db, row.id, imageUrl);
      }
      res.json({ message: 'Cập nhật hình ảnh thành công.', data: row });
    });
  });
});

// --- APIS CẤU HÌNH MÁY IN ---
// Lấy cấu hình máy in hiện tại
app.get('/api/settings/printer', (req, res) => {
  res.json({
    printerName: PRINTER_CONFIG.printerName,
    pageWidth: PRINTER_CONFIG.pageWidth,
    pageHeight: PRINTER_CONFIG.pageHeight,
    orientation: PRINTER_CONFIG.orientation
  });
});

// Lưu cấu hình máy in mới
app.post('/api/settings/printer', (req, res) => {
  const { printerName, pageWidth, pageHeight, orientation } = req.body;
  
  if (printerName !== undefined) PRINTER_CONFIG.printerName = printerName;
  if (pageWidth !== undefined) PRINTER_CONFIG.pageWidth = Number(pageWidth);
  if (pageHeight !== undefined) PRINTER_CONFIG.pageHeight = Number(pageHeight);
  if (orientation !== undefined) PRINTER_CONFIG.orientation = orientation;
  
  try {
    fs.writeFileSync(configPath, JSON.stringify(PRINTER_CONFIG, null, 2));
    
    // Phát tin báo cấu hình máy in thay đổi
    io.emit('printer_settings_updated', PRINTER_CONFIG);
    
    console.log(`[Printer Config] Đã cập nhật cấu hình:`, PRINTER_CONFIG);
    res.json({ success: true, message: 'Đã lưu cấu hình máy in thành công.', ...PRINTER_CONFIG });
  } catch (err) {
    res.status(500).json({ error: `Lỗi lưu file cấu hình: ${err.message}` });
  }
});

// --- SOCKET.IO ---
io.on('connection', (socket) => {
  console.log('Có client kết nối:', socket.id);
  
  // Gửi cấu hình máy in và trạng thái Firebase cho client kết nối
  const firebaseListener = require('./firebaseListener');
  socket.emit('firebase_status', firebaseListener.getStatus());
  socket.emit('printer_settings_updated', PRINTER_CONFIG);
  
  socket.on('disconnect', () => {
    console.log('Client ngắt kết nối:', socket.id);
  });
});

// --- LOGIC IN ĐƠN TỰ ĐỘNG QUA FIREBASE ---
const printOrderLabels = async (orders) => {
  if (!orders || !Array.isArray(orders) || orders.length === 0) return;
  
  console.log(`[Printer] Bắt đầu xử lý in ${orders.length} nhãn đơn hàng...`);
  
  try {
    const MM = 2.8346;
    const PAGE_W = (Number(PRINTER_CONFIG.pageWidth) || 100) * MM;
    const PAGE_H = (Number(PRINTER_CONFIG.pageHeight) || 150) * MM;
    const PAD = 8 * MM;
    
    const pdfPath = path.join(TEMP_DIR, `orders_${Date.now()}.pdf`);
    const doc = new PDFDocument({ size: [PAGE_W, PAGE_H], margin: 0, autoFirstPage: false });
    const writeStream = fs.createWriteStream(pdfPath);
    doc.pipe(writeStream);
    
    for (const order of orders) {
      doc.addPage();
      
      // 1. Vẽ Ngày tháng ở góc trên bên phải
      doc.font('Helvetica-Bold').fontSize(10).fillColor('black')
        .text(order.date || '', PAGE_W - PAD - 100, PAD, { width: 100, align: 'right' });
        
      // 2. Vẽ Barcode của trackingId (dùng bwip-js)
      try {
        const barcodeBuffer = await bwipjs.toBuffer({
          bcid: 'code128',
          text: order.trackingId || 'N/A',
          scale: 3,
          height: 10,
          includetext: false
        });
        doc.image(barcodeBuffer, PAD, PAD + 5 * MM, { width: 48 * MM, height: 12 * MM });
      } catch (barErr) {
        console.error(`[Printer] Không thể tạo barcode cho trackingId: ${order.trackingId}`, barErr.message);
      }
      
      // 3. Vẽ QR Code của trackingId
      try {
        const qrBuffer = await QRCode.toBuffer(order.trackingId || 'N/A', {
          type: 'png',
          width: 150,
          margin: 0,
          color: { dark: '#000000', light: '#FFFFFF' }
        });
        doc.image(qrBuffer, PAGE_W - PAD - 15 * MM, PAD + 5 * MM, { width: 15 * MM, height: 15 * MM });
      } catch (qrErr) {
        console.error(`[Printer] Không thể tạo QR code cho trackingId: ${order.trackingId}`, qrErr.message);
      }
      
      // 4. Vẽ chữ Tracking
      doc.font('Helvetica-Bold').fontSize(11).fillColor('black')
        .text(`Tracking: ${order.trackingId || ''}`, PAD, PAD + 20 * MM, { width: PAGE_W - (PAD * 2) });
        
      // 5. Vẽ chữ Order ID
      if (order.orderId) {
        doc.font('Helvetica-Bold').fontSize(10).fillColor('black')
          .text(`Order ID: ${order.orderId}`, PAD, PAD + 25 * MM, { width: PAGE_W - (PAD * 2) });
      }
      
      // 6. Vẽ khung hộp sản phẩm
      const boxX = PAD;
      const boxY = PAD + 31 * MM;
      const boxW = PAGE_W - (PAD * 2);
      const boxH = PAGE_H - boxY - PAD;
      
      // Vẽ viền hộp (đường đứt nét giống dashed border)
      doc.rect(boxX, boxY, boxW, boxH).dash(4, { space: 4 }).stroke();
      doc.undash(); // Khôi phục nét liền cho các thành phần khác
      
      // Tiêu đề khung
      doc.font('Helvetica-Bold').fontSize(10).fillColor('black')
        .text('PRODUCT', boxX + 4 * MM, boxY + 4 * MM);
        
      // Nội dung danh sách sản phẩm
      let currentY = boxY + 10 * MM;
      if (Array.isArray(order.productItems) && order.productItems.length > 0) {
        for (const item of order.productItems) {
          const nameText = item.name || '';
          const qtyText = item.quantity > 1 ? `x${item.quantity}` : '';
          
          // Vẽ tên sản phẩm (căn trái)
          doc.font('Helvetica-Bold').fontSize(11).fillColor('black')
            .text(nameText, boxX + 4 * MM, currentY, { width: boxW - 14 * MM });
            
          // Vẽ số lượng sản phẩm (căn phải)
          if (qtyText) {
            doc.font('Helvetica-Bold').fontSize(11).fillColor('black')
              .text(qtyText, boxX + boxW - 10 * MM, currentY, { width: 6 * MM, align: 'right' });
          }
          
          currentY += 7 * MM; // Khoảng cách dòng
        }
      } else {
        // Fallback nếu không có productItems
        doc.font('Helvetica-Bold').fontSize(10).fillColor('black')
          .text(order.product || '', boxX + 4 * MM, boxY + 10 * MM, { width: boxW - 8 * MM });
      }
    }
    doc.end();
    
    writeStream.on('finish', async () => {
      try {
        console.log(`[Printer] Đang gửi lệnh in ${orders.length} nhãn tới máy in: ${PRINTER_CONFIG.printerName}...`);
        await print(pdfPath, {
          printer: PRINTER_CONFIG.printerName,
          silent: true,
          scale: 'noscale',
          orientation: PRINTER_CONFIG.orientation || 'portrait'
        });
        console.log(`[Printer] Đã gửi lệnh in thành công.`);
        
        // Ghi nhật ký vào SQLite & Phát tin in ấn realtime cho các Frontend đang mở tab Giám sát
        db.serialize(() => {
          const logStmt = db.prepare("INSERT INTO logs (actionType, shop, details, createdAt) VALUES (?, ?, ?, ?)");
          const printTime = new Date().toISOString();
          
          orders.forEach(order => {
            logStmt.run(['ORDER_PRINT', order.importSheetType || 'N/A', `In tự động đơn hàng #${order.orderId} (Tracking: ${order.trackingId})`, printTime]);
            
            // Bắn tin socket để frontend cập nhật màn hình Console giám sát in lập tức
            io.emit('order_printed', {
              timestamp: Date.now(),
              orderId: order.orderId,
              trackingId: order.trackingId,
              shop: order.importSheetType || 'N/A',
              details: `Đã in tự động đơn hàng #${order.orderId}`
            });
          });
          logStmt.finalize();
        });
        
        // Xoá file tạm sau 10 giây
        setTimeout(() => { try { fs.unlinkSync(pdfPath); } catch(_) {} }, 10000);
      } catch (printErr) {
        console.error(`[Printer] Lỗi máy in khi in đơn hàng:`, printErr.message);
      }
    });
    
    writeStream.on('error', (e) => {
      console.error(`[Printer] Lỗi ghi file PDF đơn hàng:`, e.message);
    });
  } catch (e) {
    console.error(`[Printer] Lỗi xử lý tạo PDF đơn hàng:`, e.message);
  }
};

// --- START SERVER ---
const PORT = process.env.PORT || 3001;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server Backend (API & Realtime) đang chạy tại http://localhost:${PORT}`);
  // Khởi tạo vector search model và chạy tự động indexing
  vectorSearch.init(db);
  
  // Khởi chạy bộ lắng nghe in đơn tự động qua Firebase
  const firebaseListener = require('./firebaseListener');
  firebaseListener.init(printOrderLabels);
  
  // Phát tin trạng thái Firebase thay đổi tới toàn bộ client
  firebaseListener.onStatusChange((status, message) => {
    io.emit('firebase_status', { status, message });
  });
});