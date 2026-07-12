export interface DriveShapeVector {
  clarity: number;
  speed: number;
  resilience: number;
  leverage: number;
}

export interface DriveShapeScorecard {
  score: number;
  profile: "stabilize" | "compound" | "accelerate";
  notes: string[];
}

function validateAxis(name: string, value: number): void {
  if (!Number.isFinite(value) || value < 1 || value > 10) {
    throw new Error(`${name} must be between 1 and 10`);
  }
}

export function scoreDriveShape(vector: DriveShapeVector): DriveShapeScorecard {
  validateAxis("clarity", vector.clarity);
  validateAxis("speed", vector.speed);
  validateAxis("resilience", vector.resilience);
  validateAxis("leverage", vector.leverage);

  const score = Math.round(
    vector.clarity * 0.3 + vector.speed * 0.25 + vector.resilience * 0.25 + vector.leverage * 0.2,
  );

  if (score <= 4) {
    return {
      score,
      profile: "stabilize",
      notes: ["Clarify mission constraints", "Establish weekly execution cadence"],
    };
  }
  if (score <= 7) {
    return {
      score,
      profile: "compound",
      notes: ["Scale repeatable playbooks", "Instrument agent-assisted loops"],
    };
  }
  return {
    score,
    profile: "accelerate",
    notes: ["Expand delegation boundaries", "Increase autonomous decision throughput"],
  };
}
