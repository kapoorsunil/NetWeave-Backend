export const TEAM_LEVELS = 20

export function createEmptyDownlineLevels() {
  return Array.from({ length: TEAM_LEVELS }, (_, index) => ({
    level: index + 1,
    members: [],
  }))
}
