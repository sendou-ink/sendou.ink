import * as React from "react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, describe, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import type { EventsReadyState } from "~/features/events/events-client";
import type { ChatMessageAuthor, ClientChatMessage } from "../chat-types";
import { Chat } from "./Chat";
import styles from "./Message.module.css";

const CONNECTION_STATUS_GRACE_MS = 1_500;

const currentUser = vi.hoisted(() => ({ id: null as number | null }));

vi.mock("~/features/auth/core/user", () => ({
	useUser: () => (currentUser.id === null ? null : { id: currentUser.id }),
}));

// the composer only sends over a live event stream, which the tests have none of
const readyStateStore = vi.hoisted(() => {
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
});

vi.mock("~/features/events/events-hooks", async (importOriginal) => {
	const react = await import("react");

	return {
		...(await importOriginal<
			typeof import("~/features/events/events-hooks")
		>()),
		useEventsReadyState: () =>
			react.useSyncExternalStore(
				readyStateStore.subscribe,
				readyStateStore.get,
			),
	};
});

const setReadyState = (next: EventsReadyState) => readyStateStore.set(next);

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

afterEach(() => {
	setReadyState("CONNECTED");
	currentUser.id = null;
	localStorage.removeItem("chat__cooldowns");
});

const ALICE: ChatMessageAuthor = {
	id: 1,
	username: "Alice",
	discordId: "1",
	discordAvatar: null,
	customUrl: null,
	customAvatarUrl: null,
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

async function renderChatWithControls(initialMessages: ClientChatMessage[]) {
	const controls = {
		addMessage: (_msg: ClientChatMessage) => {},
	};

	function ChatHarness() {
		const [messages, setMessages] = React.useState(initialMessages);
		controls.addMessage = (msg) => setMessages((prev) => [...prev, msg]);

		return (
			<div style={{ width: 400 }}>
				<Chat messages={messages} onSend={() => {}} />
			</div>
		);
	}

	const router = createMemoryRouter([{ path: "/", element: <ChatHarness /> }], {
		initialEntries: ["/"],
	});

	return { screen: await render(<RouterProvider router={router} />), controls };
}

function manyMessages(count: number) {
	return Array.from({ length: count }, (_, i) =>
		createMessage({
			id: i + 1,
			publicId: `publicid-${i + 1}`,
			contents: `Message ${i + 1}`,
		}),
	);
}

function isScrolledToBottom(element: HTMLElement) {
	return element.scrollTop + element.clientHeight >= element.scrollHeight - 2;
}

describe("Chat", () => {
	test("renders messages inside a virtualized log", async () => {
		const screen = await renderChat([
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

		await expect.element(screen.getByRole("log")).toBeInTheDocument();
		await expect.element(screen.getByText("First message")).toBeInTheDocument();
		await expect
			.element(screen.getByText("Second message"))
			.toBeInTheDocument();
		expect(screen.getByTestId("chat-message-row").elements()).toHaveLength(2);
	});

	test("virtualizes a long list into a scrollable region taller than its viewport", async () => {
		const screen = await renderChat(manyMessages(100));

		const log = screen.getByRole("log").element() as HTMLElement;
		await expect.element(screen.getByRole("log")).toBeInTheDocument();

		const scrollContent = log.querySelector(
			":scope > div",
		) as HTMLElement | null;
		const messageRow = log.querySelector(
			"[data-testid=chat-message-row]",
		) as HTMLElement | null;

		expect(scrollContent).not.toBeNull();
		expect(scrollContent!.offsetHeight).toBeGreaterThan(log.clientHeight);
		expect(getComputedStyle(messageRow!).position).toBe("absolute");
	});

	test("renders system messages with the author interpolated", async () => {
		const screen = await renderChat([
			createMessage({
				type: "USER_LEFT",
				contents: null,
				author: { ...ALICE, username: "Bob" },
			}),
		]);

		await expect
			.element(screen.getByText("Bob left the group"))
			.toBeInTheDocument();
	});

	test("renders no composer for a viewer who may only read the room", async () => {
		const screen = await renderChat([createMessage()], { readOnly: true });

		await expect.element(screen.getByText("Read-only")).toBeInTheDocument();
		expect(
			screen.getByPlaceholder("Press enter to send").elements(),
		).toHaveLength(0);
	});

	test("sends the draft on enter and clears the composer", async () => {
		const onSend = vi.fn();
		const screen = await renderChat([createMessage()], { onSend });

		const composer = screen.getByPlaceholder("Press enter to send");
		await composer.fill("hello there");
		await userEvent.keyboard("{Enter}");

		expect(onSend).toHaveBeenCalledWith({
			publicId: expect.any(String),
			contents: "hello there",
		});
		await expect.element(composer).toHaveValue("");
	});

	test("rings the joined composer row while the input or the send button has keyboard focus", async () => {
		const screen = await renderChat([createMessage()]);

		const composer = screen.getByPlaceholder("Press enter to send");
		const row = (composer.element() as HTMLElement).parentElement!;
		const sendButton = screen.getByTestId("chat-submit-button");
		expect(getComputedStyle(row).outlineStyle).toBe("none");

		await composer.fill("hi");
		await vi.waitFor(() => {
			expect(getComputedStyle(row).outlineStyle).toBe("solid");
		});
		expect(getComputedStyle(composer.element()).outlineStyle).toBe("none");

		await userEvent.keyboard("{Tab}");
		await expect.element(sendButton).toHaveFocus();
		expect(getComputedStyle(row).outlineStyle).toBe("solid");
		expect(getComputedStyle(sendButton.element()).boxShadow).not.toBe("none");
	});

	test("shows the character count in the status once close to the limit", async () => {
		const screen = await renderChat([createMessage()]);
		const composer = screen.getByPlaceholder("Press enter to send");

		await composer.fill("a".repeat(150));
		expect(screen.getByRole("status").elements()).toHaveLength(0);

		await composer.fill("a".repeat(170));
		await expect
			.element(screen.getByRole("status"))
			.toHaveTextContent("170/200 characters");
	});

	test("a blank draft is not sent", async () => {
		const onSend = vi.fn();
		const screen = await renderChat([createMessage()], { onSend });

		const composer = screen.getByPlaceholder("Press enter to send");
		await composer.fill("   ");
		await userEvent.keyboard("{Enter}");

		expect(onSend).not.toHaveBeenCalled();
	});

	test("offers retrying a failed send, not one still pending", async () => {
		const onRetry = vi.fn();
		const screen = await renderChat(
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

		const retryButtons = screen.getByRole("button", {
			name: "Not sent, retry",
		});
		await expect.element(retryButtons).toBeInTheDocument();
		expect(retryButtons.elements()).toHaveLength(1);

		await retryButtons.click();
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
			const screen = await renderChat([original], { onSend });

			await screen.getByRole("button", { name: "Reply" }).click();
			await expect
				.element(screen.getByText("Replying to Alice"))
				.toBeInTheDocument();
			await expect
				.element(screen.getByPlaceholder("Press enter to send"))
				.toHaveFocus();

			await userEvent.keyboard("me{Enter}");
			expect(onSend).toHaveBeenCalledWith({
				publicId: expect.any(String),
				contents: "<reply-5> me",
			});
			expect(screen.getByText("Replying to Alice").elements()).toHaveLength(0);
		});

		test("highlights the message being replied to while the reply is held", async () => {
			const screen = await renderChat([original]);
			const isReplyTarget = () =>
				screen
					.getByTestId("chat-message-row")
					.element()
					.firstElementChild?.classList.contains(styles.messageReplyTarget);

			await expect.element(screen.getByText("who is hosting?")).toBeVisible();
			expect(isReplyTarget()).toBe(false);

			await screen.getByRole("button", { name: "Reply" }).click();
			expect(isReplyTarget()).toBe(true);

			await screen.getByRole("button", { name: "Cancel reply" }).click();
			expect(isReplyTarget()).toBe(false);
		});

		test("cancels the reply with its button or escape", async () => {
			const screen = await renderChat([original]);
			const replyingTo = () => screen.getByText("Replying to Alice").elements();

			await screen.getByRole("button", { name: "Reply" }).click();
			await screen.getByRole("button", { name: "Cancel reply" }).click();
			expect(replyingTo()).toHaveLength(0);

			await screen.getByRole("button", { name: "Reply" }).click();
			await userEvent.keyboard("{Escape}");
			expect(replyingTo()).toHaveLength(0);
		});

		test("shows what a reply replies to above it", async () => {
			const screen = await renderChat([
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

			await expect.element(screen.getByText("@Alice")).toBeInTheDocument();
			const [replyAuthorName] = screen
				.getByText("Bob", { exact: true })
				.elements();
			expect(
				screen
					.getByText("@Alice")
					.element()
					.compareDocumentPosition(replyAuthorName) &
					Node.DOCUMENT_POSITION_FOLLOWING,
			).toBeTruthy();
			expect(
				screen.getByText("who is hosting?", { exact: true }).elements(),
			).toHaveLength(2);
			await expect
				.element(screen.getByText("Original message not loaded"))
				.toBeInTheDocument();
		});

		test("highlights a reply to the viewer", async () => {
			currentUser.id = ALICE.id;
			const screen = await renderChat([
				original,
				createMessage({
					id: 6,
					publicId: "reply",
					authorUserId: 2,
					author: BOB,
					contents: "<reply-5> me",
				}),
			]);

			const [originalRow, replyRow] = screen
				.getByTestId("chat-message-row")
				.elements();
			await vi.waitFor(() => {
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

		describe("jumping to the original", () => {
			const history = [
				...manyMessages(60),
				createMessage({
					id: 61,
					publicId: "reply",
					authorUserId: 2,
					author: BOB,
					contents: "<reply-3> answer",
				}),
			];

			const isInView = (row: Element, log: Element) => {
				const rowRect = row.getBoundingClientRect();
				const logRect = log.getBoundingClientRect();
				return rowRect.top >= logRect.top && rowRect.bottom <= logRect.bottom;
			};

			test("clicking a reply reference scrolls to the original and flashes it", async () => {
				const screen = await renderChat(history);
				const log = screen.getByRole("log").element();

				await screen.getByRole("button", { name: /@Alice/ }).click();

				await vi.waitFor(() => {
					const originalMessage = screen
						.getByText("Message 3", { exact: true })
						.element()
						.closest(`.${styles.message}`)!;
					expect(isInView(originalMessage, log)).toBe(true);
					expect(originalMessage.classList.contains(styles.messageFlash)).toBe(
						true,
					);
				});
			});

			test("clicking 'replying to' scrolls back to the message being replied to", async () => {
				const screen = await renderChat(history);
				const log = screen.getByRole("log").element() as HTMLElement;

				await expect.element(screen.getByText("answer")).toBeInTheDocument();
				await screen.getByRole("button", { name: "Reply" }).last().click();
				log.dispatchEvent(new WheelEvent("wheel", { deltaY: -100 }));
				log.scrollTop = 0;
				log.dispatchEvent(new Event("scroll"));
				await expect
					.element(screen.getByText("answer"))
					.not.toBeInTheDocument();

				await screen.getByRole("button", { name: "Replying to Bob" }).click();

				await vi.waitFor(() => {
					const reply = screen.getByText("answer").element();
					expect(isInView(reply, log)).toBe(true);
				});
			});
		});

		test("offers no reply where the viewer can not post", async () => {
			const screen = await renderChat([original], { readOnly: true });

			await expect
				.element(screen.getByText("who is hosting?"))
				.toBeInTheDocument();
			expect(
				screen.getByRole("button", { name: "Reply" }).elements(),
			).toHaveLength(0);
		});
	});

	describe("stickers", () => {
		const renderComposer = async () => {
			const onSend = vi.fn();
			const screen = await renderChat([], { onSend });
			const composer = screen.getByPlaceholder("Press enter to send");
			await composer.click();

			return { screen, composer, onSend };
		};

		test("picks a sticker with +, sends it after the text, then holds the next one back", async () => {
			const { screen, composer, onSend } = await renderComposer();

			await userEvent.keyboard("gg all +bo");
			await expect
				.element(screen.getByRole("option", { name: "Booyah", exact: true }))
				.toBeVisible();
			await userEvent.keyboard("{Enter}");

			await expect.element(composer).toHaveValue("gg all ");
			await expect
				.element(screen.getByText("Booyah", { exact: true }))
				.toBeVisible();

			await userEvent.keyboard("{Enter}");
			expect(onSend).toHaveBeenCalledWith({
				publicId: expect.any(String),
				contents: "gg all <sticker-booyah>",
			});
			expect(
				screen.getByRole("button", { name: "Remove sticker" }).elements(),
			).toHaveLength(0);

			await userEvent.keyboard("+sorry{Enter}");
			await expect
				.element(screen.getByRole("status"))
				.toHaveTextContent(/You can send a sticker again in \d+s/);
			await expect
				.element(screen.getByTestId("chat-submit-button"))
				.toBeDisabled();
		});

		test("picking another sticker replaces the picked one, the remove button drops it", async () => {
			const { screen } = await renderComposer();

			await userEvent.keyboard("+booyah{Enter}");
			await userEvent.keyboard("+stare{Enter}");
			await expect
				.element(screen.getByText("Stare", { exact: true }))
				.toBeVisible();
			expect(
				screen.getByText("Booyah", { exact: true }).elements(),
			).toHaveLength(0);

			await screen.getByRole("button", { name: "Remove sticker" }).click();
			expect(
				screen.getByText("Stare", { exact: true }).elements(),
			).toHaveLength(0);
		});

		test("escape, or backspace in an empty input, removes the picked sticker", async () => {
			const { screen } = await renderComposer();
			const removeButton = () =>
				screen.getByRole("button", { name: "Remove sticker" }).elements();

			await userEvent.keyboard("+booyah{Enter}");
			expect(removeButton()).toHaveLength(1);
			await userEvent.keyboard("{Escape}");
			expect(removeButton()).toHaveLength(0);

			await userEvent.keyboard("+booyah{Enter}a{Backspace}");
			expect(removeButton()).toHaveLength(1);
			await userEvent.keyboard("{Backspace}");
			expect(removeButton()).toHaveLength(0);
		});

		test("scrolls the suggestion moved to with the keyboard into view", async () => {
			const { screen } = await renderComposer();

			await userEvent.keyboard("+");
			const listbox = screen.getByRole("listbox");
			await expect.element(listbox).toBeVisible();
			await userEvent.keyboard("{ArrowUp}");

			const lastOption = screen.getByRole("option").last();
			await expect.element(lastOption).toHaveAttribute("aria-selected", "true");
			await vi.waitFor(() => {
				const popover = listbox
					.element()
					.parentElement!.getBoundingClientRect();
				const option = lastOption.element().getBoundingClientRect();
				expect(option.bottom).toBeLessThanOrEqual(popover.bottom + 1);
				expect(option.top).toBeGreaterThanOrEqual(popover.top - 1);
			});
		});

		test("renders a message's sticker below its text", async () => {
			const screen = await renderChat([
				createMessage({ contents: "gg all <sticker-booyah>" }),
			]);

			const text = screen.getByText("gg all");
			const sticker = screen.getByTestId("chat-message-sticker");
			await expect.element(sticker).toBeInTheDocument();
			expect(sticker.element().querySelector("img")?.alt).toBe("Booyah");
			expect(
				text.element().compareDocumentPosition(sticker.element()) &
					Node.DOCUMENT_POSITION_FOLLOWING,
			).toBeTruthy();
		});
	});

	describe("mentions", () => {
		const BOB = { ...ALICE, id: 2, username: "Bob", discordId: "2" };
		const CAROL = { ...ALICE, id: 3, username: "Carol", discordId: "3" };

		const renderComposer = async () => {
			const onSend = vi.fn();
			const screen = await renderChat([createMessage()], {
				onSend,
				mentionableUsers: [BOB, CAROL],
			});
			const composer = screen.getByPlaceholder("Press enter to send");
			await composer.click();

			return { screen, composer, onSend };
		};

		test("renders mention tokens as the mentioned users' names", async () => {
			const screen = await renderChat(
				[createMessage({ contents: "gg <mention-2> and <mention-99>" })],
				{ mentionableUsers: [BOB] },
			);

			await expect.element(screen.getByText("@Bob")).toBeInTheDocument();
			await expect
				.element(screen.getByText("@unknown user"))
				.toBeInTheDocument();
		});

		test("picks a suggestion with the keyboard and sends it as a token", async () => {
			const { screen, composer, onSend } = await renderComposer();

			await userEvent.keyboard("hi @ca");
			await expect
				.element(screen.getByRole("option", { name: "Carol" }))
				.toBeVisible();
			await userEvent.keyboard("{Enter}");
			await expect.element(composer).toHaveValue("hi @Carol ");

			await userEvent.keyboard("gg{Enter}");
			expect(onSend).toHaveBeenCalledWith({
				publicId: expect.any(String),
				contents: "hi <mention-3> gg",
			});
		});

		test("suggests the room's users and message authors, the arrow keys moving through them", async () => {
			const { screen } = await renderComposer();

			await userEvent.keyboard("@");
			expect(
				screen
					.getByRole("option")
					.elements()
					.map((option) => option.textContent),
			).toEqual(["Bob", "Carol", "Alice"]);

			await userEvent.keyboard("{ArrowDown}");
			await expect
				.element(screen.getByRole("option", { name: "Carol" }))
				.toHaveAttribute("aria-selected", "true");
		});

		test("sends the picked one of two users sharing a name", async () => {
			const otherBob = { ...BOB, id: 5, discordId: "5" };
			const onSend = vi.fn();
			const screen = await renderChat([], {
				onSend,
				mentionableUsers: [BOB, otherBob],
			});
			await screen.getByPlaceholder("Press enter to send").click();

			await userEvent.keyboard("@bo");
			await expect.element(screen.getByRole("listbox")).toBeVisible();
			await userEvent.keyboard("{ArrowDown}{Enter}");
			await userEvent.keyboard("and @bo{Enter}{Enter}");

			expect(onSend).toHaveBeenCalledWith({
				publicId: expect.any(String),
				contents: "<mention-5> and <mention-2>",
			});
		});

		test("holds back mentioning the same user again while on cooldown, telling how long", async () => {
			const dave = { ...ALICE, id: 7, username: "Dave", discordId: "7" };
			const onSend = vi.fn();
			const screen = await renderChat([], {
				onSend,
				mentionableUsers: [dave],
			});
			const composer = screen.getByPlaceholder("Press enter to send");
			await composer.fill("@Dave hi");
			await userEvent.keyboard("{Enter}");
			expect(onSend).toHaveBeenCalledTimes(1);

			await composer.fill("@Dave again");
			await expect
				.element(screen.getByRole("status"))
				.toHaveTextContent(/You can mention Dave again in \d+s/);
			await expect
				.element(screen.getByTestId("chat-submit-button"))
				.toBeDisabled();
			await userEvent.keyboard("{Enter}");
			expect(onSend).toHaveBeenCalledTimes(1);

			await composer.fill("no mention");
			await userEvent.keyboard("{Enter}");
			expect(onSend).toHaveBeenCalledTimes(2);
		});

		test("closes the suggestions on escape", async () => {
			const { screen } = await renderComposer();

			await userEvent.keyboard("@");
			await expect.element(screen.getByRole("listbox")).toBeVisible();

			await userEvent.keyboard("{Escape}");
			expect(screen.getByRole("option").elements()).toHaveLength(0);
		});

		test("picks a suggestion by clicking it", async () => {
			const { screen, composer } = await renderComposer();

			await userEvent.keyboard("@b");
			await screen.getByRole("option", { name: "Bob" }).click();

			await expect.element(composer).toHaveValue("@Bob ");
			await expect.element(composer).toHaveFocus();
		});
	});

	test("renders a splatnet room link with its QR code", async () => {
		const url = "https://s.nintendo.com/av5ja/lobby";
		const screen = await renderChat([
			createMessage({ contents: `join here ${url} thanks` }),
		]);

		const link = screen.getByRole("link", { name: url });
		await expect.element(link).toHaveAttribute("href", url);
		await expect.element(link).toHaveAttribute("target", "_blank");
		await expect.element(link).toHaveAttribute("rel", "noopener noreferrer");
		await expect.element(screen.getByRole("img")).toBeInTheDocument();
		expect(
			screen.getByTestId("chat-message-row").element().textContent,
		).toContain("join here");
	});

	test("renders a deleted account's message with a fallback name", async () => {
		const screen = await renderChat([
			createMessage({ authorUserId: null, author: null, contents: "Ghost" }),
		]);

		await expect.element(screen.getByText("Ghost")).toBeInTheDocument();
		await expect.element(screen.getByText("???")).toBeInTheDocument();
	});

	test("scrolls to the bottom on initial load", async () => {
		const { screen } = await renderChatWithControls(manyMessages(50));

		const log = screen.getByRole("log");
		await expect.element(log).toBeInTheDocument();

		await vi.waitFor(() => {
			const element = log.element() as HTMLElement;
			expect(element.scrollHeight).toBeGreaterThan(element.clientHeight);
			expect(isScrolledToBottom(element)).toBe(true);
		});
	});

	test("auto scrolls when a new message arrives while at the bottom", async () => {
		const { screen, controls } = await renderChatWithControls(manyMessages(50));

		const log = screen.getByRole("log");
		await vi.waitFor(() => {
			expect(isScrolledToBottom(log.element() as HTMLElement)).toBe(true);
		});

		controls.addMessage(
			createMessage({
				id: 51,
				publicId: "publicid-new",
				contents:
					"A brand new message that is long enough to wrap onto multiple lines in the chat window",
			}),
		);

		await expect
			.element(screen.getByText(/A brand new message/))
			.toBeInTheDocument();
		await vi.waitFor(() => {
			expect(isScrolledToBottom(log.element() as HTMLElement)).toBe(true);
		});
	});

	test("does not auto scroll when scrolled up, shows the new messages button instead", async () => {
		const { screen, controls } = await renderChatWithControls(manyMessages(50));

		const log = screen.getByRole("log");
		await vi.waitFor(() => {
			expect(isScrolledToBottom(log.element() as HTMLElement)).toBe(true);
		});

		const element = log.element() as HTMLElement;
		element.dispatchEvent(new WheelEvent("wheel", { deltaY: -100 }));
		element.scrollTop = 0;
		element.dispatchEvent(new Event("scroll"));
		await vi.waitFor(() => {
			expect(element.scrollTop).toBe(0);
		});

		controls.addMessage(
			createMessage({
				id: 51,
				publicId: "publicid-new",
				contents: "While away",
			}),
		);

		await expect.element(screen.getByText("New messages")).toBeInTheDocument();
		expect(isScrolledToBottom(element)).toBe(false);

		await screen.getByText("New messages").click();

		await vi.waitFor(() => {
			expect(isScrolledToBottom(element)).toBe(true);
		});
		await expect
			.element(screen.getByText("New messages"))
			.not.toBeInTheDocument();
	});

	test("opens at the unread divider when the unread messages don't fit on screen", async () => {
		const screen = await renderChat(manyMessages(100), {
			firstUnreadMessageId: 31,
		});

		const divider = screen.getByTestId("chat-unread-divider");
		await expect.element(divider).toBeInTheDocument();

		const log = screen.getByRole("log").element() as HTMLElement;
		await vi.waitFor(() => {
			const dividerTop =
				divider.element().getBoundingClientRect().top -
				log.getBoundingClientRect().top;
			expect(dividerTop).toBeGreaterThanOrEqual(0);
			expect(dividerTop).toBeLessThan(log.clientHeight / 2);
		});
		expect(isScrolledToBottom(log)).toBe(false);
		await expect
			.element(screen.getByText("Message 31", { exact: true }))
			.toBeInTheDocument();
	});

	test("the unread divider sits outside the flow, leaving its row as tall as the message", async () => {
		const screen = await renderChat(manyMessages(3), {
			firstUnreadMessageId: 2,
		});

		const divider = screen.getByTestId("chat-unread-divider");
		await expect.element(divider).toHaveAccessibleName("New messages");
		const row = divider.element().parentElement!;
		expect(
			row.offsetHeight - Number.parseFloat(getComputedStyle(row).paddingTop),
		).toBe((row.lastElementChild as HTMLElement).offsetHeight);
	});

	test("batches a chain of messages from one user, a long pause starting a new batch", async () => {
		const bob: ChatMessageAuthor = { ...ALICE, id: 2, username: "Bob" };
		const screen = await renderChat([
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

		await expect.element(screen.getByText("someone else")).toBeInTheDocument();
		expect(screen.getByText("Alice", { exact: true }).elements()).toHaveLength(
			2,
		);
		expect(screen.getByText("Bob", { exact: true }).elements()).toHaveLength(1);
	});

	test("stays at the end with the divider in view when the unread messages fit on screen", async () => {
		const screen = await renderChat(manyMessages(100), {
			firstUnreadMessageId: 99,
		});

		await expect
			.element(screen.getByTestId("chat-unread-divider"))
			.toBeInTheDocument();
		const log = screen.getByRole("log").element() as HTMLElement;
		await vi.waitFor(() => {
			expect(isScrolledToBottom(log)).toBe(true);
		});
	});

	test("keeps the reading position when a new message arrives while scrolled up", async () => {
		const { screen, controls } = await renderChatWithControls(manyMessages(50));

		const log = screen.getByRole("log");
		await vi.waitFor(() => {
			expect(isScrolledToBottom(log.element() as HTMLElement)).toBe(true);
		});

		const element = log.element() as HTMLElement;
		const readingPosition = Math.floor(element.scrollHeight / 2);
		element.dispatchEvent(new WheelEvent("wheel", { deltaY: -100 }));
		element.scrollTop = readingPosition;
		element.dispatchEvent(new Event("scroll"));

		await new Promise((resolve) => setTimeout(resolve, 300));

		controls.addMessage(
			createMessage({
				id: 51,
				publicId: "publicid-new",
				contents: "While away",
			}),
		);

		await expect.element(screen.getByText("New messages")).toBeInTheDocument();
		await new Promise((resolve) => setTimeout(resolve, 300));
		expect(element.scrollTop).toBe(readingPosition);
	});

	test("says the stream is down only once it has been down for the grace period", async () => {
		const screen = await renderChat([createMessage()]);

		setReadyState("CLOSED");
		await wait(CONNECTION_STATUS_GRACE_MS / 2);
		expect(screen.getByText("Disconnected").elements()).toHaveLength(0);

		await wait(CONNECTION_STATUS_GRACE_MS);
		await expect
			.element(screen.getByRole("status"))
			.toHaveTextContent("Disconnected");
	});

	test("never says the stream is down when it reconnects inside the grace period", async () => {
		const screen = await renderChat([createMessage()]);

		setReadyState("CONNECTING");
		await wait(CONNECTION_STATUS_GRACE_MS / 2);
		expect(screen.getByText("Connecting...").elements()).toHaveLength(0);

		setReadyState("CONNECTED");
		await wait(CONNECTION_STATUS_GRACE_MS * 2);
		expect(screen.getByText("Connecting...").elements()).toHaveLength(0);
		expect(screen.getByText("Disconnected").elements()).toHaveLength(0);
	});
});
