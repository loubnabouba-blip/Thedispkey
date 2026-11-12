# Gamificatie v2: streak, Sparks en kisten

Upgrade van het streak- en beloningssysteem van The Discipline Key. Doel: betere retentie op de twee momenten waar gebruikers nu afhaken (de eerste gemiste dag en week 2-3) en meer dopamine zonder ongezond gedrag te belonen.

## 1. Diagnose van het oude systeem

| Wat | Hoe het werkte | Probleem |
|---|---|---|
| Streak | Lokaal herberekend uit ruwe logs (`rewards()`), 3 van 4 dagdoelen | Te manipuleren met de telefoonklok, niet te synchroniseren, niets vastgelegd |
| Breuk | Direct naar 0 | "What the hell"-effect: na 30 dagen voelt 0 als totale mislukking |
| Beschermers | 1 per 7 dagen, automatisch verbruikt | Pas na een week: precies te laat voor de afhakers na de eerste gemiste dag |
| Beloningen | Vaste XP per actie | Voorspelbaar, dus na week 2-3 geen dopamine-piek meer |
| XP voor volume | +2 XP per set, +10 XP boven 10.000 stappen | Beloont méér in plaats van consistent, botst met de ethische grens |
| Urgentie | Grijze of oranje vlam | Geen tijdsdruk, geen "wat moet ik nu doen" |

## 2. Psychologisch ontwerp (Octalysis)

| Core drive | Mechaniek |
|---|---|
| **CD2 Ontwikkeling** | Rang (Vonk → Gloed → Vlam → Vuurhaard) op basis van *totaal gewonnen dagen*. Daalt nooit. Mijlpaal-voortgangsbalk (goal-gradient). |
| **CD4 Eigendom** | Sparks (munt), verzamelbare vlammen, orbits en kleurthema's die je in de app ziet. |
| **CD6 Schaarste** | Items alleen uit kisten, items die vrijkomen per rang, gouden kisten bij hogere rangen. |
| **CD7 Onvoorspelbaarheid** | Variabele kistdrops (variable ratio), loot pas bepaald bij het openen, 2% jackpot. |
| **CD8 Verliesaversie** | Aftellen tot middernacht, gloeilijn in de kopbalk, vlam die gloeit naar de lengte van je reeks. Altijd met een vangnet (beschermer of herstel). |
| **CD1 Betekenis** | Copy die herstel viert ("gepauzeerd, niet weg"), een teller met totaal gewonnen dagen die nooit reset. |

Witte-hoed (CD1, 2, 4) en zwarte-hoed (CD6, 7, 8) zijn bewust in balans. Zwarte-hoed-druk komt altijd samen met een uitweg, zodat urgentie niet omslaat in angst.

## 3. Streak: urgenter, maar met een vangnet

### Toestanden (lokaal berekend, werkt ook zonder account)

| Toestand | Wanneer | Wat de gebruiker ziet |
|---|---|---|
| `safe` | Vandaag ≥ 3/4 | "Dag 13 binnen" en een voortgangsbalk naar de volgende mijlpaal (7/14/21/30) |
| `open` | Nog niet gewonnen, vóór 18:00 | "Nog 1 doel voor dag 13" en snelknoppen voor de ontbrekende doelen |
| `risk` | Nog niet gewonnen, vanaf 18:00 | Aftellen ("Je vlam brandt nog 3 u 30 min"), gloeiende vlam, oranje lijn onder de kopbalk die krimpt naar middernacht, stip op het Vandaag-tabblad, ademende header-chip |
| `cold` | Reeks 0 | "Nieuwe reeks, zelfde jij" plus het totaal gewonnen dagen |
| `repair` | Herstelvenster open | "13 dagen staan in de vriezer", quest-stippen, knop om direct te herstellen |

In `risk` staat er altijd een uitweg bij: een check-in kost 10 seconden, en als je een beschermer hebt: "Lukt het vandaag niet? Je beschermer vangt het op." Urgentie zonder schuldgevoel.

### Tegen het "what the hell"-effect

