import { createMemoryRouter, RouterProvider } from "react-router";
import { describe, expect, test } from "vitest";
import { render } from "vitest-browser-react";
import { Catcher } from "./Catcher";

describe("Catcher", () => {
	test("leaves the URL's search params, e.g. an OBS URL's secret key, out of the error report", async () => {
		const router = createMemoryRouter(
			[
				{
					path: "/broadcast/program",
					loader: () => {
						throw new Error("Loader failed");
					},
					element: null,
					errorElement: <Catcher />,
				},
			],
			{ initialEntries: ["/broadcast/program?key=secret123"] },
		);
		const screen = await render(<RouterProvider router={router} />);

		const report = screen.getByRole("textbox");
		await expect.element(report).toBeVisible();
		const reportText = (report.element() as HTMLTextAreaElement).value;

		expect(reportText).toContain("URL: /broadcast/program\n");
		expect(reportText).not.toContain("secret123");
		expect(document.body.innerHTML).not.toContain("secret123");
	});
});
