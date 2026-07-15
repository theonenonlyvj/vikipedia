import { describe, expect, it } from "vitest";
import { compressPathForStrip } from "./pathCompression";

describe("path strip compression", () => {
  it("shows the full path when short", () => {
    expect(compressPathForStrip(["Moon", "Gravity"], "Gravity")).toEqual([
      "Moon",
      "Gravity",
    ]);
  });

  it("compresses long paths to ellipsis, latest previous 3 pages, and target", () => {
    expect(
      compressPathForStrip(
        ["Moon", "Astronomy", "Orbit", "Mass", "Force"],
        "Gravity",
      ),
    ).toEqual(["...", "Orbit", "Mass", "Force", "Gravity"]);
  });

  it("does not duplicate the target when it is already current", () => {
    expect(
      compressPathForStrip(
        ["Moon", "Astronomy", "Orbit", "Mass", "Gravity"],
        "Gravity",
      ),
    ).toEqual(["...", "Astronomy", "Orbit", "Mass", "Gravity"]);
  });
});
