const fs = require("fs");
const path = require("path");
const { execFile, execFileSync } = require("child_process");

/**
 * 博客工作流插件
 *
 * 功能：
 * - 博客模式：打开 BLOG_INDEX.md 工作台
 * - 新建文章：弹出表单，创建带 frontmatter 的 Markdown
 * - 发布当前文章：保存后调用 scripts/typora/publish-post.ps1
 * - 发布全部更改：提交 src/content/posts 下所有改动
 * - 打开线上博客
 */
class BlogPlugin extends BasePlugin {
	prepare = async () => {
		this.root = this.config.BLOG_ROOT || "";
		this.postsDir = path.join(this.root, "src", "content", "posts");
		if (!this.root || !fs.existsSync(this.postsDir)) {
			console.error("[blog] BLOG_ROOT 不正确：", this.root);
			return this.utils.PLUGIN_LOAD_ABORT;
		}
	}

	process = () => {
		// 让 Typora 把图片复制到「文章名.assets」目录，并使用相对路径。
		// assets_storage 插件也使用同一套设置。
		const applyImageStorage = () => {
			try {
				if (!window.File?.option) return;
				window.File.option.defaultImageStorage = "per-file-assert";
				window.File.option.useRelativePathForImg = true;
			} catch (error) {
				console.warn("[blog] 设置图片目录失败：", error);
			}
		};
		applyImageStorage();
		try {
			this.utils.eventHub.on(this.utils.eventHub.eventType.fileOpened, applyImageStorage);
		} catch (error) {
			console.warn("[blog] 监听文件打开失败：", error);
		}
	}

	hotkey = () => {
		const hotkeys = [];
		if (this.config.HOTKEY) {
			hotkeys.push({ hotkey: this.config.HOTKEY, callback: this.call });
		}
		if (this.config.NEW_POST_HOTKEY) {
			hotkeys.push({ hotkey: this.config.NEW_POST_HOTKEY, callback: this.newPost });
		}
		if (this.config.PUBLISH_HOTKEY) {
			hotkeys.push({ hotkey: this.config.PUBLISH_HOTKEY, callback: this.publish });
		}
		if (this.config.PUBLISH_ALL_HOTKEY) {
			hotkeys.push({ hotkey: this.config.PUBLISH_ALL_HOTKEY, callback: this.publishAll });
		}
		return hotkeys;
	}

	call = () => this.openDashboard();

	openDashboard = () => {
		try {
			const indexFile = path.join(this.root, "BLOG_INDEX.md");
			if (!fs.existsSync(indexFile)) {
				this._runNodeSync("build-index.mjs");
			}
			this.utils.openFile(indexFile, true);
			this.utils.notification.show("已进入博客模式", "info");
		} catch (error) {
			this._error("打开博客工作台失败：" + error.message);
		}
	}

	newPost = async () => {
		try {
			const { response, data } = await this.utils.formDialog.modal({
				title: "新建博客文章",
				schema: ({ Group, Controls }) => Group(
					Controls.Text("title")
						.Label("文章标题")
						.Placeholder("例如：我的第一篇博客"),
					Controls.Text("category")
						.Label("分类（可选）")
						.Placeholder("例如：技术"),
					Controls.Text("tags")
						.Label("标签（可选，用逗号分隔）")
						.Placeholder("例如：Astro, 随笔"),
				),
				data: { title: "", category: "", tags: "" },
			});
			if (response === 0 || !data?.title?.trim()) return;

			const args = ["new-post.mjs", "--title", data.title.trim()];
			if (data.category?.trim()) args.push("--category", data.category.trim());
			if (data.tags?.trim()) args.push("--tags", data.tags.trim());

			this.utils.notification.show("正在创建文章……", "info");
			this._runNode(args, (error, result) => {
				if (error) {
					this._error("新建文章失败：" + error);
					return;
				}
				this.utils.openFile(result.path, true);
				this.utils.notification.show("文章已创建：" + result.title, "success");
			});
			return false;
		} catch (error) {
			this._error("新建文章失败：" + error.message);
			return false;
		}
	}

