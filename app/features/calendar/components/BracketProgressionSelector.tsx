import { nanoid } from "nanoid";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { Button } from "~/components/Button";
import { DateInput } from "~/components/DateInput";
import { FormMessage } from "~/components/FormMessage";
import { Input } from "~/components/Input";
import { Label } from "~/components/Label";
import { SendouSwitch } from "~/components/elements/Switch";
import { PlusIcon } from "~/components/icons/Plus";
import { TOURNAMENT } from "~/features/tournament";
import * as Progression from "~/features/tournament-bracket/core/Progression";
import { defaultBracketSettings } from "../../tournament/tournament-utils";

const defaultBracket = (): Progression.InputBracket => ({
	id: nanoid(),
	name: "Main Bracket",
	type: "double_elimination",
	requiresCheckIn: false,
	settings: {},
});

export function BracketProgressionSelector({
	initialBrackets,
	isInvitationalTournament,
	setErrored,
	isTournamentInProgress,
}: {
	initialBrackets?: Progression.InputBracket[];
	isInvitationalTournament: boolean;
	setErrored: (errored: boolean) => void;
	isTournamentInProgress: boolean;
}) {
	const [brackets, setBrackets] = React.useState<Progression.InputBracket[]>(
		initialBrackets ?? [defaultBracket()],
	);

	const handleAddBracket = () => {
		setBrackets([
			...brackets,
			{
				...defaultBracket(),
				id: nanoid(),
				name: "",
				sources: [
					{
						bracketId: brackets[0].id,
						placements: "",
					},
				],
			},
		]);
	};

	const handleDeleteBracket = (idx: number) => {
		const newBrackets = brackets.filter((_, i) => i !== idx);
		const newBracketIds = new Set(newBrackets.map((b) => b.id));

		const updatedBrackets = newBrackets.map((b) => ({
			...b,
			sources:
				newBrackets.length === 1
					? undefined
					: b.sources?.map((source) => ({
							...source,
							bracketId: newBracketIds.has(source.bracketId)
								? source.bracketId
								: newBrackets[0].id,
						})),
		}));

		setBrackets(updatedBrackets);
	};

	const validated = Progression.validatedBrackets(brackets);

	React.useEffect(() => {
		if (Progression.isError(validated)) {
			setErrored(true);
		} else {
			setErrored(false);
		}
	}, [validated, setErrored]);

	return (
		<div className="stack lg items-start">
			{Progression.isBrackets(validated) ? (
				<input
					type="hidden"
					name="bracketProgression"
					value={JSON.stringify(validated)}
				/>
			) : null}
			<div className="stack lg">
				{brackets.map((bracket, i) => (
					<TournamentFormatBracketSelector
						key={bracket.id}
						bracket={bracket}
						brackets={brackets}
						onChange={(newBracket) => {
							const newBrackets = [...brackets];
							newBrackets[i] = newBracket;
							setBrackets(newBrackets);
						}}
						onDelete={
							i !== 0 && !bracket.disabled
								? () => handleDeleteBracket(i)
								: undefined
						}
						count={i + 1}
						isInvitationalTournament={isInvitationalTournament}
						isTournamentInProgress={isTournamentInProgress}
					/>
				))}
			</div>
			<Button
				icon={<PlusIcon />}
				size="tiny"
				variant="outlined"
				onClick={handleAddBracket}
				disabled={brackets.length >= TOURNAMENT.MAX_BRACKETS_PER_TOURNAMENT}
			>
				Add bracket
			</Button>
			{Progression.isError(validated) ? (
				<ErrorMessage error={validated} />
			) : null}
		</div>
	);
}

