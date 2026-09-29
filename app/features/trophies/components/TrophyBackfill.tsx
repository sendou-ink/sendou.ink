import * as React from "react";
import { useTranslation } from "react-i18next";
import { useFetcher } from "react-router";
import { ActionButton } from "~/components/ActionButton";
import { Alert } from "~/components/Alert";
import { Avatar } from "~/components/Avatar";
import { SendouButton } from "~/components/elements/Button";
import { SendouSelect, SendouSelectItem } from "~/components/elements/Select";
import { SendouSwitch } from "~/components/elements/Switch";
import { FormMessage } from "~/components/FormMessage";
import { LocaleTime } from "~/components/LocaleTime";
import { ParticipationPill } from "~/features/user-page/components/ParticipationPill";
import { trophyBackfillPage } from "~/utils/urls";
import type { NewTrophyLoaderData } from "../loaders/trophies.new.server";
import type { TrophyBackfillLoaderData } from "../routes/trophies.$id.backfill.$seriesId";
import { trophyActionSchema } from "../trophies-schemas";
import styles from "./TrophyBackfill.module.css";

type BackfillTrophy = NewTrophyLoaderData["editableTrophies"][number];
type BackfillTournament = TrophyBackfillLoaderData["tournaments"][number];

type Awards = Record<number, number[]>;

export function TrophyBackfill({
	trophies,
	series,
}: {
	trophies: NewTrophyLoaderData["editableTrophies"];
	series: NewTrophyLoaderData["backfillSeries"];
}) {
	const { t } = useTranslation(["trophies", "common"]);
	const fetcher = useFetcher<TrophyBackfillLoaderData>();
	const [trophyId, setTrophyId] = React.useState<number | null>(null);
	const [seriesId, setSeriesId] = React.useState<number | null>(null);

	const backfillableTrophies = trophies.filter((trophy) =>
		series.some(
			(oneSeries) => oneSeries.organizationId === trophy.organizationId,
		),
	);
	const selectedTrophy = backfillableTrophies.find(
		(trophy) => trophy.id === trophyId,
	);
	const trophySeries = selectedTrophy
		? series.filter(
				(oneSeries) =>
					oneSeries.organizationId === selectedTrophy.organizationId,
			)
		: [];

	const tournaments =
		fetcher.data?.trophyId === trophyId && fetcher.data?.seriesId === seriesId
			? fetcher.data.tournaments
			: null;

	if (backfillableTrophies.length === 0) {
		return <Alert>{t("trophies:new.backfill.noTrophies")}</Alert>;
	}

	const handleTrophyChange = (newTrophyId: number) => {
		setTrophyId(newTrophyId);
		setSeriesId(null);
	};

	const handleSeriesChange = (newSeriesId: number) => {
		setSeriesId(newSeriesId);
		if (trophyId) {
			fetcher.load(trophyBackfillPage({ trophyId, seriesId: newSeriesId }));
		}
	};

	return (
		<div className="stack md">
			<p className="text-sm">{t("trophies:new.backfill.explanation")}</p>
			<Alert variation="WARNING">{t("trophies:new.backfill.warning")}</Alert>
			<SendouSelect
				label={t("trophies:new.backfill.trophyLabel")}
				items={backfillableTrophies}
				search={{ placeholder: t("trophies:new.update.searchPlaceholder") }}
				selectedKey={trophyId}
				onSelectionChange={(key) => handleTrophyChange(key as number)}
				data-testid="backfill-trophy-select"
			>
				{(trophy) => (
					<SendouSelectItem
						key={trophy.id}
						id={trophy.id}
						textValue={trophy.name}
					>
						{trophy.name}
					</SendouSelectItem>
				)}
			</SendouSelect>
			{selectedTrophy ? (
				<SendouSelect
					key={selectedTrophy.id}
					label={t("trophies:new.backfill.seriesLabel")}
					items={trophySeries}
					selectedKey={seriesId}
					onSelectionChange={(key) => handleSeriesChange(key as number)}
					data-testid="backfill-series-select"
				>
					{(oneSeries) => (
						<SendouSelectItem
							key={oneSeries.id}
							id={oneSeries.id}
							textValue={oneSeries.name}
						>
							{oneSeries.name}
						</SendouSelectItem>
					)}
				</SendouSelect>
			) : null}
			{selectedTrophy && seriesId ? (
				tournaments ? (
					tournaments.length > 0 ? (
						<BackfillTournamentList
							key={tournaments
								.map((tournament) => tournament.tournamentId)
								.join()}
							trophy={selectedTrophy}
							seriesId={seriesId}
							tournaments={tournaments}
						/>
					) : (
						<Alert>{t("trophies:new.backfill.noTournaments")}</Alert>
					)
				) : (
					<div className="text-lighter text-sm">
						{t("common:actions.loading")}
					</div>
				)
			) : null}
		</div>
	);
}

