import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type * as React from "react";

export function Draggable({
	id,
	disabled,
	liClassName,
	children,
	testId,
}: {
	id: number;
	disabled: boolean;
	liClassName: string;
	children: React.ReactNode;
	testId?: string;
}) {
	const { attributes, listeners, setNodeRef, transform, transition } =
		useSortable({ id, disabled });

	const style = {
		transform: CSS.Transform.toString(transform),
		transition,
	};

	return (
		<li
			className={liClassName}
			style={style}
			ref={setNodeRef}
			data-testid={testId}
			{...listeners}
			{...attributes}
		>
			{children}
		</li>
	);
}
