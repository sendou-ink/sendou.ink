import clsx from "clsx";
import { Check, CircleAlert, LogOut, Star } from "lucide-react";
import * as React from "react";
import { Link } from "react-router";
import { isDeepEqual } from "remeda";
import { Alert } from "~/components/Alert";
import { SendouButton } from "~/components/elements/Button";
import {
	SendouChipRadio,
	SendouChipRadioGroup,
} from "~/components/elements/ChipRadio";
import { SendouSwitch } from "~/components/elements/Switch";
import { Main } from "~/components/Main";
import { Table } from "~/components/Table";
import styles from "./components.colors.module.css";

type Scheme = "current" | "light" | "dark";

type AnchorSide = "right" | "top" | "bottom";

interface Note {
	id: string;
	tokens: string[];
	text: React.ReactNode;
	anchor?: AnchorSide;
}

const MIN_AA_CONTRAST = 4.5;
const MIN_LARGE_TEXT_CONTRAST = 3;

const FAMILIES = [
	{
		pattern: "--color-bg-x",
		role: "Surfaces",
		use: "Page, cards, tinted areas like a highlighted row or a status strip",
	},
	{
		pattern: "--color-fg-x",
		role: "Foreground on surfaces",
		use: "Text, icons, borders, outlines and indicators (dots, bars, checkmarks)",
	},
	{
		pattern: "--color-fill-x",
		role: "Fills that carry content",
		use: "Button, badge and pill backgrounds",
	},
	{
		pattern: "--color-fg-on-x",
		role: "Foreground on a fill",
		use: "The label or icon inside a --color-fill-x. Never anywhere else",
	},
] as const;

const OVERVIEW_NOTES: Note[] = [
	{
		id: "bg",
		tokens: ["--color-bg-accent"],
		text: "bg: a tinted surface. Any foreground token (here --color-fg-accent) sits on it.",
		anchor: "top",
	},
	{
		id: "fg",
		tokens: ["--color-fg-accent"],
		text: "fg: the text and border of an outlined button, readable on every surface.",
		anchor: "bottom",
	},
	{
		id: "fill",
		tokens: ["--color-fill-accent"],
		text: "fill: a solid background that holds content.",
		anchor: "top",
	},
	{
		id: "fg-on",
		tokens: ["--color-fg-on-accent"],
		text: "fg-on: the label on that fill. Dark on bright custom accents, light otherwise, so never hardcode white.",
		anchor: "bottom",
	},
];

const NEUTRAL_NOTES: Note[] = [
	{
		id: "page",
		tokens: ["--color-bg"],
		text: "The page. Default surface everything else sits on.",
	},
	{
		id: "card",
		tokens: ["--color-bg-high"],
		text: "One step up: cards, sections, dialogs, popovers.",
		anchor: "top",
	},
	{
		id: "chip",
		tokens: ["--color-bg-higher"],
		text: "Raised inside a card: chips, inputs, hovered rows, progress tracks.",
	},
	{
		id: "title",
		tokens: ["--color-text"],
		text: "Primary text. Readable on every neutral surface and on --color-bg-accent / --color-bg-second.",
	},
	{
		id: "meta",
		tokens: ["--color-text-high"],
		text: "Secondary text: metadata, hints, labels. 'high' is the scale step, not more emphasis.",
	},
	{
		id: "divider",
		tokens: ["--color-border", "--color-border-high"],
		text: "Dividers and card outlines. The -high variant for borders that need to stand out, like inputs.",
	},
];

const ACCENT_NOTES: Note[] = [
	{
		id: "tab",
		tokens: ["--color-fg-accent"],
		text: "Active tab text and its underline: foreground on a surface.",
		anchor: "top",
	},
	{
		id: "highlight",
		tokens: ["--color-bg-accent"],
		text: "Highlights 'you' or 'selected'. Text on it stays --color-text, accents on it --color-fg-accent.",
	},
	{
		id: "link",
		tokens: ["--color-fg-accent"],
		text: "Links and accent icons.",
	},
	{
		id: "button",
		tokens: ["--color-fill-accent", "--color-fg-on-accent"],
		text: "Primary button: always pair the fill with its fg-on.",
		anchor: "bottom",
	},
	{
		id: "switch",
		tokens: ["--color-fill-accent", "--color-fg-on-accent"],
		text: "Selected switches and chips use the same fill pair: fill for the track, fg-on for the thumb.",
	},
	{
		id: "focus",
		tokens: ["--color-fg-accent"],
		text: "Focus rings (--focus-ring) and accent borders (--border-style-accent) are foreground too.",
	},
];

