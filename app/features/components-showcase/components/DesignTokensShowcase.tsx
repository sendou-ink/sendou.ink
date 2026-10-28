import clsx from "clsx";
import { Plus } from "lucide-react";
import * as React from "react";
import { SendouButton } from "~/components/elements/Button";
import {
	SendouChipRadio,
	SendouChipRadioGroup,
} from "~/components/elements/ChipRadio";
import { SendouSwitch } from "~/components/elements/Switch";
import { Input } from "~/components/Input";
import { Table } from "~/components/Table";
import { THEME_INPUT_LIMITS } from "~/utils/schema";
import styles from "./DesignTokensShowcase.module.css";
import { Annotated, DocSection, type Note, TokenName } from "./TokenDocs";

const UNITLESS_VALUE = /^-?[\d.]+$/;

type Preset = "default" | "min" | "max";

const PRESETS: Array<{ id: Preset; label: string }> = [
	{ id: "default", label: "Default" },
	{ id: "min", label: "Theme minimum" },
	{ id: "max", label: "Theme maximum" },
];

const PRESET_INPUTS: Record<Preset, Record<string, number> | null> = {
	default: null,
	min: {
		"--_radius-box": THEME_INPUT_LIMITS.RADIUS_MIN,
		"--_radius-field": THEME_INPUT_LIMITS.RADIUS_MIN,
		"--_radius-selector": THEME_INPUT_LIMITS.RADIUS_MIN,
		"--_border-width": THEME_INPUT_LIMITS.BORDER_WIDTH_MIN,
		"--_size-field": THEME_INPUT_LIMITS.SIZE_MIN,
		"--_size-selector": THEME_INPUT_LIMITS.SIZE_MIN,
		"--_size-spacing": THEME_INPUT_LIMITS.SIZE_MIN,
	},
	max: {
		"--_radius-box": THEME_INPUT_LIMITS.RADIUS_MAX,
		"--_radius-field": THEME_INPUT_LIMITS.RADIUS_MAX,
		"--_radius-selector": THEME_INPUT_LIMITS.RADIUS_MAX,
		"--_border-width": THEME_INPUT_LIMITS.BORDER_WIDTH_MAX,
		"--_size-field": THEME_INPUT_LIMITS.SIZE_MAX,
		"--_size-selector": THEME_INPUT_LIMITS.SIZE_MAX,
		"--_size-spacing": THEME_INPUT_LIMITS.SIZE_MAX,
	},
};

const KINDS = [
	{
		kind: "Box",
		radius: "--radius-box",
		size: "--s-* padding",
		use: "Contains other elements: cards, sections, dialogs, popovers",
	},
	{
		kind: "Field",
		radius: "--radius-field",
		size: "--field-size-*",
		use: "Interactive elements (buttons, inputs, selects) and any content child of a box, like a list row",
	},
	{
		kind: "Selector",
		radius: "--radius-selector",
		size: "--selector-size-*",
		use: "Small elements complementing fields: checkboxes, switches, badges, tags, pills",
	},
] as const;

const KIND_NOTES: Note[] = [
	{
		id: "box",
		tokens: ["--radius-box"],
		text: "Box: the card itself. Padding and gaps inside it come from the --s-* scale.",
		anchor: "top",
	},
	{
		id: "field",
		tokens: ["--field-size", "--radius-field", "--field-padding"],
		text: "Field: inputs and buttons share a height, so they line up in a row.",
	},
	{
		id: "row",
		tokens: ["--radius-field"],
		text: "A content child of a box is a field too, even when it is not interactive.",
	},
	{
		id: "selector",
		tokens: ["--selector-size-sm", "--radius-selector"],
		text: "Selector: checkboxes, switches and badges.",
		anchor: "bottom",
	},
	{
		id: "full",
		tokens: ["--radius-full", "--radius-avatar"],
		text: "Pills and circles. Avatars have their own token.",
		anchor: "bottom",
	},
];

