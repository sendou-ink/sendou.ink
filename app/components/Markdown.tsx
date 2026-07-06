import MarkdownToJsx from "markdown-to-jsx";
import * as React from "react";

export function Markdown({ children }: { children: string }) {
	return (
		<MarkdownToJsx
			options={{
				wrapper: React.Fragment,
				overrides: {
					br: { component: () => <br /> },
					hr: { component: () => <hr /> },
					img: {
						component: ({
							children: _,
							...props
						}: React.ComponentProps<"img"> & {
							children?: React.ReactNode;
						}) => (
							// biome-ignore lint/a11y/useAltText: parsed markdown, so we can't guarantee alt text is present
							<img {...props} referrerPolicy="no-referrer" />
						),
					},
				},
			}}
		>
			{children}
		</MarkdownToJsx>
	);
}
