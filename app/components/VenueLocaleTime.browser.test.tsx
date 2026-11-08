import { createMemoryRouter, RouterProvider } from "react-router";
import { describe, expect, test } from "vitest";
import { render } from "vitest-browser-react";
import { VenueLocaleTime } from "./VenueLocaleTime";

const OPTIONS: Intl.DateTimeFormatOptions = {
	hour: "numeric",
	minute: "numeric",
};
const DATE = new Date("2026-11-21T16:00:00.000Z");

const browserTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
const otherTimeZone =
	browserTimeZone === "Asia/Tokyo" ? "America/Chicago" : "Asia/Tokyo";

function renderTime(venueTimezone: string | null) {
	const router = createMemoryRouter(
		[
			{
				path: "/",
				element: (
					<VenueLocaleTime
						date={DATE}
						options={OPTIONS}
						venueTimezone={venueTimezone}
					/>
				),
			},
		],
		{ initialEntries: ["/"] },
	);

	return render(<RouterProvider router={router} />);
}

function formatted(timeZone?: string) {
	const language =
		navigator.languages.find(
			(lang) => lang.split("-")[0].toLowerCase() === "en",
		) ?? "en";

	return new Intl.DateTimeFormat(language, { ...OPTIONS, timeZone }).format(
		DATE,
	);
}

describe("VenueLocaleTime", () => {
	test("shows venue time first and the viewer's underneath when they differ", async () => {
		const screen = await renderTime(otherTimeZone);

		await expect
			.element(screen.getByText(`${formatted(otherTimeZone)} local`))
			.toBeVisible();
		await expect
			.element(screen.getByText(`${formatted()} your time`))
			.toBeVisible();
	});

	test("leaves the viewer's time out when it reads the same", async () => {
		const screen = await renderTime(browserTimeZone);

		await expect
			.element(screen.getByText(`${formatted()} local`))
			.toBeVisible();
		expect(screen.container.textContent).not.toContain("your time");
	});

	test("shows a plain time for an online event", async () => {
		const screen = await renderTime(null);

		await expect.element(screen.getByText(formatted())).toBeVisible();
		expect(screen.container.textContent).not.toContain("local");
	});
});
