import { type BrowserContext, expect } from "@playwright/test";

const AUTHORIZE_PATHNAME = "/oauth2/authorize";

/**
 * Captures the Discord authorize URL from the login POST's redirect and serves a
 * stub page in its place, so the start of the login flow can be asserted without
 * discord.com being reachable. Redirects are followed inside a single request, so
 * routing discord.com directly would never fire; the capture happens on `/auth`.
 */
export class DiscordAuthorizeInterceptor {
	private capturedUrl: URL | null = null;

	async install(context: BrowserContext) {
		await context.route("**/auth", async (route) => {
			if (route.request().method() !== "POST") return route.fallback();

			const response = await route.fetch({ maxRedirects: 0 });
			const location = response.headers().location;
			if (!location?.includes(AUTHORIZE_PATHNAME)) {
				return route.fulfill({ response });
			}

			this.capturedUrl = new URL(location);
			return route.fulfill({
				contentType: "text/html",
				body: "<h1>Discord authorize stub</h1>",
			});
		});
		await context.route(/^https:\/\/discord\.com\//, (route) => route.abort());
	}

	async waitForCapture() {
		await expect.poll(() => this.capturedUrl).not.toBeNull();
	}

	get authorizeUrl() {
		if (!this.capturedUrl) {
			throw new Error("Discord's authorize endpoint was never requested");
		}
		return this.capturedUrl;
	}

	param(name: string) {
		return this.authorizeUrl.searchParams.get(name);
	}
}