const SECOND_NOTES: Note[] = [
	{
		id: "badge",
		tokens: ["--color-fill-second", "--color-fg-on-second"],
		text: "Badges that call attention: fill with its fg-on.",
	},
	{
		id: "bar",
		tokens: ["--color-fg-second"],
		text: "Indicators (bars, dots, checkmarks) are foreground, not fill: they need contrast against the surface, not a label on top.",
	},
	{
		id: "icon",
		tokens: ["--color-fg-second"],
		text: "Secondary text and icons, also available as the .text-theme-secondary utility.",
	},
	{
		id: "tint",
		tokens: ["--color-bg-second"],
		text: "Tinted secondary surface, with --color-text or --color-fg-second on it.",
	},
];

const STATUS_NOTES: Note[] = [
	{
		id: "alert",
		tokens: ["--color-info-low", "--color-info-high"],
		text: "Status surface: -low background with -high text. Same for success, warning and error.",
	},
	{
		id: "success",
		tokens: ["--color-success", "--color-text-inverse"],
		text: "Solid status fill with inverse text.",
		anchor: "bottom",
	},
	{
		id: "error-border",
		tokens: ["--color-error"],
		text: "The plain status color is for borders and icons.",
	},
];

const PAIRINGS = [
	{
		fg: "--color-text",
		bg: "--color-bg",
		verdict: "do",
		why: "Body text",
	},
	{
		fg: "--color-text-high",
		bg: "--color-bg-high",
		verdict: "do",
		why: "Secondary text in a card",
	},
	{
		fg: "--color-fg-accent",
		bg: "--color-bg-high",
		verdict: "do",
		why: "Accent link or icon in a card",
	},
	{
		fg: "--color-fg-accent",
		bg: "--color-bg-accent",
		verdict: "do",
		why: "Accent text on a tinted surface",
	},
	{
		fg: "--color-text",
		bg: "--color-bg-accent",
		verdict: "do",
		why: "Normal text on a tinted surface",
	},
	{
		fg: "--color-fg-on-accent",
		bg: "--color-fill-accent",
		verdict: "do",
		why: "Button label",
	},
	{
		fg: "--color-fg-second",
		bg: "--color-bg-second",
		verdict: "do",
		why: "Secondary text on its tint",
	},
	{
		fg: "--color-fg-on-second",
		bg: "--color-fill-second",
		verdict: "do",
		why: "Badge label",
	},
	{
		fg: "--color-fg-on-accent",
		bg: "--color-bg",
		verdict: "dont",
		why: "fg-on only belongs on its fill. In dark mode it is the page background color itself.",
	},
	{
		fg: "--color-fg-accent",
		bg: "--color-fill-accent",
		verdict: "dont",
		why: "fg and fill are the same color in dark mode, use --color-fg-on-accent.",
	},
	{
		fg: "--color-text-inverse",
		bg: "--color-fill-accent",
		verdict: "dont",
		why: "Works with the default theme but a bright custom accent (yellow, cyan...) gets a light fill that needs dark text. Use --color-fg-on-accent.",
	},
	{
		fg: "--color-fill-accent",
		bg: "--color-bg",
		verdict: "dont",
		why: "Fills are not text colors, a bright light mode fill can vanish on the page. Use --color-fg-accent.",
	},
] as const;

const REPLACEMENTS = [
	{ legacy: "--color-accent-low", use: "--color-bg-accent" },
	{
		legacy: "--color-accent",
		use: "--color-fill-accent (fills) or --color-fg-accent (text, borders)",
	},
	{ legacy: "--color-accent-high", use: "--color-fg-accent" },
	{ legacy: "--color-text-accent", use: "--color-fg-accent (renamed)" },
	{
		legacy: "--color-second-low / --color-second / --color-second-high",
		use: "the matching --color-*-second token",
	},
	{
		legacy: "--color-base-0 ... --color-base-7",
		use: "--color-bg-*, --color-text-* or --color-border-*",
	},
	{ legacy: "--_*", use: "nothing, these are custom theme inputs" },
] as const;

