import * as React from "react";
import { createBrowserRouter, RouterProvider } from "react-router";
import * as v from "valibot";
import { afterEach, describe, expect, test } from "vitest";
import { render } from "vitest-browser-react";
import { useSearchParam, useSearchParamsTyped } from "./hooks";
import * as SearchParams from "./search-params";
import { SP } from "./search-params";

const definition = SearchParams.define({
	page: SP.param(v.pipe(v.number(), v.integer(), v.minValue(1)), {
		default: 1,
		loader: true,
	}),
	filters: SP.json(v.object({ q: v.string() }), {
		default: { q: "" },
		loader: true,
		resets: ["page"],
	}),
	view: SP.param(v.picklist(["list", "grid"]), {
		default: "list",
		loader: false,
	}),
	other: SP.param(v.number(), { default: 0, loader: false }),
});

let loaderCalls = 0;
let viewRenders = 0;

function TestComponent() {
	const [params, setParams] = useSearchParamsTyped(definition);

	return (
		<div>
			<div data-testid="page">{params.page}</div>
			<div data-testid="view">{params.view}</div>
			<div data-testid="q">{params.filters.q}</div>
			<button type="button" onClick={() => setParams({ view: "grid" })}>
				set view
			</button>
			<button type="button" onClick={() => setParams({ page: 5 })}>
				set page
			</button>
			<button type="button" onClick={() => setParams({ page: 1 })}>
				reset page
			</button>
			<button
				type="button"
				onClick={() => setParams({ filters: { q: "hello" } })}
			>
				set filters
			</button>
			<button
				type="button"
				onClick={() => setParams({ view: "grid", page: 2 })}
			>
				mixed batch
			</button>
			<button type="button" onClick={() => setParams({ other: 9 })}>
				set other
			</button>
			<ViewOnly />
		</div>
	);
}

const ViewOnly = React.memo(function ViewOnly() {
	const [view] = useSearchParam(definition, "view");
	viewRenders++;

	return <div data-testid="view-only">{view}</div>;
});

async function renderTestRouter() {
	loaderCalls = 0;
	viewRenders = 0;

	const router = createBrowserRouter([
		{
			path: "*",
			loader: () => {
				loaderCalls++;
				return null;
			},
			element: <TestComponent />,
		},
	]);

	return { screen: await render(<RouterProvider router={router} />), router };
}

function currentSearchParams() {
	return new URLSearchParams(window.location.search);
}

afterEach(() => {
	window.history.replaceState(null, "", window.location.pathname);
});

describe("useSearchParamsTyped", () => {
	test("loader: false writes update the URL without running loaders", async () => {
		const { screen } = await renderTestRouter();
		await expect.element(screen.getByTestId("view")).toHaveTextContent("list");
		const initialLoaderCalls = loaderCalls;

		await screen.getByRole("button", { name: "set view" }).click();

		await expect.element(screen.getByTestId("view")).toHaveTextContent("grid");
		expect(currentSearchParams().get("view")).toBe("grid");
		expect(loaderCalls).toBe(initialLoaderCalls);
	});

	test("loader: true writes navigate and run loaders", async () => {
		const { screen } = await renderTestRouter();
		await expect.element(screen.getByTestId("page")).toHaveTextContent("1");
		const initialLoaderCalls = loaderCalls;

		await screen.getByRole("button", { name: "set page", exact: true }).click();

		await expect.element(screen.getByTestId("page")).toHaveTextContent("5");
		expect(currentSearchParams().get("page")).toBe("5");
		await expect.poll(() => loaderCalls).toBeGreaterThan(initialLoaderCalls);
	});

	test("a mixed batch carries both changes in one navigation", async () => {
		const { screen } = await renderTestRouter();
		await expect.element(screen.getByTestId("page")).toHaveTextContent("1");

		await screen.getByRole("button", { name: "mixed batch" }).click();

		await expect.element(screen.getByTestId("page")).toHaveTextContent("2");
		await expect.element(screen.getByTestId("view")).toHaveTextContent("grid");
		expect(currentSearchParams().get("page")).toBe("2");
		expect(currentSearchParams().get("view")).toBe("grid");
	});

	test("writes merge: params outside the batch are preserved", async () => {
		const { screen } = await renderTestRouter();
		window.history.replaceState(null, "", "?unrelated=yes&page=5");

		await screen.getByRole("button", { name: "set view" }).click();

		await expect.element(screen.getByTestId("view")).toHaveTextContent("grid");
		expect(currentSearchParams().get("unrelated")).toBe("yes");
		expect(currentSearchParams().get("page")).toBe("5");
	});

	test("values equal to their default are removed from the URL", async () => {
		const { screen } = await renderTestRouter();
		window.history.replaceState(null, "", "?page=5");
		await expect.element(screen.getByTestId("page")).toHaveTextContent("5");

		await screen.getByRole("button", { name: "reset page" }).click();

		await expect.element(screen.getByTestId("page")).toHaveTextContent("1");
		expect(currentSearchParams().has("page")).toBe(false);
	});

	test("declared resets reset other params on write", async () => {
		const { screen } = await renderTestRouter();
		window.history.replaceState(null, "", "?page=5");
		await expect.element(screen.getByTestId("page")).toHaveTextContent("5");

		await screen.getByRole("button", { name: "set filters" }).click();

		await expect.element(screen.getByTestId("q")).toHaveTextContent("hello");
		await expect.element(screen.getByTestId("page")).toHaveTextContent("1");
		expect(currentSearchParams().has("page")).toBe(false);
	});

	test("external navigation syncs the params", async () => {
		const { screen, router } = await renderTestRouter();
		await expect.element(screen.getByTestId("page")).toHaveTextContent("1");

		await router.navigate(`${window.location.pathname}?page=7`);

		await expect.element(screen.getByTestId("page")).toHaveTextContent("7");
	});
});

describe("useSearchParam", () => {
	test("rerenders only when the subscribed param changes", async () => {
		const { screen } = await renderTestRouter();
		await expect
			.element(screen.getByTestId("view-only"))
			.toHaveTextContent("list");
		const initialViewRenders = viewRenders;

		await screen.getByRole("button", { name: "set other" }).click();
		await expect.poll(() => currentSearchParams().get("other")).toBe("9");

		expect(viewRenders).toBe(initialViewRenders);

		await screen.getByRole("button", { name: "set view" }).click();
		await expect
			.element(screen.getByTestId("view-only"))
			.toHaveTextContent("grid");
		expect(viewRenders).toBeGreaterThan(initialViewRenders);
	});
});
