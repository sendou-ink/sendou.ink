import * as React from "react";
import { IS_E2E_TEST_RUN } from "~/utils/e2e";
import * as Flip from "~/utils/flip";

interface FlipperProps {
	/** Changes whenever the layout inside might have changed; compared with `Object.is`. */
	flipKey: unknown;
	className?: string;
	fadeDuration?: Flip.PlayOptions["fadeDuration"];
	children: React.ReactNode;
}

/** Animates children carrying `data-flip-id` between layouts whenever `flipKey` changes. */
export class Flipper extends React.Component<FlipperProps> {
	private readonly root = React.createRef<HTMLDivElement>();

	getSnapshotBeforeUpdate(prevProps: FlipperProps) {
		if (IS_E2E_TEST_RUN) return null;
		if (Object.is(prevProps.flipKey, this.props.flipKey)) return null;
		if (!this.root.current) return null;

		return Flip.snapshot(this.root.current);
	}

	componentDidUpdate(
		_prevProps: FlipperProps,
		_prevState: unknown,
		snapshot: Flip.Snapshot | null,
	) {
		if (!snapshot || !this.root.current) return;

		Flip.play(this.root.current, snapshot, {
			fadeDuration: this.props.fadeDuration,
		});
	}

	render() {
		return (
			<div ref={this.root} className={this.props.className}>
				{this.props.children}
			</div>
		);
	}
}
