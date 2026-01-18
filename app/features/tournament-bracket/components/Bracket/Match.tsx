import clsx from "clsx";
import { differenceInMinutes } from "date-fns";
import * as React from "react";
import { Link } from "react-router";
import { Avatar } from "~/components/Avatar";
import { SendouButton } from "~/components/elements/Button";
import { SendouPopover } from "~/components/elements/Popover";
import { useUser } from "~/features/auth/core/user";
import { TournamentStream } from "~/features/tournament/components/TournamentStream";
import { useTournament } from "~/features/tournament/routes/to.$id";
import { databaseTimestampToDate } from "~/utils/dates";
import type { Unpacked } from "~/utils/types";
import { tournamentMatchPage, tournamentStreamsPage } from "~/utils/urls";
import type { Bracket } from "../../core/Bracket";
import * as Deadline from "../../core/Deadline";
import type { TournamentData } from "../../core/Tournament.server";
import parentStyles from "../../tournament-bracket.module.css";
import { matchEndedEarly } from "../../tournament-bracket-utils";
import styles from "./bracket.module.css";

type LineType = "none" | "straight" | "curve-up" | "curve-down";

interface MatchProps {
	match: Unpacked<TournamentData["data"]["match"]>;
	isPreview?: boolean;
	type?: "winners" | "losers" | "grands" | "groups";
	group?: string;
	roundNumber: number;
	showSimulation: boolean;
	bracket: Bracket;
	hideMatchTimer?: boolean;
	lineType?: LineType;
	lineVerticalExtend?: number;
}

export function Match(props: MatchProps) {
	const isBye = !props.match.opponent1 || !props.match.opponent2;

	if (isBye) {
		return (
			<div className={clsx(styles.matchBye, styles.matchWrapper)}>
				<MatchLine
					lineType={props.lineType}
					verticalExtend={props.lineVerticalExtend}
				/>
			</div>
		);
	}

	return (
		<div className={styles.matchWrapper}>
			<MatchHeader {...props} />
			<MatchContent {...props}>
				<MatchRow {...props} side={1} />
				<div className={styles.matchSeparator} />
				<MatchRow {...props} side={2} />
			</MatchContent>
			{!props.hideMatchTimer ? (
				<MatchTimer match={props.match} bracket={props.bracket} />
			) : null}
			<MatchLine
				lineType={props.lineType}
				verticalExtend={props.lineVerticalExtend}
			/>
		</div>
	);
}

function MatchHeader({ match, type, roundNumber, group }: MatchProps) {
	const tournament = useTournament();
	const streamingParticipants = tournament.streamingParticipantIds ?? [];

	const prefix = () => {
		if (type === "winners") return "WB ";
		if (type === "losers") return "LB ";
		if (type === "grands") return "GF ";
		if (type === "groups") return `${group}`;
		return "";
	};

	const isOver =
		match.opponent1?.result === "win" || match.opponent2?.result === "win";
	const hasStreams = () => {
		if (isOver || !match.opponent1?.id || !match.opponent2?.id) return false;
		if (
			tournament.ctx.castedMatchesInfo?.castedMatches.some(
				(cm) => cm.matchId === match.id,
			)
		) {
			return true;
		}

		const matchParticipants = [match.opponent1.id, match.opponent2.id].flatMap(
			(teamId) =>
				tournament.teamById(teamId)?.members.map((m) => m.userId) ?? [],
		);

		return streamingParticipants.some((p) => matchParticipants.includes(p));
	};
	const toBeCasted =
		!isOver &&
		tournament.ctx.castedMatchesInfo?.lockedMatches?.includes(match.id);

	return (
		<div className={styles.matchHeader}>
			<div className={styles.matchHeaderBox}>
				{prefix()}
				{roundNumber}.{match.number}
			</div>
			{toBeCasted ? (
				<SendouPopover
					trigger={
						<SendouButton
							className={clsx(
								styles.matchHeaderBox,
								styles.matchHeaderBoxButton,
							)}
						>
							🔒 CAST
						</SendouButton>
					}
				>
					Match is scheduled to be casted
				</SendouPopover>
			) : hasStreams() && match.startedAt ? (
				<SendouPopover
					placement="top"
					popoverClassName="w-max"
					trigger={
						<SendouButton
							className={clsx(
								styles.matchHeaderBox,
								styles.matchHeaderBoxButton,
							)}
						>
							🔴 LIVE
						</SendouButton>
					}
				>
					<MatchStreams match={match} />
				</SendouPopover>
			) : null}
		</div>
	);
}

