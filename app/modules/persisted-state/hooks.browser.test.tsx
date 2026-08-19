import * as v from "valibot";
import { afterEach, describe, expect, test } from "vitest";
import { render } from "vitest-browser-react";
import { usePersistedMapState, usePersistedState } from "./hooks";
import * as PersistedState from "./persisted-state";

const recentIds = PersistedState.define({
	key: "test-recent-ids",
	storage: "local",
	schema: v.array(v.number()),
	default: [],
});

const counts = PersistedState.defineMap({
	keyPrefix: "test-counts__",
	storage: "local",
	schema: v.number(),
	default: 0,
});

function RecentIds() {
	const [ids, setIds] = usePersistedState(recentIds);

	return (
		<div>
			<div data-testid="ids">{ids.join(",")}</div>
			<button type="button" onClick={() => setIds([7])}>
				set
			</button>
			<button
				type="button"
				onClick={() =>
					setIds((previous) =>
						PersistedState.prependToRecentList(previous, 8, 3),
					)
				}
			>
				prepend
			</button>
		</div>
	);
}

function CountsMirror() {
	const countsByKey = usePersistedMapState(counts);

	return (
		<div data-testid="counts">
			{Object.entries(countsByKey)
				.map(([key, count]) => `${key}=${count}`)
				.sort()
				.join(",")}
		</div>
	);
}

afterEach(() => {
	window.localStorage.clear();
});

describe("usePersistedState", () => {
	test("reads the default when nothing is stored", async () => {
		const screen = await render(<RecentIds />);

		await expect.element(screen.getByTestId("ids")).toHaveTextContent("");
	});

	test("writes persist and update every subscribed component", async () => {
		const screen = await render(
			<div>
				<RecentIds />
				<RecentIds />
			</div>,
		);

		await screen.getByRole("button", { name: "set" }).first().click();

		for (const element of screen.getByTestId("ids").elements()) {
			expect(element).toHaveTextContent("7");
		}
		expect(window.localStorage.getItem("test-recent-ids")).toBe("[7]");
	});

	test("updater form reads the current value", async () => {
		window.localStorage.setItem("test-recent-ids", "[1,2,3]");
		const screen = await render(<RecentIds />);

		await screen.getByRole("button", { name: "prepend" }).click();

		await expect.element(screen.getByTestId("ids")).toHaveTextContent("8,1,2");
	});

	test("storage events from other tabs sync the value", async () => {
		const screen = await render(<RecentIds />);

		window.localStorage.setItem("test-recent-ids", "[4,5]");
		window.dispatchEvent(
			new StorageEvent("storage", { key: "test-recent-ids" }),
		);

		await expect.element(screen.getByTestId("ids")).toHaveTextContent("4,5");
	});
});

describe("usePersistedMapState", () => {
	test("reads all entries under the prefix and syncs entry writes", async () => {
		window.localStorage.setItem("test-counts__a", "1");
		const screen = await render(<CountsMirror />);

		await expect.element(screen.getByTestId("counts")).toHaveTextContent("a=1");

		PersistedState.writeMapEntry(counts, "b", 2);

		await expect
			.element(screen.getByTestId("counts"))
			.toHaveTextContent("a=1,b=2");
	});
});
