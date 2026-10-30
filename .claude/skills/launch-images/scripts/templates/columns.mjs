import { boldMarkdown, stripBold, stripHtml } from "./shared.mjs";

/** "Here is what's new": side by side columns, each with a heading, a line of text and screenshots in a tilted frame. */
export const columnsTemplate = {
	html({ wordmark = "sendou.ink", title, icons, frameWidth, columns }, ctx) {
		const iconSrcs = icons
			? icons.map((icon) =>
					ctx.iconSrc.replace(/layout\/[^/.]+/, `layout/${icon}`),
				)
			: [ctx.iconSrc];

		return `
		<div class="head">
			<div class="icons">${iconSrcs.map((src) => `<img src="${src}" alt="">`).join("")}</div>
			<div>
				<div class="wordmark">${wordmark}</div>
				<h1>${title}</h1>
			</div>
		</div>
		<div class="cols" style="grid-template-columns: repeat(${columns.length}, 1fr)">
			${columns.map((column) => columnHtml(column, frameWidth, ctx)).join("")}
		</div>
		<div class="blob" style="right:64px;top:60px;width:56px;height:50px;background:var(--second)"></div>
		<div class="blob" style="right:132px;top:118px;width:32px;height:28px;background:var(--accent)"></div>`;
	},
	altText({ title, columns }) {
		return [
			`${title}, ${columns.length} columns with screenshots.`,
			...columns.map(
				(column) =>
					`- ${stripHtml(column.title)}: ${stripHtml(stripBold(column.text))}${column.alt ? ` ${column.alt}` : ""}`,
			),
		].join("\n");
	},
	css: `
.columns { width: 1200px; box-sizing: border-box; padding: 72px 64px 84px; }
.columns .head { display: flex; align-items: center; gap: 26px; }
.columns .icons { flex: none; display: flex; }
.columns .icons img { width: 104px; height: 104px; rotate: -8deg;
	filter: drop-shadow(8px 11px 0 color-mix(in oklab, var(--accent) 55%, transparent)); }
.columns .icons img + img { margin-left: -30px; }
.columns .icons img:nth-child(even) { rotate: 6deg; translate: 0 10px; }
.columns .head h1 { margin: 6px 0 0; font-size: 60px; line-height: 1; font-weight: var(--weight-extra); letter-spacing: -0.02em; }
.columns .cols { margin-top: 56px; display: grid; grid-template-rows: auto auto; column-gap: 36px; row-gap: 26px; }
.columns .col { display: grid; grid-row: span 2; grid-template-rows: subgrid; }
.columns h2 { margin: 0; font-size: 32px; line-height: 1.1; font-weight: var(--weight-extra); letter-spacing: -0.01em;
	display: flex; align-items: flex-start; gap: 14px; text-wrap: balance; }
.columns h2::before { content: ""; flex: none; margin-top: 7px; width: 22px; height: 20px; background: var(--second);
	border-radius: 58% 42% 55% 45% / 48% 60% 40% 52%; }
.columns p { margin: 10px 0 0; font-size: 21px; line-height: 1.4; color: var(--text-soft); text-wrap: pretty; }
.columns .col:nth-child(odd) .frame { rotate: 1deg; }
.columns .col:nth-child(even) .frame { rotate: -1deg; }
.columns .frame { align-self: start; overflow: hidden; border-radius: 14px; border: 3px solid var(--color-border-high);
	box-shadow: 12px 14px 0 color-mix(in oklab, var(--accent) 55%, transparent); background: var(--color-bg); }
.columns .crop { overflow: hidden; }
.columns .crop + .crop { border-top: 3px dashed var(--color-border-high); }
.columns .crop img { display: block; width: 100%; }
`,
};

function columnHtml(column, frameWidth, { shotDataUri, shotCssWidth }) {
	const crops = column.crops.map((crop) => {
		const width = shotCssWidth(crop.shot);
		const top = crop.top ?? 0;
		const style =
			typeof crop.height === "number"
				? ` style="aspect-ratio: ${width} / ${crop.height}"`
				: "";

		return `<div class="crop"${style}><img src="${shotDataUri(crop.shot)}" style="margin-top:${(-top / width) * 100}%" alt=""></div>`;
	});

	return `
	<div class="col">
		<div>
			<h2>${column.title}</h2>
			<p>${boldMarkdown(column.text)}</p>
		</div>
		<div class="frame"${frameWidth ? ` style="width:${frameWidth}px"` : ""}>${crops.join("")}</div>
	</div>`;
}
