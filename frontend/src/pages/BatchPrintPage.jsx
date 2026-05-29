import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { QRCodeSVG } from 'qrcode.react';
import { Printer, CheckCircle, XCircle, Eye, Settings, Save, FileText, FlaskConical } from 'lucide-react';
import './BatchPrintPage.css';

const BatchPrintPage = () => {
  const [unprinted, setUnprinted] = useState([]);
  const [loading, setLoading] = useState(true);
  const [printing, setPrinting] = useState(false);
  const [printingTest, setPrintingTest] = useState(false);
  const [printError, setPrintError] = useState(null);
  const [testPrintError, setTestPrintError] = useState(null);
  const [testPrintSuccess, setTestPrintSuccess] = useState(null);
  const [confirmDialog, setConfirmDialog] = useState(false);
  const [confirmedIds, setConfirmedIds] = useState([]);
  const [showPreview, setShowPreview] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [printers, setPrinters] = useState([]);
  const [printSettings, setPrintSettings] = useState(() => {
    const saved = localStorage.getItem('printSettings');
    if (saved) return JSON.parse(saved);
    return {
      printerName: 'Xprinter XP-470B',
      pageWidth: 100,
      pageHeight: 22,
      orientation: 'landscape'
    };
  });

  const fetchUnprinted = async () => {
    setLoading(true);
    try {
      const res = await fetch(`http://${window.location.hostname}:3001/api/inventory/unprinted`);
      const data = await res.json();
      if (data.data) {
        setUnprinted(data.data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const fetchPrinters = async () => {
    try {
      const res = await fetch(`http://${window.location.hostname}:3001/api/printers`);
      const data = await res.json();
      if (data.data) {
        setPrinters(data.data.map(p => typeof p === 'string' ? p : p.printer || p.name));
      }
    } catch (err) {
      console.error('Lỗi lấy danh sách máy in:', err);
    }
  };

  useEffect(() => {
    fetchUnprinted();
    fetchPrinters();
  }, []);

  const handleSaveSettings = () => {
    localStorage.setItem('printSettings', JSON.stringify(printSettings));
    setShowSettings(false);
  };

  const handlePrint = async () => {
    const ids = unprinted.map(p => p.id);
    setPrinting(true);
    setPrintError(null);
    try {
      const payload = { ids, ...printSettings };
      const res = await fetch(`http://${window.location.hostname}:3001/api/inventory/print-now`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setConfirmedIds(ids);
      setConfirmDialog(true);
    } catch (err) {
      setPrintError(err.message);
    } finally {
      setPrinting(false);
    }
  };

  const handleGeneratePdf = async () => {
    const ids = unprinted.map(p => p.id);
    setPrinting(true);
    setPrintError(null);
    try {
      const payload = { ids, ...printSettings };
      const res = await fetch(`http://${window.location.hostname}:3001/api/inventory/generate-pdf`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      window.open(`http://${window.location.hostname}:3001${data.pdfUrl}`, '_blank');
      setConfirmedIds(ids);
      setConfirmDialog(true);
    } catch (err) {
      setPrintError(err.message);
    } finally {
      setPrinting(false);
    }
  };

  const handlePrintTest = async () => {
    setPrintingTest(true);
    setTestPrintError(null);
    setTestPrintSuccess(null);
    try {
      const res = await fetch(`http://${window.location.hostname}:3001/api/inventory/print-test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...printSettings, mode: 'print' })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setTestPrintSuccess('Đã gửi 2 tem test tới máy in thành công!');
    } catch (err) {
      setTestPrintError(err.message);
    } finally {
      setPrintingTest(false);
    }
  };

  const markAsPrinted = async () => {
    try {
      await fetch(`http://${window.location.hostname}:3001/api/inventory/mark-printed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: confirmedIds })
      });
    } catch (_) {}
    setConfirmDialog(false);
    setUnprinted([]);
  };

  const handlePrintFailed = () => {
    setConfirmDialog(false);
  };

  // Nhóm các sản phẩm thành từng cặp (2 tem / 1 hàng)
  const pairedProducts = [];
  for (let i = 0; i < unprinted.length; i += 2) {
    pairedProducts.push(unprinted.slice(i, i + 2));
  }

  // Label component (35x22mm)
  const PrintLabel = ({ product }) => {
    if (!product) return <div className="print-label-empty-placeholder"></div>;
    return (
      <div className="print-label-card">
        {/* Vùng QR bên trái (14x14mm) */}
        <div className="print-label-qr-box">
          <QRCodeSVG value={product.sku} size={53} />
        </div>
        
        {/* Vùng SKU & Thông tin bên phải */}
        <div className="print-label-info-col">
          <span className="print-label-shop-name">
            {product.shop}
          </span>
          {product.numberSku && (
            <span className="print-label-sku-number">
              {product.numberSku}
            </span>
          )}
          <span className="print-label-type-size">
            {product.productType}-{product.size}
          </span>
          <span className="print-label-location-id">
            {product.location} <span className="print-label-id-hash">#{product.id}</span>
          </span>
        </div>
      </div>
    );
  };

  return (
    <div className="animate-fade-in print-page-container">
      <h1>In Tem Nhãn Hàng Loạt</h1>

      <div className="glass-panel print-panel-main">
        {loading ? (
          <p>Đang tải dữ liệu...</p>
        ) : unprinted.length === 0 ? (
          <div className="empty-state-container">
            <CheckCircle size={48} className="empty-state-icon" style={{ color: 'var(--accent-success)' }} />
            <p>Tuyệt vời! Không có sản phẩm nào đang chờ in tem.</p>
          </div>
        ) : (
          <div>
            <div className="responsive-flex print-panel-flex">
              <div className="responsive-full-width print-info-text-col">
                <p>Có <strong>{unprinted.length}</strong> sản phẩm cần in tem.</p>
                <p className="secondary-desc">
                  Máy in: <strong style={{ color: 'white' }}>{printSettings.printerName}</strong> ({printSettings.pageWidth}x{printSettings.pageHeight}mm - {printSettings.orientation})
                </p>
              </div>
              <div className="responsive-flex print-actions-btn-group">
                <button
                  onClick={() => setShowSettings(true)}
                  className="print-btn-secondary"
                >
                  <Settings size={18} /> Cài đặt
                </button>
                <button
                  onClick={() => setShowPreview(true)}
                  className="print-btn-secondary"
                >
                  <Eye size={18} /> Xem trước
                </button>
                <button
                  onClick={handleGeneratePdf}
                  disabled={printing}
                  className="btn print-btn-pdf"
                >
                  <FileText size={18} /> Tạo file PDF
                </button>
                <button
                  onClick={handlePrintTest}
                  disabled={printingTest}
                  className="btn print-btn-test"
                  title="In 2 tem mẫu để kiểm tra máy in"
                >
                  {printingTest ? (
                    <>
                      <svg width="18" height="18" viewBox="0 0 24 24" className="spinner-svg">
                        <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="3" strokeDasharray="31.4" strokeDashoffset="10" />
                      </svg>
                      Đang in...
                    </>
                  ) : (
                    <><FlaskConical size={18} /> In Test</>
                  )}
                </button>
                <button
                  onClick={handlePrint}
                  disabled={printing}
                  className="btn btn-primary print-btn-primary"
                >
                  {printing ? (
                    <>
                      <svg width="20" height="20" viewBox="0 0 24 24" className="spinner-svg">
                        <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="3" strokeDasharray="31.4" strokeDashoffset="10" />
                      </svg>
                      Đang in...
                    </>
                  ) : (
                    <><Printer size={20} /> In ngay</>
                  )}
                </button>
              </div>
            </div>

            {/* Lỗi in */}
            {printError && (
              <div className="print-error-box">
                ⚠️ {printError}
              </div>
            )}

            {/* Kết quả in test */}
            {testPrintSuccess && (
              <div className="print-test-success-box">
                <CheckCircle size={15} /> {testPrintSuccess}
              </div>
            )}
            {testPrintError && (
              <div className="print-error-box">
                ⚠️ (Test) {testPrintError}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Preview Dialog */}
      {showPreview && createPortal(
        <div className="preview-modal-backdrop">
          <div className="preview-modal-box">
            <div className="preview-modal-header">
              <h2>Xem trước bản in ({unprinted.length} tem)</h2>
              <button onClick={() => setShowPreview(false)} className="preview-modal-close-btn"><XCircle size={28} /></button>
            </div>
            
            <div className="preview-modal-labels-container">
              {pairedProducts.map((pair, idx) => (
                <div key={idx} className="preview-modal-paper-sheet" style={{ 
                  width: `${printSettings.pageWidth}mm`, 
                  height: '22mm'
                }}>
                  {/* Khối 70x22 chứa 2 tem ghép lại */}
                  <div className="preview-modal-labels-pair-wrapper">
                    <div className="preview-modal-label-item"><PrintLabel product={pair[0]} /></div>
                    <div className="preview-modal-label-item"><PrintLabel product={pair[1]} /></div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      , document.body)}

      {/* Settings Dialog */}
      {showSettings && createPortal(
        <div className="modal-backdrop-overlay">
          <div className="modal-glass-container">
            <div className="modal-header-section">
              <h2 className="modal-header-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><Settings size={22} /> Cài đặt in</h2>
              <button onClick={() => setShowSettings(false)} className="modal-close-button"><XCircle size={28} /></button>
            </div>
            
            <div className="settings-modal-form-group">
              <div>
                <label className="settings-modal-label">Chọn máy in</label>
                <select 
                  value={printSettings.printerName} 
                  onChange={e => setPrintSettings({...printSettings, printerName: e.target.value})}
                  className="settings-modal-select"
                >
                  {printers.map((p, i) => (
                    <option key={i} value={p} style={{ background: '#1e293b', color: 'white' }}>{p}</option>
                  ))}
                  {printers.length === 0 && <option value={printSettings.printerName} style={{ background: '#1e293b', color: 'white' }}>{printSettings.printerName}</option>}
                </select>
              </div>

              <div className="responsive-flex" style={{ display: 'flex', gap: '12px' }}>
                <div style={{ flex: 1 }}>
                  <label className="settings-modal-label">Khổ ngang (Width mm)</label>
                  <input 
                    type="number" 
                    value={printSettings.pageWidth} 
                    onChange={e => setPrintSettings({...printSettings, pageWidth: Number(e.target.value)})}
                    className="settings-modal-input"
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <label className="settings-modal-label">Khổ dọc (Height mm)</label>
                  <input 
                    type="number" 
                    value={printSettings.pageHeight} 
                    onChange={e => setPrintSettings({...printSettings, pageHeight: Number(e.target.value)})}
                    className="settings-modal-input"
                  />
                </div>
              </div>

              <div>
                <label className="settings-modal-label">Chiều in (Orientation)</label>
                <select 
                  value={printSettings.orientation} 
                  onChange={e => setPrintSettings({...printSettings, orientation: e.target.value})}
                  className="settings-modal-select"
                >
                  <option value="landscape" style={{ background: '#1e293b', color: 'white' }}>Ngang (Landscape)</option>
                  <option value="portrait" style={{ background: '#1e293b', color: 'white' }}>Dọc (Portrait)</option>
                </select>
              </div>
              
              <button 
                onClick={handleSaveSettings}
                className="settings-modal-save-btn"
              >
                <Save size={20} /> Lưu cài đặt
              </button>
            </div>
          </div>
        </div>
      , document.body)}

      {/* Confirm Dialog — Portal để tránh lỗi fixed positioning */}
      {confirmDialog && createPortal(
        <div className="modal-backdrop-overlay">
          <div className="confirm-dialog-content">
            <div className="confirm-dialog-icon-circle">
              <Printer size={30} color="#a78bfa" />
            </div>

            <h2 className="confirm-dialog-title">Kiểm tra máy in</h2>
            <p className="confirm-dialog-message">
              Lệnh in đã được gửi tới <strong style={{ color: 'white' }}>Xprinter XP-470B</strong>.<br />
              Tem in ra đẹp không?
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <button
                onClick={markAsPrinted}
                className="confirm-dialog-btn-success"
              >
                <CheckCircle size={19} /> Đẹp, xác nhận xong
              </button>

              <button
                onClick={handlePrintFailed}
                className="confirm-dialog-btn-fail"
              >
                <XCircle size={19} /> In lỗi, thử lại
              </button>
            </div>
          </div>
        </div>
      , document.body)}
    </div>
  );
};

export default BatchPrintPage;