const REFERENCE = [
	{ tokens: ["--color-bg"], use: "Page background" },
	{ tokens: ["--color-bg-high"], use: "Cards, sections, dialogs" },
	{ tokens: ["--color-bg-higher"], use: "Raised elements inside a card" },
	{ tokens: ["--color-bg-nav"], use: "Top nav, side nav and mobile nav" },
	{
		tokens: ["--color-bg-accent", "--color-bg-second"],
		use: "Tinted surfaces",
	},
	{
		tokens: ["--color-fg-accent", "--color-fg-second"],
		use: "Text, icons, borders, outlines and indicators on any surface",
	},
	{
		tokens: ["--color-fill-accent", "--color-fill-second"],
		use: "Button, badge and pill backgrounds",
	},
	{
		tokens: ["--color-fg-on-accent", "--color-fg-on-second"],
		use: "Content on the matching fill, nowhere else",
	},
	{ tokens: ["--color-text"], use: "Primary text" },
	{ tokens: ["--color-text-high"], use: "Secondary text" },
	{
		tokens: ["--color-text-inverse"],
		use: "Text on solid status fills (--color-success, --color-error)",
	},
	{
		tokens: ["--color-text-on-light", "--color-text-on-dark"],
		use: "Text on colors that don't follow the scheme, like user picked tier list and tag colors. Fixed in both modes",
	},
	{
		tokens: ["--color-border", "--color-border-high"],
		use: "Dividers and outlines, -high for inputs and emphasis",
	},
	{
		tokens: [
			"--color-info-low",
			"--color-success-low",
			"--color-warning-low",
			"--color-error-low",
		],
		use: "Status surfaces",
	},
	{
		tokens: [
			"--color-info",
			"--color-success",
			"--color-warning",
			"--color-error",
		],
		use: "Status borders, icons and solid fills (with --color-text-inverse)",
	},
	{
		tokens: [
			"--color-info-high",
			"--color-success-high",
			"--color-warning-high",
			"--color-error-high",
		],
		use: "Text on the matching -low surface",
	},
	{
		tokens: ["--color-bg-badge", "--color-bg-ability"],
		use: "Fixed backdrops of badge and ability images",
	},
	{
		tokens: ["--color-chart-alpha", "--color-chart-bravo"],
		use: "The two sides in charts and timelines",
	},
	{
		tokens: ["--color-chart-splatted", "--color-chart-special"],
		use: "Player states in timelines, kept apart from the side colors",
	},
] as const;

export default function ComponentsColorsPage() {
	const [scheme, setScheme] = React.useState<Scheme>("current");

	return (
		<Main bigger className="stack lg">
			<div className="stack sm">
				<Link to="/components" className="text-sm">
					← Components
				</Link>
				<h1>Colors</h1>
				<p className="text-lighter">
					Live documentation of the color tokens in{" "}
					<code>app/styles/vars.css</code>. Every example below is rendered with
					the real tokens, so it follows your custom theme. Hover a note to
					highlight what it points at.
				</p>
			</div>

			<div className="stack horizontal sm items-center">
				<span className="text-sm text-lighter">Preview in</span>
				<SendouChipRadioGroup>
					{(["current", "light", "dark"] as const).map((option) => (
						<SendouChipRadio
							key={option}
							name="scheme"
							value={option}
							checked={scheme === option}
							onChange={() => setScheme(option)}
						>
							{option === "current" ? "Current scheme" : option}
						</SendouChipRadio>
					))}
				</SendouChipRadioGroup>
			</div>

			<div
				key={scheme}
				data-theme={scheme === "current" ? undefined : scheme}
				className={clsx(styles.preview, "stack xl")}
			>
				<OverviewSection />
				<NeutralSection />
				<AccentSection />
				<SecondSection />
				<StatusSection />
				<PairingsSection />
				<ReplacementsSection />
				<ReferenceSection />
			</div>
		</Main>
	);
}

