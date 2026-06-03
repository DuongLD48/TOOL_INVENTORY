import React, { useState, useEffect } from 'react';
import { useSocket } from '../context/SocketContext';
import { ClipboardList, CheckCircle2, XCircle, AlertCircle, Copy, Check, ArrowRight } from 'lucide-react';
import './OrderMatchingPage.css';

const OrderMatchingPage = () => {
  const [shops, setShops] = useState([
    { id: 'SDR', name: 'SDR', skuPrefix: 'SYC', requireNumberSku: true, requireCamera: false, autoImageFolder: true },
    { id: 'BATT-BFG', name: 'BATT-BFG', skuPrefix: '', requireNumberSku: false, requireCamera: true, autoImageFolder: false }
  ]);
  const [rawText, setRawText] = useState('');
  const [matchingMode, setMatchingMode] = useState('sku_only'); // 'sku_only' or 'replace_drive'
  const [selectedShop, setSelectedShop] = useState('SDR'); // 'SDR', 'BATT-BFG' or 'OTHER'
  const [parsedOrders, setParsedOrders] = useState([]);
  const [inStockProducts, setInStockProducts] = useState([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [copied, setCopied] = useState(false);
  const socket = useSocket();

  // Load products in-stock
  const fetchInStockProducts = async () => {
    try {
      const res = await fetch(`http://${window.location.hostname}:3001/api/inventory`);
      const result = await res.json();
      if (result.data) {
        setInStockProducts(result.data);
      }
    } catch (err) {
      console.error('Lỗi tải tồn kho:', err);
    }
  };

  // Load shops configuration
  useEffect(() => {
    const fetchShops = async () => {
      try {
        const res = await fetch(`http://${window.location.hostname}:3001/api/shops`);
        const result = await res.json();
        if (result.success && result.data && result.data.length > 0) {
          setShops(result.data);
          setSelectedShop(result.data[0].id);
        }
      } catch (err) {
        console.error('Lỗi tải danh sách shop:', err);
      }
    };
    fetchShops();
  }, []);

  useEffect(() => {
    fetchInStockProducts();
  }, []);

  // Update realtime if other actions happen
  useEffect(() => {
    if (!socket) return;

    const handleUpdate = () => {
      fetchInStockProducts();
    };

    socket.on('inventory_updated', handleUpdate);
    return () => {
      socket.off('inventory_updated', handleUpdate);
    };
  }, [socket]);

  // Parse and match helper
  const handleParseAndMatch = () => {
    setErrorMsg('');
    setSuccessMsg('');
    if (!rawText.trim()) {
      setErrorMsg('Vui lòng nhập dữ liệu đơn hàng thô.');
      return;
    }

    const lines = rawText.split('\n');
    const skuRegex = /(\d{4}[A-Z]+-[A-Z0-9]+)/i;
    
    // Parse raw text
    const parsed = lines.map((line, index) => {
      if (!line.trim()) return null;

      // Chia theo tab trước để giữ nguyên cấu trúc cột Excel
      let parts = line.split('\t');
      if (parts.length === 1) {
        // Fallback chia theo 2 khoảng trắng trở lên
        parts = line.split(/ {2,}/);
      }

      let skuIndex = -1;
      let orderIdIndex = -1;
      let driveLinkIndex = -1;
      let driveLink = '';
      let rawSku = '';
      let orderId = '';
      let date = '';

      const activeShop = shops.find(s => s.id === selectedShop);
      const isNumberSkuShop = activeShop ? activeShop.requireNumberSku : (selectedShop === 'SDR');

      if (matchingMode === 'replace_drive') {
        skuIndex = 3;
        orderIdIndex = 1;
        rawSku = parts[3] ? parts[3].trim() : '';
        orderId = parts[1] ? parts[1].trim() : '';
        date = parts[0] ? parts[0].trim() : '';
      } else if (isNumberSkuShop) {
        skuIndex = 1;
        rawSku = parts[1] ? parts[1].trim() : '';
        date = parts[0] ? parts[0].trim() : '';
        if (date) {
          date = date.replace(/Đơn\s*hàng/gi, '').trim();
        }

        // Quét ngược từ cuối dòng để tìm cột chứa mã đơn hàng (có dấu # hoặc chứa tên shop)
        const shopLower = selectedShop.toLowerCase();
        for (let i = parts.length - 1; i >= 0; i--) {
          const cell = parts[i].trim();
          if (cell.includes('#') || cell.toLowerCase().includes(shopLower)) {
            orderIdIndex = i;
            orderId = cell;
            break;
          }
        }
        
        // Fallback nếu không quét thấy
        if (orderIdIndex === -1 && parts.length > 0) {
          orderIdIndex = parts.length - 1;
          orderId = parts[parts.length - 1].trim();
        }
      } else {
        // Quét tìm cột SKU, cột Mã đơn hàng (bắt đầu bằng #), và cột Google Drive link
        for (let i = 0; i < parts.length; i++) {
          const cell = parts[i].trim();
          if (cell.match(skuRegex) || (activeShop?.skuPrefix && cell.toUpperCase().startsWith(activeShop.skuPrefix))) {
            skuIndex = i;
          }
          if (cell.startsWith('#') && !cell.includes('/') && !cell.includes('.')) {
            orderIdIndex = i;
          }
          if (cell.includes('drive.google.com') || cell.includes('drive/folders')) {
            driveLinkIndex = i;
            driveLink = cell;
          }
        }

        // Fallbacks nếu không tìm thấy rõ ràng
        if (skuIndex === -1 && parts.length > 0) {
          for (let i = parts.length - 1; i >= 0; i--) {
            if (parts[i].trim() && !parts[i].includes('drive.google.com')) {
              skuIndex = i;
              break;
            }
          }
        }

        if (orderIdIndex === -1 && parts.length > 0) {
          // Tìm cột đầu tiên chứa text bắt đầu bằng # hoặc có dạng shop id
          const shopLower = selectedShop.toLowerCase();
          const foundIdx = parts.findIndex(p => p.trim().toLowerCase().startsWith('#') || p.trim().toLowerCase().includes(shopLower));
          orderIdIndex = foundIdx !== -1 ? foundIdx : 0;
        }

        rawSku = skuIndex !== -1 ? parts[skuIndex].trim() : '';
        orderId = orderIdIndex !== -1 ? parts[orderIdIndex].trim() : '';
        
        // Tìm quét ngày dạng dd/mm hoặc mm/dd
        for (let i = 0; i < parts.length; i++) {
          const cell = parts[i].trim();
          if (cell.match(/^\d{1,2}\/\d{1,2}$/)) {
            date = cell;
            break;
          }
        }
      }

      const match = rawSku.match(skuRegex);
      const coreSku = match ? match[1].toUpperCase() : rawSku.toUpperCase();

      return {
        id: index,
        original: line,
        originalParts: parts,
        skuIndex,
        orderIdIndex,
        driveLinkIndex,
        driveLink,
        orderId,
        date,
        rawSku,
        coreSku
      };
    }).filter(Boolean);

    // Matching process (FIFO)
    const pool = [...inStockProducts];
    const matchedResults = parsed.map(item => {
      if (!item.coreSku) {
        return { ...item, match: null };
      }

      // Bước 1: Tìm xem sản phẩm đã được gán sẵn cho đơn hàng này chưa (trạng thái PENDING và khớp orderId)
      const alreadyAssignedIndex = pool.findIndex(
        p => p.sku === item.coreSku && 
             p.status === 'PENDING' && 
             p.orderId && 
             p.orderId.trim().toLowerCase() === item.orderId.trim().toLowerCase()
      );

      if (alreadyAssignedIndex !== -1) {
        const matchedItem = pool[alreadyAssignedIndex];
        pool.splice(alreadyAssignedIndex, 1); // remove from pool
        return {
          ...item,
          alreadyAssigned: true,
          matchLoc: matchedItem.location,
          matchSku: matchedItem.sku,
          match: {
            id: matchedItem.id,
            sku: matchedItem.sku,
            location: matchedItem.location
          }
        };
      }

      // Bước 2: Nếu chưa gán, tìm sản phẩm đang có sẵn trong kho (IN_STOCK)
      const inStockIndex = pool.findIndex(p => p.sku === item.coreSku && p.status === 'IN_STOCK');
      if (inStockIndex !== -1) {
        const matchedItem = pool[inStockIndex];
        pool.splice(inStockIndex, 1); // remove from pool
        return {
          ...item,
          match: {
            id: matchedItem.id,
            sku: matchedItem.sku,
            location: matchedItem.location
          }
        };
      }

      return { ...item, match: null };
    });

    setParsedOrders(matchedResults);
  };

  // Perform bulk status update
  const handleConfirmMatching = async () => {
    setErrorMsg('');
    setSuccessMsg('');
    
    // Chỉ gửi các sản phẩm mới được ghép từ IN_STOCK (tránh cập nhật lại các đơn đã gán PENDING trước đó)
    const matchedItems = parsedOrders.filter(o => o.match && !o.alreadyAssigned);
    if (matchedItems.length === 0) {
      setErrorMsg('Không có sản phẩm tồn kho mới nào cần ghép.');
      return;
    }

    setIsProcessing(true);
    const assignments = matchedItems.map(o => ({
      productId: o.match.id,
      orderId: o.orderId
    }));

    try {
      const res = await fetch(`http://${window.location.hostname}:3001/api/inventory/assign-orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assignments })
      });
      
      let data = {};
      const contentType = res.headers.get("content-type");
      if (contentType && contentType.includes("application/json")) {
        data = await res.json();
      } else {
        const errorText = await res.text();
        if (res.status === 404) {
          throw new Error("Lỗi 404: Không tìm thấy API ghép đơn. Bạn CẦN TẮT CỬA SỔ CMD BACKEND CŨ và khởi chạy lại file run.bat để máy chủ nhận diện API mới.");
        }
        throw new Error(errorText || `Lỗi kết nối server (Trạng thái: ${res.status})`);
      }
      
      if (!res.ok) throw new Error(data.error || 'Lỗi ghép đơn');

      setSuccessMsg(`Ghép đơn thành công! Đã chuyển ${matchedItems.length} sản phẩm sang PENDING.`);
      // Refetch available items
      await fetchInStockProducts();
      // Clear or refresh the match
      setParsedOrders(prev => prev.map(o => {
        if (o.match) {
          // clear matching so it won't display as active matching
          return { ...o, match: null, alreadyAssigned: true, matchLoc: o.match.location, matchSku: o.match.sku };
        }
        return o;
      }));
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  // Generate and copy formatted outputs to clipboard
  const handleCopyToClipboard = () => {
    if (parsedOrders.length === 0) return;

    let outputLines = [];

    if (matchingMode === 'sku_only') {
      // CHỈ copy cột SKU (kèm #Vị-trí nếu khớp)
      outputLines = parsedOrders.map(o => {
        const matchedLoc = o.match ? o.match.location : (o.alreadyAssigned ? o.matchLoc : '');
        if (matchedLoc) {
          return `${o.rawSku}#${matchedLoc}`;
        }
        return o.rawSku;
      });
    } else {
      // Ghi vị trí vào CỘT P (cột 16, index 15) và ghi "OK" vào CỘT M (cột 13, index 12) nếu khớp/pending
      outputLines = parsedOrders.map(o => {
        const parts = o.originalParts ? [...o.originalParts] : o.original.split('\t');
        const matchedLoc = o.match ? o.match.location : (o.alreadyAssigned ? o.matchLoc : '');
        
        if (matchedLoc) {
          // Bảo đảm mảng parts đủ 16 cột (cột A->P) để gán giá trị
          while (parts.length < 16) {
            parts.push('');
          }
          parts[12] = 'OK'; // Cột M (index 12)
          parts[15] = matchedLoc; // Cột P (index 15)
        }
        
        return parts.join('\t');
      });
    }

    const outputText = outputLines.join('\n');

    const fallbackCopyTextToClipboard = (text) => {
      return new Promise((resolve, reject) => {
        try {
          const textArea = document.createElement("textarea");
          textArea.value = text;
          
          // Avoid scrolling to bottom
          textArea.style.top = "0";
          textArea.style.left = "0";
          textArea.style.position = "fixed";
          textArea.style.opacity = "0";

          document.body.appendChild(textArea);
          textArea.focus();
          textArea.select();

          const successful = document.execCommand('copy');
          document.body.removeChild(textArea);

          if (successful) {
            resolve();
          } else {
            reject(new Error('Fallback copy failed'));
          }
        } catch (err) {
          reject(err);
        }
      });
    };

    const copyPromise = (navigator.clipboard && navigator.clipboard.writeText)
      ? navigator.clipboard.writeText(outputText)
      : fallbackCopyTextToClipboard(outputText);

    copyPromise
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      })
      .catch(err => {
        console.error('Không thể copy:', err);
      });
  };

  const matchedCount = parsedOrders.filter(o => o.match || o.alreadyAssigned).length;
  const unmatchedCount = parsedOrders.length - matchedCount;

  return (
    <div className="order-matching-container animate-fade-in">
      <div className="matching-header">
        <h1>Ghép Đơn Tồn Kho</h1>
        <p className="subtitle">So khớp và xếp vị trí của sản phẩm đang tồn kho vào danh sách đơn hàng</p>
      </div>

      {/* Select Mode Switcher */}
      <div style={{ display: 'flex', gap: '16px', alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ fontWeight: 'bold', fontSize: '0.95rem', color: 'var(--text-secondary)' }}>Chế độ ghép & copy:</span>
        <div className="glass-panel" style={{ display: 'flex', padding: '2px', gap: '2px', borderRadius: '8px', background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.05)' }}>
          <button
            type="button"
            className={`view-mode-toggle-btn ${matchingMode === 'sku_only' ? 'active' : ''}`}
            onClick={() => setMatchingMode('sku_only')}
            style={{ padding: '4px 10px', fontSize: '12px', borderRadius: '6px' }}
          >
            Copy chỉ cột SKU (SKU#VịTrí hoặc SKU gốc)
          </button>
          <button
            type="button"
            className={`view-mode-toggle-btn ${matchingMode === 'replace_drive' ? 'active' : ''}`}
            onClick={() => setMatchingMode('replace_drive')}
            style={{ padding: '4px 10px', fontSize: '12px', borderRadius: '6px' }}
          >
            Ghi vị trí vào Cột P & 'OK' vào Cột M (Copy cả dòng)
          </button>
        </div>
      </div>

      {/* Select Shop format Switcher */}
      <div style={{ display: 'flex', gap: '16px', alignItems: 'center', marginTop: '12px', flexWrap: 'wrap' }}>
        <span style={{ fontWeight: 'bold', fontSize: '0.95rem', color: 'var(--text-secondary)' }}>Cấu trúc file đơn hàng (Shop):</span>
        <div className="glass-panel" style={{ display: 'flex', padding: '2px', gap: '2px', borderRadius: '8px', background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.05)' }}>
          {shops.map(shop => (
            <button
              key={shop.id}
              type="button"
              className={`view-mode-toggle-btn ${selectedShop === shop.id ? 'active' : ''}`}
              onClick={() => setSelectedShop(shop.id)}
              style={{ padding: '4px 10px', fontSize: '12px', borderRadius: '6px' }}
            >
              {shop.name} ({shop.requireNumberSku ? 'SKU & Đơn Cố Định' : 'Tự Động Quét'})
            </button>
          ))}
          <button
            type="button"
            className={`view-mode-toggle-btn ${selectedShop === 'OTHER' ? 'active' : ''}`}
            onClick={() => setSelectedShop('OTHER')}
            style={{ padding: '4px 10px', fontSize: '12px', borderRadius: '6px' }}
          >
            KHÁC (Tự động quét)
          </button>
        </div>
      </div>

      <div className="responsive-flex flex-layout">
        {/* Left Box: Input and Actions */}
        <div className="glass-panel input-panel flex-item-1">
          <div className="panel-title-row">
            <ClipboardList size={20} className="icon-title" />
            <h2>Dữ liệu đơn hàng đầu vào</h2>
          </div>
          
          <p className="instruction-text">
            Dán dữ liệu danh sách đơn hàng từ Excel / Google Sheets vào ô dưới đây (mỗi dòng một đơn, phân cách bằng tab/khoảng trắng):
          </p>

          <textarea
            className="raw-textarea"
            placeholder={
              matchingMode === 'sku_only'
                ? `#sdr5366\t27/5\tSYC0199GSHO-L\n#sdr5367\t\tSYC0071GSHO-L`
                : `[Cột 1: Ngày]\t[Cột 2: ĐƠN HÀNG]\t[Cột 3: Trống/Khác]\t[Cột 4: SKU]\nVí dụ:\n05/31\t#sdr5469\tThao\tSYC0345MLEG-2XL`
            }
            value={rawText}
            onChange={(e) => setRawText(e.target.value)}
            rows={12}
          />

          <div className="actions-button-row">
            <button 
              onClick={handleParseAndMatch}
              className="btn btn-primary btn-match"
            >
              Phân tích & So khớp
            </button>
            
            {parsedOrders.length > 0 && (
              <button 
                onClick={handleConfirmMatching}
                disabled={isProcessing || matchedCount === 0}
                className="btn btn-success btn-confirm"
              >
                {isProcessing ? 'Đang xử lý...' : 'Xác nhận & Ghép đơn'}
              </button>
            )}
          </div>

          <div className="status-messages">
            {errorMsg && (
              <div className="banner error-banner">
                <AlertCircle size={16} />
                <span>{errorMsg}</span>
              </div>
            )}
            {successMsg && (
              <div className="banner success-banner">
                <CheckCircle2 size={16} />
                <span>{successMsg}</span>
              </div>
            )}
          </div>
        </div>

        {/* Right Box: Warehouse Status Summary */}
        <div className="glass-panel stats-panel flex-item-2">
          <h2>Tổng quan tồn kho</h2>
          <div className="stats-grid">
            <div className="stat-card">
              <span className="stat-label">Tồn kho khả dụng</span>
              <span className="stat-value">{inStockProducts.length}</span>
            </div>
            <div className="stat-card">
              <span className="stat-label">Số đơn đã phân tích</span>
              <span className="stat-value">{parsedOrders.length}</span>
            </div>
            <div className="stat-card success">
              <span className="stat-label">Ghép thành công</span>
              <span className="stat-value">{matchedCount}</span>
            </div>
            <div className="stat-card danger">
              <span className="stat-label">Chưa có tồn</span>
              <span className="stat-value">{unmatchedCount}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Result Section */}
      {parsedOrders.length > 0 && (
        <div className="glass-panel results-panel animate-fade-in">
          <div className="panel-title-row title-results-flex">
            <h2>Kết quả phân tích & So khớp vị trí</h2>
            <button 
              onClick={handleCopyToClipboard}
              className="btn btn-secondary btn-copy-tsv"
            >
              {copied ? (
                <>
                  <Check size={16} className="icon-btn-copied" />
                  Đã copy kết quả!
                </>
              ) : (
                <>
                  <Copy size={16} />
                  {matchingMode === 'sku_only' ? 'Copy cột SKU' : 'Copy cả dòng (Cột M: OK, Cột P: Vị trí)'}
                </>
              )}
            </button>
          </div>

          <div className="table-responsive">
            <table className="results-table">
              <thead>
                <tr>
                  <th>Đơn hàng</th>
                  <th>Ngày/Ghi chú</th>
                  <th>SKU Yêu Cầu</th>
                  <th className="arrow-col"></th>
                  <th>SKU Tồn Kho</th>
                  <th>Vị trí Khớp</th>
                  {matchingMode === 'replace_drive' && <th>Ghi Cột M & Cột P</th>}
                  <th>Trạng thái</th>
                </tr>
              </thead>
              <tbody>
                {parsedOrders.map((order) => {
                  const hasMatch = order.match || order.alreadyAssigned;
                  const matchedSku = order.match ? order.match.sku : (order.alreadyAssigned ? order.matchSku : '');
                  const matchedLoc = order.match ? order.match.location : (order.alreadyAssigned ? order.matchLoc : '');

                  return (
                    <tr 
                      key={order.id} 
                      className={`result-row ${hasMatch ? 'matched-row' : 'unmatched-row'} ${order.alreadyAssigned ? 'assigned-row' : ''}`}
                    >
                      <td className="bold-text">{order.orderId}</td>
                      <td>{order.date || <span className="empty-val">-</span>}</td>
                      <td className="sku-req-cell">{order.rawSku}</td>
                      <td className="arrow-col"><ArrowRight size={14} className="arrow-icon" /></td>
                      <td className="matched-sku-cell">
                        {matchedSku ? (
                          <span className="sku-match-badge">{matchedSku}</span>
                        ) : (
                          <span className="empty-val">-</span>
                        )}
                      </td>
                      <td className="matched-loc-cell">
                        {matchedLoc ? (
                          <span className="location-match-badge">{matchedLoc}</span>
                        ) : (
                          <span className="empty-val">-</span>
                        )}
                      </td>
                      {matchingMode === 'replace_drive' && (
                        <td style={{ fontSize: '0.85rem' }}>
                          {hasMatch ? (
                            <span>
                              <span style={{ color: 'var(--accent-success)', fontWeight: 'bold' }}>M: OK</span>
                              <span style={{ opacity: 0.5, margin: '0 8px' }}>|</span>
                              <span style={{ color: 'var(--accent-primary)', fontWeight: 'bold' }}>P: {matchedLoc}</span>
                            </span>
                          ) : (
                            <span className="empty-val">-</span>
                          )}
                        </td>
                      )}
                      <td>
                        {order.alreadyAssigned ? (
                          <span className="status-pill status-assigned">Đã ghép (PENDING)</span>
                        ) : hasMatch ? (
                          <span className="status-pill status-matched">Khớp tồn kho</span>
                        ) : (
                          <span className="status-pill status-missing">Không có sẵn</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default OrderMatchingPage;
