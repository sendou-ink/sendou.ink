import type * as React from "react";
import { RemoveFieldButton } from "./RemoveFieldButton";

export function FormFieldset({
	title,
	children,
	onRemove,
}: { title: string; children: React.ReactNode; onRemove: () => void }) {
	return (
		<fieldset className="w-min">
			<legend>{title}</legend>
			<div className="stack sm">
				{children}

				<div className="mt-4 stack items-center">
					<RemoveFieldButton onClick={onRemove} />
				</div>
			</div>
		</fieldset>
	);
}