1. **Startbeschermer op dag 1.** De eerste gemiste dag (het grootste afhaakmoment) wordt opgevangen voordat de gewoonte vastzit.
2. **Beschermers alleen als ze redden.** Mis je meer dagen dan je beschermers hebt, dan blijven ze bewaard voor later en worden ze niet verspild aan een reeks die toch breekt.
3. **Herstel-quest (gratis).** Breekt een reeks van ≥ 3 dagen, dan heb je 72 uur (servertijd). Win 2 dagen en je oude reeks komt terug, plus de nieuwe dagen. Dit beloont gedrag, niet betalen.
4. **Direct herstel met Sparks.** Prijs `40 + 6 × lengte`, maximaal 400. Eén herstel (quest of kopen) per 30 dagen, zodat de streak betekenis houdt.
5. **Comeback-kist.** De eerste gewonnen dag na een breuk levert een zilveren kist op (cooldown 14 dagen). Herstel wordt gevierd.
6. **Totaal gewonnen dagen.** Staat in elke breuk- en koude toestand. "142 gewonnen dagen staan op je naam. Die raak je nooit kwijt."
7. **Framing.** "Gepauzeerd, niet weg", "Nieuwe kans", een sintel die weer opgloeit in plaats van een rood kruis.

## 4. Beloningen: van statisch naar variabel

### Vast (voorspelbare basis)
- **XP** blijft status en wordt lokaal berekend (ongewijzigd, behalve de volumegrens hieronder).
- **Sparks per gewonnen dag:** 8, plus 2 per rang, plus 4 bij een perfecte dag (4/4).

### Variabel (dopamine)
- **Gegarandeerde kisten:** dag 1 (welkom), 7 en 14 (zilver), 21 en 30 (goud), daarna elke 30 dagen (goud), en de comeback-kist.
- **Verrassingskist:** elke gewonnen dag een kans van `12% + 7% × dagen sinds laatste kist + 8% bij perfect + 12% in week 2-3`, en zeker na 5 dagen zonder kist (pity). Dat geeft een variable-ratio-schema met een plafond aan pech.
- **Ontdekkingsweken (dag 7-21):** hogere dropkans, gericht op het tweede afhaakmoment.
- **Inhoud pas bij openen**, op de server bepaald:

| Kist | Sparks | Kans op cosmetisch item | Kans op beschermer |
|---|---|---|---|
| Brons | 8-20 | 6% | 0% |
| Zilver | 20-45 | 15% | 10% |
| Goud | 50-100 | 35% | 20% |

Plus 2% kans op een jackpot (×3 Sparks). Na 8 kisten zonder item is een item zeker. Je krijgt nooit een dubbel item: heb je alles al, dan wordt dat omgezet in Sparks.

### Progressieve overload (groeit mee)
De rang is gebaseerd op **totaal gewonnen dagen**, niet op volume:

| Rang | Vanaf | Sparks-vermenigvuldiger | Kans brons / zilver / goud |
|---|---|---|---|
| Vonk | 0 | ×1,00 | 80 / 18 / 2 |
| Gloed | 14 | ×1,15 | 65 / 30 / 5 |
| Vlam | 60 | ×1,30 | 50 / 38 / 12 |
| Vuurhaard | 180 | ×1,50 | 40 / 42 / 18 |

Vanaf rang Vlam bewaar je 3 beschermers in plaats van 2. Op een perfecte dag rol je de kistsoort twee keer en telt de beste ("advantage"). De **eis blijft altijd 3 van 4**: toeval varieert alleen de kans en de grootte van een beloning.

### Economie-simulatie
`supabase/tests/economy_sim.sql` simuleert 365 dagen (80% gewonnen, 30% daarvan perfect) tegen de echte functies:

| Kwartaal | Kisten per 7 gewonnen dagen | Sparks aan het eind |
|---|---|---|
| 1 | 2,6 | 1.446 |
| 2 | 2,1 | 3.723 |
| 3 | 2,1 | 6.183 |
| 4 | 2,3 | 8.979 |

Gemiddeld ongeveer 25 Sparks per dag. Een eerste cosmetisch item lukt na 1-2 weken, alle 12 items na ongeveer 6 maanden. **Let op:** daarna heeft Sparks geen bestemming meer. Plan seizoensitems (bijvoorbeeld elk kwartaal 3 nieuwe) als uitgavepost voordat gebruikers daar aankomen.

## 5. Ethische grenzen (in de code afgedwongen)

- **Geen extra XP voor volume:** vanaf `RW_V2_FROM` (2026-11-11) tellen per training maximaal 30 sets voor XP, en 10.000 stappen geeft geen bonus meer boven het stappendoel. Oudere dagen houden hun XP, zodat niemand een level kwijtraakt.
- **Geen beloning voor meer eiwit of minder calorieën:** de eiwit-pijler blijft "≥ 90% van het doel" en er bestaat geen bonus voor overschrijden.
- **Rang en Sparks** hangen af van gewonnen dagen, nooit van trainingsvolume.
- **De eis verandert nooit:** 3 van 4. Variabele beloningen veranderen alleen de kans en de grootte.
- **Transparantie:** alle kansen staan in de app onder *Beloningen → Kansen en regels*.
- **Geen echt geld:** Sparks zijn alleen te verdienen, niet te kopen. Er zijn geen sociale features en geen echte beloningen.

