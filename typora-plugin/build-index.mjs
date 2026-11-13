#!/usr/bin/env node
/**
 * 生成 Typora 博客工作台 BLOG_INDEX.md。
 * 这个文件不参与 Astro 构建，只作为本地写作入口。
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import matter from "gray-matter";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");
const POSTS_DIR = path.join(REPO_ROOT, "src", "content", "posts");
const INDEX_FILE = path.join(REPO_ROOT, "BLOG_INDEX.md");
const SITE_URL = "https://jinlinxingjian-blog.pages.dev";
const GITHUB_URL = "https://github.com/JinlinXingjian/firefly-blog";

function walkMarkdown(dir, out = []) {
	if (!fs.existsSync(dir)) return out;
	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		if (entry.name.startsWith(".") || entry.name.endsWith(".assets")) continue;
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) walkMarkdown(full, out);
		else if (entry.isFile() && /\.mdx?$/i.test(entry.name)) out.push(full);
	}
	return out;
}

function dateString(value) {
	if (!value) return "";
	const d = value instanceof Date ? value : new Date(value);
	if (Number.isNaN(d.getTime())) return String(value).slice(0, 10);
	return d.toISOString().slice(0, 10);
}

function postUrl(relativePath) {
	const id = relativePath.replace(/\.mdx?$/i, "").replace(/\\/g, "/");
	return `${SITE_URL}/posts/${id.split("/").map(encodeURIComponent).join("/")}/`;
}

export function buildIndex() {
	const rows = walkMarkdown(POSTS_DIR)
		.map((file) => {
			const relative = path.relative(POSTS_DIR, file).replace(/\\/g, "/");
			let data = {};
			let body = "";
			try {
				const parsed = matter(fs.readFileSync(file, "utf8"));
				data = parsed.data || {};
				body = parsed.content || "";
			} catch (error) {
				console.error(`[blog-index] 跳过无法解析的文件 ${relative}: ${error.message}`);
				return null;
			}
			const title = String(data.title || path.basename(relative, path.extname(relative)));
			const published = dateString(data.published);
			const draft = data.draft === true;
			const category = String(data.category || "");
			const tags = Array.isArray(data.tags) ? data.tags.map(String) : [];
			const excerpt = String(data.description || "").trim();
			return {
				title,
				published,
				draft,
				category,
				tags,
				excerpt,
				relative,
				url: postUrl(relative),
				mtime: fs.statSync(file).mtimeMs,
			};
		})
		.filter(Boolean)
		.sort((a, b) => (b.published || "").localeCompare(a.published || "") || b.mtime - a.mtime);

	const lines = [
		"# 博客工作台",
		"",
		`线上博客：<${SITE_URL}>`,
		"",
		`GitHub 仓库：<${GITHUB_URL}>`,
		"",
		"> 在 Typora 右下角使用「新建文章」「发布当前文章」。",
		"> 密钥管理和测试推送收在「⋯ 其他」里。",
		"> 历史文章按发布日期倒序排列；文章正文直接点击标题打开。",
		"",
		`## 文章（${rows.length}）`,
		"",
	];

	if (rows.length === 0) {
		lines.push("暂无文章。");
	} else {
		lines.push("| 日期 | 标题 | 分类 | 状态 | 线上 |");
		lines.push("| --- | --- | --- | --- | --- |");
		for (const row of rows) {
			const title = row.title.replace(/\|/g, "\\|");
			const category = (row.category || "—").replace(/\|/g, "\\|");
			const status = row.draft ? "草稿" : "已发布";
			const online = row.draft ? "—" : `[打开](${row.url})`;
			const local = `src/content/posts/${row.relative}`;
			lines.push(`| ${row.published || "—"} | [${title}](${local}) | ${category} | ${status} | ${online} |`);
		}
	}

	lines.push(
		"",
		"---",
		"",
		"## 写作约定",
		"",
		"- 文件名使用英文 slug，例如 `my-first-post.md`，这样网址更干净。",
		"- 图片放在同名 `.assets` 目录，例如 `my-first-post.assets/`。",
		"- 发布前把 `draft` 改为 `false`，或直接发布；草稿不会出现在博客列表。",
		"- 点击「发布当前文章」只会提交当前文章、它的图片和工作台，不会提交其他改动。",
		"",
	);

	fs.writeFileSync(INDEX_FILE, lines.join("\n"), "utf8");
	return { count: rows.length, indexFile: INDEX_FILE };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
	const result = buildIndex();
	console.log(JSON.stringify(result));
}
