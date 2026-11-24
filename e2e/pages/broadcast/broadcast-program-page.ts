import type { Page } from "@playwright/test";
import type { BroadcastStreamRole } from "~/features/broadcast/broadcast-types";
import {
	broadcastOverlayPage,
	broadcastProgramPage,
	broadcastStreamUrl,
} from "~/features/broadcast/broadcast-urls";
import type { CastScene } from "~/features/broadcast-cast/broadcast-cast-types";
import { navigate } from "../../helpers/playwright";

interface BroadcastPageArgs {
	tournamentId: number;
	slug: string;
}

/**
 * The overlay OBS shows as a browser source: a user's OBS URL (`/broadcast/program?key=…`), or the broadcast's own
 * `/to/:id/broadcast/:channel/program` its producers preview.
 */
export class BroadcastProgramPage {
	private readonly page: Page;
	private readonly pageArgs: BroadcastPageArgs;
	readonly locators;

	constructor(page: Page, pageArgs: BroadcastPageArgs) {
		this.page = page;
		this.pageArgs = pageArgs;
		this.locators = {
			canvas: page.locator("[data-broadcast]"),
			/** Holds the canvas, transparent until the page has loaded well enough to go on air. */
			shell: page.locator("div:has(> [data-broadcast])"),
		};
	}

	/** Answers every later load of the OBS URL's page itself with a gateway's error page, the page's stream left working. */
	async failPageLoads() {
		await this.page.route(
			(url) => url.pathname === "/broadcast/program",
			(route) =>
				route.fulfill({
					status: 502,
					contentType: "text/html",
					body: "<html><body><h1>502 Bad gateway</h1></body></html>",
				}),
		);
	}

	/** Opens the OBS URL of the program key. */
	async goto(programKey: string) {
		await navigate({ page: this.page, url: broadcastProgramPage(programKey) });
	}

	/** The scene drawn on the canvas. */
	scene(scene: CastScene) {
		return this.locators.canvas.locator(`[data-scene="${scene}"]`);
	}

	/** Name of the team the scene shows on a side, `a` being Alpha on the left. */
	teamName(scene: CastScene, side: "a" | "b") {
		return this.scene(scene).locator(
			`[data-part="team"][data-team="${side}"] [data-part="team-name"]`,
		);
	}

	/** The status the OBS URL of the key (or without one, the broadcast's own program page) answers with, for whoever the page is logged in as. */
	async responseStatus(programKey: string | null) {
		const response = await this.page.request.get(
			programKey
				? broadcastProgramPage(programKey)
				: broadcastOverlayPage(this.pageArgs),
		);

		return response.status();
	}

	/**
	 * The status the broadcast's own state stream answers with when it refuses the connection. Not for a stream that opens,
	 * the request would wait for it to end.
	 */
	async refusedStreamStatus(role: BroadcastStreamRole) {
		const response = await this.page.request.get(
			broadcastStreamUrl({ ...this.pageArgs, role }),
		);

		return response.status();
	}
}
