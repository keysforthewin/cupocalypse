/** Deterministic capture only: preserve the shipping renderer and shaders, but
 * stop automatic redraws while QA advances the frozen simulation explicitly. */
export async function manualRendering(page) {
  await page.evaluate(() => {
    const store = window.__sceneReview.scene.__r3f.root;
    if (window.__manualReviewStore === store) return;
    const original = store.getState().setFrameloop;
    store.setState({setFrameloop: () => original('never')});
    original('never');
    window.__manualReviewStore = store;
  });
}
export async function renderReview(page) {
  await page.evaluate(async () => {
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const state = window.__sceneReview.scene.__r3f.root.getState();
    state.advance(window.__gateRunner.sim.time, true);
    state.advance(window.__gateRunner.sim.time, true);
  });
}
