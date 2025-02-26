import { get } from 'http';
import { App, DropdownComponent, Notice, Plugin, PluginSettingTab, Setting, ButtonComponent, Editor, MarkdownView, TFile } from 'obsidian';
import OpenAI from 'openai';


interface MyPluginSettings {
	api_key: string;
	base_url: string;
	model: string;
	models: Record<string, string>;
}

const DEFAULT_SETTINGS: MyPluginSettings = {
	api_key: 'API KEY',
	base_url: 'https://api.openai.com/v1/',
	model: '',
	models: {}
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
			models.data.forEach((model, index) => {
				res[`option-${index}`] = model.id;
			  });
			  console.log("List Models:", res);
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
		console.log('Completion:', completion);
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


3. 生成标题时必须遵守：

   - 每个标题不超过20个token（单词/字词单位）
   - 准确概括文本的核心信息
   - 优先使用文本中出现的关键词
   - 避免主观解释或补充信息
   - 允许创造性重组核心要素


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
			.setName("Example Setting")
			.setDesc("Choose an option from the dropdown.")
			.controlEl.createDiv();

		// 创建一个容器来容纳下拉栏和按钮，并应用Flexbox布局
        const controlContainer = modelContainer.createDiv({
            cls: "my-setting-container", // 自定义类名，用于应用CSS样式
        });

        // Instantiate the DropdownComponent
        const dropdown = new DropdownComponent(controlContainer);

        // Add options to the dropdown
        dropdown.addOptions(this.plugin.settings.models);

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
			console.log("Selected key:", key);
			const model = this.plugin.settings.models[key];
			console.log("Corresponding value:", model);
            // You can also update your plugin's settings here
            this.plugin.settings.model = model;
            await this.plugin.saveSettings();
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
			id: 'add_alias_here',
			name: 'Add a alias here',
			editorCallback: (editor: Editor, view: MarkdownView) => {
				this.getTitles(view);
				
			}
		});

		this.addCommand({
			id: 'change_name_here',
			name: 'Change note name here',
			editorCallback: (editor: Editor, view: MarkdownView) => {
				console.log(editor.getDoc())
			}
		})
	}

	onunload() {

	}

	async getTitles(view: MarkdownView) {
		// 获取当前文件的全文（Markdown内容）
		const fileContent = view.getViewData();
		console.log("File content:", fileContent);

		const p = this.client.getPrompt(fileContent);
		console.log("Prompt:", p);

		// 使用 OpenAI API 生成标题
		await this.client.createCompletion(this.settings.model, p)
		.then((response) => {
			if (response == null) {
				console.error("Response is undefined.");
			} else {
				console.log("Response:", response);
				const titles = response.split('\n');
				console.log("Titles:", titles);
			}
		})
		.catch((error) => {
			console.error("Error:", error);
		});

	}

	async reloadModels() {
		this.settings.models = await this.client.listModels();
		await this.saveSettings();
		new Notice("模型列表已刷新！");
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
		if (this.settings.model == '') {
			new Notice('Please set a model in the settings.');
		}
	}

	async saveSettings() {
		this.client = new OpenAIClient(this.settings.api_key, this.settings.base_url);
		this.settings.models = await this.client.listModels();
		await this.saveData(this.settings);
	}
}