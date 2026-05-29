import React, { useState, useEffect } from 'react';
import { 
  History, Search, PackagePlus, 
  PackageMinus, Clock, Printer, RotateCcw, HelpCircle 
} from 'lucide-react';
import './HistoryPage.css';

const filterOptions = [
  { label: 'Tất cả', value: 'ALL' },
  { label: 'Nhập kho', value: 'IMPORT' },
  { label: 'Xuất kho', value: 'EXPORT' },
  { label: 'Chờ lấy hàng (Pending)', value: 'MARK_PENDING' },
  { label: 'In tem nhãn', value: 'PRINT' },
  { label: 'Khôi phục', value: 'RESTORE_STOCK' }
];

const HistoryPage = () => {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState('ALL');

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const res = await fetch(`http://${window.location.hostname}:3001/api/logs`);
      const data = await res.json();
      if (data.data) {
        setLogs(data.data);
      }
    } catch (err) {
      console.error('Lỗi khi tải nhật ký thao tác:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  const formatDate = (isoString) => {
    if (!isoString) return { date: '—', time: '—' };
    const d = new Date(isoString);
    const date = d.toLocaleDateString('vi-VN');
    const time = d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    return { date, time };
  };

  // Lọc theo Action Type Tab và Search query
  const filtered = logs.filter(log => {
    // 1. Lọc theo tab
    if (activeFilter !== 'ALL' && log.actionType !== activeFilter) {
      return false;
    }

    // 2. Lọc theo thanh tìm kiếm
    const query = search.toLowerCase().trim();
    if (!query) return true;

    const combined = `${log.id}#${log.sku}#${log.productId}`.toLowerCase();
    return (
      log.sku?.toLowerCase().includes(query) ||
      String(log.productId) === query ||
      combined.includes(query) ||
      log.shop?.toLowerCase().includes(query) ||
      log.location?.toLowerCase().includes(query) ||
      log.details?.toLowerCase().includes(query)
    );
  });

  // Nhóm theo ngày hoạt động
  const grouped = filtered.reduce((acc, log) => {
    const { date } = formatDate(log.createdAt);
    if (!acc[date]) acc[date] = [];
    acc[date].push(log);
    return acc;
  }, {});

  // Cấu hình hiển thị theo từng loại hành động
  const getActionConfig = (type) => {
    switch (type) {
      case 'IMPORT':
        return {
          label: 'NHẬP KHO',
          className: 'action-import',
          icon: <PackagePlus size={16} />
        };
      case 'EXPORT':
        return {
          label: 'XUẤT KHO',
          className: 'action-export',
          icon: <PackageMinus size={16} />
        };
      case 'MARK_PENDING':
        return {
          label: 'PENDING',
          className: 'action-pending',
          icon: <Clock size={16} />
        };
      case 'PRINT':
        return {
          label: 'IN TEM NHÃN',
          className: 'action-print',
          icon: <Printer size={16} />
        };
      case 'RESTORE_STOCK':
        return {
          label: 'KHÔI PHỤC',
          className: 'action-restore',
          icon: <RotateCcw size={16} />
        };
      default:
        return {
          label: 'THAO TÁC',
          className: 'action-other',
          icon: <HelpCircle size={16} />
        };
    }
  };

  return (
    <div className="animate-fade-in history-page-container">
      <div className="history-header-flex">
        <div className="history-header-icon-box">
          <History size={22} color="white" />
        </div>
        <div className="history-header-title-col">
          <h1>Nhật Ký Thao Tác Hệ Thống</h1>
          <p>
            Theo dõi toàn bộ lịch sử nhập/xuất, in tem nhãn và khôi phục trong kho ({logs.length} sự kiện)
          </p>
        </div>
      </div>

      {/* Thanh lọc loại thao tác */}
      <div className="glass-panel history-tabs-container">
        {filterOptions.map(opt => (
          <button
            key={opt.value}
            onClick={() => setActiveFilter(opt.value)}
            className={`history-tab-btn ${activeFilter === opt.value ? 'active' : ''}`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Thanh tìm kiếm */}
      <div className="glass-panel history-search-wrapper">
        <Search size={18} style={{ color: 'var(--text-secondary)', flexShrink: 0 }} />
        <input
          type="text"
          placeholder="Tìm theo SKU, vị trí, cửa hàng, nội dung chi tiết..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="history-search-input"
        />
        {search && (
          <button onClick={() => setSearch('')} className="history-search-clear-btn">×</button>
        )}
      </div>

      {loading ? (
        <div className="history-loading-text">Đang tải lịch sử thao tác...</div>
      ) : filtered.length === 0 ? (
        <div className="glass-panel history-empty-state-panel">
          <History size={48} style={{ opacity: 0.3 }} />
          <p>{search || activeFilter !== 'ALL' ? 'Không tìm thấy nhật ký phù hợp.' : 'Chưa có hoạt động nào được ghi nhận.'}</p>
        </div>
      ) : (
        Object.entries(grouped).map(([date, dayLogs]) => (
          <div key={date} className="history-group-section">
            {/* Tiêu đề nhóm ngày */}
            <div className="history-group-header">
              <span className="history-group-date-badge">
                📅 {date}
              </span>
              <span className="history-group-count-text">
                {dayLogs.length} hoạt động
              </span>
              <div className="history-group-divider" />
            </div>

            {/* Danh sách logs trong ngày */}
            <div className="history-logs-column">
              {dayLogs.map(log => {
                const { time } = formatDate(log.createdAt);
                const config = getActionConfig(log.actionType);
                
                return (
                  <div key={log.id} className="glass-panel history-log-row-card">
                    {/* Icon loại Action */}
                    <div className={`action-icon-badge ${config.className}`} title={config.label}>
                      {config.icon}
                    </div>

                    {/* Shop + SKU + ID */}
                    <div className="history-log-sku-info-col">
                      <div className="history-log-sku-text">
                        {log.productId ? `${log.productId}#${log.sku}` : log.sku}
                      </div>
                      <div className="history-log-badges-row">
                        <span className="history-log-shop-badge">
                          {log.shop}
                        </span>
                        {log.location && log.location !== 'N/A' && (
                          <span className="history-log-location-badge">
                            📍 Kệ {log.location}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Chi tiết hoạt động */}
                    <div className="history-log-details-col">
                      <span className="history-log-details-title">CHI TIẾT THAO TÁC</span>
                      <div className="history-log-details-value">{log.details}</div>
                    </div>

                    {/* Thời gian thực hiện */}
                    <div className="history-log-time-badge">
                      <span className="time-label">THỜI GIAN THỰC HIỆN</span>
                      <strong className="time-value">{time}</strong>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))
      )}
    </div>
  );
};

export default HistoryPage;
