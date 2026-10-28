import MagicString from "magic-string";
import type { Node, Plugin as PostcssPlugin, Rule } from "postcss";
import type { Plugin } from "vite";

const HOVER_MEDIA_PARAMS = "(hover: hover)";

/**
 * Wraps CSS modules in a @layer so utilities always win and the higher of two modules
 * styling the same element wins regardless of chunk order: `elements` < `components`
 * < `features`. The layer order is prepended to each module because in Vite dev module
 * <style> tags are injected before global stylesheets.
 */
export function cssModulesLayer(): Plugin {
	return {
		name: "css-modules-layer",
		enforce: "pre",
		transform(code, id) {
			if (!id.endsWith(".module.css")) return;
			const layerOrder =
				"@layer reset, base, elements, components, features, utilities;";
			const layer = cssModuleLayer(id);
			const magicCode = new MagicString(code);
			magicCode.prepend(`${layerOrder}\n@layer ${layer} {\n`);
			magicCode.append("\n}");

			return {
				code: magicCode.toString(),
				map: magicCode.generateMap({ source: id, hires: true }),
			};
		},
	};
}

/**
 * Wraps every `:hover` rule in `@media (hover: hover)` so touch devices don't get
 * hover styles stuck on whatever element was last tapped or scrolled over.
 */
export function hoverOnlyOnHoverDevices(): PostcssPlugin {
	return {
		postcssPlugin: "hover-only-on-hover-devices",
		Rule(rule, { AtRule }) {
			if (!rule.selector.includes(":hover")) return;
			if (isInsideHoverMedia(rule)) return;

			const hoverSelectors = rule.selectors.filter((selector) =>
				selector.includes(":hover"),
			);
			const otherSelectors = rule.selectors.filter(
				(selector) => !selector.includes(":hover"),
			);
			const media = new AtRule({ name: "media", params: HOVER_MEDIA_PARAMS });

			if (otherSelectors.length === 0) {
				rule.replaceWith(media);
				media.append(rule);
				return;
			}

			media.append(rule.clone({ selectors: hoverSelectors }));
			rule.selectors = otherSelectors;
			rule.after(media);
		},
	};
}

function cssModuleLayer(id: string) {
	if (id.includes("/app/components/elements/")) return "elements";
	if (/\/app\/components\/[^/]+\.module\.css$/.test(id)) return "components";

	return "features";
}

function isInsideHoverMedia(rule: Rule) {
	for (let node: Node | undefined = rule.parent; node; node = node.parent) {
		if (
			node.type === "atrule" &&
			"params" in node &&
			node.params === HOVER_MEDIA_PARAMS
		) {
			return true;
		}
	}

	return false;
}
