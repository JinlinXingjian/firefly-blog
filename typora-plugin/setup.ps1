param(
    [string]$TyporaRoot = "",
    [switch]$Regenerate,
    [switch]$SkipInstall
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new()
$OutputEncoding = [System.Text.UTF8Encoding]::new()

Write-Host "== 风起笔记 · 新电脑初始化 ==" -ForegroundColor Cyan
Write-Host ""

& (Join-Path $PSScriptRoot "install.ps1") -TyporaRoot $TyporaRoot -SkipInstall:$SkipInstall
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host ""
Write-Host "== 配置 GitHub 发布密钥 ==" -ForegroundColor Cyan
Write-Host ""

& (Join-Path $PSScriptRoot "setup-key.ps1") -Regenerate:$Regenerate
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host ""
Write-Host "下一步：" -ForegroundColor Yellow
Write-Host "1. 在打开的 GitHub 页面粘贴公钥并保存。"
Write-Host "2. 完全退出并重新打开 Typora。"
Write-Host "3. 点击右下角「⋯ 其他」→「测试推送」，确认 SSH 和推送权限正常。"
Write-Host ""
