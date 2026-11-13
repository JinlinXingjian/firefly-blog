param()

# 原生命令（ssh / git）会把正常提示写到 stderr，这里不能用 Stop。
$ErrorActionPreference = "Continue"
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new()
$OutputEncoding = [System.Text.UTF8Encoding]::new()

$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path

function Send-Result {
    param([hashtable]$Result)
    Write-Output ("BLOG_RESULT:" + ($Result | ConvertTo-Json -Compress -Depth 6))
}

function Fail-Test {
    param([string]$Message, [string]$Detail = "")
    Send-Result @{ success = $false; message = $Message; detail = $Detail }
    exit 0
}

try {
    Write-Output "BLOG_PROGRESS:正在检查 Git remote 配置..."
    $remote = (& git -C $RepoRoot remote get-url origin 2>&1 | Out-String).Trim()
    if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($remote)) {
        Fail-Test "仓库没有配置 origin。" "请先运行 install.ps1，或手动设置 origin。"
    }
    if ($remote -notmatch '^(git@github\.com:|ssh://git@github\.com/)') {
        Fail-Test "origin 不是 SSH 地址。" "当前 origin：$remote`n请运行 setup-key.ps1 自动改为 SSH。"
    }

    Write-Output "BLOG_PROGRESS:正在检查 SSH 认证..."
    $sshOutput = (& ssh -T -o BatchMode=yes -o ConnectTimeout=15 -o StrictHostKeyChecking=accept-new git@github.com 2>&1 | Out-String).Trim()
    $sshOk = $sshOutput -match '(?i)successfully authenticated'
    if (-not $sshOk) {
        $hint = "请确认 GitHub 上已经添加本机公钥。可以在 Typora 中点击「密钥管理」重新复制公钥。"
        if ($sshOutput -match '(?i)permission denied|publickey') {
            $hint = "GitHub 拒绝了这把公钥。请把「密钥管理」里显示的公钥重新添加到 GitHub，然后重试。"
        } elseif ($sshOutput -match '(?i)could not resolve|connection timed out|connection refused|network is unreachable') {
            $hint = "网络无法连接到 GitHub SSH 443。请检查网络或代理。"
        } elseif ($sshOutput -match '(?i)host key verification failed') {
            $hint = "SSH 主机指纹校验失败。请运行 setup-key.ps1 重新写入 known_hosts。"
        }
        Fail-Test "SSH 认证失败。" ($hint + "`n`n" + $sshOutput)
    }

    Write-Output "BLOG_PROGRESS:SSH 认证通过，正在读取仓库..."
    $lsOutput = (& git -C $RepoRoot ls-remote --heads origin 2>&1 | Out-String).Trim()
    if ($LASTEXITCODE -ne 0) {
        Fail-Test "SSH 认证成功，但读取 GitHub 仓库失败。" $lsOutput
    }

    $env:GIT_TERMINAL_PROMPT = "0"
    Write-Output "BLOG_PROGRESS:正在检查推送权限..."
    $pushOutput = (& git -C $RepoRoot push --dry-run origin HEAD:refs/heads/master 2>&1 | Out-String).Trim()
    $pushCode = $LASTEXITCODE
    $pushAuthFailed = $pushOutput -match '(?i)(permission denied|publickey|could not read from remote|host key verification failed|repository not found|authentication failed)'
    if ($pushAuthFailed) {
        Fail-Test "SSH 认证成功，但 GitHub 拒绝推送。" $pushOutput
    }

    $nonFastForward = $pushOutput -match '(?i)(non-fast-forward|fetch first|\[rejected\])'
    if ($pushCode -ne 0 -and -not $nonFastForward) {
        Fail-Test "推送测试未通过。" $pushOutput
    }

    Write-Output "BLOG_PROGRESS:检查完成。"
    $message = if ($nonFastForward) {
        "SSH 认证成功，推送权限正常；本地分支落后于远程，发布前先执行 git pull --rebase。"
    } else {
        "SSH 认证成功，GitHub 推送权限正常。"
    }
    Send-Result @{
        success = $true
        message = $message
        remote = $remote
        detail = $pushOutput
    }
} catch {
    Fail-Test "推送测试失败：" $_.Exception.Message
}
