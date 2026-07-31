import type { Page } from "@playwright/test";
import { vodFormBaseSchema } from "~/features/vods/vods-schemas";
import { newVodPage } from "~/utils/urls";
import {
	navigate,
	selectStage,
	selectUser,
	selectWeapon,
	submit,
} from "../../helpers/playwright";
import { createFormHelpers } from "../../helpers/playwright-form";
import { VodPage } from "./vod-page";

/** `/vods/new`, also reached with `?vod=` to edit an existing one. */
export class NewVodPage {
	private readonly page: Page;
	readonly form;
	readonly locators;

	constructor(page: Page) {
		this.page = page;
		this.form = createFormHelpers(page, vodFormBaseSchema);
		this.locators = {
			addMatchButton: this.page.getByRole("button", {
				name: "Add",
				exact: true,
			}),
		};
	}

	async goto() {
		await navigate({ page: this.page, url: newVodPage() });
	}

	async selectPov(userName: string) {
		await selectUser({
			page: this.page,
			userName,
			labelName: "Player (PoV)",
		});
	}

	match(index: number) {
		return new VodMatchFields(this.page, index);
	}

	async addMatch() {
		await this.locators.addMatchButton.click();
	}

	async save() {
		await submit(this.page);
		return new VodPage(this.page);
	}
}

/** One "Game N" fieldset of the form. */
class VodMatchFields {
	private readonly page: Page;
	private readonly index: number;

	constructor(page: Page, index: number) {
		this.page = page;
		this.index = index;
	}

	async setStartsAt(timestamp: string) {
		await this.page
			.getByLabel("Start timestamp")
			.nth(this.index)
			.fill(timestamp);
	}

	async selectMode(modeName: string) {
		await this.page
			.getByRole("radio", { name: modeName })
			.nth(this.index)
			.click();
	}

	async selectStage(stageName: string) {
		await selectStage({ page: this.page, name: stageName, nth: this.index });
	}

	async selectWeapon(weaponName: string) {
		await selectWeapon({
			page: this.page,
			name: weaponName,
			testId: `match-${this.index}-weapon`,
		});
	}

	/** The per-team weapon selects a cast has in place of a single point of view weapon. */
	async selectTeamWeapon(team: 1 | 2, weaponIndex: number, weaponName: string) {
		await selectWeapon({
			page: this.page,
			name: weaponName,
			testId: `match-${this.index}-team${team}-weapon-${weaponIndex}`,
		});
	}
}
