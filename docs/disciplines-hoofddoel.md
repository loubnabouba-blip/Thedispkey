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
- **Basisplan:** `discBegin()` zet `S.profile.goal` via
  `goalForDisc()` als de nieuwe discipline het hoofddoel is (hardlopen en Hyrox → conditie, powerlifting → kracht). Afvallen en bodybuilding laten het eigen profieldoel staan. Alle lezers hierboven
  blijven `S.profile.goal` lezen; er hoeft dus niets anders om.
- **Mijlpaal:** `discBegin()` koppelt een wedstrijddatum aan `S.milestone`
  (nieuw veld `disc`). Doelen-pagina toont het losse naam/datum-formulier alleen
  als er geen gekoppelde discipline met datum is.
- **Navigatie (stap 4):** de onderbalk heeft één ingang "Mijn doel" (route `sport`, opent altijd op het overzicht). "Doel en checklist" (`goalsPage`, route `disciplines`) is een detailscherm daaronder, niet meer een tabblad onder Plan. Oude links `#disciplines`, `#mijn-doel` en `#fotoshoot` blijven werken. `discHub()` (dode code) is verwijderd.

## Doel en wedstrijd: twee losse datums

Een doel en een wedstrijd of evenement zijn twee dingen met elk een eigen, bewerkbare datum. Voorbeeld: 10 kilo afvallen over 10 weken, en daarnaast over 20 weken een bruiloft of fotoshoot.

- **Doel:** `S.goalDate` (de doeldatum) en bij afvallen of aankomen `S.profile.targetWeight`. De app vergelijkt het tempo met de schatting van `timeEstimate()` en waarschuwt als de doeldatum korter is. De plan-duur "tot mijn doeldatum" (`planLength.mode === datum`) gebruikt `S.goalDate`. In de profielwizard is "Doeldatum" dit veld.
- **Wedstrijd of evenement:** `S.milestone` met een eigen `kind` (de keuze), `type` (voor de checklist), `name` en `date`. Eén tegelijk.
- **Wedstrijdkeuzes per hoofddiscipline** (`EV_SPEC`): hardlopen kiest een afstand, powerlifting een wedstrijdsoort, Hyrox een categorie. Daarnaast altijd de algemene soorten (`EV_GEN`): fotoshoot, bruiloft, vakantie, wedstrijd, feest, anders. Bij een actieve bodybuilding-voorbereiding bepaalt die klasse en datum, en de kaart verwijst ernaar.
- **Koppeling met het schema:** kies je bij een hoofddiscipline (hardlopen, powerlifting, Hyrox) een van die wedstrijdsoorten, dan wordt de datum ook de wedstrijddatum van het schema (`discSetDate()`), zodat het schema op die dag piekt en de lengte meeschuift als je de datum wijzigt. Kies je een ander soort (bruiloft, fotoshoot), dan blijft het schema lopen zonder wedstrijddatum.
- **Bestaande gebruikers:** de oude mijlpaal blijft bestaan als wedstrijd of evenement. Alleen wie het plan tot de mijlpaaldatum liet lopen, krijgt die datum ook als doeldatum.

## Extra training en extra beweging

- **Extra training = de aanvulling die bij je doel past** (`complement()`): bij een krachtgericht doel (spieropbouw, kracht, powerlifting, bodybuilding, afvallen) is dat rustige cardio; bij een duurgericht doel (conditie, hardlopen, Hyrox) is dat krachttraining. Bij Afvallen en gezond leven kiest de app wat er deze week nog mist. Doel: 2 per week. De trainingsweek toont een kaart zolang het doel niet gehaald is; het toevoegen-venster zet het aanbevolen type bovenaan met uitleg.
- **Maximaal één training per dag** bij het toevoegen (`dayHasTraining()`): een dag met een training weigert een tweede, en het venster toont de vrije dagen. Dit geldt voor wat je zelf toevoegt; het vaste schema van de app is niet aangepast.
- **Extra beweging voor je gezondheid** (`S.bw`: wandelen, rustig fietsen, mobiliteit, actieve pauze) is een aparte categorie en telt niet als training. Het mag ook op een dag met een training. Vandaag en de trainingsweek tonen het, met een weekteller tegen het WHO-advies van 150 minuten (afgevinkte beweging plus cardio-logs). Wandelen staat niet meer in de lijst met cardiotrainingen.

## Eén hoofddoel tegelijk

- De rol "ondersteunend" is vervallen: elke actieve discipline is het hoofddoel. Het keuzeveld bij starten en de kaart "Rol" onder Instellingen zijn weg.
- **Overstappen:** start je een tweede doel (discipline of bodybuilding), dan vraagt de app of je overstapt. Het huidige doel wordt gepauzeerd (`S.paused`, met een kopie van de instellingen). Logs blijven bewaard. Een bodybuilding-voorbereiding kan niet pauzeren en wordt beëindigd; check-ins en posing-log blijven.
- **Hervatten:** onder Mijn doel staat een kaart "Gepauzeerd" met een knop Hervat. Die opent het startscherm met dezelfde instellingen. Het schema begint opnieuw vanaf vandaag; een wedstrijddatum blijft alleen staan als die nog meer dan 4 weken weg is.
- **Bestaande gebruikers met meerdere doelen:** een kaart "Kies je hoofddoel" op Mijn doel. Na een keuze worden de andere gepauzeerd.
- Level, XP en badges blijven ongewijzigd.