	publish = async () => this._publish(false);

	publishAll = async () => this._publish(true);

	_publish = async (all) => {
		const filePath = this.utils.getFilePath();
		if (!filePath) {
			this._error("请先打开一篇博客文章。");
			return false;
		}
		if (!this._isBlogPost(filePath)) {
			this._error("当前文件不在博客文章目录中：\n" + this.postsDir);
			return false;
		}

		try {
			this.utils.notification.show(all ? "正在发布全部文章更改……" : "正在发布当前文章……", "info");
			await this._saveCurrentFile();
			const args = ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", path.join(this.root, "scripts", "typora", "publish-post.ps1"), "-FilePath", filePath];
			if (all) args.push("-All");
			this._runPowerShell(args, (error, result) => {
				if (result) {
					this.utils.notification.show(result.message || (result.success ? "发布成功" : "发布失败"), result.success ? "success" : "error");
					return;
				}
				this._error("发布失败：" + (error || "脚本没有返回结果"));
			});
		} catch (error) {
			this._error("发布失败：" + error.message);
		}
		return false;
	}

	openSite = () => {
		try {
			this.utils.openUrl(this.config.SITE_URL || "https://jinlinxingjian-blog.pages.dev");
		} catch (error) {
			this._error("打开线上博客失败：" + error.message);
		}
	}

	openPostsFolder = () => {
		try {
			this.utils.openFolder(this.postsDir);
		} catch (error) {
			this._error("打开文章目录失败：" + error.message);
		}
	}

	_isBlogPost = (filePath) => {
		try {
			const relative = path.relative(this.postsDir, filePath);
			return relative && !relative.startsWith("..") && !path.isAbsolute(relative) && /\.mdx?$/i.test(filePath);
		} catch {
			return false;
		}
	}

	_saveCurrentFile = async () => {
		const FileApi = window.File;
		if (FileApi?.saveUseNode) {
			await FileApi.saveUseNode();
		} else if (FileApi?.FileSave?.saveUseNode) {
			await FileApi.FileSave.saveUseNode();
		} else {
			throw new Error("当前 Typora 版本没有可用的保存接口，请先按 Ctrl+S 保存。");
		}
		await new Promise((resolve) => setTimeout(resolve, 350));
	}

	_runNode = (args, callback) => {
		const script = path.join(this.root, "scripts", "typora", args[0]);
		execFile(
			"node",
			[script, ...args.slice(1)],
			{ cwd: this.root, windowsHide: true, maxBuffer: 10 * 1024 * 1024 },
			(error, stdout, stderr) => {
				const text = (stdout || "").trim();
				let result = null;
				if (text) {
					try {
						result = JSON.parse(text.split(/\r?\n/).pop());
					} catch {
						// 保留原始错误输出
					}
				}
				if (error || !result) {
					callback((stderr || text || error?.message || "未知错误").trim(), null);
					return;
				}
				callback(null, result);
			},
		);
	}

	_runNodeSync = (scriptName) => {
		execFileSync("node", [path.join(this.root, "scripts", "typora", scriptName)], {
			cwd: this.root,
			windowsHide: true,
			encoding: "utf8",
		});
	}

	_runPowerShell = (args, callback) => {
		execFile(
			"powershell.exe",
			args,
			{ cwd: this.root, windowsHide: true, maxBuffer: 20 * 1024 * 1024 },
			(error, stdout, stderr) => {
				const text = (stdout || "").trim();
				const resultLine = text.split(/\r?\n/).find((line) => line.startsWith("BLOG_RESULT:"));
				if (resultLine) {
					try {
						callback(error, JSON.parse(resultLine.slice("BLOG_RESULT:".length)));
						return;
					} catch {
						// 继续走错误分支
					}
				}
				callback((stderr || text || error?.message || "脚本没有返回结果").trim(), null);
			},
		);
	}

	_error = (message) => {
		console.error("[blog]", message);
		try {
			this.utils.notification.show(message, "error");
		} catch {
			alert(message);
		}
	}
}

module.exports = { plugin: BlogPlugin };

