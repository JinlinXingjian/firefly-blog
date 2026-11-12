# 风起笔记

基于 [Firefly](https://github.com/CuteLeaf/Firefly) 的个人博客，Astro 静态站点。

## 还要替换的地方

1. `src/config/siteConfig.ts`
   - `site_url`：改成正式域名，例如 `https://www.example.com`
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

```bash
pnpm new-post 文章文件名
```

文章在 `src/content/posts/`，写完后：

```bash
git add -A
git commit -m "post: 文章标题"
git push
```

推送到 GitHub 后，Vercel 会自动重新构建和发布。

## Vercel 设置

- Framework Preset: `Astro`
- Root Directory: `./`
- Install Command: `pnpm install`
- Build Command: `pnpm build`
- Output Directory: `dist`
- Node.js: `22.x`，如果提示低于 22.23，改用 `24.x`
- 环境变量建议：`ENABLE_EXPERIMENTAL_COREPACK=1`
- 不要设置 `CF_WORKERS`

## 换电脑后

```bash
git clone https://github.com/<你的用户名>/firefly-blog.git
cd firefly-blog
pnpm install
pnpm dev
```

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
