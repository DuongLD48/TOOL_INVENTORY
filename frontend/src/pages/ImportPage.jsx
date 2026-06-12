import React, { useState, useEffect, useRef } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import './ImportPage.css';

// Kệ A -> F, Ô 1 -> 6, Sub 1 -> 25
const standardLetters = ['A', 'B', 'C', 'D', 'E'];
const standardNumbers = ['1', '2', '3', '4', '5', '6'];
const standardSubs = Array.from({ length: 25 }, (_, i) => (i + 1).toString());

const standardLocations = [];
standardLetters.forEach(letter => {
  standardNumbers.forEach(num => {
    standardSubs.forEach(sub => {
      standardLocations.push(`${letter}${num}-${sub}`);
    });
  });
});

const findFirstEmptyLocation = (occupiedSet, isSpecialType = false) => {
  let startIndex = 0;
  if (isSpecialType) {
    const index = standardLocations.indexOf('E1-1');
    if (index !== -1) {
      startIndex = index;
    }
  }
  for (let i = startIndex; i < standardLocations.length; i++) {
    const loc = standardLocations[i];
    if (!occupiedSet.has(loc)) {
      return loc;
    }
  }
  return null;
};

const parseLocation = (locStr) => {
  if (!locStr) return null;
  const match = locStr.match(/^([A-F])([1-6])-([1-9][0-9]*)$/);
  if (match) {
    return {
      letter: match[1],
      number: match[2],
      sub: match[3]
    };
  }
  return null;
};

// Tiếng ting thành công dùng Web Audio API (không cần file âm thanh)
const playSuccessSound = () => {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(1200, ctx.currentTime + 0.08);
    gain.gain.setValueAtTime(0.4, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.35);
  } catch (_) {}
};

