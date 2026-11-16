import type { Page } from "@playwright/test";
import type * as v from "valibot";
import type { broadcastGameSignalSchema } from "~/features/broadcast/broadcast-schemas";
import type { BroadcastView } from "~/features/broadcast/broadcast-types";
import {
	broadcastDashboardPage,
	broadcastGameUrl,
} from "~/features/broadcast/broadcast-urls";
import type { CastScene } from "~/features/broadcast-cast/broadcast-cast-types";
import {
	navigate,
	submit,
	waitForPOSTResponse,
} from "../../helpers/playwright";

const VIEW_LABELS: Record<BroadcastView, string> = {
	live: "Live",
	next: "Next",
};

const SCENE_LABELS: Record<CastScene, string> = {
	starting: "Starting",
	casters: "Casters",
	rosters: "Rosters",
	maps: "Maps",
	game: "Game",
	results: "Result",
	break: "Break",
	replays: "Replays",
	bracket: "Bracket",
	team: "Team",
	technical: "Standby",
	ending: "Ending",
};

interface BroadcastPageArgs {
	tournamentId: number;
	slug: string;
}

/** `/to/:id/broadcast/:channel`, the producer's control panel of one cast channel's broadcast. */
export class BroadcastDashboardPage {
	private readonly page: Page;
	private readonly pageArgs: BroadcastPageArgs;
	readonly locators;

	constructor(page: Page, pageArgs: BroadcastPageArgs) {
		this.page = page;
		this.pageArgs = pageArgs;
		this.locators = {
			noFeaturedMatch: page.getByText("No match is cast on this channel."),
			featuredMatch: page.getByRole("link", { name: /\d–\d/ }),
			takeButton: page.getByTestId("broadcast-take-button"),
			holdButton: page.getByTestId("broadcast-hold-button"),
			onGameStart: page.getByText("On game start", { exact: true }),
			themeTab: page.getByRole("tab", { name: "Theme" }),
			setupTab: page.getByRole("tab", { name: "Setup" }),
			programShowsThis: page.getByText(
				"Your browser source URL shows this broadcast",
			),
			cssInput: page.getByLabel("Custom CSS"),
		};
	}

	async goto() {
		await navigate({
			page: this.page,
			url: broadcastDashboardPage(this.pageArgs),
		});
	}

	/** The status the dashboard's page request answers with, for whoever the page is logged in as. */
	async responseStatus() {
		const response = await this.page.request.get(
			broadcastDashboardPage(this.pageArgs),
		);

		return response.status();
	}

	/** The chip of a cast channel in the channel switcher. */
	channelChip(name: string) {
		return this.page
			.getByRole("radiogroup", { name: "Channel" })
			.getByText(name, { exact: true });
	}

	/** Heading of the live or the next view, naming the scene it shows. */
	viewHeading(view: BroadcastView, scene: CastScene) {
		return this.page.getByRole("heading", {
			level: 2,
			name: `${VIEW_LABELS[view]} · ${SCENE_LABELS[scene]}`,
			exact: true,
		});
	}

	/** A staged item of the queue in the order they go on air, `0` being next. */
	queueItem(idx: number) {
		return this.page.getByTestId(`broadcast-queue-item-${idx}`);
	}

	/** Puts next on air. */
	take() {
		return submit(this.page, "broadcast-take-button");
	}

	/** Keeps next off air until a Take, instead of it going on air by itself. */
	hold() {
		return submit(this.page, "broadcast-hold-button");
	}

	/** Adds a scene to the end of the queue, selecting it for the scene editor. */
	queueScene() {
		return waitForPOSTResponse(this.page, () =>
			this.page.getByTestId("broadcast-queue-add").click(),
		);
	}

	/** Selects a staged item for the scene editor. */
	selectQueueItem(idx: number) {
		return this.queueItem(idx).click();
	}

	/** Changes the selected staged item's scene. */
	pickScene(scene: CastScene) {
		return submit(this.page, `broadcast-scene-${scene}`);
	}

	/** Removes the selected staged item from the queue. */
	removeQueueItem(idx: number) {
		return submit(this.page, `broadcast-queue-remove-${idx}`);
	}

	/** Saves custom CSS for the overlays from the theme tab. */
	async saveTheme(css: string) {
		await this.locators.themeTab.click();
		await this.locators.cssInput.fill(css);
		await submit(
			this.page,
			this.page
				.getByRole("tabpanel", { name: "Theme" })
				.getByTestId("submit-button"),
		);
	}

	/** Points the user's OBS URL at this broadcast, confirming the switch away from the one it shows. */
	async pointProgram() {
		await this.locators.setupTab.click();
		await this.page.getByTestId("broadcast-point-program-button").click();
		await submit(this.page, "confirm-button");
	}

	/** Tells the broadcast a game started or ended, as the scanner linked from this dashboard does. Returns the response status. */
	async postGameSignal(signal: v.InferInput<typeof broadcastGameSignalSchema>) {
		const response = await this.page.request.post(
			broadcastGameUrl(this.pageArgs),
			{ data: signal },
		);

		return response.status();
	}
}