const SPACING = [
	{ token: "--s-0-5", stack: "xxxs" },
	{ token: "--s-1", stack: "xxs" },
	{ token: "--s-1-5", stack: "xs" },
	{ token: "--s-2", stack: "sm" },
	{ token: "--s-2-5", stack: null },
	{ token: "--s-3", stack: "sm-plus" },
	{ token: "--s-4", stack: "md" },
	{ token: "--s-5", stack: null },
	{ token: "--s-6", stack: "md-plus" },
	{ token: "--s-8", stack: "lg" },
	{ token: "--s-10", stack: null },
	{ token: "--s-12", stack: "xl" },
	{ token: "--s-16", stack: "xxl" },
	{ token: "--s-24", stack: null },
	{ token: "--s-32", stack: null },
] as const;

const FONT_SIZES = [
	{ token: "--font-xl", use: "Page titles" },
	{ token: "--font-lg", use: "Section titles" },
	{ token: "--font-md", use: "Body text" },
	{ token: "--font-sm", use: "Dense body text, buttons, inputs" },
	{ token: "--font-xs", use: "Metadata, labels, hints" },
	{ token: "--font-2xs", use: "Badges, small print" },
	{ token: "--font-3xs", use: "Tiny counters and tags, use sparingly" },
] as const;

const FONT_WEIGHTS = [
	{ token: "--weight-extra", use: "Headings, numbers that need to pop" },
	{ token: "--weight-bold", use: "Titles, buttons, badges" },
	{ token: "--weight-semi", use: "Labels, tabs, emphasized text" },
	{ token: "--weight-body", use: "Body text" },
] as const;

const BORDERS = [
	{
		token: "--border-style",
		use: "Card outlines and dividers",
	},
	{
		token: "--border-style-high",
		use: "Borders that need to stand out, e.g. the SQ season banner",
	},
	{
		token: "--border-style-accent",
		use: "Accent borders, e.g. a selected item",
	},
	{
		token: "--focus-ring",
		use: "Keyboard focused element, applies on top of the border, it is not a border itself",
	},
	{
		token: "--focus-ring-error",
		use: "Focus of an invalid input",
	},
] as const;

const LAYOUT = [
	{ token: "--layout-nav-height", use: "Height of the top nav" },
	{ token: "--layout-sidenav-width", use: "Width of the side navs" },
	{ token: "--layout-main-padding", use: "Padding around the main content" },
	{
		token: "--layout-sticky-top",
		use: "top style of position: sticky elements, so they stick right below the nav",
	},
	{
		token: "--mobile-nav-height",
		use: "Height of the mobile tab bar, 0 while the mobile keyboard is open",
	},
	{
		token: "--layout-fuse-bottom-height",
		use: "Space kept free for the sticky footer ad, 0 for supporters",
	},
	{
		token: "--popover-boundary-top",
		use: "Popovers, menus and selects never cover what is above this",
	},
	{
		token: "--popover-boundary-bottom",
		use: "Same for the bottom, the mobile tab bar on small screens",
	},
	{
		token: "--floating-gap",
		use: "Gap between a popover and its trigger",
	},
	{
		token: "--floating-viewport-padding",
		use: "Minimum distance of a popover to the viewport edge",
	},
	{
		token: "--modal-margin-block",
		use: "Space above and below a dialog",
	},
	{ token: "--label-margin", use: "Gap between a label and its field" },
	{ token: "--field-size-icon", use: "Icons inside fields" },
] as const;

