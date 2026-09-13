import { describe, expect, it } from "vitest";
import { frequencyColor, FREQUENCY_GRADIENT_CSS } from "./colors";

describe("frequencyColor", () => {
  it("returns the first stop's color when maxCount is 1", () => {
    expect(frequencyColor(1, 1)).toBe("rgb(122, 222, 140)");
  });

  it("returns the last stop's color for the max count", () => {
    expect(frequencyColor(10, 10)).toBe("rgb(203, 70, 69)");
  });

  it("interpolates logarithmically between stops", () => {
    // log(3)/log(10) ~= 0.477, scaled over 3 segments ~= 1.43 -> between stops 1 and 2.
    expect(frequencyColor(3, 10)).toBe("rgb(223, 158, 26)");
  });

  it("clamps below the first stop", () => {
    expect(frequencyColor(0, 10)).toBe(frequencyColor(1, 10));
  });
});

describe("FREQUENCY_GRADIENT_CSS", () => {
  it("is a linear-gradient built from the same stops", () => {
    expect(FREQUENCY_GRADIENT_CSS).toBe(
      "linear-gradient(to right, rgb(122, 222, 140), rgb(216, 181, 15), rgb(232, 127, 41), rgb(203, 70, 69))",
    );
  });
});
