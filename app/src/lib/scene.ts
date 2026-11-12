/**
 * The background scene: GetLayers' "Artistic Hands" loop, re-encoded from the
 * 4K master into the two sizes a blurred, cover-fitted backdrop actually
 * needs. The blur is baked into the encode (it compresses to a third of the
 * size and costs the GPU nothing per frame), so 1280 wide is already more
 * than any screen can tell apart. Each variant is a VP9 WebM, an H.264 MP4
 * and a poster taken from the clip's own first frame, so playback starts on
 * the exact image the poster showed. Files live in public/bg/.
 */

export interface SceneVariant {
  poster: string;
  webm: string;
  mp4: string;
  /** Intrinsic size, so the browser can reserve the aspect before metadata loads. */
  width: number;
  height: number;
}

function variant(stem: string, width: number, height: number): SceneVariant {
  const base = `${import.meta.env.BASE_URL}bg/${stem}`;
  return {poster: `${base}.jpg`, webm: `${base}.webm`, mp4: `${base}.mp4`, width, height};
}

/** Phones get a 3:4 crop of the centre of the frame; everything else the full frame. */
const PORTRAIT = variant("artistic-hands-720p", 720, 960);
const LANDSCAPE = variant("artistic-hands-1280", 1280, 958);

/**
 * Which encode to load, by viewport width in CSS pixels. Chosen once at mount:
 * swapping sources on resize would restart the loop for no visible gain.
 */
export function variantFor(viewportWidth: number): SceneVariant {
  return viewportWidth <= 720 ? PORTRAIT : LANDSCAPE;
}
