const path = require('path');
const fs = require('fs');
const sharp = require('sharp');

// Load environment variables from .env
require('dotenv').config();

let CLIPVisionModelWithProjection;
let AutoProcessor;
let RawImage;
let env;

let model = null;
let processor = null;
let isInitializing = false;
let isReady = false;

// Cấu hình thư mục chứa model cục bộ và cache
const LOCAL_MODEL_DIR = path.resolve(__dirname, 'models');
const MODEL_NAME = 'Xenova/clip-vit-base-patch32';
const CACHE_DIR = path.resolve(__dirname, '.cache');

// Hàm chuẩn bị thư viện Transformers.js
async function initTransformers() {
  try {
    const transformers = await import('@xenova/transformers');
    CLIPVisionModelWithProjection = transformers.CLIPVisionModelWithProjection;
    AutoProcessor = transformers.AutoProcessor;
    RawImage = transformers.RawImage;
    env = transformers.env;

    // Cấu hình cache thư mục
    env.cacheDir = CACHE_DIR;

    // Kiểm tra xem model đã được tải về thư mục cục bộ chưa
    const localModelPath = path.join(LOCAL_MODEL_DIR, MODEL_NAME.replace('/', path.sep));
    if (fs.existsSync(localModelPath)) {
      console.log(`[Vector Search] Phát hiện model cục bộ tại: ${localModelPath}. Chuyển sang chế độ OFFLINE.`);
      env.localModelPath = LOCAL_MODEL_DIR;
      env.allowLocalModels = true;
      env.allowRemoteModels = false;
    } else {
      console.log(`[Vector Search] Không thấy model cục bộ. Sẽ tải từ Hugging Face (Sử dụng HF_TOKEN nếu có).`);
      env.allowLocalModels = true;
      env.allowRemoteModels = true;
    }
  } catch (error) {
    console.error('[Vector Search] Không thể khởi tạo thư viện Transformers.js:', error.message);
    throw error;
  }
}

// Khởi tạo Model CLIP
async function init(dbInstance) {
  if (isReady || isInitializing) return;
  isInitializing = true;
  
  try {
    await initTransformers();

    console.log('[Vector Search] Đang tải Model CLIP ViT-B-32 vào RAM (việc này có thể mất vài phút trong lần chạy đầu tiên)...');
    
    // Tải vision model và processor
    model = await CLIPVisionModelWithProjection.from_pretrained(MODEL_NAME);
    processor = await AutoProcessor.from_pretrained(MODEL_NAME);
    
    isReady = true;
    isInitializing = false;
    console.log('[Vector Search] Model CLIP đã được nạp thành công vào RAM và sẵn sàng hoạt động!');

    // Chạy đồng bộ hóa các ảnh chưa có embedding trong Database
    if (dbInstance) {
      // Chạy ở chế độ background để không block tiến trình khởi động server
      syncMissingEmbeddings(dbInstance).catch(err => {
        console.error('[Vector Search] Lỗi khi tự động đồng bộ hóa index:', err.message);
      });
    }
  } catch (error) {
    isInitializing = false;
    console.error('[Vector Search] Lỗi nghiêm trọng khi khởi tạo model:', error.message);
    console.error('[Vector Search] HƯỚNG DẪN TẢI THỦ CÔNG: Nếu không tải được model từ Hugging Face, bạn có thể tải các file sau và đặt vào thư mục backend/models/Xenova/clip-vit-base-patch32:');
    console.error(` - https://huggingface.co/Xenova/clip-vit-base-patch32/resolve/main/config.json`);
    console.error(` - https://huggingface.co/Xenova/clip-vit-base-patch32/resolve/main/preprocessor_config.json`);
    console.error(` - https://huggingface.co/Xenova/clip-vit-base-patch32/resolve/main/onnx/vision_model_quantized.onnx`);
  }
}

// L2 Normalize một Vector
function l2Normalize(vec) {
  const norm = Math.sqrt(vec.reduce((sum, val) => sum + val * val, 0));
  return norm === 0 ? vec : vec.map(val => val / norm);
}

