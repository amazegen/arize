"use client";

import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { chatFollowAction, chatViewportBottom, isNearChatEnd } from "@/lib/student/chat-scroll";

/** Supports the lab's nested scroll panel and the student's page-level chat. */
export default function useChatScroll(revision: string, mode: "panel" | "page", active = true) {
  const threadRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLFormElement>(null);
  const nearLatest = useRef(true);
  const forceNext = useRef(false);
  const previousRevision = useRef(revision);
  const [hasNewMessage, setHasNewMessage] = useState(false);

  const viewportBottom = useCallback(() => {
    const composer = composerRef.current;
    return chatViewportBottom(window.innerHeight, composer?.getBoundingClientRect().height ?? 0,
      composer ? Math.max(0, parseFloat(getComputedStyle(composer).bottom) || 0) : 0);
  }, []);

  const jumpToLatest = useCallback(() => {
    const thread = threadRef.current;
    if (!thread) return;
    if (mode === "panel") thread.scrollTop = thread.scrollHeight;
    else {
      const distance = thread.getBoundingClientRect().bottom - viewportBottom();
      if (distance > 0) window.scrollBy({ top: distance, behavior: "instant" });
    }
    nearLatest.current = true;
    setHasNewMessage(false);
  }, [mode, viewportBottom]);

  useLayoutEffect(() => {
    const thread = threadRef.current;
    if (!active || !thread) return;
    const update = () => {
      const distance = mode === "panel"
        ? thread.scrollHeight - thread.scrollTop - thread.clientHeight
        : thread.getBoundingClientRect().bottom - viewportBottom();
      nearLatest.current = isNearChatEnd(distance);
      if (nearLatest.current) setHasNewMessage(false);
    };
    const target = mode === "panel" ? thread : window;
    target.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update, { passive: true });
    update();
    return () => {
      target.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [active, mode, viewportBottom]);

  useLayoutEffect(() => {
    if (previousRevision.current === revision) return;
    previousRevision.current = revision;
    if (!active || !threadRef.current) return;
    if (chatFollowAction(forceNext.current, nearLatest.current) === "follow") jumpToLatest();
    else setHasNewMessage(true);
    forceNext.current = false;
  }, [active, revision, jumpToLatest]);

  // A user's explicit Send resumes following; scrolling up while awaiting a reply pauses it.
  const followNextMessage = () => { forceNext.current = true; };
  return { threadRef, composerRef, followNextMessage, jumpToLatest, hasNewMessage };
}
