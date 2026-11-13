param(
    [switch]$Regenerate,
    [switch]$ShowOnly,
    [switch]$NoOpen
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new()
$OutputEncoding = [System.Text.UTF8Encoding]::new()

$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$SshDir = Join-Path $HOME ".ssh"
$KeyPath = Join-Path $SshDir "id_ed25519_blog"
$PubPath = "$KeyPath.pub"
$ConfigPath = Join-Path $SshDir "config"
$KnownHostsPath = Join-Path $SshDir "known_hosts"
$Comment = "wind-blog@$env:COMPUTERNAME"
$GitHubUrl = "https://github.com/settings/ssh/new"
$GitRemote = "git@github.com:JinlinXingjian/firefly-blog.git"

function Send-Result {
    param([hashtable]$Result)
    Write-Output ("BLOG_RESULT:" + ($Result | ConvertTo-Json -Compress -Depth 6))
}

function Fail-Key {
    param([string]$Message)
    Send-Result @{ success = $false; message = $Message }
    exit 0
}

function Write-Utf8NoBom {
    param([string]$Path, [string]$Text)
    [System.IO.File]::WriteAllText($Path, $Text, [System.Text.UTF8Encoding]::new($false))
}

function Get-PublicKeyText {
    if (-not (Test-Path -LiteralPath $PubPath -PathType Leaf)) {
        $derived = & ssh-keygen -y -P '' -f $KeyPath 2>&1
        if ($LASTEXITCODE -ne 0) {
            Fail-Key ("无法读取私钥，可能设置了密码：`n" + ($derived -join "`n"))
        }
        Write-Utf8NoBom $PubPath (($derived -join "`n") + "`n")
    }
    return (Get-Content -LiteralPath $PubPath -Raw -Encoding UTF8).Trim()
}

function New-PublishKey {
    if (Test-Path -LiteralPath $KeyPath -PathType Leaf) {
        $stamp = Get-Date -Format "yyyyMMdd-HHmmss"
        Copy-Item -LiteralPath $KeyPath -Destination "$KeyPath.bak-$stamp" -Force
        if (Test-Path -LiteralPath $PubPath -PathType Leaf) {
            Copy-Item -LiteralPath $PubPath -Destination "$PubPath.bak-$stamp" -Force
        }
        Remove-Item -LiteralPath $KeyPath -Force
        if (Test-Path -LiteralPath $PubPath -PathType Leaf) {
            Remove-Item -LiteralPath $PubPath -Force
        }
    }
    $output = & ssh-keygen -t ed25519 -C $Comment -f $KeyPath -N '' 2>&1
    if ($LASTEXITCODE -ne 0) {
        Fail-Key ("生成 SSH 密钥失败：`n" + ($output -join "`n"))
    }
}

function Set-GitHubSshConfig {
    if (Test-Path -LiteralPath $ConfigPath -PathType Leaf) {
        $stamp = Get-Date -Format "yyyyMMdd-HHmmss"
        Copy-Item -LiteralPath $ConfigPath -Destination "$ConfigPath.bak-$stamp" -Force
    }

    $lines = @()
    if (Test-Path -LiteralPath $ConfigPath -PathType Leaf) {
        $lines = @(Get-Content -LiteralPath $ConfigPath -Encoding UTF8)
    }

    $out = [System.Collections.Generic.List[string]]::new()
    $inManaged = $false
    $inGitHub = $false
    foreach ($line in $lines) {
        if ($line -match '^\s*#\s*>>>\s*firefly-blog\s*$') { $inManaged = $true; continue }
        if ($line -match '^\s*#\s*<<<\s*firefly-blog\s*$') { $inManaged = $false; continue }
        if ($inManaged) { continue }

        if ($line -match '^\s*Host\s+github\.com(\s|$)') {
            $inGitHub = $true
            continue
        }
        if ($inGitHub -and $line -match '^\s*(Host|Match)\s+') {
            $inGitHub = $false
        }
        if ($inGitHub) { continue }
        $out.Add($line)
    }

    while ($out.Count -gt 0 -and [string]::IsNullOrWhiteSpace($out[$out.Count - 1])) {
        $out.RemoveAt($out.Count - 1)
    }
    if ($out.Count -gt 0) { $out.Add("") }

    $out.Add("# >>> firefly-blog >>>")
    $out.Add("Host github.com")
    $out.Add("  HostName ssh.github.com")
    $out.Add("  User git")
    $out.Add("  Port 443")
    $out.Add("  IdentityFile ~/.ssh/id_ed25519_blog")
    $out.Add("  IdentitiesOnly yes")
    $out.Add("# <<< firefly-blog <<<")

    Write-Utf8NoBom $ConfigPath (($out -join "`n") + "`n")
}

function Add-GitHubKnownHost {
    try {
        $scan = & ssh-keyscan -p 443 -T 10 ssh.github.com 2>$null
        if ($LASTEXITCODE -ne 0 -or -not $scan) { return }
        $existing = ""
        if (Test-Path -LiteralPath $KnownHostsPath -PathType Leaf) {
            $existing = Get-Content -LiteralPath $KnownHostsPath -Raw -Encoding UTF8
        }
        foreach ($line in $scan) {
            if ([string]::IsNullOrWhiteSpace($line)) { continue }
            if ($existing -notlike "*$line*") {
                [System.IO.File]::AppendAllText($KnownHostsPath, $line + "`n", [System.Text.UTF8Encoding]::new($false))
                $existing += "`n" + $line
            }
        }
    } catch {
        # known_hosts 添加失败不阻塞，测试推送时会给出具体报错
    }
}

function Set-GitRemote {
    $remote = & git -C $RepoRoot remote get-url origin 2>$null
    if ($LASTEXITCODE -ne 0) {
        $null = & git -C $RepoRoot remote add origin $GitRemote 2>&1
        if ($LASTEXITCODE -ne 0) { Fail-Key "无法添加 git remote origin。" }
        return
    }
    if ($remote -notmatch '(?i)github\.com[:/]JinlinXingjian/firefly-blog(\.git)?$') {
        $null = & git -C $RepoRoot remote set-url origin $GitRemote 2>&1
        if ($LASTEXITCODE -ne 0) { Fail-Key "无法把 git remote 改为 SSH 地址。" }
    }
}

try {
    if (-not (Test-Path -LiteralPath $SshDir -PathType Container)) {
        New-Item -ItemType Directory -Path $SshDir -Force | Out-Null
    }

    if ($ShowOnly) {
        if (-not (Test-Path -LiteralPath $KeyPath -PathType Leaf)) {
            Fail-Key "本机还没有发布密钥，请先生成。"
        }
        $publicKey = Get-PublicKeyText
        try { Set-Clipboard -Value $publicKey } catch {}
        Send-Result @{
            success = $true
            created = $false
            publicKey = $publicKey
            keyPath = $KeyPath
            githubUrl = $GitHubUrl
            message = "公钥已复制。请粘贴到 GitHub 的 SSH key 页面。"
        }
        exit 0
    }

    $created = $false
    $regenerated = $false
    if ($Regenerate) {
        New-PublishKey
        $created = $true
        $regenerated = $true
    } elseif (-not (Test-Path -LiteralPath $KeyPath -PathType Leaf)) {
        New-PublishKey
        $created = $true
    }

    $publicKey = Get-PublicKeyText
    Set-GitHubSshConfig
    Add-GitHubKnownHost
    Set-GitRemote

    try { Set-Clipboard -Value $publicKey } catch {}
    if (-not $NoOpen) {
        try { Start-Process $GitHubUrl } catch {}
    }

    $message = if ($created) {
        "发布密钥已生成并复制到剪贴板。请粘贴到 GitHub，保存后点击「测试推送」。"
    } else {
        "公钥已复制到剪贴板。"
    }
    Send-Result @{
        success = $true
        created = $created
        regenerated = $regenerated
        publicKey = $publicKey
        keyPath = $KeyPath
        githubUrl = $GitHubUrl
        message = $message
    }
} catch {
    Fail-Key ("密钥配置失败：" + $_.Exception.Message)
}
