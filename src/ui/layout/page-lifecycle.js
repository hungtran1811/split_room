const disposers = new Set();
let hashListener = null;

export function mountPage({ dispose, onRouteLeave } = {}) {
  if (typeof dispose === "function") {
    disposers.add(dispose);
  }

  if (typeof onRouteLeave === "function") {
    if (hashListener) {
      window.removeEventListener("hashchange", hashListener);
    }

    hashListener = () => {
      onRouteLeave(location.hash || "#/dashboard");
    };
    window.addEventListener("hashchange", hashListener);
  }

  return () => {
    if (typeof dispose === "function") {
      dispose();
      disposers.delete(dispose);
    }
    if (hashListener) {
      window.removeEventListener("hashchange", hashListener);
      hashListener = null;
    }
  };
}