export function DesignTokensShowcase() {
	const [preset, setPreset] = React.useState<Preset>("default");
	const presetInputs = PRESET_INPUTS[preset];

	return (
		<div className="stack lg">
			<p className="text-lighter">
				Live documentation of the tokens in <code>app/styles/vars.css</code>{" "}
				that are not colors. Custom themes scale spacing, field and selector
				sizes, radii and border width, pick a preview to see the extremes a user
				can choose.
			</p>

			<div className="stack horizontal sm items-center flex-wrap">
				<span className="text-sm text-lighter">Preview with</span>
				<SendouChipRadioGroup>
					{PRESETS.map((option) => (
						<SendouChipRadio
							key={option.id}
							name="preset"
							value={option.id}
							checked={preset === option.id}
							onChange={() => setPreset(option.id)}
						>
							{option.label}
						</SendouChipRadio>
					))}
				</SendouChipRadioGroup>
			</div>

			<div
				key={preset}
				data-custom-theme={presetInputs ? true : undefined}
				style={presetInputs ?? undefined}
				className={clsx(styles.preview, "stack xl")}
			>
				<KindsSection />
				<SpacingSection />
				<SizesSection />
				<TypographySection />
				<BordersSection />
				<LayoutSection />
				<ThemeInputsSection />
			</div>
		</div>
	);
}

function KindsSection() {
	return (
		<DocSection title="Boxes, fields and selectors">
			<div className="stack md">
				<p>
					Every element is one of three kinds and takes the radius and size of
					its kind. Pick the kind first, the tokens follow from it.
				</p>
				<Table noRowHover>
					<thead>
						<tr>
							<th>Kind</th>
							<th>Radius</th>
							<th>Size</th>
							<th>Use for</th>
						</tr>
					</thead>
					<tbody>
						{KINDS.map((row) => (
							<tr key={row.kind}>
								<td>{row.kind}</td>
								<td>
									<code>{row.radius}</code>
								</td>
								<td>
									<code>{row.size}</code>
								</td>
								<td>{row.use}</td>
							</tr>
						))}
					</tbody>
				</Table>
				<Annotated notes={KIND_NOTES}>
					<div data-note="box" className={clsx(styles.mockCard, "stack md")}>
						<div className="stack horizontal sm items-center">
							<span data-note="full" className={styles.mockAvatar} />
							<span className={styles.mockTitle}>Team Olive Branch</span>
							<span data-note="selector" className={styles.mockBadge}>
								Verified
							</span>
						</div>
						<div data-note="field" className="stack horizontal sm">
							<Input placeholder="Invite a player" aria-label="Player name" />
							<SendouButton icon={<Plus />}>Invite</SendouButton>
						</div>
						<div data-note="row" className={styles.mockRow}>
							<span>Inkling Squad</span>
							<SendouSwitch size="small" defaultSelected>
								Notify
							</SendouSwitch>
						</div>
					</div>
				</Annotated>
			</div>
		</DocSection>
	);
}

function SpacingSection() {
	return (
		<DocSection title="Spacing">
			<div className="stack md">
				<p>
					Padding, margins and gaps come from the <code>--s-*</code> scale: a
					0.25rem grid (<code>--s-4</code> is 1rem) multiplied by the spacing
					size of the theme. A hardcoded rem or px value ignores the custom
					theme. For gaps between children prefer the <code>.stack</code>{" "}
					utility classes, they use the same scale.
				</p>
				<div className={styles.scale}>
					{SPACING.map((step) => (
						<div key={step.token} className={styles.scaleRow}>
							<TokenName token={step.token} />
							<span className={styles.scaleBarTrack}>
								<span
									className={styles.spacingBar}
									style={{ width: `var(${step.token})` }}
								/>
							</span>
							<TokenValue token={step.token} />
							<span className="text-xs text-lighter">
								{step.stack ? <code>.stack.{step.stack}</code> : null}
							</span>
						</div>
					))}
				</div>
			</div>
		</DocSection>
	);
}

