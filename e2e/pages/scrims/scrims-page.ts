import type { Page } from "@playwright/test";
import { scrimRequestFormSchema } from "~/features/scrims/scrims-schemas";
import { scrimsPage } from "~/utils/urls";
import {
	expectIsHydrated,
	modalClickConfirmButton,
	navigate,
	selectUser,
	submit,
	waitForPOSTResponse,
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
			associationsLink: page
				.getByRole("main")
				.getByRole("link", { name: "Associations" }),
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
			fitIndicator: page.getByTestId("scrim-fit-indicator"),
			divsFilterPill: page.getByTestId("divs-filter"),
			addFilterButton: page.getByTestId("add-filter-button"),
			saveFiltersAsDefaultButton: page.getByTestId(
				"save-filters-as-default-button",
			),
		};
	}

	async goto() {
		await navigate({ page: this.page, url: scrimsPage() });
	}

	async reload() {
		await this.page.reload();
		await expectIsHydrated(this.page);
	}

	post(text: string) {
		return this.page.getByText(text);
	}

	/** Sets both selects of the "Divs" filter pill's popover. */
	async filterByDivs({ max, min }: { max: string; min: string }) {
		await this.page.keyboard.press("Escape");
		await this.openDivsFilter();
		await this.page.getByLabel("Max div").selectOption(max);
		await this.page.getByLabel("Min div").selectOption(min);
		await this.page.keyboard.press("Escape");
	}

	/** Resets the "Divs" filter, hiding the pill. */
	async removeDivsFilter() {
		await this.page.keyboard.press("Escape");
		await this.page.getByTestId("divs-filter-remove").click();
	}

	/** Persists the current filters as the user's default. */
	async saveFiltersAsDefault() {
		await waitForPOSTResponse(this.page, () =>
			this.locators.saveFiltersAsDefaultButton.click(),
		);
	}

	/** The pill is only rendered while its filter differs from the default. */
	private async openDivsFilter() {
		if (await this.locators.divsFilterPill.isVisible()) {
			await this.locators.divsFilterPill.click();
			return;
		}

		await this.locators.addFilterButton.click();
		await this.page.getByTestId("menu-item-divs-filter").click();
	}

	/** One roster member's row of the fit indicator's popover, its status in `data-status`. */
	availabilityRow(userId: number) {
		return this.page.getByTestId(`availability-row-${userId}`);
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
