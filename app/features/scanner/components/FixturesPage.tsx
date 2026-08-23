import clsx from "clsx";
import { type ReactNode, useEffect, useState } from "react";
import { useSearchParam } from "~/modules/search-params/hooks";
import { mainWeaponImageUrl, SCANNER_PAGE } from "~/utils/urls";
import { CANONICAL_HEIGHT, CANONICAL_WIDTH, type Roi } from "../core/canonical";
import type { PlayerStatusLayout } from "../core/detectors/objective/player-status";
import * as objective from "../core/detectors/objective/rois";
import type { FixtureListItem } from "../routes/scanner.fixtures";
import { scannerSearchParams } from "../scanner-search-params";
import { newInspectKey, putInspectFrame } from "../store/inspect";
import styles from "./FixturesPage.module.css";
import { mainWeaponLabel } from "./labels";
import { formatTimer, RoiCrop } from "./ScreenshotPage";

const FIXTURES_ENDPOINT = "/scanner/fixtures";
/** Filtering down to this many cases opens every card, for one-glance review */
const AUTO_EXPAND_MAX = 8;

const SLOT_CENTERS: Record<
	PlayerStatusLayout,
	readonly [readonly number[], readonly number[]]
> = {
	even: objective.STATUS_SLOT_CENTERS_EVEN,
	"narrow-right": objective.STATUS_SLOT_CENTERS_NARROW_RIGHT,
	"narrow-left": objective.STATUS_SLOT_CENTERS_NARROW_LEFT,
};

type ExpectedData = NonNullable<FixtureListItem["expected"]["data"]>;

export function FixturesPage() {
	const [q, setQ] = useSearchParam(scannerSearchParams, "q");
	const [fixtures, setFixtures] = useState<FixtureListItem[] | null>(null);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		let cancelled = false;
		fetch(FIXTURES_ENDPOINT)
			.then((res) =>
				res.ok
					? (res.json() as Promise<{ fixtures: FixtureListItem[] }>)
					: Promise.reject(new Error(`fixture list failed (${res.status})`)),
			)
			.then(
				(body) => {
					if (!cancelled) setFixtures(body.fixtures);
				},
				(e) => {
					if (!cancelled) setError(String(e));
				},
			);
		return () => {
			cancelled = true;
		};
	}, []);

	const terms = q
		.split(",")
		.map((term) => term.trim().toLowerCase())
		.filter(Boolean);
	const filtered = (fixtures ?? []).filter(
		(fixture) =>
			terms.length === 0 ||
			terms.some((term) =>
				`${fixture.detector}/${fixture.name}`.toLowerCase().includes(term),
			),
	);
	const autoExpand = filtered.length > 0 && filtered.length <= AUTO_EXPAND_MAX;

	const groups = new Map<string, FixtureListItem[]>();
	for (const fixture of filtered) {
		const group = groups.get(fixture.detector) ?? [];
		group.push(fixture);
		groups.set(fixture.detector, group);
	}

	return (
		<div className={styles.page}>
			<div className={styles.controls}>
				<input
					type="search"
					className={styles.filter}
					value={q}
					onChange={(e) => setQ(e.target.value)}
					placeholder="Narrow by name substring — comma separates alternatives"
				/>
				<span className={styles.count}>
					{fixtures
						? `${filtered.length} / ${fixtures.length} fixtures`
						: "loading…"}
				</span>
			</div>
			<p className={styles.hint}>
				Ground-truth review: check each expected label against its frame. The
				filter lives in the URL, so a narrowed selection can be shared as a
				link.
			</p>
			{error ? <p className="text-error">{error}</p> : null}
			{[...groups.entries()].map(([detector, group]) => (
				<section key={detector} className={styles.group}>
					<h2 className={styles.groupTitle}>
						{detector} <span className={styles.count}>({group.length})</span>
					</h2>
					{group.map((fixture) => (
						<FixtureCard
							key={`${fixture.detector}/${fixture.name}`}
							fixture={fixture}
							autoExpand={autoExpand}
						/>
					))}
				</section>
			))}
		</div>
	);
}

function frameUrl(fixture: FixtureListItem): string {
	return `${FIXTURES_ENDPOINT}/${encodeURIComponent(fixture.detector)}/${encodeURIComponent(fixture.name)}`;
}

