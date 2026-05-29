import React, { useState, useEffect, useRef } from 'react';
import { ScanBarcode, CheckCircle, XCircle } from 'lucide-react';
import './ExportPage.css';

const ExportPage = () => {
  const [logs, setLogs] = useState([]);
  const [isScanning, setIsScanning] = useState(true);
  const barcodeBuffer = useRef('');
  const timeoutRef = useRef(null);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (!isScanning) return;

      // Ignore modifiers
      if (e.ctrlKey || e.altKey || e.metaKey) return;

      if (e.key === 'Enter') {
        if (barcodeBuffer.current.trim() !== '') {
          handleExport(barcodeBuffer.current.trim());
          barcodeBuffer.current = '';
        }
      } else if (e.key.length === 1) {
        barcodeBuffer.current += e.key;
        
        // Clear buffer if it takes too long between keystrokes (e.g. human typing vs scanner)
        // Scanner is very fast, usually < 30ms per char
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        timeoutRef.current = setTimeout(() => {
          barcodeBuffer.current = '';
        }, 100); // 100ms timeout
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [isScanning]);

  const handleExport = async (sku) => {
    try {
      const res = await fetch(`http://${window.location.hostname}:3001/api/inventory/export`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sku })
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error);
      }

      setLogs(prev => [{ sku, status: 'success', time: new Date().toLocaleTimeString(), product: data.data }, ...prev]);
    } catch (err) {
      setLogs(prev => [{ sku, status: 'error', time: new Date().toLocaleTimeString(), message: err.message }, ...prev]);
    }
  };

  return (
    <div className="animate-fade-in responsive-flex export-page-wrapper">
      <div className="glass-panel responsive-full-width export-scanner-panel">
        <div className="export-scanner-icon-container">
          <ScanBarcode size={80} color={isScanning ? 'var(--accent-success)' : 'var(--text-secondary)'} />
          {isScanning && (
            <div className="export-scanner-line" />
          )}
        </div>
        
        <h2>Chế Độ Quét: {isScanning ? 'ĐANG BẬT' : 'ĐÃ TẮT'}</h2>
        <p>
          {isScanning 
            ? 'Hãy dùng máy quét mã vạch quét trực tiếp vào Label QR. Hệ thống sẽ tự động xuất kho!' 
            : 'Đã tạm dừng nhận diện mã vạch.'}
        </p>
        
        <button 
          className={`btn ${isScanning ? 'btn-primary export-scanner-btn-active' : 'btn-success export-scanner-btn-inactive'}`}
          onClick={() => setIsScanning(!isScanning)}
        >
          {isScanning ? 'Tạm dừng Quét' : 'Bật lại máy Quét'}
        </button>
      </div>

      <div className="glass-panel responsive-full-width export-logs-panel">
        <h2>
          Nhật ký Xuất kho
          <span className="export-logs-count-badge">
            {logs.length} thao tác
          </span>
        </h2>
        
        <div className="export-logs-list">
          {logs.length === 0 ? (
            <div className="export-logs-empty-text">
              Chưa có thao tác xuất kho nào được ghi nhận.
            </div>
          ) : (
            logs.map((log, index) => (
              <div key={index} className={`export-log-card ${log.status}`}>
                <div className="export-log-icon-wrapper">
                  {log.status === 'success' ? <CheckCircle color="var(--accent-success)" /> : <XCircle color="var(--accent-danger)" />}
                </div>
                <div>
                  <div className="export-log-header">
                    <strong>
                      {log.product ? `${log.product.id}#${log.product.sku}` : log.sku}
                    </strong>
                    <span className="export-log-time">{log.time}</span>
                  </div>
                  <div className={`export-log-message ${log.status}`}>
                    {log.status === 'success' ? `Đã xuất kho thành công: ${log.product.productType} (${log.product.shop})` : log.message}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default ExportPage;
