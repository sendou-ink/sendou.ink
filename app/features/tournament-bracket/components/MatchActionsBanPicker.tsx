import clsx from "clsx";
import { Check, X } from "lucide-react";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { useFetcher, useLoaderData } from "react-router";
import { Divider } from "~/components/Divider";
import { ModeImage, StageImage } from "~/components/Image";
import { SubmitButton } from "~/components/SubmitButton";
import type { ActionType, TournamentRoundMaps } from "~/db/tables";
import { useUser } from "~/features/auth/core/user";
import { useTournament } from "~/features/tournament/routes/to.$id";
import { modesShort } from "~/modules/in-game-lists/modes";
import { shortStageName } from "~/modules/in-game-lists/stage-ids";
import type { ModeShort, StageId } from "~/modules/in-game-lists/types";
import invariant from "~/utils/invariant";
import { stageImageUrl } from "~/utils/urls";
import * as PickBan from "../core/PickBan";
import type { TournamentDataTeam } from "../core/Tournament.server";
import type { TournamentMatchLoaderData } from "../loaders/to.$id.matches.$mid.server";
import styles from "./MatchActionsBanPicker.module.css";

/** stageId is omitted for mode-only actions (MODE_PICK / MODE_BAN) where no specific stage is selected */
type BanPickerSelection = {
	mode: ModeShort;
	stageId?: StageId;
};

export function MatchActionsBanPicker({
	teams,
}: {
	teams: [TournamentDataTeam, TournamentDataTeam];
}) {
	const data = useLoaderData<TournamentMatchLoaderData>();
	const tournament = useTournament();
	const maps = data.match.roundMaps!;
	const [selected, setSelected] = React.useState<BanPickerSelection>();

	const turnOfResult = PickBan.turnOf({
		results: data.results,
		maps,
		teams: [
			{ id: teams[0].id, seed: tournament.teamById(teams[0].id)!.seed },
			{ id: teams[1].id, seed: tournament.teamById(teams[1].id)!.seed },
		],
		mapList: data.mapList,
		pickBanEventCount: data.pickBanEventCount,
	})!;
	const pickerTeamId = turnOfResult.teamId;
	const pickingTeam = teams.find((team) => team.id === pickerTeamId)!;

	const actionType = turnOfResult.action;
	const isModePick = actionType === "MODE_PICK";
	const isModeBan = actionType === "MODE_BAN";
	const isModeAction = isModePick || isModeBan;

	return (
		<div>
			{isModeAction ? (
				<ModePicker
					selected={selected}
					setSelected={setSelected}
					pickerTeamId={pickerTeamId}
					teams={teams}
				/>
			) : (
				<MapPicker
					selected={selected}
					setSelected={setSelected}
					pickerTeamId={pickerTeamId}
					teams={teams}
					actionType={actionType}
				/>
			)}
			<CounterpickSubmitter
				selected={selected}
				pickingTeam={pickingTeam}
				pickBan={data.match.roundMaps!.pickBan!}
				actionType={actionType}
			/>
		</div>
	);
}