function OverviewSection() {
	return (
		<DocSection title="The four kinds">
			<div className="stack md">
				<p>
					Accent and secondary colors are consumed through four kinds of token.
					Pick the surface or fill first, then the foreground that belongs to
					it. Every fg/bg combination below is contrast checked for any custom
					theme, other combinations are not.
				</p>
				<Table noRowHover>
					<thead>
						<tr>
							<th>Token</th>
							<th>Role</th>
							<th>Use for</th>
						</tr>
					</thead>
					<tbody>
						{FAMILIES.map((family) => (
							<tr key={family.pattern}>
								<td>
									<code>{family.pattern}</code>
								</td>
								<td>{family.role}</td>
								<td>{family.use}</td>
							</tr>
						))}
					</tbody>
				</Table>
				<Annotated notes={OVERVIEW_NOTES}>
					<div className={clsx(styles.mockCard, "stack md")}>
						<div className="stack horizontal sm items-center justify-between">
							<span className={styles.mockTitle}>In The Zone 42</span>
							<span data-note="bg" className={styles.mockAccentChip}>
								<Check size={14} /> Registered
							</span>
						</div>
						<span className={styles.mockMeta}>Saturday 20:00 · 48 teams</span>
						<div className="stack horizontal sm">
							<span data-note="fg" className={styles.noteTarget}>
								<SendouButton variant="outlined" icon={<LogOut />}>
									Leave
								</SendouButton>
							</span>
							<span data-note="fill" className={styles.noteTarget}>
								<SendouButton>
									<span data-note="fg-on">Check in</span>
								</SendouButton>
							</span>
						</div>
					</div>
				</Annotated>
			</div>
		</DocSection>
	);
}

function NeutralSection() {
	return (
		<DocSection title="Neutral surfaces and text">
			<Annotated notes={NEUTRAL_NOTES} stageNote="page">
				<div data-note="card" className={clsx(styles.mockCard, "stack md")}>
					<div className="stack xs">
						<span data-note="title" className={styles.mockTitle}>
							Swim or Sink #17
						</span>
						<span data-note="meta" className={styles.mockMeta}>
							Starts in 2 hours · 32 teams
						</span>
					</div>
					<hr data-note="divider" className={styles.mockDivider} />
					<div className="stack horizontal sm">
						<span data-note="chip" className={styles.mockNeutralChip}>
							Splat Zones
						</span>
						<span className={styles.mockNeutralChip}>Tower Control</span>
					</div>
				</div>
			</Annotated>
		</DocSection>
	);
}

function AccentSection() {
	return (
		<DocSection title="Accent">
			<Annotated notes={ACCENT_NOTES}>
				<div className={clsx(styles.mockCard, "stack md")}>
					<div className={styles.mockTabs}>
						<span data-note="tab" className={styles.mockTab} data-active>
							Standings
						</span>
						<span className={styles.mockTab}>Bracket</span>
						<span className={styles.mockTab}>Teams</span>
					</div>
					<div className="stack xs">
						<div className={styles.mockRow}>
							<span>Olive Branch</span>
							<span>3-1</span>
						</div>
						<div data-note="highlight" className={styles.mockRowHighlighted}>
							<span>Your team</span>
							<span>2-2</span>
						</div>
						<div className={styles.mockRow}>
							<span>Inkling Squad</span>
							<span>1-3</span>
						</div>
					</div>
					<span data-note="link" className={styles.mockLink}>
						View full standings
					</span>
					<div className="stack horizontal md items-center flex-wrap">
						<span data-note="button" className={styles.noteTarget}>
							<SendouButton>Report score</SendouButton>
						</span>
						<span data-note="switch" className={styles.noteTarget}>
							<SendouSwitch defaultSelected>Notify me</SendouSwitch>
						</span>
					</div>
					<span data-note="focus" className={styles.mockFocused}>
						Focused element
					</span>
				</div>
			</Annotated>
		</DocSection>
	);
}

function SecondSection() {
	return (
		<DocSection title="Secondary">
			<Annotated notes={SECOND_NOTES}>
				<div className={clsx(styles.mockCard, "stack md")}>
					<div className="stack horizontal sm items-center">
						<span className={styles.mockTitle}>Season stats</span>
						<span data-note="badge" className={styles.mockSecondBadge}>
							NEW
						</span>
					</div>
					<div className={styles.mockStat}>
						<span className={styles.mockMeta}>Win rate</span>
						<div className={styles.mockTrack}>
							<div
								data-note="bar"
								className={styles.mockBar}
								style={{ width: "64%" }}
							/>
						</div>
						<span>64%</span>
					</div>
					<span
						data-note="icon"
						className={clsx(styles.mockIconText, "text-theme-secondary")}
					>
						<Star size={16} /> Top 500
					</span>
					<div data-note="tint" className={styles.mockSecondTint}>
						Season 8 ends in 3 days
					</div>
				</div>
			</Annotated>
		</DocSection>
	);
}

