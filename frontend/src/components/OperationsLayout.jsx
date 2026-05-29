import React from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { PackagePlus, ScanBarcode, Printer, History } from 'lucide-react';

const OperationsLayout = () => {
  return (
    <div className="operations-layout-wrapper animate-fade-in">
      <div className="sub-nav-container">
        <NavLink 
          to="/operations/import" 
          className={({ isActive }) => `sub-nav-link ${isActive ? 'active' : ''}`}
        >
          <PackagePlus size={16} />
          <span>Nhập kho</span>
        </NavLink>
        <NavLink 
          to="/operations/export" 
          className={({ isActive }) => `sub-nav-link ${isActive ? 'active' : ''}`}
        >
          <ScanBarcode size={16} />
          <span>Xuất kho</span>
        </NavLink>
        <NavLink 
          to="/operations/print" 
          className={({ isActive }) => `sub-nav-link ${isActive ? 'active' : ''}`}
        >
          <Printer size={16} />
          <span>In tem nhãn</span>
        </NavLink>
        <NavLink 
          to="/operations/history" 
          className={({ isActive }) => `sub-nav-link ${isActive ? 'active' : ''}`}
        >
          <History size={16} />
          <span>Lịch sử</span>
        </NavLink>
      </div>
      <div className="sub-layout-content">
        <Outlet />
      </div>
    </div>
  );
};

export default OperationsLayout;
