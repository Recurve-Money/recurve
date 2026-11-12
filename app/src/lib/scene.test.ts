import {describe, expect, it} from "vitest";
import {variantFor} from "./scene";

const bg = `${import.meta.env.BASE_URL}bg`;

describe("variantFor", () => {
  it("gives phones the portrait crop", () => {
    expect(variantFor(390)).toMatchObject({
      poster: `${bg}/artistic-hands-720p.jpg`,
      webm: `${bg}/artistic-hands-720p.webm`,
      mp4: `${bg}/artistic-hands-720p.mp4`,
    });
  });

  it("switches to landscape above 720 css pixels", () => {
    expect(variantFor(721).mp4).toBe(`${bg}/artistic-hands-1280.mp4`);
    expect(variantFor(720).mp4).toBe(`${bg}/artistic-hands-720p.mp4`);
  });

  it("gives every wider screen the 1280 encode: blurred, that is as far as any display can tell apart", () => {
    expect(variantFor(1280).mp4).toBe(`${bg}/artistic-hands-1280.mp4`);
    expect(variantFor(1920).mp4).toBe(`${bg}/artistic-hands-1280.mp4`);
    expect(variantFor(3840).mp4).toBe(`${bg}/artistic-hands-1280.mp4`);
  });

  it("keeps poster and video from the same variant so the first frame matches the still", () => {
    for (const w of [320, 800, 2560]) {
      const v = variantFor(w);
      const stem = v.poster.replace(/\.jpg$/, "");
      expect(v.webm).toBe(`${stem}.webm`);
      expect(v.mp4).toBe(`${stem}.mp4`);
    }
  });
});
