@echo off
title Clone and Setup TOOL_INVENTORY

echo =======================================================
echo          HE THONG PHAN PHOI VA CAI DAT NHANH
echo                  TOOL INVENTORY
echo =======================================================
echo.

rem Kiem tra neu thu muc TOOL_INVENTORY da ton tai
if exist TOOL_INVENTORY (
    echo [CANH BAO] Thu muc TOOL_INVENTORY da ton tai trong thu muc hien tai!
    set /p delete_choice="Ban co muon xoa thu muc cu de clone ban moi nhat khong? (Y/N): "
    if /i "%delete_choice%"=="Y" (
        echo Dang xoa thu muc TOOL_INVENTORY cu...
        rmdir /s /q TOOL_INVENTORY
        if %errorlevel% neq 0 (
            echo [LOI] Khong the xoa thu muc cu. Vui long tat cac chuong trinh dang su dung thu muc nay va thu lai.
            pause
            exit /b
        )
    ) else (
        echo Da huy thao tac clone moi. Di chuyen vao thu muc san co...
        goto setup_existing
    )
)

rem Kiem tra Git da cai dat chua
where git >nul 2>nul
if %errorlevel% neq 0 (
    echo [LOI] Git chua duoc cai dat tren may nay!
    echo Vui long tai va cai dat Git truoc tai: https://git-scm.com/
    pause
    exit /b
)

rem Thuc hien clone repo
echo [+] Dang clone repository tu GitHub...
git clone https://github.com/DuongLD48/TOOL_INVENTORY.git
if %errorlevel% neq 0 (
    echo [LOI] Khong the clone repository. Vui long kiem tra lai ket noi mang hoac quyen truy cap.
    pause
    exit /b
)

echo [+] Da clone repository thanh cong!

:setup_existing
cd TOOL_INVENTORY

rem Kiem tra Node.js
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [CANH BAO] Node.js chua duoc cai dat. 
    echo Ban can cai dat Node.js de chay du an. Tai tai: https://nodejs.org/
    echo.
    goto end_options
) else (
    echo [+] Da tim thay Node.js.
)

rem Kiem tra pnpm
where pnpm >nul 2>nul
if %errorlevel% neq 0 (
    echo [+] Khong tim thay pnpm. Dang tien hanh cai dat pnpm toan cuc thong qua npm...
    where npm >nul 2>nul
    if %errorlevel% eq 0 (
        call npm install -g pnpm
    ) else (
        echo [LOI] Khong tim thay npm (Node.js). Vui long cai dat Node.js de tiep tuc.
        goto end_options
    )
) else (
    echo [+] Da tim thay pnpm.
)

rem Hoi nguoi dung cai dat dependencies
echo.
set /p user_choice="Ban co muon tu dong cai dat thu vien (dependencies) cho ca Backend va Frontend khong? (Y/N): "
if /i "%user_choice%"=="Y" (
    echo.
    echo [+] Dang cai dat thu vien cho Backend...
    cd backend && call pnpm install && cd ..
    
    echo.
    echo [+] Dang cai dat thu vien cho Frontend...
    cd frontend && call pnpm install && cd ..
    
    echo.
    echo [+] Da hoan thanh cai dat toan bo thu vien!
    echo.
    set /p run_choice="Ban co muon khoi dong he thong ngay bay gio khong? (Y/N): "
    if /i "%run_choice%"=="Y" (
        call run.bat
    )
)

:end_options
echo.
echo =======================================================
echo          Hoan tat cai dat! Du an da duoc clone.
echo    Ban co the chay du an bang cach chay file 'run.bat'
echo =======================================================
pause
