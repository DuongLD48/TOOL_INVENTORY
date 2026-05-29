import React, { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { LayoutDashboard, Smartphone, Briefcase, Wrench } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import './Layout.css';

const Layout = () => {
  const [networkUrl, setNetworkUrl] = useState('');
  const location = useLocation();

  useEffect(() => {
    fetch(`http://${window.location.hostname}:3001/api/network-ip`)
      .then(res => res.json())
      .then(data => {
        // Cổng 5173 là cổng mặc định của Vite
        setNetworkUrl(`http://${data.ip}:5173`);
      })
      .catch(err => console.error(err));
  }, []);

  const isOperationsActive = location.pathname.startsWith('/operations');
  const isToolsActive = location.pathname.startsWith('/tools');

  return (
    <div className="app-container">
      <aside className="sidebar glass-panel sidebar-aside">
        <div className="sidebar-header sidebar-header-box">
          <h2 className="sidebar-logo-title">
            <div className="sidebar-logo-icon-bg">
              <LayoutDashboard size={18} color="white" />
            </div>
            INV SYS
          </h2>
        </div>
        
        <NavLink 
          to="/" 
          end
          className={({isActive}) => `nav-link ${isActive ? 'active' : ''}`}
        >
          <LayoutDashboard size={20} />
          <span>Trang chủ</span>
        </NavLink>

        <NavLink 
          to="/operations/import" 
          className={`nav-link ${isOperationsActive ? 'active' : ''}`}
        >
          <Briefcase size={20} />
          <span>Nghiệp vụ</span>
        </NavLink>

        <NavLink 
          to="/tools/search-image" 
          className={`nav-link ${isToolsActive ? 'active' : ''}`}
        >
          <Wrench size={20} />
          <span>Tiện ích</span>
        </NavLink>
        
        <div className="qr-container sidebar-qr-box">
          <div className="sidebar-qr-header">
            <Smartphone size={16} />
            <span className="sidebar-qr-title">QUÉT ĐỂ MỞ TRÊN PHONE</span>
          </div>
          {networkUrl ? (
            <div className="sidebar-qr-svg-wrapper">
              <QRCodeSVG value={networkUrl} size={130} />
            </div>
          ) : (
            <span className="sidebar-qr-loading">Đang tải mã QR...</span>
          )}
        </div>
      </aside>
      
      <main className="main-content">
        <Outlet />
      </main>
    </div>
  );
};

export default Layout;
