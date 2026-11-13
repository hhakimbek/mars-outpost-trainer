import { C } from './constants'
import type { MissionState, ScoreBreakdown } from './types'

/**
 * Rewards a healthy margin and penalises BOTH starvation and hoarding.
 * Ending with a full tank means the systems were under-used and the crew was
 * denied greenhouse light or science for no reason — that is also a mistake,
 * so the curve falls away on each side of the ideal.
 */
export function bufferCurve(stock: number, capacity: number): number {
  if (capacity <= 0) return 0
  const fraction = Math.min(Math.max(stock / capacity, 0), 1)
  const ideal = 0.45
  const distance = Math.abs(fraction - ideal) / ideal
  return Math.min(Math.max(1 - distance * 0.85, 0), 1)
}

export const BADGE_INFO: Record<string, { name: string; detail: string }> = {
  powerManager: { name: 'Power Manager', detail: 'No brownouts across the whole mission' },
  waterWizard: { name: 'Water Wizard', detail: 'Finished with water still in reserve' },
  cleanAir: { name: 'Clean Air', detail: 'Cabin CO₂ never reached the alarm band' },
  warmHands: { name: 'Warm Hands', detail: 'The habitat never went cold' },
  mechanic: { name: 'Mechanic', detail: 'Fixed every fault that appeared' },
  botanist: { name: 'Botanist', detail: 'Harvested a crop at least once' },
  radSafety: { name: 'Radiation Safety Officer', detail: 'Highest crew dose kept under 10 mSv' },
  repairSpecialist: { name: 'Repair Specialist', detail: 'All faults repaired, nothing left leaking' },
  zeroWaste: { name: 'Zero Waste', detail: 'Never wasted surplus energy' },
  prepared: { name: 'Prepared', detail: 'Installed regolith shielding before the particle event' },
  efficient: { name: 'Efficient Commander', detail: 'Used over 90% of generated energy' },
}

export function evaluateBadges(s: MissionState): string[] {
  const badges: string[] = []
  if (s.brownoutSols === 0) badges.push('powerManager')
  if (s.stocks.water >= C.CAP_WATER * 0.3) badges.push('waterWizard')
  if (s.co2AlarmSols === 0) badges.push('cleanAir')
  if (s.coldSols === 0) badges.push('warmHands')
  if (s.faultsFixed > 0 && s.o2Leak <= 0 && !s.recyclerClogged && !s.arrayFault && !s.thermalFault) {
    badges.push('mechanic')
  }
  if (s.harvests > 0) badges.push('botanist')
  if (Math.max(...s.crew.map((c) => c.dose)) < 10) badges.push('radSafety')
  if (s.repairsDone >= 1 && s.o2Leak <= 0) badges.push('repairSpecialist')
  if (s.totalWasted <= 0.5) badges.push('zeroWaste')
  if (s.shieldInstalled) badges.push('prepared')
  if (s.totalGenerated > 0 && s.totalUsed / s.totalGenerated > 0.9) badges.push('efficient')
  return badges
}

export function computeScore(s: MissionState): ScoreBreakdown {
  const avgHealth = s.crew.reduce((t, m) => t + m.health, 0) / s.crew.length
  const allActive = s.crew.every((m) => m.health > C.HEALTH_ABORT)

  // Crew survival and health — 220
  // The flat survival award is deliberately smaller than it was. At 200 points
  // for simply not failing, a careless run scored nearly as well as a careful
  // one, which told the player their decisions did not matter.
  const crewSurvival = (allActive ? 120 : 0) + Math.min(Math.max(avgHealth, 0), 100)

  // Life support integrity — 200
  // Every sol the habitat was unfit to live in counts, not just the sols a
  // tank hit zero.
  const lifeSupport = Math.max(
    200 - 50 * s.depletedCount - 14 * s.brownoutSols - 18 * s.co2AlarmSols - 16 * s.coldSols,
    0)

  // Resource efficiency — 180
  const buffers =
    bufferCurve(s.stocks.o2, C.CAP_O2) +
    bufferCurve(s.stocks.water, C.CAP_WATER) +
    bufferCurve(s.stocks.food, C.CAP_FOOD)
  const utilisation = s.totalGenerated > 0
    ? Math.min(Math.max(s.totalUsed / s.totalGenerated, 0), 1)
    : 0
  const efficiency = Math.min((buffers / 3) * 110 + utilisation * 70, 180)

  // Radiation safety — 140
  const maxDose = Math.max(...s.crew.map((m) => m.dose))
  let radiation = 140 * (1 - Math.min(Math.max(maxDose / C.DOSE_BUDGET, 0), 1))
  if (s.shieldInstalled) radiation += 18
  radiation = Math.min(Math.max(radiation, 0), 140)

  // Decision quality — 140
  // Raised from 100 so that the seven mission decisions carry roughly the same
  // weight as keeping a tank topped up. This is a decision trainer.
  const decisions = Math.min(
    s.decisions.reduce(
      (t, d) => t + (d.quality === 'optimal' ? 20 : d.quality === 'acceptable' ? 11 : 0), 0),
    140)

  // Science returned — 60
  const science = Math.min(s.stocks.science * 0.55, 60)

  // Maintenance — 60
  // Faults fixed, wear kept down, and nothing left broken at the end.
  const outstanding =
    (s.o2Leak > 0 ? 1 : 0) + (s.recyclerClogged ? 1 : 0) +
    (s.arrayFault ? 1 : 0) + (s.thermalFault ? 1 : 0)
  const maintenance = Math.min(
    Math.max(s.faultsFixed * 14 + (1 - Math.min(s.wear, 1)) * 30 - outstanding * 15, 0),
    60)

  let total = crewSurvival + lifeSupport + efficiency + radiation + decisions + science + maintenance

  // An aborted mission still earns partial credit for the sols that were
  // commanded well. Zeroing it would teach nothing.
  if (s.outcome === 'aborted') total *= 0.55

  const stars = total >= 820 ? 3 : total >= 640 ? 2 : total >= 440 ? 1 : 0
  const rating =
    stars === 3 ? 'Mission Commander' :
    stars === 2 ? 'Flight Engineer' :
    stars === 1 ? 'Astronaut Candidate' : 'Mission Aborted — Try Again'

  return {
    crewSurvival: Math.round(crewSurvival),
    lifeSupport: Math.round(lifeSupport),
    efficiency: Math.round(efficiency),
    radiation: Math.round(radiation),
    decisions: Math.round(decisions),
    science: Math.round(science),
    maintenance: Math.round(maintenance),
    total: Math.round(total),
    stars, rating,
    badges: evaluateBadges(s),
  }
}
