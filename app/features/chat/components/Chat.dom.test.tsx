import { afterEach, describe, expect, test, vi } from "bun:test";
import { act, render, screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import * as React from "react";
import { createMemoryRouter, RouterProvider } from "react-router";
import type { EventsReadyState } from "~/features/events/events-client";
import * as RealEventsHooks from "~/features/events/events-hooks";
import type { ChatMessageAuthor, ClientChatMessage } from "../chat-types";
import { Chat } from "./Chat";
import styles from "./Message.module.css";

const CONNECTION_STATUS_GRACE_MS = 1_500;

const currentUser = { id: null as number | null };

vi.mock("~/features/auth/core/user", () => ({
	useUser: () => (currentUser.id === null ? null : { id: currentUser.id }),
}));

// the composer only sends over a live event stream, which the tests have none of
const readyStateStore = (() => {
	let current = "CONNECTED";
	const listeners = new Set<() => void>();

	return {
		get: () => current,
		set: (next: string) => {
			current = next;
			for (const listener of listeners) listener();
		},
		subscribe: (listener: () => void) => {
			listeners.add(listener);
			return () => listeners.delete(listener);
		},
	};
})();

vi.mock("~/features/events/events-hooks", () => ({
	...RealEventsHooks,
	useEventsReadyState: () =>
		React.useSyncExternalStore(readyStateStore.subscribe, readyStateStore.get),
}));

const setReadyState = (next: EventsReadyState) =>
	act(() => readyStateStore.set(next));

const wait = (ms: number) =>
	act(() => new Promise((resolve) => setTimeout(resolve, ms)));

afterEach(() => {
	setReadyState("CONNECTED");
	currentUser.id = null;
	localStorage.removeItem("chat__cooldowns");
});

const ALICE: ChatMessageAuthor = {
	id: 1,
	username: "Alice",
	avatar: null,
	customUrl: null,
	pronouns: null,
	chatNameHue: null,
};

function createMessage(
	overrides: Partial<ClientChatMessage> = {},
): ClientChatMessage {
	return {
		id: 1,
		roomId: 1,
		authorUserId: 1,
		type: null,
		contents: "Hello world",
		publicId: "publicid-1",
		createdAt: 1700000000,
		author: ALICE,
		...overrides,
	};
}

function renderChat(
	messages: ClientChatMessage[],
	props: Partial<React.ComponentProps<typeof Chat>> = {},
) {
	const router = createMemoryRouter(
		[
			{
				path: "/",
				element: (
					<div style={{ width: 400 }}>
						<Chat messages={messages} onSend={() => {}} {...props} />
					</div>
				),
			},
		],
		{ initialEntries: ["/"] },
	);

	return render(<RouterProvider router={router} />);
}

const composerInput = () => screen.getByPlaceholderText("Press enter to send");

async function fillComposer(value: string) {
	const composer = await screen.findByPlaceholderText("Press enter to send");
	await userEvent.clear(composer);
	await userEvent.paste(value);
}

describe("Chat", () => {
	test("renders messages inside a virtualized log", async () => {
		renderChat([
			createMessage({
				id: 1,
				publicId: "publicid-1",
				contents: "First message",
			}),
			createMessage({
				id: 2,
				publicId: "publicid-2",
				contents: "Second message",
			}),
		]);

		expect(await screen.findByRole("log")).toBeInTheDocument();
		expect(await screen.findByText("First message")).toBeInTheDocument();
		expect(screen.getByText("Second message")).toBeInTheDocument();
		expect(screen.getAllByTestId("chat-message-row")).toHaveLength(2);
	});

	test("renders system messages with the author interpolated", async () => {
		renderChat([
			createMessage({
				type: "USER_LEFT",
				contents: null,
				author: { ...ALICE, username: "Bob" },
			}),
		]);

		expect(await screen.findByText("Bob left the group")).toBeInTheDocument();
	});

	test("renders no composer for a viewer who may only read the room", async () => {
		renderChat([createMessage()], { readOnly: true });

		expect(await screen.findByText("Read-only")).toBeInTheDocument();
		expect(
			screen.queryAllByPlaceholderText("Press enter to send"),
		).toHaveLength(0);
	});

	test("sends the draft on enter and clears the composer", async () => {
		const onSend = vi.fn();
		renderChat([createMessage()], { onSend });

		await fillComposer("hello there");
		await userEvent.keyboard("{Enter}");

		expect(onSend).toHaveBeenCalledWith({
			publicId: expect.any(String),
			contents: "hello there",
		});
		await waitFor(() => expect(composerInput()).toHaveValue(""));
	});

	test("shows the character count in the status once close to the limit", async () => {
		renderChat([createMessage()]);

		await fillComposer("a".repeat(150));
		expect(screen.getByRole("status")).toBeEmptyDOMElement();

		await fillComposer("a".repeat(170));
		await waitFor(() =>
			expect(screen.getByRole("status")).toHaveTextContent(
				"170/200 characters",
			),
		);
	});

	test("a blank draft is not sent", async () => {
		const onSend = vi.fn();
		renderChat([createMessage()], { onSend });

		await fillComposer("   ");
		await userEvent.keyboard("{Enter}");

		expect(onSend).not.toHaveBeenCalled();
	});

	test("offers retrying a failed send, not one still pending", async () => {
		const onRetry = vi.fn();
		renderChat(
			[
				createMessage({
					id: 0,
					publicId: "failed1234",
					contents: "Lost",
					pending: true,
					failed: true,
				}),
				createMessage({
					id: 0,
					publicId: "pending123",
					contents: "On its way",
					pending: true,
				}),
			],
			{ onRetry },
		);

		const retryButtons = await screen.findAllByRole("button", {
			name: "Not sent, retry",
		});
		expect(retryButtons).toHaveLength(1);

		await userEvent.click(retryButtons[0]);
		expect(onRetry).toHaveBeenCalledWith("failed1234");
	});

	describe("replies", () => {
		const BOB: ChatMessageAuthor = { ...ALICE, id: 2, username: "Bob" };
		const original = createMessage({
			id: 5,
			publicId: "original",
			contents: "who is hosting?",
		});

		test("replies to a message, sending the reply with its token", async () => {
			const onSend = vi.fn();
			renderChat([original], { onSend });

			await userEvent.click(
				await screen.findByRole("button", { name: "Reply" }),
			);
			expect(await screen.findByText("Replying to Alice")).toBeInTheDocument();
			await waitFor(() => expect(composerInput()).toHaveFocus());

			await userEvent.keyboard("me{Enter}");
			expect(onSend).toHaveBeenCalledWith({
				publicId: expect.any(String),
				contents: "<reply-5> me",
			});
			expect(screen.queryAllByText("Replying to Alice")).toHaveLength(0);
		});

		test("highlights the message being replied to while the reply is held", async () => {
			renderChat([original]);
			const isReplyTarget = () =>
				screen
					.getByTestId("chat-message-row")
					.firstElementChild?.classList.contains(styles.messageReplyTarget);

			expect(await screen.findByText("who is hosting?")).toBeVisible();
			expect(isReplyTarget()).toBe(false);

			await userEvent.click(screen.getByRole("button", { name: "Reply" }));
			expect(isReplyTarget()).toBe(true);

			await userEvent.click(
				screen.getByRole("button", { name: "Cancel reply" }),
			);
			expect(isReplyTarget()).toBe(false);
		});

		test("cancels the reply with its button or escape", async () => {
			renderChat([original]);
			const replyingTo = () => screen.queryAllByText("Replying to Alice");

			await userEvent.click(
				await screen.findByRole("button", { name: "Reply" }),
			);
			await userEvent.click(
				screen.getByRole("button", { name: "Cancel reply" }),
			);
			expect(replyingTo()).toHaveLength(0);

			await userEvent.click(screen.getByRole("button", { name: "Reply" }));
			await userEvent.keyboard("{Escape}");
			expect(replyingTo()).toHaveLength(0);
		});

		test("shows what a reply replies to above it", async () => {
			renderChat([
				original,
				createMessage({
					id: 6,
					publicId: "reply",
					authorUserId: 2,
					author: BOB,
					contents: "<reply-5> me",
				}),
				createMessage({
					id: 7,
					publicId: "lost",
					authorUserId: 2,
					author: BOB,
					contents: "<reply-1> long ago",
				}),
			]);

			const replyMention = await screen.findByText("@Alice");
			const [replyAuthorName] = screen.getAllByText("Bob", { exact: true });
			expect(
				replyMention.compareDocumentPosition(replyAuthorName) &
					Node.DOCUMENT_POSITION_FOLLOWING,
			).toBeTruthy();
			expect(
				screen.getAllByText("who is hosting?", { exact: true }),
			).toHaveLength(2);
			expect(
				screen.getByText("Original message not loaded"),
			).toBeInTheDocument();
		});

		test("highlights a reply to the viewer", async () => {
			currentUser.id = ALICE.id;
			renderChat([
				original,
				createMessage({
					id: 6,
					publicId: "reply",
					authorUserId: 2,
					author: BOB,
					contents: "<reply-5> me",
				}),
			]);

			const [originalRow, replyRow] =
				await screen.findAllByTestId("chat-message-row");
			await waitFor(() => {
				expect(
					replyRow.firstElementChild?.classList.contains(
						styles.messageMentionsYou,
					),
				).toBe(true);
			});
			expect(
				originalRow.firstElementChild?.classList.contains(
					styles.messageMentionsYou,
				),
			).toBe(false);
		});

		test("offers no reply where the viewer can not post", async () => {
			renderChat([original], { readOnly: true });

			expect(await screen.findByText("who is hosting?")).toBeInTheDocument();
			expect(screen.queryAllByRole("button", { name: "Reply" })).toHaveLength(
				0,
			);
		});
	});

	describe("stickers", () => {
		test("renders a message's sticker below its text", async () => {
			renderChat([createMessage({ contents: "gg all <sticker-booyah>" })]);

			const sticker = await screen.findByTestId("chat-message-sticker");
			const text = screen.getByText("gg all");
			expect(sticker.querySelector("img")?.alt).toBe("Booyah");
			expect(
				text.compareDocumentPosition(sticker) &
					Node.DOCUMENT_POSITION_FOLLOWING,
			).toBeTruthy();
		});
	});

	describe("mentions", () => {
		const BOB = { ...ALICE, id: 2, username: "Bob" };

		test("renders mention tokens as the mentioned users' names", async () => {
			renderChat(
				[createMessage({ contents: "gg <mention-2> and <mention-99>" })],
				{ mentionableUsers: [BOB] },
			);

			expect(await screen.findByText("@Bob")).toBeInTheDocument();
			expect(screen.getByText("@unknown user")).toBeInTheDocument();
		});

		test("holds back mentioning the same user again while on cooldown, telling how long", async () => {
			const dave = { ...ALICE, id: 7, username: "Dave" };
			const onSend = vi.fn();
			renderChat([], {
				onSend,
				mentionableUsers: [dave],
			});
			await fillComposer("@Dave hi");
			await userEvent.keyboard("{Enter}");
			expect(onSend).toHaveBeenCalledTimes(1);

			await fillComposer("@Dave again");
			await waitFor(() =>
				expect(screen.getByRole("status")).toHaveTextContent(
					/You can mention Dave again in \d+s/,
				),
			);
			expect(screen.getByTestId("chat-submit-button")).toBeDisabled();
			await userEvent.keyboard("{Enter}");
			expect(onSend).toHaveBeenCalledTimes(1);

			await fillComposer("no mention");
			await userEvent.keyboard("{Enter}");
			expect(onSend).toHaveBeenCalledTimes(2);
		});
	});

	test("renders a splatnet room link with its QR code", async () => {
		const url = "https://s.nintendo.com/av5ja/lobby";
		renderChat([createMessage({ contents: `join here ${url} thanks` })]);

		const link = await screen.findByRole("link", { name: url });
		expect(link).toHaveAttribute("href", url);
		expect(link).toHaveAttribute("target", "_blank");
		expect(link).toHaveAttribute("rel", "noopener noreferrer");
		expect(await screen.findByRole("img")).toBeInTheDocument();
		expect(screen.getByTestId("chat-message-row").textContent).toContain(
			"join here",
		);
	});

	test("renders a deleted account's message with a fallback name", async () => {
		renderChat([
			createMessage({ authorUserId: null, author: null, contents: "Ghost" }),
		]);

		expect(await screen.findByText("Ghost")).toBeInTheDocument();
		expect(screen.getByText("???")).toBeInTheDocument();
	});

	test("the unread divider leaves the batch it lands in whole", async () => {
		renderChat(
			[
				createMessage({ id: 1, publicId: "p1", contents: "read" }),
				createMessage({
					id: 2,
					publicId: "p2",
					contents: "unread",
					createdAt: 1700000060,
				}),
			],
			{ firstUnreadMessageId: 2 },
		);

		expect(await screen.findByText("unread")).toBeInTheDocument();
		expect(screen.getAllByText("Alice", { exact: true })).toHaveLength(1);
	});

	test("batches a chain of messages from one user, a long pause starting a new batch", async () => {
		const bob: ChatMessageAuthor = { ...ALICE, id: 2, username: "Bob" };
		renderChat([
			createMessage({ id: 1, publicId: "p1", contents: "first" }),
			createMessage({
				id: 2,
				publicId: "p2",
				contents: "second",
				createdAt: 1700000060,
			}),
			createMessage({
				id: 3,
				publicId: "p3",
				contents: "after a pause",
				createdAt: 1700000400,
			}),
			createMessage({
				id: 4,
				publicId: "p4",
				authorUserId: 2,
				author: bob,
				contents: "someone else",
				createdAt: 1700000420,
			}),
		]);

		expect(await screen.findByText("someone else")).toBeInTheDocument();
		expect(screen.getAllByText("Alice", { exact: true })).toHaveLength(2);
		expect(screen.getAllByText("Bob", { exact: true })).toHaveLength(1);
	});

	test("says the stream is down only once it has been down for the grace period", async () => {
		renderChat([createMessage()]);
		await screen.findByRole("log");

		setReadyState("CLOSED");
		await wait(CONNECTION_STATUS_GRACE_MS / 2);
		expect(screen.queryAllByText("Disconnected")).toHaveLength(0);

		await wait(CONNECTION_STATUS_GRACE_MS);
		await waitFor(() =>
			expect(screen.getByRole("status")).toHaveTextContent("Disconnected"),
		);
	});

	test("never says the stream is down when it reconnects inside the grace period", async () => {
		renderChat([createMessage()]);
		await screen.findByRole("log");

		setReadyState("CONNECTING");
		await wait(CONNECTION_STATUS_GRACE_MS / 2);
		expect(screen.queryAllByText("Connecting...")).toHaveLength(0);

		setReadyState("CONNECTED");
		await wait(CONNECTION_STATUS_GRACE_MS * 2);
		expect(screen.queryAllByText("Connecting...")).toHaveLength(0);
		expect(screen.queryAllByText("Disconnected")).toHaveLength(0);
	});
});
