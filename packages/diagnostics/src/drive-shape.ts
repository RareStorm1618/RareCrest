export type DriveProfile = "mission_locked" | "traction_seeking" | "scale_optimized";

export interface DriveShapeInput {
  urgency: number;
  operationalDiscipline: number;
  learningVelocity: number;
  missionCriticality: number;
}

export interface DriveShapeResult {
  profile: DriveProfile;
  score: number;
  strengths: string[];
  risks: string[];
}

function clamp1to10(value: number): number {
  return Math.max(1, Math.min(10, Math.round(value)));
}

function validateScore(name: string, value: number): void {
  if (!Number.isFinite(value) || value < 1 || value > 10) {
    throw new Error(`${name} must be a number between 1 and 10`);
  }
}

export function computeDriveShape(input: DriveShapeInput): DriveShapeResult {
  validateScore("urgency", input.urgency);
  validateScore("operationalDiscipline", input.operationalDiscipline);
  validateScore("learningVelocity", input.learningVelocity);
  validateScore("missionCriticality", input.missionCriticality);

  const weighted =
    input.urgency * 0.3 +
    input.operationalDiscipline * 0.3 +
    input.learningVelocity * 0.2 +
    input.missionCriticality * 0.2;
  const score = clamp1to10(weighted);

  if (score <= 4) {
    return {
      profile: "traction_seeking",
      score,
      strengths: ["High urgency to change", "Early appetite for experimentation"],
      risks: ["Execution inconsistency", "Low repeatability across teams"],
    };
  }
  if (score <= 7) {
    return {
      profile: "mission_locked",
      score,
      strengths: ["Operational baseline in place", "Leadership urgency remains visible"],
      risks: ["Inconsistent learning loops", "Change can stall without explicit sponsorship"],
    };
  }
  return {
    profile: "scale_optimized",
    score,
    strengths: ["Strong execution discipline", "Fast organizational learning"],
    risks: ["Risk of local optimization over portfolio-level leverage"],
  };
}
