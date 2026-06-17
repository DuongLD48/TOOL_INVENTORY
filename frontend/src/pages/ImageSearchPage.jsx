import React, { useState, useRef, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Upload, Image as ImageIcon, Search, Check, AlertCircle, MapPin, Copy, ExternalLink, ArrowRight, Printer } from 'lucide-react';
import './ImageSearchPage.css';

const ImageSearchPage = () => {
  const [queryImage, setQueryImage] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [copiedId, setCopiedId] = useState(null);
  const [processingId, setProcessingId] = useState(null);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [zoomedImage, setZoomedImage] = useState(null);
  
  // State mới cho bộ lọc Shop
  const [shops, setShops] = useState([]);
  const [selectedShop, setSelectedShop] = useState('ALL');
  
  const fileInputRef = useRef(null);

  const compressImage = (file, maxWidth = 800, maxHeight = 800) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = (event) => {
        const img = new Image();
        img.src = event.target.result;
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;

          if (width > height) {
            if (width > maxWidth) {
              height = Math.round((height * maxWidth) / width);
              width = maxWidth;
            }
          } else {
            if (height > maxHeight) {
              width = Math.round((width * maxHeight) / height);
              height = maxHeight;
            }
          }

          canvas.width = width;
          canvas.height = height;

          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);

          const compressedBase64 = canvas.toDataURL('image/jpeg', 0.75);
          resolve(compressedBase64);
        };
        img.onerror = (err) => reject(err);
      };
      reader.onerror = (err) => reject(err);
    });
  };

  const handleImageSelect = async (e) => {
    const file = e.target.files[0];
    if (file) {
      try {
        const compressedBase64 = await compressImage(file);
        setQueryImage(compressedBase64);
        setResults([]);
        setError('');
      } catch (err) {
        console.error('Lỗi nén ảnh, dùng ảnh gốc:', err);
        const reader = new FileReader();
        reader.onloadend = () => {
          setQueryImage(reader.result);
          setResults([]);
          setError('');
        };
        reader.readAsDataURL(file);
      }
    }
  };

  const performSearch = useCallback(async (imageSrc) => {
    setLoading(true);
    setError('');
    
    try {
      const res = await fetch(`http://${window.location.hostname}:3001/api/inventory/search-image`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageUrl: imageSrc, shop: selectedShop })
      });
      
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Lỗi xử lý ảnh.');
      
      setResults(data.data || []);
      if (data.data && data.data.length === 0) {
        setError('Không tìm thấy sản phẩm nào có thiết kế tương đồng trong kho.');
      }
    } catch (err) {
      setError(err.message || 'Lỗi kết nối tới máy chủ AI.');
    } finally {
      setLoading(false);
    }
  }, [selectedShop]);

  // Lấy danh sách shop từ API khi tải trang
  useEffect(() => {
    const fetchShops = async () => {
      try {
        const res = await fetch(`http://${window.location.hostname}:3001/api/shops`);
        const data = await res.json();
        if (data.data) {
          setShops(data.data);
        }
      } catch (err) {
        console.error('Lỗi lấy danh sách shop:', err);
      }
    };
    fetchShops();
  }, []);

  // Tự động tìm kiếm lại khi thay đổi bộ lọc shop
  useEffect(() => {
    if (queryImage) {
      performSearch(queryImage);
    }
  }, [selectedShop, performSearch]);

  const handlePasteAndSearch = async () => {
    setError('');
    
    try {
      // 1. Đọc dữ liệu từ Clipboard
      const clipboardItems = await navigator.clipboard.read();
      let imageFound = false;
      
      for (const item of clipboardItems) {
        const imageTypes = item.types.filter(type => type.startsWith('image/'));
        if (imageTypes.length > 0) {
          const blob = await item.getType(imageTypes[0]);
          try {
            const compressedBase64 = await compressImage(blob);
            setQueryImage(compressedBase64);
            await performSearch(compressedBase64);
          } catch (compressErr) {
            const reader = new FileReader();
            reader.onloadend = async () => {
              const base64Data = reader.result;
              setQueryImage(base64Data);
              await performSearch(base64Data);
            };
            reader.readAsDataURL(blob);
          }
          imageFound = true;
          break;
        }
      }
      
      if (!imageFound) {
        // Fallback: nếu clipboard không có ảnh, nhưng có ảnh đã chọn sẵn ở dropzone thì dùng nó
        if (queryImage) {
          await performSearch(queryImage);
        } else {
          throw new Error('Không tìm thấy hình ảnh nào trong bộ nhớ đệm (Clipboard). Hãy sao chép ảnh trước.');
        }
      }
    } catch (err) {
      // Fallback khi lỗi đọc clipboard (Ví dụ chưa cấp quyền trình duyệt)
      if (queryImage) {
        await performSearch(queryImage);
      } else {
        setError(err.message || 'Không thể truy cập bộ nhớ đệm. Vui lòng cấp quyền Clipboard cho trang web hoặc kéo thả ảnh thủ công.');
      }
    }
  };

  useEffect(() => {
    const handleGlobalPaste = async (e) => {
      // Đảm bảo người dùng không đang nhập liệu vào ô input/textarea nào khác
      const target = e.target;
      if (
        target.tagName === 'INPUT' || 
        target.tagName === 'TEXTAREA' || 
        target.isContentEditable
      ) {
        return;
      }

      const items = e.clipboardData?.items;
      if (!items) return;

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.type.indexOf('image') !== -1) {
          const blob = item.getAsFile();
          if (blob) {
            e.preventDefault();
            try {
              const compressedBase64 = await compressImage(blob);
              setQueryImage(compressedBase64);
              setResults([]);
              performSearch(compressedBase64);
            } catch (compressErr) {
              const reader = new FileReader();
              reader.onloadend = () => {
                const base64Data = reader.result;
                setQueryImage(base64Data);
                setResults([]);
                performSearch(base64Data);
              };
              reader.readAsDataURL(blob);
            }
            break;
          }
        }
      }
    };

    window.addEventListener('paste', handleGlobalPaste);
    return () => {
      window.removeEventListener('paste', handleGlobalPaste);
    };
  }, [performSearch]);

  const fallbackCopyTextToClipboard = (text, id) => {
    const textArea = document.createElement("textarea");
    textArea.value = text;
    textArea.style.top = "0";
    textArea.style.left = "0";
    textArea.style.position = "fixed";
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    try {
      const successful = document.execCommand('copy');
      if (successful) {
        setCopiedId(id);
        setTimeout(() => setCopiedId(null), 2000);
      } else {
        console.error('Fallback: Copying text command was unsuccessful');
      }
    } catch (err) {
      console.error('Fallback: Oops, unable to copy', err);
    }
    document.body.removeChild(textArea);
  };

  const copyToClipboard = (text, id) => {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text)
        .then(() => {
          setCopiedId(id);
          setTimeout(() => setCopiedId(null), 2000);
        })
        .catch(err => {
          console.error('Failed to copy text: ', err);
          fallbackCopyTextToClipboard(text, id);
        });
    } else {
      fallbackCopyTextToClipboard(text, id);
    }
  };

  const handlePrintProduct = async (product) => {
    try {
      const res = await fetch(`http://${window.location.hostname}:3001/api/inventory/print-now`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: [product.id] })
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error);
      alert('Đã gửi lệnh in tem thành công!');
    } catch (err) {
      alert(`Lỗi khi in: ${err.message}`);
    }
  };

  const handleExportProduct = async (product) => {
    if (!window.confirm(`Bạn có chắc chắn muốn xuất kho sản phẩm SKU: ${product.sku} (ID: ${product.id}) ở vị trí ${product.location}?`)) {
      return;
    }
    try {
      const res = await fetch(`http://${window.location.hostname}:3001/api/inventory/export`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sku: `${product.id}#${product.sku}` })
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error);
      
      setResults(prev => prev.filter(p => p.id !== product.id));
      setSelectedProduct(null);
      alert('Xuất kho thành công!');
    } catch (err) {
      alert(`Lỗi xuất kho: ${err.message}`);
    }
  };

  const handleRestoreProduct = async (product) => {
    if (!window.confirm(`Bạn có chắc chắn muốn khôi phục sản phẩm SKU: ${product.sku} (ID: ${product.id}) về trạng thái Tồn kho (IN_STOCK)?`)) {
      return;
    }
    try {
      const res = await fetch(`http://${window.location.hostname}:3001/api/inventory/restore-stock`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: product.id })
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error);
      
      const updatedProduct = { ...product, status: 'IN_STOCK', orderId: null };
      setResults(prev => prev.map(p => p.id === product.id ? updatedProduct : p));
      setSelectedProduct(updatedProduct);
      alert('Khôi phục tồn kho thành công!');
    } catch (err) {
      alert(`Lỗi khôi phục: ${err.message}`);
    }
  };

  const handleUpdateImage = async (productId, file) => {
    if (!file) return;
    try {
      const base64Data = await compressImage(file);
      const res = await fetch(`http://${window.location.hostname}:3001/api/inventory/update-image`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: productId, imageUrl: base64Data })
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || 'Lỗi khi cập nhật ảnh.');
      
      setResults(prev => prev.map(p => p.id === productId ? { ...p, imageUrl: result.data.imageUrl } : p));
      setSelectedProduct(prev => prev && prev.id === productId ? { ...prev, imageUrl: result.data.imageUrl } : prev);
      alert('Cập nhật hình ảnh thành công!');
    } catch (err) {
      alert(`Lỗi cập nhật ảnh: ${err.message}`);
    }
  };

  const handleMarkPendingAndCopy = async (productId, location, sku) => {
    // 1. Copy vị trí vào clipboard
    if (location) {
      copyToClipboard(location, 'loc-' + productId);
    }
    
    setProcessingId(productId);
    try {
      // 2. Chuyển sản phẩm sang PENDING
      const res = await fetch(`http://${window.location.hostname}:3001/api/inventory/mark-pending`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: productId })
      });
      const data = await res.json();
      
      if (!res.ok) throw new Error(data.error || 'Lỗi khi cập nhật trạng thái.');
      
      // Cập nhật kết quả hiển thị tại chỗ
      setResults(prev => prev.map(p => p.id === productId ? { ...p, status: 'PENDING' } : p));
    } catch (err) {
      alert(`Lập hồ sơ PENDING lỗi: ${err.message}`);
    } finally {
      setProcessingId(null);
    }
  };

  const getScoreColor = (score) => {
    if (score >= 0.90) return 'score-high';
    if (score >= 0.75) return 'score-medium';
    return 'score-low';
  };

  const getScoreLabel = (score) => {
    if (score >= 0.90) return 'Trùng thiết kế (Cao)';
    if (score >= 0.75) return 'Tương đồng (Vừa)';
    return 'Khác biệt (Thấp)';
  };

  return (
    <div className="animate-fade-in responsive-flex search-image-wrapper">
      
      {/* Cột trái: Tải ảnh và điều khiển */}
      <div className="glass-panel search-control-panel">
        <h1>Tìm Kiếm Bằng Hình Ảnh</h1>
        <p className="subtitle">Tải lên hoặc chụp ảnh thiết kế áo, hệ thống sẽ sử dụng AI Vector để định vị vị trí kệ hàng.</p>
        
        <div 
          className="upload-dropzone"
          onClick={() => fileInputRef.current?.click()}
        >
          {queryImage ? (
            <div className="preview-container">
              <img src={queryImage} alt="Query preview" className="query-preview-img" />
              <div className="change-img-overlay">
                <ImageIcon size={20} />
                <span>Chọn ảnh khác</span>
              </div>
            </div>
          ) : (
            <div className="upload-placeholder">
              <Upload size={48} className="upload-icon" />
              <p className="upload-text">Nhấp để mở Camera hoặc chọn file ảnh</p>
              <p className="upload-subtext">Hỗ trợ định dạng JPG, PNG, WebP</p>
            </div>
          )}
          <input 
            type="file" 
            accept="image/*" 
            ref={fileInputRef} 
            onChange={handleImageSelect} 
            style={{ display: 'none' }} 
          />
        </div>

        {/* Bộ lọc cửa hàng */}
        <div style={{ marginBottom: '16px' }}>
          <label style={{ display: 'block', marginBottom: '8px', fontSize: '13px', color: 'var(--text-secondary)', fontWeight: '600' }}>
            Lọc cửa hàng (Shop)
          </label>
          <select 
            value={selectedShop} 
            onChange={e => setSelectedShop(e.target.value)}
            style={{
              width: '100%',
              height: '42px',
              borderRadius: '8px',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              background: 'rgba(255, 255, 255, 0.05)',
              color: 'white',
              padding: '0 12px',
              outline: 'none',
              fontFamily: 'inherit',
              cursor: 'pointer'
            }}
          >
            <option value="ALL" style={{ background: '#1e293b', color: 'white' }}>Tất cả các shop</option>
            {shops.map(shop => (
              <option key={shop.id} value={shop.id} style={{ background: '#1e293b', color: 'white' }}>{shop.name}</option>
            ))}
          </select>
        </div>

        {error && (
          <div className="search-error-msg animate-fade-in">
            <AlertCircle size={18} />
            <span>{error}</span>
          </div>
        )}

        <button 
          onClick={handlePasteAndSearch}
          disabled={loading}
          className="btn btn-primary search-action-btn"
        >
          {loading ? (
            <>
              <div className="spinner" />
              <span>Đang trích xuất Vector...</span>
            </>
          ) : (
            <>
              <Search size={20} />
              <span>Dán từ bộ nhớ đệm + Tìm kiếm</span>
            </>
          )}
        </button>

        <div className="shortcut-hint">
          Mẹo: Nhấn <strong>Ctrl + V</strong> tại bất kỳ đâu để dán và tìm kiếm nhanh
        </div>
      </div>

      {/* Cột phải: Kết quả so khớp */}
      <div className="glass-panel search-results-panel">
        <div className="results-header">
          <h2>Kết Quả So Khớp ({results.length})</h2>
          {results.length > 0 && (
            <span className="results-badge">Độ tương thích giảm dần</span>
          )}
        </div>

        {results.length === 0 ? (
          <div className="empty-results-container">
            <ImageIcon size={64} className="empty-icon" />
            <p>Chọn ảnh thiết kế bên trái và nhấn tìm kiếm để hiển thị sản phẩm tồn kho.</p>
          </div>
        ) : (
          <div className="results-grid">
            {results.map((product) => (
              <div 
                key={product.id} 
                className={`result-card ${product.status === 'EXPORTED' ? 'exported' : ''}`}
                onClick={() => setSelectedProduct(product)}
                style={{ cursor: 'pointer' }}
              >
                
                {/* Badge độ tương đồng */}
                <div className={`similarity-badge ${getScoreColor(product.score)}`}>
                  <span className="score-percentage">{(product.score * 100).toFixed(0)}%</span>
                  <span className="score-text">{getScoreLabel(product.score)}</span>
                </div>

                <div className="result-img-wrapper">
                  {product.imageUrl ? (
                    <img 
                      src={product.imageUrl.startsWith('/') ? `http://${window.location.hostname}:3001${product.imageUrl}` : product.imageUrl} 
                      alt="Product" 
                      className="result-img"
                    />
                  ) : (
                    <div className="no-img-placeholder">Không có ảnh</div>
                  )}
                  <div className={`status-tag ${product.status.toLowerCase()}`}>
                    {product.status === 'IN_STOCK' ? 'Trong kho' : product.status === 'PENDING' ? 'Chờ lấy hàng' : 'Đã xuất'}
                  </div>
                </div>

                <div className="result-info">
                  <div className="result-shop">{product.shop}</div>
                  
                  <div className="sku-row">
                    <span className="sku-text" title={product.sku}>{product.sku}</span>
                    <button 
                      onClick={(e) => { e.stopPropagation(); copyToClipboard(product.sku, product.id); }}
                      className="copy-btn"
                      title="Copy mã SKU"
                    >
                      {copiedId === product.id ? <Check size={14} color="var(--accent-success)" /> : <Copy size={14} />}
                    </button>
                  </div>

                  <div className="meta-details">
                    <span>Loại: <strong>{product.productType}</strong></span>
                    <span>Size: <strong>{product.size}</strong></span>
                  </div>

                  {/* Kệ kho định vị */}
                  <div className="location-box" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <MapPin size={16} color="var(--accent-primary)" />
                      <span className="location-text">Kệ: <strong>{product.location || 'Chưa xếp'}</strong></span>
                    </div>
                    {product.location && (
                      <button 
                        onClick={(e) => { e.stopPropagation(); copyToClipboard(product.location, 'loc-' + product.id); }}
                        className="copy-btn"
                        title="Copy vị trí kệ"
                        style={{ padding: '2px', marginLeft: '8px' }}
                      >
                        {copiedId === 'loc-' + product.id ? <Check size={14} color="var(--accent-success)" /> : <Copy size={14} />}
                      </button>
                    )}
                  </div>

                  <div className="card-actions">
                    {product.status === 'IN_STOCK' ? (
                      <button 
                        onClick={(e) => { e.stopPropagation(); handleMarkPendingAndCopy(product.id, product.location, product.sku); }}
                        disabled={processingId === product.id}
                        className="btn btn-success quick-export-btn"
                        style={{ background: 'var(--accent-primary)', width: '100%', padding: '10px' }}
                      >
                        {processingId === product.id ? 'Đang xử lý...' : 'Chuyển Pending + Copy vị trí'}
                      </button>
                    ) : product.status === 'PENDING' ? (
                      <span className="exported-label" style={{ color: 'var(--accent-success)', background: 'rgba(16, 185, 129, 0.1)' }}>Đang chờ lấy hàng</span>
                    ) : (
                      <span className="exported-label">Đã xuất kho</span>
                    )}
                  </div>
                </div>

              </div>
            ))}
          </div>
        )}
      </div>
      {/* DETAIL MODAL OVERLAY */}
      {selectedProduct && createPortal(
        <div className="modal-backdrop-overlay" onClick={() => setSelectedProduct(null)}>
          <div className="modal-glass-container" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '500px' }}>
            <div className="modal-header-section">
              <h2 className="modal-header-title">
                Chi tiết sản phẩm
              </h2>
              <button 
                onClick={() => setSelectedProduct(null)}
                className="modal-close-button"
              >
                &times;
              </button>
            </div>

            <div className="modal-body-section">
              <div className="modal-product-card-item">
                <div className="modal-product-card-flex" style={{ flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
                  {/* Thumbnail */}
                  <div 
                    className="modal-product-thumbnail-box"
                    style={{ width: '180px', height: '240px', cursor: 'zoom-in', position: 'relative' }}
                    onClick={() => {
                      if (selectedProduct.imageUrl) {
                        const imgUrl = selectedProduct.imageUrl.startsWith('/') 
                          ? `http://${window.location.hostname}:3001${selectedProduct.imageUrl}` 
                          : selectedProduct.imageUrl;
                        setZoomedImage(imgUrl);
                      }
                    }}
                    title="Click để phóng to ảnh"
                  >
                    {selectedProduct.imageUrl ? (
                      <img 
                        src={selectedProduct.imageUrl.startsWith('/') ? `http://${window.location.hostname}:3001${selectedProduct.imageUrl}` : selectedProduct.imageUrl} 
                        alt={selectedProduct.sku} 
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      />
                    ) : (
                      <ImageOff size={48} style={{ opacity: 0.3 }} />
                    )}
                  </div>
                  {/* Info */}
                  <div className="modal-product-info-details" style={{ width: '100%', textAlign: 'left' }}>
                    <div className="modal-product-location-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span className="modal-product-location-text" style={{ color: 'var(--accent-success)', fontWeight: 'bold' }}>
                        Vị trí: {selectedProduct.location || 'Chưa xếp'}
                      </span>
                      <span className="modal-product-id-badge" style={{ background: 'var(--accent-primary)', padding: '2px 6px', borderRadius: '4px', fontSize: '10px', color: 'white', fontWeight: 'bold' }}>
                        ID: {selectedProduct.id}
                      </span>
                    </div>
                    <div className="modal-product-sku-name" style={{ fontWeight: 'bold', fontSize: '15px', color: 'white', margin: '6px 0', wordBreak: 'break-all' }}>
                      {selectedProduct.sku}
                    </div>
                    <div className="modal-product-shop-created" style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>
                      Shop: <strong>{selectedProduct.shop}</strong>
                    </div>
                    <div className="modal-product-shop-created" style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>
                      Loại: <strong>{selectedProduct.productType}</strong> | Size: <strong>{selectedProduct.size}</strong>
                    </div>
                    {selectedProduct.status === 'PENDING' && (
                      <div style={{ marginTop: '6px' }}>
                        <span className="badge-pending">
                          CHỜ LẤY HÀNG {selectedProduct.orderId ? `(Đơn: ${selectedProduct.orderId})` : ''}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Action buttons */}
                <div className="modal-product-card-actions" style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', borderTop: '1px solid rgba(255, 255, 255, 0.05)', paddingTop: '10px', marginTop: '10px' }}>
                  {selectedProduct.status === 'PENDING' && (
                    <button
                      onClick={() => handleRestoreProduct(selectedProduct)}
                      className="btn modal-product-btn-restore"
                    >
                      Khôi phục Tồn kho
                    </button>
                  )}
                  <label className="btn modal-product-btn-update-img" style={{ cursor: 'pointer' }}>
                    <ImageIcon size={12} /> Đổi Ảnh
                    <input 
                      type="file" 
                      accept="image/*" 
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          handleUpdateImage(selectedProduct.id, file);
                        }
                      }}
                      style={{ display: 'none' }}
                    />
                  </label>
                  <button 
                    onClick={() => handlePrintProduct(selectedProduct)}
                    className="btn btn-primary modal-product-btn-print" 
                  >
                    <Printer size={12} /> In Tem
                  </button>
                  <button 
                    onClick={() => handleExportProduct(selectedProduct)}
                    className="btn modal-product-btn-export" 
                  >
                    Xuất Kho
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      , document.body)}

      {/* ZOOM LIGHTBOX OVERLAY */}
      {zoomedImage && createPortal(
        <div className="zoom-backdrop-overlay" onClick={() => setZoomedImage(null)}>
          <button className="zoom-close-button" onClick={() => setZoomedImage(null)}>
            &times;
          </button>
          <img 
            src={zoomedImage} 
            alt="Zoomed product details" 
            className="zoom-image-content" 
            onClick={(e) => e.stopPropagation()} 
          />
        </div>
      , document.body)}

    </div>
  );
};

export default ImageSearchPage;