// Tính Cosine Similarity (Dot product của 2 vector đã normalize)
function cosineSimilarity(vecA, vecB) {
  return vecA.reduce((sum, val, i) => sum + val * vecB[i], 0);
}

// Chuyển đổi đầu vào ảnh thành RawImage của Transformers.js sử dụng sharp
async function loadRawImage(imageInput) {
  let buffer;
  if (typeof imageInput === 'string') {
    if (imageInput.startsWith('data:image/')) {
      // Xử lý ảnh base64 gửi từ frontend
      const matches = imageInput.match(/^data:[A-Za-z-+\/]+;base64,(.+)$/);
      if (!matches || matches.length !== 2) {
        throw new Error('Định dạng ảnh Base64 không hợp lệ.');
      }
      buffer = Buffer.from(matches[1], 'base64');
    } else {
      // Đường dẫn file vật lý trên đĩa
      if (!fs.existsSync(imageInput)) {
        throw new Error(`Không tìm thấy file ảnh tại đường dẫn: ${imageInput}`);
      }
      buffer = await fs.promises.readFile(imageInput);
    }
  } else if (Buffer.isBuffer(imageInput)) {
    buffer = imageInput;
  } else {
    throw new Error('Đầu vào hình ảnh không hợp lệ.');
  }

  // Dùng sharp để resize sang 224x224, convert sang 3 channels (RGB) và xuất buffer raw
  const { data, info } = await sharp(buffer)
    .resize(224, 224, { fit: 'fill' })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  return new RawImage(new Uint8Array(data), info.width, info.height, 3);
}

// Trích xuất vector đặc trưng từ ảnh (Trả về mảng 512 số float đã được L2 normalized)
async function getEmbedding(imageInput) {
  if (!isReady) {
    throw new Error('Model CLIP chưa được nạp. Vui lòng đợi hoặc kiểm tra cấu hình.');
  }

  const rawImage = await loadRawImage(imageInput);
  
  // Tiền xử lý ảnh qua processor của CLIP
  const imageInputs = await processor(rawImage);
  
  // Chạy model để trích xuất vector đặc trưng (image embeddings)
  const { image_embeds } = await model(imageInputs);
  
  // Chuyển Tensor thành Array và Normalize
  const rawVector = Array.from(image_embeds.data);
  return l2Normalize(rawVector);
}

// Đồng bộ hóa tự động tất cả các sản phẩm có ảnh nhưng chưa có vector trong Database
async function syncMissingEmbeddings(db) {
  console.log('[Vector Search] Bắt đầu kiểm tra và tự động cập nhật Vector Index cho các sản phẩm...');
  
  db.all("SELECT id, sku, imageUrl FROM products WHERE imageUrl IS NOT NULL AND imageUrl != '' AND (embedding IS NULL OR embedding = '')", [], async (err, rows) => {
    if (err) {
      console.error('[Vector Search] Không thể truy vấn sản phẩm để sync:', err.message);
      return;
    }
    
    if (rows.length === 0) {
      console.log('[Vector Search] Tất cả các sản phẩm có ảnh đã được lập chỉ mục vector. Hoàn tất!');
      return;
    }
    
    console.log(`[Vector Search] Tìm thấy ${rows.length} sản phẩm chưa lập chỉ mục. Tiến hành tạo vector...`);
    
    let successCount = 0;
    for (const row of rows) {
      try {
        // Đường dẫn file ảnh
        const relativeImagePath = row.imageUrl;
        const absoluteImagePath = path.join(__dirname, relativeImagePath);
        
        if (!fs.existsSync(absoluteImagePath)) {
          console.warn(`[Vector Search] Bỏ qua SKU ${row.sku}: Không tìm thấy file ảnh tại ${absoluteImagePath}`);
          continue;
        }

        const vector = await getEmbedding(absoluteImagePath);
        const vectorJson = JSON.stringify(vector);
        
        await new Promise((resolve, reject) => {
          db.run("UPDATE products SET embedding = ?, updatedAt = ? WHERE id = ?", [vectorJson, new Date().toISOString(), row.id], function(updateErr) {
            if (updateErr) reject(updateErr);
            else resolve();
          });
        });
        successCount++;
      } catch (itemErr) {
        console.error(`[Vector Search] Lỗi lập chỉ mục cho sản phẩm ID ${row.id} (SKU: ${row.sku}):`, itemErr.message);
      }
    }
    
    console.log(`[Vector Search] Đã lập chỉ mục thành công cho ${successCount}/${rows.length} sản phẩm!`);
  });
}

