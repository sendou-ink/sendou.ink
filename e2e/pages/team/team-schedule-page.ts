import type { Page } from "@playwright/test";
import { teamPage } from "~/utils/urls";
import { modalClickConfirmButton, navigate } from "../../helpers/playwright";

/** `/t/:customUrl/schedule`: when the team's members are free, as a heatmap or a grid, with the playable windows and team events. */
export class TeamSchedulePage {
	private readonly page: Page;
	readonly locators;

	constructor(page: Page) {
		this.page = page;
		this.locators = {
			grid: page.getByTestId("schedule-grid"),
			heatmap: page.getByTestId("schedule-heatmap"),
			heatmapTooltip: page.getByTestId("schedule-heatmap-tooltip"),
			heatmapUnreported: page.getByTestId("schedule-heatmap-unreported"),
			summary: page.getByTestId("schedule-summary"),
			hiddenMessage: page.getByTestId("schedule-hidden"),
			windows: page.getByTestId("schedule-window"),
			notes: page.getByTestId("schedule-note"),
			teamEvents: page.getByTestId("schedule-team-event"),
			addEventButton: page.getByTestId("add-team-event-button"),
			deleteEventButtons: page.getByTestId(/delete-team-event/),
			editAvailabilityLink: page.getByTestId("edit-availability-link"),
			// the chip radio input is visually hidden, so the label is what clicks
			nextWeekToggle: page.locator(
				'label[for="chip-radio-schedule-week-next"]',
			),
			gridViewTab: page.getByRole("tab", { name: "Grid" }),
		};
	}

	async goto(customUrl: string) {
		await navigate({
			page: this.page,
			url: `${teamPage(customUrl)}/schedule`,
		});
	}

	/** Switches from the heatmap to the grid of each member's days. */
	async openGridView() {
		await this.locators.gridViewTab.click();
	}

	async openNextWeek() {
		await this.locators.nextWeekToggle.click();
	}

	/** Follows the "Edit availability" link to the events page's editor, keeping the week shown. */
	async editOwnAvailability() {
		await this.locators.editAvailabilityLink.click();
	}

	/** Windows of the summary line "Team can play" (`full`) or "With a sub" (one short). */
	playableWindows(tier: "full" | "withSub") {
		return this.locators.summary
			.locator(":scope > div")
			.filter({ hasText: tier === "full" ? "Team can play" : "With a sub" })
			.getByTestId("schedule-window");
	}

	/** Leaves a member out of the heatmap's count, or takes them back in. */
	async toggleMemberInCount(userId: number) {
		await this.memberChip(userId).click();
	}

	/** Opens the dialog for adding a team event. */
	async startAddingEvent() {
		await this.locators.addEventButton.click();
	}

	/** Opens the edit dialog of the (only) team event. */
	async startEditingEvent() {
		await this.page.getByTestId(/edit-team-event/).click();
	}

	/** Deletes the (only) team event, confirming the dialog. */
	async deleteEvent() {
		await this.locators.deleteEventButtons.click();
		await modalClickConfirmButton(this.page);
	}

	/** Picks a member as a participant in the team event form's participant list. */
	async pickParticipant(username: string) {
		await this.page.getByLabel(username, { exact: true }).click();
	}

	cell(userId: number, dayIndex: number) {
		return this.page.getByTestId(`schedule-cell-${userId}-${dayIndex}`);
	}

	cellRange(userId: number, dayIndex: number) {
		return this.cell(userId, dayIndex).getByTestId("schedule-range");
	}

	cellBusy(userId: number, dayIndex: number) {
		return this.cell(userId, dayIndex).getByTestId("schedule-busy");
	}

	dayDot(dayIndex: number) {
		return this.page.getByTestId(`schedule-day-dot-${dayIndex}`);
	}

	memberChip(userId: number) {
		return this.page.getByTestId(`heatmap-member-${userId}`);
	}

	heatmapCells(count: number) {
		return this.page.locator(
			`[data-testid="schedule-heatmap-cell"][data-count="${count}"]`,
		);
	}

	heatmapCellBackground(count: number) {
		return this.heatmapCells(count)
			.first()
			.evaluate((cell) => getComputedStyle(cell).backgroundColor);
	}
}
