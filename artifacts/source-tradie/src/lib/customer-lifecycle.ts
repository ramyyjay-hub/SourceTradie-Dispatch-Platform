export type CustomerJobStatus =
  | "new"
  | "reviewing"
  | "awaiting_dispatch"
  | "dispatching"
  | "accepted"
  | "in_progress"
  | "completed"
  | "cancelled";

export type CustomerLifecyclePresentation = {
  activeStage: number;
  title: string;
  assessmentLabel: string;
  assessmentMessage: string;
  stages: [string, string, string, string];
};

const presentations: Record<
  CustomerJobStatus,
  Omit<CustomerLifecyclePresentation, "stages">
> = {
  new: {
    activeStage: 1,
    title: "Request is being reviewed",
    assessmentLabel: "Safety and review",
    assessmentMessage: "Your request is queued for review.",
  },
  reviewing: {
    activeStage: 1,
    title: "Request is being reviewed",
    assessmentLabel: "Safety and review",
    assessmentMessage: "Your request is being reviewed.",
  },
  awaiting_dispatch: {
    activeStage: 2,
    title: "Finding the right local tradie",
    assessmentLabel: "Safety and request details",
    assessmentMessage:
      "Your request details are confirmed and local sourcing is underway.",
  },
  dispatching: {
    activeStage: 2,
    title: "A local tradie is considering your request",
    assessmentLabel: "Safety and request details",
    assessmentMessage:
      "Your request details are confirmed and an offer has been sent.",
  },
  accepted: {
    activeStage: 3,
    title: "Tradie confirmed",
    assessmentLabel: "Safety and request details",
    assessmentMessage: "A local tradie has accepted your request.",
  },
  in_progress: {
    activeStage: 3,
    title: "Work is in progress",
    assessmentLabel: "Safety and request details",
    assessmentMessage: "Your confirmed tradie is handling your request.",
  },
  completed: {
    activeStage: 3,
    title: "Request completed",
    assessmentLabel: "Safety and request details",
    assessmentMessage: "This request has been completed.",
  },
  cancelled: {
    activeStage: 1,
    title: "Request cancelled",
    assessmentLabel: "Safety and request details",
    assessmentMessage: "This request is no longer active.",
  },
};

export function getCustomerLifecyclePresentation(
  status: string,
): CustomerLifecyclePresentation {
  const presentation =
    presentations[status as CustomerJobStatus] ?? presentations.reviewing;

  return {
    ...presentation,
    stages: [
      "Request received",
      presentation.activeStage <= 1
        ? "Details being reviewed"
        : "Details confirmed",
      "Local sourcing",
      "Tradie confirmed",
    ],
  };
}
