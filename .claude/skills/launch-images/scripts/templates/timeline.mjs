import { boldMarkdown, stripBold, stripHtml } from "./shared.mjs";

const FRAME_WIDTH = 580;

/** "How X works": numbered steps down a dashed line, each with text and screenshot crops in a tilted frame. */
export const timeline = {
	html({ wordmark = "sendou.ink", title, steps }, ctx) {
		return `
		<div class="head">
			<img src="${ctx.iconSrc}" alt="">
			<div>
				<div class="wordmark">${wordmark}</div>
				<h1>${title}</h1>
			</div>
		</div>
		<div class="steps">
			<div class="line"></div>
			${steps.map((step, i) => stepHtml(step, i, ctx)).join("")}
		</div>
		<div class="blob" style="right:80px;top:70px;width:56px;height:50px;background:var(--second)"></div>
		<div class="blob" style="right:166px;top:108px;width:32px;height:28px;background:var(--accent)"></div>`;
	},
	altText({ title, steps }) {
		return [
			`${title}, a ${steps.length} step timeline with screenshots.`,
			...steps.map(
				(step, i) =>
					`${i + 1}. ${stripHtml(step.title)}: ${stripBold(step.text)}${step.alt ? ` ${step.alt}` : ""}`,
			),
		].join("\n");
	},
	css: `
.timeline { width: 1200px; box-sizing: border-box; padding: 72px 72px 80px; }
.timeline .head { display: flex; align-items: center; gap: 26px; }
.timeline .head img { width: 112px; height: 112px; rotate: -8deg;
	filter: drop-shadow(8px 11px 0 color-mix(in oklab, var(--accent) 55%, transparent)); }
.timeline .head h1 { margin: 6px 0 0; font-size: 64px; line-height: 1; font-weight: var(--weight-extra); letter-spacing: -0.02em; }
.timeline .steps { position: relative; margin-top: 56px; display: flex; flex-direction: column; gap: 40px; }
.timeline .line { position: absolute; left: 31px; top: 40px; bottom: 140px;
	border-left: 6px dashed color-mix(in oklab, var(--second) 60%, transparent); }
.timeline .step { position: relative; display: flex; align-items: flex-start; gap: 30px; }
.timeline .node { flex: none; width: 68px; height: 68px; border-radius: 50%; background: var(--second);
	color: #000; font-size: 36px; font-weight: var(--weight-extra); display: grid; place-items: center;
	box-shadow: 0 0 0 8px var(--color-bg); }
.timeline .copy { flex: 1; min-width: 0; padding-top: 8px; }
.timeline h2 { margin: 0; font-size: 36px; line-height: 1.1; font-weight: var(--weight-extra); letter-spacing: -0.01em; text-wrap: balance; }
.timeline p { margin: 12px 0 0; font-size: 22px; line-height: 1.4; color: var(--text-soft); text-wrap: pretty; }
.timeline .frameWrap { flex: none; }
.timeline .step:nth-child(odd of .step) .frameWrap { rotate: 1deg; }
.timeline .step:nth-child(even of .step) .frameWrap { rotate: -1deg; }
.timeline .frame { width: ${FRAME_WIDTH}px; overflow: hidden; border-radius: 14px; border: 3px solid var(--color-border-high);
	box-shadow: 12px 14px 0 color-mix(in oklab, var(--accent) 55%, transparent); background: var(--color-bg); }
.timeline .crop { position: relative; overflow: hidden; }
.timeline .crop + .crop { border-top: 3px dashed var(--color-border-high); }
.timeline .crop img { display: block; width: ${FRAME_WIDTH}px; }
.timeline .hl { position: absolute; border: 4px dashed var(--second); border-radius: 12px; box-sizing: border-box; }
`,
};

function stepHtml(step, i, { shotDataUri, shotCssWidth }) {
	const crops = step.crops.map((crop) => {
		const scale = FRAME_WIDTH / shotCssWidth(crop.shot);
		const highlight = crop.highlight
			? `<div class="hl" style="left:${crop.highlight.x * scale}px;top:${(crop.highlight.y - crop.top) * scale}px;width:${crop.highlight.w * scale}px;height:${crop.highlight.h * scale}px"></div>`
			: "";

		return `<div class="crop" style="height:${crop.height * scale}px"><img src="${shotDataUri(crop.shot)}" style="margin-top:${-crop.top * scale}px" alt="">${highlight}</div>`;
	});

	return `
	<div class="step">
		<div class="node">${i + 1}</div>
		<div class="copy">
			<h2>${step.title}</h2>
			<p>${boldMarkdown(step.text)}</p>
		</div>
		<div class="frameWrap"><div class="frame">${crops.join("")}</div></div>
	</div>`;
}
