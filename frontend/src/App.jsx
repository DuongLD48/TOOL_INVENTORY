import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import OperationsLayout from './components/OperationsLayout';
import ToolsLayout from './components/ToolsLayout';
import Dashboard from './pages/Dashboard';
import ImportPage from './pages/ImportPage';
import ExportPage from './pages/ExportPage';
import BatchPrintPage from './pages/BatchPrintPage';
import HistoryPage from './pages/HistoryPage';
import OrderMatchingPage from './pages/OrderMatchingPage';
import ImageSearchPage from './pages/ImageSearchPage';
import PrintMonitorPage from './pages/PrintMonitorPage';
import { SocketProvider } from './context/SocketContext';

function App() {
  return (
    <SocketProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Layout />}>
            <Route index element={<Dashboard />} />
            <Route path="monitor" element={<PrintMonitorPage />} />
            
            {/* Giao dịch / Nghiệp vụ */}
            <Route path="operations" element={<OperationsLayout />}>
              <Route index element={<Navigate to="import" replace />} />
              <Route path="import" element={<ImportPage />} />
              <Route path="export" element={<ExportPage />} />
              <Route path="print" element={<BatchPrintPage />} />
              <Route path="history" element={<HistoryPage />} />
            </Route>

            {/* Công cụ / Tiện ích */}
            <Route path="tools" element={<ToolsLayout />}>
              <Route index element={<Navigate to="search-image" replace />} />
              <Route path="search-image" element={<ImageSearchPage />} />
              <Route path="match-orders" element={<OrderMatchingPage />} />
            </Route>
          </Route>
        </Routes>
      </BrowserRouter>
    </SocketProvider>
  );
}

export default App;