## 6. Datamodel (Supabase)

Migratie: `supabase/migrations/20261111120000_gamification.sql`

```
game_config      key → jsonb      afstelbare regels (privé, niet leesbaar voor clients)
game_profiles    per gebruiker    tijdzone, migrated_at, started_day, equipped {flame, orbit, theme}
user_state       per gebruiker    volledige app-state (zonder foto's en pincode) voor sync
streak_state     per gebruiker    actuele stand: current, best, lifetime_won, last_day, freezes, pity-tellers, herstelvenster
wallets          per gebruiker    sparks (≥ 0), lifetime_sparks
streak_events    logboek          day_won | freeze_earned | freeze_used | freeze_bought | streak_broken | repair_* | migrated
reward_events    logboek          sparks | chest_dropped | chest_opened | item_granted | purchase | equip
chests           per kist         tier, reason, opened_at, contents (pas gevuld bij openen)
shop_items       catalogus        prijs (null = alleen uit kisten), rarity, min_rank, style (render-hints)
inventory        per item         wat je bezit
```

Elke gebeurtenis krijgt `created_at default now()`: een server-tijdstempel. Een unieke partiële index `(user_id, local_day) where kind = 'day_won'` maakt dubbel claimen onmogelijk, ook bij gelijktijdige requests.

### Anti-cheat
- **"Vandaag" bepaalt de server:** `(now() at time zone profiel.timezone)::date`. Claimen kan alleen voor vandaag of gisteren (offline-marge). De telefoonklok verzetten heeft geen effect.
- **Tijdzone** wijzig je hooguit eens per 7 dagen, zodat je geen dag "wint" door van tijdzone te wisselen.
- **Clients schrijven niet** in spel-tabellen (RLS zonder schrijfpolicies, tabelrechten ingetrokken). Alle mutaties lopen via `SECURITY DEFINER`-functies die `auth.uid()` controleren.
- **Herstelvenster en cooldowns** zijn `timestamptz` op de server.
- **Kistinhoud** wordt pas bij `gm_open_chest` met `random()` op de server bepaald, en de kansen zijn niet leesbaar.
- **Bekende grens:** of je *echt* je stappen of eiwit haalde, blijft zelfrapportage, want de logs komen van het toestel. Het systeem voorkomt klokmanipulatie en dubbel claimen, niet het verzinnen van invoer.

### RPC's

| Functie | Wat |
|---|---|
| `gm_reconcile(p_tz)` | Bij openen van de app: profiel aanmaken, afgeronde dagen afhandelen (t/m eergisteren), snapshot teruggeven |
| `gm_claim_day(p_day, p_pillars)` | Dag claimen: beschermers en breuk afhandelen, herstel-quest, Sparks, kist |
| `gm_open_chest(p_chest)` | Kist openen, idempotent |
| `gm_buy(p_item)` / `gm_buy_repair()` / `gm_equip(p_slot, p_item)` | Winkel en cosmetica |
| `gm_migrate_local(...)` | Eenmalige overzetting vanuit localStorage, met begrensde waarden |
| `gm_snapshot()` | Alles wat de client nodig heeft, in één call |

### Voorbeeld: antwoord van `gm_claim_day`

```json
{
  "already": false,
  "events": [
    { "type": "freeze_used", "days": 1, "left": 0 },
    { "type": "sparks", "amount": 14, "why": "Perfecte dag" },
    { "type": "chest", "id": "6f0c…", "tier": "zilver", "reason": "mijlpaal" },
    { "type": "milestone", "n": 14 }
  ],
  "snapshot": {
    "today": "2026-11-11", "sparks": 312,
    "streak": { "current": 14, "best": 30, "lifetime_won": 87, "freezes": 0, "freeze_cap": 3,
                "won_today": true, "repair": null },
    "rank": { "rank": 3, "name": "Vlam", "next": { "rank": 4, "name": "Vuurhaard", "min_won": 180 } },
    "chests": [{ "id": "6f0c…", "tier": "zilver", "reason": "mijlpaal" }],
    "equipped": { "flame": "flame_ijs" }, "inventory": ["flame_ijs", "theme_oceaan"]
  }
}
```

### Voorbeeld: `chests.contents` na openen

