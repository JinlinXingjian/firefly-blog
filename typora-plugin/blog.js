const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFile, execFileSync } = require("child_process");

/**
 * 博客工作流插件
 *
 * 功能：
 * - 博客模式：打开 BLOG_INDEX.md 工作台
 * - 新建文章：弹出表单，创建带 frontmatter 的 Markdown
 * - 发布当前文章：保存后调用 typora-plugin/publish-post.ps1
 * - 发布全部更改：提交 src/content/posts 下所有改动
 * - 密钥管理：生成 / 复制 GitHub 发布公钥
 * - 推送测试：检查 SSH 认证和 GitHub 推送权限
 * - 打开线上博客
 */
class BlogPlugin extends BasePlugin {
	prepare = async () => {
		this.root = this.config.BLOG_ROOT || "";
		this.postsDir = path.join(this.root, "src", "content", "posts");
		this.pluginDir = path.join(this.root, "typora-plugin");
		this.keyPath = path.join(os.homedir(), ".ssh", "id_ed25519_blog");
		this.githubKeysUrl = "https://github.com/settings/ssh/new";
		if (!this.root || !fs.existsSync(this.postsDir) || !fs.existsSync(this.pluginDir)) {
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

		// Typora 1.12 把插件按钮插在 <content> 里，可能被内容层裁剪。
		// 移动到 body 后，浮动按钮才能真正显示在窗口右下角。
		const moveToolbarToBody = () => {
			try {
				const toolbar = document.querySelector("#plugin-action-buttons");
				if (toolbar && toolbar.parentElement !== document.body) {
					document.body.appendChild(toolbar);
					toolbar.style.zIndex = "2147483647";
				}
			} catch (error) {
				console.warn("[blog] 调整浮动按钮位置失败：", error);
			}
		};
		setTimeout(moveToolbarToBody, 1200);
		try {
			this.utils.eventHub.on(this.utils.eventHub.eventType.allPluginsHadInjected, () => setTimeout(moveToolbarToBody, 0));
		} catch (error) {
			console.warn("[blog] 监听插件加载完成失败：", error);
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
		if (this.config.KEY_HOTKEY) {
			hotkeys.push({ hotkey: this.config.KEY_HOTKEY, callback: this.manageKey });
		}
		if (this.config.TEST_HOTKEY) {
			hotkeys.push({ hotkey: this.config.TEST_HOTKEY, callback: this.testPush });
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
			if (response !== 1 || !data?.title?.trim()) return false;

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
			const args = [
				"-NoProfile",
				"-ExecutionPolicy",
				"Bypass",
				"-File",
				path.join(this.pluginDir, "publish-post.ps1"),
				"-FilePath",
				filePath,
			];
			if (all) args.push("-All");
			this._runPowerShell(args, (error, result) => {
				if (result) {
					this.utils.notification.show(
						result.message || (result.success ? "发布成功" : "发布失败"),
						result.success ? "success" : "error",
					);
					return;
				}
				this._error("发布失败：" + (error || "脚本没有返回结果"));
			});
		} catch (error) {
			this._error("发布失败：" + error.message);
		}
		return false;
	}

	manageKey = async () => {
		try {
			const exists = fs.existsSync(this.keyPath);
			const actions = exists
				? {
						copy: "复制公钥（添加到 GitHub）",
						regenerate: "重新生成密钥（旧密钥立即失效）",
						open: "打开 GitHub 密钥设置",
					}
				: {
						generate: "生成发布密钥",
						open: "打开 GitHub 密钥设置",
					};
			const status = exists
				? `本机已有发布密钥：\n${this.keyPath}\n\n新电脑请选择“复制公钥”，粘贴到 GitHub；如果密钥泄露或失效，再选择“重新生成”。`
				: "本机还没有发布密钥。\n\n选择“生成发布密钥”，脚本会自动生成密钥、配置 SSH 443，并复制公钥。";
			const { response, data } = await this.utils.formDialog.modal({
				title: "GitHub 发布密钥",
				schema: ({ Group, Controls }) => Group(
					Controls.Select("action").Label("操作").Options(actions),
					Controls.Textarea("status").Label("当前状态").Rows(6).Readonly(true).IsBlockLayout(true),
				),
				data: { action: Object.keys(actions)[0], status },
			});
			if (response !== 1) return false;

			if (data.action === "open") {
				this.utils.openUrl(this.githubKeysUrl);
				return false;
			}

			if (data.action === "regenerate") {
				const confirm = await this.utils.showMessageBox({
					type: "warning",
					title: "重新生成发布密钥",
					message: "旧密钥会立即失效，GitHub 上旧的公钥将无法再推送。",
					detail: "确定要继续吗？",
					buttons: ["重新生成", "取消"],
					defaultId: 1,
					cancelId: 1,
				});
				if (confirm.response !== 0) return false;
			}

			const args = [];
			if (data.action === "copy") args.push("-ShowOnly");
			if (data.action === "regenerate") args.push("-Regenerate");
			await this._runKeyScript(args);
			return false;
		} catch (error) {
			this._error("密钥管理失败：" + error.message);
			return false;
		}
	}

	testPush = async () => {
		try {
			this.utils.notification.show("正在测试 SSH 和 GitHub 推送权限……", "info");
			this._runPowerShell(
				["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", path.join(this.pluginDir, "test-push.ps1")],
				(error, result) => {
					if (!result) {
						this._error("推送测试失败：" + (error || "脚本没有返回结果"));
						return;
					}
					if (result.success) {
						this.utils.notification.show(result.message || "推送测试通过", "success");
						return;
					}
					this.utils.showMessageBox({
						type: "error",
						title: "推送测试失败",
						message: result.message || "推送测试失败",
						detail: result.detail || "",
					});
				},
			);
		} catch (error) {
			this._error("推送测试失败：" + error.message);
		}
		return false;
	}

	openTools = async () => {
		try {
			const actions = {
				key: "密钥管理",
				test: "测试推送",
				posts: "打开文章目录",
				github: "打开 GitHub 仓库",
				help: "查看使用说明",
			};
			const { response, data } = await this.utils.formDialog.modal({
				title: "其他",
				schema: ({ Group, Controls }) => Group(
					Controls.Select("action").Label("选择操作").Options(actions),
				),
				data: { action: "key" },
			});
			if (response !== 1) return false;

			if (data.action === "key") return this.manageKey();
			if (data.action === "test") return this.testPush();
			if (data.action === "posts") {
				this.openPostsFolder();
				return false;
			}
			if (data.action === "github") {
				this.utils.openUrl("https://github.com/JinlinXingjian/firefly-blog");
				return false;
			}
			if (data.action === "help") {
				this.utils.openFile(path.join(this.pluginDir, "README.md"), true);
				return false;
			}
		} catch (error) {
			this._error("打开其他功能失败：" + error.message);
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

	_runKeyScript = async (args) => {
		const result = await new Promise((resolve, reject) => {
			this._runPowerShell(
				[
					"-NoProfile",
					"-ExecutionPolicy",
					"Bypass",
					"-File",
					path.join(this.pluginDir, "setup-key.ps1"),
					"-NoOpen",
					...args,
				],
				(error, data) => {
					if (data) {
						resolve(data);
						return;
					}
					reject(new Error(error || "密钥脚本没有返回结果"));
				},
			);
		});
		if (!result.success) {
			throw new Error(result.message || "密钥脚本执行失败");
		}

		const copied = await this._copyText(result.publicKey);
		await this.utils.formDialog.modal({
			title: copied ? "公钥已复制" : "发布公钥",
			schema: ({ Group, Controls }) => Group(
				Controls.Textarea("publicKey")
					.Label(copied ? "公钥（已复制到剪贴板）" : "公钥（请手动复制）")
					.Rows(5)
					.Readonly(true)
					.IsBlockLayout(true),
			),
			data: { publicKey: result.publicKey },
		});
		this.utils.notification.show(result.message || "密钥已就绪", "success");
		this.utils.openUrl(result.githubUrl || this.githubKeysUrl);
	}

	_copyText = async (text) => {
		try {
			if (navigator.clipboard?.writeText) {
				await navigator.clipboard.writeText(text);
				return true;
			}
		} catch {
			// 继续尝试旧接口
		}
		try {
			const textarea = document.createElement("textarea");
			textarea.value = text;
			textarea.style.position = "fixed";
			textarea.style.opacity = "0";
			document.body.appendChild(textarea);
			textarea.select();
			const ok = document.execCommand("copy");
			textarea.remove();
			return ok;
		} catch {
			return false;
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
		const script = path.join(this.pluginDir, args[0]);
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
		execFileSync("node", [path.join(this.pluginDir, scriptName)], {
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
