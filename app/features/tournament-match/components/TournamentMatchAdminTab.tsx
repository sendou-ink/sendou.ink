import { Ban, Lock, LockOpen, RotateCcw, SquarePen } from "lucide-react";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { Form, useFetcher } from "react-router";
import { SendouButton } from "~/components/elements/Button";
import {
	SendouChipRadio,
	SendouChipRadioGroup,
} from "~/components/elements/ChipRadio";
import { SendouPopover } from "~/components/elements/Popover";
import { SendouTabPanel } from "~/components/elements/Tabs";
import { toastQueue } from "~/components/elements/Toast";
import { InfoPopover } from "~/components/InfoPopover";
import { Label } from "~/components/Label";
import { TAB_KEYS } from "~/components/match-page/MatchTabs";
import { SubmitButton } from "~/components/SubmitButton";
import { TournamentMatchStatus } from "~/db/tables";
import { useUser } from "~/features/auth/core/user";
import { useTournament } from "~/features/tournament/routes/to.$id";
import type { TournamentDataTeam } from "~/features/tournament-bracket/core/Tournament.server";
import type { TournamentMatchLoaderData } from "../loaders/to.$id.matches.$mid.server";
import { OrganizerMatchMapListDialog } from "./OrganizerMatchMapListDialog";
import styles from "./TournamentMatchAdminTab.module.css";

const NOT_CASTED_VALUE = "null";

export function TournamentMatchAdminTab({
	data,
}: {
	data: TournamentMatchLoaderData;
}) {
	const user = useUser();
	const tournament = useTournament();

	const opponentOneId = data.match.opponentOne?.id;
	const opponentTwoId = data.match.opponentTwo?.id;
	const teamOne = opponentOneId
		? tournament.teamById(opponentOneId)
		: undefined;
	const teamTwo = opponentTwoId
		? tournament.teamById(opponentTwoId)
		: undefined;

	const scoreOne = data.match.opponentOne?.score ?? 0;
	const scoreTwo = data.match.opponentTwo?.score ?? 0;
	const matchIsOngoing = scoreOne > 0 || scoreTwo > 0;

	const isOrganizer = tournament.isOrganizer(user);
	const canReopen =
		isOrganizer &&
		data.matchIsOver &&
		tournament.matchCanBeReopened(data.match.id);
	const canEndSet =
		isOrganizer && !data.matchIsOver && data.match.startedAt !== null;

	const topActionsVisible = !!teamOne && !!teamTwo;
	const castSectionVisible = !data.matchIsOver;
	const editScoresVisible =
		isOrganizer && !!teamOne && !!teamTwo && data.results.length > 0;

	return (
		<SendouTabPanel id={TAB_KEYS.ADMIN}>
			<div className={styles.root}>
				{topActionsVisible ? (
					<div className={styles.buttonRow}>
						<OrganizerMatchMapListDialog data={data} />
						{canReopen ? <ReopenMatchButton /> : null}
						{canEndSet ? <EndSetPopover teams={[teamOne!, teamTwo!]} /> : null}
					</div>
				) : null}
				{castSectionVisible ? (
					<AdminCastSection
						matchIsOngoing={matchIsOngoing}
						matchId={data.match.id}
						matchStatus={data.match.status}
					/>
				) : null}
				{editScoresVisible ? (
					<EditReportedScoresSection data={data} teams={[teamOne!, teamTwo!]} />
				) : null}
			</div>
		</SendouTabPanel>
	);
}

const LOCKING_INFO =
	"You can lock the match to indicate that it should not be started before the cast is ready. Match being locked prevents score reporting and hides the map list till the organizer/streamer unlocks it.";
const SET_AS_CASTED_INFO =
	"Select the Twitch account that is currently casting this match. It is then indicated in the bracket view.";

