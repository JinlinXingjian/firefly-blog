# 风起笔记

基于 [Firefly](https://github.com/CuteLeaf/Firefly) 的个人博客，Astro 静态站点。

## 当前部署

- 主站：https://jinlinxingjian-blog.pages.dev （Cloudflare Pages，国内手机实测速度快）
- 备用：https://jinlinxingjian-blog.vercel.app （Vercel，`vercel.app` 在国内可能被 DNS 污染）
- 源码：https://github.com/JinlinXingjian/firefly-blog

Cloudflare Pages 自动部署使用 `.github/workflows/deploy-cloudflare.yml`，已配置 `CLOUDFLARE_API_TOKEN` Secret。push 到 `master` 会自动构建并发布。

## Typora 写作工作流

当前电脑已经安装 Typora 1.12.4 + Typora Plugin 1.19.15，并配置了自定义博客插件。

打开 Typora 后，右下角有 4 个按钮：

| 按钮 | 功能 | 快捷键 |
|---|---|---|
| 📖 | 博客模式：打开 `BLOG_INDEX.md` 历史工作台 | `Ctrl+Alt+B` |
| ＋ | 新建文章 | `Ctrl+Alt+N` |
| ☁ | 发布当前文章 | `Ctrl+Alt+P` |
| ↗ | 打开线上博客 | — |

发布全部博客改动：`Ctrl+Alt+Shift+P`。

详细说明见 [scripts/typora/README.md](scripts/typora/README.md)。

### 图片

Typora 会自动把图片复制到：

```text
src/content/posts/<文章slug>.assets/
```

Markdown 使用相对路径，不需要图床。

### 发布

发布脚本只提交当前文章、它的图片和 `BLOG_INDEX.md`，然后 push 到 GitHub；GitHub Actions 自动部署到 Cloudflare Pages。

## 还要替换的地方

1. `src/config/siteConfig.ts`
   - `site_url`：当前是 `https://jinlinxingjian-blog.pages.dev`，买域名后改成正式域名
   - `title` / `subtitle` / `description`
2. `src/config/profileConfig.ts`
   - `name` / `bio` / 社交链接
3. `src/assets/images/avatar.webp`
   - 当前是自动生成的字母头像，可以换成自己的头像
4. `src/content/spec/about.md`
   - 关于页内容

## 本地开发

```bash
pnpm install
pnpm dev
# http://localhost:4321
```

构建和预览：

```bash
pnpm build
pnpm preview
```

## 发文章

### 推荐：Typora 插件

点击右下角「新建文章」，填写标题、分类、标签，写完点击「发布当前文章」。

### 命令行方式

```bash
pnpm new-post 文章slug
```

文章在 `src/content/posts/`，写完后：

```bash
git add -A
git commit -m "post: 文章标题"
git push
```

推送到 GitHub 后，Cloudflare Pages 会自动重新构建和发布。

## Vercel 设置

`vercel.json` 已固定使用 pnpm 11.22.0，避免 Vercel 自动选到旧版 pnpm。

- Framework Preset: `Astro`
- Root Directory: `./`
- Install Command: `npx --yes pnpm@11.22.0 install --frozen-lockfile`
- Build Command: `npx --yes pnpm@11.22.0 build`
- Output Directory: `dist`
- Node.js: `22.x`，如果提示低于 22.23，改用 `24.x`
- 不要设置 `CF_WORKERS`

如果 Vercel 仍然报 pnpm 相关错误，再加环境变量 `ENABLE_EXPERIMENTAL_COREPACK=1`。

## 换电脑后

```bash
git clone git@github.com:JinlinXingjian/firefly-blog.git
cd firefly-blog
pnpm install
pnpm dev
```

新电脑还需要：

1. 安装 Typora Plugin
2. 复制 `scripts/typora/blog.js` 到 Typora 插件目录
3. 参考 `scripts/typora/settings.user.example.toml` 配置 `BLOG_ROOT`
4. 把新电脑的 SSH 公钥添加到 GitHub

具体步骤见 [scripts/typora/README.md](scripts/typora/README.md)。

编辑前先 `git pull`，编辑后 `git add` / `commit` / `push`。

## 国内访问说明

Vercel 在中国大陆没有节点，`*.vercel.app` 不适合作为国内入口；自定义域名也可能受运营商和时段影响。

如果实测不稳定，可以把同一仓库接到 EdgeOne Pages：

- 加速区域选「全球可用区（不含中国大陆）」
- 构建 `pnpm build`
- 输出 `dist`
- 绑定自定义域名（该区域不要求 ICP 备案）

## 主题更新

```bash
git fetch upstream
git merge upstream/master
pnpm install
pnpm build
```

`upstream` 指向上游 Firefly 仓库。更新前建议先提交当前修改。
