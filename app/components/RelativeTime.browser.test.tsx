import { createMemoryRouter, RouterProvider } from "react-router";
import { describe, expect, test } from "vitest";
import { render } from "vitest-browser-react";
import { RelativeTime } from "./RelativeTime";

const FORMAT_OPTIONS: Intl.DateTimeFormatOptions = {
	hour: "numeric",
	minute: "numeric",
	day: "numeric",
	month: "numeric",
	timeZoneName: "short",
};

function renderRelativeTime(timestamp: number) {
	const router = createMemoryRouter(
		[
			{
				path: "/",
				element: <RelativeTime timestamp={timestamp}>3 days ago</RelativeTime>,
			},
		],
		{ initialEntries: ["/"] },
	);

	return render(<RouterProvider router={router} />);
}

function expectedTitle(timestamp: number) {
	const language =
		navigator.languages.find(
			(lang) => lang.split("-")[0].toLowerCase() === "en",
		) ?? "en";

	return new Intl.DateTimeFormat(language, FORMAT_OPTIONS).format(timestamp);
}

describe("RelativeTime", () => {
	test("tooltip shows the date the millisecond timestamp points to", async () => {
		const timestamp = new Date("2025-08-02T12:00:00Z").getTime();

		const screen = await renderRelativeTime(timestamp);

		const abbr = screen.getByText("3 days ago");
		await expect.element(abbr).toBeVisible();

		expect(abbr.element().getAttribute("title")).toBe(expectedTitle(timestamp));
	});
});
