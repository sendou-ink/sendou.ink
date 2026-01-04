import { createMemoryRouter, RouterProvider } from "react-router";
import { describe, expect, it } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-react";
import { SECTIONS } from "./routes/components";

const longViewport: (typeof SECTIONS)[number]["id"][] = [
	"buttons",
	"miscellaneous",
];

function renderComponentsShowcase(component: React.ReactNode) {
	const router = createMemoryRouter(
		[
			{
				path: "/",
				element: component,
			},
		],
		{ initialEntries: ["/"] },
	);

	return render(<RouterProvider router={router} />);
}

describe("Components Showcase visual regression", async () => {
	for (const { title, id, component: Component } of SECTIONS) {
		it(`${title} section`, async () => {
			await page.viewport(1000, longViewport.includes(id) ? 2500 : 800);
			const screen = await renderComponentsShowcase(<Component id={id} />);
			await expect.element(screen.baseElement).toMatchScreenshot(title);
		});
	}
});
