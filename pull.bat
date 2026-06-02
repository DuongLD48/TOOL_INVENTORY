@echo off
title Git Pull and Update

echo =======================================================
echo          HE THONG CAP NHAT CODE (GIT PULL)
echo                  TOOL INVENTORY
echo =======================================================
echo.

rem Kiem tra Git da cai dat chua
where git >nul 2>nul
if %errorlevel% neq 0 (
    echo [LOI] Git chua duoc cai dat tren may nay!
    pause
    exit /b
)

rem Kiem tra xem thu muc co phai la repository Git khong
if not exist .git (
    echo [LOI] Thu muc hien tai khong phai la mot Git Repository!
    pause
    exit /b
)

rem Xac dinh branch hien tai
set BRANCH=
for /f "tokens=*" %%i in ('git branch --show-current 2^>nul') do set BRANCH=%%i
if "%BRANCH%"=="" (
    set BRANCH=master
)
echo [+] Nhanh hien tai: %BRANCH%
echo [+] Dang lay code moi nhat tu GitHub...
echo.

git pull origin %BRANCH%

if %errorlevel% eq 0 (
    echo.
    echo =======================================================
    echo          [THANH CONG] Cap nhat code thanh cong!
    echo =======================================================
    echo.
    set /p install_choice="Ban co muon chay pnpm install de cap nhat lai thu vien khong? (Y/N): "
    if /i "%install_choice%"=="Y" (
        echo.
        echo [+] Dang cap nhat thu vien cho Backend...
        cd backend && call pnpm install && cd ..
        
        echo.
        echo [+] Dang cap nhat thu vien cho Frontend...
        cd frontend && call pnpm install && cd ..
        
        echo.
        echo [+] Da hoan thanh cap nhat toan bo thu vien!
    )
) else (
    echo.
    echo =======================================================
    echo          [THAT BAI] Cap nhat khong thanh cong.
    echo    Vui long kiem tra ket noi mang hoac xung dot code.
    echo =======================================================
)

pause
