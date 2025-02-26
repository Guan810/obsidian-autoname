import { App, DropdownComponent, Notice, Plugin, PluginSettingTab, Setting, ButtonComponent, Editor, MarkdownView, SuggestModal } from 'obsidian';
import OpenAI from 'openai';
import * as YAML from 'js-yaml';

interface MyPluginSettings {
	api_key: string;
	base_url: string;
	model: string;
	models: Record<string, string>;
	autoFirst: boolean;
}

const DEFAULT_SETTINGS: MyPluginSettings = {
	api_key: 'API KEY',
	base_url: 'https://api.openai.com/v1/',
	model: '',
	models: {},
	autoFirst: false,
}

export class OpenAIClient {
	client: OpenAI;

	constructor(api_key: string, base_url: string) {
		// 创建 OpenAI 客户端实例
		this.client = new OpenAI({
			apiKey: api_key, // 使用环境变量或直接传入 API Key
			baseURL: base_url, // 默认 Base URL
			dangerouslyAllowBrowser: true,
		});
	}

	async listModels() {
		const res: Record<string, string> = {}
		try {
			const models = await this.client.models.list();
			models.data.forEach((model) => {
				res[`${model.id}`] = model.id;
			  });
		} catch (error) {
		  	console.error('Error:', error);
		}
		return res
	}

	async createCompletion(model: string, prompt: string) {
		const completion = await this.client.chat.completions.create({
			model: model,
			messages: [
				{
					role: 'user',
					content: prompt,
				}
			],
		});
		return completion.choices[0].message.content;
	}

	getPrompt(content:string) {
		return `
你现在的任务是根据提供的Obsidian笔记内容生成简洁有效的标题备选方案。以下是具体操作要求：

<任务要求>

1. 仔细阅读以下Markdown格式的笔记内容：

<text>

${content}

</text>


2. 分析文本核心内容，识别以下要素：

   - 主要论述对象或主题
   - 关键概念/专业术语
   - 文本结构特征（如列表、引文、代码块等）
   - 作者的核心观点或结论
   - 当前文本的标题与别名（如果有）


3. 生成标题时必须遵守：

   - 每个标题不超过20个token（单词/字词单位）
   - 准确概括文本的核心信息
   - 优先使用文本中出现的关键词
   - 避免主观解释或补充信息
   - 允许创造性重组核心要素
   - 不允许与现有标题与别名重复


4. 输出要求：

   - 生成3-5个候选标题
   - 每个标题单独成行
   - 不使用编号或项目符号
   - 完全排除Markdown格式
   - 禁止添加说明性文字

</任务要求>



请直接输出候选标题，格式示例如下：

[候选标题1]
[候选标题2]
[候选标题3]


例如给定关于机器学习模型的笔记，可能输出：

Machine Learning Model Evaluation Methods
Key Metrics for Model Performance
Cross-Validation Techniques Comparison
Ensemble Model Optimization Strategies

现在开始处理文本内容，生成标题备选方案。
		`
	}
}

export class MyPluginSettingTab extends PluginSettingTab {
	plugin: MyPlugin;

