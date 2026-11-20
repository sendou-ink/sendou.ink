import type { Page } from "@playwright/test";
import type { Tables } from "~/db/tables";
import { artFormSchema } from "~/features/art/art-schemas";
import { newArtPage } from "~/features/art/art-urls";
import {
	navigate,
	selectUser,
	waitForPOSTResponse,
} from "../../helpers/playwright";
import { createFormHelpers } from "../../helpers/playwright-form";
import { UserArtPage } from "./user-art-page";

/** `/art/new` */
export class NewArtPage {
	private readonly page: Page;
	readonly locators;
	readonly form;

	constructor(page: Page) {
		this.page = page;
		this.form = createFormHelpers(page, artFormSchema);
		this.locators = {
			fileInput: this.page.locator('input[type="file"]'),
			preview: this.page.locator("form img"),
			existingImage: this.page.locator('form img[src*="-small."]'),
			descriptionInput: this.page.getByLabel(this.form.getLabel("description")),
			showcaseSwitch: this.page.getByRole("switch", {
				name: this.form.getLabel("isShowcase"),
			}),
			/** Shown instead of the form to users without the artist role. */
			gainPermissionsText: this.page.getByText(
				/to gain permissions to upload art/,
			),
		};
	}

	/** Given an art id, edits that art instead of uploading a new one. */
	async goto(artId?: Tables["Art"]["id"]) {
		await navigate({ page: this.page, url: newArtPage(artId) });
	}

	async selectImage(filePath: string) {
		await this.locators.fileInput.setInputFiles(filePath);
	}

	/** Adds the user to the users the art is of, the first empty slot taking them. */
	async tagUser(userName: string) {
		await selectUser({
			page: this.page,
			userName,
			labelName: "User",
			within: this.page.locator("form"),
		});
	}

	/** Makes the art the one shown for its artist in the showcase. */
	async makeShowcase() {
		// the switch indicator covers its input
		await this.locators.showcaseSwitch.click({ force: true });
	}

	/** Lands on the uploader's own art page. */
	async save() {
		// the upload alone can outlast an assertion's timeout under load
		await waitForPOSTResponse(this.page, () => this.form.submit());
		return new UserArtPage(this.page);
	}
}
