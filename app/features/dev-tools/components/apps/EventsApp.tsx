import { Pause, Play, Radio, Send, Trash2 } from "lucide-react";
import * as React from "react";
import { SendouButton } from "~/components/elements/Button";
import { SendouSection } from "~/components/elements/Section";
import { useUser } from "~/features/auth/core/user";
import { eventsClient } from "~/features/events/events-client";
import type { ServerEvent } from "~/features/events/events-types";
import { postDev } from "../../core/dev-api";
import * as EventsRecorder from "../../core/EventsRecorder";
import type { DevApp } from "../../dev-tools-types";
import { DEV_EVENTS_URL } from "../../dev-tools-urls";
import { DevChip, DevDisclosure, DevStatusDot } from "../DevUi";
import { JsonTree } from "../JsonTree";
import styles from "./EventsApp.module.css";

export const eventsDevApp: DevApp = {
	id: "events",
	title: "Live events",
	description: "What the server pushes to this tab over its event stream",
	icon: <Radio />,
	badge: <EventsBadge />,
	size: "md",
	Component: EventsApp,
	install: EventsRecorder.install,
};

const TOPICS_REFRESH_MS = 1000;

const READY_STATE_TONE = {
	CONNECTED: "success",
	CONNECTING: "warning",
	CLOSED: "neutral",
} as const;

function EventsApp() {
	const user = useUser();
	const readyState = React.useSyncExternalStore(
		eventsClient.subscribeToReadyState,
		eventsClient.getReadyState,
		eventsClient.getReadyState,
	);
	const recorded = React.useSyncExternalStore(
		EventsRecorder.subscribe,
		EventsRecorder.getSnapshot,
		EventsRecorder.getSnapshot,
	);
	const topics = useTopics();
	const [frozen, setFrozen] = React.useState<typeof recorded | null>(null);
	const [isPingSent, setIsPingSent] = React.useState(false);

	const entries = frozen ?? recorded;

	const ping = async () => {
		await postDev(DEV_EVENTS_URL);
		setIsPingSent(true);
		window.setTimeout(() => setIsPingSent(false), 2000);
	};

	return (
		<div className="stack md">
			<SendouSection
				title="Connection"
				action={
					<SendouButton
						variant="outlined"
						size="small"
						icon={<Send />}
						isDisabled={!user}
						title={
							user
								? "The server sends a statusChanged event down your user channel"
								: "Log in first, logged out pages have no event stream"
						}
						onClick={ping}
					>
						{isPingSent ? "Sent, watch below" : "Ping me"}
					</SendouButton>
				}
			>
				<div className="stack horizontal sm items-center">
					<DevChip tone={READY_STATE_TONE[readyState]}>
						{readyState.toLowerCase()}
					</DevChip>
					{!user ? (
						<span className="text-xs text-lighter">
							Logged out, so no event stream is opened
						</span>
					) : null}
				</div>
				<div className={styles.topics}>
					<span className="text-xs text-lighter">
						Subscribed topics (your user channel is always on):
					</span>
					{topics.length === 0 ? (
						<span className="text-xs text-lighter">none</span>
					) : (
						topics.map((topic) => <code key={topic}>{topic}</code>)
					)}
				</div>
			</SendouSection>

			<SendouSection
				title="Received"
				action={
					<div className="stack horizontal xs">
						<SendouButton
							variant="outlined"
							size="small"
							icon={frozen ? <Play /> : <Pause />}
							onClick={() => setFrozen(frozen ? null : recorded)}
						>
							{frozen ? "Resume" : "Pause"}
						</SendouButton>
						<SendouButton
							variant="outlined"
							size="small"
							icon={<Trash2 />}
							onClick={() => {
								EventsRecorder.clear();
								setFrozen(null);
							}}
						>
							Clear
						</SendouButton>
					</div>
				}
			>
				<p className="text-xs text-lighter">
					Recorded since the toolbar loaded, newest first
				</p>
				{entries.length === 0 ? (
					<p className="no-results">
						Nothing yet. Ping yourself or act in another tab.
					</p>
				) : null}
				<ol className={styles.list}>
					{entries.map((entry) => (
						<li key={entry.id} className={styles.entry}>
							<span className={styles.time}>{formatTime(entry.at)}</span>
							{entry.type === "connection" ? (
								<span className="text-xs text-lighter italic">
									Connection {entry.state.toLowerCase()}
								</span>
							) : (
								<DevDisclosure
									summary={
										<span className={styles.eventSummary}>
											<DevChip tone="accent">{entry.event.kind}</DevChip>
											<span className="truncate text-xs text-lighter">
												{describeEvent(entry.event)}
											</span>
										</span>
									}
								>
									<JsonTree value={entry.event} openDepth={2} />
								</DevDisclosure>
							)}
						</li>
					))}
				</ol>
			</SendouSection>
		</div>
	);
}

function useTopics() {
	const [topics, setTopics] = React.useState(eventsClient.getTopics);

	// the client has no topic change listener, a cheap poll while the window is open
	React.useEffect(() => {
		const interval = window.setInterval(() => {
			const next = eventsClient.getTopics();
			setTopics((current) => (current.join() === next.join() ? current : next));
		}, TOPICS_REFRESH_MS);
		return () => window.clearInterval(interval);
	}, []);

	return topics;
}

function describeEvent(event: ServerEvent) {
	switch (event.kind) {
		case "chatMessage":
			return `room ${event.roomId}: ${event.message.contents ?? ""}`;
		case "revalidate":
			return event.scope ? JSON.stringify(event.scope) : "whole page";
		case "voicePresence":
			return `room ${event.roomId}, ${event.userIds.length} in call`;
		default:
			return "";
	}
}

function formatTime(at: number) {
	const seconds = (at - performance.timeOrigin) / 1000;

	return `+${seconds.toFixed(1)}s`;
}

function EventsBadge() {
	const user = useUser();
	const readyState = React.useSyncExternalStore(
		eventsClient.subscribeToReadyState,
		eventsClient.getReadyState,
		eventsClient.getReadyState,
	);
	// logged out pages have no event stream to be connected
	if (!user) return null;

	return (
		<DevStatusDot
			tone={READY_STATE_TONE[readyState]}
			title={`Event stream: ${readyState.toLowerCase()}`}
		/>
	);
}
