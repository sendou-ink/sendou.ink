export type Notification =
	| NotificationItem<
			"SQ_ADDED_TO_GROUP",
			{
				adderUsername: string;
			}
	  >
	| NotificationItem<
			"SQ_NEW_MATCH",
			{
				matchId: number;
			}
	  >
	| NotificationItem<
			"TO_ADDED_TO_TEAM",
			{
				tournamentId: number;
				tournamentName: string;
				adderUsername: string;
				teamName: string;
				tournamentTeamId: number;
			}
	  >
	| NotificationItem<
			"TO_BRACKET_STARTED",
			{
				tournamentId: number;
				bracketIdx: number;
				bracketName: string;
				tournamentName: string;
				groupId?: number;
			}
	  >
	| NotificationItem<
			"TO_CHECK_IN_OPENED",
			{
				tournamentId: number;
				tournamentName: string;
			}
	  > // xxx: also TO_BRACKET_CHECKIN_STARTED
	| NotificationItem<"BADGE_ADDED", { badgeName: string }>
	| NotificationItem<"PLUS_VOTING_STARTED">
	| NotificationItem<"PLUS_SUGGESTION_ADDED", { tier: number }>
	| NotificationItem<"TAGGED_TO_ART", { adderUsername: string }>
	| NotificationItem<"SEASON_STARTED", { seasonNth: number }>;

type NotificationItem<
	T extends string,
	M extends Record<string, number | string> | undefined = undefined,
> = M extends undefined
	? { type: T; pictureUrl?: string }
	: { type: T; meta: M; pictureUrl?: string };