function AdminCastSection({
	matchIsOngoing,
	matchId,
	matchStatus,
}: {
	matchIsOngoing: boolean;
	matchId: number;
	matchStatus: number;
}) {
	const tournament = useTournament();

	const castTwitchAccounts = tournament.ctx.castTwitchAccounts ?? [];
	const castedMatchesInfo = tournament.ctx.castedMatchesInfo;
	const currentlyCastedOn =
		castedMatchesInfo?.castedMatches.find((cm) => cm.matchId === matchId)
			?.twitchAccount ?? null;
	const isLocked =
		castedMatchesInfo?.lockedMatches?.some((lm) => lm.matchId === matchId) ??
		false;

	const canLock =
		(matchStatus === TournamentMatchStatus.Locked ||
			matchStatus === TournamentMatchStatus.Waiting) &&
		!isLocked;
	const canUnlock = !matchIsOngoing && isLocked;

	return (
		<section className={styles.castSection}>
			<div className={styles.castLabelRow}>
				<Label spaced={false}>Cast</Label>
				<InfoPopover tiny>{SET_AS_CASTED_INFO}</InfoPopover>
			</div>
			{castTwitchAccounts.length === 0 ? (
				<p className={styles.castEmptyHint}>
					Configure streaming channels on the tournament admin page to enable
					casting.
				</p>
			) : (
				<>
					<CastChannelChipRadio
						matchId={matchId}
						accounts={castTwitchAccounts}
						currentlyCastedOn={currentlyCastedOn}
					/>
					{canLock || canUnlock ? (
						<LockToggleButton
							isLocked={isLocked}
							twitchAccount={currentlyCastedOn}
						/>
					) : null}
				</>
			)}
		</section>
	);
}

function CastChannelChipRadio({
	matchId,
	accounts,
	currentlyCastedOn,
}: {
	matchId: number;
	accounts: string[];
	currentlyCastedOn: string | null;
}) {
	const fetcher = useFetcher();
	const previousStateRef = React.useRef(fetcher.state);

	React.useEffect(() => {
		if (
			previousStateRef.current !== "idle" &&
			fetcher.state === "idle" &&
			!(fetcher.data as { error?: unknown } | undefined)?.error
		) {
			toastQueue.add(
				{ message: "Cast channel updated", variant: "success" },
				{ timeout: 5000 },
			);
		}
		previousStateRef.current = fetcher.state;
	}, [fetcher.state, fetcher.data]);

	const selectedValue = currentlyCastedOn ?? NOT_CASTED_VALUE;

	const handleChange = (value: string) => {
		if (value === selectedValue) return;
		fetcher.submit(
			{ _action: "SET_AS_CASTED", twitchAccount: value },
			{ method: "post" },
		);
	};

	return (
		<SendouChipRadioGroup>
			<SendouChipRadio
				name={`cast-channel-${matchId}`}
				value={NOT_CASTED_VALUE}
				checked={selectedValue === NOT_CASTED_VALUE}
				onChange={handleChange}
			>
				Not casted
			</SendouChipRadio>
			{accounts.map((account) => (
				<SendouChipRadio
					key={account}
					name={`cast-channel-${matchId}`}
					value={account}
					checked={selectedValue === account}
					onChange={handleChange}
				>
					{account}
				</SendouChipRadio>
			))}
		</SendouChipRadioGroup>
	);
}

function LockToggleButton({
	isLocked,
	twitchAccount,
}: {
	isLocked: boolean;
	twitchAccount: string | null;
}) {
	return (
		<Form method="post" className={styles.lockRow}>
			{isLocked ? (
				<SubmitButton
					_action="UNLOCK"
					size="small"
					icon={<LockOpen size={16} />}
					testId="cast-info-submit-button"
				>
					Unlock
				</SubmitButton>
			) : (
				<>
					<input
						type="hidden"
						name="twitchAccount"
						value={twitchAccount ?? ""}
					/>
					<SubmitButton
						_action="LOCK"
						size="small"
						icon={<Lock size={16} />}
						isDisabled={!twitchAccount}
						testId="cast-info-submit-button"
					>
						Lock to be casted
					</SubmitButton>
				</>
			)}
			<InfoPopover>{LOCKING_INFO}</InfoPopover>
		</Form>
	);
}

function ReopenMatchButton() {
	const { t } = useTranslation(["tournament"]);

	return (
		<Form method="post">
			<SubmitButton
				_action="REOPEN_MATCH"
				variant="destructive"
				size="small"
				icon={<RotateCcw size={16} />}
				testId="reopen-match-button"
			>
				{t("tournament:match.action.reopenMatch")}
			</SubmitButton>
		</Form>
	);
}

