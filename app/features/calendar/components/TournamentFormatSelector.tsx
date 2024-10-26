import { nanoid } from "nanoid";
import * as React from "react";
import { Button } from "~/components/Button";
import { DateInput } from "~/components/DateInput";
import { FormMessage } from "~/components/FormMessage";
import { InfoPopover } from "~/components/InfoPopover";
import { Input } from "~/components/Input";
import { Label } from "~/components/Label";
import { Toggle } from "~/components/Toggle";
import { PlusIcon } from "~/components/icons/Plus";
import { TOURNAMENT } from "~/features/tournament";
import * as Progression from "~/features/tournament-bracket/core/Progression";

export function TournamentFormatSelector() {
	// xxx: what default?
	const [brackets, setBrackets] = React.useState<Progression.InputBracket[]>([
		{
			id: nanoid(),
			name: "Main Bracket",
			type: "double_elimination",
			requiresCheckIn: false,
			settings: {
				thirdPlaceMatch: false,
			},
		},
	]);

	const handleAddBracket = () => {
		const newBracket: Progression.InputBracket =
			brackets.length === 1
				? {
						id: nanoid(),
						name: "",
						type: "single_elimination",
						requiresCheckIn: true,
						settings: {
							thirdPlaceMatch: false,
						},
					}
				: { ...brackets.at(-1)!, id: nanoid(), name: "" };

		setBrackets([...brackets, newBracket]);
	};

	const validated = Progression.validatedBrackets(brackets);

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
						count={i + 1}
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
		</div>
	);
}

function TournamentFormatBracketSelector({
	bracket,
	brackets,
	onChange,
	count,
}: {
	bracket: Progression.InputBracket;
	brackets: Progression.InputBracket[];
	onChange: (newBracket: Progression.InputBracket) => void;
	count: number;
}) {
	const id = React.useId();

	const createId = (name: string) => {
		return `${id}-${name}`;
	};

	const isFirstBracket = count === 1;

	const updateBracket = (newProps: Partial<Progression.InputBracket>) => {
		onChange({ ...bracket, ...newProps });
	};

	return (
		<div className="stack horizontal md items-center">
			<div className="format-selector__count">Bracket #{count}</div>
			<div className="format-selector__divider" />
			<div className="stack md items-start">
				<div>
					<Label htmlFor={createId("name")}>Bracket's name</Label>
					<Input
						id={createId("name")}
						value={bracket.name}
						onChange={(e) => updateBracket({ name: e.target.value })}
						maxLength={TOURNAMENT.BRACKET_NAME_MAX_LENGTH}
					/>
				</div>

				{!isFirstBracket ? (
					<div>
						<Label htmlFor={createId("startTime")}>Start time</Label>
						<DateInput
							id={createId("startTime")}
							defaultValue={bracket.startTime ?? undefined}
							onChange={(newDate) =>
								updateBracket({ startTime: newDate ?? undefined })
							}
						/>
						<FormMessage type="info">
							If missing, bracket can be started when the previous brackets have
							finished
						</FormMessage>
					</div>
				) : null}

				{!isFirstBracket ? (
					<div>
						<Label htmlFor={createId("checkIn")}>Check-in required</Label>
						<Toggle
							checked={bracket.requiresCheckIn}
							setChecked={(checked) =>
								updateBracket({ requiresCheckIn: checked })
							}
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
						<Toggle
							checked={Boolean(bracket.settings.thirdPlaceMatch)}
							setChecked={(checked) =>
								updateBracket({
									settings: { ...bracket.settings, thirdPlaceMatch: checked },
								})
							}
						/>
					</div>
				) : null}

				{bracket.type === "round_robin" ? (
					<div>
						<Label htmlFor="teamsPerGroup">Teams per group</Label>
						<select
							value={bracket.settings.teamsPerGroup ?? 4}
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
							value={bracket.settings.groupCount ?? 1}
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
							value={bracket.settings.roundCount ?? 5}
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
						<InfoPopover tiny>xxx: link to docs here</InfoPopover>
					</div>
					{/** xxx: If invitational "Participants added by the organizer" */}
					{/** xxx: Allow many brackets joining from sign-up */}
					{isFirstBracket ? (
						<FormMessage type="info">
							Participants join from sign-up
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