// Lập chỉ mục cho một sản phẩm đơn lẻ (gọi sau khi import sản phẩm mới)
async function indexProduct(db, id, imageUrl) {
  if (!imageUrl) return;
  
  // Chờ cho model khởi tạo xong nếu đang nạp
  let attempts = 0;
  while (!isReady && attempts < 10) {
    await new Promise(r => setTimeout(r, 1000));
    attempts++;
  }
  
  if (!isReady) {
    console.warn(`[Vector Search] Bỏ qua lập chỉ mục sản phẩm ID ${id}: Model chưa sẵn sàng.`);
    return;
  }

  try {
    const absoluteImagePath = path.join(__dirname, imageUrl);
    if (!fs.existsSync(absoluteImagePath)) {
      console.warn(`[Vector Search] Không tìm thấy ảnh sản phẩm tại ${absoluteImagePath} để lập chỉ mục.`);
      return;
    }

    const vector = await getEmbedding(absoluteImagePath);
    const vectorJson = JSON.stringify(vector);
    
    db.run("UPDATE products SET embedding = ?, updatedAt = ? WHERE id = ?", [vectorJson, new Date().toISOString(), id], function(err) {
      if (err) {
        console.error(`[Vector Search] Lỗi lưu vector cho sản phẩm ID ${id}:`, err.message);
      } else {
        console.log(`[Vector Search] Đã cập nhật chỉ mục vector thành công cho sản phẩm ID ${id}.`);
      }
    });
  } catch (error) {
    console.error(`[Vector Search] Không thể lập chỉ mục cho sản phẩm ID ${id}:`, error.message);
  }
}

// Tìm kiếm sản phẩm bằng ảnh truy vấn
async function searchSimilarProducts(db, queryImageInput, topK = 5) {
  if (!isReady) {
    throw new Error('Hệ thống tìm kiếm hình ảnh chưa sẵn sàng (đang nạp model CLIP). Vui lòng thử lại sau ít phút.');
  }

  // 1. Trích xuất vector của ảnh query
  const queryVector = await getEmbedding(queryImageInput);

  // 2. Lấy tất cả sản phẩm đang tồn kho (IN_STOCK hoặc PENDING) có sẵn embedding từ SQLite
  const products = await new Promise((resolve, reject) => {
    db.all("SELECT id, sku, location, shop, numberSku, productType, size, imageUrl, status, embedding FROM products WHERE (status = 'IN_STOCK' OR status = 'PENDING') AND embedding IS NOT NULL AND embedding != ''", [], (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });

  if (products.length === 0) {
    return [];
  }

  // 3. Tính độ tương đồng trong bộ nhớ
  const results = [];
  for (const product of products) {
    try {
      const prodVector = JSON.parse(product.embedding);
      if (!Array.isArray(prodVector) || prodVector.length !== queryVector.length) {
        continue;
      }
      
      const similarity = cosineSimilarity(queryVector, prodVector);
      
      // Loại bỏ trường embedding thô trước khi trả về để giảm kích thước payload
      const { embedding, ...productData } = product;
      
      results.push({
        ...productData,
        score: Math.max(0, Math.min(1, similarity)) // Clamp trong khoảng [0, 1]
      });
    } catch (e) {
      // Bỏ qua nếu lỗi parse vector JSON
    }
  }

  // 4. Sắp xếp kết quả giảm dần theo độ tương đồng và lấy topK
  results.sort((a, b) => b.score - a.score);
  return results.slice(0, topK);
}

module.exports = {
  init,
  indexProduct,
  searchSimilarProducts,
  isReady: () => isReady,
  isInitializing: () => isInitializing
};
