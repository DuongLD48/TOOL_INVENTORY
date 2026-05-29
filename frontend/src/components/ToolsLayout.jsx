import React from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { Image, ClipboardList } from 'lucide-react';

const ToolsLayout = () => {
  return (
    <div className="tools-layout-wrapper animate-fade-in">
      <div className="sub-nav-container">
        <NavLink 
          to="/tools/search-image" 
          className={({ isActive }) => `sub-nav-link ${isActive ? 'active' : ''}`}
        >
          <Image size={16} />
          <span>Tìm kiếm bằng ảnh</span>
        </NavLink>
        <NavLink 
          to="/tools/match-orders" 
          className={({ isActive }) => `sub-nav-link ${isActive ? 'active' : ''}`}
        >
          <ClipboardList size={16} />
          <span>Ghép đơn tồn</span>
        </NavLink>
      </div>
      <div className="sub-layout-content">
        <Outlet />
      </div>
    </div>
  );
};

export default ToolsLayout;