function TournamentFormatBracketSelector({
	bracket,
	brackets,
	onChange,
	onDelete,
	count,
	isInvitationalTournament,
	isTournamentInProgress,
}: {
	bracket: Progression.InputBracket;
	brackets: Progression.InputBracket[];
	onChange: (newBracket: Progression.InputBracket) => void;
	onDelete?: () => void;
	count: number;
	isInvitationalTournament: boolean;
	isTournamentInProgress: boolean;
}) {
	const id = React.useId();

	const createId = (name: string) => {
		return `${id}-${name}`;
	};

	const isFirstBracket = count === 1;

	const updateBracket = (newProps: Partial<Progression.InputBracket>) => {
		const defaultSettings = newProps.type
			? defaultBracketSettings(newProps.type)
			: undefined;

		onChange({
			...bracket,
			...newProps,
			settings: newProps.settings ?? defaultSettings ?? bracket.settings,
		});
	};

	return (
		<div className="stack horizontal md items-center">
			<div>
				<div className="format-selector__count">Bracket #{count}</div>
				{onDelete ? (
					<Button
						size="tiny"
						variant="minimal-destructive"
						onClick={onDelete}
						className="mx-auto"
						testId="delete-bracket-button"
					>
						Delete
					</Button>
				) : null}
			</div>
			<div className="format-selector__divider" />
			<div className="stack md items-start">
				<div>
					<Label htmlFor={createId("name")}>Bracket's name</Label>
					<Input
						id={createId("name")}
						value={bracket.name}
						onChange={(e) => updateBracket({ name: e.target.value })}
						maxLength={TOURNAMENT.BRACKET_NAME_MAX_LENGTH}
						readOnly={bracket.disabled}
					/>
				</div>

				{bracket.sources ? (
					<div>
						<Label htmlFor={createId("startTime")}>Start time</Label>
						<DateInput
							id={createId("startTime")}
							defaultValue={bracket.startTime ?? undefined}
							onChange={(newDate) =>
								updateBracket({ startTime: newDate ?? undefined })
							}
							readOnly={bracket.disabled}
						/>
						<FormMessage type="info">
							If missing, bracket can be started when the previous brackets have
							finished
						</FormMessage>
					</div>
				) : null}

				{bracket.sources ? (
					<div>
						<Label htmlFor={createId("checkIn")}>Check-in required</Label>
						<SendouSwitch
							id={createId("checkIn")}
							isSelected={bracket.requiresCheckIn}
							onChange={(isSelected) =>
								updateBracket({ requiresCheckIn: isSelected })
							}
							isDisabled={bracket.disabled}
						/>
						<FormMessage type="info">
							Check-in starts 1 hour before start time or right after the
							previous bracket finishes if no start time is set
						</FormMessage>
					</div>
				) : null}

				<div>
					<Label htmlFor={createId("format")}>Format</Label>
					<select
						value={bracket.type}
						onChange={(e) =>
							updateBracket({
								type: e.target.value as Progression.InputBracket["type"],
							})
						}
						className="w-max"
						name="format"
						id={createId("format")}
						disabled={bracket.disabled}
					>
						<option value="single_elimination">Single-elimination</option>
						<option value="double_elimination">Double-elimination</option>
						<option value="round_robin">Round robin</option>
						<option value="swiss">Swiss</option>
					</select>
				</div>

				{bracket.type === "single_elimination" ? (
					<div>
						<Label htmlFor={createId("thirdPlaceMatch")}>
							Third place match
						</Label>
						<SendouSwitch
							id={createId("thirdPlaceMatch")}
							isSelected={Boolean(
								bracket.settings.thirdPlaceMatch ??
									TOURNAMENT.SE_DEFAULT_HAS_THIRD_PLACE_MATCH,
							)}
							onChange={(isSelected) =>
								updateBracket({
									settings: {
										...bracket.settings,
										thirdPlaceMatch: isSelected,
									},
								})
							}
							isDisabled={bracket.disabled}
						/>
					</div>
				) : null}

				{bracket.type === "round_robin" ? (
					<div>
						<Label htmlFor="teamsPerGroup">Teams per group</Label>
						<select
							value={
								bracket.settings.teamsPerGroup ??
								TOURNAMENT.RR_DEFAULT_TEAM_COUNT_PER_GROUP
							}
							onChange={(e) =>
								updateBracket({
									settings: {
										...bracket.settings,
										teamsPerGroup: Number(e.target.value),
									},
								})
							}
							className="w-max"
							name="teamsPerGroup"
							id="teamsPerGroup"
							disabled={bracket.disabled}
						>
							<option value="3">3</option>
							<option value="4">4</option>
							<option value="5">5</option>
							<option value="6">6</option>
						</select>
					</div>
				) : null}

				{bracket.type === "swiss" ? (
					<div>
						<Label htmlFor="swissGroupCount">Groups count</Label>
						<select
							value={
								bracket.settings.groupCount ??
								TOURNAMENT.SWISS_DEFAULT_GROUP_COUNT
							}
							onChange={(e) =>
								updateBracket({
									settings: {
										...bracket.settings,
										groupCount: Number(e.target.value),
									},
								})
							}
							className="w-max"
							name="swissGroupCount"
							id="swissGroupCount"
							disabled={bracket.disabled}
						>
							<option value="1">1</option>
							<option value="2">2</option>
							<option value="3">3</option>
							<option value="4">4</option>
							<option value="5">5</option>
							<option value="6">6</option>
						</select>
					</div>
				) : null}

				{bracket.type === "swiss" ? (
					<div>
						<Label htmlFor="swissRoundCount">Round count</Label>
						<select
							value={
								bracket.settings.roundCount ??
								TOURNAMENT.SWISS_DEFAULT_ROUND_COUNT
							}
							onChange={(e) =>
								updateBracket({
									settings: {
										...bracket.settings,
										roundCount: Number(e.target.value),
									},
								})
							}
							className="w-max"
							name="swissRoundCount"
							id="swissRoundCount"
							disabled={bracket.disabled}
						>
							<option value="3">3</option>
							<option value="4">4</option>
							<option value="5">5</option>
							<option value="6">6</option>
							<option value="7">7</option>
							<option value="8">8</option>
						</select>
					</div>
				) : null}

				<div>
					<div className="stack horizontal sm">
						<Label htmlFor={createId("source")}>Source</Label>{" "}
					</div>
					{!isFirstBracket ? (
						<div className="stack sm horizontal mt-1 mb-2">
							<SendouSwitch
								id={createId("follow-up-bracket")}
								size="small"
								isSelected={Boolean(bracket.sources)}
								onChange={(isSelected) =>
									updateBracket({
										sources: isSelected ? [] : undefined,
										requiresCheckIn: false,
										startTime: undefined,
									})
								}
								isDisabled={bracket.disabled || isTournamentInProgress}
								data-testid="follow-up-bracket-switch"
							/>
							<Label htmlFor={createId("follow-up-bracket")} spaced={false}>
								Is follow-up bracket
							</Label>
						</div>
					) : null}
					{!bracket.sources ? (
						<FormMessage type="info">
							{isInvitationalTournament ? (
								<>Participants added by the organizer</>
							) : (
								<>Participants join from sign-up</>
							)}
						</FormMessage>
					) : (
						<SourcesSelector
							brackets={brackets.filter(
								(bracket2) => bracket.id !== bracket2.id && bracket2.name,
							)}
							source={bracket.sources?.[0] ?? null}
							onChange={(source) => updateBracket({ sources: [source] })}
						/>
					)}
				</div>
			</div>
		</div>
	);
}

