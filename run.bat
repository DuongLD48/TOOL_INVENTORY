@echo off
echo =========================================
echo Bắt đầu chạy hệ thống Inventory với pnpm...
echo =========================================

echo Đang khởi động Backend Server...
start "Backend Server" cmd /k "cd backend && pnpm install && node server.js"

echo Đang khởi động Frontend Server (Vite)...
start "Frontend Server" cmd /k "cd frontend && pnpm install && pnpm dev"

echo Hệ thống đang chạy trên 2 cửa sổ cmd riêng biệt.
echo Bạn có thể đóng cửa sổ này đi.
