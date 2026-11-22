/** biome-ignore-all lint/performance/useDomNodeTextContent: innerText is the rendered text, which is what these probes are about */
// In-page half of the polish sweep, installed as an init script (see lib.mjs `openSession`).
// Everything hangs off `window.__polish`. Probes return plain findings:
//   { rule, nodeId, selector, sig, text, detail, rect }   (rect in viewport coordinates)
// `nodeId` lets the Node side come back to the element (`reveal`, `styleSnapshot`).
(() => {
	if (window.__polish) return;

	const INTERACTIVE_SELECTOR = [
		"a[href]",
		"button",
		"summary",
		"select",
		"label[for]",
		'input[type="checkbox"]',
		'input[type="radio"]',
		"[role=button]",
		"[role=tab]",
		"[role=link]",
		"[role=menuitem]",
		"[role=option]",
		"[role=switch]",
		"[role=checkbox]",
		"[role=radio]",
	].join(",");

	const FEEDBACK_PROPS = [
		"color",
		"backgroundColor",
		"backgroundImage",
		"borderTopColor",
		"borderBottomColor",
		"borderLeftColor",
		"borderTopWidth",
		"borderBottomWidth",
		"outlineColor",
		"outlineWidth",
		"outlineStyle",
		"outlineOffset",
		"boxShadow",
		"opacity",
		"transform",
		"scale",
		"translate",
		"textDecorationLine",
		"textDecorationColor",
		"filter",
		"backdropFilter",
		"fill",
		"stroke",
	];

	const DOMAIN_LIKE =
		/\.(ink|com|tv|gg|net|org|io|dev|png|jpe?g|avif|webp|webm|json|ts|tsx|css)$/i;

	/** A probe run can be limited to what is inside one element: an open dialog, popover or menu. */
	let scopeRoot = null;
	const scope = () => scopeRoot ?? document.body;
	const inScope = (element) => !scopeRoot || scopeRoot.contains(element);

	const nodes = new Map();
	const nodeIds = new WeakMap();
	let nextNodeId = 1;
	const styleCache = new WeakMap();

	const shifts = [];
	/** When a web font finished loading: text drawn in the fallback font until then changes width at that moment. */
	const fontTimes = [];
	document.fonts?.addEventListener("loadingdone", () =>
		fontTimes.push(performance.now()),
	);
	try {
		new PerformanceObserver((list) => {
			for (const entry of list.getEntries()) {
				shifts.push({
					value: entry.value,
					hadRecentInput: entry.hadRecentInput,
					time: entry.startTime,
					sources: [...entry.sources]
						.filter((source) => source.node)
						.map((source) => {
							const element =
								source.node.nodeType === 1
									? source.node
									: source.node.parentElement;
							return {
								nodeId: element ? idOf(element) : null,
								selector: element ? selectorOf(element) : "(text)",
								sig: element ? signatureOf(element) : "(text)",
								text: element ? snippet(element) : "",
								// moved along with another source it sits in
								inner: entry.sources.some(
									(other) =>
										other.node &&
										other.node !== source.node &&
										other.node.contains(source.node),
								),
								previous: plainRect(source.previousRect),
								current: plainRect(source.currentRect),
							};
						}),
				});
			}
		}).observe({ type: "layout-shift", buffered: true });
	} catch {
		// layout-shift entries are Chromium only
	}

	function idOf(element) {
		let id = nodeIds.get(element);
		if (!id) {
			id = nextNodeId++;
			nodeIds.set(element, id);
			nodes.set(id, new WeakRef(element));
		}
		return id;
	}

	function nodeOf(id) {
		return nodes.get(id)?.deref() ?? null;
	}

	function style(element) {
		let computed = styleCache.get(element);
		if (!computed) {
			computed = getComputedStyle(element);
			styleCache.set(element, computed);
		}
		return computed;
	}

	function plainRect(rect) {
		return {
			x: Math.round(rect.x * 10) / 10,
			y: Math.round(rect.y * 10) / 10,
			width: Math.round(rect.width * 10) / 10,
			height: Math.round(rect.height * 10) / 10,
		};
	}

	/** CSS module classes read `_name_hash` in the build; the name leads back to the source file. */
	function classNames(element) {
		return typeof element.className === "string"
			? element.className.split(/\s+/).filter(Boolean)
			: [];
	}

	function label(element) {
		const tag = element.tagName.toLowerCase();
		const testId = element.getAttribute("data-testid");
		const classes = classNames(element).slice(0, 3);
		return `${tag}${element.getAttribute("id") ? `#${element.getAttribute("id")}` : ""}${classes.map((c) => `.${c}`).join("")}${testId ? `[data-testid="${testId}"]` : ""}`;
	}

	function selectorOf(element) {
		const parts = [];
		let current = element;
		while (current && current !== document.body && parts.length < 4) {
			parts.unshift(label(current));
			current = current.parentElement;
		}
		return parts.join(" > ");
	}

	/** Same for every instance of a component: what findings are deduplicated by across pages. */
	function signatureOf(element) {
		const own = `${element.tagName.toLowerCase()}.${classNames(element).sort().join(".")}`;
		const role = element.getAttribute("role");
		const parent = element.parentElement;
		const parentPart =
			classNames(element).length === 0 && parent
				? `${parent.tagName.toLowerCase()}.${classNames(parent).sort().join(".")}>`
				: "";
		return `${parentPart}${own}${role ? `[${role}]` : ""}`;
	}

	function snippet(element) {
		const text = (element.innerText ?? element.textContent ?? "")
			.replace(/\s+/g, " ")
			.trim();
		const fallback =
			element.getAttribute("aria-label") ?? element.getAttribute("title") ?? "";
		const value = text || fallback;
		return value.length > 80 ? `${value.slice(0, 77)}...` : value;
	}

	function effectiveOpacity(element) {
		let opacity = 1;
		for (let current = element; current; current = current.parentElement) {
			opacity *= Number(style(current).opacity);
		}
		return opacity;
	}

	function isVisible(element) {
		const rect = element.getBoundingClientRect();
		if (rect.width < 1 || rect.height < 1) return false;
		const computed = style(element);
		if (computed.visibility !== "visible") return false;
		// display: none up the tree, the content of a closed <details>
		if (element.checkVisibility && !element.checkVisibility()) return false;
		// screen reader only text
		if (
			rect.width <= 2 &&
			rect.height <= 2 &&
			computed.overflow !== "visible"
		) {
			return false;
		}
		if (
			computed.clipPath === "inset(50%)" ||
			computed.clip === "rect(0px, 0px, 0px, 0px)"
		) {
			return false;
		}
		return effectiveOpacity(element) > 0.05;
	}

	/** Elements holding a text node of their own, with the combined rects of that text. */
	function textElements() {
		const walker = document.createTreeWalker(scope(), NodeFilter.SHOW_TEXT);
		const byElement = new Map();
		for (let node = walker.nextNode(); node; node = walker.nextNode()) {
			if (!node.nodeValue.trim()) continue;
			const parent = node.parentElement;
			if (!parent) continue;
			if (
				parent.closest(
					"script,style,noscript,svg,select,option,textarea,[data-polish-overlay]",
				)
			) {
				continue;
			}
			const list = byElement.get(parent) ?? [];
			list.push(node);
			byElement.set(parent, list);
		}

		const result = [];
		for (const [element, textNodes] of byElement) {
			if (!isVisible(element)) continue;
			const range = document.createRange();
			const rects = [];
			for (const textNode of textNodes) {
				range.selectNodeContents(textNode);
				for (const rect of range.getClientRects()) {
					if (rect.width > 0.5 && rect.height > 0.5) rects.push(rect);
				}
			}
			if (rects.length === 0) continue;
			result.push({
				element,
				rects,
				text: textNodes
					.map((n) => n.nodeValue)
					.join(" ")
					.replace(/\s+/g, " ")
					.trim(),
			});
		}
		return result;
	}

	function union(rects) {
		const left = Math.min(...rects.map((r) => r.left));
		const top = Math.min(...rects.map((r) => r.top));
		const right = Math.max(...rects.map((r) => r.right));
		const bottom = Math.max(...rects.map((r) => r.bottom));
		return {
			left,
			top,
			right,
			bottom,
			x: left,
			y: top,
			width: right - left,
			height: bottom - top,
		};
	}

	function finding(rule, element, detail, rect) {
		return {
			rule,
			nodeId: idOf(element),
			selector: selectorOf(element),
			sig: signatureOf(element),
			text: snippet(element),
			detail,
			rect: plainRect(rect ?? element.getBoundingClientRect()),
		};
	}

	// ---------------------------------------------------------------- overflow

	/** Text cut by a box without an ellipsis, text sticking out of the box it belongs to. */
	function probeOverflow() {
		const findings = [];

		for (const { element, rects } of textElements()) {
			const text = union(rects);
			// what is left of the text after the clipping ancestors passed so far
			const visible = { ...text };
			let hasLineClamp = false;
			let reported = false;
			let depth = 0;
			let isPlacedOutside = false;
			let pastClip = false;
			// an ellipsis only shows for inline content of the box declaring it: a block or flex child
			// that is cut by a box further up gets none
			let chainIsInline = true;
			let skipStatic = false;
			// a marquee, a carousel, a drawer: what a transform or an animation moves is cut by its window on purpose
			let isMovedAbout = false;

			for (
				let ancestor = element;
				ancestor && ancestor !== document.documentElement && !reported;
				ancestor = ancestor.parentElement, depth++
			) {
				const computed = style(ancestor);
				if (computed.webkitLineClamp && computed.webkitLineClamp !== "none") {
					hasLineClamp = true;
				}
				if (computed.display === "inline" || computed.display === "contents")
					continue;
				// an absolutely positioned box is clipped by its containing block, not by what sits between
				if (
					skipStatic &&
					computed.position === "static" &&
					computed.transform === "none"
				) {
					continue;
				}
				skipStatic = false;

				const box = ancestor.getBoundingClientRect();
				const wasPlacedOutside = isPlacedOutside;
				// a label positioned out of its parent (above a bar, on a corner) is there on purpose
				if (
					computed.position === "absolute" ||
					computed.position === "fixed" ||
					computed.transform !== "none"
				) {
					isPlacedOutside = true;
				}
				const inner = {
					left: box.left + ancestor.clientLeft,
					top: box.top + ancestor.clientTop,
					right: box.left + ancestor.clientLeft + ancestor.clientWidth,
					bottom: box.top + ancestor.clientTop + ancestor.clientHeight,
				};
				const overX = Math.max(
					visible.right - inner.right,
					inner.left - visible.left,
				);
				const overY = Math.max(
					visible.bottom - inner.bottom,
					inner.top - visible.top,
				);
				const clipsX =
					computed.overflowX === "hidden" || computed.overflowX === "clip";
				const clipsY =
					computed.overflowY === "hidden" || computed.overflowY === "clip";
				const scrollsX =
					computed.overflowX === "auto" || computed.overflowX === "scroll";
				const scrollsY =
					computed.overflowY === "auto" || computed.overflowY === "scroll";
				const partlyVisible =
					visible.left < inner.right - 4 &&
					visible.right > inner.left + 4 &&
					visible.top < inner.bottom - 4 &&
					visible.bottom > inner.top + 4;
				const showsEllipsis =
					chainIsInline && computed.textOverflow.includes("ellipsis");

				const cutOnPurpose = isMovedAbout;
				if (computed.transform !== "none" || computed.animationName !== "none")
					isMovedAbout = true;

				if (cutOnPurpose) {
					// nothing to report at this box
				} else if (clipsX && overX > 4 && partlyVisible && !showsEllipsis) {
					findings.push(
						finding(
							"text-clipped",
							element,
							`cut off horizontally by ${label(ancestor)} (${Math.round(overX)}px hidden), no ellipsis${pastClip ? " (the box holding the text does not shrink, so its own ellipsis never shows)" : ""}`,
							text,
						),
					);
					reported = true;
				} else if (clipsY && overY > 3 && partlyVisible && !hasLineClamp) {
					findings.push(
						finding(
							"text-clipped",
							element,
							`cut off vertically by ${label(ancestor)} (${Math.round(overY)}px hidden), no line clamp`,
							text,
						),
					);
					reported = true;
				}

				// past a scroller the text's own rect says nothing about what is seen
				if (scrollsX || scrollsY) break;
				if (clipsX) {
					visible.left = Math.max(visible.left, inner.left);
					visible.right = Math.min(visible.right, inner.right);
				}
				if (clipsY) {
					visible.top = Math.max(visible.top, inner.top);
					visible.bottom = Math.min(visible.bottom, inner.bottom);
				}
				if (clipsX || clipsY) pastClip = true;
				if (
					visible.right - visible.left < 1 ||
					visible.bottom - visible.top < 1
				)
					break;
				if (!computed.display.startsWith("inline")) chainIsInline = false;

				if (
					!pastClip &&
					depth <= 3 &&
					!wasPlacedOutside &&
					// a legend sits on its fieldset's border by nature
					!element.closest("legend") &&
					hasVisibleBoundary(computed) &&
					(overX > 2 || overY > 4)
				) {
					findings.push(
						finding(
							"text-spill",
							element,
							`sticks out of ${label(ancestor)} by ${Math.round(Math.max(overX, overY))}px`,
							text,
						),
					);
					reported = true;
				}

				// the viewport is all that clips a fixed box or one in the top layer
				if (
					computed.position === "fixed" ||
					ancestor.matches(":popover-open, dialog:modal")
				) {
					break;
				}
				if (computed.position === "absolute") skipStatic = true;
			}
		}

		return findings;
	}

	function hasVisibleBoundary(computed) {
		if (parseColor(computed.backgroundColor)[3] > 0.05) return true;
		if (computed.backgroundImage !== "none") return true;
		if (computed.boxShadow !== "none") return true;
		return (
			["Top", "Right", "Bottom", "Left"].some(
				(side) =>
					Number.parseFloat(computed[`border${side}Width`]) > 0 &&
					computed[`border${side}Style`] !== "none" &&
					parseColor(computed[`border${side}Color`])[3] > 0.05,
			) || false
		);
	}

	/** Two different pieces of text drawn on top of each other. */
	function probeOverlap() {
		// line by line: the bounding box of an inline text wrapping onto a second line covers its neighbours
		const items = textElements()
			.slice(0, 2500)
			.flatMap(({ element, rects }) =>
				rects.map((rect) => ({
					element,
					rect: clipToAncestors(element, union([rect])),
				})),
			)
			.filter(({ rect }) => rect && rect.width > 4 && rect.height > 4)
			.sort((a, b) => a.rect.left - b.rect.left);
		const findings = [];
		const seen = new Set();

		for (let i = 0; i < items.length; i++) {
			const a = items[i];
			for (let j = i + 1; j < items.length; j++) {
				const b = items[j];
				if (b.rect.left >= a.rect.right) break;
				const width =
					Math.min(a.rect.right, b.rect.right) -
					Math.max(a.rect.left, b.rect.left);
				const height =
					Math.min(a.rect.bottom, b.rect.bottom) -
					Math.max(a.rect.top, b.rect.top);
				if (width < 3 || height < 3) continue;
				const smaller = Math.min(
					a.rect.width * a.rect.height,
					b.rect.width * b.rect.height,
				);
				if ((width * height) / smaller < 0.35) continue;
				if (a.element.contains(b.element) || b.element.contains(a.element))
					continue;
				if (isOverlay(a.element, b.element) || isOverlay(b.element, a.element))
					continue;
				// drawn under the other text of the pair is the overlap itself, under anything else it is not seen
				if (
					!isOnTop(a.element, a.rect, b.element) ||
					!isOnTop(b.element, b.rect, a.element)
				)
					continue;
				if (seen.has(a.element) || seen.has(b.element)) continue;
				seen.add(a.element);
				seen.add(b.element);
				findings.push(
					finding(
						"text-overlap",
						a.element,
						`overlaps the text "${snippet(b.element)}" (${selectorOf(b.element)})`,
						union([a.rect, b.rect]),
					),
				);
			}
		}

		// a text and something that is not text on one spot: a name running under the buttons next to it
		const things = [
			...new Set([
				...interactiveElements(),
				...scope().querySelectorAll("img, svg, picture"),
			]),
		]
			.filter((element) => isVisible(element))
			.map((element) => ({ element, rect: element.getBoundingClientRect() }))
			.filter(({ rect }) => rect.width >= 12 && rect.height >= 12);
		for (const item of items) {
			if (seen.has(item.element)) continue;
			for (const thing of things) {
				const width =
					Math.min(item.rect.right, thing.rect.right) -
					Math.max(item.rect.left, thing.rect.left);
				const height =
					Math.min(item.rect.bottom, thing.rect.bottom) -
					Math.max(item.rect.top, thing.rect.top);
				if (width < 12 || height < item.rect.height * 0.5) continue;
				if (
					thing.element.contains(item.element) ||
					item.element.contains(thing.element)
				)
					continue;
				if (
					isOverlay(item.element, thing.element) ||
					isOverlay(thing.element, item.element)
				)
					continue;
				const hit = document.elementFromPoint(
					Math.max(item.rect.left, thing.rect.left) + width / 2,
					Math.max(item.rect.top, thing.rect.top) + height / 2,
				);
				if (!hit) continue;
				const isUnder = thing.element.contains(hit);
				if (!isUnder && !item.element.contains(hit)) continue;
				seen.add(item.element);
				findings.push(
					finding(
						"text-under-control",
						item.element,
						`${Math.round(width)}px of this text run ${isUnder ? "under" : "over"} ${label(thing.element)}${snippet(thing.element) ? ` ("${snippet(thing.element).slice(0, 30)}")` : ""}`,
						union([item.rect, thing.rect]),
					),
				);
				break;
			}
		}
		return findings;
	}

	/** Whether the element is taken out of the flow somewhere below the ancestor it shares with the other: a badge, a fade, a fixed bar. */
	function isOverlay(element, other) {
		for (
			let current = element;
			current && !current.contains(other);
			current = current.parentElement
		) {
			const position = style(current).position;
			if (
				position === "absolute" ||
				position === "fixed" ||
				position === "sticky"
			) {
				return true;
			}
		}
		return false;
	}

	/** The part of the rect that the element's clipping and scrolling ancestors let through, or null when none of it shows. */
	function clipToAncestors(element, rect) {
		let { left, top, right, bottom } = rect;
		for (
			let current = element;
			current && current !== document.documentElement;
			current = current.parentElement
		) {
			const computed = style(current);
			if (computed.overflowX === "visible" && computed.overflowY === "visible")
				continue;
			const box = current.getBoundingClientRect();
			if (computed.overflowX !== "visible") {
				left = Math.max(left, box.left);
				right = Math.min(right, box.right);
			}
			if (computed.overflowY !== "visible") {
				top = Math.max(top, box.top);
				bottom = Math.min(bottom, box.bottom);
			}
			if (right - left < 1 || bottom - top < 1) return null;
		}
		return {
			left,
			top,
			right,
			bottom,
			x: left,
			y: top,
			width: right - left,
			height: bottom - top,
		};
	}

	/** Whether the element is what is painted at the middle of the rect (not covered, not scrolled away). `partner` may cover it. */
	function isOnTop(element, rect, partner) {
		const x = rect.left + rect.width / 2;
		const y = rect.top + rect.height / 2;
		if (x < 0 || y < 0 || x > innerWidth || y > innerHeight) return true;
		const hit = document.elementFromPoint(x, y);
		return (
			!hit ||
			element.contains(hit) ||
			hit.contains(element) ||
			Boolean(partner?.contains(hit))
		);
	}

	// ---------------------------------------------------------- horizontal scroll

	function probeHorizontalScroll() {
		if (scopeRoot) return [];
		const root = document.documentElement;
		const visibleWidth = root.clientWidth;
		const pageWidth = () =>
			Math.max(root.scrollWidth, document.body.scrollWidth);
		const scrollWidth = pageWidth();
		if (scrollWidth <= visibleWidth + 1) return [];

		const reaching = [];
		for (const element of document.body.querySelectorAll("*")) {
			const rect = element.getBoundingClientRect();
			if (rect.width < 1 || rect.height < 1) continue;
			if (rect.right + scrollX <= visibleWidth + 1) continue;
			if (isContained(element)) continue;
			reaching.push(element);
		}
		// text running out of a box that itself stays inside the viewport
		for (const { element, rects } of textElements()) {
			if (reaching.includes(element) || isContained(element)) continue;
			if (hasClippingAncestor(element)) continue;
			if (union(rects).right + scrollX > visibleWidth + 1)
				reaching.push(element);
		}
		const innermost = reaching
			.filter(
				(element) =>
					!reaching.some(
						(other) => other !== element && element.contains(other),
					),
			)
			.sort(
				(a, b) =>
					b.getBoundingClientRect().right - a.getBoundingClientRect().right,
			);

		// the cause is what the page gets narrowest without, not what was pushed furthest out by it
		const hide = (element) => {
			const previous = [
				element.style.getPropertyValue("display"),
				element.style.getPropertyPriority("display"),
			];
			element.style.setProperty("display", "none", "important");
			return () => {
				if (previous[0])
					element.style.setProperty("display", previous[0], previous[1]);
				else element.style.removeProperty("display");
			};
		};
		const candidates = innermost.slice(0, 12).map((element) => {
			const restore = hide(element);
			const gain = scrollWidth - pageWidth();
			restore();
			return { element, gain };
		});
		const bestGain = Math.max(
			0,
			...candidates.map((candidate) => candidate.gain),
		);
		let culprits = candidates
			.filter(
				(candidate) => candidate.gain > 1 && candidate.gain >= bestGain * 0.5,
			)
			.sort((a, b) => b.gain - a.gain)
			.map((candidate) => candidate.element);
		if (culprits.length === 0) {
			// several things reach equally far: no single one narrows the page, the first few together do
			const restores = [];
			for (const { element } of candidates) {
				restores.push(hide(element));
				culprits.push(element);
				if (pageWidth() < scrollWidth - 1) break;
			}
			if (pageWidth() >= scrollWidth - 1) culprits = innermost;
			for (const restore of restores) restore();
		}

		return culprits.slice(0, 3).map((element) => {
			const rect = element.getBoundingClientRect();
			// the fix is rarely on the long text itself: the boxes around it that grew with it are named too
			const grown = [];
			for (
				let ancestor = element.parentElement;
				ancestor && ancestor !== document.body && grown.length < 3;
				ancestor = ancestor.parentElement
			) {
				if (
					ancestor.getBoundingClientRect().right + scrollX >
					visibleWidth + 1
				) {
					grown.push(label(ancestor));
				}
			}
			return finding(
				"horizontal-scroll",
				element,
				`page scrolls sideways: ${scrollWidth}px of content in a ${visibleWidth}px viewport, this element reaches ${Math.round(rect.right + scrollX)}px${grown.length > 0 ? `; grew with it: ${grown.join(" < ")}` : ""}`,
			);
		});
	}

	function hasClippingAncestor(element) {
		for (
			let current = element;
			current && current !== document.body;
			current = current.parentElement
		) {
			if (style(current).overflowX !== "visible") return true;
		}
		return false;
	}

	/** Inside something that clips or scrolls its own overflow, or out of the flow of the page altogether. */
	function isContained(element) {
		for (
			let current = element;
			current && current !== document.body;
			current = current.parentElement
		) {
			const computed = style(current);
			if (computed.position === "fixed") return true;
			if (current !== element && computed.overflowX !== "visible") return true;
		}
		return false;
	}

	// ------------------------------------------------------------------ contrast

	let colorContext;
	const colorCache = new Map();

	/** Any CSS color as [r, g, b, a] in sRGB, by painting it. */
	function parseColor(value) {
		const cached = colorCache.get(value);
		if (cached) return cached;
		if (!colorContext) {
			const canvas = document.createElement("canvas");
			canvas.width = 1;
			canvas.height = 1;
			colorContext = canvas.getContext("2d", { willReadFrequently: true });
		}
		colorContext.clearRect(0, 0, 1, 1);
		colorContext.fillStyle = "rgba(0,0,0,0)";
		colorContext.fillStyle = value;
		colorContext.fillRect(0, 0, 1, 1);
		const [r, g, b, a] = colorContext.getImageData(0, 0, 1, 1).data;
		const parsed = [r, g, b, a / 255];
		colorCache.set(value, parsed);
		return parsed;
	}

	function blend(top, bottom) {
		const alpha = top[3];
		return [
			top[0] * alpha + bottom[0] * (1 - alpha),
			top[1] * alpha + bottom[1] * (1 - alpha),
			top[2] * alpha + bottom[2] * (1 - alpha),
			1,
		];
	}

	function luminance([r, g, b]) {
		const channel = (value) => {
			const scaled = value / 255;
			return scaled <= 0.03928
				? scaled / 12.92
				: ((scaled + 0.055) / 1.055) ** 2.4;
		};
		return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
	}

	function hex(color) {
		return `#${color
			.slice(0, 3)
			.map((value) => Math.round(value).toString(16).padStart(2, "0"))
			.join("")}`;
	}

	/** The color behind the element, or null when a picture or gradient is involved and it can't be told. */
	function backgroundBehind(element, point) {
		const layers = [];
		for (let current = element; current; current = current.parentElement) {
			const computed = style(current);
			if (current !== document.documentElement && current !== document.body) {
				const box = current.getBoundingClientRect();
				// the text was placed outside this ancestor, whose background is then not behind it
				if (
					point.x < box.left ||
					point.x > box.right ||
					point.y < box.top ||
					point.y > box.bottom
				)
					continue;
			}
			if (computed.backgroundImage !== "none") return null;
			if (computed.backdropFilter && computed.backdropFilter !== "none")
				return null;
			const color = parseColor(computed.backgroundColor);
			if (color[3] > 0) {
				layers.push(color);
				if (color[3] >= 0.999) break;
			}
			if (
				current !== element &&
				computed.position !== "static" &&
				current.querySelector(":scope > img, :scope > picture, :scope > video")
			) {
				return null;
			}
		}
		const rootBackground = parseColor(
			style(document.documentElement).backgroundColor,
		);
		let result =
			rootBackground[3] > 0
				? [...rootBackground.slice(0, 3), 1]
				: [255, 255, 255, 1];
		if (layers.at(-1)?.[3] >= 0.999) result = layers.pop();
		for (const layer of layers.reverse()) result = blend(layer, result);
		return result;
	}

	/** Contrast of a color (with the opacity it is drawn at) against a solid background. */
	function contrastOf(colorValue, opacity, background) {
		const color = parseColor(colorValue);
		const foreground = blend(
			[color[0], color[1], color[2], color[3] * opacity],
			background,
		);
		const lighter = Math.max(luminance(foreground), luminance(background));
		const darker = Math.min(luminance(foreground), luminance(background));
		return { ratio: (lighter + 0.05) / (darker + 0.05), foreground };
	}

	/** Texts whose background the last contrast run could not compute (a picture, a gradient, a blur behind them). */
	let contrastUnmeasured = [];

	const FIELD_WITHOUT_TEXT =
		':disabled, [aria-disabled=true], [type="checkbox"], [type="radio"], [type="range"], [type="color"], [type="file"], [type="hidden"], [type="submit"], [type="button"], [type="image"]';

	/** WCAG AA: 4.5:1, or 3:1 for large text (24px, or 18.66px bold). Field values and placeholders included. */
	function probeContrast() {
		const findings = [];
		contrastUnmeasured = [];
		const unmeasuredSignatures = new Set();

		const check = (element, colorValue, opacity, rect, what) => {
			const computed = style(element);
			const background = backgroundBehind(element, {
				x: rect.left + rect.width / 2,
				y: rect.top + rect.height / 2,
			});
			if (!background) {
				const sig = signatureOf(element);
				if (what === "text" && !unmeasuredSignatures.has(sig)) {
					unmeasuredSignatures.add(sig);
					contrastUnmeasured.push({
						nodeId: idOf(element),
						sig,
						selector: selectorOf(element),
						text: snippet(element),
					});
				}
				return;
			}
			const { ratio, foreground } = contrastOf(colorValue, opacity, background);
			const fontSize = Number.parseFloat(computed.fontSize);
			const isLarge =
				fontSize >= 24 ||
				(fontSize >= 18.66 && Number(computed.fontWeight) >= 700);
			const required = isLarge ? 3 : 4.5;
			if (ratio >= required - 0.05) return;
			if (!isOnTop(element, rect)) return;
			findings.push({
				...finding(
					"low-contrast",
					element,
					`${what === "text" ? "" : `${what}: `}${ratio.toFixed(2)}:1 (needs ${required}:1), text ${hex(foreground)} on ${hex(background)}, ${Math.round(fontSize)}px${Number(computed.fontWeight) >= 600 ? " bold" : ""}`,
					rect,
				),
				ratio: Math.round(ratio * 100) / 100,
				colors: `${hex(foreground)}/${hex(background)}`,
			});
		};

		for (const { element, rects, text } of textElements()) {
			if (text.length < 2) continue;
			if (element.closest(":disabled,[aria-disabled=true],[data-disabled]"))
				continue;
			check(
				element,
				style(element).color,
				effectiveOpacity(element),
				union(rects),
				"text",
			);
		}

		for (const field of scope().querySelectorAll("input, textarea, select")) {
			if (field.matches(FIELD_WITHOUT_TEXT) || !isVisible(field)) continue;
			const isSelect = field.tagName === "SELECT";
			const value = isSelect
				? (field.selectedOptions[0]?.textContent ?? "")
				: field.value;
			const showsPlaceholder = !isSelect && !value && field.placeholder;
			const shown = showsPlaceholder ? field.placeholder : value;
			if (shown.trim().length < 2) continue;
			const placeholderStyle = showsPlaceholder
				? getComputedStyle(field, "::placeholder")
				: null;
			check(
				field,
				placeholderStyle ? placeholderStyle.color : style(field).color,
				effectiveOpacity(field) *
					(placeholderStyle ? Number(placeholderStyle.opacity) || 1 : 1),
				field.getBoundingClientRect(),
				showsPlaceholder
					? `placeholder "${shown.slice(0, 30)}"`
					: "field value",
			);
		}
		return findings;
	}

	// -------------------------------------------------------------------- images

	function probeImages() {
		const findings = [];
		for (const image of document.images) {
			if (!inScope(image)) continue;
			const rect = image.getBoundingClientRect();
			if (rect.width < 2 || rect.height < 2) continue;
			if (image.complete && image.naturalWidth === 0 && image.currentSrc) {
				findings.push(
					finding(
						"broken-image",
						image,
						`does not load: ${image.currentSrc.slice(0, 120)}`,
					),
				);
				continue;
			}
			if (!image.complete || image.naturalWidth === 0) continue;
			const computed = style(image);
			const isVector = /\.svg(\?|#|$)|^data:image\/svg/.test(image.currentSrc);
			if (
				!isVector &&
				rect.width >= 40 &&
				isVisible(image) &&
				image.naturalWidth < rect.width * devicePixelRatio * 0.7 &&
				image.naturalHeight < rect.height * devicePixelRatio * 0.7
			) {
				findings.push(
					finding(
						"blurry-image",
						image,
						`a ${image.naturalWidth}x${image.naturalHeight} picture is drawn ${Math.round(rect.width)}x${Math.round(rect.height)}px on a ${devicePixelRatio}x screen: stretched to ${((rect.width * devicePixelRatio) / image.naturalWidth).toFixed(1)} times its size`,
					),
				);
			}
			if (computed.objectFit !== "fill") continue;
			const natural = image.naturalWidth / image.naturalHeight;
			const rendered = rect.width / rect.height;
			if (Math.abs(natural - rendered) / natural > 0.08) {
				findings.push(
					finding(
						"distorted-image",
						image,
						`stretched: ${image.naturalWidth}x${image.naturalHeight} drawn as ${Math.round(rect.width)}x${Math.round(rect.height)}`,
					),
				);
			}
		}
		return findings;
	}

	// ------------------------------------------------------------- untranslated

	function probeRawKeys() {
		const findings = [];
		for (const { element, text } of textElements()) {
			if (text.length > 70 || /\s/.test(text)) continue;
			if (!/^[a-z][A-Za-z0-9]*([.:][A-Za-z0-9_-]+)+$/.test(text)) continue;
			if (!/[.:][a-z]+[A-Z]|:|\.[a-z]+\.[a-z]/.test(text)) continue;
			if (DOMAIN_LIKE.test(text)) continue;
			findings.push(
				finding(
					"raw-translation-key",
					element,
					`looks like an untranslated key: "${text}"`,
				),
			);
		}
		return findings;
	}

	// --------------------------------------------------------------- interactive

	function interactiveElements() {
		const result = [];
		for (const element of scope().querySelectorAll(INTERACTIVE_SELECTOR)) {
			if (element.closest("[data-polish-overlay]")) continue;
			if (element.matches(":disabled,[aria-disabled=true]")) continue;
			// a label only when it is the visible part of a checkbox or radio
			if (
				element.matches("label") &&
				!["checkbox", "radio"].includes(element.control?.type)
			) {
				continue;
			}
			if (!isVisible(element)) continue;
			result.push(element);
		}
		return result;
	}

	/** One element per component signature, for the probes that hover, focus or click. */
	function listInteractive(skipSignatures = []) {
		const skip = new Set(skipSignatures);
		const result = [];
		for (const element of interactiveElements()) {
			const sig = signatureOf(element);
			if (skip.has(sig)) continue;
			skip.add(sig);
			result.push({
				nodeId: idOf(element),
				sig,
				selector: selectorOf(element),
				text: snippet(element),
				tag: element.tagName.toLowerCase(),
				// native controls draw themselves, and the selected tab or current page has nothing to offer on hover
				expectsHover:
					!element.matches("select, input") &&
					!element.matches(
						'[aria-selected="true"], [aria-current], [aria-pressed="true"]',
					) &&
					!element.querySelector('[aria-selected="true"], [aria-current]') &&
					!classNames(element).some((name) =>
						/active|selected|current/i.test(name.split("_")[1] ?? name),
					),
			});
		}
		return result;
	}

	/** Scrolls the element to the middle of the viewport and says where to point at it, or null when it can't be reached. */
	function reveal(nodeId) {
		const element = nodeOf(nodeId);
		if (!element?.isConnected) return null;
		const scrollBefore = scrollY;
		element.scrollIntoView({
			block: "center",
			// never sideways: a page that overflows would otherwise be scrolled horizontally before every measurement
			inline: "nearest",
			behavior: "instant",
		});
		const rect = element.getBoundingClientRect();
		if (rect.width < 1 || rect.height < 1) return null;
		const x = Math.min(Math.max(rect.left + rect.width / 2, 1), innerWidth - 2);
		const y = Math.min(
			Math.max(rect.top + rect.height / 2, 1),
			innerHeight - 2,
		);
		const hit = document.elementFromPoint(x, y);
		const reachable = Boolean(
			hit && (element.contains(hit) || hit.contains(element)),
		);
		return {
			x,
			y,
			rect: plainRect(rect),
			reachable,
			scrolled: Math.abs(scrollY - scrollBefore) > 1,
		};
	}

	/** What hover or focus feedback can change: the element, its near ancestors and descendants, its pseudo elements. */
	function styleSnapshot(nodeId) {
		const element = nodeOf(nodeId);
		if (!element?.isConnected) return null;
		const read = (target, pseudo) => {
			const computed = getComputedStyle(target, pseudo);
			if (pseudo && computed.content === "none") return "";
			return FEEDBACK_PROPS.map((prop) => computed[prop]).join("|");
		};
		const parts = [
			read(element),
			read(element, "::before"),
			read(element, "::after"),
		];
		let ancestor = element.parentElement;
		for (let i = 0; i < 2 && ancestor && ancestor !== document.body; i++) {
			parts.push(read(ancestor));
			ancestor = ancestor.parentElement;
		}
		for (const descendant of [...element.querySelectorAll("*")].slice(0, 25)) {
			parts.push(read(descendant));
		}
		// a tooltip or popover opening counts as feedback too
		parts.push(
			String(document.querySelectorAll(":popover-open, [role=tooltip]").length),
		);
		return {
			signature: parts.join("§"),
			// of the innermost thing under the pointer: a wrapper often leaves the cursor to its button
			cursor: getComputedStyle(
				[...element.querySelectorAll(":hover")].at(-1) ?? element,
			).cursor,
			hovered: element.matches(":hover"),
			focused: document.activeElement === element,
			// what a touch browser flashes over a tapped control unless the page turned it off
			tapHighlight: parseColor(
				getComputedStyle(element).webkitTapHighlightColor || "transparent",
			)[3],
		};
	}

	function focusNode(nodeId) {
		const element = nodeOf(nodeId);
		if (!element?.isConnected) return false;
		element.focus({ preventScroll: true });
		return document.activeElement === element;
	}

	/** Touch targets under 24x24 CSS px (WCAG 2.2 AA), links inside running text excepted. */
	function probeTapTargets() {
		const findings = [];
		const targets = interactiveElements()
			.filter((element) => !element.matches("label"))
			.map((element) => ({ element, rect: element.getBoundingClientRect() }));
		// what a finger needs: the target's own box, grown to 24px where it is smaller
		const reach = ({ rect }) => {
			const growX = Math.max(0, 24 - rect.width) / 2;
			const growY = Math.max(0, 24 - rect.height) / 2;
			return {
				left: rect.left - growX,
				right: rect.right + growX,
				top: rect.top - growY,
				bottom: rect.bottom + growY,
			};
		};

		for (const target of targets) {
			const { element, rect } = target;
			if (rect.width >= 24 && rect.height >= 24) continue;
			const computed = style(element);
			if (computed.display === "inline") {
				const parentText = (element.parentElement?.innerText ?? "").trim();
				if (parentText.length > (element.innerText ?? "").trim().length + 8)
					continue;
			}
			// a tiny input wrapped by a label is tapped through the label
			if (element.matches("input") && element.closest("label")) continue;

			const own = reach(target);
			const crowding = targets.find((other) => {
				if (
					other === target ||
					other.element.contains(element) ||
					element.contains(other.element)
				)
					return false;
				// a fixed bar passing over a link is not a neighbour of it
				if (
					isOverlay(other.element, element) !==
					isOverlay(element, other.element)
				) {
					return false;
				}
				const theirs = reach(other);
				return (
					own.left < theirs.right - 0.5 &&
					own.right > theirs.left + 0.5 &&
					own.top < theirs.bottom - 0.5 &&
					own.bottom > theirs.top + 0.5
				);
			});
			// small but with room around it passes (the spacing exception of WCAG 2.5.8)
			if (!crowding) continue;

			findings.push(
				finding(
					"small-tap-target",
					element,
					`${Math.round(rect.width)}x${Math.round(rect.height)}px with "${snippet(crowding.element).slice(0, 30)}" closer than a 24px touch area allows`,
				),
			);
		}
		return findings;
	}

	/** Icons and one line labels sitting off the middle of the box they are alone in. */
	function probeCentering() {
		const findings = [];
		const candidates = new Set(interactiveElements());
		for (const element of scope().querySelectorAll("span, div, li, td, th")) {
			if (element.childElementCount > 1) continue;
			const computed = style(element);
			const radius = Number.parseFloat(computed.borderTopLeftRadius);
			if (radius < 6 || !hasVisibleBoundary(computed)) continue;
			if (isVisible(element)) candidates.add(element);
		}

		for (const element of candidates) {
			const computed = style(element);
			const box = element.getBoundingClientRect();
			if (box.height > 72 || box.width > 320 || box.width < 8) continue;
			const squarish =
				box.width / box.height > 0.8 && box.width / box.height < 1.25;

			// through wrappers that hold nothing else, down to the icon
			let holder = element;
			while (
				holder.childElementCount === 1 &&
				![...holder.childNodes].some(
					(node) => node.nodeType === 3 && node.nodeValue.trim(),
				) &&
				!holder.firstElementChild.matches("svg, img, picture")
			) {
				holder = holder.firstElementChild;
			}
			const elementChildren = [...holder.children].filter((child) =>
				isVisible(child),
			);
			const textNodes = [...holder.childNodes].filter(
				(node) => node.nodeType === 3 && node.nodeValue.trim(),
			);
			let content;
			let isIcon = false;
			if (elementChildren.length === 1 && textNodes.length === 0) {
				const child = elementChildren[0];
				if (!child.matches("svg, img, picture")) continue;
				content = child.getBoundingClientRect();
				isIcon = true;
			} else if (elementChildren.length === 0 && textNodes.length === 1) {
				const range = document.createRange();
				range.selectNodeContents(textNodes[0]);
				const rects = [...range.getClientRects()];
				if (rects.length !== 1) continue;
				content = rects[0];
			} else {
				continue;
			}
			// an icon button's box shows on hover and focus even when it has no background of its own
			if (!hasVisibleBoundary(computed) && !(isIcon && squarish)) continue;
			if (content.width > box.width + 1 || content.height > box.height + 1) {
				continue;
			}

			const inner = {
				left: box.left + element.clientLeft,
				top: box.top + element.clientTop,
				right: box.left + element.clientLeft + element.clientWidth,
				bottom: box.top + element.clientTop + element.clientHeight,
			};
			const gapLeft = content.left - inner.left;
			const gapRight = inner.right - content.right;
			const gapTop = content.top - inner.top;
			const gapBottom = inner.bottom - content.bottom;
			const offX = Math.abs(gapLeft - gapRight);
			const offY = Math.abs(gapTop - gapBottom);
			// a small difference reads as "meant to be centered but isn't", a large one as an alignment choice
			const xOff =
				(isIcon && squarish ? offX > 2 : offX > 3 && offX <= 12) &&
				gapLeft > -1 &&
				gapRight > -1;
			const yOff = offY > (isIcon ? 2 : 3) && offY <= 14;
			if (!xOff && !yOff) continue;

			findings.push(
				finding(
					"off-center",
					element,
					`${isIcon ? "icon" : "label"} is off the middle: gaps left/right ${gapLeft.toFixed(1)}/${gapRight.toFixed(1)}px, top/bottom ${gapTop.toFixed(1)}/${gapBottom.toFixed(1)}px`,
				),
			);
		}
		return findings;
	}

	// -------------------------------------------------------------- layout diff

	let layoutBefore = null;

	/** Remembers where everything on screen is, before an action. `controlId` is the thing about to be clicked. */
	function snapshotLayout(controlId) {
		const control = nodeOf(controlId);
		const entries = [];
		for (const element of document.body.querySelectorAll("*")) {
			if (entries.length >= 900) break;
			if (element.closest("[data-polish-overlay]")) continue;
			const rect = element.getBoundingClientRect();
			if (rect.width < 4 || rect.height < 4) continue;
			if (
				rect.bottom < 0 ||
				rect.top > innerHeight ||
				rect.right < 0 ||
				rect.left > innerWidth
			)
				continue;
			if (style(element).visibility !== "visible") continue;
			entries.push({ element: new WeakRef(element), rect: plainRect(rect) });
		}
		layoutBefore = {
			scrollY,
			scrollX,
			pageHeight: document.documentElement.scrollHeight,
			viewportWidth: document.documentElement.clientWidth,
			control: control
				? {
						element: new WeakRef(control),
						rect: plainRect(control.getBoundingClientRect()),
					}
				: null,
			entries,
		};
		return { scrollY, control: layoutBefore.control?.rect ?? null };
	}

	/**
	 * What moved since `snapshotLayout`. Content after the control (a tab's panel, the rows under a filter) is
	 * expected to change; the control itself, what is above it and what is beside it are not.
	 */
	function diffLayout() {
		if (!layoutBefore) return null;
		const before = layoutBefore;
		const control = before.control?.element.deref();
		const controlConnected = Boolean(control?.isConnected);
		const controlNow = controlConnected
			? plainRect(control.getBoundingClientRect())
			: null;
		const controlMoved =
			controlNow && before.control
				? {
						dx: controlNow.x - before.control.rect.x,
						dy: controlNow.y - before.control.rect.y,
					}
				: null;

		const moved = [];
		for (const entry of before.entries) {
			const element = entry.element.deref();
			if (!element?.isConnected) continue;
			if (control && (control.contains(element) || element.contains(control)))
				continue;
			const now = element.getBoundingClientRect();
			if (now.width < 1 || now.height < 1) continue;
			// something that is animating all the time (a pulse, a spinner) moved by itself
			if (
				element
					.getAnimations?.()
					.some((animation) => animation.playState === "running")
			)
				continue;
			// on screen, as the person sees it: a scroll nobody asked for is a move too
			const dx = now.x - entry.rect.x;
			const dy = now.y - entry.rect.y;
			const resized =
				Math.abs(now.width - entry.rect.width) > 2 && Math.abs(dx) > 1;
			if (Math.abs(dx) < 2 && Math.abs(dy) < 2 && !resized) continue;
			const isAboveControl = before.control
				? entry.rect.y + entry.rect.height <= before.control.rect.y + 1
				: true;
			const isBesideControl = before.control
				? entry.rect.y < before.control.rect.y + before.control.rect.height &&
					entry.rect.y + entry.rect.height > before.control.rect.y
				: false;
			if (!isAboveControl && !isBesideControl) continue;
			moved.push({
				nodeId: idOf(element),
				selector: selectorOf(element),
				sig: signatureOf(element),
				inShell: !element.closest("main"),
				text: snippet(element),
				dx: Math.round(dx * 10) / 10,
				dy: Math.round(dy * 10) / 10,
				where: isAboveControl ? "above" : "beside",
				before: entry.rect,
				after: plainRect(now),
				area: entry.rect.width * entry.rect.height,
			});
		}
		// the outermost moved boxes tell the story, their children just follow
		const outermost = moved
			.filter(
				(item) =>
					!moved.some(
						(other) =>
							other !== item &&
							nodeOf(other.nodeId)?.contains(nodeOf(item.nodeId)),
					),
			)
			.sort((a, b) => b.area - a.area)
			.slice(0, 5);

		return {
			scrollBefore: before.scrollY,
			scrollAfter: scrollY,
			scrollXBefore: before.scrollX,
			scrollXAfter: scrollX,
			pageHeightBefore: before.pageHeight,
			pageHeightAfter: document.documentElement.scrollHeight,
			viewportWidthBefore: before.viewportWidth,
			viewportWidthAfter: document.documentElement.clientWidth,
			controlConnected,
			controlBefore: before.control?.rect ?? null,
			controlNow,
			controlMoved,
			moved: outermost,
			movedCount: moved.length,
		};
	}

	/** Controls that change the page without leaving it or writing anything: tabs, disclosure, links within the same section. */
	function listActions(skipKeys = []) {
		const skip = new Set(skipKeys);
		const result = [];
		const here = location.pathname.split("/").filter(Boolean);
		const add = (element, kind, key, target) => {
			if (skip.has(key) || !isVisible(element)) return;
			skip.add(key);
			result.push({
				nodeId: idOf(element),
				kind,
				key,
				target,
				selector: selectorOf(element),
				text: snippet(element),
			});
		};

		for (const element of document.querySelectorAll(
			"[role=tab]:not([aria-selected=true])",
		)) {
			if (element.tagName === "A") continue;
			// every tab of a strip: which one shifts the page depends on what its panel holds
			const strip = element.closest("[role=tablist]") ?? element.parentElement;
			const position = [...strip.querySelectorAll("[role=tab]")].indexOf(
				element,
			);
			add(element, "tab", `tab:${signatureOf(element)}:${position}`);
		}
		for (const element of document.querySelectorAll(
			"main summary, main details > summary",
		)) {
			// a click in the middle of a summary holding a link follows the link
			if (element.querySelector("a[href], button")) continue;
			add(element, "disclosure", `summary:${signatureOf(element)}`);
		}
		for (const element of document.querySelectorAll("main a[href]")) {
			if (element.target === "_blank" || element.hasAttribute("download"))
				continue;
			let url;
			try {
				url = new URL(element.href);
			} catch {
				continue;
			}
			if (url.origin !== location.origin) continue;
			if (url.pathname === location.pathname && url.search === location.search)
				continue;
			const there = url.pathname.split("/").filter(Boolean);
			const samePage = url.pathname === location.pathname;
			const sibling =
				!samePage &&
				here.length >= 1 &&
				there[0] === here[0] &&
				Math.abs(there.length - here.length) <= 1 &&
				Boolean(element.closest("nav, [role=tablist], [role=navigation]"));
			if (!samePage && !sibling) continue;
			add(
				element,
				samePage ? "same-page-link" : "sub-nav-link",
				`${samePage ? "param" : "nav"}:${signatureOf(element)}:${samePage ? [...url.searchParams.keys()].sort((a, b) => a.localeCompare(b)).join(",") : url.pathname.replace(/\d+/g, "N")}`,
				url.pathname + url.search,
			);
		}
		return result;
	}

	// ------------------------------------------------------------------ overlays

	/** Boxes over the page for a screenshot: `{ rect, color, dashed, label }` in viewport coordinates, plus a corner badge. */
	function drawMarks(marks, badge) {
		clearMarks();
		const layer = document.createElement("div");
		layer.setAttribute("data-polish-overlay", "");
		layer.style.cssText =
			"position:fixed;inset:0;z-index:2147483647;pointer-events:none;";
		for (const mark of marks) {
			const color = mark.color ?? "#ff2d55";
			const box = document.createElement("div");
			box.style.cssText = `position:absolute;left:${mark.rect.x - 3}px;top:${mark.rect.y - 3}px;width:${mark.rect.width + 6}px;height:${mark.rect.height + 6}px;border:2px ${mark.dashed ? "dashed" : "solid"} ${color};border-radius:4px;box-sizing:border-box;box-shadow:0 0 0 1px rgba(0,0,0,.55);`;
			layer.append(box);
			if (mark.label) {
				const tag = document.createElement("div");
				tag.textContent = mark.label;
				const above = mark.rect.y > 26;
				tag.style.cssText = `position:absolute;left:${Math.max(0, mark.rect.x - 3)}px;top:${above ? mark.rect.y - 24 : mark.rect.y + mark.rect.height + 5}px;background:${color};color:#fff;font:600 11px/1.5 system-ui,sans-serif;padding:0 6px;border-radius:3px;white-space:nowrap;`;
				layer.append(tag);
			}
		}
		if (badge) {
			const tag = document.createElement("div");
			tag.textContent = badge;
			tag.style.cssText =
				"position:absolute;right:8px;bottom:8px;background:#111;color:#fff;font:700 13px/1.6 system-ui,sans-serif;padding:2px 10px;border-radius:4px;border:1px solid #fff;";
			layer.append(tag);
		}
		document.documentElement.append(layer);
	}

	function clearMarks() {
		for (const layer of document.querySelectorAll("[data-polish-overlay]"))
			layer.remove();
	}

	/** Colors jump instead of fading, for measuring right after a theme change. */
	function freezeTransitions(frozen) {
		document.getElementById("polish-freeze")?.remove();
		if (!frozen) return;
		const sheet = document.createElement("style");
		sheet.id = "polish-freeze";
		sheet.textContent =
			"*, *::before, *::after { transition: none !important; animation: none !important; }";
		document.head.append(sheet);
	}

	function rectOf(nodeId) {
		const element = nodeOf(nodeId);
		return element?.isConnected
			? plainRect(element.getBoundingClientRect())
			: null;
	}

	// ------------------------------------------------------------------ wrapping

	const LATIN_WORD_CHAR = /[A-Za-zÀ-ɏЀ-ӿ0-9]/;
	const LABEL_MAX_LENGTH = 40;
	const REAL_WORD_MAX_LENGTH = 18;

	/** The rects of a text grouped into the lines they sit on. */
	function lineBoxes(rects) {
		const lines = [];
		const sorted = [...rects].sort((a, b) => a.top - b.top || a.left - b.left);
		for (const rect of sorted) {
			const last = lines.at(-1);
			if (
				last &&
				rect.top <
					last.bottom - Math.min(rect.height, last.bottom - last.top) / 2
			) {
				last.left = Math.min(last.left, rect.left);
				last.right = Math.max(last.right, rect.right);
				last.bottom = Math.max(last.bottom, rect.bottom);
			} else {
				lines.push({
					top: rect.top,
					bottom: rect.bottom,
					left: rect.left,
					right: rect.right,
				});
			}
		}
		return lines.map((line) => ({
			...line,
			x: line.left,
			y: line.top,
			width: line.right - line.left,
			height: line.bottom - line.top,
		}));
	}

	/** A chip, badge or tag: small, rounded well beyond a card's corners, holding one thing. */
	function isPill(element) {
		const computed = style(element);
		const rect = element.getBoundingClientRect();
		const rawRadius = computed.borderTopLeftRadius;
		const radius = rawRadius.endsWith("%")
			? (Number.parseFloat(rawRadius) / 100) * Math.min(rect.width, rect.height)
			: Number.parseFloat(rawRadius);
		return (
			radius >= 6 &&
			radius >= Math.min(rect.width, rect.height) * 0.2 &&
			rect.height < 80 &&
			rect.width < 240 &&
			element.childElementCount <= 1 &&
			hasVisibleBoundary(computed)
		);
	}

	/** The button, tab, navigation link or pill a text is the label of. */
	function labelHost(element) {
		const host =
			element.closest(
				"button, [role=tab], [role=button], summary, [role=menuitem], [role=option]",
			) ??
			element.closest(
				"nav a[href], [role=tablist] a[href], [role=navigation] a[href]",
			) ??
			(isPill(element)
				? element
				: element.parentElement && isPill(element.parentElement)
					? element.parentElement
					: null);
		if (!host) return null;
		if ((host.innerText ?? "").trim().length > LABEL_MAX_LENGTH) return null;
		return host;
	}

	function charRect(node, index) {
		const range = document.createRange();
		range.setStart(node, index);
		range.setEnd(node, index + 1);
		const rect = range.getClientRects()[0];
		return rect && rect.width > 0 ? rect : null;
	}

	/** Labels on two lines, real words broken in the middle, a heading leaving one word on its last line. */
	function probeWrapping() {
		const findings = [];
		const seenHosts = new Set();
		let rangeBudget = 8000;

		for (const { element, rects, text } of textElements()) {
			const lines = lineBoxes(rects);
			if (lines.length < 2) continue;
			const computed = style(element);

			const host = labelHost(element);
			if (host && !seenHosts.has(host)) {
				seenHosts.add(host);
				findings.push(
					finding(
						"label-wraps",
						host,
						`its label "${text.slice(0, LABEL_MAX_LENGTH)}" wraps onto ${lines.length} lines`,
						union(rects),
					),
				);
			}

			if (element.closest("h1, h2, h3, [role=heading]")) {
				const last = lines.at(-1);
				const widest = Math.max(...lines.map((line) => line.right - line.left));
				const words = text.split(" ");
				const wrap = `${computed.textWrapStyle ?? ""} ${computed.textWrap ?? ""}`;
				if (
					words.length > 2 &&
					words.at(-1).length <= 12 &&
					last.right - last.left < widest * 0.3 &&
					!/balance|pretty/.test(wrap)
				) {
					findings.push(
						finding(
							"orphan-word",
							element,
							`the heading leaves "${words.at(-1)}" alone on its last line (text-wrap: balance would even the lines out)`,
							union(rects),
						),
					);
				}
			}

			// only these let the browser break inside a word
			const breaksInsideWords =
				computed.overflowWrap === "anywhere" ||
				computed.overflowWrap === "break-word" ||
				computed.wordBreak === "break-all" ||
				computed.wordBreak === "break-word";
			if (!breaksInsideWords || text.length > 400) continue;

			let found = false;
			for (const node of element.childNodes) {
				if (found || rangeBudget <= 0) break;
				if (node.nodeType !== 3) continue;
				const value = node.nodeValue;
				let previous = null;
				let previousIndex = -1;
				for (let index = 1; index < value.length && rangeBudget > 0; index++) {
					if (
						!LATIN_WORD_CHAR.test(value[index - 1]) ||
						!LATIN_WORD_CHAR.test(value[index])
					) {
						continue;
					}
					const before =
						previousIndex === index - 1 ? previous : charRect(node, index - 1);
					const after = charRect(node, index);
					rangeBudget -= 2;
					previous = after;
					previousIndex = index;
					if (!before || !after) continue;
					if (after.top <= before.top + before.height / 2) continue;

					let start = index;
					while (start > 0 && LATIN_WORD_CHAR.test(value[start - 1])) start--;
					let end = index;
					while (end < value.length && LATIN_WORD_CHAR.test(value[end])) end++;
					let runStart = index;
					while (runStart > 0 && !/\s/.test(value[runStart - 1])) runStart--;
					let runEnd = index;
					while (runEnd < value.length && !/\s/.test(value[runEnd])) runEnd++;
					// a string longer than any word (a URL, a name without spaces) has to break somewhere, a word should not
					if (runEnd - runStart > REAL_WORD_MAX_LENGTH) continue;
					findings.push(
						finding(
							"mid-word-break",
							element,
							`the word "${value.slice(start, end)}" is broken as "${value.slice(start, index)} / ${value.slice(index, end)}" (${computed.wordBreak !== "normal" ? `word-break: ${computed.wordBreak}` : `overflow-wrap: ${computed.overflowWrap}`} in a box too narrow for it)`,
							union(rects),
						),
					);
					found = true;
					break;
				}
			}
		}
		return findings;
	}

	// ---------------------------------------------------------------- truncation

	/** How much empty space there is to the right of the element before the next thing on its row. */
	function roomRightOf(element) {
		const rect = element.getBoundingClientRect();
		let branch = element;
		for (
			let ancestor = element.parentElement, level = 0;
			ancestor && ancestor !== document.documentElement;
			ancestor = ancestor.parentElement, level++
		) {
			let limit = Number.POSITIVE_INFINITY;
			for (const child of ancestor.children) {
				if (child === branch || !isVisible(child)) continue;
				const other = child.getBoundingClientRect();
				if (
					other.left >= rect.right - 1 &&
					other.top < rect.bottom &&
					other.bottom > rect.top
				) {
					limit = Math.min(limit, other.left);
				}
			}
			if (limit !== Number.POSITIVE_INFINITY) return limit - rect.right;

			const computed = style(ancestor);
			const box = ancestor.getBoundingClientRect();
			const isRowEnd =
				level >= 3 ||
				ancestor === document.body ||
				hasVisibleBoundary(computed) ||
				computed.overflowX !== "visible";
			if (isRowEnd) {
				return (
					box.left +
					ancestor.clientLeft +
					ancestor.clientWidth -
					Number.parseFloat(computed.paddingRight) -
					rect.right
				);
			}
			branch = ancestor;
		}
		return 0;
	}

	/** Text cut with an ellipsis while the row it sits on has room for it. */
	function probeTruncation() {
		const findings = [];
		const seen = new Set();
		for (const { element } of textElements()) {
			let box = element;
			while (
				box &&
				box !== document.body &&
				(style(box).display === "inline" || style(box).display === "contents")
			) {
				box = box.parentElement;
			}
			if (!box || box === document.body || seen.has(box)) continue;
			seen.add(box);
			const computed = style(box);
			if (
				!computed.textOverflow.includes("ellipsis") ||
				computed.overflowX === "visible"
			) {
				continue;
			}
			const hidden = box.scrollWidth - box.clientWidth;
			if (hidden < 4) continue;
			const room = roomRightOf(box);
			if (room < Math.max(24, hidden * 0.5)) continue;
			findings.push(
				finding(
					"truncated-with-room",
					box,
					`cut with an ellipsis (${Math.round(hidden)}px hidden) while ${Math.round(room)}px to its right are empty`,
				),
			);
		}
		return findings;
	}

	// ------------------------------------------------------------------ squashed

	let measureContext;

	function textWidth(text, computed) {
		if (!measureContext) {
			measureContext = document.createElement("canvas").getContext("2d");
		}
		measureContext.font = `${computed.fontStyle} ${computed.fontWeight} ${computed.fontSize} ${computed.fontFamily}`;
		return measureContext.measureText(text).width;
	}

	function isRound(element, rect) {
		const radius = style(element).borderTopLeftRadius;
		return radius.endsWith("%")
			? Number.parseFloat(radius) >= 50
			: Number.parseFloat(radius) >= Math.min(rect.width, rect.height) / 2;
	}

	/** Controls and pictures pressed out of shape: a select too narrow for its value, an icon squeezed flat, a round avatar drawn as an oval. */
	function probeSquashed() {
		const findings = [];

		for (const select of scope().querySelectorAll("select")) {
			if (!isVisible(select) || select.multiple) continue;
			const shown = select.selectedOptions[0]?.textContent?.trim();
			if (!shown) continue;
			const computed = style(select);
			const available =
				select.clientWidth -
				Number.parseFloat(computed.paddingLeft) -
				Number.parseFloat(computed.paddingRight);
			const needed = textWidth(shown, computed);
			if (needed <= available + 4) continue;
			findings.push(
				finding(
					"squashed",
					select,
					`the select has ${Math.round(available)}px for its value "${shown.slice(0, 30)}", which needs ${Math.round(needed)}px`,
				),
			);
		}

		for (const svg of scope().querySelectorAll("svg[viewBox]")) {
			if (svg.closest("[data-polish-overlay]")) continue;
			if (svg.getAttribute("preserveAspectRatio") === "none") continue;
			const rect = svg.getBoundingClientRect();
			if (rect.width > 96 || rect.height > 96) continue;
			if (rect.width < 1 && rect.height < 1) continue;
			const computed = style(svg);
			if (computed.display === "none" || computed.visibility !== "visible")
				continue;
			const viewBox = svg.viewBox.baseVal;
			if (!viewBox || viewBox.width === 0 || viewBox.height === 0) continue;
			// an icon keeps its shape inside a box of another shape: only a box under half as wide (or
			// tall) as the drawing wants leaves it visibly small
			const natural = viewBox.width / viewBox.height;
			const rendered = Math.max(rect.width, 0.5) / Math.max(rect.height, 0.5);
			const squeeze =
				rendered < natural ? rendered / natural : natural / rendered;
			if (squeeze >= 0.5) continue;
			if (!svg.checkVisibility?.()) continue;
			findings.push(
				finding(
					"squashed",
					svg,
					`an icon with a ${viewBox.width}:${viewBox.height} view box is drawn in a ${Math.round(rect.width)}x${Math.round(rect.height)}px box`,
					rect.width < 4 || rect.height < 4
						? svg.parentElement.getBoundingClientRect()
						: rect,
				),
			);
		}

		for (const image of scope().querySelectorAll("img, picture, [role=img]")) {
			if (!isVisible(image)) continue;
			const rect = image.getBoundingClientRect();
			if (rect.width < 12 || rect.height < 12) continue;
			if (rect.width > 256 || rect.height > 256) continue;
			if (!isRound(image, rect)) continue;
			const off = Math.abs(rect.width - rect.height);
			if (off <= Math.max(2, Math.max(rect.width, rect.height) * 0.08))
				continue;
			findings.push(
				finding(
					"squashed",
					image,
					`a round picture is drawn as an oval, ${Math.round(rect.width)}x${Math.round(rect.height)}px`,
				),
			);
		}
		return findings;
	}

	// ----------------------------------------------------------------- alignment

	/** Values that sit a little off a spot most of the others share: `{ index, off, peers, peerIndex }`. */
	function nearMisses(values, min, max) {
		const order = values
			.map((value, index) => ({ value, index }))
			.sort((a, b) => a.value - b.value);
		const groups = [];
		for (const item of order) {
			const last = groups.at(-1);
			if (last && item.value - last.at(-1).value <= 0.75) last.push(item);
			else groups.push([item]);
		}
		const result = [];
		for (const group of groups) {
			if (group.length > 2) continue;
			const value = group[0].value;
			const big = groups.find((other) => {
				if (other === group) return false;
				if (other.length < Math.max(3, group.length * 2)) return false;
				const distance = Math.abs(other[0].value - value);
				return distance >= min && distance <= max;
			});
			if (!big) continue;
			for (const item of group) {
				result.push({
					index: item.index,
					off: Math.round((value - big[0].value) * 10) / 10,
					peers: big.length,
					peerIndex: big[0].index,
				});
			}
		}
		return result;
	}

	function firstTextRects(element) {
		const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
		for (let node = walker.nextNode(); node; node = walker.nextNode()) {
			if (!node.nodeValue.trim() || !node.parentElement) continue;
			if (!isVisible(node.parentElement)) continue;
			const range = document.createRange();
			range.selectNodeContents(node);
			const rects = [...range.getClientRects()].filter(
				(rect) => rect.width > 0.5 && rect.height > 0.5,
			);
			if (rects.length > 0) return { rects, parent: node.parentElement };
		}
		return null;
	}

	function isPositionedOut(element) {
		const position = style(element).position;
		return position === "absolute" || position === "fixed";
	}

	/** Things a few pixels off a line their siblings share, texts touching, one gap unlike the others. */
	function probeAlignment() {
		const findings = [];
		const reported = new Set();
		const report = (rule, element, detail, rect) => {
			if (reported.has(element)) return;
			reported.add(element);
			findings.push(finding(rule, element, detail, rect));
		};

		// headings of one level share a left edge
		for (const tag of ["h1", "h2", "h3"]) {
			const headings = [...scope().querySelectorAll(`main ${tag}`)]
				.filter(
					(heading) =>
						isVisible(heading) &&
						!["center", "right", "end"].includes(style(heading).textAlign),
				)
				.map((heading) => ({ heading, text: firstTextRects(heading) }))
				.filter((item) => item.text);
			if (headings.length < 3) continue;
			const lefts = headings.map((item) => item.text.rects[0].left);
			for (const miss of nearMisses(lefts, 1.5, 8)) {
				report(
					"near-miss-alignment",
					headings[miss.index].heading,
					`this <${tag}> starts ${Math.abs(miss.off)}px to the ${miss.off > 0 ? "right" : "left"} of ${miss.peers} other <${tag}> headings on the page`,
				);
			}
		}

		let parentsLeft = 3000;
		for (const parent of scope().querySelectorAll("*")) {
			if (parent.childElementCount < 2) continue;
			if (parentsLeft-- <= 0) break;
			if (parent.closest("[data-polish-overlay], svg")) continue;
			const children = [...parent.children].filter(
				(child) => isVisible(child) && !isPositionedOut(child),
			);
			if (children.length < 2) continue;
			const computed = style(parent);

			// things flowing like words, or wrapping rows pushed to the middle, start wherever the line puts them
			const isFlow =
				!/flex|grid/.test(computed.display) ||
				(computed.display.includes("flex") &&
					computed.flexWrap !== "nowrap" &&
					!["normal", "flex-start", "start", "left"].includes(
						computed.justifyContent,
					));
			const bySignature = Map.groupBy(children, (child) => signatureOf(child));
			for (const group of bySignature.values()) {
				if (group.length < 4) continue;
				if (
					isFlow &&
					group.some((child) => style(child).display.startsWith("inline"))
				)
					continue;
				if (isFlow && computed.display.includes("flex")) continue;
				const rects = group.map((child) => child.getBoundingClientRect());

				for (const miss of nearMisses(
					rects.map((rect) => rect.left),
					1.5,
					8,
				)) {
					const own = rects[miss.index];
					const peer = rects[miss.peerIndex];
					// centered boxes of different widths start at different spots by design
					if (
						Math.abs(own.left + own.width / 2 - (peer.left + peer.width / 2)) <
						1
					)
						continue;
					if (isRightAligned(computed) && Math.abs(own.right - peer.right) < 1)
						continue;
					report(
						"near-miss-alignment",
						group[miss.index],
						`starts ${Math.abs(miss.off)}px to the ${miss.off > 0 ? "right" : "left"} of ${miss.peers} siblings like it`,
					);
				}

				for (const miss of nearMisses(
					rects.map((rect) => rect.top),
					1.5,
					6,
				)) {
					const own = rects[miss.index];
					const peer = rects[miss.peerIndex];
					if (Math.abs(own.height - peer.height) > 1) continue;
					if (own.top >= peer.bottom || peer.top >= own.bottom) continue;
					report(
						"near-miss-alignment",
						group[miss.index],
						`sits ${Math.abs(miss.off)}px ${miss.off > 0 ? "lower" : "higher"} than ${miss.peers} siblings like it in the same row`,
					);
				}

				alignRows(group, rects, report);
			}

			if (
				(computed.display === "flex" || computed.display === "inline-flex") &&
				computed.flexDirection.startsWith("row")
			) {
				if (computed.alignItems === "center") {
					alignRowTexts(parent, children, report);
				}
				unevenGaps(parent, children, computed, report);
			}
		}

		touchingTexts(report);
		return findings;
	}

	/** Whether a box lines its children up by their right edge. */
	function isRightAligned(computed) {
		if (["right", "end"].includes(computed.textAlign)) return true;
		if (!computed.display.includes("flex")) return false;
		return computed.flexDirection.startsWith("column")
			? ["flex-end", "end"].includes(computed.alignItems)
			: ["flex-end", "end"].includes(computed.justifyContent);
	}

	/** Rows of one kind stacked on top of each other: the same part of every row starts at the same x. */
	function alignRows(rows, rects, report) {
		const order = rows
			.map((row, index) => ({ row, rect: rects[index] }))
			.sort((a, b) => a.rect.top - b.rect.top);
		for (let index = 1; index < order.length; index++) {
			if (order[index].rect.top < order[index - 1].rect.bottom - 1) return;
		}

		/** signature -> one element per row, when the row has exactly one */
		const parts = new Map();
		for (const [rowIndex, { row }] of order.entries()) {
			const counts = new Map();
			for (const part of [...row.querySelectorAll("[class]")].slice(0, 40)) {
				const signature = signatureOf(part);
				counts.set(signature, [...(counts.get(signature) ?? []), part]);
			}
			for (const [signature, found] of counts) {
				if (found.length !== 1 || !isVisible(found[0])) continue;
				// a part after some text starts wherever that text ends: only one with pictures or nothing before it lines up
				if (hasTextBefore(found[0], row)) continue;
				const list = parts.get(signature) ?? [];
				list.push({ rowIndex, element: found[0] });
				parts.set(signature, list);
			}
		}

		for (const list of parts.values()) {
			if (list.length < 3 || list.length < order.length * 0.6) continue;
			const partRects = list.map(({ element }) => {
				const text = firstTextRects(element);
				const box = element.getBoundingClientRect();
				return {
					left: text ? text.rects[0].left : box.left,
					right: box.right,
					center: box.left + box.width / 2,
				};
			});
			const majority = Math.max(2, Math.ceil(list.length * 0.6));
			const spread = (key) =>
				Math.max(...partRects.map((rect) => rect[key])) -
				Math.min(...partRects.map((rect) => rect[key]));
			if (spread("left") < 1.5) continue;
			// right aligned or centered columns line up on another edge
			if (spread("right") < 1 || spread("center") < 1) continue;

			const lefts = partRects.map((rect) => rect.left);
			const mode = lefts.find(
				(left) =>
					lefts.filter((other) => Math.abs(other - left) <= 0.75).length >=
					majority,
			);
			if (mode === undefined) continue;
			const peers = lefts.filter(
				(left) => Math.abs(left - mode) <= 0.75,
			).length;
			const index = lefts.findIndex((left) => {
				const off = Math.abs(left - mode);
				return off >= 1.5 && off <= 48;
			});
			if (index === -1) continue;
			const off = Math.round((lefts[index] - mode) * 10) / 10;
			report(
				"near-miss-alignment",
				list[index].element,
				`starts ${Math.abs(off)}px to the ${off > 0 ? "right" : "left"} of the same part in ${peers} sibling rows (rows are ragged)`,
			);
		}
	}

	/** Whether any text comes before the part within its row. */
	function hasTextBefore(part, row) {
		for (
			let current = part;
			current && current !== row;
			current = current.parentElement
		) {
			for (
				let sibling = current.previousSibling;
				sibling;
				sibling = sibling.previousSibling
			) {
				const text =
					sibling.nodeType === 3
						? sibling.nodeValue
						: sibling.nodeType === 1
							? (sibling.innerText ?? "")
							: "";
				if (text.trim()) return true;
			}
		}
		return false;
	}

	/** Texts of one size in a row that centers its items sit on one line. */
	function alignRowTexts(parent, children, report) {
		const items = [];
		for (const child of children) {
			const text = firstTextRects(child);
			if (!text) continue;
			// more than one text in the child: which one is meant to line up is anyone's guess
			if ((child.innerText ?? "").trim().includes("\n")) continue;
			if (lineBoxes(text.rects).length !== 1) continue;
			const rect = union(text.rects);
			items.push({
				child,
				center: rect.top + rect.height / 2,
				fontSize: Number.parseFloat(style(text.parent).fontSize),
				rect,
			});
		}
		for (let index = 1; index < items.length; index++) {
			const a = items[index - 1];
			const b = items[index];
			if (Math.abs(a.fontSize - b.fontSize) > 0.1) continue;
			// wrapped onto another row
			if (a.rect.bottom <= b.rect.top || b.rect.bottom <= a.rect.top) continue;
			const off = b.center - a.center;
			if (Math.abs(off) < 1.5 || Math.abs(off) > 6) continue;
			report(
				"misaligned-row",
				b.child,
				`its text sits ${Math.abs(Math.round(off * 10) / 10)}px ${off > 0 ? "lower" : "higher"} than "${snippet(a.child).slice(0, 30)}" next to it, in a row that centers its items (${label(parent)})`,
				union([a.rect, b.rect]),
			);
			return;
		}
	}

	/** A row with a `gap` where one pair of neighbours is further apart or closer than the rest. */
	function unevenGaps(parent, children, computed, report) {
		const gap = Number.parseFloat(computed.columnGap);
		if (!(gap > 0) || children.length < 4) return;
		const rects = children
			.map((child) => child.getBoundingClientRect())
			.sort((a, b) => a.left - b.left);
		const first = rects[0];
		if (
			rects.some((rect) => rect.top >= first.bottom || rect.bottom <= first.top)
		)
			return;
		const gaps = rects
			.slice(1)
			.map(
				(rect, index) => Math.round((rect.left - rects[index].right) * 10) / 10,
			);
		const regular = gaps.filter(
			(value) => Math.abs(value - gap) <= 0.75,
		).length;
		if (regular < gaps.length - 2 || regular === gaps.length) return;
		// a first or last item set apart (a label before its buttons, a main thing before the rest) is a choice
		const odd = gaps.slice(1, -1).find((value) => {
			const off = Math.abs(value - gap);
			return off >= 2 && off <= 8;
		});
		if (odd === undefined) return;
		report(
			"uneven-gaps",
			parent,
			`the gaps between its items are ${gaps.join(", ")}px where its gap is ${gap}px`,
		);
	}

	/** Two texts of different boxes run into each other on a line with nothing between them. */
	function touchingTexts(report) {
		const items = textElements()
			.slice(0, 2500)
			.flatMap(({ element, rects, text }) => {
				const lines = lineBoxes(rects);
				// only the ends of a one line text are known to be its first and last character
				if (lines.length !== 1) return [];
				// a cut text ends where its box does, with an ellipsis: nothing touches there
				const shown = clipToAncestors(element, lines[0]);
				if (!shown || Math.abs(shown.right - lines[0].right) > 1) return [];
				if (Math.abs(shown.left - lines[0].left) > 1) return [];
				return [{ element, rect: lines[0], text }];
			})
			.sort((a, b) => a.rect.left - b.rect.left);

		for (let i = 0; i < items.length; i++) {
			const a = items[i];
			for (let j = i + 1; j < items.length; j++) {
				const b = items[j];
				const gap = b.rect.left - a.rect.right;
				if (gap >= 2.5) {
					if (b.rect.left - a.rect.left > 2000) break;
					continue;
				}
				if (gap < -0.5) continue;
				const overlap =
					Math.min(a.rect.bottom, b.rect.bottom) -
					Math.max(a.rect.top, b.rect.top);
				const smaller = Math.min(
					a.rect.bottom - a.rect.top,
					b.rect.bottom - b.rect.top,
				);
				if (overlap < smaller * 0.6) continue;
				if (a.element.contains(b.element) || b.element.contains(a.element))
					continue;
				if (!/[\p{L}\p{N}]$/u.test(a.text) || !/^[\p{L}\p{N}]/u.test(b.text))
					continue;
				// parts of one word styled apart (3<sup>rd</sup>, Name<b>#1234</b>) touch on purpose
				const inlineTogether =
					a.element.parentElement === b.element.parentElement ||
					a.element.parentElement === b.element ||
					b.element.parentElement === a.element;
				if (
					inlineTogether &&
					(style(a.element).display === "inline" ||
						style(b.element).display === "inline")
				) {
					continue;
				}
				if (a.element.closest("sup, sub") || b.element.closest("sup, sub"))
					continue;
				// one word styled in two parts (a logo, an initial)
				if (/^\p{L}+$/u.test(a.text) && /^\p{L}+$/u.test(b.text)) continue;
				if (isOverlay(a.element, b.element) || isOverlay(b.element, a.element))
					continue;
				if (!isOnTop(a.element, a.rect) || !isOnTop(b.element, b.rect))
					continue;
				report(
					"touching-text",
					b.element,
					`"${b.text.slice(0, 30)}" starts ${Math.max(0, Math.round(gap * 10) / 10)}px after "${a.text.slice(-30)}" (${selectorOf(a.element)}): the two read as one word`,
					union([a.rect, b.rect]),
				);
			}
		}
	}

	// ---------------------------------------------------------------- fixed bars

	function nextFrames(count = 2) {
		return new Promise((resolve) => {
			const step = (left) =>
				left <= 0 ? resolve() : requestAnimationFrame(() => step(left - 1));
			step(count);
		});
	}

	function wait(ms) {
		return new Promise((resolve) => setTimeout(resolve, ms));
	}

	/** The viewport without the scrollbars a page may have (classic ones take space). */
	function viewportWidth() {
		return document.documentElement.clientWidth;
	}

	function viewportHeight() {
		return document.documentElement.clientHeight;
	}

	/** Bars stuck to an edge of the viewport: `edge` is "top" or "bottom". */
	function stuckBars(edge) {
		const bars = [];
		for (const element of document.body.querySelectorAll("*")) {
			const computed = style(element);
			if (computed.position !== "fixed" && computed.position !== "sticky")
				continue;
			if (element.closest("[data-polish-overlay]") || !isVisible(element))
				continue;
			const rect = element.getBoundingClientRect();
			if (rect.width < viewportWidth() * 0.5) continue;
			if (rect.height < 20 || rect.height > viewportHeight() * 0.4) continue;
			const atEdge =
				edge === "top" ? rect.top <= 1 : rect.bottom >= viewportHeight() - 1;
			if (atEdge) bars.push({ element, rect });
		}
		return bars;
	}

	/**
	 * The end of the page left under a bar fixed to the bottom of the screen, and in-page links whose
	 * target lands under the sticky header. Scrolls to the end of the page and back.
	 */
	async function probeFixedBars() {
		const findings = [];
		if (scopeRoot) return findings;
		const startY = scrollY;
		const maxY = document.documentElement.scrollHeight - viewportHeight();
		if (maxY < 40) return findings;

		scrollTo({ top: maxY, behavior: "instant" });
		await nextFrames();
		await wait(350);

		for (const bar of stuckBars("bottom")) {
			let lowest = null;
			for (const { element, rects } of textElements()) {
				if (bar.element.contains(element)) continue;
				if (isContained(element) && style(element).position !== "static")
					continue;
				if (hasFixedAncestor(element)) continue;
				const rect = union(rects);
				const covered =
					Math.min(rect.bottom, bar.rect.bottom) -
					Math.max(rect.top, bar.rect.top);
				if (covered < 4) continue;
				const x = Math.min(
					Math.max(rect.left + rect.width / 2, bar.rect.left + 1),
					bar.rect.right - 1,
				);
				const hit = document.elementFromPoint(
					x,
					Math.max(rect.top, bar.rect.top) + covered / 2,
				);
				if (!hit || !bar.element.contains(hit)) continue;
				if (!lowest || rect.bottom > lowest.rect.bottom) {
					lowest = { element, rect, covered };
				}
			}
			if (lowest) {
				findings.push(
					finding(
						"content-under-fixed-bar",
						lowest.element,
						`with the page scrolled to its end, ${Math.round(lowest.covered)}px of this are still under ${label(bar.element)}: the page needs that much more room at the bottom`,
						lowest.rect,
					),
				);
			}
		}

		const headerBottom = Math.max(
			0,
			...stuckBars("top").map((bar) => bar.rect.bottom),
		);
		if (headerBottom > 0) {
			const rootPadding =
				Number.parseFloat(style(document.documentElement).scrollPaddingTop) ||
				0;
			const seen = new Set();
			for (const link of document.querySelectorAll('a[href*="#"]')) {
				let url;
				try {
					url = new URL(link.href);
				} catch {
					continue;
				}
				if (url.pathname !== location.pathname || url.hash.length < 2) continue;
				const target = document.getElementById(
					decodeURIComponent(url.hash.slice(1)),
				);
				if (!target || seen.has(target) || !isVisible(target)) continue;
				seen.add(target);
				const margin =
					(Number.parseFloat(style(target).scrollMarginTop) || 0) + rootPadding;
				if (margin >= headerBottom - 4) continue;
				findings.push(
					finding(
						"anchor-under-header",
						target,
						`a link to #${target.id} scrolls this under the ${Math.round(headerBottom)}px sticky header (scroll-margin-top is ${Math.round(margin)}px)`,
					),
				);
			}
		}

		scrollTo({ top: startY, behavior: "instant" });
		await nextFrames();
		return findings;
	}

	function hasFixedAncestor(element) {
		for (let current = element; current; current = current.parentElement) {
			if (style(current).position === "fixed") return true;
		}
		return false;
	}

	// ------------------------------------------------------------------ scrollers

	/** A scroll box inside the scrolling page, and boxes that scroll by a few pixels by accident. */
	function probeScrollers() {
		const findings = [];
		const pageScrolls =
			document.documentElement.scrollHeight > innerHeight + 40 && !scopeRoot;

		for (const element of scope().querySelectorAll("*")) {
			if (element.matches("textarea, pre, code, select, input")) continue;
			const computed = style(element);
			const scrollsY =
				computed.overflowY === "auto" || computed.overflowY === "scroll";
			const scrollsX =
				computed.overflowX === "auto" || computed.overflowX === "scroll";
			if (!scrollsX && !scrollsY) continue;
			if (element.closest("[data-polish-overlay]") || !isVisible(element))
				continue;

			const extraY = element.scrollHeight - element.clientHeight;
			const extraX = element.scrollWidth - element.clientWidth;
			if (
				scrollsY &&
				extraY >= 2 &&
				extraY <= 12 &&
				element.clientHeight > 20
			) {
				findings.push(
					finding(
						"accidental-scroll",
						element,
						`scrolls vertically by ${extraY}px: its content is that much taller than the box`,
					),
				);
			} else if (
				scrollsX &&
				extraX >= 2 &&
				extraX <= 12 &&
				element.clientWidth > 20
			) {
				findings.push(
					finding(
						"accidental-scroll",
						element,
						`scrolls sideways by ${extraX}px: its content is that much wider than the box`,
					),
				);
			} else if (
				pageScrolls &&
				scrollsY &&
				extraY > 40 &&
				element.clientHeight >= 150 &&
				!hasFixedAncestor(element) &&
				!element.closest("dialog, [popover], [role=dialog]")
			) {
				findings.push(
					finding(
						"nested-scroll",
						element,
						`a ${element.clientHeight}px tall scroll box (${element.scrollHeight}px of content) inside the page, which scrolls as well`,
					),
				);
			}
		}
		return findings;
	}

	// ---------------------------------------------------------------------- junk

	const JUNK_TEXT =
		/\b(undefined|NaN|Invalid Date)\b|\[object [A-Z]\w+\]|\{\{\s*[\w.-]+\s*\}\}/;

	/** Values that leaked into the page as text, and controls with nothing to read or announce. */
	function probeJunk() {
		const findings = [];
		for (const { element, text } of textElements()) {
			if (element.closest("code, pre, kbd, [contenteditable]")) continue;
			const match =
				text.match(JUNK_TEXT) ?? (text === "null" ? ["null"] : null);
			if (!match) continue;
			findings.push(
				finding(
					"junk-text",
					element,
					`shows "${match[0]}" in "${text.slice(0, 60)}"`,
				),
			);
		}

		for (const element of interactiveElements()) {
			if (!element.matches("a[href], button, [role=button], [role=link]"))
				continue;
			if ((element.innerText ?? "").trim()) continue;
			if (
				element.getAttribute("aria-label")?.trim() ||
				element.getAttribute("aria-labelledby") ||
				element.getAttribute("title")?.trim()
			) {
				continue;
			}
			if (
				element.querySelector(
					'img[alt]:not([alt=""]), svg[aria-label], svg title, [aria-label]',
				)
			) {
				continue;
			}
			findings.push(
				finding(
					"unlabeled-control",
					element,
					"a control with no text and no label: nothing to read, nothing for a screen reader to announce",
				),
			);
		}
		return findings;
	}

	// ---------------------------------------------------------------- ui contrast

	/** Icons that are all a control shows need 3:1 against what is behind them (WCAG 1.4.11). */
	function probeUiContrast() {
		const findings = [];
		for (const control of interactiveElements()) {
			if ((control.innerText ?? "").trim()) continue;
			const icon = control.querySelector("svg");
			if (!icon || control.querySelector("img, picture")) continue;
			const shape = icon.querySelector(
				"path, circle, rect, line, polyline, polygon, ellipse, use",
			);
			if (!shape) continue;
			const shapeStyle = getComputedStyle(shape);
			const paint =
				shapeStyle.fill !== "none" && parseColor(shapeStyle.fill)[3] > 0.05
					? shapeStyle.fill
					: shapeStyle.stroke;
			if (!paint || paint === "none") continue;
			const rect = icon.getBoundingClientRect();
			if (rect.width < 6 || rect.height < 6) continue;
			const background = backgroundBehind(icon, {
				x: rect.left + rect.width / 2,
				y: rect.top + rect.height / 2,
			});
			if (!background) continue;
			const { ratio, foreground } = contrastOf(
				paint,
				effectiveOpacity(icon),
				background,
			);
			if (ratio >= 3 - 0.05) continue;
			findings.push({
				...finding(
					"low-contrast-ui",
					control,
					`its icon is all this control shows and has ${ratio.toFixed(2)}:1 against its background (needs 3:1), ${hex(foreground)} on ${hex(background)}`,
				),
				ratio: Math.round(ratio * 100) / 100,
				colors: `${hex(foreground)}/${hex(background)}`,
			});
		}
		return findings;
	}

	// -------------------------------------------------------------------- census

	const TOKEN_PREFIXES = {
		fontSize: "--font-",
		fontWeight: "--weight-",
		radius: "--radius-",
		gap: "--s-",
	};

	/** The design tokens of the page as computed pixel values: `{ fontSize: { "14.4": "--font-sm" }, ... }`. */
	function tokens() {
		const names = new Set();
		for (const sheet of document.styleSheets) {
			let rules;
			try {
				rules = sheet.cssRules;
			} catch {
				continue;
			}
			collectCustomProperties(rules, names);
		}
		const probe = document.createElement("div");
		probe.setAttribute("data-polish-overlay", "");
		probe.style.cssText = "position:absolute;visibility:hidden;left:-9999px;";
		document.body.append(probe);
		const result = { fontSize: {}, fontWeight: {}, radius: {}, gap: {} };
		for (const name of names) {
			const kind = Object.keys(TOKEN_PREFIXES).find((key) =>
				name.startsWith(TOKEN_PREFIXES[key]),
			);
			if (!kind) continue;
			const property = {
				fontSize: "fontSize",
				fontWeight: "fontWeight",
				radius: "borderTopLeftRadius",
				gap: "width",
			}[kind];
			probe.style[property] = `var(${name})`;
			const value = Number.parseFloat(getComputedStyle(probe)[property]);
			probe.style[property] = "";
			// a token that resolves to nothing here is a multiplier or a name for something else
			if (Number.isFinite(value) && value > 0)
				result[kind][String(round1(value))] = name;
		}
		probe.remove();
		return result;
	}

	function collectCustomProperties(rules, names) {
		for (const rule of rules) {
			if (rule.cssRules?.length) collectCustomProperties(rule.cssRules, names);
			if (!rule.style) continue;
			for (const property of rule.style) {
				if (property.startsWith("--")) names.add(property);
			}
		}
	}

	function round1(value) {
		return Math.round(value * 10) / 10;
	}

	/**
	 * What the page is made of, for a site wide look at consistency: every font size, weight, corner radius
	 * and gap in use, with how often and by which components. `{ fontSize: { "13": { count, signatures, example } } }`.
	 */
	function census() {
		const result = { fontSize: {}, fontWeight: {}, radius: {}, gap: {} };
		const note = (kind, value, element) => {
			if (!Number.isFinite(value)) return;
			const key = String(round1(value));
			result[kind][key] ??= { count: 0, signatures: [], example: null };
			const entry = result[kind][key];
			entry.count++;
			const signature = signatureOf(element);
			if (entry.signatures.length < 12 && !entry.signatures.includes(signature))
				entry.signatures.push(signature);
			entry.example ??= {
				selector: selectorOf(element),
				text: snippet(element).slice(0, 40),
			};
		};

		for (const { element } of textElements()) {
			const computed = style(element);
			note("fontSize", Number.parseFloat(computed.fontSize), element);
			note("fontWeight", Number(computed.fontWeight), element);
		}
		for (const element of scope().querySelectorAll("*")) {
			if (element.closest("[data-polish-overlay], svg")) continue;
			const computed = style(element);
			const hasRadius = !computed.borderTopLeftRadius.endsWith("%");
			const radius = Number.parseFloat(computed.borderTopLeftRadius);
			const isFlexOrGrid = /flex|grid/.test(computed.display);
			if (!(hasRadius && radius > 0) && !isFlexOrGrid) continue;
			if (!isVisible(element)) continue;
			const rect = element.getBoundingClientRect();
			// a radius of half the box or more is a circle or a pill whatever the number
			if (
				hasRadius &&
				radius > 0 &&
				radius < Math.min(rect.width, rect.height) / 2 &&
				hasVisibleBoundary(computed)
			) {
				note("radius", radius, element);
			}
			if (isFlexOrGrid && element.childElementCount > 1) {
				const gap = Number.parseFloat(
					computed.flexDirection?.startsWith("column")
						? computed.rowGap
						: computed.columnGap,
				);
				if (gap > 0) note("gap", gap, element);
			}
		}

		const heading =
			document.querySelector("main h1") ?? document.querySelector("h1");
		const main = document.querySelector("main");
		return {
			values: result,
			title: document.title,
			heading:
				heading && isVisible(heading)
					? {
							fontSize: round1(Number.parseFloat(style(heading).fontSize)),
							fontWeight: Number(style(heading).fontWeight),
							left: main
								? round1(
										heading.getBoundingClientRect().left -
											main.getBoundingClientRect().left,
									)
								: null,
							selector: selectorOf(heading),
							text: snippet(heading).slice(0, 40),
						}
					: null,
		};
	}

	// -------------------------------------------------------------------- pixels

	/** A screenshot (base64 PNG) as pixel data. */
	async function decodeImage(base64) {
		const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
		const bitmap = await createImageBitmap(
			new Blob([bytes], { type: "image/png" }),
		);
		const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
		const context = canvas.getContext("2d", { willReadFrequently: true });
		context.drawImage(bitmap, 0, 0);
		return context.getImageData(0, 0, bitmap.width, bitmap.height);
	}

	function pixelDistance(data, offset, color) {
		return (
			Math.abs(data[offset] - color[0]) +
			Math.abs(data[offset + 1] - color[1]) +
			Math.abs(data[offset + 2] - color[2])
		);
	}

	/**
	 * Where two screenshots of the same clip differ: the box around the differing pixels (in CSS pixels of
	 * the clip), how many there are and how strong the biggest difference is (0-765).
	 */
	async function diffImages(base64A, base64B, scale = 1) {
		const [a, b] = await Promise.all([
			decodeImage(base64A),
			decodeImage(base64B),
		]);
		if (a.width !== b.width || a.height !== b.height) return null;
		let left = a.width;
		let top = a.height;
		let right = -1;
		let bottom = -1;
		let count = 0;
		let strongest = 0;
		for (let y = 0; y < a.height; y++) {
			for (let x = 0; x < a.width; x++) {
				const offset = (y * a.width + x) * 4;
				const distance = pixelDistance(a.data, offset, [
					b.data[offset],
					b.data[offset + 1],
					b.data[offset + 2],
				]);
				if (distance < 12) continue;
				count++;
				strongest = Math.max(strongest, distance);
				left = Math.min(left, x);
				right = Math.max(right, x);
				top = Math.min(top, y);
				bottom = Math.max(bottom, y);
			}
		}
		if (count === 0) return { count: 0, strongest: 0, box: null };
		return {
			count,
			strongest,
			box: {
				left: left / scale,
				top: top / scale,
				right: (right + 1) / scale,
				bottom: (bottom + 1) / scale,
			},
		};
	}

	/**
	 * Where the ink of a control sits in its box, from a screenshot of the box: the gaps between the drawn
	 * content and each inner edge, in CSS pixels. Null when the picture can't be read (a patterned background).
	 */
	async function inkGaps(nodeId, base64, scale = 1, inset = {}) {
		const element = nodeOf(nodeId);
		if (!element) return null;
		const image = await decodeImage(base64);
		const computed = getComputedStyle(element);
		const { data } = image;
		// the element's box inside the picture: a screenshot is cut at whole pixels around it
		const box = {
			left: Math.round((inset.left ?? 0) * scale),
			top: Math.round((inset.top ?? 0) * scale),
			right: image.width - Math.round((inset.right ?? 0) * scale),
			bottom: image.height - Math.round((inset.bottom ?? 0) * scale),
		};
		const width = box.right - box.left;
		const height = box.bottom - box.top;
		const border = {
			left: Math.ceil(Number.parseFloat(computed.borderLeftWidth) * scale) + 1,
			right:
				Math.ceil(Number.parseFloat(computed.borderRightWidth) * scale) + 1,
			top: Math.ceil(Number.parseFloat(computed.borderTopWidth) * scale) + 1,
			bottom:
				Math.ceil(Number.parseFloat(computed.borderBottomWidth) * scale) + 1,
		};
		const rawRadius = computed.borderTopLeftRadius;
		const radius = Math.min(
			rawRadius.endsWith("%")
				? (Number.parseFloat(rawRadius) / 100) * Math.min(width, height)
				: Number.parseFloat(rawRadius) * scale,
			width / 2,
			height / 2,
		);
		/** `x`, `y` within the element's box */
		const isInside = (x, y) => {
			if (
				x < border.left ||
				y < border.top ||
				x >= width - border.right ||
				y >= height - border.bottom
			)
				return false;
			const cornerX =
				x < radius ? radius : x >= width - radius ? width - radius : null;
			const cornerY =
				y < radius ? radius : y >= height - radius ? height - radius : null;
			if (cornerX === null || cornerY === null) return true;
			// a little inside the curve, where the anti-aliased edge has ended
			return (
				Math.hypot(x + 0.5 - cornerX, y + 0.5 - cornerY) < radius - 2 * scale
			);
		};
		const offsetOf = (x, y) => ((y + box.top) * image.width + x + box.left) * 4;

		// the background is the color most of the inside has
		const counts = new Map();
		let insideCount = 0;
		for (let y = 0; y < height; y++) {
			for (let x = 0; x < width; x++) {
				if (!isInside(x, y)) continue;
				insideCount++;
				const offset = offsetOf(x, y);
				const key =
					((data[offset] >> 2) << 12) |
					((data[offset + 1] >> 2) << 6) |
					(data[offset + 2] >> 2);
				counts.set(key, (counts.get(key) ?? 0) + 1);
			}
		}
		if (insideCount < 16) return null;
		const [backgroundKey, backgroundCount] = [...counts].sort(
			(a, b) => b[1] - a[1],
		)[0];
		if (backgroundCount < insideCount * 0.35) return null;
		const background = [
			((backgroundKey >> 12) & 63) << 2,
			((backgroundKey >> 6) & 63) << 2,
			(backgroundKey & 63) << 2,
		];

		let left = width;
		let top = height;
		let right = -1;
		let bottom = -1;
		for (let y = 0; y < height; y++) {
			for (let x = 0; x < width; x++) {
				if (!isInside(x, y)) continue;
				if (pixelDistance(data, offsetOf(x, y), background) < 90) continue;
				left = Math.min(left, x);
				right = Math.max(right, x);
				top = Math.min(top, y);
				bottom = Math.max(bottom, y);
			}
		}
		if (right < 0) return null;
		const gaps = {
			left: (left - border.left + 1) / scale,
			right: (width - border.right + 1 - (right + 1)) / scale,
			top: (top - border.top + 1) / scale,
			bottom: (height - border.bottom + 1 - (bottom + 1)) / scale,
			inkWidth: (right - left + 1) / scale,
			inkHeight: (bottom - top + 1) / scale,
		};
		// something drawn right at the edge is the box (an inner border, a shadow, an uneven corner), not what it holds
		if (Math.min(gaps.left, gaps.right, gaps.top, gaps.bottom) < 1.5)
			return null;
		return gaps;
	}

	const CAPS_AND_DIGITS = /^[A-Z0-9 +\-%.:/#!?&]+$/;

	/** Controls whose drawn content can be checked for sitting in the middle: icon only, or a one line label. */
	function listCenterCandidates(skipSignatures = []) {
		const skip = new Set(skipSignatures);
		const result = [];
		const candidates = new Set(interactiveElements());
		for (const element of scope().querySelectorAll("span, div, li")) {
			if (
				element.childElementCount <= 1 &&
				isPill(element) &&
				isVisible(element)
			)
				candidates.add(element);
		}
		for (const element of candidates) {
			const sig = signatureOf(element);
			if (skip.has(sig)) continue;
			const rect = element.getBoundingClientRect();
			if (rect.height > 64 || rect.width > 200 || rect.width < 12) continue;
			if (rect.height < 12) continue;
			const text = (element.innerText ?? "").trim();
			const icons = element.querySelectorAll("svg, img");
			// a picture has its own empty space drawn in: only a vector icon's ink says where it sits
			const isIconOnly =
				!text && icons.length === 1 && icons[0].tagName === "svg";
			const isLabel = text && icons.length === 0 && !text.includes("\n");
			if (!isIconOnly && !isLabel) continue;
			const computed = style(element);
			// only a box that shows gives the eye something to center against
			if (!hasVisibleBoundary(computed)) continue;
			if (computed.backgroundImage !== "none") continue;
			if (
				isLabel &&
				["left", "right", "start", "end"].includes(computed.textAlign) &&
				computed.display.includes("block") &&
				rect.width > 120
			)
				continue;
			skip.add(sig);
			result.push({
				nodeId: idOf(element),
				sig,
				selector: selectorOf(element),
				text: snippet(element),
				kind: isIconOnly ? "icon" : "label",
				// lowercase letters have no shared top or bottom to center by
				vertical: isIconOnly || CAPS_AND_DIGITS.test(text),
			});
		}
		return result;
	}

	/** Makes the element's own text invisible (or visible again), so what is behind it can be sampled. */
	function hideText(nodeId, hidden) {
		const element = nodeOf(nodeId);
		if (!element) return false;
		if (hidden) {
			element.setAttribute(
				"data-polish-hidden-text",
				element.getAttribute("style") ?? "",
			);
			element.style.setProperty("color", "transparent", "important");
			element.style.setProperty(
				"-webkit-text-fill-color",
				"transparent",
				"important",
			);
			element.style.setProperty("text-shadow", "none", "important");
			element.style.setProperty("transition", "none", "important");
		} else if (element.hasAttribute("data-polish-hidden-text")) {
			const previous = element.getAttribute("data-polish-hidden-text");
			if (previous) element.setAttribute("style", previous);
			else element.removeAttribute("style");
			element.removeAttribute("data-polish-hidden-text");
		}
		return true;
	}

	/** The text's rect on screen and color, for a text whose background could not be computed. */
	function textBox(nodeId) {
		const element = nodeOf(nodeId);
		if (!element?.isConnected) return null;
		const range = document.createRange();
		const rects = [];
		for (const node of element.childNodes) {
			if (node.nodeType !== 3 || !node.nodeValue.trim()) continue;
			range.selectNodeContents(node);
			rects.push(...range.getClientRects());
		}
		if (rects.length === 0) return null;
		const computed = getComputedStyle(element);
		return {
			rect: plainRect(union(rects)),
			color: computed.color,
			opacity: effectiveOpacity(element),
			fontSize: Number.parseFloat(computed.fontSize),
			fontWeight: Number(computed.fontWeight),
		};
	}

	/**
	 * Contrast of a text against the pixels behind it (a screenshot taken with the text hidden): the ratio
	 * against the worst fifth of the background, and against its middle.
	 */
	async function contrastOverPixels(box, base64) {
		const image = await decodeImage(base64);
		const color = parseColor(box.color);
		const ratios = [];
		const step = Math.max(
			1,
			Math.floor(Math.sqrt((image.width * image.height) / 1500)),
		);
		let worstBackground = null;
		let worstRatio = Number.POSITIVE_INFINITY;
		for (let y = 0; y < image.height; y += step) {
			for (let x = 0; x < image.width; x += step) {
				const offset = (y * image.width + x) * 4;
				const background = [
					image.data[offset],
					image.data[offset + 1],
					image.data[offset + 2],
					1,
				];
				const foreground = blend(
					[color[0], color[1], color[2], color[3] * box.opacity],
					background,
				);
				const lighter = Math.max(luminance(foreground), luminance(background));
				const darker = Math.min(luminance(foreground), luminance(background));
				const ratio = (lighter + 0.05) / (darker + 0.05);
				ratios.push(ratio);
				if (ratio < worstRatio) {
					worstRatio = ratio;
					worstBackground = background;
				}
			}
		}
		if (ratios.length === 0) return null;
		ratios.sort((a, b) => a - b);
		const isLarge =
			box.fontSize >= 24 || (box.fontSize >= 18.66 && box.fontWeight >= 700);
		return {
			required: isLarge ? 3 : 4.5,
			worstFifth: ratios[Math.floor(ratios.length * 0.2)],
			median: ratios[Math.floor(ratios.length / 2)],
			lowest: ratios[0],
			text: hex(
				blend(
					[color[0], color[1], color[2], color[3] * box.opacity],
					worstBackground,
				),
			),
			background: hex(worstBackground),
		};
	}

	// ------------------------------------------------------------------ overlays

	const OVERLAY_SELECTOR =
		"dialog[open], :popover-open, [role=dialog], [role=alertdialog], [role=menu], [role=listbox]";

	function openOverlays() {
		return [...document.querySelectorAll(OVERLAY_SELECTOR)].filter(
			(element) =>
				!element.closest("[data-polish-overlay]") && isVisible(element),
		);
	}

	let overlaysBefore = new Set();

	/** Remembers what is open, so `newOverlays` can tell what a click opened. */
	function markOverlays() {
		overlaysBefore = new Set(openOverlays());
		return overlaysBefore.size;
	}

	/** The dialogs, popovers, menus and listboxes opened since `markOverlays`, outermost only. */
	function newOverlays() {
		const fresh = openOverlays().filter(
			(element) => !overlaysBefore.has(element),
		);
		return fresh
			.filter(
				(element) =>
					!fresh.some((other) => other !== element && other.contains(element)),
			)
			.map((element) => ({
				nodeId: idOf(element),
				selector: selectorOf(element),
				sig: signatureOf(element),
				text: snippet(element),
				rect: plainRect(element.getBoundingClientRect()),
				kind: element.matches("dialog, [role=dialog], [role=alertdialog]")
					? "dialog"
					: element.matches("[role=menu]")
						? "menu"
						: element.matches("[role=listbox]")
							? "listbox"
							: "popover",
			}));
	}

	function isScrollLocked() {
		return [document.documentElement, document.body].some((element) =>
			["hidden", "clip"].includes(getComputedStyle(element).overflowY),
		);
	}

	/** What is open on the page right now, in a few words (`dialog "Edit the team" open`), or null. */
	function stateLabel() {
		const overlay = openOverlays().at(-1);
		if (!overlay) return null;
		const name = (
			overlay.getAttribute("aria-label") ??
			overlay.querySelector("h1, h2, h3, [role=heading]")?.innerText ??
			snippet(overlay)
		)
			.replace(/\s+/g, " ")
			.slice(0, 40);
		const kind = overlay.matches("dialog, [role=dialog], [role=alertdialog]")
			? "dialog"
			: overlay.matches("[role=menu]")
				? "menu"
				: overlay.matches("[role=listbox]")
					? "listbox"
					: "popover";
		return `${kind} "${name}" open`;
	}

	/** An open overlay that reaches past the screen where no scrolling brings it back. */
	function probeOverlay(nodeId) {
		const element = nodeOf(nodeId);
		if (!element?.isConnected) return [];
		const rect = element.getBoundingClientRect();
		const outLeft = -rect.left;
		const outRight = rect.right - viewportWidth();
		const outTop = -rect.top;
		const outBottom = rect.bottom - viewportHeight();
		const sideways = Math.max(outLeft, outRight);
		if (sideways > 2) {
			return [
				finding(
					"overlay-offscreen",
					element,
					`${Math.round(sideways)}px of it are past the ${outLeft > outRight ? "left" : "right"} edge of the screen`,
				),
			];
		}
		const vertical = Math.max(outTop, outBottom);
		const staysPut =
			hasFixedAncestor(element) ||
			element.matches(":popover-open, dialog:modal") ||
			isScrollLocked();
		if (vertical > 2 && staysPut) {
			return [
				finding(
					"overlay-offscreen",
					element,
					`${Math.round(vertical)}px of it are past the ${outTop > outBottom ? "top" : "bottom"} edge of the screen, and it does not scroll with the page`,
				),
			];
		}
		return [];
	}

	/** Controls that are not links or tabs: buttons, switches, checkboxes, whatever opens something. Clicked only with writes blocked. */
	function listButtons(skipKeys = []) {
		const skip = new Set(skipKeys);
		const result = [];
		// the rows of a list all open the same kind of thing: two of a kind are enough
		const perSignature = new Map();
		for (const element of interactiveElements()) {
			if (
				!element.matches(
					'button, [role=button], [role=switch], [role=checkbox], [role=radio], [role=menuitem], input[type="checkbox"], input[type="radio"], label',
				)
			) {
				continue;
			}
			if (element.matches("[role=tab], summary") || element.closest("a[href]"))
				continue;
			const name = (
				(element.innerText ?? "").trim() ||
				element.getAttribute("aria-label") ||
				element.getAttribute("title") ||
				""
			)
				.replace(/\s+/g, " ")
				.replace(/\d+/g, "N")
				.slice(0, 40);
			const signature = signatureOf(element);
			const key = `button:${signature}:${name}`;
			if (skip.has(key)) continue;
			const alike = perSignature.get(signature) ?? 0;
			if (alike >= 2) continue;
			perSignature.set(signature, alike + 1);
			skip.add(key);
			result.push({
				nodeId: idOf(element),
				kind:
					element.matches(
						'button:not([type="button"]), input[type="submit"]',
					) && element.closest("form")
						? "submit"
						: "button",
				key,
				inShell: !element.closest("main"),
				selector: selectorOf(element),
				text: snippet(element) || name,
			});
		}
		return result;
	}

	/** Changes when the page is in another state than before: another URL, more or fewer elements, something opened or checked. */
	function stateStamp() {
		return [
			location.pathname + location.search,
			[...document.querySelectorAll("main *")].filter((element) =>
				element.checkVisibility(),
			).length,
			openOverlays().length,
			document.querySelectorAll(
				":checked, [aria-checked=true], [aria-expanded=true], [aria-selected=true], [aria-pressed=true], details[open]",
			).length,
		].join("|");
	}

	// --------------------------------------------------------------------- focus

	/** Takes keyboard focus off the page content without losing keyboard modality (so the next focus() shows its ring). */
	function focusSink() {
		let sink = document.getElementById("polish-focus-sink");
		if (!sink) {
			sink = document.createElement("button");
			sink.id = "polish-focus-sink";
			sink.setAttribute("data-polish-overlay", "");
			sink.style.cssText =
				"position:fixed;left:-200px;top:-200px;width:1px;height:1px;opacity:0;";
		}
		// with a modal open the rest of the page takes no focus
		const host = document.querySelector("dialog:modal") ?? document.body;
		if (sink.parentElement !== host) host.append(sink);
		sink.focus({ preventScroll: true });
		return document.activeElement === sink;
	}

	/** Puts the starting point of Tab at the very beginning of the page. */
	function focusStart() {
		let start = document.getElementById("polish-focus-start");
		if (!start) {
			start = document.createElement("span");
			start.id = "polish-focus-start";
			start.tabIndex = -1;
			start.setAttribute("data-polish-overlay", "");
			start.style.cssText =
				"position:fixed;left:0;top:0;width:1px;height:1px;opacity:0;";
			document.body.prepend(start);
		}
		start.focus({ preventScroll: true });
	}

	/** Where keyboard focus is and whether it can be seen there. */
	function focusState() {
		const element = document.activeElement;
		if (!element || element === document.body) return null;
		if (element.closest("[data-polish-overlay]")) return null;
		const rect = element.getBoundingClientRect();
		// a hidden checkbox or radio shows its focus on the label drawn in its place
		const standIn = element.matches("input")
			? [...(element.labels ?? [])].find((candidate) => isVisible(candidate))
			: null;
		const visible = isVisible(element) || Boolean(standIn);
		const inViewport =
			rect.bottom > 0 &&
			rect.top < innerHeight &&
			rect.right > 0 &&
			rect.left < innerWidth;
		let obscuredBy = null;
		if (visible && inViewport) {
			const x = Math.min(
				Math.max(rect.left + rect.width / 2, 1),
				innerWidth - 2,
			);
			const y = Math.min(
				Math.max(rect.top + rect.height / 2, 1),
				innerHeight - 2,
			);
			const hit = document.elementFromPoint(x, y);
			if (hit && !element.contains(hit) && !hit.contains(element)) {
				let bar = hit;
				while (bar && !["fixed", "sticky"].includes(style(bar).position)) {
					bar = bar.parentElement;
				}
				if (bar && !bar.contains(element)) obscuredBy = label(bar);
			}
		}
		return {
			nodeId: idOf(element),
			sig: signatureOf(element),
			selector: selectorOf(element),
			text: snippet(element),
			tag: element.tagName.toLowerCase(),
			rect: plainRect(rect),
			visible,
			inViewport,
			obscuredBy,
		};
	}

	/** What the element's outline is meant to look like, for telling a ring that is cut off from one that was never there. */
	function outlineOf(nodeId) {
		const element = nodeOf(nodeId);
		if (!element) return null;
		const computed = getComputedStyle(element);
		return {
			style: computed.outlineStyle,
			width: Number.parseFloat(computed.outlineWidth) || 0,
			offset: Number.parseFloat(computed.outlineOffset) || 0,
			focusVisible: element.matches(":focus-visible"),
		};
	}

	/** The hashes of the CSS modules that have a class on this page (a built class reads `_name_hash_line`). */
	function moduleHashes() {
		const hashes = new Set();
		for (const element of document.querySelectorAll("[class]")) {
			for (const name of classNames(element)) {
				const hash = name.match(/^_.+_([a-z0-9]{5})_\d+$/)?.[1];
				if (hash) hashes.add(hash);
			}
		}
		return [...hashes];
	}

	function caseOf(nodeId) {
		return (
			nodeOf(nodeId)?.closest("[data-case]")?.getAttribute("data-case") ?? null
		);
	}

	/** The numbers behind a claim about an element: its box, its text and the styles alignment and spacing come from. */
	function inspect(element) {
		const computed = getComputedStyle(element);
		const text = firstTextRects(element);
		return {
			selector: selectorOf(element),
			text: snippet(element).slice(0, 60),
			box: plainRect(element.getBoundingClientRect()),
			textBox: text ? plainRect(union(text.rects)) : null,
			textLines: text ? lineBoxes(text.rects).length : 0,
			content: `${element.scrollWidth}x${element.scrollHeight} in ${element.clientWidth}x${element.clientHeight}`,
			font: `${computed.fontWeight} ${computed.fontSize}/${computed.lineHeight}`,
			color: computed.color,
			background: computed.backgroundColor,
			padding: computed.padding,
			margin: computed.margin,
			border: `${computed.borderTopWidth} ${computed.borderTopStyle} ${computed.borderTopColor}`,
			radius: computed.borderRadius,
			display: computed.display,
			position: computed.position,
			gap: computed.gap,
			align: `${computed.alignItems} / ${computed.justifyContent}`,
			overflow: `${computed.overflowX} ${computed.overflowY}`,
			textOverflow: computed.textOverflow,
			whiteSpace: computed.whiteSpace,
			width: `min ${computed.minWidth}, max ${computed.maxWidth}`,
			parent: element.parentElement ? label(element.parentElement) : null,
		};
	}

	const PROBES = {
		overflow: probeOverflow,
		overlap: probeOverlap,
		"horizontal-scroll": probeHorizontalScroll,
		contrast: probeContrast,
		"ui-contrast": probeUiContrast,
		images: probeImages,
		"raw-keys": probeRawKeys,
		"tap-targets": probeTapTargets,
		centering: probeCentering,
		wrapping: probeWrapping,
		truncation: probeTruncation,
		squashed: probeSquashed,
		alignment: probeAlignment,
		"fixed-bars": probeFixedBars,
		scrollers: probeScrollers,
		junk: probeJunk,
	};

	window.__polish = {
		/** Runs the named probes, on the whole page or (`scope`, a node id) inside one element. */
		async run(names, { scope: scopeId } = {}) {
			const findings = [];
			scopeRoot = scopeId ? nodeOf(scopeId) : null;
			try {
				for (const name of names) {
					try {
						findings.push(...(await PROBES[name]()));
					} catch (error) {
						findings.push({
							rule: "probe-error",
							detail: `${name}: ${error.message}`,
							selector: "",
							sig: name,
							text: "",
							rect: { x: 0, y: 0, width: 0, height: 0 },
						});
					}
				}
			} finally {
				scopeRoot = null;
			}
			return findings;
		},
		probeNames: () => Object.keys(PROBES),
		/** The layout shifts so far, each told whether a web font arrived at that moment. */
		shifts: () =>
			shifts.map((shift) => ({
				...shift,
				fontSwap: fontTimes.some((time) => Math.abs(shift.time - time) <= 80),
			})),
		clearShifts: () => shifts.splice(0, shifts.length),
		listInteractive,
		listActions,
		listButtons,
		listCenterCandidates,
		reveal,
		rectOf,
		styleSnapshot,
		freezeTransitions,
		focusNode,
		focusSink,
		focusStart,
		focusState,
		outlineOf,
		snapshotLayout,
		snapshotLayoutFor: (element) => snapshotLayout(idOf(element)),
		diffLayout,
		markOverlays,
		newOverlays,
		probeOverlay,
		stateStamp,
		stateLabel,
		unmeasuredContrast: () => contrastUnmeasured,
		hideText,
		textBox,
		contrastOverPixels,
		diffImages,
		inkGaps,
		tokens,
		census,
		caseOf,
		elementOf: nodeOf,
		moduleHashes,
		inspect,
		drawMarks,
		clearMarks,
	};
})();
