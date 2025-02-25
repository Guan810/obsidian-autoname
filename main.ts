import { App, DropdownComponent, Notice, Plugin, PluginSettingTab, Setting } from 'obsidian';
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
	model: 'default',
	models: {"option-1": "gpt-4o-mini"}
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
		} catch (error) {
		  	console.error('Error:', error);
		}
		return res
	}

	async createCompletion(model: string, prompt: string) {
		try {
			const completion = await this.client.completions.create({
				model: model,
				prompt: prompt,
			});
			console.log('Completion:', completion);
		} catch (error) {
			console.error('Error:', error);
		}
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

		new Setting(containerEl)
			.setName('Model')
			.setDesc('The model to use for the OpenAI API')
			.addText(text => text
				.setPlaceholder('Model')
				.setValue(this.plugin.settings.model)
				.onChange(async (value) => {
					this.plugin.settings.model = value;
					await this.plugin.saveSettings();
				}));

		// Create a container for the dropdown
        const dropdownContainer = new Setting(containerEl)
			.setName("Example Setting")
			.setDesc("Choose an option from the dropdown.")
			.controlEl.createDiv();

        // Instantiate the DropdownComponent
        const dropdown = new DropdownComponent(dropdownContainer);

        // Add options to the dropdown
        dropdown.addOptions(this.plugin.settings.models);

        // Set the initial value
        dropdown.setValue("option2");

        // Handle value changes
        dropdown.onChange(async (value) => {
            console.log("Selected value:", value);
            // You can also update your plugin's settings here
            this.plugin.settings.model = value;
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
			callback: () => {
				

			}
		});

		this.addCommand({
			id: 'change_name_here',
			name: 'Change note name here',
			callback: () => {
				

			}
		})
	}

	onunload() {

	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
		this.client = new OpenAIClient(this.settings.api_key, this.settings.base_url);
		this.settings.models = await this.client.listModels();
	}
}