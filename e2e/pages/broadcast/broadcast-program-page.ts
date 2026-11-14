import type { Page } from "@playwright/test";
import type { BroadcastStreamRole } from "~/features/broadcast/broadcast-types";
import {
	broadcastOverlayPage,
	broadcastStreamUrl,
} from "~/features/broadcast/broadcast-urls";
import type { CastScene } from "~/features/broadcast-cast/broadcast-cast-types";
import { navigate } from "../../helpers/playwright";

interface BroadcastPageArgs {
	tournamentId: number;
	slug: string;
}

/** `/to/:id/broadcast/:channel/program`, the overlay OBS shows as a browser source. */
export class BroadcastProgramPage {
	private readonly page: Page;
	private readonly pageArgs: BroadcastPageArgs;
	readonly locators;

	constructor(page: Page, pageArgs: BroadcastPageArgs) {
		this.page = page;
		this.pageArgs = pageArgs;
		this.locators = {
			canvas: page.locator("[data-broadcast]"),
		};
	}

	/** Opens the program with the broadcast's program key, the URL OBS is given. */
	async goto(programKey: string) {
		await navigate({
			page: this.page,
			url: broadcastOverlayPage({ ...this.pageArgs, programKey }),
		});
	}

	/** The scene drawn on the canvas. */
	scene(scene: CastScene) {
		return this.locators.canvas.locator(`[data-scene="${scene}"]`);
	}

	/** The status the program page answers with, for whoever the page is logged in as. */
	async responseStatus(programKey: string | null) {
		const response = await this.page.request.get(
			broadcastOverlayPage({ ...this.pageArgs, programKey }),
		);

		return response.status();
	}

	/**
	 * The status the program's state stream answers with when it refuses the connection. Not for a stream that opens,
	 * the request would wait for it to end.
	 */
	async refusedStreamStatus({
		role,
		programKey,
	}: {
		role: BroadcastStreamRole;
		programKey: string | null;
	}) {
		const response = await this.page.request.get(
			broadcastStreamUrl({ ...this.pageArgs, role, programKey }),
		);

		return response.status();
	}
}
