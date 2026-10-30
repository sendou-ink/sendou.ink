import clsx from "clsx";
import { ArrowDown, ArrowUp } from "lucide-react";
import { Fragment, type ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";
import * as R from "remeda";
import { SendouButton } from "~/components/elements/Button";
import {
	SendouChipRadio,
	SendouChipRadioGroup,
} from "~/components/elements/ChipRadio";
import { ModeImage, SpecialWeaponImage, WeaponImage } from "~/components/Image";
import { Main } from "~/components/Main";
import { WeaponSelect } from "~/components/WeaponSelect";
import { modesShort, rankedModesShort } from "~/modules/in-game-lists/modes";
import type {
	MainWeaponId,
	ModeShort,
	RankedModeShort,
} from "~/modules/in-game-lists/types";
import { weaponIdToBaseWeaponId } from "~/modules/in-game-lists/weapon-ids";
import * as WeaponRoll from "../core/WeaponRoll";
import styles from "./lobbies.weapon-roll-test.module.css";

const BATCH_SIZES = [100, 500, 2000] as const;

/** A team's shape rarer than this counts as a rare shape in the batch stats. */
const RARE_SHAPE_SHARE = 0.01;

const HISTORY_LENGTH = 12;

/** Sets in a row the batch rolls as one lobby, each knowing the ones before it. */
const SESSION_LENGTH = 10;

type Teams = { alpha: MainWeaponId[]; bravo: MainWeaponId[] };

const SLIDERS: Array<{
	key: Exclude<keyof WeaponRoll.WeaponRollOptions, "mode">;
	label: string;
	help: string;
	min: number;
	max: number;
	step: number;
}> = [
	{
		key: "candidates",
		label: "Candidates",
		help: "Draws of 8 weapons tried per roll, the cheapest wins. Even 1 is still split as evenly as possible.",
		min: 1,
		max: 300,
		step: 1,
	},
	{
		key: "popularityExponent",
		label: "Popularity exponent",
		help: "0 = every weapon equally likely, 1 = as common as in SendouQ.",
		min: 0,
		max: 1.5,
		step: 0.05,
	},
	{
		key: "strengthWeight",
		label: "Strength weight",
		help: "Cost per percentage point the weapons' predicted win% is off 50%.",
		min: 0,
		max: 5,
		step: 0.1,
	},
	{
		key: "shapeWeight",
		label: "Shape weight",
		help: "Cost per log unit a team's frontline-midline-backline shape is rarer than the most common one.",
		min: 0,
		max: 5,
		step: 0.1,
	},
	{
		key: "shapeMismatchWeight",
		label: "Shape mismatch weight",
		help: "Cost per player that would need to change tier for both teams to share a shape.",
		min: 0,
		max: 5,
		step: 0.1,
	},
	{
		key: "specialStackWeight",
		label: "Special stack weight",
		help: "Cost per weapon sharing its special with a teammate.",
		min: 0,
		max: 5,
		step: 0.1,
	},
	{
		key: "repeatWeight",
		label: "Repeat weight",
		help: "How likely a base weapon of the previous set is drawn compared to normally. 1 = no penalty, 0 = never.",
		min: 0,
		max: 1,
		step: 0.05,
	},
	{
		key: "repeatFadeSets",
		label: "Repeat fade sets",
		help: "Over how many sets the repeat penalty fades away.",
		min: 0,
		max: 6,
		step: 1,
	},
];

export default function WeaponRollTestPage() {
	const [options, setOptions] = useState(
		WeaponRoll.DEFAULT_WEAPON_ROLL_OPTIONS,
	);
	const [teams, setTeams] = useState<Teams | null>(null);
	const [history, setHistory] = useState<Teams[]>([]);

	const handleRoll = () => {
		const result = WeaponRoll.roll(options, {
			recentRolls: history.map((previous) => [
				...previous.alpha,
				...previous.bravo,
			]),
		});
		const rolled = { alpha: result.alpha, bravo: result.bravo };

		setTeams(rolled);
		setHistory((previous) => [rolled, ...previous].slice(0, HISTORY_LENGTH));
	};

	return (
		<Main bigger className="stack lg">
			<div className="stack xs">
				<h1>Weapon roll test (Dev)</h1>
				<div className="text-xs text-lighter">
					Data from {WeaponRoll.WEAPON_ROLL_DATA.mapCount} SendouQ maps,
					generated {WeaponRoll.WEAPON_ROLL_DATA.generatedAt.slice(0, 10)} (
					<code>pnpm run weapon-roll:data</code>). Strength is shown as the
					percentage points of win probability one weapon adds over an average
					one.
				</div>
			</div>
			<OptionsPanel options={options} setOptions={setOptions} />
			<div className="stack md">
				<div className="stack horizontal sm items-center">
					<SendouButton onClick={handleRoll}>Roll</SendouButton>
					{teams ? (
						<SendouButton
							variant="outlined"
							onClick={() =>
								setTeams({ alpha: teams.bravo, bravo: teams.alpha })
							}
						>
							Swap sides
						</SendouButton>
					) : null}
				</div>
				{teams ? (
					<Matchup teams={teams} options={options} setTeams={setTeams} />
				) : (
					<div className="text-lighter text-sm">
						Roll to see a matchup, any weapon of it can then be swapped by hand
						to see how the cost reacts.
					</div>
				)}
				{history.length > 1 ? (
					<History history={history} options={options} onPick={setTeams} />
				) : null}
			</div>
			<BatchPanel options={options} />
			<WeaponTable mode={options.mode} />
		</Main>
	);
}

function OptionsPanel({
	options,
	setOptions,
}: {
	options: WeaponRoll.WeaponRollOptions;
	setOptions: (options: WeaponRoll.WeaponRollOptions) => void;
}) {
	return (
		<section className={clsx(styles.panel, "stack md")}>
			<div className="stack horizontal md items-center justify-between flex-wrap">
				<SendouChipRadioGroup aria-label="Mode" wrap>
					<SendouChipRadio
						name="mode"
						value="ALL"
						checked={options.mode === null}
						onChange={() => setOptions({ ...options, mode: null })}
					>
						All modes
					</SendouChipRadio>
					{modesShort.map((mode) => (
						<SendouChipRadio
							key={mode}
							name="mode"
							value={mode}
							checked={options.mode === mode}
							onChange={() => setOptions({ ...options, mode })}
						>
							<ModeImage mode={mode} size={20} />
						</SendouChipRadio>
					))}
				</SendouChipRadioGroup>
				<SendouButton
					variant="minimal"
					size="small"
					onClick={() =>
						setOptions({
							...WeaponRoll.DEFAULT_WEAPON_ROLL_OPTIONS,
							mode: options.mode,
						})
					}
				>
					Reset to defaults
				</SendouButton>
			</div>
			<div className={styles.sliders}>
				{SLIDERS.map((slider) => (
					<label key={slider.key} className="stack xxs">
						<span className="stack horizontal justify-between text-sm font-semi-bold">
							<span>{slider.label}</span>
							<span>{options[slider.key]}</span>
						</span>
						<input
							type="range"
							min={slider.min}
							max={slider.max}
							step={slider.step}
							value={options[slider.key]}
							onChange={(event) =>
								setOptions({
									...options,
									[slider.key]: Number(event.target.value),
								})
							}
						/>
						<span className="text-xxs text-lighter">{slider.help}</span>
					</label>
				))}
			</div>
			<pre className={styles.optionsJson}>
				{JSON.stringify(R.omit(options, ["mode"]))}
			</pre>
		</section>
	);
}

function Matchup({
	teams,
	options,
	setTeams,
}: {
	teams: Teams;
	options: WeaponRoll.WeaponRollOptions;
	setTeams: (teams: Teams) => void;
}) {
	const result = WeaponRoll.evaluate(teams, options);

	const replaceWeapon = (
		side: keyof Teams,
		index: number,
		weaponId: MainWeaponId,
	) =>
		setTeams({
			...teams,
			[side]: teams[side].map((id, i) => (i === index ? weaponId : id)),
		});

	return (
		<div className="stack md">
			<div className={styles.matchup}>
				{(["alpha", "bravo"] as const).map((side) => (
					<div key={side} className={clsx(styles.team, "stack sm")}>
						<div className="stack horizontal justify-between items-center">
							<h2 className="text-md text-capitalize">{side}</h2>
							<ShapeLabel team={teams[side]} />
						</div>
						{teams[side].map((weaponId, i) => (
							<div key={i} className={styles.slot}>
								<WeaponSelect
									value={weaponId}
									onChange={(newWeaponId) =>
										replaceWeapon(side, i, newWeaponId)
									}
									testId={`${side}-weapon-${i}`}
								/>
								<WeaponFacts weaponId={weaponId} mode={options.mode} />
							</div>
						))}
					</div>
				))}
			</div>
			<div className={styles.costs}>
				<Stat
					label="Alpha win% from weapons"
					value={`${(result.alphaWinProbability * 100).toFixed(1)}%`}
				/>
				<Stat label="Strength cost" value={result.cost.strength.toFixed(2)} />
				<Stat label="Shape cost" value={result.cost.shape.toFixed(2)} />
				<Stat
					label="Shape mismatch cost"
					value={result.cost.shapeMismatch.toFixed(2)}
				/>
				<Stat
					label="Special stack cost"
					value={result.cost.specialStack.toFixed(2)}
				/>
				<Stat label="Total cost" value={result.cost.total.toFixed(2)} />
			</div>
		</div>
	);
}

function WeaponFacts({
	weaponId,
	mode,
}: {
	weaponId: MainWeaponId;
	mode: ModeShort | null;
}) {
	const { strength, strengthSe } = WeaponRoll.strengthOf(weaponId, mode);

	return (
		<div className="stack horizontal sm items-center text-xs">
			<TierLabel tier={WeaponRoll.tierOf(weaponId)} />
			<SpecialWeaponImage
				specialWeaponId={WeaponRoll.specialOf(weaponId)}
				size={20}
			/>
			<span className={strengthClassName(strength)}>{formatPp(strength)}</span>
			<span className="text-lighter">±{formatPp(strengthSe, false)}</span>
		</div>
	);
}

function History({
	history,
	options,
	onPick,
}: {
	history: Teams[];
	options: WeaponRoll.WeaponRollOptions;
	onPick: (teams: Teams) => void;
}) {
	return (
		<div className="stack xs">
			<h2 className="text-sm">Recent rolls</h2>
			{history.map((teams, i) => {
				const result = WeaponRoll.evaluate(teams, options);

				return (
					<button
						key={i}
						type="button"
						className={styles.historyRow}
						onClick={() => onPick(teams)}
					>
						<span className="stack horizontal xxs">
							{teams.alpha.map((weaponId) => (
								<WeaponImage
									key={weaponId}
									weaponSplId={weaponId}
									variant="badge"
									size={28}
								/>
							))}
						</span>
						<span className="text-xs text-lighter">vs</span>
						<span className="stack horizontal xxs">
							{teams.bravo.map((weaponId) => (
								<WeaponImage
									key={weaponId}
									weaponSplId={weaponId}
									variant="badge"
									size={28}
								/>
							))}
						</span>
						<span className="text-xs">
							{(result.alphaWinProbability * 100).toFixed(1)}% · cost{" "}
							{result.cost.total.toFixed(2)}
						</span>
					</button>
				);
			})}
		</div>
	);
}

interface BatchStats {
	meanImbalancePp: number;
	p90ImbalancePp: number;
	rareShapeShare: number;
	meanShapeMismatch: number;
	meanSpecialStack: number;
	meanRepeatsOfPreviousSet: number;
	setsRepeatingShare: number;
	/** Per session, how many of its sets the most rolled base weapon was in */
	meanMostRolledCount: number;
	/** Share of rolls each weapon appeared in */
	appearances: Map<MainWeaponId, number>;
	msPerRoll: number;
}

function BatchPanel({ options }: { options: WeaponRoll.WeaponRollOptions }) {
	const [size, setSize] = useState<(typeof BATCH_SIZES)[number]>(500);
	const [stats, setStats] = useState<{
		tuned: BatchStats;
		plain: BatchStats;
	} | null>(null);
	const [isRunning, setIsRunning] = useState(false);

	const handleRun = () => {
		setIsRunning(true);
		// lets the pending state paint before the main thread is busy
		setTimeout(() => {
			setStats({
				tuned: runBatch(options, size),
				plain: runBatch(
					{
						...options,
						candidates: 1,
						strengthWeight: 0,
						shapeWeight: 0,
						shapeMismatchWeight: 0,
						specialStackWeight: 0,
						repeatWeight: 1,
					},
					size,
				),
			});
			setIsRunning(false);
		}, 20);
	};

	return (
		<section className={clsx(styles.panel, "stack md")}>
			<div className="stack horizontal md items-center flex-wrap">
				<h2 className="text-md">Batch</h2>
				<SendouChipRadioGroup aria-label="Batch size">
					{BATCH_SIZES.map((batchSize) => (
						<SendouChipRadio
							key={batchSize}
							name="batch-size"
							value={String(batchSize)}
							checked={size === batchSize}
							onChange={() => setSize(batchSize)}
						>
							{batchSize} rolls
						</SendouChipRadio>
					))}
				</SendouChipRadioGroup>
				<SendouButton onClick={handleRun} isPending={isRunning}>
					Run
				</SendouButton>
			</div>
			<div className="text-xs text-lighter">
				Rolls with the current options compared to plain random rolls (1
				candidate, every weight 0, no repeat penalty, same popularity exponent),
				in lobbies of {SESSION_LENGTH} sets.
			</div>
			{stats ? <BatchResults stats={stats} /> : null}
		</section>
	);
}

function BatchResults({
	stats,
}: {
	stats: { tuned: BatchStats; plain: BatchStats };
}) {
	const rows: Array<{ label: string; value: (stats: BatchStats) => string }> = [
		{
			label: "Mean |win% − 50|",
			value: (batch) => `${batch.meanImbalancePp.toFixed(2)}pp`,
		},
		{
			label: "90th percentile |win% − 50|",
			value: (batch) => `${batch.p90ImbalancePp.toFixed(2)}pp`,
		},
		{
			label: `Rolls with a team in a shape under ${RARE_SHAPE_SHARE * 100}% of real teams`,
			value: (batch) => `${(batch.rareShapeShare * 100).toFixed(1)}%`,
		},
		{
			label: "Mean shape mismatch (players)",
			value: (batch) => batch.meanShapeMismatch.toFixed(2),
		},
		{
			label: "Mean weapons sharing a special",
			value: (batch) => batch.meanSpecialStack.toFixed(2),
		},
		{
			label: "Different weapons seen",
			value: (batch) =>
				`${batch.appearances.size} / ${WeaponRoll.ROLLABLE_WEAPON_IDS.length}`,
		},
		{
			label: "Mean base weapons repeated from the previous set",
			value: (batch) => batch.meanRepeatsOfPreviousSet.toFixed(2),
		},
		{
			label: "Sets repeating a base weapon of the previous set",
			value: (batch) => `${(batch.setsRepeatingShare * 100).toFixed(0)}%`,
		},
		{
			label: `Sets the most rolled base weapon is in, per ${SESSION_LENGTH} sets`,
			value: (batch) => batch.meanMostRolledCount.toFixed(1),
		},
		{
			label: "Time per roll",
			value: (batch) => `${batch.msPerRoll.toFixed(2)}ms`,
		},
	];

	const ratios = WeaponRoll.ROLLABLE_WEAPON_IDS.map((weaponId) => ({
		weaponId,
		ratio:
			(stats.tuned.appearances.get(weaponId) ?? 0) /
			(stats.plain.appearances.get(weaponId) ?? Number.EPSILON),
	})).filter(({ weaponId }) => stats.plain.appearances.has(weaponId));
	const sortedRatios = R.sortBy(ratios, [({ ratio }) => ratio, "desc"]);

	return (
		<div className="stack md">
			<table className={styles.table}>
				<thead>
					<tr>
						<th />
						<th>Current options</th>
						<th>Plain random</th>
					</tr>
				</thead>
				<tbody>
					{rows.map((row) => (
						<tr key={row.label}>
							<td>{row.label}</td>
							<td>{row.value(stats.tuned)}</td>
							<td>{row.value(stats.plain)}</td>
						</tr>
					))}
				</tbody>
			</table>
			<div className="stack sm">
				<h3 className="text-sm">
					Rolled more often than plain random (appearance ratio)
				</h3>
				<RatioStrip ratios={sortedRatios.slice(0, 16)} />
				<h3 className="text-sm">Rolled less often than plain random</h3>
				<RatioStrip ratios={sortedRatios.slice(-16).reverse()} />
			</div>
		</div>
	);
}

function RatioStrip({
	ratios,
}: {
	ratios: Array<{ weaponId: MainWeaponId; ratio: number }>;
}) {
	return (
		<div className={styles.ratioStrip}>
			{ratios.map(({ weaponId, ratio }) => (
				<div key={weaponId} className="stack xxs items-center text-xs">
					<WeaponImage weaponSplId={weaponId} variant="badge" size={32} />
					<span>×{ratio.toFixed(2)}</span>
				</div>
			))}
		</div>
	);
}

type WeaponRow = {
	weaponId: MainWeaponId;
	name: string;
	tier: WeaponRoll.WeaponTier;
	range: number;
	specialWeaponId: number;
	usage: number;
	strength: number;
	strengthSe: number;
	strengthByMode: Record<RankedModeShort, number>;
};

type SortKey =
	| "name"
	| "tier"
	| "range"
	| "special"
	| "usage"
	| "strength"
	| RankedModeShort;

type SortDirection = "asc" | "desc";

const SORT_VALUES: Record<SortKey, (row: WeaponRow) => string | number> = {
	name: (row) => row.name,
	tier: (row) => WeaponRoll.WEAPON_TIERS.indexOf(row.tier),
	range: (row) => row.range,
	special: (row) => row.specialWeaponId,
	usage: (row) => row.usage,
	strength: (row) => row.strength,
	SZ: (row) => row.strengthByMode.SZ,
	TC: (row) => row.strengthByMode.TC,
	RM: (row) => row.strengthByMode.RM,
	CB: (row) => row.strengthByMode.CB,
};

function WeaponTable({ mode }: { mode: ModeShort | null }) {
	const { t } = useTranslation(["weapons"]);
	const [sort, setSort] = useState<{ key: SortKey; direction: SortDirection }>({
		key: "strength",
		direction: "desc",
	});

	const rows: WeaponRow[] = WeaponRoll.ROLLABLE_WEAPON_IDS.map((weaponId) => ({
		weaponId,
		name: t(`weapons:MAIN_${weaponId}`),
		tier: WeaponRoll.tierOf(weaponId),
		range: WeaponRoll.rangeOf(weaponId),
		specialWeaponId: WeaponRoll.specialOf(weaponId),
		usage: WeaponRoll.usageOf(weaponId),
		...WeaponRoll.strengthOf(weaponId, mode),
		strengthByMode: Object.fromEntries(
			rankedModesShort.map((tableMode) => [
				tableMode,
				WeaponRoll.strengthOf(weaponId, tableMode).strength,
			]),
		) as Record<RankedModeShort, number>,
	}));
	const sorted = R.sortBy(rows, [SORT_VALUES[sort.key], sort.direction]);

	const handleSort = (key: SortKey) =>
		setSort((current) => ({
			key,
			direction:
				current.key === key
					? current.direction === "desc"
						? "asc"
						: "desc"
					: key === "name" || key === "tier"
						? "asc"
						: "desc",
		}));

	const header = (key: SortKey, children: ReactNode) => (
		<SortableHeader sortKey={key} sort={sort} onSort={() => handleSort(key)}>
			{children}
		</SortableHeader>
	);

	return (
		<section className="stack md">
			<h2 className="text-md">Weapons</h2>
			<div className="overflow-x-auto">
				<table className={styles.table}>
					<thead>
						<tr>
							{header("name", "Weapon")}
							{header("tier", "Tier")}
							{header("range", "Range")}
							{header("special", "Special")}
							{header("usage", "Usage")}
							{header("strength", `Strength (${mode ?? "all modes"})`)}
							{rankedModesShort.map((tableMode) => (
								<Fragment key={tableMode}>
									{header(tableMode, <ModeImage mode={tableMode} size={18} />)}
								</Fragment>
							))}
						</tr>
					</thead>
					<tbody>
						{sorted.map((row) => (
							<tr key={row.weaponId}>
								<td>
									<span className="stack horizontal sm items-center">
										<WeaponImage
											weaponSplId={row.weaponId}
											variant="badge"
											size={28}
										/>
										{row.name}
									</span>
								</td>
								<td>
									<TierLabel tier={row.tier} />
								</td>
								<td>{row.range.toFixed(1)}</td>
								<td>
									<SpecialWeaponImage
										specialWeaponId={WeaponRoll.specialOf(row.weaponId)}
										size={22}
									/>
								</td>
								<td>{(row.usage * 100).toFixed(2)}%</td>
								<td>
									<span className={strengthClassName(row.strength)}>
										{formatPp(row.strength)}
									</span>{" "}
									<span className="text-lighter text-xs">
										±{formatPp(row.strengthSe, false)}
									</span>
								</td>
								{rankedModesShort.map((tableMode) => (
									<td
										key={tableMode}
										className={strengthClassName(row.strengthByMode[tableMode])}
									>
										{formatPp(row.strengthByMode[tableMode])}
									</td>
								))}
							</tr>
						))}
					</tbody>
				</table>
			</div>
		</section>
	);
}

function SortableHeader({
	sortKey,
	sort,
	onSort,
	children,
}: {
	sortKey: SortKey;
	sort: { key: SortKey; direction: SortDirection };
	onSort: () => void;
	children: ReactNode;
}) {
	const isSorted = sort.key === sortKey;

	return (
		<th
			aria-sort={
				isSorted
					? sort.direction === "asc"
						? "ascending"
						: "descending"
					: undefined
			}
		>
			<button type="button" className={styles.sortButton} onClick={onSort}>
				{children}
				{isSorted ? (
					sort.direction === "asc" ? (
						<ArrowUp size={14} />
					) : (
						<ArrowDown size={14} />
					)
				) : null}
			</button>
		</th>
	);
}

function ShapeLabel({ team }: { team: MainWeaponId[] }) {
	const key = WeaponRoll.shapeKey(team);

	return (
		<span className="text-xs text-lighter">
			F-M-B {key} · {(WeaponRoll.shapeShare(key) * 100).toFixed(1)}% of real
			teams
		</span>
	);
}

function TierLabel({ tier }: { tier: WeaponRoll.WeaponTier }) {
	return (
		<span className={clsx(styles.tier, styles[`tier${tier}`])}>
			{tier.slice(0, 1)}
		</span>
	);
}

function Stat({ label, value }: { label: string; value: string }) {
	return (
		<div className="stack xxs">
			<span className="text-xxs text-lighter">{label}</span>
			<span className="font-semi-bold">{value}</span>
		</div>
	);
}

function runBatch(
	options: WeaponRoll.WeaponRollOptions,
	count: number,
): BatchStats {
	const startedAt = performance.now();
	const sessions = Array.from(
		{ length: Math.ceil(count / SESSION_LENGTH) },
		() => rollSession(options),
	);
	const results = sessions.flat();
	const msPerRoll = (performance.now() - startedAt) / results.length;

	const baseIdsOf = (result: WeaponRoll.WeaponRollResult) =>
		[...result.alpha, ...result.bravo].map(weaponIdToBaseWeaponId);
	const repeatsOfPreviousSet = sessions.flatMap((session) =>
		session.slice(1).map((result, i) => {
			const previousBaseIds = baseIdsOf(session[i]);
			return baseIdsOf(result).filter((baseId) =>
				previousBaseIds.includes(baseId),
			).length;
		}),
	);
	const mostRolledCounts = sessions.map((session) => {
		const counts = new Map<MainWeaponId, number>();
		for (const baseId of session.flatMap(baseIdsOf)) {
			counts.set(baseId, (counts.get(baseId) ?? 0) + 1);
		}
		return Math.max(...counts.values());
	});

	const imbalances = results
		.map((result) => Math.abs(result.alphaWinProbability - 0.5) * 100)
		.sort((a, b) => a - b);

	const appearances = new Map<MainWeaponId, number>();
	for (const result of results) {
		for (const weaponId of [...result.alpha, ...result.bravo]) {
			appearances.set(weaponId, (appearances.get(weaponId) ?? 0) + 1 / count);
		}
	}

	return {
		meanImbalancePp: R.mean(imbalances) ?? 0,
		p90ImbalancePp: imbalances[Math.floor(imbalances.length * 0.9)] ?? 0,
		rareShapeShare:
			results.filter((result) =>
				[result.alpha, result.bravo].some(
					(team) =>
						WeaponRoll.shapeShare(WeaponRoll.shapeKey(team)) < RARE_SHAPE_SHARE,
				),
			).length / count,
		meanShapeMismatch:
			R.mean(
				results.map((result) =>
					WeaponRoll.shapeMismatchCost(result.alpha, result.bravo),
				),
			) ?? 0,
		meanSpecialStack:
			R.mean(
				results.map(
					(result) =>
						WeaponRoll.specialStackCost(result.alpha) +
						WeaponRoll.specialStackCost(result.bravo),
				),
			) ?? 0,
		meanRepeatsOfPreviousSet: R.mean(repeatsOfPreviousSet) ?? 0,
		setsRepeatingShare:
			repeatsOfPreviousSet.filter((repeats) => repeats > 0).length /
			repeatsOfPreviousSet.length,
		meanMostRolledCount: R.mean(mostRolledCounts) ?? 0,
		appearances,
		msPerRoll,
	};
}

/** {@link SESSION_LENGTH} sets in a row of one lobby, each rolled knowing the ones before it. */
function rollSession(options: WeaponRoll.WeaponRollOptions) {
	const session: WeaponRoll.WeaponRollResult[] = [];
	for (let i = 0; i < SESSION_LENGTH; i++) {
		session.push(
			WeaponRoll.roll(options, {
				recentRolls: session
					.toReversed()
					.map((result) => [...result.alpha, ...result.bravo]),
			}),
		);
	}

	return session;
}

/** Percentage points of win probability the log-odds add over 50%. */
function formatPp(logOdds: number, signed = true) {
	const pp = (1 / (1 + Math.exp(-logOdds)) - 0.5) * 100;

	return `${signed && pp > 0 ? "+" : ""}${pp.toFixed(1)}pp`;
}

function strengthClassName(strength: number) {
	if (strength > 0.02) return "text-success";
	if (strength < -0.02) return "text-error";

	return undefined;
}
