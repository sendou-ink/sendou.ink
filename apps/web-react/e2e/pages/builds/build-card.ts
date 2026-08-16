import type { Locator } from "@playwright/test";

export class BuildCard {
	readonly root: Locator;

	constructor(root: Locator) {
		this.root = root;
	}

	get title() {
		return this.root.getByTestId("build-title");
	}

	weaponImage(weaponName: string) {
		return this.root.getByAltText(weaponName);
	}

	modeImage(modeName: string) {
		return this.root.getByAltText(modeName);
	}
}