	constructor(app: App, plugin: MyPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		let {containerEl} = this;

		containerEl.empty();

		containerEl.createEl('h2', {text: 'Settings for My Plugin'});

		new Setting(containerEl)
			.setName('API Key')
			.setDesc('Your OpenAI API key')
			.addText(text => text
				.setPlaceholder('API Key')
				.setValue(this.plugin.settings.api_key)
				.onChange(async (value) => {
					this.plugin.settings.api_key = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Base URL')
			.setDesc('The base URL for the OpenAI API')
			.addText(text => text
				.setPlaceholder('Base URL')
				.setValue(this.plugin.settings.base_url)
				.onChange(async (value) => {
					this.plugin.settings.base_url = value;
					await this.plugin.saveSettings();
				}));

		// Create a container for the dropdown
        const modelContainer = new Setting(containerEl)
			.setName("Model using to generate titles")
			.setDesc("Choose a model from the dropdown.")
			.controlEl.createDiv();

		// 创建一个容器来容纳下拉栏和按钮，并应用Flexbox布局
        const controlContainer = modelContainer.createDiv({
            cls: "my-setting-container", // 自定义类名，用于应用CSS样式
        });

        // Instantiate the DropdownComponent
        const dropdown = new DropdownComponent(controlContainer);

        // Add options to the dropdown
        dropdown.addOptions(this.plugin.settings.models);

		dropdown.setValue(this.plugin.settings.model);

		// 在下拉栏右侧添加一个按钮
        const button = new ButtonComponent(controlContainer)
            .setButtonText("Refresh")
            .setCta()
            .onClick(() => {
                this.plugin.reloadModels(); // 触发 reload 函数
            });

        // 设置按钮的图标（刷新图标）
        button.setIcon("refresh-cw");

        // Handle value changes
        dropdown.onChange(async (key) => {
			const model = key;
            // You can also update your plugin's settings here
            this.plugin.settings.model = model;
            await this.plugin.saveSettings();
        });

		new Setting(containerEl) // 创建一个新的 Setting 对象，并添加到设置选项卡容器中
            .setName('Enable auto select first') // 设置设置项的名称，显示在用户界面上
            .setDesc('This toggle enables or disables auto select first title in response.') // 设置设置项的描述，提供更详细的说明
            .addToggle(toggle => toggle // 使用 addToggle() 方法添加一个开关
                .setValue(this.plugin.settings.autoFirst) // 设置开关的初始值，从插件设置中读取
                .onChange(async (value) => { // 注册开关状态改变时的回调函数
                    this.plugin.settings.autoFirst = value; // 更新插件设置对象中的开关状态
                    await this.plugin.saveSettings(); // 保存更新后的插件设置到磁盘
                })
            );

	}
}

export class MyModalSuggestion extends SuggestModal<string> {
	titles: string[];
	editor: Editor;
	resolvePromise: (value: string) => void;
	
	constructor(titles: string[], app: App, editor: Editor) {
		super(app);
		this.titles = titles;
		this.editor = editor;
	}

	getSuggestions(inputStr: string): string[] {
		return this.titles.filter((title) => {
			return title.toLowerCase().includes(inputStr.toLowerCase());
		});
	}

	renderSuggestion(value: string, el: HTMLElement): void {
		el.setText(value);
	}

	onChooseSuggestion(item: string, evt: MouseEvent | KeyboardEvent): void {
		this.inputEl.value = item;
		this.resolvePromise(this.inputEl.value); 
		this.close();
	}

	// 添加一个 open 方法，返回 Promise
    openAndGetValue(): Promise<string> {
        return new Promise((resolve) => {
            this.resolvePromise = resolve; // 将 resolve 函数赋值给类的成员变量
            this.open(); // 打开 Modal
        });
    }
}

export default class MyPlugin extends Plugin {
	settings: MyPluginSettings;
	client: OpenAIClient;

	async onload() {
		await this.loadSettings();

		this.addSettingTab(new MyPluginSettingTab(this.app, this));

		this.client = new OpenAIClient(this.settings.api_key, this.settings.base_url);

		this.addCommand({
			id: 'change_name_here',
			name: 'Change note name here',
			editorCallback: async (editor: Editor, view: MarkdownView) => {
				const titles = await this.getTitles(view);
				if (this.settings.autoFirst) {
					// 如果启用自动选择第一个标题，则直接使用第一个标题
					const firstTitle = titles[0];
					new Notice(`自动选择了标题: ${firstTitle}`);
					// 在这里调用你的修改标题和添加别名的函数
					await this.modifyTitle(view, firstTitle);
				} else {
					const modal = new MyModalSuggestion(titles, this.app, editor);
					const selectedTitle = await modal.openAndGetValue();
					if (selectedTitle) { // 确保用户选择了标题，而不是取消了 Modal
						new Notice(`用户选择了标题: ${selectedTitle}`);
						// 在这里调用你的修改标题和添加别名的函数
						await this.modifyTitle(view, selectedTitle);
					} else {
						new Notice("用户取消了标题选择。");
					}
				}
			}
		});

		this.addCommand({
			id: 'add_alias_here',
			name: 'Add a alias here',
			editorCallback: async (editor: Editor, view: MarkdownView) => {
				const titles = await this.getTitles(view);
				if (this.settings.autoFirst) {
					// 如果启用自动选择第一个标题，则直接使用第一个标题
					const firstTitle = titles[0];
					new Notice(`自动选择了别名: ${firstTitle}`);
					// 在这里调用你的修改标题和添加别名的函数
					await this.addAlias(view, firstTitle);
				} else {
					const modal = new MyModalSuggestion(titles, this.app, editor);
					const selectedTitle = await modal.openAndGetValue();
					if (selectedTitle) { // 确保用户选择了标题，而不是取消了 Modal
						new Notice(`用户选择了别名: ${selectedTitle}`);
						// 在这里调用你的修改标题和添加别名的函数
						await this.addAlias(view, selectedTitle);
					} else {
						new Notice("用户取消了别名选择。");
					}
				}
			}
		})
	}

	onunload() {

	}

	async addAlias(markdownView: MarkdownView, aliasToAdd: string) {
		if (!markdownView.file) {
			new Notice("当前没有打开笔记。");
			return;
		}
	
		const file = markdownView.file;
	
		try {
			let fileContent = await this.app.vault.read(file);
			let frontmatter: { aliases?: string[] } = {};
			let bodyContent = fileContent;
	
			// 尝试解析 frontmatter
			const frontmatterRegex = /^---\n([\s\S]*?)\n---/;
			const match = fileContent.match(frontmatterRegex);
			if (match) {
				try {
					frontmatter = YAML.load(match[1]) as object || {}; // 解析 YAML，如果解析失败或为空，则默认为空对象
					bodyContent = fileContent.substring(match[0].length); // 提取正文内容
				} catch (yamlError) {
					console.error("解析 YAML Frontmatter 失败:", yamlError);
					new Notice("解析 YAML Frontmatter 失败。可能无法添加别名。");
					return; // 解析失败，直接返回，不继续添加别名
				}
			}
	
			// 确保 aliases 字段存在且为数组
			if (!frontmatter.hasOwnProperty('aliases') || !Array.isArray(frontmatter['aliases'])) {
				frontmatter['aliases'] = [];
			}
	
			// 添加新的别名 (如果不存在于 aliases 数组中)
			if (!frontmatter['aliases'].includes(aliasToAdd)) {
				frontmatter['aliases'].push(aliasToAdd);
			}
	
			// 将修改后的 frontmatter 转换回 YAML 字符串
			const newFrontmatterYaml = "---\n" + YAML.dump(frontmatter).trim() + "\n---";
			const newFileContent = newFrontmatterYaml + bodyContent;
	
			await this.app.vault.modify(file, newFileContent);
			new Notice(`已添加别名: ${aliasToAdd}`);
	
		} catch (error) {
			console.error("添加别名失败:", error);
			new Notice("添加别名失败。");
		}
	}

	async modifyTitle(markdownView: MarkdownView, newTitle: string) {
		if (!markdownView.file) {
			new Notice("当前没有打开笔记。");
			return;
		}
	
		const file = markdownView.file;
		const basePath = file.parent ? file.parent.path + "/" : ""; // 获取父文件夹路径，根目录则为空
		const newFilePath = basePath + newTitle + ".md"; // 构建新的文件路径
	
		try {
			await this.app.vault.rename(file, newFilePath);
			new Notice(`笔记标题已修改为: ${newTitle}`);
		} catch (error) {
			console.error("重命名文件失败:", error);
			new Notice("修改笔记标题失败。");
		}
	}

	async getTitles(view: MarkdownView) {
		// 获取当前文件的全文（Markdown内容）
		const fileContent = view.getViewData();

		const p = this.client.getPrompt(fileContent);

		// 使用 OpenAI API 生成标题
		const response = await this.client.createCompletion(this.settings.model, p)
		
		if (response == null) {
			console.log("undefined response");
			return [];
		} else {
			const titles = response.split('\n');
			return titles;
		}
	}

	async reloadModels() {
		this.settings.models = await this.client.listModels();
		await this.saveSettings();
		new Notice("模型列表已刷新！");
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
		if (this.settings.model == '') {
			new Notice('请在设置中设置模型！');
		}
	}

	async saveSettings() {
		this.client = new OpenAIClient(this.settings.api_key, this.settings.base_url);
		this.settings.models = await this.client.listModels();
		await this.saveData(this.settings);
	}
}