```json
{ "tier": "goud", "sparks": 92, "jackpot": false, "freeze": true,
  "item": { "id": "orbit_sterren", "kind": "orbit", "name": "Sterrenstof", "rarity": "zilver", "style": { "orb": "sterren" } } }
```

### Tunen zonder migratie
Alle getallen staan in `game_config.rules` (JSON). Een voorbeeld: de dropkans verlagen:

```sql
update public.game_config set value = jsonb_set(value, '{drop,base}', '0.10') where key = 'rules';
```

## 7. Migratie en synchronisatie

1. **Registratie via Supabase Auth** (migratie `20261111130000_auth_profiles.sql`):
   - **Registreren:** naam, e-mail en wachtwoord (minimaal 8 tekens) via `signUp`. De naam gaat als metadata mee, en een trigger maakt direct een rij in `profiles` (1-op-1 met `auth.users.id`: `display_name`, `avatar_url`, `onboarding_status`).
   - **Bevestigen is verplicht:** met de 6-cijferige code uit de mail (`verifyOtp`, type `signup`) of via de link. Een onbevestigd account kan niet inloggen. Daarnaast weigert de server zelf alle `gm_*`-RPC's (`gm:email_unverified`) en cloud-sync (RLS).
   - **Inloggen:** met e-mail en wachtwoord. Wie nog niet bevestigd is, komt terug in de bevestigstap, met een knop om de mail opnieuw te sturen.
   - **Wachtwoord vergeten:** een code per mail (`resetPasswordForEmail` → `verifyOtp` type `recovery` → `updateUser`).
   - **Met code (zonder wachtwoord):** een code plus magic link per mail. Dat bevestigt het adres meteen.
   - Alle stappen werken met codes, dus ook in de iOS-app zonder deep links.
   - **Profiel:** na inloggen wordt `onboarding_status` op `klaar` gezet als het lokale profiel al bestaat. De naam wordt aangevuld vanuit de app als die nog leeg is. Clients mogen alleen `display_name`, `avatar_url` en `onboarding_status` wijzigen (kolomrechten). De avatar moet een https-adres zijn.
   - **Wegwerp-adressen:** verplichte bevestiging maakt misbruik lastiger, maar blokkeert geen wegwerpdiensten. Doe dat zo nodig met een Auth-hook (*Before User Created*) of CAPTCHA (Auth → Attack Protection).
2. Bij de **eerste login** berekent de client de oude lokale stand (streak, record, totaal, beschermers, laatste gewonnen dag) en roept `gm_migrate_local` aan:
   - De reeks telt alleen als de laatste gewonnen dag vandaag of gisteren was. Waarden worden begrensd (reeks ≤ 400, beschermers ≤ cap).
   - De app-state gaat naar `user_state`. Bestaande cloud-data (van een ander toestel) wordt nooit overschreven.
   - Bestaande gebruikers krijgen een welkomstbonus: 2 Sparks per gewonnen dag (maximaal 200) en een gouden kist.
3. Daarna wordt bij elke `save()` de state na 2,5 s naar `user_state` gepusht (laatste schrijver wint, met `client_rev`). Heeft zowel het toestel als het account eigen wijzigingen, dan kiest de gebruiker.
4. **Niet gesynchroniseerd:** voortgangsfoto's, eigen receptfoto's en de pincode. Die blijven op het toestel.
5. **Zonder account** (of zolang `gm/config.js` geen sleutel heeft) werkt de app precies als voorheen, inclusief de nieuwe urgentie-UI.

## 8. UX en micro-interacties

- **Kist-reveal:** de kist valt erin (veer), wiebelt af en toe (anticipatie), schudt 1,3 s bij een tik terwijl de server rolt, en dan gaan het deksel en de lichtstralen open. Daarna komen de items getrapt binnen, telt het Sparks-bedrag op en volgt confetti bij goud, een item of een jackpot. Met haptiek in de iOS-app.
- **Sparks:** een vliegende "+14 ✦" met muntdeeltjes, en de wallet-chip die even opspringt.
- **Vlam:** gloed en grootte groeien met de reeks (1-6, 7-29, 30-99, 100+). Ook in de orbit, de header-chip en de klassieke weergave.
- **App-breed:** veer-feedback op alles wat tikbaar is, ripple op knoppen, kaarten die getrapt binnenkomen bij een paginawissel, een vinkje dat "popt" als een dagdoel net gehaald is, een veer-toast en veer-dialogen, en voortgangsbalken die animeren.
- **Cosmetica:** de vlamkleur kleurt ook de orbit-gloed. Een kleurthema geldt op Vandaag en Beloningen, zodat de routekleuren van de rest van de app blijven werken.
- **Toegankelijkheid:** alles respecteert `prefers-reduced-motion`, tikdoelen zijn ≥ 44 px, focus is zichtbaar in de accentkleur en tellers hebben `aria-label`s.

