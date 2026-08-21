/**
 * Single dispatch point from a detected event to its card component, shared
 * by the live feed and the VoD feed. Frames are loaded lazily through
 * `getFrame` (IndexedDB keeps them out of the listed records); the Inspect
 * action (open the frame in the screenshot page in a new browser tab, so
 * the running scan is left undisturbed) is derived from it here so pages
 * don't duplicate the wiring.
 */

import clsx from "clsx";
import { SCANNER_PAGE } from "~/utils/urls";
import type { PlayerAbilityMap } from "../core/ability-harvest";
import {
	DEATH_EVENT_TYPE,
	type DeathData,
} from "../core/detectors/death/index";
import {
	MAP_START_EVENT_TYPE,
	type MapStartData,
} from "../core/detectors/map-start/index";
import {
	MINIMAP_EVENT_TYPE,
	type MinimapData,
} from "../core/detectors/minimap/index";
import {
	OBJECTIVE_EVENT_TYPE,
	type ObjectiveData,
} from "../core/detectors/objective/index";
import {
	PLAYER_STATUS_EVENT_TYPE,
	type PlayerStatusData,
} from "../core/detectors/objective/player-status";
import {
	STRIP_WEAPONS_EVENT_TYPE,
	type StripWeaponsData,
} from "../core/detectors/objective/strip-weapons";
import type { ScoreboardData } from "../core/detectors/scoreboard/index";
import {
	SCOREBOARD_OWN_EVENT_TYPE,
	type ScoreboardOwnData,
} from "../core/detectors/scoreboard-own/index";
import { scannerSearchParams } from "../scanner-search-params";
import type { SendStatus } from "../store/events";
import { newInspectKey, putInspectFrame } from "../store/inspect";
import { DeathCard } from "./DeathCard";
import styles from "./EventCard.module.css";
import type { FixtureData } from "./fixture-export";
import { useEventTimeFormatter } from "./format";
import { MapStartCard } from "./MapStartCard";
import { MinimapCard } from "./MinimapCard";
import { ObjectiveCard } from "./ObjectiveCard";
import { PlayerStatusCard } from "./PlayerStatusCard";
import { ScoreboardCard } from "./ScoreboardCard";
import { ScoreboardOwnCard } from "./ScoreboardOwnCard";
import { StripWeaponsCard } from "./StripWeaponsCard";

export type GetFrame = () => Promise<Blob | null | undefined>;

export function EventCard(props: {
	type: string;
	t: number;
	confidence: number;
	data: FixtureData;
	thumbnail?: string;
	detectedAt?: number;
	/** lazy loader for the exact analyzed frame; enables Inspect + fixture export */
	getFrame?: GetFrame;
	/** Scoreboard only: abilities harvested from the match's death events */
	abilities?: PlayerAbilityMap;
	/** sendou.ink /ingest status of this event; absent = never attempted */
	send?: SendStatus;
	/** when set, shows a Send/Retry button that sends this event's match batch */
	onSend?: () => void;
}) {
	const { type, t, confidence, data, thumbnail, detectedAt, getFrame } = props;
	// window.open must run synchronously in the click gesture (popup blockers);
	// the frame write catches up and the new tab polls for it
	const onInspect = getFrame
		? () => {
				const key = newInspectKey();
				window.open(
					scannerSearchParams.href(SCANNER_PAGE, {
						tab: "screenshot",
						inspect: key,
					}),
					"_blank",
				);
				void getFrame().then((frame) => {
					if (frame) void putInspectFrame(key, frame);
				});
			}
		: undefined;
	const shared = { t, confidence, thumbnail, detectedAt, getFrame, onInspect };

	const card = renderCard(type, data, shared, props.abilities);
	if (!props.send && !props.onSend) return card;
	return (
		<div className={styles.sendWrap}>
			{card}
			<SendStrip send={props.send} onSend={props.onSend} />
		</div>
	);
}

/** `unlinked` has no strip styling of its own */
const SEND_STATE_CLASS: Record<SendStatus["state"], string | undefined> = {
	queued: styles.queued,
	sending: styles.sending,
	sent: styles.sent,
	unlinked: undefined,
	failed: styles.failed,
};

const SEND_LABELS: Record<SendStatus["state"], string> = {
	queued: "queued",
	sending: "sending…",
	sent: "sent",
	unlinked: "waiting for report",
	failed: "failed",
};

function SendStrip({
	send,
	onSend,
}: {
	send?: SendStatus;
	onSend?: () => void;
}) {
	const state = send?.state;
	const formatSentAt = useEventTimeFormatter();
	return (
		<div
			className={clsx(styles.sendStrip, state ? SEND_STATE_CLASS[state] : null)}
		>
			<span>
				sendou.ink: {state ? SEND_LABELS[state] : "not sent"}
				{state === "sent" && send ? ` ${formatSentAt(send.at)}` : null}
			</span>
			{send?.error ? (
				<span className={styles.sendError}>{send.error}</span>
			) : null}
			{onSend && state !== "sent" && state !== "sending" ? (
				<button type="button" onClick={onSend}>
					{state === "failed" ? "Retry" : "Send"}
				</button>
			) : null}
		</div>
	);
}

function renderCard(
	type: string,
	data: FixtureData,
	shared: {
		t: number;
		confidence: number;
		thumbnail?: string;
		detectedAt?: number;
		getFrame?: GetFrame;
		onInspect?: () => void;
	},
	abilities?: PlayerAbilityMap,
) {
	return type === DEATH_EVENT_TYPE ? (
		<DeathCard {...shared} data={data as DeathData} />
	) : type === MAP_START_EVENT_TYPE ? (
		<MapStartCard {...shared} data={data as MapStartData} />
	) : type === SCOREBOARD_OWN_EVENT_TYPE ? (
		<ScoreboardOwnCard {...shared} data={data as ScoreboardOwnData} />
	) : type === MINIMAP_EVENT_TYPE ? (
		<MinimapCard {...shared} data={data as MinimapData} />
	) : type === OBJECTIVE_EVENT_TYPE ? (
		<ObjectiveCard {...shared} data={data as ObjectiveData} />
	) : type === PLAYER_STATUS_EVENT_TYPE ? (
		<PlayerStatusCard {...shared} data={data as PlayerStatusData} />
	) : type === STRIP_WEAPONS_EVENT_TYPE ? (
		<StripWeaponsCard {...shared} data={data as StripWeaponsData} />
	) : (
		<ScoreboardCard
			{...shared}
			eventType={type}
			data={data as ScoreboardData}
			abilities={abilities}
		/>
	);
}