function SizesSection() {
	return (
		<DocSection title="Field and selector sizes">
			<div className="stack md">
				<p>
					Fields and selectors come in a few sizes, scaled by their own size
					setting of the theme. Use the shared components where possible.
				</p>
				<div className={styles.sizes}>
					<SizeRow token="--field-size-xs" example='size="miniscule"'>
						<SendouButton size="miniscule">Button</SendouButton>
					</SizeRow>
					<SizeRow token="--field-size-sm" example='size="small"'>
						<SendouButton size="small">Button</SendouButton>
					</SizeRow>
					<SizeRow token="--field-size" example="default, inputs and selects">
						<div className="stack horizontal sm">
							<SendouButton>Button</SendouButton>
							<Input placeholder="Input" aria-label="Example input" />
						</div>
					</SizeRow>
					<SizeRow token="--field-size-lg" example='size="big"'>
						<SendouButton size="big">Button</SendouButton>
					</SizeRow>
					<SizeRow token="--selector-size-xs" example='switch size="small"'>
						<SendouSwitch size="small" aria-label="Small switch" />
					</SizeRow>
					<SizeRow token="--selector-size-sm" example="switch, checkbox">
						<div className="stack horizontal md items-center">
							<SendouSwitch defaultSelected aria-label="Switch" />
							<input type="checkbox" defaultChecked aria-label="Checkbox" />
						</div>
					</SizeRow>
					<SizeRow token="--selector-size" example="chip radio">
						<SendouChipRadioGroup>
							<SendouChipRadio
								name="size-example"
								value="chip"
								checked
								onChange={() => {}}
							>
								Chip
							</SendouChipRadio>
						</SendouChipRadioGroup>
					</SizeRow>
					<SizeRow token="--selector-size-lg" example='switch size="large"'>
						<SendouSwitch size="large" aria-label="Large switch" />
					</SizeRow>
				</div>
			</div>
		</DocSection>
	);
}

function SizeRow({
	token,
	example,
	children,
}: {
	token: string;
	example: string;
	children: React.ReactNode;
}) {
	return (
		<div className={styles.sizeRow}>
			<div className="stack xxs">
				<TokenName token={token} />
				<span className="text-xs text-lighter">
					<TokenValue token={token} /> · {example}
				</span>
			</div>
			<div>{children}</div>
		</div>
	);
}

function TypographySection() {
	return (
		<DocSection title="Typography">
			<div className="stack md">
				<p>
					Font sizes and weights are fixed, custom themes don&apos;t change
					them. <code>--line-height</code> (<TokenValue token="--line-height" />
					) is set on the body, so there is rarely a reason to touch it.
				</p>
				<div className={styles.typeScale}>
					{FONT_SIZES.map((size) => (
						<div key={size.token} className={styles.typeRow}>
							<div className="stack xxs">
								<TokenName token={size.token} />
								<span className="text-xs text-lighter">
									<TokenValue token={size.token} /> · {size.use}
								</span>
							</div>
							<span
								className={styles.typeSample}
								style={{ fontSize: `var(${size.token})` }}
							>
								Check in for Swim or Sink
							</span>
						</div>
					))}
				</div>
				<div className={styles.typeScale}>
					{FONT_WEIGHTS.map((weight) => (
						<div key={weight.token} className={styles.typeRow}>
							<div className="stack xxs">
								<TokenName token={weight.token} />
								<span className="text-xs text-lighter">
									<TokenValue token={weight.token} /> · {weight.use}
								</span>
							</div>
							<span
								className={styles.typeSample}
								style={{ fontWeight: `var(${weight.token})` }}
							>
								Check in for Swim or Sink
							</span>
						</div>
					))}
				</div>
			</div>
		</DocSection>
	);
}

function BordersSection() {
	return (
		<DocSection title="Borders and focus">
			<div className="stack md">
				<p>
					Borders are shorthands of <code>--border-width</code> (
					<TokenValue token="--border-width" />, set by the theme) and a border
					color. Use them as a whole, e.g.{" "}
					<code>border: var(--border-style)</code>, and only reach for{" "}
					<code>--border-width</code> when a side or color differs.
				</p>
				<div className={styles.borders}>
					{BORDERS.map((border) => (
						<div key={border.token} className={styles.borderSample}>
							<div
								className={styles.borderBox}
								style={
									border.token.startsWith("--focus")
										? {
												outline: `var(${border.token})`,
												outlineOffset: "2px",
											}
										: { border: `var(${border.token})` }
								}
							/>
							<TokenName token={border.token} />
							<span className="text-xs text-lighter">{border.use}</span>
						</div>
					))}
				</div>
			</div>
		</DocSection>
	);
}