function EndSetPopover({
	teams,
}: {
	teams: [TournamentDataTeam, TournamentDataTeam];
}) {
	const { t } = useTranslation(["tournament"]);
	const [selectedWinner, setSelectedWinner] = React.useState<
		number | null | undefined
	>(undefined);

	return (
		<SendouPopover
			placement="top"
			trigger={
				<SendouButton
					size="small"
					variant="destructive"
					icon={<Ban size={16} />}
				>
					{t("tournament:match.action.endSet")}
				</SendouButton>
			}
		>
			<Form method="post" className="stack md">
				<div className="stack sm">
					<Label className="mx-auto">
						{t("tournament:match.endSet.selectWinner")}
					</Label>

					<label className="stack horizontal sm items-center">
						<input
							type="radio"
							name="winnerSelection"
							value="random"
							checked={selectedWinner === null}
							onChange={() => setSelectedWinner(null)}
						/>
						<span>{t("tournament:match.endSet.randomWinner")}</span>
					</label>

					<label className="stack horizontal sm items-center">
						<input
							type="radio"
							name="winnerSelection"
							value={teams[0].id}
							checked={selectedWinner === teams[0].id}
							onChange={() => setSelectedWinner(teams[0].id)}
						/>
						<span>{teams[0].name}</span>
					</label>

					<label className="stack horizontal sm items-center">
						<input
							type="radio"
							name="winnerSelection"
							value={teams[1].id}
							checked={selectedWinner === teams[1].id}
							onChange={() => setSelectedWinner(teams[1].id)}
						/>
						<span>{teams[1].name}</span>
					</label>
				</div>

				<input
					type="hidden"
					name="winnerTeamId"
					value={selectedWinner === null ? "null" : (selectedWinner ?? "")}
				/>

				<SubmitButton
					_action="END_SET"
					testId="end-set-button"
					size="small"
					className="mx-auto"
					isDisabled={selectedWinner === undefined}
				>
					{t("tournament:match.action.confirmEndSet")}
				</SubmitButton>
			</Form>
		</SendouPopover>
	);
}

function EditReportedScoresSection({
	data,
	teams,
}: {
	data: TournamentMatchLoaderData;
	teams: [TournamentDataTeam, TournamentDataTeam];
}) {
	const tournament = useTournament();

	const withPoints = tournament.bracketByIdxOrDefault(
		tournament.matchIdToBracketIdx(data.match.id) ?? 0,
	).collectResultsWithPoints;

	return (
		<div className={styles.editSection}>
			<Label>Edit reported scores</Label>
			<div className={styles.resultList}>
				{data.results.map((result, index) => (
					<EditReportedScoreRow
						key={result.id}
						index={index}
						result={result}
						teams={teams}
						withPoints={withPoints}
					/>
				))}
			</div>
		</div>
	);
}

function EditReportedScoreRow({
	index,
	result,
	teams,
	withPoints,
}: {
	index: number;
	result: TournamentMatchLoaderData["results"][number];
	teams: [TournamentDataTeam, TournamentDataTeam];
	withPoints: boolean;
}) {
	const tournament = useTournament();
	const fetcher = useFetcher();
	const [editing, setEditing] = React.useState(false);

	const winnerName =
		result.winnerTeamId === teams[0].id ? teams[0].name : teams[1].name;
	const pointsText = (() => {
		if (
			result.opponentOnePoints === null ||
			result.opponentTwoPoints === null
		) {
			return "";
		}
		if (result.opponentOnePoints === 100 || result.opponentTwoPoints === 100) {
			return " (KO)";
		}
		return ` (${result.opponentOnePoints}p-${result.opponentTwoPoints}p)`;
	})();

	if (!editing) {
		return (
			<div className={styles.resultRow}>
				<div>
					<span className={styles.mapIndex}>Map {index + 1}</span>
					<span className={styles.winnerName}>
						{winnerName} won{pointsText}
					</span>
				</div>
				<SendouButton
					icon={<SquarePen />}
					variant="outlined"
					size="small"
					onPress={() => setEditing(true)}
					data-testid={`edit-result-${index}-button`}
				>
					Edit
				</SendouButton>
			</div>
		);
	}

	return (
		<EditReportedScoreForm
			fetcher={fetcher}
			result={result}
			teams={teams}
			withPoints={withPoints}
			minMembersPerTeam={tournament.minMembersPerTeam}
			onCancel={() => setEditing(false)}
			index={index}
		/>
	);
}

