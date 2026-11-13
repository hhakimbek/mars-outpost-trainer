import { useGame } from '../src/store/useGame'
import { LANDING_SITES, siteById } from '../src/data/marsFeatures'

let fails = 0
const check = (name: string, ok: boolean, note = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${note ? '  — ' + note : ''}`)
  if (!ok) fails++
}

const g = () => useGame.getState()

console.log('\n=== menu -> orbit -> descent -> surface ===')

g().quitToMenu()
check('a fresh app starts on the menu', g().phase === 'menu')

g().openSiteSelect(12345)
check('starting a mission goes to orbit first', g().phase === 'orbit', g().phase)
check('the typed seed is held, not spent', g().pendingSeed === 12345)

// Choosing in orbit must not disturb anything: no mission exists yet.
const beforeSol = g().state.sol
g().selectSite('arcadia')
check('selecting a site updates the selection', g().selectedSiteId === 'arcadia')
check('selecting a site builds no mission', g().state.sol === beforeSol && g().phase === 'orbit')

g().commitLanding()
check('committing starts the descent', g().phase === 'descent')

g().landingComplete()
check('touchdown opens the briefing', g().phase === 'briefing', g().phase)
check('the mission uses the chosen site', g().state.siteId === 'arcadia', g().state.siteId)
check('the mission uses the typed seed', g().state.seed === 12345, String(g().state.seed))
check('the mission starts on sol 1', g().state.sol === 1)

console.log('\n=== the site is live in the mission, not just recorded ===')

// Same seed, two sites: the power the array can deliver must differ, or the
// choice in orbit was decoration.
const powerAt = (siteId: string) => {
  g().quitToMenu()
  g().openSiteSelect(777)
  g().selectSite(siteId)
  g().commitLanding()
  g().landingComplete()
  return g().projection().powerBalance
}
const pJezero = powerAt('jezero')
const pArcadia = powerAt('arcadia')
check('the same plan at two sites has different power',
  Math.abs(pJezero - pArcadia) > 3,
  `Jezero ${pJezero.toFixed(1)} kWh vs Arcadia ${pArcadia.toFixed(1)} kWh`)

// Every site must be playable end to end on the default plan without the
// store throwing or the forecast going non-finite.
let flowBad: string[] = []
for (const site of LANDING_SITES) {
  g().quitToMenu()
  g().openSiteSelect(2468)
  g().selectSite(site.id)
  g().commitLanding()
  g().landingComplete()
  for (let i = 0; i < 7 && g().state.outcome === 'inProgress'; i++) {
    const proj = g().projection()
    if (!Number.isFinite(proj.powerBalance) || !Number.isFinite(proj.netWater)) {
      flowBad.push(`${site.id} sol ${g().state.sol} forecast`)
      break
    }
    g().confirmPlan()
    g().endSol()
    const score = g().score()
    if (!Number.isFinite(score.total)) { flowBad.push(`${site.id} score`); break }
    g().nextSol()
  }
}
check('every site plays seven sols without breaking', flowBad.length === 0, flowBad.join(', '))

console.log('\n=== backing out ===')

g().quitToMenu()
g().openSiteSelect(999)
g().selectSite('hellas')
g().quitToMenu()
check('backing out of orbit returns to the menu', g().phase === 'menu')
check('backing out starts no mission', g().state.siteId !== 'hellas' || g().state.seed !== 999,
  `${g().state.siteId} / ${g().state.seed}`)

console.log('\n=== the default is a real site ===')

check('the default selection resolves', siteById(useGame.getInitialState().selectedSiteId).id ===
  useGame.getInitialState().selectedSiteId)

console.log(fails === 0 ? '\nALL FLOW CHECKS PASSED' : `\n${fails} FLOW CHECK(S) FAILED`)
if (fails > 0) process.exit(1)
