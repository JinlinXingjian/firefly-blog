# Typora 博客写作工作流

这个文件夹是博客的 Typora 插件和本地发布脚本，跟随博客源码仓库一起 clone。

## 先说架构

GitHub 上的 `firefly-blog` **就是博客本体仓库**，不是构建后的静态网站仓库。

```text
本地 Typora / VS Code
        │
        │ git push
        ▼
GitHub 源码仓库 firefly-blog
        │
        │ GitHub Actions：pnpm build
        ▼
dist/ 静态文件
        │
        │ wrangler pages deploy
        ▼
Cloudflare Pages（Direct Upload）
```

- 仓库里有 `src/`、配置文件、文章和这个 `typora-plugin/`。
- `dist/` 是构建产物，不提交到 Git。
- Cloudflare Pages 没有直接连接 Git 仓库；构建和上传由 GitHub Actions 完成。
- Vercel 是备用，也是从同一个源码仓库构建。
- 所以**不需要再建一个“博客本体仓库”**；现在这个仓库已经是本体。

换电脑时 clone 这个仓库，就同时得到了文章、主题配置、发布脚本和 Typora 插件。

---

## 5 个按钮

| 按钮 | 功能 | 快捷键 |
|---|---|---|
| 📖 书本 | 进入博客模式，打开 `BLOG_INDEX.md` 历史工作台 | `Ctrl+Alt+B` |
| ＋ 加号 | 新建文章（标题、分类、标签） | `Ctrl+Alt+N` |
| ☁ 上传 | 发布当前文章 | `Ctrl+Alt+P` |
| ↗ 外链 | 打开线上博客 | 无 |
| ⋯ 其他 | 密钥管理 / 测试推送 / 文章目录 / GitHub / 使用说明 | 无 |

密钥管理和测试推送收在「⋯ 其他」里，主界面只保留常用按钮。

另外，`Ctrl+Alt+Shift+P` 可以发布 `src/content/posts/` 下所有博客改动。

---

## 新电脑初始化

### 前置条件

先安装：

