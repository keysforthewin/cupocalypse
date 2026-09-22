import { Component, type ReactNode } from "react";
export class RenderBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <div className="renderer-error" role="alert">
        <h2>3D renderer unavailable</h2>
        <p>
          The Last Fruit: Cupocalypse needs WebGL 2. Enable hardware acceleration in your
          browser, then reload.
        </p>
        <button onClick={() => location.reload()}>RELOAD →</button>
      </div>
    ) : (
      this.props.children
    );
  }
}