function LayoutSection() {
	return (
		<DocSection title="Layout and overlays">
			<div className="stack md">
				<p>
					Fixed dimensions of the app shell and the floating layer. Read them
					instead of repeating their values, they change with the screen size,
					installed app mode and the virtual keyboard. See the overlays docs for
					how popovers use the boundaries.
				</p>
				<Table noRowHover>
					<thead>
						<tr>
							<th>Token</th>
							<th>Value</th>
							<th>Use for</th>
						</tr>
					</thead>
					<tbody>
						{LAYOUT.map((row) => (
							<tr key={row.token}>
								<td>
									<TokenName token={row.token} />
								</td>
								<td>
									<TokenValue token={row.token} />
								</td>
								<td>{row.use}</td>
							</tr>
						))}
					</tbody>
				</Table>
			</div>
		</DocSection>
	);
}

function ThemeInputsSection() {
	const sizeRange = `${THEME_INPUT_LIMITS.SIZE_MIN}–${THEME_INPUT_LIMITS.SIZE_MAX}×`;
	const radiusRange = `${THEME_INPUT_LIMITS.RADIUS_MIN * 4}–${THEME_INPUT_LIMITS.RADIUS_MAX * 4}px`;
	const rows = [
		{
			input: "--_size-spacing",
			range: sizeRange,
			drives: "--s-*",
			others: false,
		},
		{
			input: "--_size-field",
			range: sizeRange,
			drives: "--field-size-*",
			others: false,
		},
		{
			input: "--_size-selector",
			range: sizeRange,
			drives: "--selector-size-*",
			others: false,
		},
		{
			input: "--_border-width",
			range: `${THEME_INPUT_LIMITS.BORDER_WIDTH_MIN}–${THEME_INPUT_LIMITS.BORDER_WIDTH_MAX}px`,
			drives: "--border-width, --border-style-*",
			others: false,
		},
		{
			input: "--_radius-box / -field / -selector",
			range: radiusRange,
			drives: "--radius-box / -field / -selector",
			others: true,
		},
	];

	return (
		<DocSection title="Custom theme inputs">
			<div className="stack md">
				<p>
					Like the color inputs, the <code>--_*</code> values are never consumed
					directly. Sizes and border width only ever come from the viewer&apos;s
					own theme, the theme of a user or team page only brings its radii, so
					visiting a page never shifts the layout. Anything that must not scale
					(icons, avatars, the app shell) uses a fixed value.
				</p>
				<Table noRowHover>
					<thead>
						<tr>
							<th>Input</th>
							<th>Range</th>
							<th>Drives</th>
							<th>From other users&apos; themes</th>
						</tr>
					</thead>
					<tbody>
						{rows.map((row) => (
							<tr key={row.input}>
								<td>
									<code>{row.input}</code>
								</td>
								<td>{row.range}</td>
								<td>
									<code>{row.drives}</code>
								</td>
								<td>{row.others ? "Yes" : "No"}</td>
							</tr>
						))}
					</tbody>
				</Table>
			</div>
		</DocSection>
	);
}

function TokenValue({ token }: { token: string }) {
	const probeRef = React.useRef<HTMLSpanElement>(null);
	const [value, setValue] = React.useState<string | null>(null);

	React.useLayoutEffect(() => {
		const probe = probeRef.current;
		if (!probe) return;

		const raw = getComputedStyle(probe).getPropertyValue(token).trim();
		if (UNITLESS_VALUE.test(raw)) {
			setValue(raw);
			return;
		}

		const px = probe.getBoundingClientRect().width;
		setValue(`${Math.round(px * 10) / 10}px`);
	}, [token]);

	return (
		<span className={styles.tokenValue}>
			{value}
			<span
				ref={probeRef}
				className={styles.probe}
				style={{ width: `var(${token})` }}
			/>
		</span>
	);
}
