import { renderToString } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { SendouTab, SendouTabList, SendouTabPanel, SendouTabs } from "./Tabs";

describe("SendouTabs", () => {
	test("server renders the first tab's panel without a default selection", () => {
		const html = renderToString(
			<SendouTabs>
				<SendouTabList>
					<SendouTab id="shooter">Shooter</SendouTab>
					<SendouTab id="roller">Roller</SendouTab>
				</SendouTabList>
				<SendouTabPanel id="shooter">Splattershot</SendouTabPanel>
				<SendouTabPanel id="roller">Splat Roller</SendouTabPanel>
			</SendouTabs>,
		);

		expect(html).toContain("Splattershot");
		expect(html).not.toContain("Splat Roller");
		expect(html).toContain('id="tab-shooter"');
		expect(html).toMatch(/id="tab-shooter"[^>]*aria-selected="true"/);
	});

	test("skips a disabled first tab when picking the default", () => {
		const html = renderToString(
			<SendouTabs>
				<SendouTabList>
					<SendouTab id="shooter" isDisabled>
						Shooter
					</SendouTab>
					<SendouTab id="roller">Roller</SendouTab>
				</SendouTabList>
				<SendouTabPanel id="shooter">Splattershot</SendouTabPanel>
				<SendouTabPanel id="roller">Splat Roller</SendouTabPanel>
			</SendouTabs>,
		);

		expect(html).toContain("Splat Roller");
		expect(html).not.toContain("Splattershot");
	});
});