function StatusSection() {
	return (
		<DocSection title="Status">
			<Annotated notes={STATUS_NOTES}>
				<div className={clsx(styles.mockCard, "stack md")}>
					<div data-note="alert">
						<Alert>Check-in opens in 30 minutes</Alert>
					</div>
					<Alert variation="WARNING">Your roster is not full</Alert>
					<Alert variation="SUCCESS">Registration complete</Alert>
					<Alert variation="ERROR">Match reported incorrectly</Alert>
					<div className="stack horizontal sm">
						<span data-note="success" className={styles.noteTarget}>
							<SendouButton variant="success">Confirm</SendouButton>
						</span>
						<SendouButton variant="destructive">Delete</SendouButton>
					</div>
					<div data-note="error-border" className={styles.mockErrorInput}>
						<span>abc</span>
						<CircleAlert size={18} />
					</div>
				</div>
			</Annotated>
		</DocSection>
	);
}

function PairingsSection() {
	return (
		<DocSection title="Pairings">
			<div className="stack md">
				<p>
					Contrast ratios are measured live for the current preview. A
					&quot;don&apos;t&quot; can pass here and still fail for another scheme
					or custom theme, which is why the pairing matters and not the number
					you happen to see.
				</p>
				<div className={styles.pairings}>
					{PAIRINGS.map((pairing) => (
						<ContrastSample key={`${pairing.fg}-${pairing.bg}`} {...pairing} />
					))}
				</div>
			</div>
		</DocSection>
	);
}

function ReplacementsSection() {
	return (
		<DocSection title="Don't consume directly">
			<div className="stack md">
				<p>
					These are the building blocks behind the tokens above. They change
					meaning between light and dark mode and custom themes can push them to
					values that only work in their intended role.
				</p>
				<Table noRowHover>
					<thead>
						<tr>
							<th>Instead of</th>
							<th>Use</th>
						</tr>
					</thead>
					<tbody>
						{REPLACEMENTS.map((replacement) => (
							<tr key={replacement.legacy}>
								<td>
									<code className={styles.strikethrough}>
										{replacement.legacy}
									</code>
								</td>
								<td>{replacement.use}</td>
							</tr>
						))}
					</tbody>
				</Table>
			</div>
		</DocSection>
	);
}

function ReferenceSection() {
	return (
		<DocSection title="Reference">
			<Table noRowHover>
				<thead>
					<tr>
						<th>Token</th>
						<th>Use for</th>
					</tr>
				</thead>
				<tbody>
					{REFERENCE.map((row) => (
						<tr key={row.tokens.join()}>
							<td>
								<div className="stack xs">
									{row.tokens.map((token) => (
										<TokenName key={token} token={token} />
									))}
								</div>
							</td>
							<td>{row.use}</td>
						</tr>
					))}
				</tbody>
			</Table>
		</DocSection>
	);
}

function DocSection({
	title,
	children,
}: {
	title: string;
	children: React.ReactNode;
}) {
	return (
		<section className="stack md">
			<h2 className={styles.sectionTitle}>{title}</h2>
			{children}
		</section>
	);
}

function TokenName({ token }: { token: string }) {
	return (
		<span className={styles.tokenName}>
			<span
				className={styles.swatch}
				style={{ backgroundColor: `var(${token})` }}
			/>
			<code>{token}</code>
		</span>
	);
}

function ContrastSample({
	fg,
	bg,
	verdict,
	why,
}: {
	fg: string;
	bg: string;
	verdict: "do" | "dont";
	why: string;
}) {
	const sampleRef = React.useRef<HTMLDivElement>(null);
	const [ratio, setRatio] = React.useState<number | null>(null);

	React.useLayoutEffect(() => {
		if (!sampleRef.current) return;

		const style = getComputedStyle(sampleRef.current);
		setRatio(contrastRatio(style.color, style.backgroundColor));
	}, []);

	return (
		<div className={styles.pairing} data-verdict={verdict}>
			<div
				ref={sampleRef}
				className={styles.pairingSample}
				style={{ color: `var(${fg})`, backgroundColor: `var(${bg})` }}
			>
				Aa Check in
			</div>
			<div className="stack xs">
				<div className="stack horizontal sm items-center justify-between">
					<span className={styles.verdict} data-verdict={verdict}>
						{verdict === "do" ? "Do" : "Don't"}
					</span>
					{ratio !== null ? <ContrastBadge ratio={ratio} /> : null}
				</div>
				<TokenName token={fg} />
				<span className="text-xs text-lighter">on</span>
				<TokenName token={bg} />
				<span className="text-xs text-lighter">{why}</span>
			</div>
		</div>
	);
}

