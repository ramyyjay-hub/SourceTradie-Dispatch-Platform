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

  it.each([
    "There is no flooding, electrical issue, gas smell, or immediate danger.",
    "I can't smell gas.",
    "There are no sparks.",
    "The pipe is leaking slowly but it is not flooding.",
    "Hot water stopped working. No other issues.",
    "Gas smell is not present.",
    "Sparks are not visible.",
  ])("does not escalate clearly negated hazards: %s", (description) => {
    expect(classifySafety(description)).toMatchObject({
      level: "standard",
      interruptFlow: false,
      codes: [],
    });
  });

  it.each([
    ["I can smell gas.", "GAS_SMELL"],
    ["There are sparks coming from the switchboard.", "SPARKS"],
    ["The house is flooding.", "MAJOR_FLOODING"],
    ["I can see exposed live wires.", "EXPOSED_LIVE_WIRING"],
    ["There was no gas smell earlier, but now I can smell gas.", "GAS_SMELL"],
    ["I'm not sure if I can smell gas.", "GAS_SMELL"],
    ["I can't smell gas, but there are sparks.", "SPARKS"],
    ["No flooding, gas smell reported near the meter.", "GAS_SMELL"],
  ])("escalates current or ambiguous hazards: %s", (description, code) => {
    expect(classifySafety(description)).toMatchObject({
      level: "emergency",
      interruptFlow: true,
      codes: expect.arrayContaining([code]),
    });
  });
});
