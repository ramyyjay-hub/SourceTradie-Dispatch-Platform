import { describe, expect, it } from "vitest";
import { getCustomerLifecyclePresentation } from "./customer-lifecycle";

describe("customer lifecycle presentation", () => {
  it("shows confirmed messaging without review or queue copy when accepted", () => {
    const accepted = getCustomerLifecyclePresentation("accepted");
    const renderedCopy = [
      accepted.title,
      accepted.assessmentLabel,
      accepted.assessmentMessage,
      ...accepted.stages,
    ].join(" ");

    expect(accepted.activeStage).toBe(3);
    expect(accepted.title).toBe("Tradie confirmed");
    expect(renderedCopy).not.toMatch(/review|queue/i);
  });

  it.each([
    ["new", 1, "Request is being reviewed"],
    ["reviewing", 1, "Request is being reviewed"],
    ["awaiting_dispatch", 2, "Finding the right local tradie"],
    ["dispatching", 2, "A local tradie is considering your request"],
    ["accepted", 3, "Tradie confirmed"],
    ["in_progress", 3, "Work is in progress"],
    ["completed", 3, "Request completed"],
    ["cancelled", 1, "Request cancelled"],
  ])("maps %s to its canonical lifecycle presentation", (status, stage, title) => {
    const presentation = getCustomerLifecyclePresentation(status as string);
    expect(presentation.activeStage).toBe(stage);
    expect(presentation.title).toBe(title);
  });
});