function BackfillTournamentList({
	trophy,
	seriesId,
	tournaments,
}: {
	trophy: BackfillTrophy;
	seriesId: number;
	tournaments: BackfillTournament[];
}) {
	const { t } = useTranslation(["trophies", "common"]);
	const [awards, setAwards] = React.useState<Awards>({});

	const selectedAwards = Object.entries(awards).map(
		([tournamentId, userIds]) => ({
			tournamentId: Number(tournamentId),
			userIds,
		}),
	);
	const playerCount = selectedAwards.reduce(
		(sum, award) => sum + award.userIds.length,
		0,
	);
	const hasTournamentWithoutPlayers = selectedAwards.some(
		(award) => award.userIds.length === 0,
	);

	const allWinners = (tournament: BackfillTournament) =>
		tournament.winners.map((winner) => winner.id);

	const toggleTournament = (tournament: BackfillTournament) => {
		const { [tournament.tournamentId]: existing, ...rest } = awards;
		setAwards(
			existing
				? rest
				: { ...awards, [tournament.tournamentId]: allWinners(tournament) },
		);
	};

	const toggleWinner = (tournamentId: number, userId: number) => {
		const userIds = awards[tournamentId] ?? [];
		setAwards({
			...awards,
			[tournamentId]: userIds.includes(userId)
				? userIds.filter((id) => id !== userId)
				: [...userIds, userId],
		});
	};

	const selectAll = () => {
		setAwards(
			Object.fromEntries(
				tournaments.map((tournament) => [
					tournament.tournamentId,
					allWinners(tournament),
				]),
			),
		);
	};

	return (
		<div className="stack md">
			<SendouButton
				variant="minimal"
				size="small"
				className="self-start"
				onClick={selectAll}
			>
				{t("common:actions.selectAll")}
			</SendouButton>
			<ul className={styles.tournamentList}>
				{tournaments.map((tournament) => {
					const receiverIds = awards[tournament.tournamentId];

					return (
						<li
							key={tournament.tournamentId}
							className={styles.tournament}
							data-testid="backfill-tournament"
						>
							<div className={styles.tournamentHeader}>
								<SendouSwitch
									isSelected={Boolean(receiverIds)}
									onChange={() => toggleTournament(tournament)}
									aria-label={tournament.name}
								/>
								<img
									src={tournament.logoUrl}
									alt=""
									width={32}
									height={32}
									className={styles.logo}
									loading="lazy"
								/>
								<div className="stack">
									<span className={styles.tournamentName}>
										{tournament.name}
									</span>
									<span className="text-xs text-lighter">
										{tournament.startTime ? (
											<>
												<LocaleTime
													date={tournament.startTime}
													options={{
														day: "numeric",
														month: "short",
														year: "numeric",
													}}
													inline
												/>
												{" • "}
											</>
										) : null}
										{tournament.teamName}
									</span>
								</div>
							</div>
							<ul className={styles.winners}>
								{tournament.winners.map((winner) => (
									<li key={winner.id} className={styles.winner}>
										<SendouSwitch
											size="small"
											isSelected={receiverIds?.includes(winner.id) ?? false}
											isDisabled={!receiverIds}
											onChange={() =>
												toggleWinner(tournament.tournamentId, winner.id)
											}
											aria-label={winner.username}
										/>
										<Avatar user={winner} size="xxs" />
										<span className={styles.winnerName}>{winner.username}</span>
										<ParticipationPill setResults={winner.setResults} />
									</li>
								))}
							</ul>
						</li>
					);
				})}
			</ul>
			<div className={styles.footer}>
				<span className="text-sm text-lighter">
					{t("trophies:new.backfill.selected", {
						count: selectedAwards.length,
						playerCount,
					})}
				</span>
				<ActionButton
					schema={trophyActionSchema}
					action="BACKFILL"
					fields={{ trophyId: trophy.id, seriesId, awards: selectedAwards }}
					isDisabled={
						selectedAwards.length === 0 || hasTournamentWithoutPlayers
					}
					testId="backfill-submit-button"
					confirm={{
						dialogHeading: t("trophies:new.backfill.confirm.heading", {
							trophyName: trophy.name,
							count: selectedAwards.length,
							playerCount,
						}),
						description: t("trophies:new.backfill.confirm.description"),
						submitButtonText: t("trophies:new.backfill.submit"),
					}}
				>
					{t("trophies:new.backfill.submit")}
				</ActionButton>
			</div>
			{hasTournamentWithoutPlayers ? (
				<FormMessage type="error">
					{t("trophies:new.backfill.noPlayersSelected")}
				</FormMessage>
			) : null}
		</div>
	);
}
