@echo off
setlocal

REM Change to directory containing this script
cd /d "%~dp0"

REM Launch the desktop shell
pushd desktop
call npm install
call npm start
popd

pause
