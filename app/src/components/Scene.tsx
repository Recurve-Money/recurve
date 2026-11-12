import {useEffect, useRef, useState} from "react";
import {variantFor} from "../lib/scene";

/** The clip plays at a third of its own speed: behind numbers it should drift, not move. */
const PLAYBACK_RATE = 1 / 3;

/**
 * The scene behind the dashboard: a muted, looping, slightly blurred clip of
 * two hands reaching for each other, with a dark veil over it so the frosted
 * cards in front stay readable. The poster is the clip's own first frame and
 * shows until the video has decoded one of its own — and is all that shows
 * for anyone who asked their OS for less motion, or their browser for less
 * data.
 */
export function Scene() {
  const [variant] = useState(() => variantFor(window.innerWidth));
  const still = usePrefersReducedMotion() || prefersReducedData();
  const video = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const el = video.current;
    if (!el) return;
    if (still) {
      el.pause();
      return;
    }
    // React sets `muted` as a property; some autoplay policies only look at
    // it once play() is called, so call it. A rejection (Low Power Mode, a
    // data saver) leaves the poster up, which is the designed fallback.
    el.muted = true;
    // Both: a media element falls back to the default rate each time it loads.
    el.defaultPlaybackRate = PLAYBACK_RATE;
    el.playbackRate = PLAYBACK_RATE;
    el.play().catch(() => {});
  }, [still]);

  return (
    <div className="scene" aria-hidden="true">
      <video
        ref={video}
        className="scene-video"
        poster={variant.poster}
        width={variant.width}
        height={variant.height}
        autoPlay={!still}
        muted
        loop
        playsInline
        preload={still ? "none" : "auto"}
        disablePictureInPicture
        disableRemotePlayback
      >
        <source src={variant.webm} type="video/webm" />
        <source src={variant.mp4} type="video/mp4" />
      </video>
      <div className="scene-veil" />
    </div>
  );
}

/** Chrome's Data Saver / Android's "Lite mode". A background loop is the first thing to drop. */
function prefersReducedData(): boolean {
  const c = (navigator as Navigator & {connection?: {saveData?: boolean}}).connection;
  return c?.saveData === true;
}

function usePrefersReducedMotion(): boolean {
  const query = "(prefers-reduced-motion: reduce)";
  const [reduced, setReduced] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = () => setReduced(mql.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);
  return reduced;
}