function MatchContent({
	match,
	isPreview,
	children,
}: MatchProps & { children: React.ReactNode }) {
	const tournament = useTournament();

	if (!isPreview) {
		return (
			<Link
				className={styles.match}
				to={tournamentMatchPage({
					tournamentId: tournament.ctx.id,
					matchId: match.id,
				})}
				data-match-id={match.id}
			>
				{children}
			</Link>
		);
	}

	return <div className={styles.match}>{children}</div>;
}

function MatchRow({
	match,
	side,
	isPreview,
	showSimulation,
	bracket,
}: MatchProps & { side: 1 | 2 }) {
	const user = useUser();
	const tournament = useTournament();

	const opponentKey = `opponent${side}` as const;
	const opponent = match[`opponent${side}`];

	const score = () => {
		if (!match.opponent1?.id || !match.opponent2?.id || isPreview) return null;

		const opponentScore = opponent!.score;
		const opponentResult = opponent!.result;

		// Display W/L as the score might not reflect the winner set in the early ending
		const round = bracket.data.round.find((r) => r.id === match.round_id);
		if (
			round?.maps &&
			matchEndedEarly({
				opponentOne: match.opponent1,
				opponentTwo: match.opponent2,
				count: round.maps.count,
				countType: round.maps.type,
			})
		) {
			if (opponentResult === "win") return "W";
			if (opponentResult === "loss") return "L";
		}

		return opponentScore ?? 0;
	};

	const isLoser = opponent?.result === "loss";

	const { team, simulated } = (() => {
		if (opponent?.id) {
			return { team: tournament.teamById(opponent.id), simulated: false };
		}

		const simulated = showSimulation
			? bracket.simulatedMatch(match.id)
			: undefined;
		const simulatedOpponent = simulated?.[opponentKey];

		return simulatedOpponent?.id
			? { team: tournament.teamById(simulatedOpponent.id), simulated: true }
			: { team: null, simulated: true };
	})();

	const ownTeam = tournament.teamMemberOfByUser(user);

	const logoSrc = team ? tournament.tournamentTeamLogoSrc(team) : null;
	const showAvatar = !simulated && team;

	const isBigSeedNumber = team?.seed && team.seed > 99;

	return (
		<div
			className={clsx("stack horizontal", { "text-lighter": isLoser })}
			data-participant-id={team?.id}
			title={team?.members.map((m) => m.username).join(", ")}
		>
			<div
				className={clsx(styles.matchSeed, {
					"text-lighter-important italic opaque": simulated,
					[styles.matchSeedWide]: isBigSeedNumber,
				})}
			>
				{team?.seed}
			</div>
			{showAvatar ? (
				<Avatar
					size="xxxs"
					url={logoSrc}
					identiconInput={team.name}
					className="mr-1"
				/>
			) : null}
			<div
				className={clsx(styles.matchTeamName, {
					"text-theme-secondary":
						!simulated && ownTeam && ownTeam?.id === team?.id,
					"text-lighter italic opaque": simulated,
					[styles.matchTeamNameNarrow]:
						// either but not both
						(showAvatar || isBigSeedNumber) && !(showAvatar && isBigSeedNumber),
					// both
					[styles.matchTeamNameNarrowest]: showAvatar && isBigSeedNumber,
					invisible: !team,
				})}
			>
				{team?.name ?? "???"}
			</div>{" "}
			<div className={styles.matchScore}>{score()}</div>
		</div>
	);
}

