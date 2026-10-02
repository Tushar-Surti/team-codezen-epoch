"use client";

import { useEffect, useRef } from "react";

import { api } from "@/lib/api";
import { useWorkspace } from "@/lib/workspace-store";

/** The uploaded rough cut, kept in sync with the playhead both ways. */
export function RoughCutPlayer({ analysisId }: { analysisId: string }) {
  const video = useRef<HTMLVideoElement>(null);
  const fromVideo = useRef(false);
  const { playhead, setPlayhead } = useWorkspace();

  // Playhead moved elsewhere (curve, lanes, flags, script) → seek the video.
  useEffect(() => {
    const v = video.current;
    if (!v) return;
    if (fromVideo.current) {
      fromVideo.current = false;
      return;
    }
    if (Math.abs(v.currentTime - playhead) > 0.75) v.currentTime = playhead;
  }, [playhead]);

  return (
    <video
      ref={video}
      src={api.mediaUrl(analysisId)}
      controls
      playsInline
      preload="metadata"
      onTimeUpdate={(e) => {
        fromVideo.current = true;
        setPlayhead(e.currentTarget.currentTime);
      }}
      className="aspect-video w-full rounded-[6px] bg-ink"
    />
  );
}
