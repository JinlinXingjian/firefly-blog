param(
    [Parameter(Mandatory = $true)]
    [string]$FilePath,
    [switch]$All
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new()
$OutputEncoding = [System.Text.UTF8Encoding]::new()

$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$PostsDir = Join-Path $RepoRoot "src\content\posts"
$IndexFile = Join-Path $RepoRoot "BLOG_INDEX.md"
$SiteUrl = "https://jinlinxingjian-blog.pages.dev"

function Send-Result {
    param([hashtable]$Result)
    Write-Output ("BLOG_RESULT:" + ($Result | ConvertTo-Json -Compress -Depth 6))
}

function Fail-Publish {
    param([string]$Message)
    Send-Result @{ success = $false; message = $Message }
    exit 0
}

function Get-FrontMatterValue {
    param([string]$FrontMatter, [string]$Key)
    $match = [regex]::Match($FrontMatter, "(?m)^" + [regex]::Escape($Key) + "\s*:\s*(.*?)\s*$")
    if (-not $match.Success) { return "" }
    $value = $match.Groups[1].Value.Trim()
    if ($value.StartsWith('"') -and $value.EndsWith('"')) {
        try { return ($value | ConvertFrom-Json) } catch { return $value.Trim('"') }
    }
    if ($value.StartsWith("'") -and $value.EndsWith("'")) {
        return $value.Substring(1, $value.Length - 2)
    }
    return $value
}

function Test-PathUnder {
    param([string]$Child, [string]$Parent)
    $parentFull = [System.IO.Path]::GetFullPath($Parent).TrimEnd('\') + '\'
    $childFull = [System.IO.Path]::GetFullPath($Child)
    return $childFull.StartsWith($parentFull, [System.StringComparison]::OrdinalIgnoreCase)
}

function Test-LocalProxy {
    try {
        $client = [System.Net.Sockets.TcpClient]::new()
        $task = $client.ConnectAsync("127.0.0.1", 7897)
        if ($task.Wait(350) -and $client.Connected) { return "http://127.0.0.1:7897" }
        $client.Close()
    } catch {
        # 没有代理时直接走直连
    }
    return $null
}

try {
    if (-not (Test-Path -LiteralPath $FilePath -PathType Leaf)) {
        Fail-Publish "找不到当前文章：$FilePath"
    }

    $postFile = (Resolve-Path -LiteralPath $FilePath).Path
    $postDir = Split-Path -Parent $postFile
    if (-not (Test-PathUnder $postFile $PostsDir)) {
        Fail-Publish "当前文件不在博客文章目录：$PostsDir"
    }

    $content = Get-Content -LiteralPath $postFile -Raw -Encoding UTF8
    $fmMatch = [regex]::Match($content, "(?s)^---\s*\r?\n(.*?)\r?\n---")
    if (-not $fmMatch.Success) {
        Fail-Publish "文章缺少 frontmatter（文件开头的 --- 区块）"
    }
    $frontMatter = $fmMatch.Groups[1].Value

    $title = (Get-FrontMatterValue $frontMatter "title") -replace "\s+", " "
    $published = Get-FrontMatterValue $frontMatter "published"
    $draftText = Get-FrontMatterValue $frontMatter "draft"
    if ([string]::IsNullOrWhiteSpace($title)) { Fail-Publish "frontmatter 缺少 title" }
    if ([string]::IsNullOrWhiteSpace($published)) { Fail-Publish "frontmatter 缺少 published" }

    $assetsDir = Join-Path $postDir ((Get-Item -LiteralPath $postFile).BaseName + ".assets")
    $missingImages = [System.Collections.Generic.List[string]]::new()
    $outsideImages = [System.Collections.Generic.List[string]]::new()
    foreach ($imageMatch in [regex]::Matches($content, '!\[[^\]]*\]\(([^)]+)\)')) {
        $raw = $imageMatch.Groups[1].Value.Trim()
        if ($raw.StartsWith("<") -and $raw.EndsWith(">")) {
            $raw = $raw.Substring(1, $raw.Length - 2)
        }
        $raw = ($raw -replace '\s+["''].*$', "").Trim()
        if ($raw -match '^(https?:|data:|mailto:|#)') { continue }
        if ($raw.StartsWith("/")) { continue }

        $decoded = [System.Uri]::UnescapeDataString($raw)
        $imagePath = [System.IO.Path]::GetFullPath((Join-Path $postDir $decoded))
        if (-not (Test-Path -LiteralPath $imagePath -PathType Leaf)) {
            $missingImages.Add($raw)
            continue
        }
        if (-not (Test-PathUnder $imagePath $assetsDir)) {
            $outsideImages.Add($raw)
        }
    }
    if ($missingImages.Count -gt 0) {
        Fail-Publish ("图片不存在：`n" + ($missingImages -join "`n"))
    }
    if ($outsideImages.Count -gt 0) {
        Fail-Publish ("以下图片不在文章资源目录 " + (Split-Path -Leaf $assetsDir) + " 中：`n" + ($outsideImages -join "`n") + "`n请在 Typora 中把图片重新插入到该目录，或手动移到该目录。")
    }

    # 先更新历史工作台，再决定是否真的有改动
    $indexOutput = & node (Join-Path $RepoRoot "scripts\typora\build-index.mjs") 2>&1
    if ($LASTEXITCODE -ne 0) {
        Fail-Publish ("生成 BLOG_INDEX.md 失败：`n" + ($indexOutput -join "`n"))
    }

    $branch = (& git -C $RepoRoot rev-parse --abbrev-ref HEAD 2>&1 | Out-String).Trim()
    if ($LASTEXITCODE -ne 0) { Fail-Publish "无法读取 Git 分支，请确认仓库状态" }
    if ($branch -ne "master") {
        Fail-Publish "当前 Git 分支是 $branch，不是 master。请先切回 master。"
    }

    $paths = [System.Collections.Generic.List[string]]::new()
    $paths.Add($postFile)
    $paths.Add($IndexFile)
    if ($All) {
        $paths.Clear()
        $paths.Add($PostsDir)
        $paths.Add($IndexFile)
    } elseif (Test-Path -LiteralPath $assetsDir -PathType Container) {
        $paths.Add($assetsDir)
    }

    $status = (& git -C $RepoRoot status --porcelain -- @paths 2>&1 | Out-String).Trim()
    if ($LASTEXITCODE -ne 0) { Fail-Publish "git status 失败：`n$status" }
    if ([string]::IsNullOrWhiteSpace($status)) {
        Send-Result @{ success = $true; message = "没有需要发布的内容，文章已是最新。"; title = $title; url = "$SiteUrl/posts/$([System.IO.Path]::GetFileNameWithoutExtension($postFile))/" }
        exit 0
    }

    $null = (& git -C $RepoRoot add -- @paths 2>$null | Out-String).Trim()

    & git -C $RepoRoot diff --cached --quiet -- @paths
    $diffCode = $LASTEXITCODE
    if ($diffCode -eq 0) {
        Send-Result @{ success = $true; message = "没有需要提交的新改动。"; title = $title }
        exit 0
    }
    if ($diffCode -ne 1) { Fail-Publish "无法检查暂存区状态（git diff 退出码 $diffCode）" }

    $commitMessage = "post: $title"
    $commitOutput = (& git -C $RepoRoot commit -m $commitMessage 2>&1 | Out-String).Trim()
    if ($LASTEXITCODE -ne 0) { Fail-Publish "git commit 失败：`n$commitOutput" }

    $localHead = (& git -C $RepoRoot rev-parse HEAD 2>&1 | Out-String).Trim()
    $proxy = Test-LocalProxy
    $env:GIT_TERMINAL_PROMPT = "0"
    if ($proxy) {
        $pushOutput = (& git -C $RepoRoot -c "http.proxy=$proxy" -c "https.proxy=$proxy" push origin master 2>&1 | Out-String).Trim()
    } else {
        $pushOutput = (& git -C $RepoRoot push origin master 2>&1 | Out-String).Trim()
    }
    if ($LASTEXITCODE -ne 0) {
        $looksFailed = [string]::IsNullOrWhiteSpace($pushOutput) -or ($pushOutput -match '(?i)(rejected|fatal|error:|failed|could not resolve|unable to access|timed out|non-fast-forward)')
        if ($looksFailed) {
            Fail-Publish ("已提交到本地，但 push 失败。`n`n" + $pushOutput + "`n`n如果提示需要先拉取，请在仓库目录运行 git pull --rebase 后重试。")
        }
    }

    $postSlug = [System.IO.Path]::GetFileNameWithoutExtension($postFile)
    $isDraft = $draftText -eq "true"
    $message = if ($isDraft) {
        "已推送草稿（draft: true），线上暂时不会显示。"
    } else {
        "已推送，Cloudflare Pages 将在 1–2 分钟内自动发布。"
    }
    Send-Result @{
        success = $true
        message = $message
        title = $title
        url = "$SiteUrl/posts/$postSlug/"
        draft = $isDraft
        commit = $commitMessage
    }
} catch {
    Fail-Publish ("发布失败：" + $_.Exception.Message)
}
