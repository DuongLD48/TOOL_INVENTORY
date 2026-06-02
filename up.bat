@echo off
title Git Push and Sync

echo =======================================================
echo          HE THONG DAY CODE NHANH (GIT PUSH)
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

echo [+] Trang thai thay doi hien tai (Git Status):
echo -------------------------------------------------------
git status -s
echo -------------------------------------------------------
echo.

rem Xac dinh branch hien tai
set BRANCH=
for /f "tokens=*" %%i in ('git branch --show-current 2^>nul') do set BRANCH=%%i
if "%BRANCH%"=="" (
    echo [CANH BAO] Khong the xac dinh branch hien tai. Dung mac dinh la "master".
    set BRANCH=master
)
echo [+] Nhanh hien tai: %BRANCH%
echo.

rem Nhap commit message
set /p commit_msg="Nhap noi dung commit (Nhan Enter de dung mac dinh 'Cap nhat he thong'): "
if "%commit_msg%"=="" (
    set commit_msg=Cap nhat he thong
)

echo.
echo [+] Dang add toan bo thay doi (git add .)...
git add .

echo [+] Dang commit voi thong diep: "%commit_msg%"...
git commit -m "%commit_msg%"

echo [+] Dang day code len GitHub nhanh %BRANCH% (git push origin %BRANCH%)...
git push origin %BRANCH%

if %errorlevel% eq 0 (
    echo.
    echo =======================================================
    echo          [THANH CONG] Code da duoc day len GitHub!
    echo =======================================================
) else (
    echo.
    echo =======================================================
    echo          [THAT BAI] Day code khong thanh cong.
    echo    Vui long kiem tra xung do hoac ket noi mang.
    echo =======================================================
)

pause
