const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(__dirname, 'inventory.db');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Lỗi khi kết nối với database SQLite:', err.message);
  } else {
    console.log('Đã kết nối với database SQLite.');
  }
});

// Khởi tạo bảng với id là số nguyên tự tăng
const initDb = () => {
  db.serialize(() => {
    // Kiểm tra xem bảng products đã tồn tại chưa và kiểu id là gì
    db.get(`SELECT sql FROM sqlite_master WHERE type='table' AND name='products'`, (err, row) => {
      if (err) {
        console.error('Lỗi kiểm tra bảng:', err.message);
        return;
      }

      const needsMigration = row && row.sql && row.sql.includes('id TEXT');

      if (needsMigration) {
        console.log('Phát hiện schema cũ (id TEXT), đang migration sang INTEGER AUTOINCREMENT...');
        db.serialize(() => {
          // Đổi tên bảng cũ
          db.run(`ALTER TABLE products RENAME TO products_old`, (err) => {
            if (err) { console.error('Lỗi đổi tên bảng cũ:', err.message); return; }

            // Tạo bảng mới với id INTEGER AUTOINCREMENT
            db.run(`
              CREATE TABLE products (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                sku TEXT NOT NULL,
                location TEXT,
                shop TEXT NOT NULL,
                numberSku TEXT,
                productType TEXT,
                size TEXT,
                imageUrl TEXT,
                status TEXT DEFAULT 'IN_STOCK',
                isPrinted INTEGER DEFAULT 0,
                orderId TEXT,
                createdAt TEXT,
                updatedAt TEXT
              )
            `, (err) => {
              if (err) { console.error('Lỗi tạo bảng mới:', err.message); return; }

              // Copy toàn bộ dữ liệu cũ sang bảng mới (id sẽ được gán tự động)
              db.run(`
                INSERT INTO products (sku, location, shop, numberSku, productType, size, imageUrl, status, isPrinted, createdAt, updatedAt)
                SELECT sku, location, shop, numberSku, productType, size, imageUrl, status, isPrinted, createdAt, updatedAt
                FROM products_old
              `, (err) => {
                if (err) { console.error('Lỗi copy dữ liệu:', err.message); return; }

                // Xoá bảng cũ
                db.run(`DROP TABLE products_old`, (err) => {
                  if (err) { console.error('Lỗi xoá bảng cũ:', err.message); return; }
                  console.log('Migration hoàn tất! ID đã chuyển sang INTEGER AUTOINCREMENT.');
                });
              });
            });
          });
        });
      } else if (!row) {
        // Bảng chưa tồn tại, tạo mới với schema đúng
        db.run(`
          CREATE TABLE IF NOT EXISTS products (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            sku TEXT NOT NULL,
            location TEXT,
            shop TEXT NOT NULL,
            numberSku TEXT,
            productType TEXT,
            size TEXT,
            imageUrl TEXT,
            status TEXT DEFAULT 'IN_STOCK',
            isPrinted INTEGER DEFAULT 0,
            orderId TEXT,
            embedding TEXT,
            createdAt TEXT,
            updatedAt TEXT
          )
        `, (err) => {
          if (err) console.error('Lỗi tạo bảng:', err.message);
          else console.log('Đã tạo bảng products với id INTEGER AUTOINCREMENT.');
        });
      } else {
        console.log('Schema đã đúng (id INTEGER AUTOINCREMENT), không cần migration.');
        if (row && row.sql && !row.sql.includes('orderId')) {
          console.log('Phát hiện thiếu cột orderId, tiến hành thêm cột...');
          db.run(`ALTER TABLE products ADD COLUMN orderId TEXT`, (alterErr) => {
            if (alterErr) {
              console.error('Lỗi khi thêm cột orderId:', alterErr.message);
            } else {
              console.log('Thêm cột orderId thành công!');
            }
          });
        }
        if (row && row.sql && !row.sql.includes('embedding')) {
          console.log('Phát hiện thiếu cột embedding, tiến hành thêm cột...');
          db.run(`ALTER TABLE products ADD COLUMN embedding TEXT`, (alterErr) => {
            if (alterErr) {
              console.error('Lỗi khi thêm cột embedding:', alterErr.message);
            } else {
              console.log('Thêm cột embedding thành công!');
            }
          });
        }
      }
    });

    // Tạo bảng logs nếu chưa tồn tại để lưu vết thao tác
    db.run(`
      CREATE TABLE IF NOT EXISTS logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        actionType TEXT NOT NULL,
        productId INTEGER,
        sku TEXT,
        location TEXT,
        shop TEXT,
        details TEXT,
        createdAt TEXT NOT NULL
      )
    `, (err) => {
      if (err) {
        console.error('Lỗi tạo bảng logs:', err.message);
      } else {
        console.log('Đã khởi tạo bảng logs.');
        // Kiểm tra xem có cần seed không
        db.get("SELECT COUNT(*) as count FROM logs", [], (countErr, countRow) => {
          if (!countErr && countRow && countRow.count === 0) {
            console.log('Bảng logs trống, đang seed dữ liệu lịch sử từ bảng products...');
            db.serialize(() => {
              // Seed EXPORT
              db.run(`
                INSERT INTO logs (actionType, productId, sku, location, shop, details, createdAt)
                SELECT 'EXPORT', id, sku, location, shop, 'Xuất kho sản phẩm', IFNULL(updatedAt, datetime('now', 'localtime'))
                FROM products WHERE status = 'EXPORTED'
              `);
              // Seed PENDING
              db.run(`
                INSERT INTO logs (actionType, productId, sku, location, shop, details, createdAt)
                SELECT 'MARK_PENDING', id, sku, location, shop, 'Gán đơn hàng: ' || IFNULL(orderId, 'N/A'), IFNULL(updatedAt, datetime('now', 'localtime'))
                FROM products WHERE status = 'PENDING'
              `);
              // Seed PRINT
              db.run(`
                INSERT INTO logs (actionType, productId, sku, location, shop, details, createdAt)
                SELECT 'PRINT', id, sku, location, shop, 'Đã in tem nhãn', IFNULL(updatedAt, datetime('now', 'localtime'))
                FROM products WHERE isPrinted = 1
              `);
            });
          }
        });
      }
    });
  });
};

initDb();

module.exports = db;
