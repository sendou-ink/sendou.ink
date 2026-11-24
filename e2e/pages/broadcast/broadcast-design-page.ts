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
			stylesheetSelect: page.getByRole("button", { name: /^Stylesheet / }),
			editor: page.getByTestId("broadcast-design-editor"),
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

	/** Opens a stylesheet of the editor by its name in the picker, e.g. "Custom CSS". */
	async pickTab(name: string) {
		await this.locators.stylesheetSelect.click();
		await this.page.getByRole("option", { name, exact: true }).click();
	}

	/** Saves the theme, landing back on the dashboard's theme tab. */
	async save() {
		await submit(this.page, this.locators.saveButton);
		await this.page.waitForURL(/tab=theme/);
	}
}
