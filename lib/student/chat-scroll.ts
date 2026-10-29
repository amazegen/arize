/** Keep following replies only while the reader remains near the newest turn. */
export function isNearChatEnd(distance: number, threshold = 96) {
  return Number.isFinite(distance) && distance <= threshold;
}

export function chatFollowAction(force: boolean, nearLatest: boolean) {
  return force || nearLatest ? "follow" : "preserve";
}

export function chatViewportBottom(viewportHeight: number, composerHeight: number, bottomInset: number) {
  return Math.max(0, viewportHeight - composerHeight - bottomInset - 16);
}
