import type { StreamPlatform } from "~/features/live-streams/live-streams-constants";
import type {
	MainWeaponId,
	ModeShort,
	StageId,
} from "~/modules/in-game-lists/types";
import type {
	BROADCAST_SCENES,
	BROADCAST_STREAM_ROLES,
	BROADCAST_VIEWS,
} from "./broadcast-constants";

export type BroadcastScene = (typeof BROADCAST_SCENES)[number];

export type BroadcastView = (typeof BROADCAST_VIEWS)[number];

export type BroadcastStreamRole = (typeof BROADCAST_STREAM_ROLES)[number];

/** What the producer controls, staged in `next` and put on air as `live` by a Take. */
export interface ProducerState {
	scene: BroadcastScene;
	/** Shows the featured match's second team on the left. */
	swapSides: boolean;
}

export interface BroadcastStoredState {
	/** Incremented by every Take, a Take based on an older one is rejected. */
	takeId: number;
	live: ProducerState;
	next: ProducerState;
	/**
	 * How many of the featured match's reported results are on air, so a result reported before the stream
	 * showed the game doesn't spoil it. Set by a Take or "show now". `null` (or another match) shows all of them.
	 */
	liveResults: LiveResults | null;
}

export interface LiveResults {
	matchId: number;
	count: number;
}

export interface BroadcastSettings {
	/** Injected unlayered after the overlays' own styles. */
	css: string;
}

/** Team and player values the producer edited, shown instead of the tournament's in both live and next. */
export interface BroadcastOverrides {
	/** By tournament team id. */
	teams: Record<number, BroadcastTeamOverride>;
	/** By user id. */
	players: Record<number, BroadcastPlayerOverride>;
}

export interface BroadcastTeamOverride {
	name?: string;
}

export interface BroadcastPlayerOverride {
	name?: string;
	weapons?: MainWeaponId[];
}

/** The cast account a broadcast is for. */
export interface BroadcastChannel {
	platform: StreamPlatform;
	account: string;
	name: string;
	/** URL key of the broadcast, unique per tournament. */
	slug: string;
}

/** Full snapshot pushed to every client of a broadcast's stream. */
export interface BroadcastState extends BroadcastStoredState {
	v: 1;
	settings: BroadcastSettings;
	tournament: {
		name: string;
		logoUrl: string;
	};
	/** The match cast on the channel, or the next one locked for it. */
	match: BroadcastMatch | null;
	health: BroadcastHealth;
}

export type BroadcastStreamMessage =
	| { kind: "state"; state: BroadcastState }
	| { kind: "heartbeat" };

export interface BroadcastHealth {
	/** OBS browser sources showing the overlay. */
	sources: number;
}

export interface BroadcastMatch {
	id: number;
	bracketName: string | null;
	roundName: string | null;
	countType: "BEST_OF" | "PLAY_ALL";
	count: number;
	/** In bracket order: `opponentOne` first. `null` when not decided yet. */
	teams: [BroadcastTeam | null, BroadcastTeam | null];
	/** As on air (`live`) and as reported (`next`, which a Take puts on air). */
	progress: Record<BroadcastView, MatchProgress>;
}

/** How far the set is, counted from its first `resultCount` reported results. */
export interface MatchProgress {
	resultCount: number;
	/** In bracket order. */
	scores: [number, number];
	isOver: boolean;
	/** Game being played or about to be, the last one once the set is over. */
	gameNumber: number;
	/** `null` when not picked yet or the set is over. */
	currentMap: { mode: ModeShort; stageId: StageId } | null;
}

export interface BroadcastTeam {
	id: number;
	name: string;
	logoUrl: string | null;
	seed: number | null;
	players: BroadcastPlayer[];
	/** The producer edited the team's or its players' values. */
	isEdited: boolean;
}

export interface BroadcastPlayer {
	userId: number;
	name: string;
	avatarUrl: string | null;
	isSub: boolean;
	/** Part of the set's active roster. `null` when the team has not picked one. */
	isActive: boolean | null;
	weapons: MainWeaponId[];
}
