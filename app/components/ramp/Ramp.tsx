// @ts-nocheck

//
// From: https://github.com/intergi/pw-react-component
//

import React from "react";
import { logger } from "../../utils/logger";

const oopUnits = [
	"trendi_slideshow",
	"trendi_video",
	"site_skin",
	"flex_leaderboard",
	"top_rail",
	"right_rail",
	"bottom_rail",
	"left_rail",
];

// destroy the units when componenent unmounts
const cleanUp = (parentId) =>
	new Promise((resolve, reject) => {
		// possible that component was removed before first ad was created
		if (!window.ramp.settings || !window.ramp.settings.slots) return;

		window.ramp.forcePath = undefined;

		const slotsToRemove = [];
		for (const [slotName, slot] of Object.entries(window.ramp.settings.slots)) {
			if (oopUnits.includes(slot.type) || slot.videoType === "Bolt Player") {
				slotsToRemove.push(slotName);
			}
		}

		if (slotsToRemove.length > 0) {
			window.ramp.destroyUnits(slotsToRemove).finally(() => resolve());
		}
	});

export default class Ramp extends React.Component {
	constructor(props) {
		super(props);

		if (!props || !props.publisherId || !props.id) {
			console.error("publisherId and id are required props.");
			return;
		}
		this.init(props);
	}

	init({ publisherId, id, forcePath }) {
		if (forcePath) window.ramp.forcePath = forcePath;

		// make sure we only do this once per "app" load
		if (!window._pwRampComponentLoaded) {
			window._pwRampComponentLoaded = true;

			window.ramp.config = `https://config.playwire.com/${publisherId}/v2/websites/${id}/banner.json`;
			const configScript = document.createElement("script");
			// configScript.src = `https://cdn.intergient.com/${publisherId}/${id}/ramp.js`;
			configScript.src = "https://cdn.intergient.com/ramp_core.js";
			document.head.appendChild(configScript);
		}

		this.displayTaglessUnits();
	}

	displayTaglessUnits() {
		logger.info("Displaying tagless units");

		window.ramp.que.push(() => {
			window.ramp
				.addUnits([
					{ type: "trendi_slideshow" },
					{ type: "trendi_video" },
					{ type: "site_skin" },
					{ type: "flex_leaderboard" },
					{ type: "top_rail" },
					{ type: "right_rail" },
					{ type: "bottom_rail" },
					{ type: "left_rail" },
					// {type: 'behind_page'},
					// {type: 'in_image'},
					// {type: 'above_page'},
					// {type: 'in_content'},
					// {type: 'inimg'},
					// {type: 'skin'}
				])
				.finally(() => {
					window.ramp.displayUnits();
				});
		});
	}

	componentDidUpdate(prevProps) {
		if (this.props.forcePath && prevProps.forcePath !== this.props.forcePath) {
			window.ramp.forcePath = this.props.forcePath;
			window.ramp.que.push(() => {
				window.ramp
					.setPath(this.props.forcePath)
					.then(() => {
						return cleanUp();
					})
					.then(() => {
						this.displayTaglessUnits();
					});
			});
		}
	}

	componentWillUnmount() {
		window.ramp.que.push(() => {
			if (!this.unitToAdd) return;
			cleanUp(this.unitToAdd.selectorId);
		});
	}

	render() {
		return null;
	}
}