/** Re-analyze the frame in the screenshot tab via the cross-tab handoff. */
function inspectFixture(url: string) {
	const key = newInspectKey();
	window.open(
		scannerSearchParams.href(SCANNER_PAGE, { tab: "screenshot", inspect: key }),
		"_blank",
	);
	void fetch(url)
		.then((res) => res.blob())
		.then((blob) => putInspectFrame(key, blob));
}

function FixtureCard(props: { fixture: FixtureListItem; autoExpand: boolean }) {
	const { fixture } = props;
	const [openOverride, setOpenOverride] = useState<boolean | null>(null);
	const open = openOverride ?? props.autoExpand;
	const url = frameUrl(fixture);
	const notes = fixture.expected.options?.notes;
	const skipFields = fixture.expected.options?.skipFields;

	return (
		<article className={styles.card}>
			<header className={styles.cardHeader}>
				<button
					type="button"
					className={styles.cardToggle}
					onClick={() => setOpenOverride(!open)}
				>
					<span className={styles.cardChevron}>{open ? "▾" : "▸"}</span>
					{fixture.name}
				</button>
				<span className={styles.cardEvent}>{fixture.expected.event}</span>
				<button type="button" onClick={() => inspectFixture(url)}>
					Inspect
				</button>
			</header>
			{open ? (
				<div className={styles.cardBody}>
					<a href={url} target="_blank" rel="noreferrer">
						<img
							className={styles.frameImg}
							src={url}
							alt={fixture.name}
							loading="lazy"
						/>
					</a>
					<div className={styles.expected}>
						{notes ? <p className={styles.notes}>{notes}</p> : null}
						{skipFields && skipFields.length > 0 ? (
							<p className={styles.skips}>
								skipped fields: {skipFields.join(", ")}
							</p>
						) : null}
						<ExpectedDetail fixture={fixture} url={url} />
					</div>
				</div>
			) : null}
		</article>
	);
}

function ExpectedDetail(props: { fixture: FixtureListItem; url: string }) {
	const { event, data } = props.fixture.expected;
	const richView =
		event === "PlayerStatus" ||
		event === "StripWeapons" ||
		event === "Objective";
	const frame = useNormalizedFrame(props.url, richView);
	const [jsonOpen, setJsonOpen] = useState(!richView);

	return (
		<>
			{data && event === "PlayerStatus" ? (
				<PlayerStatusExpected frame={frame} data={data} />
			) : null}
			{data && event === "StripWeapons" ? (
				<StripWeaponsExpected frame={frame} data={data} />
			) : null}
			{data && event === "Objective" ? (
				<ObjectiveExpected frame={frame} data={data} />
			) : null}
			<details
				open={jsonOpen}
				onToggle={(e) => setJsonOpen(e.currentTarget.open)}
			>
				<summary className={styles.jsonSummary}>expected.json</summary>
				<pre className={styles.json}>
					{JSON.stringify(props.fixture.expected, null, 2)}
				</pre>
			</details>
		</>
	);
}

/** The fixture frame drawn at canonical size, for ROI crops. */
function useNormalizedFrame(
	url: string,
	enabled: boolean,
): HTMLCanvasElement | null {
	const [frame, setFrame] = useState<HTMLCanvasElement | null>(null);
	useEffect(() => {
		if (!enabled) return;
		let cancelled = false;
		const image = new Image();
		image.onload = () => {
			if (cancelled) return;
			const canvas = document.createElement("canvas");
			canvas.width = CANONICAL_WIDTH;
			canvas.height = CANONICAL_HEIGHT;
			canvas
				.getContext("2d")!
				.drawImage(image, 0, 0, CANONICAL_WIDTH, CANONICAL_HEIGHT);
			setFrame(canvas);
		};
		image.src = url;
		return () => {
			cancelled = true;
		};
	}, [url, enabled]);
	return frame;
}

function statusSlotRoi(cx: number): Roi {
	return { x: cx - 55, y: 25, w: 110, h: 115 };
}