function EditReportedScoreForm({
	fetcher,
	result,
	teams,
	withPoints,
	minMembersPerTeam,
	onCancel,
	index,
}: {
	fetcher: ReturnType<typeof useFetcher>;
	result: TournamentMatchLoaderData["results"][number];
	teams: [TournamentDataTeam, TournamentDataTeam];
	withPoints: boolean;
	minMembersPerTeam: number;
	onCancel: () => void;
	index: number;
}) {
	const initialRosters = React.useMemo<[number[], number[]]>(() => {
		return [
			result.participants
				.filter((p) => p.tournamentTeamId === teams[0].id)
				.map((p) => p.userId),
			result.participants
				.filter((p) => p.tournamentTeamId === teams[1].id)
				.map((p) => p.userId),
		];
	}, [result, teams]);

	const [checkedPlayers, setCheckedPlayers] =
		React.useState<[number[], number[]]>(initialRosters);
	const [points, setPoints] = React.useState<[number, number]>([
		result.opponentOnePoints ?? 0,
		result.opponentTwoPoints ?? 0,
	]);

	const rosterValid = checkedPlayers.every(
		(team) => team.length === minMembersPerTeam,
	);

	const pointsValid = (() => {
		if (!withPoints) return true;
		if (points[0] === points[1]) return false;
		if (points[0] === 100 && points[1] !== 0) return false;
		if (points[1] === 100 && points[0] !== 0) return false;
		const originalWinnerWasOne =
			(result.opponentOnePoints ?? 0) > (result.opponentTwoPoints ?? 0);
		return originalWinnerWasOne ? points[0] > points[1] : points[1] > points[0];
	})();

	const formValid = rosterValid && pointsValid;

	const togglePlayer = (teamIdx: 0 | 1, userId: number) => {
		setCheckedPlayers((prev) => {
			const next: [number[], number[]] = [prev[0].slice(), prev[1].slice()];
			if (next[teamIdx].includes(userId)) {
				next[teamIdx] = next[teamIdx].filter((id) => id !== userId);
			} else {
				next[teamIdx] = [...next[teamIdx], userId];
			}
			return next;
		});
	};

	return (
		<fetcher.Form method="post" className={styles.resultRowEditing}>
			<div className={styles.rosterColumns}>
				{teams.map((team, teamIdx) => (
					<fieldset key={team.id} className={styles.teamFieldset}>
						<legend>{team.name}</legend>
						<div className="stack sm">
							{team.members.map((member) => {
								const checked = checkedPlayers[teamIdx as 0 | 1].includes(
									member.userId,
								);
								return (
									<label
										key={member.userId}
										className="stack horizontal sm items-center"
									>
										<input
											type="checkbox"
											checked={checked}
											onChange={() =>
												togglePlayer(teamIdx as 0 | 1, member.userId)
											}
										/>
										<span>{member.username}</span>
									</label>
								);
							})}
						</div>
						{withPoints ? (
							<div className="stack xs mt-2">
								<Label>Points</Label>
								<input
									type="number"
									min={0}
									value={points[teamIdx as 0 | 1]}
									onChange={(e) => {
										const value = Number(e.target.value);
										setPoints((prev) => {
											const next: [number, number] = [prev[0], prev[1]];
											next[teamIdx as 0 | 1] = Number.isFinite(value)
												? value
												: 0;
											return next;
										});
									}}
								/>
							</div>
						) : null}
					</fieldset>
				))}
			</div>
			<input type="hidden" name="resultId" value={result.id} />
			<input
				type="hidden"
				name="rosters"
				value={JSON.stringify(checkedPlayers)}
			/>
			{withPoints ? (
				<input type="hidden" name="points" value={JSON.stringify(points)} />
			) : null}
			<div className={styles.buttonRow}>
				<SubmitButton
					size="small"
					state={fetcher.state}
					_action="UPDATE_REPORTED_SCORE"
					isDisabled={!formValid}
					testId={`save-result-${index}-button`}
				>
					Save
				</SubmitButton>
				<SendouButton variant="destructive" size="small" onPress={onCancel}>
					Cancel
				</SendouButton>
			</div>
		</fetcher.Form>
	);
}
