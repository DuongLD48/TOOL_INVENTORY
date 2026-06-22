import React, { useState, useEffect, useRef } from 'react';
import { useSocket } from '../context/SocketContext';
import { Shield, ShieldAlert, ShieldCheck, Printer, Terminal, ListCollapse, RefreshCw, Check, AlertTriangle } from 'lucide-react';
import './PrintMonitorPage.css';

const PrintMonitorPage = () => {
  const socket = useSocket();
  const [firebaseStatus, setFirebaseStatus] = useState({ status: 'NOT_CONFIGURED', message: 'Đang kết nối...' });
  const [printers, setPrinters] = useState([]);
  const [selectedPrinter, setSelectedPrinter] = useState('');
  const [pageWidth, setPageWidth] = useState(100);
  const [pageHeight, setPageHeight] = useState(150);
  const [orientation, setOrientation] = useState('portrait');
  const [paperName, setPaperName] = useState('');
  const [previewUrl, setPreviewUrl] = useState('');
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsSuccess, setSettingsSuccess] = useState(false);
  const [settingsError, setSettingsError] = useState(null);
  
  // Test Print & Preview states
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [printingTest, setPrintingTest] = useState(false);
  const [testFeedback, setTestFeedback] = useState(null);
  
  // Real-time Console Log
  const [consoleLogs, setConsoleLogs] = useState([
    { id: 'init', time: new Date().toLocaleTimeString(), text: '🖥️ Bắt đầu phiên giám sát in ấn...', type: 'system' }
  ]);
  const consoleEndRef = useRef(null);

  // SQLite Logs
  const [dbLogs, setDbLogs] = useState([]);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [logsError, setLogsError] = useState(null);

  const addConsoleLog = (text, type = 'info') => {
    setConsoleLogs(prev => [
      ...prev,
      { id: Date.now() + Math.random().toString(), time: new Date().toLocaleTimeString(), text, type }
    ].slice(-50)); // Giới hạn 50 dòng gần nhất
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
      addConsoleLog('⚠️ Không thể tải danh sách máy in từ hệ thống.', 'error');
    }
  };

  const fetchActivePrinters = async () => {
    try {
      const res = await fetch(`http://${window.location.hostname}:3001/api/settings/printer`);
      const data = await res.json();
      if (data) {
        setSelectedPrinter(data.printerName || '');
        setPageWidth(data.pageWidth || 100);
        setPageHeight(data.pageHeight || 150);
        setOrientation(data.orientation || 'portrait');
        setPaperName(data.paperName || '');
      }
    } catch (err) {
      console.error('Lỗi lấy cấu hình máy in:', err);
    }
  };

  const fetchDbLogs = async () => {
    setLoadingLogs(true);
    setLogsError(null);
    try {
      const res = await fetch(`http://${window.location.hostname}:3001/api/logs`);
      const data = await res.json();
      if (data.data) {
        // Lọc các log in ấn tem nhãn SKU (PRINT) và in đơn hàng (ORDER_PRINT)
        const printLogs = data.data.filter(log => log.actionType === 'PRINT' || log.actionType === 'ORDER_PRINT');
        setDbLogs(printLogs);
      }
    } catch (err) {
      console.error('Lỗi lấy log SQLite:', err);
      setLogsError('Không thể tải lịch sử in từ SQLite.');
    } finally {
      setLoadingLogs(false);
    }
  };

  const handleSavePrinters = async () => {
    setSavingSettings(true);
    setSettingsSuccess(false);
    setSettingsError(null);
    try {
      const res = await fetch(`http://${window.location.hostname}:3001/api/settings/printer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          printerName: selectedPrinter,
          pageWidth: Number(pageWidth),
          pageHeight: Number(pageHeight),
          orientation: orientation,
          paperName: paperName
        })
      });
      const data = await res.json();
      if (data.success) {
        setSettingsSuccess(true);
        addConsoleLog(`⚙️ Đã lưu cấu hình máy in: ${data.printerName} (${data.pageWidth}x${data.pageHeight}mm, ${data.orientation}, PaperName="${data.paperName}")`, 'system');
        setTimeout(() => setSettingsSuccess(false), 3000);
      } else {
        setSettingsError('Lưu cấu hình thất bại.');
      }
    } catch (err) {
      console.error(err);
      setSettingsError('Lỗi kết nối tới máy chủ.');
    } finally {
      setSavingSettings(false);
    }
  };

  // Cuộn log console xuống cuối
  useEffect(() => {
    consoleEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [consoleLogs]);

  const checkPreviewFile = async () => {
    try {
      const res = await fetch(`http://${window.location.hostname}:3001/uploads/last_printed.pdf`, { method: 'HEAD' });
      if (res.ok) {
        setPreviewUrl(`http://${window.location.hostname}:3001/uploads/last_printed.pdf?t=${Date.now()}`);
      }
    } catch (e) {
      console.log('Chưa có file preview gần nhất.');
    }
  };

  const handlePreviewTest = async () => {
    setLoadingPreview(true);
    setTestFeedback(null);
    try {
      const res = await fetch(`http://${window.location.hostname}:3001/api/inventory/print-test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          printerName: selectedPrinter,
          pageWidth: Number(pageWidth),
          pageHeight: Number(pageHeight),
          orientation: orientation,
          mode: 'pdf'
        })
      });
      const data = await res.json();
      if (data.pdfUrl) {
        setPreviewUrl(`http://${window.location.hostname}:3001${data.pdfUrl}?t=${Date.now()}`);
        setTestFeedback({ type: 'success', text: '✓ Đã tạo PDF test thành công!' });
        addConsoleLog('🖥️ Đã xem thử PDF nhãn test thành công.', 'system');
      } else {
        setTestFeedback({ type: 'error', text: `✗ Lỗi: ${data.error || 'Không thể tạo PDF'}` });
      }
    } catch (err) {
      console.error(err);
      setTestFeedback({ type: 'error', text: '✗ Lỗi kết nối local server.' });
    } finally {
      setLoadingPreview(false);
    }
  };

  const handlePrintTest = async () => {
    setPrintingTest(true);
    setTestFeedback(null);
    try {
      const res = await fetch(`http://${window.location.hostname}:3001/api/inventory/print-test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          printerName: selectedPrinter,
          pageWidth: Number(pageWidth),
          pageHeight: Number(pageHeight),
          orientation: orientation
        })
      });
      const data = await res.json();
      if (res.ok) {
        setTestFeedback({ type: 'success', text: '✓ Đã gửi lệnh in test thành công!' });
      } else {
        setTestFeedback({ type: 'error', text: `✗ Lỗi in: ${data.error || 'In thất bại'}` });
      }
    } catch (err) {
      console.error(err);
      setTestFeedback({ type: 'error', text: '✗ Lỗi kết nối local server.' });
    } finally {
      setPrintingTest(false);
    }
  };

  // Kết nối socket và lắng nghe sự kiện
  useEffect(() => {
    fetchPrinters();
    fetchActivePrinters();
    fetchDbLogs();
    checkPreviewFile();

    if (!socket) return;

    socket.on('firebase_status', (statusData) => {
      if (statusData) {
        setFirebaseStatus(statusData);
        if (statusData.status === 'CONNECTED') {
          addConsoleLog(`🟢 Firebase kết nối thành công: ${statusData.message}`, 'success');
        } else if (statusData.status === 'NOT_CONFIGURED') {
          addConsoleLog(`%c🟡 Firebase cảnh báo: ${statusData.message}`, 'warning');
        } else {
          addConsoleLog(`🔴 Firebase lỗi: ${statusData.message}`, 'error');
        }
      }
    });

    socket.on('printer_settings_updated', (settings) => {
      if (settings) {
        setSelectedPrinter(settings.printerName || '');
        setPageWidth(settings.pageWidth || 100);
        setPageHeight(settings.pageHeight || 150);
        setOrientation(settings.orientation || 'portrait');
        setPaperName(settings.paperName || '');
        addConsoleLog(`⚙️ Cấu hình máy in được đồng bộ từ server: ${settings.printerName} (${settings.pageWidth}x${settings.pageHeight}mm, ${settings.orientation}, PaperName="${settings.paperName || ''}")`, 'system');
      }
    });

    socket.on('order_printed', (data) => {
      if (data) {
        addConsoleLog(`🖨️ LỆNH IN ĐƠN HÀNG: Đơn #${data.orderId} (Nguồn: ${data.shop}) - Mã vận đơn: ${data.trackingId}`, 'print');
        fetchDbLogs(); // Tải lại lịch sử in từ DB
        setTimeout(() => {
          setPreviewUrl(`http://${window.location.hostname}:3001/uploads/last_printed.pdf?t=${Date.now()}`);
        }, 800);
      }
    });

    socket.on('inventory_updated', (data) => {
      if (data && data.type === 'PRINT') {
        addConsoleLog(`🏷️ LỆNH IN TEM SKU: Đã in tem cho sản phẩm #${data.product?.id || ''} (${data.product?.sku || ''})`, 'print');
        fetchDbLogs();
        setTimeout(() => {
          setPreviewUrl(`http://${window.location.hostname}:3001/uploads/last_printed.pdf?t=${Date.now()}`);
        }, 800);
      }
    });

    return () => {
      socket.off('firebase_status');
      socket.off('printer_settings_updated');
      socket.off('order_printed');
      socket.off('inventory_updated');
    };
  }, [socket]);

  // Hàm render Icon cho Firebase Status
  const renderFirebaseIcon = () => {
    if (firebaseStatus.status === 'CONNECTED') {
      return <ShieldCheck size={40} className="status-icon text-success animate-pulse" />;
    } else if (firebaseStatus.status === 'NOT_CONFIGURED') {
      return <ShieldAlert size={40} className="status-icon text-warning animate-pulse" />;
    } else {
      return <Shield size={40} className="status-icon text-danger animate-pulse" />;
    }
  };

  const getFirebaseClass = () => {
    if (firebaseStatus.status === 'CONNECTED') return 'status-connected';
    if (firebaseStatus.status === 'NOT_CONFIGURED') return 'status-warning';
    return 'status-error';
  };

  return (
    <div className="print-monitor-container animate-fade-in">
      <header className="monitor-header">
        <h1 className="monitor-title">Giám sát in ấn thời gian thực</h1>
        <p className="monitor-subtitle">Theo dõi trạng thái liên kết Firebase, lệnh in tự động và cấu hình máy in hệ thống.</p>
      </header>

      <div className="monitor-grid">
        {/* Cột trái: Trạng thái và Cấu hình */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Card 1: Trạng thái Firebase */}
          <div className={`glass-panel status-card ${getFirebaseClass()}`} style={{ flex: 1 }}>
            <div className="status-card-header">
              <h3>Trạng thái Firebase</h3>
              {renderFirebaseIcon()}
            </div>
            <div className="status-card-body">
              <div className="status-badge">
                <span className="status-dot"></span>
                <strong>{firebaseStatus.status}</strong>
              </div>
              <p className="status-message">{firebaseStatus.message}</p>
              {firebaseStatus.status === 'NOT_CONFIGURED' && (
                <div className="status-tip">
                  <AlertTriangle size={14} />
                  <span>Bạn cần ghi đè file <code>serviceAccountKey.json</code> ở server để kích hoạt in tự động.</span>
                </div>
              )}
            </div>
          </div>

          {/* Card 2: Cấu hình Máy In */}
          <div className="glass-panel printer-settings-card">
            <div className="card-header">
              <h3><Printer size={18} /> Cấu hình máy in trên Server</h3>
              <span className="card-header-desc">Thiết lập máy in duy nhất và kích thước khổ giấy in cho server local.</span>
            </div>
            <div className="card-body">
              <div className="input-group">
                <label>Chọn máy in hệ thống:</label>
                <select 
                  value={selectedPrinter} 
                  onChange={(e) => setSelectedPrinter(e.target.value)}
                  disabled={savingSettings}
                >
                  <option value="">-- Chọn máy in --</option>
                  {printers.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>

              <div className="settings-row">
                <div className="input-group">
                  <label>Khổ ngang (Width mm):</label>
                  <input 
                    type="number" 
                    value={pageWidth} 
                    onChange={(e) => setPageWidth(Number(e.target.value))}
                    disabled={savingSettings}
                    min="1"
                  />
                </div>

                <div className="input-group">
                  <label>Khổ dọc (Height mm):</label>
                  <input 
                    type="number" 
                    value={pageHeight} 
                    onChange={(e) => setPageHeight(Number(e.target.value))}
                    disabled={savingSettings}
                    min="1"
                  />
                </div>
              </div>

              <div className="input-group">
                <label>Chiều in (Orientation):</label>
                <select 
                  value={orientation} 
                  onChange={(e) => setOrientation(e.target.value)}
                  disabled={savingSettings}
                >
                  <option value="portrait">Dọc (Portrait)</option>
                  <option value="landscape">Ngang (Landscape)</option>
                </select>
              </div>

              <div className="input-group">
                <label>Tên khổ giấy trên Driver máy in (Ví dụ: 100mmx150mm, 4x6 - bỏ trống nếu sử dụng mặc định):</label>
                <input 
                  type="text"
                  value={paperName} 
                  onChange={(e) => setPaperName(e.target.value)}
                  placeholder="Nhập tên khổ giấy (ví dụ: 100x150 hoặc 100mm x 150mm)"
                  disabled={savingSettings}
                />
              </div>

              <div className="settings-actions">
                <button 
                  className="button button--primary save-btn"
                  onClick={handleSavePrinters}
                  disabled={savingSettings}
                >
                  {savingSettings ? <RefreshCw className="animate-spin" size={16} /> : <Check size={16} />}
                  <span>{savingSettings ? 'Đang lưu...' : 'Lưu cài đặt'}</span>
                </button>
                {settingsSuccess && <span className="text-success settings-feedback">✓ Đã cập nhật trên server!</span>}
                {settingsError && <span className="text-danger settings-feedback">✗ {settingsError}</span>}
              </div>
            </div>
          </div>
        </div>

        {/* Cột phải: Xem trước nhãn in gần nhất */}
        <div className="glass-panel printer-preview-card" style={{ display: 'flex', flexDirection: 'column' }}>
          <div className="card-header" style={{ marginBottom: '12px' }}>
            <h3><Printer size={18} style={{ color: '#60a5fa', marginRight: '4px' }} /> Xem trước nhãn in gần nhất</h3>
            <span className="card-header-desc">Xem trực tiếp tệp PDF của nhãn vừa được in ra.</span>
          </div>
          <div className="card-body" style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {previewUrl ? (
              <iframe 
                src={previewUrl} 
                title="Preview nhãn in" 
                style={{ width: '100%', height: '100%', minHeight: '400px', border: 'none', borderRadius: '10px', background: 'white' }}
              />
            ) : (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#9ca3af', border: '2px dashed rgba(255,255,255,0.1)', borderRadius: '10px', padding: '40px', textAlign: 'center', minHeight: '400px' }}>
                <Printer size={48} style={{ marginBottom: '16px', opacity: 0.2 }} />
                <span>Chưa có dữ liệu in hoặc file preview trống.</span>
              </div>
            )}
            
            <div style={{ display: 'flex', gap: '12px', marginTop: '12px' }}>
              <button 
                className="button button--secondary" 
                style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', minHeight: '40px', borderRadius: '10px' }}
                onClick={handlePreviewTest}
                disabled={loadingPreview}
              >
                {loadingPreview ? <RefreshCw className="animate-spin" size={16} /> : <Printer size={16} />}
                <span>{loadingPreview ? 'Đang tạo PDF...' : 'Xem thử nhãn test'}</span>
              </button>
              <button 
                className="button button--primary" 
                style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', minHeight: '40px', borderRadius: '10px' }}
                onClick={handlePrintTest}
                disabled={printingTest}
              >
                {printingTest ? <RefreshCw className="animate-spin" size={16} /> : <Check size={16} />}
                <span>{printingTest ? 'Đang in thử...' : 'In thử ra máy in'}</span>
              </button>
            </div>
            {testFeedback && (
              <div style={{ 
                fontSize: '0.85rem', 
                fontWeight: '500', 
                color: testFeedback.type === 'success' ? '#10b981' : '#ef4444', 
                textAlign: 'center',
                marginTop: '4px',
                animation: 'fadeIn 0.3s ease forwards'
              }}>
                {testFeedback.text}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Terminal Log Console */}
      <div className="glass-panel console-section">
        <div className="section-header">
          <h3><Terminal size={18} /> Nhật ký sự kiện thời gian thực (Console)</h3>
          <button className="icon-button" onClick={() => setConsoleLogs([{ id: 'clear', time: new Date().toLocaleTimeString(), text: '🧹 Đã xoá nhật ký màn hình.', type: 'system' }])}>
            Xóa màn hình
          </button>
        </div>
        <div className="console-wrapper">
          <div className="console-body">
            {consoleLogs.map((log) => (
              <div key={log.id} className={`console-line log-${log.type}`}>
                <span className="log-time">[{log.time}]</span>
                <span className="log-text">{log.text}</span>
              </div>
            ))}
            <div ref={consoleEndRef} />
          </div>
        </div>
      </div>

      {/* SQLite Logs Table */}
      <div className="glass-panel history-section">
        <div className="section-header">
          <h3><ListCollapse size={18} /> Lịch sử in ấn (Dữ liệu SQLite)</h3>
          <button className="icon-button" onClick={fetchDbLogs} disabled={loadingLogs}>
            <RefreshCw size={14} className={loadingLogs ? 'animate-spin' : ''} />
            <span>Tải lại</span>
          </button>
        </div>
        <div className="table-wrapper">
          {loadingLogs ? (
            <div className="table-state">Đang tải lịch sử in từ máy chủ...</div>
          ) : logsError ? (
            <div className="table-state text-danger">{logsError}</div>
          ) : dbLogs.length === 0 ? (
            <div className="table-state">Chưa có lịch sử in đơn hàng hoặc in tem SKU nào trong database.</div>
          ) : (
            <table className="monitor-table">
              <thead>
                <tr>
                  <th>Thời gian</th>
                  <th>Phân loại</th>
                  <th>Nguồn đơn</th>
                  <th>Nội dung chi tiết</th>
                </tr>
              </thead>
              <tbody>
                {dbLogs.slice(0, 15).map((log) => (
                  <tr key={log.id}>
                    <td className="col-time">{new Date(log.createdAt).toLocaleString('vi-VN')}</td>
                    <td className="col-type">
                      <span className={`badge-type ${log.actionType === 'ORDER_PRINT' ? 'badge-order' : 'badge-sku'}`}>
                        {log.actionType === 'ORDER_PRINT' ? 'Đơn hàng (100x150)' : 'Tem SKU (100x22)'}
                      </span>
                    </td>
                    <td className="col-shop">{log.shop || 'N/A'}</td>
                    <td className="col-details">{log.details}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
};

export default PrintMonitorPage;
