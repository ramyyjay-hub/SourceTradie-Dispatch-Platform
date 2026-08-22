import { describe, expect, it } from "vitest";
import { classifySafety } from "../lib/safety-classifier";

describe("classifySafety", () => {
  it("does not interrupt a normal hot-water failure narrative", () => {
    expect(
      classifySafety(
        "My hot water system stopped working this morning. I'm in Wollert and would like someone this afternoon if possible.",
      ),
    ).toMatchObject({
      level: "standard",
      interruptFlow: false,
      codes: [],
    });
  });

  it.each([
    ["a real gas leak", "GAS_SMELL"],
    ["there is smoke in the switchboard", "SMOKE_OR_FIRE"],
    ["flames are coming from the appliance", "SMOKE_OR_FIRE"],
    ["the outlet is sparking", "SPARKS"],
    ["exposed live wiring in the wall", "EXPOSED_LIVE_WIRING"],
    ["there is electrical danger near the meter", "ELECTRICAL_FIRE"],
    ["uncontrolled flooding through the house", "MAJOR_FLOODING"],
    ["there is immediate danger here", "IMMEDIATE_DANGER"],
  ])("keeps %s as an emergency", (description, code) => {
    expect(classifySafety(description)).toMatchObject({
      level: "emergency",
      interruptFlow: true,
      codes: expect.arrayContaining([code]),
    });
  });
});
