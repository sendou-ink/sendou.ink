import { useState } from "react";
import type { Tables } from "~/db/tables";
import { USER } from "../user-page-constants";

// xxx: can we somehow have the value be only widgets that have settings?
// xxx: can we use existing TextareaFormField?

export function WidgetSettingsForm({
	widget,
	onSettingsChange,
}: {
	widget: Tables["UserWidget"]["widget"];
	onSettingsChange: (widgetId: string, settings: any) => void;
}) {
	switch (widget.id) {
		case "bio":
			return (
				<BioWidgetSettings
					widget={widget}
					onSettingsChange={onSettingsChange}
				/>
			);
		default:
			return null;
	}
}

function BioWidgetSettings({
	widget,
	onSettingsChange,
}: {
	widget: Extract<Tables["UserWidget"]["widget"], { id: "bio" }>;
	onSettingsChange: (widgetId: string, settings: any) => void;
}) {
	const [bio, setBio] = useState(widget.settings?.bio ?? "");

	const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
		const newBio = e.target.value;
		setBio(newBio);
		onSettingsChange(widget.id, { bio: newBio });
	};

	return (
		<div>
			<label htmlFor="bio-widget-textarea">
				Bio ({bio.length}/{USER.BIO_MAX_LENGTH})
			</label>
			<textarea
				id="bio-widget-textarea"
				value={bio}
				onChange={handleChange}
				maxLength={USER.BIO_MAX_LENGTH}
				rows={4}
				style={{ width: "100%" }}
			/>
		</div>
	);
}
