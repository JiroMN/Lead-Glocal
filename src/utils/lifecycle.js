// Page-level cleanup registry.
// Modules that start loops, observers or GPU resources register a teardown
// here; index.js runs them all in Barba's afterLeave so nothing outlives the
// page it belongs to.
const cleanups = [];

export function registerCleanup(fn) {
  if (typeof fn === "function") cleanups.push(fn);
}

export function runCleanups() {
  while (cleanups.length) {
    const fn = cleanups.pop();
    try {
      fn();
    } catch (err) {
      console.error("Cleanup failed:", err);
    }
  }
}
