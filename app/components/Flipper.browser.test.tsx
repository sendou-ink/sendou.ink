import { describe, expect, test } from "vitest";
import { render } from "vitest-browser-react";
import { Flipper } from "./Flipper";

function List({ ids }: { ids: string[] }) {
	return (
		<Flipper flipKey={ids.join()}>
			{ids.map((id) => (
				<div key={id} data-flip-id={id} style={{ height: 40 }}>
					{id}
				</div>
			))}
		</Flipper>
	);
}

function itemById(id: string) {
	return document.querySelector<HTMLElement>(`[data-flip-id="${id}"]`)!;
}

function startingKeyframe(element: HTMLElement) {
	const [animation] = element.getAnimations();
	return (animation?.effect as KeyframeEffect | undefined)?.getKeyframes()[0];
}

describe("Flipper", () => {
	test("slides a moved item from its old position", async () => {
		const screen = await render(<List ids={["a", "b"]} />);

		await screen.rerender(<List ids={["b", "a"]} />);

		expect(startingKeyframe(itemById("a"))?.translate).toBe("0px -40px");
		expect(startingKeyframe(itemById("b"))?.translate).toBe("0px 40px");
	});

	test("restarts an interrupted slide from where the item visually is", async () => {
		const screen = await render(<List ids={["a", "b", "c"]} />);

		await screen.rerender(<List ids={["c", "a", "b"]} />);
		for (const animation of document.getAnimations()) {
			animation.pause();
			animation.currentTime = 0;
		}

		await screen.rerender(<List ids={["b", "c", "a"]} />);

		expect(itemById("a").getAnimations()).toHaveLength(1);
		expect(startingKeyframe(itemById("a"))?.translate).toBe("0px -80px");
	});

	test("fades in an added item", async () => {
		const screen = await render(<List ids={["a"]} />);

		await screen.rerender(<List ids={["a", "b"]} />);

		expect(startingKeyframe(itemById("b"))?.opacity).toBe("0");
		expect(itemById("a").getAnimations()).toHaveLength(0);
	});

	test("keeps a removed item in place as an inert ghost until it has faded out", async () => {
		const screen = await render(<List ids={["a", "b"]} />);

		await screen.rerender(<List ids={["a"]} />);

		const ghost = screen.getByText("b").element() as HTMLElement;
		expect(ghost.inert).toBe(true);
		expect(ghost.getAttribute("aria-hidden")).toBe("true");
		expect(ghost.getBoundingClientRect().top).toBe(
			itemById("a").getBoundingClientRect().bottom,
		);

		await Promise.all(ghost.getAnimations().map((a) => a.finished));
		await expect.poll(() => ghost.isConnected).toBe(false);
	});

	test("does not animate when the flip key is unchanged", async () => {
		const screen = await render(
			<Flipper flipKey="same">
				<div data-flip-id="a">a</div>
			</Flipper>,
		);

		await screen.rerender(
			<Flipper flipKey="same">
				<div data-flip-id="b">b</div>
				<div data-flip-id="a">a</div>
			</Flipper>,
		);

		expect(itemById("a").getAnimations()).toHaveLength(0);
		expect(itemById("b").getAnimations()).toHaveLength(0);
	});
});
