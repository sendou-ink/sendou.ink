import type * as React from "react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { TopNavMenus } from "./TopNavMenus";

const viewportBefore = { width: window.innerWidth, height: window.innerHeight };

// the top nav is the desktop navigation, shown from the tablet breakpoint up
beforeEach(async () => {
	await page.viewport(1280, 720);
});

afterEach(async () => {
	await page.viewport(viewportBefore.width, viewportBefore.height);
});

function withRouter(element: React.ReactElement) {
	const router = createMemoryRouter([{ path: "*", element }], {
		initialEntries: ["/"],
	});
	return <RouterProvider router={router} />;
}

function openPopovers() {
	return [...document.querySelectorAll<HTMLElement>("[popover]:popover-open")];
}

describe("TopNavMenus", () => {
	test("hovering another item while a menu is open moves the open menu there", async () => {
		const screen = await render(withRouter(<TopNavMenus />));

		await screen.getByRole("button", { name: "Play" }).click();
		await vi.waitFor(() => {
			expect(openPopovers()).toHaveLength(1);
			expect(openPopovers()[0].querySelector('a[href="/q"]')).not.toBeNull();
		});

		await userEvent.hover(screen.getByRole("button", { name: "Tools" }));

		await vi.waitFor(() => {
			const open = openPopovers();
			expect(open).toHaveLength(1);
			expect(open[0].querySelector('a[href="/analyzer"]')).not.toBeNull();
		});
	});

	test("hovering an item with no menu open leaves every menu closed", async () => {
		const screen = await render(withRouter(<TopNavMenus />));

		await userEvent.hover(screen.getByRole("button", { name: "Tools" }));
		await new Promise((resolve) => setTimeout(resolve, 100));

		expect(openPopovers()).toHaveLength(0);
	});
});