function ContrastBadge({ ratio }: { ratio: number }) {
	const level =
		ratio >= MIN_AA_CONTRAST
			? "pass"
			: ratio >= MIN_LARGE_TEXT_CONTRAST
				? "large"
				: "fail";

	return (
		<span className={styles.contrastBadge} data-level={level}>
			{ratio.toFixed(1)}:1{" "}
			{level === "pass" ? "AA" : level === "large" ? "AA large" : "fail"}
		</span>
	);
}

interface Point {
	x: number;
	y: number;
}

interface Rect extends Point {
	width: number;
	height: number;
}

interface NoteGeometry {
	id: string;
	side: AnchorSide;
	target: Rect;
	anchor: Point;
	start: Point;
}

interface AnnotationGeometry {
	isSideLayout: boolean;
	gutterX: number;
	notes: NoteGeometry[];
}

function Annotated({
	notes,
	stageNote,
	children,
}: {
	notes: Note[];
	/** note id pointing at the stage itself */
	stageNote?: string;
	children: React.ReactNode;
}) {
	const markerId = React.useId();
	const containerRef = React.useRef<HTMLDivElement>(null);
	const stageRef = React.useRef<HTMLDivElement>(null);
	const labelsRef = React.useRef<HTMLOListElement>(null);
	const [geometry, setGeometry] = React.useState<AnnotationGeometry | null>(
		null,
	);
	const [activeNoteId, setActiveNoteId] = React.useState<string | null>(null);

	React.useLayoutEffect(() => {
		const container = containerRef.current;
		const stage = stageRef.current;
		const labels = labelsRef.current;
		if (!container || !stage || !labels) return;

		const measure = () => {
			const next = measureAnnotations({ container, stage, labels });
			setGeometry((previous) =>
				previous && isDeepEqual(previous, next) ? previous : next,
			);
		};

		const observer = new ResizeObserver(measure);
		observer.observe(container);
		for (const target of stage.querySelectorAll("[data-note]")) {
			observer.observe(target);
		}

		return () => observer.disconnect();
	}, []);

	const activeTarget = geometry?.notes.find(
		(note) => note.id === activeNoteId,
	)?.target;

	return (
		<div ref={containerRef} className={styles.annotated}>
			<div className={styles.annotatedGrid}>
				<div ref={stageRef} className={styles.stage} data-note={stageNote}>
					{children}
				</div>
				<ol ref={labelsRef} className={styles.notes}>
					{notes.map((note, index) => (
						<li
							key={note.id}
							data-note-label={note.id}
							data-note-anchor={note.anchor ?? "right"}
							data-active={note.id === activeNoteId}
							className={styles.note}
							onMouseEnter={() => setActiveNoteId(note.id)}
							onMouseLeave={() => setActiveNoteId(null)}
						>
							<span data-note-marker className={styles.marker}>
								{index + 1}
							</span>
							<div className="stack xs">
								{note.tokens.map((token) => (
									<TokenName key={token} token={token} />
								))}
								<span className="text-xs text-lighter">{note.text}</span>
							</div>
						</li>
					))}
				</ol>
			</div>

			{activeTarget ? (
				<div
					className={styles.targetHighlight}
					style={{
						left: activeTarget.x,
						top: activeTarget.y,
						width: activeTarget.width,
						height: activeTarget.height,
					}}
				/>
			) : null}

			{geometry?.isSideLayout ? (
				<svg className={styles.arrows} aria-hidden="true">
					<defs>
						{(["idle", "active"] as const).map((state) => (
							<marker
								key={state}
								id={`${markerId}-${state}`}
								markerWidth="8"
								markerHeight="8"
								refX="7"
								refY="4"
								orient="auto"
							>
								<path
									d="M0,0 L8,4 L0,8 z"
									className={styles.arrowHead}
									data-active={state === "active"}
								/>
							</marker>
						))}
					</defs>
					{geometry.notes.map((note) => {
						const isActive = note.id === activeNoteId;

						return (
							<path
								key={note.id}
								d={arrowPath(note, geometry.gutterX)}
								className={styles.arrow}
								data-active={isActive}
								markerEnd={`url(#${markerId}-${isActive ? "active" : "idle"})`}
							/>
						);
					})}
				</svg>
			) : (
				geometry?.notes.map((note) => (
					<span
						key={note.id}
						className={styles.pin}
						style={{ left: note.anchor.x, top: note.anchor.y }}
						aria-hidden="true"
					>
						{notes.findIndex((candidate) => candidate.id === note.id) + 1}
					</span>
				))
			)}
		</div>
	);
}

