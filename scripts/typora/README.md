# Typora 博客写作工作流

当前这台电脑已经安装并配置好了。日常只需要在 Typora 里点击右下角的 4 个按钮。

## 按钮

| 按钮 | 功能 | 快捷键 |
|---|---|---|
| 📖 书本 | 进入博客模式，打开 `BLOG_INDEX.md` 历史工作台 | `Ctrl+Alt+B` |
| ＋ 加号 | 新建文章（标题、分类、标签） | `Ctrl+Alt+N` |
| ☁ 上传 | 发布当前文章 | `Ctrl+Alt+P` |
| ↗ 外链 | 打开线上博客 | 无 |

另外，`Ctrl+Alt+Shift+P` 可以发布 `src/content/posts/` 下所有博客改动。

## 新建文章

点击加号，填写：

- 文章标题
- 分类（可空）
- 标签（可空，用逗号分隔）

会自动生成：

```text
src/content/posts/<英文slug>.md
src/content/posts/<英文slug>.assets/
```

文章文件名使用英文 slug，保证网址干净。标题、日期、分类、标签会自动写入 frontmatter。

## 图片

Typora 插件会自动设置图片存储方式：

```text
每篇文章独立目录：<文章名>.assets/
Markdown 使用相对路径：<文章名>.assets/image-xxx.png
```

直接粘贴、拖拽图片即可，不需要上传图床。

发布脚本会检查：

- frontmatter 是否有 `title` 和 `published`
- 图片文件是否真实存在
- 图片是否在该文章的 `.assets` 目录

任何一项不通过都会中止发布并提示，不会把坏图提交上去。

## 发布

点击发布按钮后，脚本会：

1. 保存当前 Typora 文件
2. 校验 frontmatter 和图片
3. 只暂存当前文章、它的图片和 `BLOG_INDEX.md`
4. 提交 `post: 文章标题`
5. 使用 SSH 443 推送到 GitHub
6. GitHub Actions 构建并发布到 Cloudflare Pages

发布成功后，Typora 会弹出提示；通常 1–2 分钟后线上生效。

如果 `draft: true`，文章会提交但线上不显示。

## 历史工作台

`BLOG_INDEX.md` 由脚本根据 `src/content/posts/` 自动生成，按发布日期倒序排列，包含：

- 日期
- 标题
- 分类
- 草稿/已发布
- 本地文章链接
- 线上文章链接

它不参与 Astro 构建，只作为 Typora 的本地入口。

## 当前机器已安装的东西

- Typora 1.12.4
- [obgnail/typora_plugin](https://github.com/obgnail/typora_plugin) 1.19.15
- 自定义插件：`D:\Typora\resources\plugin\blog.js`
- 插件配置：`D:\Typora\resources\plugin\global\settings\settings.user.toml`
- 博客源码：`C:\Users\Wind\Desktop\Github Repositories\其他\其他杂项\firefly-blog`

## 换电脑怎么恢复

1. 安装 Typora、Git、Node.js、pnpm。
2. 克隆仓库：

```bash
git clone git@github.com:JinlinXingjian/firefly-blog.git
cd firefly-blog
pnpm install
```

3. 安装 Typora Plugin（1.19.15）：

从 [Release](https://github.com/obgnail/typora_plugin/releases) 下载 `typora-plugin@v1.19.15.zip`，按照项目说明把 `plugin` 目录放进 Typora 安装目录并安装。

4. 复制本仓库的自定义插件：

```text
scripts/typora/blog.js  ->  D:\Typora\resources\plugin\blog.js
```

5. 参考 `scripts/typora/settings.user.example.toml`，修改 `BLOG_ROOT` 为新电脑上的仓库路径，写入：

```text
D:\Typora\resources\plugin\global\settings\settings.user.toml
```

6. 给 GitHub 添加新电脑的 SSH 公钥，并把 remote 设为 SSH：

```bash
git remote set-url origin git@github.com:JinlinXingjian/firefly-blog.git
```

7. 重启 Typora，右下角出现 4 个按钮即成功。

## Typora 升级后

Typora 升级可能覆盖 `resources/window.html`，导致插件消失。重新安装 Typora Plugin，并重新注入 `plugin/index.js` 即可；博客文章和本仓库脚本不受影响。

## 常见问题

### 发布失败：GitHub 连接被重置

说明当前网络无法直连 GitHub 的 Git 端口。本机已配置 SSH 443，正常不需要代理；如果仍失败，确认：

```bash
ssh -T git@github.com
```

应该返回 `Hi JinlinXingjian!`。

### 发布失败：图片不在 .assets 目录

在 Typora 中重新插入图片，或把图片移动到 `<文章名>.assets/`，确保 Markdown 里的路径以 `<文章名>.assets/` 开头。

### 发布后线上没更新

检查 GitHub Actions：

https://github.com/JinlinXingjian/firefly-blog/actions

构建成功后 Cloudflare Pages 会自动更新。
