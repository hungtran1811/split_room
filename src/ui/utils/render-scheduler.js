export function createRenderScheduler(renderFn) {
  let queued = false;
  let disposed = false;

  const schedule = () => {
    if (queued || disposed) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      if (!disposed) renderFn();
    });
  };

  const dispose = () => {
    disposed = true;
    queued = false;
  };

  return { schedule, dispose };
}
