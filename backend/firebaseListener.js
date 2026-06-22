const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

let firebaseStatus = 'NOT_CONFIGURED'; // 'CONNECTED', 'NOT_CONFIGURED', 'ERROR'
let statusMessage = 'Chưa cấu hình file serviceAccountKey.json thật.';
let onStatusChangeCallback = null;

function setStatus(status, message = '') {
  if (firebaseStatus !== status || statusMessage !== message) {
    firebaseStatus = status;
    statusMessage = message;
    console.log(`[Firebase Listener] Trạng thái thay đổi: ${firebaseStatus} - ${statusMessage}`);
    if (typeof onStatusChangeCallback === 'function') {
      onStatusChangeCallback(firebaseStatus, statusMessage);
    }
  }
}

function getStatus() {
  return { status: firebaseStatus, message: statusMessage };
}

function onStatusChange(callback) {
  onStatusChangeCallback = callback;
}

/**
 * Khởi tạo bộ lắng nghe các lô in đơn mới từ Firestore
 * @param {Function} printCallback - Hàm callback xử lý in danh sách đơn hàng
 */
function initFirebaseListener(printCallback) {
  const keyPath = path.resolve(__dirname, 'serviceAccountKey.json');
  let ready = false;

  if (fs.existsSync(keyPath)) {
    try {
      const serviceAccount = require(keyPath);
      if (serviceAccount.private_key && 
          serviceAccount.private_key.includes('BEGIN PRIVATE KEY') && 
          !serviceAccount.private_key.includes('YOUR_PRIVATE_KEY')) {
        admin.initializeApp({
          credential: admin.credential.cert(serviceAccount)
        });
        ready = true;
        setStatus('CONNECTED', 'Đang hoạt động (Firebase Admin SDK kết nối thành công).');
      } else {
        setStatus('NOT_CONFIGURED', 'Chưa cấu hình khóa private key thật trong serviceAccountKey.json.');
        console.warn('[Firebase Listener] File serviceAccountKey.json hiện tại chưa được cấu hình khóa thật. Vui lòng ghi đè thông tin khóa của bạn vào file này.');
      }
    } catch (error) {
      setStatus('ERROR', `Lỗi khi đọc file khóa: ${error.message}`);
      console.error('[Firebase Listener] Lỗi khởi tạo Firebase Admin SDK:', error.message);
    }
  } else {
    setStatus('NOT_CONFIGURED', 'Không tìm thấy file cấu hình serviceAccountKey.json.');
    console.warn('[Firebase Listener] Không tìm thấy file serviceAccountKey.json. Tính năng in tự động qua Firebase sẽ tạm tắt.');
  }

  if (!ready) {
    return;
  }

  try {
    const db = admin.firestore();
    // Lấy mốc thời gian khởi động (trừ đi 5 giây để tránh sai lệch nhỏ giữa client/server)
    const startupTime = Date.now() - 5000;
    console.log(`[Firebase Listener] Đang lắng nghe các lệnh in đơn mới (createdAt >= ${startupTime})...`);

    db.collection('print_batches')
      .where('createdAt', '>=', startupTime)
      .onSnapshot((snapshot) => {
        setStatus('CONNECTED', 'Đang hoạt động (Đang kết nối Firestore và lắng nghe lệnh in).');
        snapshot.docChanges().forEach((change) => {
          if (change.type === 'added') {
            const batchData = change.doc.data();
            
            if (batchData.printedViaBrowser === true) {
              console.log(`[Firebase Listener] Bỏ qua in tự động cho lô in ID=${change.doc.id} (Được in thủ công qua trình duyệt).`);
              return;
            }

            console.log(`[Firebase Listener] Nhận lô in mới: ID=${change.doc.id}, Số đơn=${batchData.orderCount || 0}`);
            
            if (Array.isArray(batchData.orders) && batchData.orders.length > 0) {
              printCallback(batchData.orders);
            } else {
              console.log(`[Firebase Listener] Lô in rỗng hoặc không chứa thông tin chi tiết đơn.`);
            }
          }
        });
      }, (error) => {
        setStatus('ERROR', `Lỗi kết nối Firestore: ${error.message}`);
        console.error('[Firebase Listener] Lỗi lắng nghe Firestore print_batches:', error.message);
      });
  } catch (dbError) {
    setStatus('ERROR', `Lỗi khởi tạo database: ${dbError.message}`);
    console.error('[Firebase Listener] Lỗi khi tạo thực thể Firestore:', dbError.message);
  }
}

module.exports = { 
  init: initFirebaseListener,
  getStatus,
  onStatusChange
};
