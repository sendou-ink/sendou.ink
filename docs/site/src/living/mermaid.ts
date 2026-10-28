/** Mermaid's theme variables drawn from the app's design tokens (`app/styles/vars.css`). */
const THEME_TOKENS = {
	background: "--color-bg",
	primaryColor: "--color-bg-high",
	// the same as the fill, the boxes are drawn without an outline
	primaryBorderColor: "--color-bg-high",
	nodeBorder: "--color-bg-high",
	primaryTextColor: "--color-text",
	secondaryColor: "--color-bg-higher",
	secondaryBorderColor: "--color-border",
	secondaryTextColor: "--color-text",
	tertiaryColor: "--color-bg-accent",
	tertiaryBorderColor: "--color-accent",
	tertiaryTextColor: "--color-fg-accent",
	textColor: "--color-text",
	lineColor: "--color-text-high",
	edgeLabelBackground: "--color-bg",
	clusterBkg: "--color-bg",
	clusterBorder: "--color-border",
	noteBkgColor: "--color-warning-low",
	noteBorderColor: "--color-warning",
	noteTextColor: "--color-warning-high",
	errorBkgColor: "--color-error-low",
	errorTextColor: "--color-error-high",
} as const;

const drawn: HTMLElement[] = [];
let redrawsOnThemeChange = false;

/** Draws the mermaid source of the elements as diagrams, drawing them again whenever the theme changes. */
export async function drawMermaid(diagrams: HTMLElement[]) {
	const { default: mermaid } = await import("mermaid");

	for (const diagram of diagrams) {
		diagram.dataset.source ??= diagram.textContent ?? "";
	}
	drawn.push(...diagrams);

	const draw = async (nodes: HTMLElement[]) => {
		mermaid.initialize({
			startOnLoad: false,
			theme: "base",
			// the "neo" look outlines subgraphs with the node border and adds drop shadows
			look: "classic",
			themeVariables: themeVariables(),
		});
		for (const node of nodes) {
			node.removeAttribute("data-processed");
			node.textContent = node.dataset.source ?? "";
		}
		await mermaid.run({ nodes });
	};

	await draw(diagrams);

	if (redrawsOnThemeChange) return;
	redrawsOnThemeChange = true;
	new MutationObserver(() => draw(drawn)).observe(document.documentElement, {
		attributes: true,
		attributeFilter: ["data-theme"],
	});
}

function themeVariables() {
	const variables: Record<string, string | boolean> = {
		darkMode: document.documentElement.dataset.theme !== "light",
		dropShadow: "none",
		fontFamily: getComputedStyle(document.body).fontFamily,
	};
	for (const [variable, token] of Object.entries(THEME_TOKENS)) {
		variables[variable] = tokenAsHex(token);
	}

	return variables;
}

/** Mermaid derives shades from its colors itself, so it needs plain hex instead of `var()` or `oklch()`. */
function tokenAsHex(token: string) {
	const probe = document.createElement("span");
	probe.style.color = `var(${token})`;
	document.body.append(probe);
	const resolved = getComputedStyle(probe).color;
	probe.remove();

	const context = document.createElement("canvas").getContext("2d");
	if (!context) return resolved;
	context.fillStyle = resolved;
	context.fillRect(0, 0, 1, 1);
	const [red, green, blue] = context.getImageData(0, 0, 1, 1).data;

	return `#${[red, green, blue].map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
}