1. [Typora](https://typora.io/) 1.12.x
2. [Typora Plugin](https://github.com/obgnail/typora_plugin) 1.19.15（按它的说明把 `plugin` 目录放进 Typora 安装目录）
3. Git
4. Node.js 22.23 或更高版本
5. pnpm：`npm install -g pnpm@11.22.0`

> Typora Plugin 是第三方插件框架，本仓库只包含自定义的 `blog.js`，不包含整个框架。

### 1. clone 仓库

```bash
git clone https://github.com/JinlinXingjian/firefly-blog.git
cd firefly-blog
```

如果当前网络无法访问 GitHub HTTPS，可以临时开代理，或者用 GitHub 网页下载 ZIP。clone 完成后，下面的脚本会把 `origin` 自动改成 SSH 443，不依赖 HTTPS。

### 2. 一键初始化

```powershell
powershell -ExecutionPolicy Bypass -File .\typora-plugin\setup.ps1
```

脚本会：

- 检查 Node、pnpm 和 Typora；
- 如果 `node_modules` 不存在，自动执行 `pnpm install --frozen-lockfile`；
- 找到 Typora 安装目录（默认会找 `D:\Typora`、`C:\Program Files\Typora` 和注册表）；
- 检查 Typora Plugin 是否已安装；
- 复制 `typora-plugin/blog.js` 到 Typora 的 `resources/plugin/`；
- 把 `BLOG_ROOT` 写成当前电脑上的仓库绝对路径；
- 写入 5 个按钮；
- 生成无密码的 `~/.ssh/id_ed25519_blog`；
- 写 `~/.ssh/config` 的 GitHub 443 配置；
- 把 `origin` 改成 `git@github.com:JinlinXingjian/firefly-blog.git`；
- 把公钥复制到剪贴板，并打开 GitHub 添加公钥页面。

如果 Typora 不在默认位置：

```powershell
powershell -ExecutionPolicy Bypass -File .\typora-plugin\setup.ps1 -TyporaRoot "D:\Typora"
```

### 3. 把公钥添加到 GitHub

脚本会打开：

https://github.com/settings/ssh/new

公钥已经复制到剪贴板，直接：

- Title：随便填，例如 `Wind Blog New PC`
- Key type：`Authentication Key`
- Key：粘贴
- 点击 `Add SSH key`

### 4. 重启 Typora，测试推送

完全退出 Typora，再打开。

点击右下角「⋯ 其他」→「测试推送」，或者运行：

```powershell
powershell -ExecutionPolicy Bypass -File .\typora-plugin\test-push.ps1
```

看到「SSH 认证成功，GitHub 推送权限正常」就完成了。

---

## 日常写作

### 新建文章

点击 ＋，填写：

- 文章标题
- 分类（可空）
- 标签（可空，用逗号分隔）

自动生成：

```text
src/content/posts/<英文slug>.md
src/content/posts/<英文slug>.assets/
```

文件名使用拼音 slug，保证网址干净。标题、日期、分类、标签会自动写入 frontmatter。

### 图片

直接粘贴或拖拽图片。Typora 会自动复制到：

```text
src/content/posts/<文章slug>.assets/
```

Markdown 使用相对路径，不需要图床。

发布脚本会检查：

- frontmatter 是否有 `title` 和 `published`；
- 图片文件是否真实存在；
- 图片是否在该文章的 `.assets` 目录。

任何一项不通过都会中止发布，不会把坏图提交上去。

### 发布

点击 ☁ 上传，脚本会：

1. 保存当前 Typora 文件；
2. 校验 frontmatter 和图片；
3. 只暂存当前文章、它的图片和 `BLOG_INDEX.md`；
4. 提交 `post: 文章标题`；
5. 通过 SSH 443 推送到 GitHub；
6. GitHub Actions 构建并发布到 Cloudflare Pages。

发布成功后，Typora 会弹出提示；通常 1–2 分钟后线上生效。

如果 `draft: true`，文章会提交但线上不显示。

### 历史工作台

`BLOG_INDEX.md` 由脚本根据 `src/content/posts/` 自动生成，按发布日期倒序排列，包含日期、标题、分类、草稿/已发布、本地链接和线上链接。

它不参与 Astro 构建，只是 Typora 的本地入口。

---

## 密钥管理

点击「⋯ 其他」→「密钥管理」：

- **复制公钥**：读取 `~/.ssh/id_ed25519_blog.pub` 并复制，打开 GitHub 添加页面。
- **重新生成密钥**：旧密钥立即失效，需要把新公钥重新添加到 GitHub。
- **打开 GitHub 密钥设置**：只打开网页。

私钥路径：

```text
C:\Users\<你>\.ssh\id_ed25519_blog
```

私钥**永远不要**提交到 Git，也不要发给别人。仓库里只有生成脚本，没有私钥。

当前这台电脑真正使用的是：

```text
id_ed25519_blog
GitHub 标题：Wind Blog Publish
```

旧密钥说明：

- `id_ed25519`：有密码，SSH 自动化无法输入密码，**不使用**；如果没在其他地方用，可以从 GitHub 删除。
- `id_rsa`：当时没有成功添加到 GitHub，**不使用**。
- **不要删除 `id_ed25519_blog`**，一键发布依赖它。

---

## 推送测试做了什么

`test-push.ps1` 不会真的推送，只做三件事：

1. `ssh -T git@github.com` 检查 SSH 认证；
2. `git ls-remote --heads origin` 检查能否读取仓库；
3. `git push --dry-run origin HEAD:refs/heads/master` 检查推送权限。

任何一步失败都会给出具体原因，例如：

- `Permission denied (publickey)`：GitHub 上没有这把公钥；
- `Host key verification failed`：重新运行 `setup-key.ps1`；
- `non-fast-forward`：本地落后于远程，先 `git pull --rebase`。

---

## 安装脚本会改什么

`install.ps1` 会重写 Typora 的：

```text
D:\Typora\resources\plugin\global\settings\settings.user.toml
```

只替换这两段：

- `[blog]`
- `[action_buttons]`

其他插件配置原样保留。每次修改前会备份为：

```text
settings.user.toml.bak-年月日-时分秒
```

如果你在 Typora 里自定义了其他浮动按钮，重新运行安装脚本会覆盖 `[action_buttons]`。

---

## 目录

```text
typora-plugin/
├── blog.js                    # Typora 自定义插件
├── install.ps1                # 安装插件 + 写配置
├── setup-key.ps1              # 生成密钥 + 配 SSH + 改 remote
├── setup.ps1                  # 新电脑一键初始化
├── test-push.ps1              # 推送测试
├── publish-post.ps1           # 发布当前文章
├── new-post.mjs               # 新建文章
├── build-index.mjs            # 生成 BLOG_INDEX.md
├── configure-settings.mjs     # 写 settings.user.toml
├── settings.user.example.toml # 配置示例
└── README.md
```

---

## 常见问题

### 右下角没有按钮

1. 确认 Typora Plugin 已安装；
2. 重新运行 `install.ps1`；
3. 完全退出 Typora 再打开；
4. 检查 `D:\Typora\resources\plugin\blog.js` 是否存在。

### 发布失败：Permission denied

公钥没有添加到 GitHub，或添加到了错误的账号。

点击「⋯ 其他」→「密钥管理」→ 复制公钥 → 重新添加到：

https://github.com/settings/ssh/new

### 发布失败：GitHub 连接被重置

本机已配置 SSH 443，正常不需要代理。先运行：

```bash
ssh -T git@github.com
```

应该返回：

```text
Hi JinlinXingjian! You've successfully authenticated...
```

### 发布失败：图片不在 .assets 目录

在 Typora 中重新插入图片，或把图片移动到 `<文章名>.assets/`，确保 Markdown 里的路径以 `<文章名>.assets/` 开头。

### 发布后线上没更新

检查 GitHub Actions：

https://github.com/JinlinXingjian/firefly-blog/actions

构建成功后 Cloudflare Pages 会自动更新。Cloudflare 有时会有几十秒缓存。

### 多台电脑交替写作

开始写之前先：

```bash
git pull
```

发布脚本不会自动 pull。如果 GitHub 上已经有另一台电脑的新提交，push 会提示 `non-fast-forward`，先：

```bash
git pull --rebase
```

再点发布。

### Typora 升级后

Typora 升级可能覆盖 `resources/window.html`，导致插件消失。重新安装 Typora Plugin，然后运行：

```powershell
powershell -ExecutionPolicy Bypass -File .\typora-plugin\install.ps1
```

文章和仓库脚本不受影响。

---

## 维护者注意

`install.ps1`、`setup-key.ps1`、`test-push.ps1`、`setup.ps1`、`publish-post.ps1` 含中文，必须保存为 **UTF-8 with BOM**。Windows PowerShell 5.1 不会把无 BOM 的 UTF-8 当 UTF-8 解析，会报 `Unexpected token`。