/** Both teams' icon strips cropped per slot, expected label under each icon. */
function SlotStrips(props: {
	frame: HTMLCanvasElement;
	layout: PlayerStatusLayout;
	slotCaption: (side: 0 | 1, slot: number) => ReactNode;
	slotClassName?: (side: 0 | 1, slot: number) => string | undefined;
}) {
	const centers = SLOT_CENTERS[props.layout];
	return (
		<div className={styles.strips}>
			{([0, 1] as const).map((side) => (
				<div key={side} className={styles.strip}>
					{centers[side].map((cx, slot) => (
						<figure
							key={slot}
							className={clsx(styles.slot, props.slotClassName?.(side, slot))}
						>
							<RoiCrop
								frame={props.frame}
								roi={statusSlotRoi(cx)}
								scale={0.75}
							/>
							<figcaption>{props.slotCaption(side, slot)}</figcaption>
						</figure>
					))}
				</div>
			))}
		</div>
	);
}

function PlayerStatusExpected(props: {
	frame: HTMLCanvasElement | null;
	data: ExpectedData;
}) {
	const { data } = props;
	const layout = data.layout ?? "even";
	return (
		<div className={styles.rich}>
			<div className={styles.richStats}>
				<span>
					layout <b>{layout}</b>
				</span>
				<span>
					cast <b>{data.cast ? "yes" : "unknown"}</b>
				</span>
				{typeof data.time === "number" ? (
					<span>
						time <b>{formatTimer(data.time)}</b>
					</span>
				) : null}
			</div>
			{props.frame ? (
				<SlotStrips
					frame={props.frame}
					layout={layout}
					slotCaption={(side, slot) =>
						data.dead?.[side]?.[slot]
							? "✗ dead"
							: data.special?.[side]?.[slot]
								? "★ special"
								: "alive"
					}
					slotClassName={(side, slot) =>
						data.dead?.[side]?.[slot]
							? styles.slotDead
							: data.special?.[side]?.[slot]
								? styles.slotSpecial
								: undefined
					}
				/>
			) : null}
		</div>
	);
}

function StripWeaponsExpected(props: {
	frame: HTMLCanvasElement | null;
	data: ExpectedData;
}) {
	const { data } = props;
	const layout = data.layout ?? "even";
	return (
		<div className={styles.rich}>
			<div className={styles.richStats}>
				<span>
					layout <b>{layout}</b>
				</span>
			</div>
			{props.frame ? (
				<SlotStrips
					frame={props.frame}
					layout={layout}
					slotCaption={(side, slot) => {
						const weaponId = data.weapons?.[side]?.[slot] ?? null;
						if (weaponId === null) return "skipped";
						return (
							<>
								<img
									className={styles.weaponIcon}
									src={`${mainWeaponImageUrl(weaponId)}.avif`}
									alt=""
								/>
								{mainWeaponLabel(weaponId) ?? weaponId}
							</>
						);
					}}
				/>
			) : null}
		</div>
	);
}

function ObjectiveExpected(props: {
	frame: HTMLCanvasElement | null;
	data: ExpectedData;
}) {
	const { data } = props;
	return (
		<div className={styles.rich}>
			<div className={styles.richStats}>
				<span>
					control{" "}
					<b>
						{data.control?.[0] ? "left" : data.control?.[1] ? "right" : "none"}
					</b>
				</span>
				<span>
					penalty{" "}
					<b>
						{data.penalty?.[0] ?? "—"} / {data.penalty?.[1] ?? "—"}
					</b>
				</span>
			</div>
			{props.frame ? (
				<div className={styles.objectiveCrops}>
					<figure className={styles.slot}>
						<RoiCrop frame={props.frame} roi={objective.SCORE_ROIS[0]} />
						<figcaption>left count {data.score?.[0] ?? "?"}</figcaption>
					</figure>
					<figure className={styles.slot}>
						<RoiCrop frame={props.frame} roi={objective.TIMER_DIGIT_ROI} />
						<figcaption>timer {formatTimer(data.time ?? null)}</figcaption>
					</figure>
					<figure className={styles.slot}>
						<RoiCrop frame={props.frame} roi={objective.SCORE_ROIS[1]} />
						<figcaption>right count {data.score?.[1] ?? "?"}</figcaption>
					</figure>
				</div>
			) : null}
		</div>
	);
}
