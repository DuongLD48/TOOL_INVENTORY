import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useSocket } from '../context/SocketContext';
import { MapPin, Box, ImageOff, Search, LayoutGrid, List, Map, Printer, Trash2, Smartphone, Image as ImageIcon, RefreshCw } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import './Dashboard.css';

const Dashboard = () => {
  const navigate = useNavigate();
  const [products, setProducts] = useState([]);
  const [search, setSearch] = useState('');
  const [selectedArea, setSelectedArea] = useState('ALL');
  const [selectedStatus, setSelectedStatus] = useState('ALL');
  const [viewMode, setViewMode] = useState('list');
  const [selectedCell, setSelectedCell] = useState(null); // { loc, products }
  const [showEmptyLocations, setShowEmptyLocations] = useState(false);
  const [mapListSubView, setMapListSubView] = useState('minimal'); // 'minimal' or 'image'
  const [mapListLayout, setMapListLayout] = useState('grid'); // 'grid' or 'stack'
  const [zoomedImage, setZoomedImage] = useState(null);
  const [syncingSdr, setSyncingSdr] = useState(false);
  const socket = useSocket();

  const fetchInventory = async () => {
    try {
      // Dùng URL tĩnh tạm thời hoặc dựa vào host
      const res = await fetch(`http://${window.location.hostname}:3001/api/inventory`);
      const result = await res.json();
      if (result.data) {
        setProducts(result.data);
      }
    } catch (error) {
      console.error('Failed to fetch inventory:', error);
    }
  };

  useEffect(() => {
    fetchInventory();
  }, []);

  useEffect(() => {
    if (!socket) return;

    socket.on('inventory_updated', (data) => {
      // Realtime Update!
      if (data.type === 'IMPORT') {
        setProducts((prev) => [...prev, data.product]);
      } else if (data.type === 'EXPORT') {
        setProducts((prev) => prev.filter((p) => p.id !== data.product.id));
      } else if (data.type === 'ASSIGN_ORDERS') {
        setProducts((prev) => prev.map(p => {
          const found = data.assignments.find(a => a.productId === p.id);
          if (found) {
            return { ...p, status: 'PENDING', orderId: found.orderId };
          }
          return p;
        }));
      } else if (data.type === 'RESTORE_STOCK' || data.type === 'UPDATE_IMAGE') {
        setProducts((prev) => prev.map(p => p.id === data.product.id ? data.product : p));
        setSelectedCell((prev) => {
          if (!prev) return null;
          const updatedProducts = prev.products.map(p => p.id === data.product.id ? data.product : p);
          return { ...prev, products: updatedProducts };
        });
      }
    });

    return () => {
      socket.off('inventory_updated');
    };
  }, [socket]);

  // Lấy danh sách các chữ cái đầu của vị trí để làm bộ lọc khu vực (A, B, C...)
  const areas = Array.from(
    new Set(
      products
        .map(p => p.location ? p.location.trim().charAt(0).toUpperCase() : '')
        .filter(char => /^[A-Z]$/.test(char))
    )
  ).sort();

  // Định nghĩa các vị trí mặc định trong sơ đồ chính (Khu Trái A,B và Khu Phải C,D,E,F - mỗi hàng 6 ô)
  const defaultLocations = [
    'A1', 'A2', 'A3', 'A4', 'A5', 'A6',
    'B1', 'B2', 'B3', 'B4', 'B5', 'B6',
    'C1', 'C2', 'C3', 'C4', 'C5', 'C6',
    'D1', 'D2', 'D3', 'D4', 'D5', 'D6',
    'E1', 'E2', 'E3', 'E4', 'E5', 'E6'
  ];

  // Lấy danh sách các sản phẩm thuộc ô chứa loc (ví dụ 'A1')
  const getProductsInLoc = (loc) => {
    return products.filter(p => {
      if (!p.location) return false;
      const cleanPLoc = p.location.trim().toUpperCase();
      const cleanLoc = loc.trim().toUpperCase();
      return cleanPLoc === cleanLoc || cleanPLoc.startsWith(`${cleanLoc}-`);
    });
  };

  // Lấy các vị trí chi tiết đang hoạt động từ cơ sở dữ liệu (ví dụ A1-1, A1-2...)
  const activeLocations = Array.from(
    new Set(
      products
        .map(p => p.location ? p.location.trim().toUpperCase() : '')
        .filter(Boolean)
    )
  ).sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));

  // Helper để xác định danh sách các vị trí hiển thị cho view Bố cục List
  const getAllLayoutLocations = () => {
    if (showEmptyLocations) {
      // Tạo danh sách vị trí mặc định (A1-1 -> E6-25), bỏ hàng F
      const standardLocations = [];
      ['A', 'B', 'C', 'D', 'E'].forEach(letter => {
        for (let num = 1; num <= 6; num++) {
          for (let sub = 1; sub <= 25; sub++) {
            standardLocations.push(`${letter}${num}-${sub}`);
          }
        }
      });
      // Kết hợp với vị trí khác ngoài sơ đồ chuẩn
      const extraLocations = activeLocations.filter(loc => !standardLocations.includes(loc));
      return [...standardLocations, ...extraLocations].sort((a, b) => 
        a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
      );
    } else {
      // Chỉ hiển thị các vị trí đang thực sự chứa hàng
      return activeLocations;
    }
  };

  const allLayoutLocations = getAllLayoutLocations();

  // Helper để xác định xem vị trí chi tiết (ví dụ 'A1-5') có khớp bộ lọc hay không
  const isCellVisible = (loc) => {
    // 1. Lọc theo khu vực (Khu A, Khu B...)
    if (selectedArea !== 'ALL') {
      if (!loc.startsWith(selectedArea)) return false;
    }

    // Lọc theo trạng thái
    if (selectedStatus !== 'ALL') {
      const cellProducts = products.filter(p => p.location && p.location.trim().toUpperCase() === loc);
      if (!cellProducts.some(p => p.status === selectedStatus)) return false;
    }

    // 2. Lọc theo nội dung tìm kiếm
    const query = search.trim().toLowerCase();
    if (!query) return true;

    // Nếu tên vị trí khớp trực tiếp với ô tìm kiếm
    if (loc.toLowerCase().includes(query)) return true;

    // Tìm sản phẩm ở vị trí này để so khớp thông tin sản phẩm
    const cellProducts = products.filter(p => p.location && p.location.trim().toUpperCase() === loc);
    return cellProducts.some(product => {
      const combinedIdSku = `${product.id}#${product.sku}`.toLowerCase();
      return (
        product.sku?.toLowerCase().includes(query) ||
        String(product.id) === query ||
        combinedIdSku.includes(query) ||
        product.shop?.toLowerCase().includes(query) ||
        product.orderId?.toLowerCase().includes(query)
      );
    });
  };

  // Helper để xác định xem ô chứa lớn (ví dụ 'A1') có khớp bộ lọc hay không (để làm mờ sơ đồ)
  const isCompartmentVisible = (loc) => {
    // 1. Lọc theo khu vực (Khu A, Khu B...)
    if (selectedArea !== 'ALL') {
      if (!loc.startsWith(selectedArea)) return false;
    }

    // Lọc theo trạng thái
    const cellProducts = getProductsInLoc(loc);
    if (selectedStatus !== 'ALL') {
      if (!cellProducts.some(p => p.status === selectedStatus)) return false;
    }

    // 2. Lọc theo nội dung tìm kiếm
    const query = search.trim().toLowerCase();
    if (!query) return true;

    // Nếu tên ô chứa khớp trực tiếp
    if (loc.toLowerCase().includes(query)) return true;

    if (cellProducts.length === 0) return false;

    return cellProducts.some(product => {
      const combinedIdSku = `${product.id}#${product.sku}`.toLowerCase();
      return (
        product.sku?.toLowerCase().includes(query) ||
        String(product.id) === query ||
        combinedIdSku.includes(query) ||
        product.shop?.toLowerCase().includes(query) ||
        product.location?.toLowerCase().includes(query) ||
        product.orderId?.toLowerCase().includes(query)
      );
    });
  };

  // Danh sách các vị trí sau khi đã lọc qua search & selectedArea (Dùng cho view Bố cục List)
  const filteredLayoutLocations = allLayoutLocations.filter(loc => isCellVisible(loc));

  // Thu thập các ô chứa lớn hoạt động để tìm các ô nằm ngoài sơ đồ chính
  const activeCompartments = Array.from(
    new Set(
      products
        .map(p => {
          if (!p.location) return '';
          const cleanLoc = p.location.trim().toUpperCase();
          const parts = cleanLoc.split('-');
          return parts[0]; // Ví dụ A1
        })
        .filter(Boolean)
    )
  );

  const otherLocations = activeCompartments.filter(comp => !defaultLocations.includes(comp)).sort();

  const allLetters = ['A', 'B', 'C', 'D', 'E'];
  activeCompartments.forEach(comp => {
    const char = comp.charAt(0);
    if (!allLetters.includes(char) && /^[A-Z]$/.test(char)) {
      allLetters.push(char);
    }
  });
  allLetters.sort();

  const lettersToDisplay = selectedArea === 'ALL'
    ? allLetters
    : allLetters.filter(l => l === selectedArea);

  const getCompartmentsForLetter = (letter) => {
    const standards = [1, 2, 3, 4, 5, 6].map(num => `${letter}${num}`);
    const extras = activeCompartments.filter(comp => comp.startsWith(letter) && !standards.includes(comp));
    return [...standards, ...extras].sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
  };

  const filteredProducts = products.filter(product => {
    // 1. Lọc theo khu vực (Khu A, Khu B...)
    if (selectedArea !== 'ALL') {
      const firstChar = product.location ? product.location.trim().charAt(0).toUpperCase() : '';
      if (firstChar !== selectedArea) return false;
    }

    // 2. Lọc theo trạng thái
    if (selectedStatus !== 'ALL') {
      if (product.status !== selectedStatus) return false;
    }

    // 3. Lọc theo nội dung tìm kiếm
    const query = search.trim().toLowerCase();
    if (!query) return true;
    
    const combinedIdSku = `${product.id}#${product.sku}`.toLowerCase();
    return (
      product.sku?.toLowerCase().includes(query) ||
      String(product.id) === query ||
      combinedIdSku.includes(query) ||
      product.shop?.toLowerCase().includes(query) ||
      product.location?.toLowerCase().includes(query) ||
      product.orderId?.toLowerCase().includes(query)
    );
  });

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
      
      setSelectedCell(prev => {
        if (!prev) return null;
        const updatedProducts = prev.products.filter(p => p.id !== product.id);
        if (updatedProducts.length === 0) return null;
        return { ...prev, products: updatedProducts };
      });
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
      
      setSelectedCell(prev => {
        if (!prev) return null;
        const updatedProducts = prev.products.map(p => p.id === product.id ? { ...p, status: 'IN_STOCK', orderId: null } : p);
        return { ...prev, products: updatedProducts };
      });
      alert('Khôi phục tồn kho thành công!');
    } catch (err) {
      alert(`Lỗi khôi phục: ${err.message}`);
    }
  };

  const handleUpdateImage = async (productId, file) => {
    if (!file) return;

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

    try {
      const base64Data = await compressImage(file);
      const res = await fetch(`http://${window.location.hostname}:3001/api/inventory/update-image`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: productId, imageUrl: base64Data })
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || 'Lỗi khi cập nhật ảnh.');
      
      setProducts((prev) => prev.map(p => p.id === productId ? result.data : p));
      setSelectedCell((prev) => {
        if (!prev) return null;
        const updatedProducts = prev.products.map(p => p.id === productId ? result.data : p);
        return { ...prev, products: updatedProducts };
      });
      alert('Cập nhật hình ảnh thành công!');
    } catch (err) {
      alert(`Lỗi cập nhật ảnh: ${err.message}`);
    }
  };

  const handleSyncShopImages = async () => {
    setSyncingSdr(true);
    try {
      const res = await fetch(`http://${window.location.hostname}:3001/api/inventory/sync-shop-images`, {
        method: 'POST'
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || 'Lỗi đồng bộ.');
      
      // Tải lại toàn bộ dữ liệu tồn kho để cập nhật UI
      await fetchInventory();
      alert(result.message);
    } catch (err) {
      alert(`Lỗi đồng bộ: ${err.message}`);
    } finally {
      setSyncingSdr(false);
    }
  };

  const renderMapCell = (loc) => {
    const cellProducts = getProductsInLoc(loc);
    const visible = isCompartmentVisible(loc);
    const count = cellProducts.length;
    
    if (count > 0) {
      const uniqueShops = Array.from(new Set(cellProducts.map(p => p.shop)));
      let shopClass = '';
      if (uniqueShops.length === 1) {
        const id = uniqueShops[0].toLowerCase();
        shopClass = `shop-${id === 'batt-bfg' ? 'batt' : id}`;
      } else {
        shopClass = 'shop-mixed';
      }

      const hasPending = cellProducts.some(p => p.status === 'PENDING');
      return (
        <div 
          onClick={() => setSelectedCell({ loc, products: cellProducts })}
          className={`map-cell-occupied ${shopClass} ${hasPending ? 'has-pending' : ''}`}
          style={{ opacity: visible ? 1 : 0.15 }}
        >
          {/* Location label */}
          <span className="map-cell-label">{loc}</span>
          
          {/* Item Count Badge (Top-Right) */}
          <span className="map-cell-count-badge">
            {count}
          </span>
          
          {/* Subtle dots/icons indicating shops */}
          <div className="map-cell-dots-container">
            {uniqueShops.map(shop => {
              const cleanShop = shop.toLowerCase();
              const dotClass = cleanShop === 'sdr' ? 'sdr' : cleanShop === 'batt-bfg' ? 'batt' : cleanShop;
              return (
                <span 
                  key={shop} 
                  className={`map-cell-dot ${dotClass}`}
                  title={shop}
                />
              );
            })}
          </div>
        </div>
      );
    } else {
      // Empty cell
      return (
        <div 
          onClick={() => setSelectedCell({ loc, products: [] })}
          className="map-cell-empty"
          style={{ opacity: visible ? 1 : 0.15 }}
        >
          {loc}
        </div>
      );
    }
  };

  return (
    <div className="animate-fade-in">
      <div className="dashboard-header-container">
        <h1>
          {viewMode === 'map' ? 'Sơ đồ & Bố cục Kho' : 'Tổng quan Tồn kho'}{' '}
          {(search || selectedArea !== 'ALL' || selectedStatus !== 'ALL') 
            ? `(${viewMode === 'map' ? filteredLayoutLocations.length : filteredProducts.length}/${viewMode === 'map' ? allLayoutLocations.length : products.length})` 
            : `(${viewMode === 'map' ? allLayoutLocations.length : products.length})`}
        </h1>
        
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
          <button
            onClick={handleSyncShopImages}
            disabled={syncingSdr}
            className="btn btn-secondary sync-sdr-btn"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '13px',
              padding: '8px 14px',
              fontWeight: 'bold',
              height: '38px',
              boxSizing: 'border-box'
            }}
          >
            <RefreshCw size={14} className={syncingSdr ? 'spin-animation' : ''} />
            {syncingSdr ? 'Đang đồng bộ...' : 'Đồng bộ ảnh Shop'}
          </button>

          {/* Toggle chế độ hiển thị */}
          <div className="glass-panel view-mode-toggle-container" style={{ height: '38px', boxSizing: 'border-box', alignItems: 'center' }}>
            <button
              onClick={() => setViewMode('list')}
              className={`view-mode-toggle-btn ${viewMode === 'list' ? 'active' : ''}`}
            >
              <List size={16} /> Tồn kho (List)
            </button>
            <button
              onClick={() => setViewMode('grid')}
              className={`view-mode-toggle-btn ${viewMode === 'grid' ? 'active' : ''}`}
            >
              <LayoutGrid size={16} /> Tồn kho (Lưới)
            </button>
            <button
              onClick={() => setViewMode('map')}
              className={`view-mode-toggle-btn ${viewMode === 'map' ? 'active' : ''}`}
            >
              <Map size={16} /> Sơ đồ kho
            </button>
          </div>
        </div>
      </div>

      {/* Thanh tìm kiếm */}
      <div className="glass-panel search-bar-wrapper">
        <Search size={18} style={{ color: 'var(--text-secondary)', flexShrink: 0 }} />
        <input
          type="text"
          placeholder="Tìm kiếm theo SKU, ID, vị trí, shop..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="search-input-field"
        />
        {search && (
          <button onClick={() => setSearch('')} className="clear-search-button">×</button>
        )}
      </div>

      {/* Bộ lọc khu vực (vị trí A, B, C...) */}
      {areas.length > 0 && (
        <div className="area-filter-wrapper" style={{ marginBottom: '16px' }}>
          <span className="area-filter-title">Khu vực:</span>
          <button
            onClick={() => setSelectedArea('ALL')}
            className={`area-filter-button ${selectedArea === 'ALL' ? 'active' : ''}`}
          >
            Tất cả
          </button>
          {areas.map(area => (
            <button
              key={area}
              onClick={() => setSelectedArea(area)}
              className={`area-filter-button ${selectedArea === area ? 'active' : ''}`}
            >
              Khu {area}
            </button>
          ))}
        </div>
      )}

      {/* Bộ lọc trạng thái (Sẵn có / Chờ lấy hàng) */}
      <div className="area-filter-wrapper" style={{ marginBottom: '24px' }}>
        <span className="area-filter-title">Trạng thái:</span>
        <button
          onClick={() => setSelectedStatus('ALL')}
          className={`area-filter-button ${selectedStatus === 'ALL' ? 'active' : ''}`}
        >
          Tất cả ({products.length})
        </button>
        <button
          onClick={() => setSelectedStatus('IN_STOCK')}
          className={`area-filter-button ${selectedStatus === 'IN_STOCK' ? 'active' : ''}`}
        >
          Sẵn có ({products.filter(p => p.status === 'IN_STOCK').length})
        </button>
        <button
          onClick={() => setSelectedStatus('PENDING')}
          className={`area-filter-button ${selectedStatus === 'PENDING' ? 'active' : ''}`}
        >
          Chờ lấy hàng ({products.filter(p => p.status === 'PENDING').length})
        </button>
      </div>
      
      {viewMode === 'list' && (
        /* LIST VIEW */
        <div className="list-view-list">
          {filteredProducts.map(product => (
            <div 
              key={product.id} 
              className="glass-panel list-view-card"
            >
              {/* Ảnh nhỏ */}
              <div className="list-view-card-image-box">
                {product.imageUrl ? (
                  <img src={product.imageUrl.startsWith('/') ? `http://${window.location.hostname}:3001${product.imageUrl}` : product.imageUrl} alt={product.sku} loading="lazy" />
                ) : (
                  <ImageOff size={20} style={{ opacity: 0.3 }} />
                )}
              </div>

              {/* ID + Shop Badges + SKU */}
              <div className="list-view-card-info">
                <span className="badge-id">
                  {product.id}
                </span>
                <span className="badge-shop">
                  {product.shop}
                </span>
                <span className="sku-text">
                  {product.sku}
                </span>
                {product.status === 'PENDING' && (
                  <span className="badge-pending">
                    CHỜ LẤY HÀNG {product.orderId ? `(${product.orderId})` : ''}
                  </span>
                )}
              </div>

              {/* Vị trí */}
              <div className="location-text-badge">
                <MapPin size={16} />
                {product.location || 'N/A'}
              </div>
            </div>
          ))}
          {filteredProducts.length === 0 && (
            <div className="empty-state-container">
              <Box size={48} className="empty-state-icon" />
              <p>{search ? 'Không tìm thấy sản phẩm nào khớp với tìm kiếm.' : 'Kho hàng đang trống. Hãy nhập kho sản phẩm đầu tiên!'}</p>
            </div>
          )}
        </div>
      )}

      {viewMode === 'grid' && (
        /* GRID VIEW */
        <div className="grid-view-grid">
          {filteredProducts.map(product => (
            <div key={product.id} className={`glass-panel grid-view-card ${product.status === 'PENDING' ? 'status-pending' : ''}`}>
              
              {/* Ảnh Sản Phẩm */}
              <div className="grid-view-card-image-box">
                {product.imageUrl ? (
                  <img src={product.imageUrl.startsWith('/') ? `http://${window.location.hostname}:3001${product.imageUrl}` : product.imageUrl} alt={`${product.id}#${product.sku}`} loading="lazy" />
                ) : (
                  <div className="grid-view-no-image-box">
                    <ImageOff size={40} style={{ opacity: 0.5 }} />
                    <span className="grid-view-no-image-text">Không có ảnh</span>
                  </div>
                )}
              </div>

              {/* Thông Tin Sản Phẩm */}
              <div className="grid-view-card-footer">
                <div className="grid-view-card-footer-info" style={{ flexWrap: 'wrap', gap: '4px' }}>
                  <span className="badge-id">
                    {product.id}
                  </span>
                  <span className="badge-shop">
                    {product.shop}
                  </span>
                  <span className="sku-text">
                    {product.sku}
                  </span>
                  {product.status === 'PENDING' && (
                    <span className="badge-pending" style={{ fontSize: '10px', padding: '2px 6px' }}>
                      PENDING {product.orderId ? `(${product.orderId})` : ''}
                    </span>
                  )}
                </div>
                <span className="location-text-badge">
                  <MapPin size={16} />
                  {product.location || 'N/A'}
                </span>
              </div>
            </div>
          ))}
          {filteredProducts.length === 0 && (
            <div style={{ gridColumn: '1 / -1' }} className="empty-state-container">
              <Box size={48} className="empty-state-icon" />
              <p>{search ? 'Không tìm thấy sản phẩm nào khớp với tìm kiếm.' : 'Kho hàng đang trống. Hãy nhập kho sản phẩm đầu tiên!'}</p>
            </div>
          )}
        </div>
      )}

      {viewMode === 'map' && (
        /* WAREHOUSE MAP VIEW */
        <div className="map-view-layout">
          <div className="map-panels-flex">
            {/* KHỐI TRÁI: A */}
            <div className="glass-panel map-panel-card">
              <h3 className="map-panel-title">
                Khối kệ Trái (Hàng A)
              </h3>
              <div className="map-rows-flex">
                {/* Hàng A */}
                <div className="map-row-cells">
                  {['A1', 'A2', 'A3', 'A4', 'A5', 'A6'].map((loc) => (
                    <div key={loc}>{renderMapCell(loc)}</div>
                  ))}
                </div>
              </div>
            </div>

            {/* KHỐI PHẢI: B, C, D, E */}
            <div className="glass-panel map-panel-card">
              <h3 className="map-panel-title">
                Khối kệ Phải (Hàng B - E)
              </h3>
              <div className="map-rows-flex">
                {/* Hàng B */}
                <div className="map-row-cells">
                  {['B1', 'B2', 'B3', 'B4', 'B5', 'B6'].map((loc) => (
                    <div key={loc}>{renderMapCell(loc)}</div>
                  ))}
                </div>
                {/* Hàng C */}
                <div className="map-row-cells">
                  {['C1', 'C2', 'C3', 'C4', 'C5', 'C6'].map((loc) => (
                    <div key={loc}>{renderMapCell(loc)}</div>
                  ))}
                </div>
                {/* Hàng D */}
                <div className="map-row-cells">
                  {['D1', 'D2', 'D3', 'D4', 'D5', 'D6'].map((loc) => (
                    <div key={loc}>{renderMapCell(loc)}</div>
                  ))}
                </div>
                {/* Hàng E */}
                <div className="map-row-cells">
                  {['E1', 'E2', 'E3', 'E4', 'E5', 'E6'].map((loc) => (
                    <div key={loc}>{renderMapCell(loc)}</div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Vị trí khác ngoài sơ đồ chính */}
          {otherLocations.length > 0 && (
            <div className="glass-panel map-other-locations-panel">
              <h3 className="map-other-locations-title">
                Vị trí khác ngoài sơ đồ chính
              </h3>
              <div className="map-other-locations-grid">
                {otherLocations.map(loc => (
                  <div key={loc}>{renderMapCell(loc)}</div>
                ))}
              </div>
            </div>
          )}

          {/* MAP LIST VIEW */}
          <div className="glass-panel map-list-container">
            
            {/* Checkbox điều khiển hiển thị ô trống, Bố cục & Chế độ xem hàng */}
            <div className="map-list-toggle-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', flexWrap: 'wrap', gap: '16px', marginBottom: '16px' }}>
              <label className="map-list-toggle-label">
                <input 
                  type="checkbox" 
                  checked={showEmptyLocations} 
                  onChange={(e) => setShowEmptyLocations(e.target.checked)} 
                  className="map-list-toggle-input"
                />
                <span>Hiển thị tất cả vị trí nhỏ trống (mặc định chỉ hiển thị vị trí có hàng)</span>
              </label>
              
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                {/* Chọn bố cục hiển thị ô kệ */}
                <div className="glass-panel" style={{ display: 'flex', padding: '2px', gap: '2px', borderRadius: '8px', background: 'rgba(255,255,255,0.03)' }}>
                  <button
                    onClick={() => setMapListLayout('grid')}
                    className={`view-mode-toggle-btn ${mapListLayout === 'grid' ? 'active' : ''}`}
                    style={{ padding: '4px 10px', fontSize: '12px', borderRadius: '6px' }}
                  >
                    Bố cục Ngang (6 Ô)
                  </button>
                  <button
                    onClick={() => setMapListLayout('stack')}
                    className={`view-mode-toggle-btn ${mapListLayout === 'stack' ? 'active' : ''}`}
                    style={{ padding: '4px 10px', fontSize: '12px', borderRadius: '6px' }}
                  >
                    Bố cục Dọc (Dưới nhau)
                  </button>
                </div>

                {/* Chọn kiểu hiển thị sản phẩm */}
                <div className="glass-panel" style={{ display: 'flex', padding: '2px', gap: '2px', borderRadius: '8px', background: 'rgba(255,255,255,0.03)' }}>
                  <button
                    onClick={() => setMapListSubView('minimal')}
                    className={`view-mode-toggle-btn ${mapListSubView === 'minimal' ? 'active' : ''}`}
                    style={{ padding: '4px 10px', fontSize: '12px', borderRadius: '6px' }}
                  >
                    Tối giản (Chữ)
                  </button>
                  <button
                    onClick={() => setMapListSubView('image')}
                    className={`view-mode-toggle-btn ${mapListSubView === 'image' ? 'active' : ''}`}
                    style={{ padding: '4px 10px', fontSize: '12px', borderRadius: '6px' }}
                  >
                    Hiển thị ảnh lớn
                  </button>
                </div>
              </div>
            </div>

            {lettersToDisplay.map(letter => {
              const comps = getCompartmentsForLetter(letter);
              
              // Lọc các ô chứa dựa trên các sản phẩm bên trong khớp với tìm kiếm/bộ lọc
              const visibleComps = comps.filter(comp => {
                const compProducts = getProductsInLoc(comp);
                const filteredCompProducts = compProducts.filter(product => {
                  if (selectedStatus !== 'ALL' && product.status !== selectedStatus) return false;
                  const query = search.trim().toLowerCase();
                  if (!query) return true;
                  const combinedIdSku = `${product.id}#${product.sku}`.toLowerCase();
                  return (
                    product.sku?.toLowerCase().includes(query) ||
                    String(product.id) === query ||
                    combinedIdSku.includes(query) ||
                    product.shop?.toLowerCase().includes(query) ||
                    product.location?.toLowerCase().includes(query) ||
                    product.orderId?.toLowerCase().includes(query)
                  );
                });

                if (showEmptyLocations && selectedStatus === 'ALL') return true;
                return filteredCompProducts.length > 0;
              });

              if (visibleComps.length === 0) return null;

              return (
                <div key={letter} className="map-list-row-group">
                  <h3 className="map-list-row-title">Khu {letter}</h3>
                  <div className={`map-list-columns-grid ${mapListLayout}`}>
                    {visibleComps.map(comp => {
                      const compProducts = getProductsInLoc(comp);
                      
                      // Lọc sản phẩm theo tìm kiếm
                      const filteredCompProducts = compProducts.filter(product => {
                        if (selectedStatus !== 'ALL' && product.status !== selectedStatus) return false;
                        const query = search.trim().toLowerCase();
                        if (!query) return true;
                        const combinedIdSku = `${product.id}#${product.sku}`.toLowerCase();
                        return (
                          product.sku?.toLowerCase().includes(query) ||
                          String(product.id) === query ||
                          combinedIdSku.includes(query) ||
                          product.shop?.toLowerCase().includes(query) ||
                          product.location?.toLowerCase().includes(query) ||
                          product.orderId?.toLowerCase().includes(query)
                        );
                      });

                      return (
                        <div key={comp} className="map-list-column-card">
                          <div className="map-list-column-header">
                            <span className="map-list-column-label">{comp}</span>
                            {compProducts.length > 0 ? (
                              <span className="map-list-column-status occupied">
                                Có {compProducts.length} SP
                              </span>
                            ) : (
                              <span className="map-list-column-status empty">Trống</span>
                            )}
                          </div>
                          
                          <div className="map-list-column-products">
                            {filteredCompProducts.map(product => {
                              const subPos = product.location && product.location.includes('-') 
                                ? product.location.split('-')[1] 
                                : '1';
                                
                              if (mapListSubView === 'image') {
                                return (
                                  <div 
                                    key={product.id} 
                                    className={`map-list-product-item-image-mode ${product.status === 'PENDING' ? 'status-pending' : ''}`}
                                    onClick={() => setSelectedCell({ loc: comp, products: [product] })}
                                    title={product.status === 'PENDING' ? `Chờ lấy hàng (${product.orderId})` : "Xem chi tiết sản phẩm"}
                                  >
                                    <div className="map-list-product-img-box-34">
                                      {product.imageUrl ? (
                                        <img 
                                          src={product.imageUrl.startsWith('/') ? `http://${window.location.hostname}:3001${product.imageUrl}` : product.imageUrl} 
                                          alt={product.sku} 
                                          loading="lazy"
                                        />
                                      ) : (
                                        <ImageOff size={24} style={{ opacity: 0.3 }} />
                                      )}
                                    </div>
                                    <div className="map-list-product-img-details">
                                      <div style={{ display: 'flex', gap: '4px', justifyContent: 'center', marginBottom: '4px', flexWrap: 'wrap' }}>
                                        <span className="badge-subpos-minimal">#{subPos}</span>
                                        <span className="badge-shop-minimal">{product.shop}</span>
                                      </div>
                                      <div className="sku-text-image-mode" title={product.sku}>{product.sku}</div>
                                      {product.status === 'PENDING' && (
                                        <span className="badge-pending" style={{ fontSize: '9px', padding: '2px 4px', marginTop: '4px' }}>PENDING</span>
                                      )}
                                    </div>
                                  </div>
                                );
                              } else {
                                return (
                                  <div 
                                    key={product.id} 
                                    className={`map-list-product-item-minimal ${product.status === 'PENDING' ? 'status-pending' : ''}`}
                                    onClick={() => setSelectedCell({ loc: comp, products: [product] })}
                                    title={product.status === 'PENDING' ? `Chờ lấy hàng (${product.orderId})` : "Xem chi tiết sản phẩm"}
                                  >
                                    <span className="badge-subpos-minimal">#{subPos}</span>
                                    <span className="badge-shop-minimal">{product.shop}</span>
                                    <span className="sku-text-minimal">{product.sku}</span>
                                    {product.status === 'PENDING' && (
                                      <span className="badge-pending-dot" style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#c084fc', marginLeft: 'auto' }} />
                                    )}
                                  </div>
                                );
                              }
                            })}
                            
                            {filteredCompProducts.length === 0 && compProducts.length > 0 && (
                              <span className="map-list-empty-placeholder" style={{ fontSize: '12px', textAlign: 'center', display: 'block', padding: '10px 0' }}>
                                Không khớp bộ lọc
                              </span>
                            )}

                            {compProducts.length === 0 && (
                              <div style={{ textAlign: 'center', padding: '12px 0' }}>
                                <button 
                                  onClick={() => {
                                    const letterChar = comp.charAt(0);
                                    const num = comp.substring(1);
                                    navigate(`/operations/import?letter=${letterChar}&number=${num}&sub=1`);
                                  }}
                                  className="map-list-btn-import"
                                  style={{ width: '100%', fontSize: '11px', padding: '6px' }}
                                >
                                  Nhập kho
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}

            {/* Kiểm tra nếu không có vị trí nào khớp bộ lọc */}
            {lettersToDisplay.every(letter => {
              const comps = getCompartmentsForLetter(letter);
              const visibleComps = comps.filter(comp => {
                const compProducts = getProductsInLoc(comp);
                if (showEmptyLocations) return true;
                return compProducts.some(product => {
                  const query = search.trim().toLowerCase();
                  if (!query) return true;
                  const combinedIdSku = `${product.id}#${product.sku}`.toLowerCase();
                  return (
                    product.sku?.toLowerCase().includes(query) ||
                    String(product.id) === query ||
                    combinedIdSku.includes(query) ||
                    product.shop?.toLowerCase().includes(query) ||
                    product.location?.toLowerCase().includes(query)
                  );
                });
              });
              return visibleComps.length === 0;
            }) && (
              <div className="map-list-empty-state">
                Không tìm thấy vị trí nào khớp bộ lọc.
              </div>
            )}
          </div>
        </div>
      )}

      {/* DETAIL MODAL OVERLAY */}
      {selectedCell && createPortal(
        <div className="modal-backdrop-overlay">
          <div className={`modal-glass-container ${selectedCell.products.length > 0 ? 'modal-large' : ''}`}>
            <div className="modal-header-section">
              <h2 className="modal-header-title">
                Kệ ô: {selectedCell.loc} ({selectedCell.products.length} sản phẩm)
              </h2>
              <button 
                onClick={() => setSelectedCell(null)}
                className="modal-close-button"
              >
                &times;
              </button>
            </div>

            {selectedCell.products.length > 0 ? (
              <div className="modal-body-section">
                {/* Scrollable list of products */}
                <div className="modal-products-scrollable-list">
                  {selectedCell.products.map(product => {
                    const subPos = product.location.includes('-') ? product.location.split('-')[1] : '1';
                    return (
                      <div 
                        key={product.id} 
                        className={`modal-product-card-item ${product.status === 'PENDING' ? 'status-pending' : ''}`}
                      >
                        <div className="modal-product-card-flex">
                          {/* Small thumbnail */}
                          <div 
                            className="modal-product-thumbnail-box"
                            onClick={() => {
                              if (product.imageUrl) {
                                const imgUrl = product.imageUrl.startsWith('/') 
                                  ? `http://${window.location.hostname}:3001${product.imageUrl}` 
                                  : product.imageUrl;
                                setZoomedImage(imgUrl);
                              }
                            }}
                            title="Click để phóng to ảnh"
                          >
                            {product.imageUrl ? (
                              <img 
                                src={product.imageUrl.startsWith('/') ? `http://${window.location.hostname}:3001${product.imageUrl}` : product.imageUrl} 
                                alt={product.sku} 
                              />
                            ) : (
                              <ImageOff size={48} style={{ opacity: 0.3 }} />
                            )}
                          </div>
                          {/* Info */}
                          <div className="modal-product-info-details">
                            <div className="modal-product-location-header">
                              <span className="modal-product-location-text">
                                Vị trí: {product.location} (Ô nhỏ #{subPos})
                              </span>
                              <span className="modal-product-id-badge">
                                ID: {product.id}
                              </span>
                            </div>
                            <div className="modal-product-sku-name">
                              {product.sku}
                            </div>
                            <div className="modal-product-shop-created">
                              Shop: <strong>{product.shop}</strong> | Nhập: {new Date(product.createdAt).toLocaleString('vi-VN')}
                            </div>
                            {product.status === 'PENDING' && (
                              <div style={{ marginTop: '4px' }}>
                                <span className="badge-pending">
                                  CHỜ LẤY HÀNG {product.orderId ? `(Đơn: ${product.orderId})` : ''}
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
                        {/* Action buttons */}
                        <div className="modal-product-card-actions">
                          {product.status === 'PENDING' && (
                            <button
                              onClick={() => handleRestoreProduct(product)}
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
                                  handleUpdateImage(product.id, file);
                                }
                              }}
                              style={{ display: 'none' }}
                            />
                          </label>
                          <button 
                            onClick={() => handlePrintProduct(product)}
                            className="btn btn-primary modal-product-btn-print" 
                          >
                            <Printer size={12} /> In Tem
                          </button>
                          <button 
                            onClick={() => handleExportProduct(product)}
                            className="btn modal-product-btn-export" 
                          >
                            Xuất Kho
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Button to import more into this compartment */}
                <div className="modal-import-more-container">
                  <button
                    onClick={() => {
                      const letter = selectedCell.loc.charAt(0);
                      const number = selectedCell.loc.substring(1);
                      // Tìm vị trí nhỏ trống đầu tiên dựa trên tất cả sản phẩm thực tế của ô này
                      const allCompProducts = getProductsInLoc(selectedCell.loc);
                      const occupiedSubs = allCompProducts.map(p => {
                        const parts = p.location.split('-');
                        return parts.length > 1 ? parseInt(parts[1], 10) : 0;
                      });
                      let nextEmptySub = 1;
                      while (occupiedSubs.includes(nextEmptySub) && nextEmptySub <= 25) {
                        nextEmptySub++;
                      }
                      setSelectedCell(null);
                      if (nextEmptySub <= 25) {
                        navigate(`/operations/import?letter=${letter}&number=${number}&sub=${nextEmptySub}`);
                      } else {
                        alert('Kệ ô này đã đầy 25 vị trí nhỏ!');
                      }
                    }}
                    className="btn btn-primary modal-import-more-btn"
                  >
                    Nhập thêm sản phẩm mới vào ô này
                  </button>
                </div>
              </div>
            ) : (
              <div>
                <p className="modal-empty-description">
                  Vị trí <strong>{selectedCell.loc}</strong> hiện đang trống và sẵn sàng để lưu trữ hàng hóa mới (chứa tối đa 25 vị trí nhỏ từ {selectedCell.loc}-1 tới {selectedCell.loc}-25).
                </p>
                <div className="modal-empty-actions-row">
                  <button 
                    onClick={() => {
                      const letter = selectedCell.loc.charAt(0);
                      const number = selectedCell.loc.substring(1);
                      setSelectedCell(null);
                      navigate(`/operations/import?letter=${letter}&number=${number}&sub=1`);
                    }}
                    className="btn btn-primary modal-empty-btn-confirm"
                  >
                    Nhập kho vị trí #1
                  </button>
                  <button 
                    onClick={() => setSelectedCell(null)}
                    className="btn modal-empty-btn-cancel"
                  >
                    Hủy
                  </button>
                </div>
              </div>
            )}
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

export default Dashboard;
