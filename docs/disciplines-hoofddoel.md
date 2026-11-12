# Disciplines als hoofddoel — inventaris (stap 1)

Doel: de discipline wordt de bron voor het basisplan (`S.profile.goal`) en de
mijlpaal (`S.milestone`). Dit overzicht legt vast wie die state nu leest en
schrijft, zodat de volgende stappen gericht kunnen werken.

## `S.profile.goal`

Waarden: `kracht | spier | vet | conditie | bewegen | combi` (`GOALS`, `GOAL_ORDER`).

| Plek | Leest / schrijft | Effect |
| --- | --- | --- |
| `calcMacros()` | leest | kcal-aanpassing en eiwit per kg per doel |
| macro-waarschuwingen (koolhydraten, streefgewicht-inschatting) | leest | adviesteksten |
| `buildPlan()` (`prog === 'auto'`) | leest | `conditie` → max 2 krachtsessies, rest cardio |
| oefening-progressie (`exId`, `goal`) | leest | herhalingen/RPE per doel |
| `coachProposal()` | leest | macro-bijsturing alleen bij `vet`, `spier`, `combi` |
| `nextAction()` (slaap/weeg-hints) | leest | welke hint verschijnt |
| voedingspagina (`cutCtl`) en gewicht-uitleg | leest | tempo-keuze en kopteksten |
| `goalsPage()` hero | leest | titel "Jouw doel" |
| onboarding stap 2 + `A.obFinish()` | schrijft | enige plek die het doel zet; reset `macroOverride` bij wijziging |

`prog` komt uit `S.profile.program` (standaard `auto`); alleen `F.compStart`
(bodybuilding, "pas mijn programma aan") en het schema-formulier op Training
zetten die los.

## `S.milestone`

Velden: `enabled, name, type, date, note, items, checks`.

| Plek | Leest / schrijft |
| --- | --- |
| `goalsPage()` (route `disciplines`, label "Doelen") | leest + formulier `F.milestone` |
| `vMilestone()` / `vGoalBasic()` (route `mijn-doel`) | leest + formulier `F.milestone` |
| `msItems()`, `C.msCheck`, `A.msDel`, `F.msAdd`, `A.msTemplate` | checklist |
| Home-kop (dagen tot …), weekkalender, plan-lengte `mode: 'datum'` | leest `date` |
| Hyrox-weken (`program === 'hyrox'`), `F.hxDate` | leest/schrijft `date` |
| `A.obFinish()` | schrijft `enabled`, `date` |
| `F.compStart`, `A.syncTo*`, `askSync*`, `syncBanner()` | bodybuilding ↔ mijlpaal gelijk houden |

Disciplines (`discBegin()`) raakten tot nu toe geen van beide.

## Wat straks van de discipline leest

- **Hoofddoel:** `activeMainDisc()` — de actieve discipline met rol `main`
  (bodybuilding-voorbereiding telt mee).
- **Basisplan:** `discBegin()` en `F.compStart` zetten `S.profile.goal` via
  `goalForDisc()` als de nieuwe discipline het hoofddoel is. Alle lezers hierboven
  blijven `S.profile.goal` lezen; er hoeft dus niets anders om.
- **Mijlpaal:** `discBegin()` koppelt een wedstrijddatum aan `S.milestone`
  (nieuw veld `disc`). Doelen-pagina toont het losse naam/datum-formulier alleen
  als er geen gekoppelde discipline met datum is.
- **Navigatie (`ROUTES`/`SUBN`)**: bewust nog niet aangepast (stap 4, later).