## 9. Pushmeldingen (voorstel, niet gebouwd)

Schaars en nooit schuldgevoel-gedreven:
- Standaard **uit**. Opt-in pas na dag 3, met een zelfgekozen tijd.
- Hooguit **één melding per dag**, alleen als de reeks ≥ 3 is, de dag nog niet gewonnen is en het minder dan 3 uur voor middernacht is.
- Toon: "Eén check-in en dag 13 staat erop. Of laat je beschermer het opvangen." Nooit: "Je gaat je reeks verliezen!"
- Na twee genegeerde meldingen op rij een week stil.
- Ook een melding als er een herstel-quest loopt: "Nog 1 dag en je 30 dagen zijn terug."

## 10. Uitrol

Stand op 11-11-2026:

| Stap | Status |
|---|---|
| Supabase-project "Discipline" hervat | gedaan |
| Migraties `120000`, `130000` en `140000` | live, gecontroleerd (RLS, rechten, trigger) |
| Publishable key in `gm/config.js` | gedaan |
| *Confirm email* | stond al aan |
| Minimale wachtwoordlengte | 8 (gezet via de Management API) |
| Codelengte in mails | 6 cijfers |
| Site URL | `https://disciplineiskey.netlify.app` |
| Eigen SMTP | werkt (Brevo, `smtp-relay.brevo.com:587`); mails komen nog in de spam (zie hieronder) |
| Mailtemplates met `{{ .Token }}` | gedaan: Nederlandse templates met code en knop (bevestigen, inloggen, nieuw wachtwoord) |
| Mail-limiet | 30 per uur |
| Leaked password protection | niet beschikbaar op het gratis plan (Pro-functie) |

### Stand mail (12-11-2026)

Mail werkt: Supabase → Brevo → Gmail. Daarvoor is in Brevo de IP-blokkering voor SMTP-keys uitgezet. De mails komen nog **in de spam** terecht, omdat de afzender een `@gmail.com`-adres is dat via Brevo wordt verstuurd (geen DKIM/DMARC voor dat domein).

**Volgende stap voor een goede bezorging:** een eigen domein (bijvoorbeeld `noreply@disciplinekey.nl`) toevoegen en verifiëren in Brevo (DKIM, DMARC), en daarna de *Sender email* in Supabase aanpassen. Tot die tijd zegt de app al "Geen mail? Kijk ook in je spam".

**Zonder eigen SMTP** verstuurt Supabase alleen mail naar leden van het eigen Supabase-team, en maximaal 2 per uur. De standaardmails bevatten alleen een link, geen code. De app vangt dat op: een link uit de mail (bevestigen, inloggen, wachtwoord herstellen) komt terug in de web-app, die de sessie oppakt (`gmFromMailLink`). De codevelden staan ingeklapt onder "Ik heb een code gekregen". Een link opent in de browser, niet in de iOS-app. Daar log je na het bevestigen gewoon in met je wachtwoord.

**Eigen SMTP instellen** (bijvoorbeeld Resend, gratis tot 3.000 mails per maand):
1. Maak een account aan en verifieer je domein, of gebruik het testdomein.
2. Vul in Supabase onder Authentication → SMTP Settings de host, poort, gebruiker, wachtwoord en het afzenderadres in.
3. Zet daarna `{{ .Token }}` in de templates *Confirm signup*, *Magic Link* en *Reset Password*.

## 11. Meten

| Metric | Vraag | Bron |
|---|---|---|
| D1 / D7 / D21-retentie | Halen we de twee afhaakmomenten? | `streak_events.day_won` per cohort |
| Terugkeer na breuk ≤ 72 u | Werkt het anti-WTH-vangnet? | `streak_broken` → volgende `day_won` |
| Afronding herstel-quest | Is "2 van 3 dagen" haalbaar? | `repair_completed` met `meta.via = 'quest'` versus `repair_expired` |
| Gekocht versus verdiend herstel | Wordt Sparks een kortere weg? | `repair_bought` versus `repair_completed` |
| Tijd tot openen van een kist | Is de kist spannend? | `chests.opened_at - dropped_at` |
| Sparks-voorraad (p50/p90) | Inflatie? | `wallets.sparks` |
