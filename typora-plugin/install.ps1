param(
    [string]$TyporaRoot = "",
    [switch]$SkipInstall
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new()
$OutputEncoding = [System.Text.UTF8Encoding]::new()

$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$PluginSource = Join-Path $PSScriptRoot "blog.js"
$SettingsScript = Join-Path $PSScriptRoot "configure-settings.mjs"

function Fail {
    param([string]$Message)
    Write-Host ""
    Write-Host "安装失败：$Message" -ForegroundColor Red
    exit 1
}

function Find-TyporaRoot {
    param([string]$Preferred)

    $candidates = [System.Collections.Generic.List[string]]::new()
    if (-not [string]::IsNullOrWhiteSpace($Preferred)) { $candidates.Add($Preferred) }

    $registryPaths = @(
        "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\Typora",
        "HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\Typora",
        "HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\Typora"
    )
    foreach ($registryPath in $registryPaths) {
        try {
            $item = Get-ItemProperty -LiteralPath $registryPath -ErrorAction Stop
            if ($item.InstallLocation) { $candidates.Add($item.InstallLocation) }
        } catch {
            # 没有注册表项时继续找默认目录
        }
    }

    if ($env:ProgramFiles) { $candidates.Add((Join-Path $env:ProgramFiles "Typora")) }
    if (${env:ProgramFiles(x86)}) { $candidates.Add((Join-Path ${env:ProgramFiles(x86)} "Typora")) }
    if ($env:LOCALAPPDATA) { $candidates.Add((Join-Path $env:LOCALAPPDATA "Programs\Typora")) }
    $candidates.Add("D:\Typora")
    $candidates.Add("C:\Program Files\Typora")

    foreach ($candidate in ($candidates | Select-Object -Unique)) {
        if ([string]::IsNullOrWhiteSpace($candidate)) { continue }
        $exe = Join-Path $candidate "Typora.exe"
        if (Test-Path -LiteralPath $exe -PathType Leaf) {
            return (Resolve-Path -LiteralPath $candidate).Path
        }
    }
    return $null
}

Write-Host "== 风起笔记 · Typora 写作环境安装 ==" -ForegroundColor Cyan
Write-Host ""

$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) {
    Fail "未找到 Node.js。请先安装 Node.js 22.23 或更高版本：https://nodejs.org/"
}
$nodeMajor = 0
try {
    $nodeMajor = [int](& node -p "process.versions.node.split('.')[0]")
} catch {
    Fail "Node.js 无法运行，请重新安装。"
}
if ($nodeMajor -lt 22) {
    Fail "当前 Node.js 版本过低，需要 22.23 或更高版本。"
}

$needInstall = -not (Test-Path -LiteralPath (Join-Path $RepoRoot "node_modules\gray-matter") -PathType Container) -or
    -not (Test-Path -LiteralPath (Join-Path $RepoRoot "node_modules\pinyin-pro") -PathType Container)
if ($needInstall -and -not $SkipInstall) {
    $pnpm = Get-Command pnpm -ErrorAction SilentlyContinue
    if (-not $pnpm) {
        Fail "未找到 pnpm。请先运行：npm install -g pnpm@11.22.0"
    }
    Write-Host "正在安装博客依赖（pnpm install）……"
    Push-Location $RepoRoot
    try {
        & pnpm install --frozen-lockfile
        if ($LASTEXITCODE -ne 0) {
            Fail "pnpm install 失败。请检查网络后重试。"
        }
    } finally {
        Pop-Location
    }
}

$root = Find-TyporaRoot $TyporaRoot
if (-not $root) {
    Fail "未找到 Typora。请安装 Typora，或用 -TyporaRoot 'D:\Typora' 指定安装目录。"
}

$pluginDir = Join-Path $root "resources\plugin"
$coreFile = Join-Path $pluginDir "global\core\index.js"
if (-not (Test-Path -LiteralPath $coreFile -PathType Leaf)) {
    Fail "Typora Plugin 尚未安装。请先安装 Typora Plugin 1.19.15，然后重新运行本脚本。"
}

Copy-Item -LiteralPath $PluginSource -Destination (Join-Path $pluginDir "blog.js") -Force

$settingsPath = Join-Path $pluginDir "global\settings\settings.user.toml"
if (Test-Path -LiteralPath $settingsPath -PathType Leaf) {
    $backupPath = "$settingsPath.bak-" + (Get-Date -Format "yyyyMMdd-HHmmss")
    Copy-Item -LiteralPath $settingsPath -Destination $backupPath -Force
    Write-Host "已备份原配置：$backupPath"
}

$configOutput = & node $SettingsScript --settings $settingsPath --repo-root $RepoRoot 2>&1
if ($LASTEXITCODE -ne 0) {
    Fail ("写入 Typora 配置失败：`n" + ($configOutput -join "`n"))
}

Write-Host ""
Write-Host "安装完成。" -ForegroundColor Green
Write-Host "Typora：$root"
Write-Host "插件：$(Join-Path $pluginDir 'blog.js')"
Write-Host "配置：$settingsPath"
Write-Host ""
Write-Host "右下角会出现 5 个按钮：博客模式、新建文章、发布、打开网站、其他。"
Write-Host "请完全退出并重新打开 Typora，让新插件生效。"
Write-Host ""
