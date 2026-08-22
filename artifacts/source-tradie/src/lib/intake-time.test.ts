import { describe, expect, it } from "vitest";
import { extractExplicitPreferredTime } from "./intake-time";

describe("extractExplicitPreferredTime", () => {
  it("keeps an explicit narrative afternoon preference out of the Flexible default", () => {
    expect(
      extractExplicitPreferredTime(
        "My hot water system stopped working this morning. I'm in Wollert and would like someone this afternoon if possible.",
      ),
    ).toBe("This afternoon");
  });
});
