#!/usr/bin/env node
/**
 * 新建 Typora 博客文章。
 * 用法：
 *   node typora-plugin/new-post.mjs --title "文章标题" [--category "分类"] [--tags "标签1,标签2"]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pinyin } from "pinyin-pro";
import { buildIndex } from "./build-index.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");
const POSTS_DIR = path.join(REPO_ROOT, "src", "content", "posts");

function arg(name, fallback = "") {
	const index = process.argv.indexOf(`--${name}`);
	return index !== -1 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

function today() {
	const d = new Date();
	return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function toSlug(title) {
	const pinyinText = pinyin(title, { toneType: "none", type: "array", nonZh: "consecutive" }).join("-");
	const slug = pinyinText
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 64)
		.replace(/-+$/g, "");
	return slug || "post";
}

function yamlString(value) {
	return JSON.stringify(String(value ?? ""));
}

function uniquePostFile(slug) {
	let candidate = `${slug}.md`;
	let counter = 2;
	while (fs.existsSync(path.join(POSTS_DIR, candidate))) {
		candidate = `${slug}-${counter}.md`;
		counter += 1;
	}
	return candidate;
}

const title = arg("title").trim();
if (!title) {
	console.error("缺少文章标题：--title");
	process.exit(1);
}

const category = arg("category").trim();
const tags = arg("tags")
	.split(/[,，]/)
	.map((tag) => tag.trim())
	.filter(Boolean);
const slug = toSlug(title);
const fileName = uniquePostFile(slug);
const filePath = path.join(POSTS_DIR, fileName);
const finalSlug = fileName.replace(/\.md$/i, "");
const assetsDir = path.join(POSTS_DIR, `${finalSlug}.assets`);

fs.mkdirSync(POSTS_DIR, { recursive: true });
fs.mkdirSync(assetsDir, { recursive: true });
if (fs.existsSync(filePath)) {
	console.error(`文件已存在：${filePath}`);
	process.exit(1);
}

const frontmatter = [
	"---",
	`title: ${yamlString(title)}`,
	`published: ${today()}`,
	'description: ""',
	`tags: [${tags.map(yamlString).join(", ")}]`,
	`category: ${yamlString(category)}`,
	"draft: false",
	"---",
	"",
	"开始写正文……",
	"",
].join("\n");

fs.writeFileSync(filePath, frontmatter, "utf8");
buildIndex();
console.log(JSON.stringify({ path: filePath, title, slug: finalSlug, assetsDir }));
