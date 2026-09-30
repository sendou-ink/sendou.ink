import type { Page } from "@playwright/test";
import { SENDOUQ_READY_PAGE } from "~/utils/urls";
import { navigate, submit } from "../../helpers/playwright";
import { GroupCard } from "./group-card";

export class SendouQReadyPage {
	private readonly page: Page;
	readonly locators;
	/** The own group's card, the only one showing who its members are. */
	readonly groupCard: GroupCard;

	constructor(page: Page) {
		this.page = page;
		this.locators = {
			countdown: page.getByTestId("ready-check-countdown"),
			readyButton: page.getByRole("button", { name: "Ready to play" }),
			confirmedText: page.getByTestId("ready-confirmed"),
			hiddenGroupCard: page.getByTestId("sendouq-hidden-group-card"),
			membersReady: page.getByTestId("member-ready"),
			membersNotReady: page.getByTestId("member-not-ready"),
		};
		this.groupCard = new GroupCard(
			page.getByTestId("sendouq-group-card").first(),
		);
	}

	async goto() {
		await navigate({ page: this.page, url: SENDOUQ_READY_PAGE });
	}

	confirmReady() {
		return submit(this.page, this.locators.readyButton);
	}
}
