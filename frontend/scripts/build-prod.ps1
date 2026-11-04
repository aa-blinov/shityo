# Сборка фронтенда для локального запуска рядом с бэкендом.
# Проксировать /api не нужно: production-сервер (server.js) сам перенаправляет
# эти запросы на бэкенд, поэтому PUBLIC_API_BASE можно не задавать.
$ErrorActionPreference = "Stop"
npm run build
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
Write-Output "build ok"