function MatchStreams({ match }: Pick<MatchProps, "match">) {
	const tournament = useTournament();

	if (!match.opponent1?.id || !match.opponent2?.id) {
		return null;
	}

	const castingAccount = tournament.ctx.castedMatchesInfo?.castedMatches.find(
		(cm) => cm.matchId === match.id,
	)?.twitchAccount;

	const matchParticipants = [match.opponent1.id, match.opponent2.id].flatMap(
		(teamId) => tournament.teamById(teamId)?.members.map((m) => m.userId) ?? [],
	);

	const streamsOfThisMatch = tournament.streams.filter(
		(stream) =>
			(stream.userId && matchParticipants.includes(stream.userId)) ||
			stream.twitchUserName === castingAccount,
	);

	if (streamsOfThisMatch.length === 0) {
		return (
			<div className={parentStyles.streamPopover}>
				After all there seems to be no streams of this match. Check the{" "}
				<Link to={tournamentStreamsPage(tournament.ctx.id)}>streams page</Link>{" "}
				for all the available streams.
			</div>
		);
	}

	return (
		<div
			className={clsx("stack md justify-center", parentStyles.streamPopover)}
			data-testid="stream-popover"
		>
			{streamsOfThisMatch.map((stream) => (
				<TournamentStream
					key={stream.twitchUserName}
					stream={stream}
					withThumbnail={false}
				/>
			))}
		</div>
	);
}

function MatchTimer({ match, bracket }: Pick<MatchProps, "match" | "bracket">) {
	const [now, setNow] = React.useState(new Date());
	const tournament = useTournament();

	React.useEffect(() => {
		const interval = setInterval(() => {
			setNow(new Date());
		}, 60000);

		return () => clearInterval(interval);
	}, []);

	if (!match.startedAt) return null;

	const isOver =
		match.opponent1?.result === "win" || match.opponent2?.result === "win";

	if (isOver) return null;

	const isLocked = tournament.ctx.castedMatchesInfo?.lockedMatches?.includes(
		match.id,
	);
	if (isLocked) return null;

	const round = bracket.data.round.find((r) => r.id === match.round_id);
	const bestOf = round?.maps?.count;

	if (!bestOf) return null;

	const elapsedMinutes = differenceInMinutes(
		now,
		databaseTimestampToDate(match.startedAt),
	);
	const status = Deadline.matchStatus({
		elapsedMinutes,
		gamesCompleted:
			(match.opponent1?.score ?? 0) + (match.opponent2?.score ?? 0),
		maxGamesCount: bestOf,
	});

	const displayText = elapsedMinutes >= 60 ? "1h+" : `${elapsedMinutes}m`;

	const statusColor =
		status === "error"
			? "var(--color-error)"
			: status === "warning"
				? "var(--color-warning)"
				: "var(--color-text)";

	return (
		<div className={styles.matchTimer}>
			<div className={styles.matchHeaderBox} style={{ color: statusColor }}>
				{displayText}
			</div>
		</div>
	);
}

interface MatchLineProps {
	lineType?: LineType;
	verticalExtend?: number;
}

function MatchLine({ lineType, verticalExtend }: MatchLineProps) {
	if (!lineType || lineType === "none") return null;

	const lineClass =
		lineType === "straight"
			? styles.matchLineStraight
			: lineType === "curve-up"
				? styles.matchLineCurveUp
				: styles.matchLineCurveDown;

	const style = verticalExtend
		? ({
				"--bracket-vertical-extend": `${verticalExtend}px`,
			} as React.CSSProperties)
		: undefined;

	return (
		<div className={clsx(styles.matchLineContainer, lineClass)} style={style}>
			{lineType === "curve-down" ? (
				<div className={styles.matchLineConnectorDown} style={style} />
			) : null}
			{lineType === "curve-up" ? (
				<div className={styles.matchLineConnectorUp} style={style} />
			) : null}
		</div>
	);
}
