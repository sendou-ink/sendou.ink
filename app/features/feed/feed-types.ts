import type { TierName } from "~/features/mmr/mmr-constants";

type FeedPlaySource = "SQ" | "TOURNAMENT";

export interface FeedTier {
	name: TierName;
	isPlus: boolean;
}

/** Payload of each `FeedEvent` type, see `FeedEvents.derive` for when one is emitted */
export interface FeedEventDataByType {
	COMEBACK: {
		source: FeedPlaySource;
		tournamentId: number | null;
		previousAt: number;
		/** Sets and tournaments played since coming back, this one included */
		setCount: number;
		tournamentCount: number;
	};
	FIRST_TIME: {
		source: FeedPlaySource;
		tournamentId: number | null;
		placement: number | null;
		participantCount: number | null;
		/** SendouQ sets played since, this one included */
		setCount: number;
	};
	SQ_MILESTONE: { milestone: number; since: number };
	/** Win streak the user is on, only ever one per user */
	SQ_STREAK: { streak: number };
	SQ_PROMOTION: {
		matchId: number;
		season: number;
		from: FeedTier;
		to: FeedTier;
	};
	SQ_UPSET: { matchId: number };
	/** Most played opponent of the season where neither side has a clear lead, only ever one per user and season */
	SQ_RIVALRY: {
		season: number;
		otherUserId: number;
		setWins: number;
		setLosses: number;
		mapWins: number;
		mapLosses: number;
	};
	TO_RESULT: {
		tournamentId: number;
		tournamentTeamId: number;
		placement: number;
		participantCount: number;
		setWins: number;
		setLosses: number;
		name: string;
		organizationId: number | null;
	};
}

export type FeedEventType = keyof FeedEventDataByType;

export type FeedEventData = FeedEventDataByType[FeedEventType];