function SourcesSelector({
	brackets,
	source,
	onChange,
}: {
	brackets: Progression.InputBracket[];
	source: Progression.EditableSource | null;
	onChange: (sources: Progression.EditableSource) => void;
}) {
	const id = React.useId();

	const createId = (label: string) => {
		return `${id}-${label}`;
	};

	return (
		<div className="stack horizontal sm items-end">
			<div>
				<Label htmlFor={createId("bracket")}>Bracket</Label>
				<select
					id={createId("bracket")}
					value={source?.bracketId ?? brackets[0].id}
					onChange={(e) =>
						onChange({ placements: "", ...source, bracketId: e.target.value })
					}
				>
					{brackets.map((bracket) => (
						<option key={bracket.id} value={bracket.id}>
							{bracket.name}
						</option>
					))}
				</select>
			</div>
			<div>
				<Label htmlFor={createId("placements")}>Placements</Label>
				<Input
					id={createId("placements")}
					placeholder="1,2,3"
					value={source?.placements ?? ""}
					testId="placements-input"
					onChange={(e) =>
						onChange({
							bracketId: brackets[0].id,
							...source,
							placements: e.target.value,
						})
					}
				/>
			</div>
		</div>
	);
}

function ErrorMessage({ error }: { error: Progression.ValidationError }) {
	const { t } = useTranslation(["tournament"]);

	const bracketIdxsArr = (() => {
		if (typeof (error as { bracketIdx: number }).bracketIdx === "number") {
			return [(error as { bracketIdx: number }).bracketIdx];
		}
		if ((error as { bracketIdxs: number[] }).bracketIdxs) {
			return (error as { bracketIdxs: number[] }).bracketIdxs;
		}

		return null;
	})();

	return (
		<FormMessage type="error">
			Problems with the bracket progression
			{bracketIdxsArr ? (
				<> (Bracket {bracketIdxsArr.map((idx) => `#${idx + 1}`).join(", ")})</>
			) : null}
			: {t(`tournament:progression.error.${error.type}`)}
		</FormMessage>
	);
}
