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
import { BroadcastDesignPage } from "./broadcast-design-page";
import { cutStreams, trackStreams } from "./broadcast-streams";

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
	private isTrackingStreams = false;
	readonly locators;

	constructor(page: Page, pageArgs: BroadcastPageArgs) {
		this.page = page;
		this.pageArgs = pageArgs;
		this.locators = {
			noFeaturedMatch: page.getByText("No match is cast on this channel."),
			featuredMatch: page.getByRole("link", { name: /\d–\d/ }),
			takeButton: page.getByTestId("broadcast-take-button"),
			holdButton: page.getByTestId("broadcast-hold-button"),
			swapSidesButton: page.getByTestId("broadcast-swap-sides"),
			inkButton: page.getByTestId("broadcast-ink-lockYellowPurple"),
			connectionBanner: page.getByTestId("broadcast-connection-banner"),
			lastUpdate: page.getByTestId("broadcast-last-update"),
			obsHealth: page.getByRole("button", { name: "OBS not connected" }),
			scannerHealth: page.getByRole("button", { name: "No scanner connected" }),
			onGameStart: page.getByText("On game start", { exact: true }),
			themeTab: page.getByRole("tab", { name: "Theme" }),
			themeName: (name: string) =>
				page
					.getByRole("tabpanel", { name: "Theme" })
					.getByText(name, { exact: true }),
			setupTab: page.getByRole("tab", { name: "Setup" }),
			captureCardSourceInput: page.getByLabel("Capture card source"),
			programShowsThis: page.getByText(
				"Your browser source URL shows this broadcast",
			),
		};
	}

	async goto() {
		// the Setup tab connects to OBS's WebSocket server, never the one of an OBS open where the tests run
		await this.page.routeWebSocket(/^ws:\/\/127\.0\.0\.1:/, (ws) => ws.close());
		if (!this.isTrackingStreams) {
			await trackStreams(this.page);
			this.isTrackingStreams = true;
		}
		await navigate({
			page: this.page,
			url: broadcastDashboardPage(this.pageArgs),
		});
	}

	/** Drops the dashboard's own stream like a lost connection does, keeping it from connecting again until the returned function is called. */
	cutStream() {
		const streamPath = `${broadcastDashboardPage(this.pageArgs)}/stream`;

		return cutStreams(this.page, (url) => url.pathname === streamPath);
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

	/** Presses Take while the server can't be reached: the request fails on the network. */
	async takeUnreachable() {
		const isAction = (url: URL) =>
			url.pathname === `${broadcastDashboardPage(this.pageArgs)}.data`;
		await this.page.route(isAction, (route) =>
			route.request().method() === "POST"
				? route.abort("connectionrefused")
				: route.continue(),
		);
		const failed = this.page.waitForEvent("requestfailed", (request) =>
			isAction(new URL(request.url())),
		);
		await this.locators.takeButton.click();
		await failed;
		await this.page.unroute(isAction);
	}

	/** Swaps which team is Alpha (on the left) on every scene, on air right away. */
	swapSides() {
		return submit(this.page, "broadcast-swap-sides");
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

	/** Saves custom CSS for the overlays through the designer, which goes back to the theme tab. */
	async saveTheme(css: string) {
		const design = new BroadcastDesignPage(this.page, this.pageArgs);
		await design.goto();
		await design.openCustomCss();
		await design.locators.editor.fill(css);
		await design.save();
	}

	/** Points the user's OBS URL at this broadcast, confirming the switch away from the one it shows. */
	async pointProgram() {
		await this.locators.setupTab.click();
		await this.page.getByTestId("broadcast-point-program-button").click();
		await submit(this.page, "confirm-button");
	}

	/** Gives the user's OBS URL a new key, confirming the old one stops working. */
	async regenerateProgramKey() {
		await this.locators.setupTab.click();
		await this.page.getByTestId("broadcast-regenerate-key-button").click();
		await submit(this.page, "confirm-button");
	}

	/** Saves the capture card source the user's OBS URL mutes off the game scene. */
	async saveCaptureCardSource(inputName: string) {
		await this.locators.setupTab.click();
		await this.locators.captureCardSourceInput.fill(inputName);
		await submit(
			this.page,
			this.locators.captureCardSourceInput
				.locator("xpath=ancestor::form")
				.getByTestId("submit-button"),
		);
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
