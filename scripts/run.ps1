# Скрипт запуска пилота: backend + собранный фронтенд.
# Использование: .\scripts\run.ps1
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$python = Join-Path $root ".venv\Scripts\python.exe"

if (-not (Test-Path $python)) {
    throw "Нет виртуального окружения: $python"
}

Write-Host "Запуск бэкенда на http://127.0.0.1:8000"
$backend = Start-Process -FilePath $python `
    -ArgumentList "-m", "uvicorn", "app.main:app", "--app-dir", "backend", "--port", "8000" `
    -WorkingDirectory $root -PassThru -NoNewWindow

$frontendDist = Join-Path $root "frontend\build"
if (Test-Path $frontendDist) {
    Write-Host "Фронтенд собран: $frontendDist"
} else {
    Write-Host "Фронтенд не собран. Выполните: cd frontend; npm install; npm run build"
}

Write-Host "Backend PID: $($backend.Id). Остановка: Stop-Process -Id $($backend.Id)"
