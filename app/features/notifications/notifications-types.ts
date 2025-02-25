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
			}
	  >
	| NotificationItem<
			"TO_CHECK_IN_OPENED", // xxx: set routine
			{
				tournamentId: number;
				tournamentName: string;
			}
	  > // xxx: also TO_BRACKET_CHECKIN_STARTED
	| NotificationItem<"BADGE_ADDED", { badgeName: string; badgeId: number }>
	| NotificationItem<
			"BADGE_MANAGER_ADDED",
			{ badgeName: string; badgeId: number }
	  >
	| NotificationItem<"PLUS_VOTING_STARTED"> // xxx: set routine
	| NotificationItem<"PLUS_SUGGESTION_ADDED", { tier: number }>
	| NotificationItem<
			"TAGGED_TO_ART",
			{ adderUsername: string; adderDiscordId: string; artId: number }
	  >
	| NotificationItem<"SEASON_STARTED", { seasonNth: number }>; // xxx: set routine

type NotificationItem<
	T extends string,
	M extends Record<string, number | string> | undefined = undefined,
> = M extends undefined
	? { type: T; pictureUrl?: string }
	: { type: T; meta: M; pictureUrl?: string };
