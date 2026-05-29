import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Upload, Image as ImageIcon, Search, Check, AlertCircle, MapPin, Copy, ExternalLink, ArrowRight } from 'lucide-react';
import './ImageSearchPage.css';

const ImageSearchPage = () => {
  const [queryImage, setQueryImage] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [copiedId, setCopiedId] = useState(null);
  const [processingId, setProcessingId] = useState(null);
  
  const fileInputRef = useRef(null);

  const handleImageSelect = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setQueryImage(reader.result);
        setResults([]);
        setError('');
      };
      reader.readAsDataURL(file);
    }
  };

  const performSearch = useCallback(async (imageSrc) => {
    setLoading(true);
    setError('');
    
    try {
      const res = await fetch(`http://${window.location.hostname}:3001/api/inventory/search-image`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageUrl: imageSrc })
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
  }, []);

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
          const reader = new FileReader();
          reader.onloadend = async () => {
            const base64Data = reader.result;
            setQueryImage(base64Data);
            await performSearch(base64Data);
          };
          reader.readAsDataURL(blob);
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
    const handleGlobalPaste = (e) => {
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
            const reader = new FileReader();
            reader.onloadend = () => {
              const base64Data = reader.result;
              setQueryImage(base64Data);
              setResults([]);
              performSearch(base64Data);
            };
            reader.readAsDataURL(blob);
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

  const copyToClipboard = (text, id) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
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
              <div key={product.id} className={`result-card ${product.status === 'EXPORTED' ? 'exported' : ''}`}>
                
                {/* Badge độ tương đồng */}
                <div className={`similarity-badge ${getScoreColor(product.score)}`}>
                  <span className="score-percentage">{(product.score * 100).toFixed(0)}%</span>
                  <span className="score-text">{getScoreLabel(product.score)}</span>
                </div>

                <div className="result-img-wrapper">
                  {product.imageUrl ? (
                    <img 
                      src={`http://${window.location.hostname}:3001${product.imageUrl}`} 
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
                      onClick={() => copyToClipboard(product.sku, product.id)}
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
                        onClick={() => copyToClipboard(product.location, 'loc-' + product.id)}
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
                        onClick={() => handleMarkPendingAndCopy(product.id, product.location, product.sku)}
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

    </div>
  );
};

export default ImageSearchPage;
