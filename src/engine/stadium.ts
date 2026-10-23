import { StadiumField, Team } from './types';

export const BASE_FIELD_1V1: StadiumField = {
  width: 1120,
  height: 620,
  goal: 220,
  depth: 48,
  corner: 60
};

export function getStadiumField(teamSize: number): StadiumField {
  if (teamSize <= 1) return { ...BASE_FIELD_1V1 };
  if (teamSize === 2) {
    return { width: 1300, height: 730, goal: 240, depth: 48, corner: 60 };
  }
  if (teamSize === 3) {
    return { width: 1500, height: 840, goal: 260, depth: 48, corner: 60 };
  }
  if (teamSize === 4) {
    return { width: 1680, height: 940, goal: 290, depth: 48, corner: 60 };
  }
  // 5v5
  return { width: 1840, height: 1040, goal: 290, depth: 48, corner: 60 };
}

/**
 * Standard spawn X coordinate based on player index and team
 */
function getSpawnX(side: Team, slot: number, teamSize: number, field: StadiumField): number {
  const pairIndex = Math.floor(slot / 2);
  const direction = side === 0 ? -1 : 1;
  if (teamSize === 1) return direction * 290;
  if (pairIndex === 0) return direction * 180;
  if (pairIndex === 1) return direction * (field.width / 2 - 170);
  return direction * field.width * (pairIndex === 4 ? 0.34 : 0.24);
}

/**
 * Standard spawn Y coordinate based on player index
 */
function getSpawnY(slot: number, teamSize: number, field: StadiumField): number {
  const pairIndex = Math.floor(slot / 2);
  if (teamSize === 1 || pairIndex < 2 || pairIndex === 4) return 0;
  const sign = pairIndex % 2 ? 1 : -1;
  return sign * field.height * (pairIndex === 4 ? 0.36 : 0.25);
}

export function getPlayerSpawn(side: Team, slot: number, teamSize: number, field: StadiumField) {
  return {
    x: getSpawnX(side, slot, teamSize, field),
    y: getSpawnY(slot, teamSize, field)
  };
}