function MapPicker({
	selected,
	setSelected,
	pickerTeamId,
	teams,
	actionType,
}: {
	selected?: BanPickerSelection;
	setSelected: (selected: BanPickerSelection) => void;
	pickerTeamId: number;
	teams: [TournamentDataTeam, TournamentDataTeam];
	actionType: ActionType;
}) {
	const user = useUser();
	const data = useLoaderData<TournamentMatchLoaderData>();
	const tournament = useTournament();

	const pickBanMapPool = PickBan.mapsListWithLegality({
		toSetMapPool: tournament.ctx.toSetMapPool,
		maps: data.match.roundMaps,
		mapList: data.mapList,
		teams,
		tieBreakerMapPool: tournament.ctx.tieBreakerMapPool,
		pickerTeamId,
		results: data.results,
		pickBanEvents: data.pickBanEvents,
	});

	const modes = modesShort.filter((mode) =>
		pickBanMapPool.some((map) => map.mode === mode && map.isLegal),
	);

	const canPickBan =
		tournament.isOrganizer(user) ||
		tournament.ownedTeamByUser(user)?.id === pickerTeamId;

	const teamMemberOf = tournament.teamMemberOfByUser(user);
	const isPartOfTheMatch = teams.some((t) => t.id === teamMemberOf?.id);
	const mapFromWhere = (stageId: StageId, mode: ModeShort) => {
		if (!isPartOfTheMatch) {
			return;
		}

		const teamOneHas = teams[0].mapPool?.some(
			(map) => map.stageId === stageId && map.mode === mode,
		);
		const teamTwoHas = teams[1].mapPool?.some(
			(map) => map.stageId === stageId && map.mode === mode,
		);

		if (teamOneHas && teamTwoHas) {
			return "BOTH";
		}

		if (teamOneHas) {
			return teams[0].id === teamMemberOf?.id ? "US" : "THEM";
		}

		if (teamTwoHas) {
			return teams[1].id === teamMemberOf?.id ? "US" : "THEM";
		}

		return;
	};

	const pickersLastWonMode = data.results
		.slice()
		.reverse()
		.find((result) => result.winnerTeamId === pickerTeamId)?.mode;

	return (
		<div className="stack lg">
			{modes.map((mode) => {
				const stages = pickBanMapPool
					.filter((map) => map.mode === mode)
					.sort((a, b) => a.stageId - b.stageId);

				return (
					<div key={mode} className={clsx(styles.mapPoolPicker, "stack sm")}>
						<Divider className={styles.divider}>
							<ModeImage mode={mode} size={32} />
						</Divider>
						<div
							className={clsx(
								"stack horizontal flex-wrap justify-center mt-1",
								{
									"lg-row sm-column": isPartOfTheMatch,
									sm: !isPartOfTheMatch,
								},
							)}
						>
							{stages.map(({ stageId, isLegal }) => {
								const number =
									data.match.roundMaps?.pickBan === "BAN_2"
										? (data.mapList ?? [])?.findIndex(
												(m) => m.stageId === stageId && m.mode === mode,
											) + 1
										: undefined;

								return (
									<MapButton
										key={stageId}
										stageId={stageId}
										disabled={!isLegal}
										selected={
											selected?.mode === mode && selected.stageId === stageId
										}
										actionType={actionType}
										onClick={
											canPickBan
												? () => setSelected({ mode, stageId })
												: undefined
										}
										number={number}
										from={mapFromWhere(stageId, mode)}
									/>
								);
							})}
						</div>
						{data.match.roundMaps?.pickBan !== "CUSTOM" &&
						pickersLastWonMode === mode &&
						modes.length > 1 ? (
							<div className="text-error text-xs text-center mt-2">
								Can&apos;t pick the same mode team last won on
							</div>
						) : null}
					</div>
				);
			})}
		</div>
	);
}

function MapButton({
	stageId,
	onClick,
	selected,
	disabled,
	actionType,
	number,
	from,
}: {
	stageId: StageId;
	onClick?: () => void;
	selected?: boolean;
	disabled?: boolean;
	actionType?: ActionType;
	number?: number;
	from?: "US" | "THEM" | "BOTH";
}) {
	const { t } = useTranslation(["game-misc"]);

	return (
		<div
			className={clsx("stack items-center relative", styles.mapButtonContainer)}
		>
			<button
				className={clsx(styles.mapButton, {
					[styles.mapButtonGreyedOut]: selected || disabled,
				})}
				style={{ "--map-image-url": `url("${stageImageUrl(stageId)}.avif")` }}
				onClick={onClick}
				type="button"
				disabled={!onClick}
				data-testid={!disabled && onClick ? "pick-ban-button" : undefined}
			/>
			{selected && !disabled ? (
				actionType === "BAN" || actionType === "MODE_BAN" ? (
					<X
						className={clsx(styles.mapButtonIcon, styles.mapButtonIconMuted)}
						onClick={onClick}
					/>
				) : (
					<Check
						className={clsx(styles.mapButtonIcon, styles.mapButtonIconMuted)}
						onClick={onClick}
					/>
				)
			) : null}
			{disabled ? (
				<X className={clsx(styles.mapButtonIcon, styles.mapButtonIconError)} />
			) : null}
			{number ? <span className={styles.mapButtonNumber}>{number}</span> : null}
			{from ? (
				<span
					className={clsx(styles.mapButtonFrom, {
						"text-theme": from === "BOTH",
						"text-success": from === "US",
						"text-error": from === "THEM",
					})}
				>
					{from === "BOTH" ? "Both" : from === "THEM" ? "Them" : "Us"}
				</span>
			) : null}
			<div className={styles.mapButtonLabel}>
				{shortStageName(t(`game-misc:STAGE_${stageId}`))}
			</div>
		</div>
	);
}

