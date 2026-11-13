#!/usr/bin/env node
/**
 * 生成 Typora Plugin 的 settings.user.toml 中属于博客工作流的部分。
 *
 * 只替换 [blog] 和 [action_buttons] 两个 section，其他配置原样保留。
 * 这样新电脑 clone 仓库后，运行 install.ps1 就能得到正确的绝对路径和按钮。
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function arg(name, fallback = "") {
	const index = process.argv.indexOf(`--${name}`);
	return index !== -1 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

const settingsPath = path.resolve(arg("settings"));
const repoRoot = path.resolve(arg("repo-root", path.resolve(__dirname, "..")));
const siteUrl = arg("site-url", "https://jinlinxingjian-blog.pages.dev");

if (!arg("settings")) {
	console.error("缺少 --settings 参数");
	process.exit(1);
}

function removeSection(text, section) {
	const lines = text.split(/\r?\n/);
	const out = [];
	let skipping = false;
	for (const line of lines) {
		const header = line.match(/^\s*\[\[?\s*([^\]]+?)\s*\]\]?\s*(?:#.*)?$/);
		if (header) {
			const name = header[1].trim();
			const isTarget = name === section || name.startsWith(`${section}.`);
			if (isTarget) {
				skipping = true;
				continue;
			}
			skipping = false;
		}
		if (!skipping) out.push(line);
	}
	return out.join("\n").trimEnd();
}

function tomlString(value) {
	return JSON.stringify(String(value ?? ""));
}

const oldText = fs.existsSync(settingsPath) ? fs.readFileSync(settingsPath, "utf8") : "";
const kept = removeSection(removeSection(oldText, "blog"), "action_buttons");

const blogBlock = `[blog]
NAME = "博客"
ENABLE = true
HOTKEY = "ctrl+alt+b"
NEW_POST_HOTKEY = "ctrl+alt+n"
PUBLISH_HOTKEY = "ctrl+alt+p"
PUBLISH_ALL_HOTKEY = "ctrl+alt+shift+p"
# 这个路径由安装脚本自动写入当前电脑的仓库位置
BLOG_ROOT = ${tomlString(repoRoot)}
SITE_URL = ${tomlString(siteUrl)}`;

const button = ({ x, y, icon, hint, callback }) => `[[action_buttons.BUTTONS]]
enable = true
coordinate = [${x}, ${y}]
size = "16px"
icon = "${icon}"
hint = "${hint}"
callback = "${callback}"`;

const actionBlock = `[action_buttons]
ENABLE = true
BUTTON_SIZE = "38px"
BUTTON_GAP = "10px"
POSITION_RIGHT = "30px"
POSITION_BOTTOM = "48px"

${[
	{ x: 0, y: 0, icon: "fa fa-book", hint: "博客模式", callback: "blog" },
	{ x: 1, y: 0, icon: "fa fa-plus", hint: "新建文章", callback: "blog.newPost" },
	{ x: 0, y: 1, icon: "fa fa-cloud-upload", hint: "发布当前文章", callback: "blog.publish" },
	{ x: 1, y: 1, icon: "fa fa-external-link", hint: "打开线上博客", callback: "blog.openSite" },
	{ x: 0, y: 2, icon: "fa fa-ellipsis-h", hint: "其他", callback: "blog.openTools" },
]
	.map(button)
	.join("\n\n")}`;

const content = `${[kept, blogBlock, actionBlock].filter(Boolean).join("\n\n")}\n`;
fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
fs.writeFileSync(settingsPath, content, "utf8");

console.log(JSON.stringify({ settingsPath, repoRoot, siteUrl }));
