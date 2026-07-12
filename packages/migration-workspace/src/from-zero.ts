export type WorkshopTrack = "strategy" | "platform" | "operations" | "controls";

export interface FromZeroInput {
  weeks: number;
  tracks: WorkshopTrack[];
  teamSize: number;
}

export interface WorkshopPlan {
  week: number;
  objective: string;
  track: WorkshopTrack;
  ownerCount: number;
}

export function buildFromZeroWorkshop(input: FromZeroInput): WorkshopPlan[] {
  const plans: WorkshopPlan[] = [];
  const perTrackOwners = Math.max(1, Math.floor(input.teamSize / input.tracks.length));
  for (let week = 1; week <= input.weeks; week++) {
    const track = input.tracks[(week - 1) % input.tracks.length];
    plans.push({
      week,
      track,
      ownerCount: perTrackOwners,
      objective:
        week === 1
          ? `Define baseline for ${track}`
          : week === input.weeks
            ? `Operationalize ${track}`
            : `Prototype and validate ${track}`,
    });
  }
  return plans;
}