const ImportPage = () => {
  const [shops, setShops] = useState([
    { id: 'SDR', name: 'SDR', skuPrefix: 'SYC', requireNumberSku: true, requireCamera: false, autoImageFolder: true },
    { id: 'BATT-BFG', name: 'BATT-BFG', skuPrefix: '', requireNumberSku: false, requireCamera: true, autoImageFolder: false }
  ]);
  const [formData, setFormData] = useState({
    shop: 'SDR',
    numberSku: '',
    productType: '',
    size: '',
    locLetter: 'A',
    locNumber: '1',
    locSubPosition: '1',
    imageUrl: ''
  });
  
  const [products, setProducts] = useState([]);
  const [sdrImageUrl, setSdrImageUrl] = useState(null);
  const [occupiedLocations, setOccupiedLocations] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [recentProducts, setRecentProducts] = useState([]);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const fileInputRef = useRef(null);
  const formRef = useRef(null);
  const isSubmittingRef = useRef(false);

  const fetchInventory = async () => {
    try {
      const res = await fetch(`http://${window.location.hostname}:3001/api/inventory`);
      const result = await res.json();
      if (result.data) {
        setProducts(result.data);
        const occupied = new Set(
          result.data
            .filter(p => p.status === 'IN_STOCK' || p.status === 'PENDING')
            .map(p => p.location ? p.location.trim().toUpperCase() : '')
            .filter(Boolean)
        );
        setOccupiedLocations(occupied);
        return occupied;
      }
    } catch (err) {
      console.error('Lỗi khi tải dữ liệu tồn kho:', err);
    }
    return new Set();
  };

  // Lắng nghe Enter toàn trang → submit form nhập kho
  useEffect(() => {
    const handleGlobalEnter = (e) => {
      // Bỏ qua nếu đang focus vào select hoặc textarea
      const tag = document.activeElement?.tagName;
      if (tag === 'SELECT' || tag === 'TEXTAREA') return;
      if (e.key !== 'Enter') return;
      if (isSubmittingRef.current) return;
      // preventDefault chặn button tự kích hoạt click khi Enter
      e.preventDefault();
      formRef.current?.requestSubmit();
    };
    window.addEventListener('keydown', handleGlobalEnter);
    return () => window.removeEventListener('keydown', handleGlobalEnter);
  }, []);

  useEffect(() => {
    const init = async () => {
      // Tải cấu hình shop trước
      try {
        const res = await fetch(`http://${window.location.hostname}:3001/api/shops`);
        const result = await res.json();
        if (result.success && result.data && result.data.length > 0) {
          setShops(result.data);
          setFormData(prev => ({ ...prev, shop: result.data[0].id }));
        }
      } catch (err) {
        console.error('Lỗi khi tải danh sách shop từ backend:', err);
      }

      const occupied = await fetchInventory();
      setLoading(false);

      const params = new URLSearchParams(window.location.search);
      const letter = params.get('letter');
      const number = params.get('number');
      const sub = params.get('sub');

      if (letter || number || sub) {
        setFormData(prev => ({
          ...prev,
          locLetter: letter ? letter.toUpperCase() : prev.locLetter,
          locNumber: number ? number : prev.locNumber,
          locSubPosition: sub ? sub : prev.locSubPosition
        }));
      } else {
        // Tự động chọn vị trí trống đầu tiên
        const firstEmpty = findFirstEmptyLocation(occupied);
        if (firstEmpty) {
          const parsed = parseLocation(firstEmpty);
          if (parsed) {
            setFormData(prev => ({
              ...prev,
              locLetter: parsed.letter,
              locNumber: parsed.number,
              locSubPosition: parsed.sub
            }));
          }
        }
      }
    };
    init();
  }, []);

  // Lấy ảnh mẫu dựa theo shop, numberSku và productType khi các giá trị này thay đổi
  useEffect(() => {
    const fetchShopImage = async () => {
      const activeShop = shops.find(s => s.id === formData.shop);
      if (activeShop && activeShop.autoImageFolder && formData.numberSku && formData.productType) {
        try {
          const res = await fetch(`http://${window.location.hostname}:3001/api/shop-image?shop=${formData.shop}&numberSku=${formData.numberSku}&productType=${formData.productType}`);
          const result = await res.json();
          if (result.success && result.imageUrl) {
            setSdrImageUrl(result.imageUrl);
          } else {
            setSdrImageUrl(null);
          }
        } catch (err) {
          console.error(`Lỗi khi tải ảnh mẫu của shop ${formData.shop}:`, err);
          setSdrImageUrl(null);
        }
      } else {
        setSdrImageUrl(null);
      }
    };
    fetchShopImage();
  }, [formData.shop, formData.numberSku, formData.productType, shops]);

  // Bộ lọc liên hoàn (Cascading Dropdowns)
  const availableLetters = standardLetters.filter(letter => {
    for (const num of standardNumbers) {
      for (const sub of standardSubs) {
        if (!occupiedLocations.has(`${letter}${num}-${sub}`)) return true;
      }
    }
    return false;
  });

  const availableNumbers = standardNumbers.filter(num => {
    for (const sub of standardSubs) {
      if (!occupiedLocations.has(`${formData.locLetter}${num}-${sub}`)) return true;
    }
    return false;
  });

  const availableSubs = standardSubs.filter(sub => {
    return !occupiedLocations.has(`${formData.locLetter}${formData.locNumber}-${sub}`);
  });

  // Tự động sửa đổi lựa chọn nếu thay đổi Kệ/Ô làm vị trí hiện tại không còn khả dụng
  useEffect(() => {
    if (loading || occupiedLocations.size === 0) return;

    let adjusted = false;
    let nextLetter = formData.locLetter;
    let nextNumber = formData.locNumber;
    let nextSub = formData.locSubPosition;

    if (availableLetters.length > 0 && !availableLetters.includes(nextLetter)) {
      nextLetter = availableLetters[0];
      adjusted = true;
    }

    const currentAvailableNumbers = standardNumbers.filter(num => {
      for (const sub of standardSubs) {
        if (!occupiedLocations.has(`${nextLetter}${num}-${sub}`)) return true;
      }
      return false;
    });

    if (currentAvailableNumbers.length > 0 && !currentAvailableNumbers.includes(nextNumber)) {
      nextNumber = currentAvailableNumbers[0];
      adjusted = true;
    }

    const currentAvailableSubs = standardSubs.filter(sub => {
      return !occupiedLocations.has(`${nextLetter}${nextNumber}-${sub}`);
    });

    if (currentAvailableSubs.length > 0 && !currentAvailableSubs.includes(nextSub)) {
      nextSub = currentAvailableSubs[0];
      adjusted = true;
    }

    if (adjusted) {
      setFormData(prev => ({
        ...prev,
        locLetter: nextLetter,
        locNumber: nextNumber,
        locSubPosition: nextSub
      }));
    }
  }, [formData.locLetter, formData.locNumber, occupiedLocations, loading]);

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

  const handleImageCapture = async (e) => {
    const file = e.target.files[0];
    if (file) {
      try {
        const compressedBase64 = await compressImage(file);
        setFormData(prev => ({ ...prev, imageUrl: compressedBase64 }));
      } catch (err) {
        console.error('Lỗi nén ảnh, chuyển sang ảnh gốc:', err);
        const reader = new FileReader();
        reader.onloadend = () => {
          setFormData(prev => ({ ...prev, imageUrl: reader.result }));
        };
        reader.readAsDataURL(file);
      }
    }
  };

  const getGeneratedSku = () => {
    if (!formData.productType || !formData.size) return '';
    
    const activeShop = shops.find(s => s.id === formData.shop);
    if (!activeShop) return '';

    const prefix = activeShop.skuPrefix || '';
    const requiresNum = activeShop.requireNumberSku;
    const num = requiresNum ? (formData.numberSku ? formData.numberSku : '0000') : '';
    return `${prefix}${num}${formData.productType}-${formData.size}`;
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    if (name === 'shop') {
      const selectedShop = shops.find(s => s.id === value);
      const requiresNum = selectedShop ? selectedShop.requireNumberSku : true;
      setFormData(prev => ({
        ...prev,
        shop: value,
        numberSku: requiresNum ? prev.numberSku : ''
      }));
    } else {
      setFormData(prev => ({ ...prev, [name]: value }));
    }
  };

  const handleProductTypeChange = (type) => {
    const isSpecialType = type === 'GSHO' || type === 'FSHO';
    const firstEmpty = findFirstEmptyLocation(occupiedLocations, isSpecialType);
    
    setFormData(prev => {
      const nextData = { ...prev, productType: type };
      if (firstEmpty) {
        const parsed = parseLocation(firstEmpty);
        if (parsed) {
          nextData.locLetter = parsed.letter;
          nextData.locNumber = parsed.number;
          nextData.locSubPosition = parsed.sub;
        }
      }
      return nextData;
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isSubmittingRef.current) return;
    isSubmittingRef.current = true;
    setError('');
    setSuccess('');
    
    if (!formData.productType) {
      setError('Vui lòng chọn loại sản phẩm.');
      isSubmittingRef.current = false;
      return;
    }
    if (!formData.size) {
      setError('Vui lòng chọn kích cỡ.');
      isSubmittingRef.current = false;
      return;
    }

    const activeShop = shops.find(s => s.id === formData.shop);
    if (activeShop && activeShop.requireCamera && !formData.imageUrl) {
      setError(`Shop ${activeShop.name} yêu cầu phải chụp ảnh.`);
      isSubmittingRef.current = false;
      return;
    }

    const finalData = { 
      ...formData, 
      sku: getGeneratedSku(),
      location: `${formData.locLetter}${formData.locNumber}-${formData.locSubPosition}`
    };
    
    try {
      const res = await fetch(`http://${window.location.hostname}:3001/api/inventory/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(finalData)
      });
      const data = await res.json();
      
      if (!res.ok) throw new Error(data.error);
      
      setRecentProducts(prev => [data.data, ...prev].slice(0, 10));
      setSuccess('Nhập kho thành công!');
      playSuccessSound();
      setTimeout(() => setSuccess(''), 3000);

      // Cập nhật lại danh sách vị trí đã bị chiếm dụng
      const updatedOccupied = await fetchInventory();
      
      // Tìm vị trí trống tiếp theo
      const firstEmpty = findFirstEmptyLocation(updatedOccupied);
      if (firstEmpty) {
        const parsed = parseLocation(firstEmpty);
        if (parsed) {
          setFormData(prev => ({ 
            ...prev, 
            numberSku: '',
            productType: '',
            size: '',
            imageUrl: '',
            locLetter: parsed.letter,
            locNumber: parsed.number,
            locSubPosition: parsed.sub
          }));
        }
      } else {
        alert('Kho hàng đã đầy hoàn toàn!');
        setFormData(prev => ({
          ...prev,
          numberSku: '',
          productType: '',
          size: '',
          imageUrl: ''
        }));
      }
    } catch (err) {
      setError(err.message);
    } finally {
      isSubmittingRef.current = false;
    }
  };

  const displayImageUrl = formData.imageUrl || (sdrImageUrl ? `http://${window.location.hostname}:3001${sdrImageUrl}` : null);
  const activeShopObj = shops.find(s => s.id === formData.shop);
  const requiresNumberSku = activeShopObj ? activeShopObj.requireNumberSku : true;

  return (
    <div className="animate-fade-in import-page-outer">
      <div className="import-page-wrapper responsive-flex">
        <div className="glass-panel responsive-full-width import-page-panel">
        
        
        {loading ? (
          <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-secondary)' }}>
            Đang tải dữ liệu sơ đồ kho...
          </div>
        ) : (
          <form ref={formRef} onSubmit={handleSubmit} className="responsive-grid import-form-grid">
            {/* Column 1: Product Information */}
            <div className="import-col">
              <div style={{ marginBottom: '20px' }}>
                <label className="label">Vị trí (Kệ - Ô - Vị trí nhỏ còn trống)</label>
                <div className="location-dropdown-row">
                  <select 
                    name="locLetter" 
                    value={formData.locLetter} 
                    onChange={handleChange} 
                    className="input-field location-select-item"
                  >
                    {availableLetters.map(letter => (
                      <option key={letter} value={letter}>{letter}</option>
                    ))}
                    {availableLetters.length === 0 && (
                      <option value="">(Hết chỗ)</option>
                    )}
                  </select>
                  <span className="location-divider">-</span>
                  <select 
                    name="locNumber" 
                    value={formData.locNumber} 
                    onChange={handleChange} 
                    className="input-field location-select-item"
                  >
                    {availableNumbers.map(num => (
                      <option key={num} value={num}>{num}</option>
                    ))}
                    {availableNumbers.length === 0 && (
                      <option value="">-</option>
                    )}
                  </select>
                  <span className="location-divider">-</span>
                  <select 
                    name="locSubPosition" 
                    value={formData.locSubPosition} 
                    onChange={handleChange} 
                    className="input-field location-select-item"
                  >
                    {availableSubs.map(num => (
                      <option key={num} value={num}>{num}</option>
                    ))}
                    {availableSubs.length === 0 && (
                      <option value="">-</option>
                    )}
                  </select>
                </div>
              </div>

              <div style={{ marginBottom: '20px' }}>
                <label className="label">Shop</label>
                <div className="button-selector-group">
                  {shops.map(s => (
                    <button
                      key={s.id}
                      type="button"
                      className={`btn-selector ${formData.shop === s.id ? 'active' : ''}`}
                      onClick={() => {
                        setFormData(prev => ({
                          ...prev,
                          shop: s.id,
                          numberSku: s.requireNumberSku ? prev.numberSku : ''
                        }));
                      }}
                    >
                      {s.name}
                    </button>
                  ))}
                </div>
              </div>

              {requiresNumberSku && (
                <div style={{ marginBottom: '20px' }}>
                  <label className="label">Number SKU</label>
                  <input 
                    type="text" 
                    name="numberSku" 
                    value={formData.numberSku} 
                    onChange={e => {
                      const val = e.target.value.replace(/\D/g, '').slice(0, 4);
                      setFormData(prev => ({ ...prev, numberSku: val }));
                    }}
                    onBlur={e => {
                      const val = e.target.value.replace(/\D/g, '');
                      if (val && val.length < 4) {
                        setFormData(prev => ({ ...prev, numberSku: val.padStart(4, '0') }));
                      }
                    }}
                    className="input-field"
                    placeholder="Ví dụ: 0001" 
                    maxLength={4}
                    required={true}
                  />
                </div>
              )}

              <div style={{ marginBottom: '20px' }}>
                <label className="label">Loại Sản Phẩm (Category)</label>
                <div className="button-selector-group">
                  {['SSRG', 'LSRG', 'WSRG', 'WLRG', 'RGKS', 'RGKL', 'FSHO', 'GSHO', 'WRES', 'WWRE', 'KWRE'].map(type => (
                    <button
                      key={type}
                      type="button"
                      className={`btn-selector ${formData.productType === type ? 'active' : ''}`}
                      onClick={() => handleProductTypeChange(type)}
                    >
                      {type}
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ marginBottom: '20px' }}>
                <label className="label">Kích cỡ (Size)</label>
                <div className="button-selector-group">
                  {['2XS', 'XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', '4XL', '5XL', '6XL'].map(s => (
                    <button
                      key={s}
                      type="button"
                      className={`btn-selector ${formData.size === s ? 'active' : ''}`}
                      onClick={() => setFormData(prev => ({ ...prev, size: s }))}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Column 2: Location, Image and Preview Summary */}
            <div className="import-col">

              {/* Live Preview & Log Summary (50% Preview / 50% Log) */}
              <div className="import-sku-preview-info animate-fade-in">
                <div className="preview-string-box">
                  <span style={{ fontSize: '11px', display: 'block', marginBottom: '2px', opacity: 0.6, fontWeight: 'bold', letterSpacing: '0.05em' }}>XEM TRƯỚC SKU</span>
                  <strong className="highlight-sku" style={{ fontSize: '16px' }}>
                    {`${formData.shop}#${getGeneratedSku() || 'CHƯA_ĐỦ'}${formData.locLetter && formData.locNumber && formData.locSubPosition ? '#' + formData.locLetter + formData.locNumber + '-' + formData.locSubPosition : ''}`}
                  </strong>
                </div>
                <div className="log-string-box">
                  {error ? (
                    <div style={{ textAlign: 'right' }}>
                      <span style={{ fontSize: '11px', display: 'block', marginBottom: '2px', color: '#fca5a5', opacity: 0.8, fontWeight: 'bold', letterSpacing: '0.05em' }}>LỖI HỆ THỐNG</span>
                      <strong style={{ color: '#ef4444', fontSize: '14px' }}>⚠️ {error}</strong>
                    </div>
                  ) : success ? (
                    <div style={{ textAlign: 'right' }}>
                      <span style={{ fontSize: '11px', display: 'block', marginBottom: '2px', color: '#6ee7b7', opacity: 0.8, fontWeight: 'bold', letterSpacing: '0.05em' }}>LỊCH SỬ NHẬP</span>
                      <strong style={{ color: '#10b981', fontSize: '14px' }}>✓ {success}</strong>
                    </div>
                  ) : (
                    <div style={{ textAlign: 'right' }}>
                      <span style={{ fontSize: '11px', display: 'block', marginBottom: '2px', opacity: 0.6, fontWeight: 'bold', letterSpacing: '0.05em' }}>TRẠNG THÁI</span>
                      <strong style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>● Sẵn sàng...</strong>
                    </div>
                  )}
                </div>
              </div>

              {/* Actions Row: Camera & Submit Buttons side-by-side */}
              <div className="action-buttons-row">
                <button 
                  type="button" 
                  onClick={() => fileInputRef.current.click()} 
                  className="btn btn-camera action-btn-camera"
                >
                  {formData.imageUrl ? 'Chụp lại ảnh' : 'Mở Camera / Chụp Ảnh'}
                </button>
                
                {displayImageUrl && (
                  <div style={{ position: 'relative', display: 'inline-block' }}>
                    <img 
                      src={displayImageUrl} 
                      alt="Preview" 
                      className="import-image-preview-thumbnail-inline"
                    />
                    {!formData.imageUrl && sdrImageUrl && (
                      <span style={{
                        position: 'absolute',
                        bottom: '-5px',
                        left: '50%',
                        transform: 'translateX(-50%)',
                        background: 'rgba(59, 130, 246, 0.9)',
                        color: 'white',
                        fontSize: '9px',
                        padding: '1px 4px',
                        borderRadius: '3px',
                        whiteSpace: 'nowrap',
                        fontWeight: 'bold',
                        boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
                      }}>
                        Ảnh {activeShopObj?.name || 'Shop'}
                      </span>
                    )}
                  </div>
                )}

                <button 
                  type="submit" 
                  disabled={availableLetters.length === 0}
                  className="btn btn-primary action-btn-submit"
                >
                  Xác nhận Nhập Kho
                </button>
              </div>

              <input 
                type="file" 
                accept="image/*" 
                capture="environment" 
                ref={fileInputRef} 
                onChange={handleImageCapture} 
                style={{ display: 'none' }} 
              />
            </div>
          </form>
        )}
      </div>

        {/* Panel sản phẩm vừa nhập */}
        <div className="glass-panel import-recent-panel">
          <h2 className="import-recent-title">
            Vừa nhập kho
            <span className="import-recent-badge">{recentProducts.length}</span>
          </h2>

          {recentProducts.length === 0 ? (
            <div className="import-recent-empty">
              <span>📦</span>
              <p>Chưa có sản phẩm nào<br/>được nhập trong phiên này.</p>
            </div>
          ) : (
            <div className="import-recent-list">
              {recentProducts.map((p, i) => (
                <div
                  key={p.id}
                  className="import-recent-card"
                  style={{ animationDelay: `${i === 0 ? 0 : 0}ms` }}
                >
                  <div className="import-recent-qr">
                    <QRCodeSVG value={`${p.id}#${p.sku}`} size={40} />
                  </div>
                  <div className="import-recent-info">
                    <div className="import-recent-sku">{p.sku}</div>
                    <div className="import-recent-meta">
                      <span className="import-recent-shop">{p.shop}</span>
                      <span className="import-recent-loc">📍 {p.location}</span>
                    </div>
                    <div className="import-recent-id">ID #{p.id}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ImportPage;