function ModePicker({
	selected,
	setSelected,
	pickerTeamId,
	teams,
}: {
	selected?: BanPickerSelection;
	setSelected: (selected: BanPickerSelection) => void;
	pickerTeamId: number;
	teams: [TournamentDataTeam, TournamentDataTeam];
}) {
	const user = useUser();
	const data = useLoaderData<TournamentMatchLoaderData>();
	const tournament = useTournament();
	const { t } = useTranslation(["game-misc"]);

	const pickBanMapPool = PickBan.mapsListWithLegality({
		toSetMapPool: tournament.ctx.toSetMapPool,
		maps: data.match.roundMaps,
		mapList: data.mapList,
		teams,
		tieBreakerMapPool: tournament.ctx.tieBreakerMapPool,
		pickerTeamId,
		results: data.results,
		pickBanEvents: data.pickBanEvents,
	});

	const availableModes = modesShort.filter((mode) =>
		pickBanMapPool.some((map) => map.mode === mode && map.isLegal),
	);

	const canPickBan =
		tournament.isOrganizer(user) ||
		tournament.ownedTeamByUser(user)?.id === pickerTeamId;

	return (
		<div className="stack horizontal md justify-center flex-wrap">
			{availableModes.map((mode) => (
				<button
					key={mode}
					type="button"
					className={clsx(styles.mapButton, {
						[styles.mapButtonGreyedOut]: selected?.mode === mode,
					})}
					onClick={canPickBan ? () => setSelected({ mode }) : undefined}
					disabled={!canPickBan}
					data-testid={canPickBan ? "pick-ban-button" : undefined}
				>
					<ModeImage mode={mode} size={48} />
					<div className={styles.mapButtonLabel}>
						{t(`game-misc:MODE_SHORT_${mode}`)}
					</div>
					{selected?.mode === mode ? (
						<Check className={styles.mapButtonIcon} />
					) : null}
				</button>
			))}
		</div>
	);
}

function CounterpickSubmitter({
	selected,
	pickingTeam,
	pickBan,
	actionType,
}: {
	selected?: BanPickerSelection;
	pickingTeam: TournamentDataTeam;
	pickBan: NonNullable<TournamentRoundMaps["pickBan"]>;
	actionType: ActionType;
}) {
	const fetcher = useFetcher();
	const { t } = useTranslation(["game-misc"]);
	const user = useUser();
	const tournament = useTournament();

	const ownedTeam = tournament.ownedTeamByUser(user);

	const picking =
		tournament.isOrganizer(user) || ownedTeam?.id === pickingTeam.id;

	const isModeAction = actionType === "MODE_PICK" || actionType === "MODE_BAN";

	const isCustom = pickBan === "CUSTOM";

	const actionLabel = () => {
		if (actionType === "BAN" || pickBan === "BAN_2") return "Ban";
		if (actionType === "MODE_PICK") return "Pick mode";
		if (actionType === "MODE_BAN") return "Ban mode";
		if (isCustom) return "Pick";
		return "Counterpick";
	};

	const promptLabel = () => {
		if (actionType === "BAN" || pickBan === "BAN_2") {
			return "Please select your team's ban above";
		}
		if (actionType === "MODE_PICK") return "Please select a mode to pick above";
		if (actionType === "MODE_BAN") return "Please select a mode to ban above";
		if (isCustom) return "Please select your team's pick above";
		return "Please select your team's counterpick above";
	};

	if (!picking) {
		return (
			<div className="mt-6 text-lighter text-sm text-center">
				Waiting for captain of {pickingTeam.name} to make their selection
			</div>
		);
	}

	if (picking && !selected) {
		return (
			<div className="mt-6 text-lighter text-sm text-center">
				{promptLabel()}
			</div>
		);
	}

	invariant(selected, "CounterpickSubmitter: selected is undefined");

	const stageId = isModeAction ? null : selected.stageId;
	invariant(isModeAction || typeof stageId === "number", "Expected stageId");

	return (
		<div className="stack md items-center">
			<div
				className={clsx("mt-6 text-lighter text-sm", {
					"text-warning":
						actionType === "BAN" ||
						actionType === "MODE_BAN" ||
						pickBan === "BAN_2",
				})}
			>
				{actionLabel()}: {t(`game-misc:MODE_SHORT_${selected.mode}`)}
				{typeof stageId === "number"
					? ` ${t(`game-misc:STAGE_${stageId}`)}`
					: null}
			</div>
			<div className="stack sm horizontal">
				<ModeImage mode={selected.mode} size={32} />
				{typeof stageId === "number" ? (
					<StageImage stageId={stageId} height={32} className="rounded-sm" />
				) : null}
			</div>
			<fetcher.Form method="post">
				{typeof stageId === "number" ? (
					<input type="hidden" name="stageId" value={stageId} />
				) : null}
				<input type="hidden" name="mode" value={selected.mode} />
				<SubmitButton _action="BAN_PICK">Confirm</SubmitButton>
			</fetcher.Form>
		</div>
	);
}
