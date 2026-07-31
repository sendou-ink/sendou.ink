import type { Page } from "@playwright/test";
import { scrimRequestFormSchema } from "~/features/scrims/scrims-schemas";
import { scrimsPage } from "~/utils/urls";
import {
	modalClickConfirmButton,
	navigate,
	selectUser,
	submit,
} from "../../helpers/playwright";
import { createFormHelpers } from "../../helpers/playwright-form";
import { AssociationsPage } from "../associations/associations-page";
import { ScrimPage } from "./scrim-page";

type Tab = "available" | "owned" | "booked";

const TAB_NAMES: Record<Tab, string> = {
	available: "Available",
	owned: "Owned",
	booked: "Booked",
};

export class ScrimsPage {
	private readonly page: Page;
	readonly locators;

	constructor(page: Page) {
		this.page = page;
		this.locators = {
			associationsLink: page.getByRole("link", { name: "Associations" }),
			requestButtons: page.getByTestId("request-scrim-button"),
			viewRequestButtons: page.getByTestId("view-request-button"),
			acceptRequestButtons: page.getByTestId("confirm-modal-trigger-button"),
			togglePendingRequestsButton: page.getByTestId(
				"toggle-pending-requests-button",
			),
			deleteButtons: page.getByRole("button", { name: "Delete" }),
			contactLinks: page.getByRole("link", { name: "Contact" }),
			limitedVisibilityPopover: page.getByTestId("limited-visibility-popover"),
			tournamentPopover: page.getByTestId("tournament-popover-trigger"),
			canceledLabel: page.getByText("Canceled"),
		};
	}

	async goto() {
		await navigate({ page: this.page, url: scrimsPage() });
	}

	post(text: string) {
		return this.page.getByText(text);
	}

	async openTab(tab: Tab) {
		await this.page.getByRole("tab", { name: TAB_NAMES[tab] }).click();
	}

	async openAssociations() {
		await this.locators.associationsLink.click();
		return new AssociationsPage(this.page);
	}

	async requestFirst() {
		await this.locators.requestButtons.first().click();
		return new ScrimRequestModal(this.page);
	}

	/** Posts of the available tab whose request is pending are hidden until asked for. */
	async showPendingRequests() {
		await this.locators.togglePendingRequestsButton.first().click();
	}

	async cancelPendingRequest() {
		await this.locators.viewRequestButtons.first().click();
		await this.page.getByRole("button", { name: "Cancel" }).click();
	}

	async acceptFirstRequest() {
		await this.locators.acceptRequestButtons.first().click();
		await modalClickConfirmButton(this.page);
	}

	async deleteFirstPost() {
		await this.locators.deleteButtons.first().click();
		await modalClickConfirmButton(this.page);
	}

	async openFirstBookedScrim() {
		await this.locators.contactLinks.first().click();
		return new ScrimPage(this.page);
	}
}

/** The dialog for requesting a scrim of somebody else's post. */
class ScrimRequestModal {
	private readonly page: Page;
	readonly form;

	constructor(page: Page) {
		this.page = page;
		this.form = createFormHelpers(page, scrimRequestFormSchema);
	}

	/** The requester themselves is the first of the pick-up, the rest are chosen here. */
	async selectPickupUsers(userNames: string[]) {
		for (const [index, userName] of userNames.entries()) {
			await selectUser({
				page: this.page,
				labelName: `User ${index + 2}`,
				userName,
			});
		}
	}

	/** Only posts with a flexible start time offer times to pick from. */
	async selectStartTime(nth: number) {
		await this.page
			.getByLabel(this.form.getLabel("at"))
			.selectOption({ index: nth });
	}

	async send() {
		await submit(this.page);
	}
}
