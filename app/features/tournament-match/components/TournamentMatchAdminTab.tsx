import { Ban, Lock, LockOpen, RotateCcw, SquarePen } from "lucide-react";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { Form, useFetcher } from "react-router";
import { ActionButton } from "~/components/ActionButton";
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
import { useUser } from "~/features/auth/core/user";
import { useTournament } from "~/features/tournament/tournament-context";
import type { MatchStatus } from "~/features/tournament-bracket/core/engine";
import { matchSchema } from "~/features/tournament-bracket/tournament-bracket-schemas";
import { useActionSubmit } from "~/hooks/useActionSubmit";
import type { TournamentMatchLoaderData } from "../loaders/to.$id.matches.$mid.server";
import { type MatchPageTeam, useMatch } from "../match-page-context";
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
	const {
		teams: [teamOne, teamTwo],
	} = useMatch();

	const isOrganizer = tournament.isOrganizer(user);
	const canReopen =
		isOrganizer && data.matchIsOver && data.bracketContext.canBeReopened;
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

function AdminCastSection({
	matchId,
	matchStatus,
}: {
	matchId: number;
	matchStatus: MatchStatus;
}) {
	const { t } = useTranslation(["tournament"]);
	const tournament = useTournament();
	const { scoreSum } = useMatch();

	const isMatchStarted = scoreSum > 0;

	const castTwitchAccounts = tournament.ctx.castTwitchAccounts ?? [];
	const castedMatchesInfo = tournament.ctx.castedMatchesInfo;
	const currentlyCastedOn =
		castedMatchesInfo?.castedMatches.find((cm) => cm.matchId === matchId)
			?.twitchAccount ?? null;
	const isLocked =
		castedMatchesInfo?.lockedMatches?.some((lm) => lm.matchId === matchId) ??
		false;

	const canLock = matchStatus === "PENDING" && !isLocked;
	const canUnlock = !isMatchStarted && isLocked;

	return (
		<section className={styles.castSection}>
			<div className={styles.castLabelRow}>
				<Label spaced={false}>{t("tournament:match.admin.cast")}</Label>
				<InfoPopover tiny>{t("tournament:match.admin.castInfo")}</InfoPopover>
			</div>
			{castTwitchAccounts.length === 0 ? (
				<p className={styles.castEmptyHint}>
					{t("tournament:match.admin.castConfigureHint")}
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
	const { t } = useTranslation(["tournament"]);
	const { submit, fetcher } = useActionSubmit(matchSchema);
	const previousStateRef = React.useRef(fetcher.state);

	// the action can still reject (e.g. "Not an organizer or streamer"), so the
	// success toast waits for the round trip; on failure the action's data stays
	// unset and only the error toast shows
	React.useEffect(() => {
		if (
			previousStateRef.current !== "idle" &&
			fetcher.state === "idle" &&
			fetcher.data === null
		) {
			toastQueue.add(
				{
					message: t("tournament:match.admin.castChannelUpdated"),
					variant: "success",
				},
				{ timeout: 5000 },
			);
		}
		previousStateRef.current = fetcher.state;
	}, [fetcher.state, fetcher.data, t]);

	const selectedValue = currentlyCastedOn ?? NOT_CASTED_VALUE;

	const handleChange = (value: string) => {
		if (value === selectedValue) return;
		submit("SET_AS_CASTED", { twitchAccount: value });
	};

	return (
		<SendouChipRadioGroup>
			<SendouChipRadio
				name={`cast-channel-${matchId}`}
				value={NOT_CASTED_VALUE}
				checked={selectedValue === NOT_CASTED_VALUE}
				onChange={handleChange}
			>
				{t("tournament:match.admin.notCasted")}
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
	const { t } = useTranslation(["tournament"]);

	return (
		<div className={styles.lockRow}>
			{isLocked ? (
				<ActionButton
					schema={matchSchema}
					action="UNLOCK"
					size="small"
					icon={<LockOpen size={16} />}
					testId="cast-info-submit-button"
				>
					{t("tournament:match.admin.unlock")}
				</ActionButton>
			) : (
				<ActionButton
					schema={matchSchema}
					action="LOCK"
					fields={{ twitchAccount: twitchAccount ?? "" }}
					size="small"
					icon={<Lock size={16} />}
					isDisabled={!twitchAccount}
					testId="cast-info-submit-button"
				>
					{t("tournament:match.admin.lockToBeCasted")}
				</ActionButton>
			)}
			<InfoPopover>{t("tournament:match.admin.lockingInfo")}</InfoPopover>
		</div>
	);
}

function ReopenMatchButton() {
	const { t } = useTranslation(["tournament"]);

	return (
		<ActionButton
			schema={matchSchema}
			action="REOPEN_MATCH"
			variant="destructive"
			size="small"
			icon={<RotateCcw size={16} />}
			testId="reopen-match-button"
		>
			{t("tournament:match.action.reopenMatch")}
		</ActionButton>
	);
}

function EndSetPopover({ teams }: { teams: [MatchPageTeam, MatchPageTeam] }) {
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
					schema={matchSchema}
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
	teams: [MatchPageTeam, MatchPageTeam];
}) {
	const { t } = useTranslation(["tournament"]);

	const withKo = data.bracketContext.collectsKos;

	return (
		<div className={styles.editSection}>
			<Label>{t("tournament:match.admin.editReportedScores")}</Label>
			<div className={styles.resultList}>
				{data.results.map((result, index) => (
					<EditReportedScoreRow
						key={result.id}
						index={index}
						result={result}
						teams={teams}
						withKo={withKo}
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
	withKo,
}: {
	index: number;
	result: TournamentMatchLoaderData["results"][number];
	teams: [MatchPageTeam, MatchPageTeam];
	withKo: boolean;
}) {
	const { t } = useTranslation(["common", "game-misc", "tournament"]);
	const tournament = useTournament();
	const fetcher = useFetcher();
	const [editing, setEditing] = React.useState(false);

	// close the form once our own submit round trip succeeds (action returns
	// null); on failure the action redirects with an error toast and data stays
	// unset, keeping the form open
	const [previousFetcherState, setPreviousFetcherState] = React.useState(
		fetcher.state,
	);
	if (previousFetcherState !== fetcher.state) {
		setPreviousFetcherState(fetcher.state);
		if (fetcher.state === "idle" && fetcher.data === null && editing) {
			setEditing(false);
		}
	}

	const isKo = Boolean(result.ko);

	if (!editing) {
		return (
			<div className={styles.resultRow}>
				<div>
					<span className={styles.mapIndex}>
						{t("tournament:match.admin.mapNumber", { number: index + 1 })}
					</span>
					<span className={styles.winnerName}>
						{t(`game-misc:MODE_SHORT_${result.mode}`)}{" "}
						{t(`game-misc:STAGE_${result.stageId}`)}
						{isKo ? ` ${t("tournament:match.admin.koSuffix")}` : null}
					</span>
				</div>
				<SendouButton
					icon={<SquarePen />}
					variant="outlined"
					size="small"
					onPress={() => setEditing(true)}
					data-testid={`edit-result-${index}-button`}
				>
					{t("common:actions.edit")}
				</SendouButton>
			</div>
		);
	}

	return (
		<EditReportedScoreForm
			fetcher={fetcher}
			result={result}
			teams={teams}
			withKo={withKo}
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
	withKo,
	minMembersPerTeam,
	onCancel,
	index,
}: {
	fetcher: ReturnType<typeof useFetcher>;
	result: TournamentMatchLoaderData["results"][number];
	teams: [MatchPageTeam, MatchPageTeam];
	withKo: boolean;
	minMembersPerTeam: number;
	onCancel: () => void;
	index: number;
}) {
	const { t } = useTranslation(["common", "q"]);
	const [checkedPlayers, setCheckedPlayers] = React.useState<
		[number[], number[]]
	>(() => {
		return [
			result.participants
				.filter((p) => p.tournamentTeamId === teams[0].id)
				.map((p) => p.userId),
			result.participants
				.filter((p) => p.tournamentTeamId === teams[1].id)
				.map((p) => p.userId),
		];
	});
	const [isKO, setIsKO] = React.useState(Boolean(result.ko));

	const formValid = checkedPlayers.every(
		(team) => team.length === minMembersPerTeam,
	);

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
							{team.members.map((member, memberIdx) => {
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
											data-testid={`edit-result-player-checkbox-${teamIdx === 0 ? "alpha" : "bravo"}-${memberIdx}`}
										/>
										<span>{member.username}</span>
									</label>
								);
							})}
						</div>
					</fieldset>
				))}
			</div>
			<input type="hidden" name="resultId" value={result.id} />
			<input
				type="hidden"
				name="rosters"
				value={JSON.stringify(checkedPlayers)}
			/>
			{withKo ? (
				<>
					<input type="hidden" name="ko" value={String(isKO)} />
					<label className="stack horizontal sm items-center mx-auto">
						<input
							type="checkbox"
							checked={isKO}
							onChange={(e) => setIsKO(e.target.checked)}
						/>
						<span>{t("q:match.action.ko")}</span>
					</label>
				</>
			) : null}
			<div className={styles.buttonRow}>
				<SubmitButton
					size="small"
					state={fetcher.state}
					schema={matchSchema}
					_action="UPDATE_REPORTED_SCORE"
					isDisabled={!formValid}
					testId={`save-result-${index}-button`}
				>
					{t("common:actions.save")}
				</SubmitButton>
				<SendouButton variant="destructive" size="small" onPress={onCancel}>
					{t("common:actions.cancel")}
				</SendouButton>
			</div>
		</fetcher.Form>
	);
}
