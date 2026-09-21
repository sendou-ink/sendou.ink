import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, describe, expect, test } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-react";
import { GlobalSearch } from "./GlobalSearch";

afterEach(() => {
	const url = new URL(window.location.href);
	if (url.searchParams.has("search")) {
		url.searchParams.delete("search");
		window.history.replaceState(null, "", url);
	}
});

function pushSearchParamOpen() {
	const url = new URL(window.location.href);
	url.searchParams.set("search", "open");
	window.history.pushState(null, "", url);
}

describe("GlobalSearch", () => {
	test("opens from the search param and closes when navigating back pops it", async () => {
		pushSearchParamOpen();

		const router = createMemoryRouter([
			{ path: "*", element: <GlobalSearch /> },
		]);
		await render(<RouterProvider router={router} />);
		await expect.element(page.getByRole("dialog")).toBeVisible();

		window.history.back();

		await expect.element(page.getByRole("dialog")).not.toBeInTheDocument();
	});
});