function measureAnnotations({
	container,
	stage,
	labels,
}: {
	container: HTMLElement;
	stage: HTMLElement;
	labels: HTMLElement;
}): AnnotationGeometry {
	const origin = container.getBoundingClientRect();
	const relative = (element: Element): Rect => {
		const rect = element.getBoundingClientRect();
		return {
			x: Math.round(rect.left - origin.left),
			y: Math.round(rect.top - origin.top),
			width: Math.round(rect.width),
			height: Math.round(rect.height),
		};
	};

	const notes: NoteGeometry[] = [];
	for (const label of labels.querySelectorAll<HTMLElement>(
		"[data-note-label]",
	)) {
		const id = label.dataset.noteLabel;
		const target =
			stage.dataset.note === id
				? stage
				: stage.querySelector(`[data-note="${id}"]`);
		const marker = label.querySelector("[data-note-marker]");
		if (!id || !target || !marker) continue;

		const side = (label.dataset.noteAnchor ?? "right") as AnchorSide;
		const targetRect = relative(target);
		const markerRect = relative(marker);

		notes.push({
			id,
			side,
			target: targetRect,
			anchor: anchorPoint(targetRect, side),
			start: { x: markerRect.x - 4, y: markerRect.y + markerRect.height / 2 },
		});
	}

	const stageRight = stage.getBoundingClientRect().right;
	const labelsLeft = labels.getBoundingClientRect().left;

	return {
		isSideLayout: labelsLeft >= stageRight,
		gutterX: Math.round(
			stageRight - origin.left + (labelsLeft - stageRight) / 4,
		),
		notes,
	};
}

function anchorPoint(rect: Rect, side: AnchorSide): Point {
	switch (side) {
		case "top":
			return { x: rect.x + rect.width / 2, y: rect.y };
		case "bottom":
			return { x: rect.x + rect.width / 2, y: rect.y + rect.height };
		case "right":
			return { x: rect.x + rect.width, y: rect.y + rect.height / 2 };
	}
}

/** S-curves through the gap between stage and notes, entering a right anchor horizontally so the arrow doesn't cross content */
function arrowPath({ start, anchor, side }: NoteGeometry, gutterX: number) {
	const midX = (start.x + gutterX) / 2;
	const verticalBend = 36;

	if (side === "right") {
		return `M ${start.x} ${start.y} C ${midX} ${start.y}, ${midX} ${anchor.y}, ${gutterX} ${anchor.y} L ${anchor.x} ${anchor.y}`;
	}

	const controlY =
		side === "top" ? anchor.y - verticalBend : anchor.y + verticalBend;

	return `M ${start.x} ${start.y} C ${midX} ${start.y}, ${anchor.x} ${controlY}, ${anchor.x} ${anchor.y}`;
}

let colorCanvasContext: CanvasRenderingContext2D | null = null;

/** WCAG 2 contrast ratio between two CSS colors, resolved by drawing them to a canvas */
function contrastRatio(first: string, second: string) {
	const [lighter, darker] = [
		relativeLuminance(first),
		relativeLuminance(second),
	].sort((a, b) => b - a);

	return (lighter! + 0.05) / (darker! + 0.05);
}

function relativeLuminance(color: string) {
	colorCanvasContext ??= document
		.createElement("canvas")
		.getContext("2d", { willReadFrequently: true });
	if (!colorCanvasContext) return 0;

	colorCanvasContext.clearRect(0, 0, 1, 1);
	colorCanvasContext.fillStyle = color;
	colorCanvasContext.fillRect(0, 0, 1, 1);
	const [r, g, b] = colorCanvasContext.getImageData(0, 0, 1, 1).data;

	const linear = (channel = 0) => {
		const value = channel / 255;
		return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
	};

	return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}
