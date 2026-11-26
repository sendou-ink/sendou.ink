import type { Page } from "@playwright/test";
import { broadcastDesignPage } from "~/features/broadcast/broadcast-urls";
import { navigate, submit } from "../../helpers/playwright";

interface BroadcastPageArgs {
	tournamentId: number;
	slug: string;
}

/** `/to/:id/broadcast/:channel/design`, the theme designer of one cast channel's broadcast. */
export class BroadcastDesignPage {
	private readonly page: Page;
	private readonly pageArgs: BroadcastPageArgs;
	readonly locators;

	constructor(page: Page, pageArgs: BroadcastPageArgs) {
		this.page = page;
		this.pageArgs = pageArgs;
		this.locators = {
			presetSelect: page.getByLabel("Preset", { exact: true }),
			advancedToggle: page.getByText("Advanced: custom CSS", { exact: true }),
			editor: page.getByTestId("broadcast-design-editor"),
			/** The text input of the setting of the variable, e.g. `--bc-text`. */
			setting: (name: string) =>
				page
					.getByTestId(`broadcast-setting-${name}`)
					.locator("input:not([type=color])"),
			confirmPresetButton: page.getByTestId("broadcast-design-preset-confirm"),
			saveButton: page.getByTestId("broadcast-design-save"),
		};
	}

	async goto() {
		await navigate({
			page: this.page,
			url: broadcastDesignPage(this.pageArgs),
		});
	}

	/** Picks a preset (or the default styles) by its name in the picker. Over edits of one's own it asks to confirm. */
	async pickPreset(name: string) {
		await this.locators.presetSelect.click();
		await this.page.getByRole("option", { name, exact: true }).click();
	}

	/** Opens the custom CSS editor under "Advanced". */
	async openCustomCss() {
		if (await this.locators.editor.isVisible()) return;

		await this.locators.advancedToggle.click();
	}

	/** Saves the theme, landing back on the dashboard's theme tab. */
	async save() {
		await submit(this.page, this.locators.saveButton);
		await this.page.waitForURL(/tab=theme/);
	}
}
