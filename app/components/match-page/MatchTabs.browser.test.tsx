import { createBrowserRouter, RouterProvider } from "react-router";
import { afterEach, describe, expect, test } from "vitest";
import { render } from "vitest-browser-react";
import { SendouTabPanel } from "../elements/Tabs";
import { MatchTabs } from "./MatchTabs";

const MOBILE_WIDTH = 375;

function renderMatchTabs({ search = "" }: { search?: string } = {}) {
	window.history.replaceState(null, "", `${window.location.pathname}${search}`);

	const router = createBrowserRouter([
		{
			path: "*",
			element: (
				<div style={{ width: MOBILE_WIDTH }}>
					<MatchTabs tabs={["rosters", "action", "result"]}>
						<SendouTabPanel id="rosters">Rosters panel</SendouTabPanel>
						<SendouTabPanel id="action">Action panel</SendouTabPanel>
						<SendouTabPanel id="result">Result panel</SendouTabPanel>
					</MatchTabs>
				</div>
			),
		},
	]);

	return render(<RouterProvider router={router} />);
}

function pane(name: string) {
	return document.querySelector<HTMLElement>(`[data-pane="${name}"]`)!;
}

function isPaneInView(name: string) {
	const strip = pane(name).parentElement!;
	return (
		Math.abs(
			pane(name).getBoundingClientRect().left -
				strip.getBoundingClientRect().left,
		) < 1
	);
}

afterEach(() => {
	window.history.replaceState(null, "", window.location.pathname);
});

describe("MatchTabs", () => {
	test("swiping to a pane selects its tab and keeps it in the URL", async () => {
		const screen = await renderMatchTabs();

		pane("action").scrollIntoView({ inline: "start", block: "nearest" });

		await expect
			.element(screen.getByRole("tab").nth(1))
			.toHaveAttribute("aria-selected", "true");
		expect(new URLSearchParams(window.location.search).get("tab")).toBe(
			"action",
		);
	});

	test("opens on the pane of the tab in the URL", async () => {
		const screen = await renderMatchTabs({ search: "?tab=result" });

		await expect
			.element(screen.getByRole("tab").nth(2))
			.toHaveAttribute("aria-selected", "true");
		expect(isPaneInView("result")).toBe(true);
	});
});
