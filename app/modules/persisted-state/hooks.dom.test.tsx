import { afterEach, describe, expect, test } from "bun:test";
import { act, render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import * as v from "valibot";
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
		render(<RecentIds />);

		expect(screen.getByTestId("ids")).toHaveTextContent("");
	});

	test("writes persist and update every subscribed component", async () => {
		render(
			<div>
				<RecentIds />
				<RecentIds />
			</div>,
		);

		await userEvent.click(screen.getAllByRole("button", { name: "set" })[0]);

		for (const element of screen.getAllByTestId("ids")) {
			expect(element).toHaveTextContent("7");
		}
		expect(window.localStorage.getItem("test-recent-ids")).toBe("[7]");
	});

	test("updater form reads the current value", async () => {
		window.localStorage.setItem("test-recent-ids", "[1,2,3]");
		render(<RecentIds />);

		await userEvent.click(screen.getByRole("button", { name: "prepend" }));

		expect(screen.getByTestId("ids")).toHaveTextContent("8,1,2");
	});

	test("storage events from other tabs sync the value", () => {
		render(<RecentIds />);

		window.localStorage.setItem("test-recent-ids", "[4,5]");
		act(() => {
			window.dispatchEvent(
				new StorageEvent("storage", { key: "test-recent-ids" }),
			);
		});

		expect(screen.getByTestId("ids")).toHaveTextContent("4,5");
	});
});

describe("usePersistedMapState", () => {
	test("reads all entries under the prefix and syncs entry writes", () => {
		window.localStorage.setItem("test-counts__a", "1");
		render(<CountsMirror />);

		expect(screen.getByTestId("counts")).toHaveTextContent("a=1");

		act(() => {
			PersistedState.writeMapEntry(counts, "b", 2);
		});

		expect(screen.getByTestId("counts")).toHaveTextContent("a=1,b=2");
	});
});

describe("PersistedState.readMap", () => {
	test("sees other tabs' writes without a subscriber", () => {
		// another tab clearing the storage, drops what earlier tests cached
		window.dispatchEvent(new StorageEvent("storage", { key: null }));
		window.localStorage.setItem("test-counts__a", "1");
		expect(PersistedState.readMap(counts)).toEqual({ a: 1 });

		window.localStorage.setItem("test-counts__a", "2");
		window.dispatchEvent(
			new StorageEvent("storage", { key: "test-counts__a" }),
		);

		expect(PersistedState.readMap(counts)).toEqual({ a: 2 });
	});
});
