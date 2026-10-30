// Form requests are bounded; never silently retry a write whose outcome is unknown.
export async function studentFetch(input: RequestInfo | URL, init: RequestInit = {}) {
  try {
    return await fetch(input, { ...init, cache: "no-store", signal: init.signal ? AbortSignal.any([init.signal, AbortSignal.timeout(15000)]) : AbortSignal.timeout(15000) });
  } catch (reason) {
    if (reason instanceof Error && ["AbortError", "TimeoutError", "TypeError"].includes(reason.name))
      throw new Error("The connection could not confirm this request. Refresh to check whether your change was saved before submitting again.");
    throw reason;
  }
}
