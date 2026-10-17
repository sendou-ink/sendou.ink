import { afterEach, describe, expect, test } from "bun:test";
import { act, render, screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import * as React from "react";
import { createBrowserRouter, RouterProvider } from "react-router";
import * as v from "valibot";
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

// biome-ignore lint/nursery/useReactFunctionComponentDefinition: memo() takes a function expression
// biome-ignore lint/suspicious/noShadow: the function expression is named for devtools, it is the same component
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

	await act(async () => {
		render(<RouterProvider router={router} />);
	});

	return router;
}

function currentSearchParams() {
	return new URLSearchParams(window.location.search);
}

afterEach(() => {
	window.history.replaceState(null, "", window.location.pathname);
});

describe("useSearchParamsTyped", () => {
	test("loader: false writes update the URL without running loaders", async () => {
		await renderTestRouter();
		await waitFor(() =>
			expect(screen.getByTestId("view")).toHaveTextContent("list"),
		);
		const initialLoaderCalls = loaderCalls;

		await userEvent.click(screen.getByRole("button", { name: "set view" }));

		await waitFor(() =>
			expect(screen.getByTestId("view")).toHaveTextContent("grid"),
		);
		expect(currentSearchParams().get("view")).toBe("grid");
		expect(loaderCalls).toBe(initialLoaderCalls);
	});

	test("loader: true writes navigate and run loaders", async () => {
		await renderTestRouter();
		await waitFor(() =>
			expect(screen.getByTestId("page")).toHaveTextContent("1"),
		);
		const initialLoaderCalls = loaderCalls;

		await userEvent.click(screen.getByRole("button", { name: "set page" }));

		await waitFor(() =>
			expect(screen.getByTestId("page")).toHaveTextContent("5"),
		);
		expect(currentSearchParams().get("page")).toBe("5");
		await waitFor(() =>
			expect(loaderCalls).toBeGreaterThan(initialLoaderCalls),
		);
	});

	test("a mixed batch carries both changes in one navigation", async () => {
		await renderTestRouter();
		await waitFor(() =>
			expect(screen.getByTestId("page")).toHaveTextContent("1"),
		);

		await userEvent.click(screen.getByRole("button", { name: "mixed batch" }));

		await waitFor(() =>
			expect(screen.getByTestId("page")).toHaveTextContent("2"),
		);
		await waitFor(() =>
			expect(screen.getByTestId("view")).toHaveTextContent("grid"),
		);
		expect(currentSearchParams().get("page")).toBe("2");
		expect(currentSearchParams().get("view")).toBe("grid");
	});

	test("writes merge: params outside the batch are preserved", async () => {
		await renderTestRouter();
		window.history.replaceState(null, "", "?unrelated=yes&page=5");

		await userEvent.click(screen.getByRole("button", { name: "set view" }));

		await waitFor(() =>
			expect(screen.getByTestId("view")).toHaveTextContent("grid"),
		);
		expect(currentSearchParams().get("unrelated")).toBe("yes");
		expect(currentSearchParams().get("page")).toBe("5");
	});

	test("values equal to their default are removed from the URL", async () => {
		const router = await renderTestRouter();
		await act(() => router.navigate("?page=5", { replace: true }));
		await waitFor(() =>
			expect(screen.getByTestId("page")).toHaveTextContent("5"),
		);

		await userEvent.click(screen.getByRole("button", { name: "reset page" }));

		await waitFor(() =>
			expect(screen.getByTestId("page")).toHaveTextContent("1"),
		);
		expect(currentSearchParams().has("page")).toBe(false);
	});

	test("declared resets reset other params on write", async () => {
		const router = await renderTestRouter();
		await act(() => router.navigate("?page=5", { replace: true }));
		await waitFor(() =>
			expect(screen.getByTestId("page")).toHaveTextContent("5"),
		);

		await userEvent.click(screen.getByRole("button", { name: "set filters" }));

		await waitFor(() =>
			expect(screen.getByTestId("q")).toHaveTextContent("hello"),
		);
		await waitFor(() =>
			expect(screen.getByTestId("page")).toHaveTextContent("1"),
		);
		expect(currentSearchParams().has("page")).toBe(false);
	});

	test("external navigation syncs the params", async () => {
		const router = await renderTestRouter();
		await waitFor(() =>
			expect(screen.getByTestId("page")).toHaveTextContent("1"),
		);

		await act(() => router.navigate(`${window.location.pathname}?page=7`));

		await waitFor(() =>
			expect(screen.getByTestId("page")).toHaveTextContent("7"),
		);
	});
});

describe("useSearchParam", () => {
	test("rerenders only when the subscribed param changes", async () => {
		await renderTestRouter();
		await waitFor(() =>
			expect(screen.getByTestId("view-only")).toHaveTextContent("list"),
		);
		const initialViewRenders = viewRenders;

		await userEvent.click(screen.getByRole("button", { name: "set other" }));
		await waitFor(() => expect(currentSearchParams().get("other")).toBe("9"));

		expect(viewRenders).toBe(initialViewRenders);

		await userEvent.click(screen.getByRole("button", { name: "set view" }));
		await waitFor(() =>
			expect(screen.getByTestId("view-only")).toHaveTextContent("grid"),
		);
		expect(viewRenders).toBeGreaterThan(initialViewRenders);
	});
});

describe("navigating to another route", () => {
	test("the leaving route keeps its params until it unmounts", async () => {
		const originalHref = window.location.href;
		const renderedViews: string[] = [];

		function ViewRecorder() {
			const [view] = useSearchParam(definition, "view");
			renderedViews.push(view);

			return <div data-testid="recorded-view">{view}</div>;
		}

		window.history.replaceState(null, "", "/search-params-test-a?view=grid");
		const router = createBrowserRouter([
			{ path: "/search-params-test-a", element: <ViewRecorder /> },
			{
				path: "/search-params-test-b",
				element: <div data-testid="other-route">other</div>,
			},
		]);

		try {
			await act(async () => {
				render(<RouterProvider router={router} />);
			});
			await waitFor(() =>
				expect(screen.getByTestId("recorded-view")).toHaveTextContent("grid"),
			);

			await act(() => router.navigate("/search-params-test-b"));
			await waitFor(() =>
				expect(screen.getByTestId("other-route")).toBeVisible(),
			);

			expect(renderedViews).not.toContain("list");
		} finally {
			window.history.replaceState(null, "", originalHref);
		}
	});
});
