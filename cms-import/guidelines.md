# Lead Glocal CMS Import Guidelines

**Doel van dit document.** Dit document beschrijft het exacte formaat van Markdown-bestanden en afbeeldingen die nodig zijn om de Lead Glocal Webflow CMS te vullen. Het document is geschreven voor twee partijen:

1. **De content-producer (Cowork AI of mens):** leest deze richtlijnen, schrijft daarna de Markdown-bestanden en levert de afbeeldingen aan. Output moet 1:1 aan de specificatie voldoen.
2. **De importeur (een aparte Claude-sessie met Webflow MCP):** leest deze richtlijnen plus de geproduceerde Markdown-bestanden, en pusht items naar de Webflow CMS via de Data API.

Beide partijen moeten dit document **volledig** lezen voordat ze beginnen. Veldnamen, verplichte velden, validaties en copy-stijl staan hieronder. Wijken van de specificatie betekent dat de import faalt of dat content niet past binnen het design.

---

## 1. Wat er bestaat in de CMS

De Lead Glocal Webflow site bevat vier CMS-collecties die relevant zijn voor deze import:

| Collectie | Webflow Slug | Doel |
|---|---|---|
| Projecten | `projecten` | Actieve, prominent getoonde projecten met volledige detailpagina |
| Archief Projecten | `archief-projecten` | Oudere projecten met een eenvoudige rich-text body (geen rol-uitsplitsing) |
| Highlights | `highlights` | Losse momenten (foto + titel) die referenced kunnen worden vanuit één of meerdere Projecten |
| Thema's | `themas` | Categorieën zoals "Energie Transitie", "Voeding", "Circulariteit", "Socio-Economisch". Wordt **niet** door deze import aangemaakt — bestaande thema's blijven leidend. |

**Belangrijk:** Themes worden gekoppeld vanuit de Thema's-kant (Thema heeft een MultiReference naar Projecten). De content-producer hoeft per project géén thema te specificeren — dat wordt later handmatig in Webflow geregeld door iemand met inzicht in de portfolio.

---

## 2. Folderstructuur die de content-producer moet opleveren

```
lead-glocal-cms/
├── guidelines.md                       (dit bestand; meeleveren voor de importeur)
├── projecten/
│   ├── stroom/
│   │   ├── project.md                  (frontmatter + geen body)
│   │   ├── hero.jpg                    (Hero Afbeelding)
│   │   ├── logo.png                    (Logo / Avatar)
│   │   └── vimeo-thumbnail.jpg         (alleen als project een Vimeo-video heeft)
│   ├── food-innovation-academy/
│   │   └── ...
│   └── ...
├── archief-projecten/
│   ├── dit-is-een-archief-project/
│   │   ├── project.md                  (frontmatter + markdown body)
│   │   ├── hero.jpg
│   │   └── vimeo-thumbnail.jpg         (alleen als Vimeo)
│   └── ...
└── highlights/
    ├── kenniscafe-fia/
    │   ├── highlight.md                (frontmatter; geen body)
    │   └── image.jpg
    └── ...
```

**Regels:**
- Eén project = één folder. Foldernaam = slug van het project.
- Afbeeldingen leven in dezelfde folder als de `project.md`. In de frontmatter verwijs je via de **bestandsnaam** (`hero.jpg`), niet een pad. De importeur weet automatisch dat het bestand naast de markdown ligt.
- Bestandsnamen mogen vrij gekozen worden, zolang ze in de frontmatter exact overeenkomen.
- Geen extra bestanden in de project-folders (geen README's, geen losse notities).

---

## 2.5. Velden die een MENS invult — content-producer laat deze altijd op `null`

Drie velden worden **niet** door de content-producer of de geautomatiseerde import ingevuld. Ze vereisen menselijk oordeel en context die niet uit bronmateriaal te halen is. Houd deze **altijd op `null`**:

| Veld | Waarom mens-werk |
|---|---|
| `highlights` | Het koppelen van highlights aan een project vereist redactionele keuze. Een mens linkt deze later handmatig in Webflow. |
| `coordinaat_voor_kaart_positie` | Alleen relevant zodra een project aan een thema gekoppeld is en op de Nederland-kaart getoond wordt. De positie-ID wordt handmatig opgezocht via `?showDots=true`. |
| Alle Vimeo-velden (`heeft_vimeo_link`, `vimeo_video_id`, `vimeo_thumbnail`) | Video's worden door een mens geselecteerd, geüpload en gekoppeld. |

De content-producer levert deze dus aan als:
```yaml
highlights: null
coordinaat_voor_kaart_positie: null
heeft_vimeo_link: false
vimeo_video_id: null
vimeo_thumbnail: null
```

De importeur laat deze velden leeg bij het aanmaken van items (of zet `heeft_vimeo_link`/`vimeo-video-player-zichtbaarheid` op `false`). Een mens vult ze later in Webflow aan.

---

## 3. Algemene regels voor frontmatter en velden

- Gebruik **strict YAML** voor frontmatter (driedubbele streep `---` boven en onder).
- Stringen die speciale tekens, dubbele punt, of meerdere regels bevatten **moeten** tussen quotes (`"..."` of `'...'`).
- Gebruik `null` voor optionele velden die niet van toepassing zijn. **Laat optionele velden niet weg** — zet ze expliciet op `null`. Dit voorkomt ambiguïteit bij de importeur.
- Booleans zijn `true` of `false` (kleine letters, niet quoted).
- Numerieke velden zonder quotes (`featured: true`, niet `featured: "true"`).
- Markdown-body (alleen voor archief) komt **na** de afsluitende `---`.

---

## 4. Slug-regels (kritiek)

De slug bepaalt de URL en de identifier. Slug-regels:

- Alleen kleine letters, cijfers, en streepjes (`-`).
- Geen spaties, geen accenten, geen speciale tekens.
- Geen leestekens.
- Wordt afgeleid van de naam: `STROOM` → `stroom`, `Food Innovation Academy` → `food-innovation-academy`, `TheBrand.Estate` → `thebrand-estate`.
- Slug is **uniek** binnen de collectie. Dubbele slugs zorgen voor een import-fout.

De content-producer moet de slug expliciet meegeven in de frontmatter (niet automatisch laten genereren door de importeur), omdat de slug ook de foldernaam is.

---

## 5. Afbeeldingsregels

### Formaten
- Geaccepteerd: `.jpg`, `.jpeg`, `.png`, `.webp`.
- **Geen** `.svg`, `.gif`, of `.avif`.
- Maximaal 4 MB per bestand. Liever onder 1 MB (lange laadtijden = slechte UX).

### Aanbevolen afmetingen

| Veld | Aanbevolen min. resolutie | Aspect ratio |
|---|---|---|
| Hero Afbeelding (Projecten + Archief) | 1600 × 1000 px | 16:10 of breder |
| Logo / Avatar (Projecten) | 512 × 512 px | Vierkant, transparant PNG bij voorkeur |
| Vimeo Thumbnail | 1280 × 720 px | 16:9 |
| Highlight Afbeelding | 1200 × 800 px | 3:2 of vrij |

### Bestandsnamen
- Geen spaties of speciale tekens in bestandsnamen.
- Lowercase, hyphens. Bijvoorbeeld: `hero.jpg`, `logo.png`, `vimeo-thumbnail.jpg`.

### Alt-tekst
- Op dit moment vult de CMS geen alt-tekst per item — dat wordt later handmatig toegevoegd. De content-producer hoeft géén alt-tekst aan te leveren.

---

## 6. Vimeo-regels — MENS-WERK, content-producer laat alles op `null`

Vimeo-video's worden volledig door een mens beheerd: selecteren, uploaden, koppelen. De content-producer en de geautomatiseerde import raken deze velden **niet** aan.

De content-producer levert altijd aan:
```yaml
heeft_vimeo_link: false
vimeo_video_id: null
vimeo_thumbnail: null
```

(Geldt voor zowel Projecten als Archief Projecten.)

**Ter referentie voor de mens die het later invult** — wat dan geldt:
- `heeft_vimeo_link` → `true` zetten.
- `vimeo_video_id` → alleen de numerieke ID, geen volledige URL. Van `https://vimeo.com/1194370924` → `1194370924`.
- `vimeo_thumbnail` → verplicht zodra Vimeo aan staat; zonder thumbnail kapt het design.

Maar dat is dus een **handmatige** stap achteraf, geen onderdeel van deze import.

---

## 7. Collectie: Projecten

Dit is de hoofdcollectie. Veld-voor-veld referentie:

### 7.1. Velden — verplicht

#### `name` (PlainText, max 256)
De volledige projectnaam zoals die op de site verschijnt. Mag hoofdletters en speciale tekens bevatten (bv. `TheBrand.Estate`, `STROOM`).
- **Voorbeeld:** `STROOM`, `Food Innovation Academy`

#### `slug` (PlainText, max 256, alphanumeric+hyphens)
Zie sectie 4. De foldernaam moet exact gelijk zijn aan de slug.
- **Voorbeeld:** `stroom`, `food-innovation-academy`

#### `omschrijvende_zin` (PlainText, single-line, max 135)
Eén zin die in maximaal 135 tekens omschrijft **wat voor project het is**. Geen "Lead Glocal heeft...", geen rolverdeling, gewoon: wat is dit project?
- **Tone of voice:** zelfstandig naamwoord-fraseringen of korte beschrijvende zin. Eindigt met punt.
- **Voorbeelden uit live CMS:**
  - `Platform waar ondernemers, onderwijs, kennisinstellingen en overheid samenwerken aan de energietransitie in het Groene Hart.`
  - `Dé ontmoetingsplek voor bedrijven in de levensmiddelenindustrie.`
- **Niet doen:**
  - "Lead Glocal heeft samengewerkt met..." (gaat over de rol, niet het project)
  - Lange uitleg met meerdere zinnen.
  - Tekst > 135 tekens.

#### `hero_afbeelding` (Image)
De hero-foto voor zowel de project-card als de project-detailpagina. Zie afbeeldingsregels (sectie 5).
- **Frontmatter waarde:** bestandsnaam in dezelfde folder (`hero.jpg`).

#### `logo_avatar` (Image)
Klein, vierkant logo dat op de Nederland-kaart van de homepagina verschijnt naast het stipje.
- **Frontmatter waarde:** bestandsnaam (`logo.png`).

#### `uitdaging` (PlainText, multi-line, min 20, max 140)
Beschrijft **welke uitdaging er was vóórdat Lead Glocal betrokken werd**. Context-eerst (sector/regio), dan de gap.
- **Tone of voice:** zakelijk, één tot twee zinnen, eindigt met punt.
- **Voorbeelden:**
  - `De energietransitie in het Groene Hart vroeg om samenwerking die er nog niet was. Lead Glocal bouwde het platform dat losse partijen verbond.`
  - `Regio Rotterdam-Den Haag wilde een plek waar alles draait om samenwerking, innovatie en kennisdeling in de levensmiddelenindustrie.`
- **Niet doen:**
  - Onder de 20 tekens (validatie).
  - Boven de 140 tekens (validatie).
  - Beschrijving van Lead Glocal's rol (dat hoort bij architect/bouwer/facilitator).

#### `meer_over_dit_project` (Link / URL)
Externe URL naar de website van het initiatief of een andere bron met meer info. Moet een geldige URL zijn (begint met `https://` of `http://`).
- **Voorbeeld:** `https://stroomgroenehart.nl`, `https://foodinnovationacademy.nl/over-fia`
- **Niet doen:** lege strings, relatieve paden, mailto-links.

**Schrijfstijl voor alle drie de rollen (belangrijk):** schrijf de rol als een **handeling/gerund-frase** die begint met "Het [werkwoord]en van ...". Begin **niet** elke keer met "Lead Glocal" — dat wordt eentonig wanneer de drie rollen onder elkaar staan. De zin beschrijft de werkzaamheid zelf, niet de uitvoerder.

#### `architect` (PlainText, single-line, max 135)
Eén frase: welke werkzaamheid hoort bij de rol als **architect** (ontwerper van het ecosysteem)?
- **Vorm:** "Het ontwerpen van ...", "Het in kaart brengen van ...", "Het definiëren van ..."
- **Goed voorbeeld:** `Het ontwerpen van de structuur waarbinnen ondernemers, onderwijs en overheid samenwerken aan de energietransitie.`
- **Vermijd:** `Lead Glocal ontwierp ...` (te repetitief naast de andere rollen).

#### `bouwer` (PlainText, multi-line, max 135)
Eén frase: welke werkzaamheid hoort bij de rol als **bouwer** (uitvoerder, opzetter)?
- **Vorm:** "Het bijeenbrengen van ...", "Het inrichten van ...", "Het opzetten van ..."
- **Goed voorbeeld:** `Het bijeenbrengen van partijen en het inrichten van de samenwerking zodat losse initiatieven als geheel gaan functioneren.`

#### `facilitator` (PlainText, multi-line, max 135)
**Let op:** in de Webflow CMS heet de slug nog `manager` (legacy naming), maar het getoonde label is **Facilitator**. In je markdown gebruik je `facilitator:` — de importeur weet dit te mappen naar het juiste veld. (Het label mag in de UI "manager" of "facilitator" zijn; dat verandert niets aan de slug-mapping of de copy.)

Eén frase: welke werkzaamheid hoort bij de rol als **facilitator** (begeleider, hoeder van het ecosysteem)?
- **Vorm:** "Het bewaken van ...", "Het begeleiden van ...", "Het faciliteren van ..."
- **Goed voorbeeld:** `Het bewaken van de groei van het platform en zorgen dat STROOM blijft functioneren als zelfstandig, lerend ecosysteem.`

### 7.2. Velden — optioneel maar verwacht

#### `featured` (Switch / Boolean)
Als `true`: project verschijnt op de homepagina (max 8 worden getoond). Wordt ook gebruikt om de volgorde op de "Alle Projecten"-pagina te bepalen.
- **Default:** `false`
- **Richtlijn:** alleen `true` voor de actuele, meest representatieve projecten (max 8).

#### `featured_priority` (Switch / Boolean)
Alleen relevant als `featured: true`. Als `true`: project staat vooraan in de rij. Bij meerdere prioriteits-projecten wordt op creatiedatum gesorteerd.
- **Default:** `false`
- **Richtlijn:** spaarzaam gebruiken (1-3 projecten max). Voor projecten die je echt eerst wil tonen.

#### `highlights` (MultiReference → Highlights collectie) — MENS-WERK
Het koppelen van highlights aan een project is een redactionele keuze die een mens later handmatig in Webflow maakt. **De content-producer laat dit altijd op `null`.** Zie sectie 2.5.
- **Altijd:** `highlights: null`

#### `coordinaat_voor_kaart_positie` (Number, integer, positive) — MENS-WERK
ID van een stipje op de Nederland-kaart. Alleen relevant zodra een project aan een thema gekoppeld is en op de kaart verschijnt. Wordt handmatig opgezocht (via `?showDots=true`) door een mens. **De content-producer laat dit altijd op `null`.** Zie sectie 2.5.
- **Altijd:** `coordinaat_voor_kaart_positie: null`

#### `heeft_vimeo_link` / `vimeo_video_id` / `vimeo_thumbnail` — MENS-WERK
Alle Vimeo-velden worden door een mens beheerd. **De content-producer laat deze altijd op de leeg-waarde.** Zie sectie 6.
- **Altijd:**
  ```yaml
  heeft_vimeo_link: false
  vimeo_video_id: null
  vimeo_thumbnail: null
  ```

### 7.3. Compleet voorbeeld: Projecten

`/projecten/stroom/project.md`:

```markdown
---
name: STROOM
slug: stroom
omschrijvende_zin: Platform waar ondernemers, onderwijs, kennisinstellingen en overheid samenwerken aan de energietransitie in het Groene Hart.
hero_afbeelding: hero.jpg
logo_avatar: logo.png
uitdaging: De energietransitie in het Groene Hart vroeg om samenwerking die er nog niet was. Lead Glocal bouwde het platform dat losse partijen verbond.
meer_over_dit_project: https://stroomgroenehart.nl
architect: Het ontwerpen van de structuur waarbinnen ondernemers, onderwijs en overheid samenwerken aan de energietransitie.
bouwer: Het bijeenbrengen van partijen en het inrichten van de samenwerking zodat losse initiatieven als geheel gaan functioneren.
facilitator: Het bewaken van de groei van het platform en zorgen dat STROOM blijft functioneren als zelfstandig, lerend ecosysteem.
featured: true
featured_priority: true
highlights: null
coordinaat_voor_kaart_positie: null
heeft_vimeo_link: false
vimeo_video_id: null
vimeo_thumbnail: null
---
```

> Let op: `highlights`, `coordinaat_voor_kaart_positie` en de Vimeo-velden staan bewust op `null` — dat is mens-werk (sectie 2.5).

Geen body. Project-detailpagina bouwt zichzelf op uit de bovenstaande velden via het Webflow-template.

---

## 8. Collectie: Archief Projecten

Archief is voor oudere projecten. Eenvoudiger structuur: geen architect/bouwer/facilitator uitsplitsing, wel een rich-text body waar het verhaal vrij verteld kan worden.

### 8.1. Velden — verplicht

#### `name`
Zelfde regels als Projecten (sectie 7.1).

#### `slug`
Zelfde regels (sectie 4).

#### `omschrijvende_zin` (PlainText, single-line, max 135)
Zelfde regels als Projecten.

#### `hero_afbeelding` (Image)
Zelfde regels.

#### `meer_over_dit_project` (Link)
Zelfde regels.

#### `body` (RichText)
De volledige projectomschrijving. Komt in de markdown **na** de frontmatter.
- **Toegestane elementen:** headings (`#`, `##`, `###`, `####`, `#####`, `######`), paragrafen, **bold**, *italic*, lijsten (geordend en ongeordend), blockquotes, inline links, inline `code`.
- **Niet doen:** tabellen, code-blocks (alleen inline `code`), complexe HTML, embedded video/iframe.
- **Richtlijn:** "Houd de body simpel. Niet te veel styling, headings, of dergelijken. Dit zal het design erg rommelig maken." (rechtstreeks uit de Webflow help-text)
- **Lengte:** geen harde limiet, maar realistisch 200-1500 woorden.

### 8.2. Velden — Vimeo (MENS-WERK)

Net als bij Projecten worden de Vimeo-velden door een mens ingevuld. De content-producer laat ze op de leeg-waarde:
```yaml
heeft_vimeo_link: false
vimeo_video_id: null
vimeo_thumbnail: null
```

**Let op de naam-mapping in YAML:** in archief is de Webflow-slug `vimeo-video-player-zichtbaarheid` (niet `heeft-vimeo-link`), maar in je YAML gebruik je net als bij Projecten `heeft_vimeo_link`. De importeur vertaalt dit. Zie sectie 6 en 14.

### 8.3. Compleet voorbeeld: Archief

`/archief-projecten/projectnaam-x/project.md`:

```markdown
---
name: Projectnaam X
slug: projectnaam-x
omschrijvende_zin: Korte zin die in 135 tekens omschrijft wat het project was.
hero_afbeelding: hero.jpg
meer_over_dit_project: https://www.externewebsite.nl
heeft_vimeo_link: false
vimeo_video_id: null
vimeo_thumbnail: null
---

# Hoofdtitel van het verhaal

Een inleidende paragraaf die context geeft. Wat speelde er, wie waren de betrokken partijen, en waarom was dit project relevant?

## Aanleiding

Vervolgens beschrijf je de aanleiding. Houd het kort en helder.

- Punt één in een lijst
- Punt twee
- Punt drie

## Aanpak

Hoe heeft Lead Glocal bijgedragen? Beschrijf de fases of de methodiek in begrijpelijke taal.

## Resultaat

Wat is er uit dit project voortgekomen? Concrete uitkomsten, geleerde lessen, vervolgstappen.
```

---

## 9. Collectie: Highlights — MENS-WERK (niet in deze import-ronde)

> **Highlights worden volledig door een mens beheerd.** Het aanmaken van highlight-items én het koppelen ervan aan projecten gebeurt handmatig in Webflow, achteraf. De content-producer maakt in deze ronde **geen** `/highlights/`-folder en laat het `highlights`-veld op elk project op `null`.
>
> De onderstaande schema-beschrijving staat hier puur als referentie voor wanneer een mens (of een latere import-ronde) highlights wél gaat toevoegen.

Highlights zijn losse momenten, gebeurtenissen, of beelden die je vanuit een project kunt referencen. Eén highlight kan door meerdere projecten worden gebruikt.

### 9.1. Velden — allemaal verplicht

#### `name` (PlainText, max 256)
De titel van het moment. Korte, beschrijvende naam.
- **Voorbeelden:** `Kenniscafe FIA`, `Van Topsector Energie naar Energy Innovation NL`

#### `slug`
Zelfde regels (sectie 4).

#### `afbeelding` (Image)
Het beeld bij dit moment. Foto van het event/moment.

### 9.2. Compleet voorbeeld: Highlight

`/highlights/kenniscafe-fia/highlight.md`:

```markdown
---
name: Kenniscafe FIA
slug: kenniscafe-fia
afbeelding: image.jpg
---
```

Geen body.

---

## 10. Copy-stijl: stem, toon en lengte

Lead Glocal positioneert zich als **rustige, beschouwende ecosysteem-consultancy**. De copy is niet salesy, niet schreeuwerig. Het is feitelijk en helder, met respect voor de complexiteit van het werk.

### Algemene regels
- **Geen marketing-superlatieven.** Vermijd "groundbreaking", "revolutionair", "uniek", "innovatief" als bijvoeglijke naamwoorden zonder onderbouwing.
- **Actief, niet passief.** "Lead Glocal ontwierp..." in plaats van "Er werd ontworpen door Lead Glocal..."
- **Concreet, niet vaag.** "Een platform met 40 partijen" beter dan "een groot platform".
- **Korte zinnen.** Eén gedachte per zin. Komma's als adempauze, niet als wegversperring.
- **Eindigen met punt.** Ook losse zinnen in lijstjes (Webflow rendert die als plain text).

### Per veld

| Veld | Aantal zinnen | Stijl |
|---|---|---|
| `name` | n.v.t. | Eigennaam, mag hoofdletters bevatten |
| `omschrijvende_zin` | 1 | Noun-phrase of korte beschrijvende zin |
| `uitdaging` | 1-2 | Context + gap-beschrijving |
| `architect` | 1 frase | Gerund-vorm: "Het ontwerpen van ...", "Het in kaart brengen van ..." |
| `bouwer` | 1 frase | Gerund-vorm: "Het bijeenbrengen van ...", "Het inrichten van ..." |
| `facilitator` | 1 frase | Gerund-vorm: "Het bewaken van ...", "Het begeleiden van ..." |
| `body` (archief) | meerdere paragrafen | Verhalend, met structuur via headings |

### Rol-frasering: niet elke keer "Lead Glocal"

De drie rollen staan onder elkaar op de project-pagina. Als ze alle drie met "Lead Glocal ..." beginnen, wordt het eentonig. Gebruik daarom de **gerund-vorm** ("Het [werkwoord]en van ...") die de werkzaamheid zelf beschrijft.

**Goed (gevarieerd, gerund):**
> **Architect** — Het ontwerpen van de structuur waarbinnen ondernemers, onderwijs en overheid samenwerken aan de energietransitie.
> **Bouwer** — Het bijeenbrengen van partijen en het inrichten van de samenwerking zodat losse initiatieven als geheel gaan functioneren.
> **Facilitator** — Het bewaken van de groei van het platform en zorgen dat STROOM blijft functioneren als zelfstandig, lerend ecosysteem.

**Niet goed (repetitief):**
> Lead Glocal ontwierp ... / Lead Glocal bracht ... / Lead Glocal bewaakt ...

**Ook niet goed (superlatieven):**
> Wij hebben met onze unieke aanpak een baanbrekend nieuw platform geleverd dat de energietransitie een enorme boost heeft gegeven.

---

## 11. Wat de importeur (de andere Claude) gaat doen

Voor de duidelijkheid van beide partijen — dit is wat er ná oplevering van de folder gebeurt:

1. **Folder inlezen.** De importeur leest de hele `lead-glocal-cms/` folder, identificeert per collectie de project-folders.
2. **Validatie.** Voor elk project: check verplichte velden, validate types (lengte, format URL, slug-regels, Vimeo-thumbnail aanwezig indien Vimeo aan).
3. **Asset upload.** Per project: upload alle afbeeldingen via Webflow's `data_assets_tool`. Wacht op file-IDs.
4. **Highlights eerst.** Highlights worden aangemaakt vóór Projecten, zodat de MultiReference vanaf Projecten naar bestaande Highlight-IDs kan wijzen.
5. **Items aanmaken.** Per item: `create_collection_items` met alle velden ingevuld. Status: **draft** (`isDraft: true`) — items komen niet automatisch live.
6. **Rapportage.** Aan het einde een overzicht: hoeveel items aangemaakt, hoeveel skipped (met reden), welke validatie-errors.
7. **Publish is handmatig.** Niemand pusht automatisch live. De eindredactie gebeurt in Webflow door iemand met toegang.

**Belangrijk voor de importeur:** Probeer **nooit** velden te raden of in te vullen die niet in de markdown staan. Bij ambiguïteit → skippen en rapporteren, niet improviseren.

---

## 12. Quality checklist (voor de content-producer)

Voor je oplevert, controleer per project:

- [ ] Folder-naam komt exact overeen met `slug` in frontmatter.
- [ ] Alle verplichte velden zijn gevuld (`null` mag alleen waar optioneel).
- [ ] `omschrijvende_zin` is ≤ 135 tekens.
- [ ] `uitdaging` is tussen 20 en 140 tekens.
- [ ] `architect`, `bouwer`, `facilitator` zijn elk één zin en ≤ 135 tekens.
- [ ] `meer_over_dit_project` begint met `https://` of `http://`.
- [ ] `hero_afbeelding` bestand bestaat in de folder en is een geldig formaat.
- [ ] `logo_avatar` (alleen Projecten) bestand bestaat en is bij voorkeur transparant PNG.
- [ ] `highlights`, `coordinaat_voor_kaart_positie` en alle Vimeo-velden staan op `null` (mens-werk, sectie 2.5) — `heeft_vimeo_link: false`.
- [ ] Geen `/highlights/`-folder aangemaakt (mens-werk).
- [ ] Slug bevat alleen kleine letters, cijfers, streepjes.
- [ ] YAML-frontmatter is valid (geen tabs voor indent, geen ontbrekende quotes bij speciale tekens).
- [ ] Voor archief: body bevat geen tabellen, code-blocks, of complexe HTML.
- [ ] Rol-velden (architect/bouwer/facilitator) zijn gerund-frases, beginnen niet met "Lead Glocal".

---

## 13. Wat je NIET moet doen

Een lijst van fouten die het hele import-proces kunnen breken of het design kapotmaken:

- **Geen onbekende veldnamen toevoegen** in de frontmatter. De importeur kent alleen de velden uit deze guide. Onbekende velden worden genegeerd, maar zorgen voor verwarring en tijdverlies.
- **Geen Markdown body schrijven bij Projecten of Highlights.** Alleen archief heeft een body. Bij Projecten en Highlights staat alles in de frontmatter.
- **Geen relatieve of absolute paden in image-referenties.** Alleen bestandsnaam (`hero.jpg`), niet `./hero.jpg` of `/path/to/hero.jpg`.
- **Geen UTF-8 BOM of windows line endings** in markdown-bestanden. Gebruik LF-line-endings, UTF-8 zonder BOM.
- **Geen content verzinnen.** Als je voor een project geen écht beeldmateriaal of geen waarheidsgetrouwe tekst hebt, lever dat project dan niet aan. Half ingevulde projecten leveren een slechte site op.
- **Nooit emoji's of smileys.** Niet in `name`, niet in `slug`, niet in `omschrijvende_zin`, niet in de rol-velden, en niet in de archief-body. Nergens. Geen enkele uitzondering.
- **Geen Vimeo-, highlight- of kaartcoördinaat-waarden invullen.** Dit is mens-werk (sectie 2.5). Houd ze op `null` / `false`.
- **Geen rol-velden die met "Lead Glocal" beginnen.** Gebruik de gerund-vorm (sectie 10).
- **Geen `featured: true` zonder reden.** Te veel featured-projecten verwatert de homepagina.

---

## 14. Snelreferentie: veldnaam-mapping naar Webflow

Voor de importeur — exacte mapping van frontmatter-veldnaam naar Webflow CMS slug:

### Projecten (`69ea2a73c9ca9a72c1213dcc`)

| Frontmatter | Webflow slug | Type |
|---|---|---|
| `name` | `name` | PlainText |
| `slug` | `slug` | PlainText |
| `omschrijvende_zin` | `omschrijvende-zin` | PlainText |
| `hero_afbeelding` | `hero-afbeelding` | Image |
| `logo_avatar` | `logo-avatar` | Image |
| `uitdaging` | `uitdaging` | PlainText |
| `meer_over_dit_project` | `meer-over-dit-project` | Link |
| `architect` | `architect` | PlainText |
| `bouwer` | `bouwer` | PlainText |
| `facilitator` | `manager` ⚠️ | PlainText |
| `featured` | `featured` | Switch |
| `featured_priority` | `featured-priority` | Switch |
| `highlights` | `highlights` | MultiReference |
| `coordinaat_voor_kaart_positie` | `coordinaat-voor-kaart-positie` | Number |
| `heeft_vimeo_link` | `heeft-vimeo-link` | Switch |
| `vimeo_video_id` | `vimeo-video-id` | PlainText |
| `vimeo_thumbnail` | `vimeo-thumbnail` | Image |

### Archief Projecten (`69fd9ed34388a1d1d49d41bb`)

| Frontmatter | Webflow slug | Type |
|---|---|---|
| `name` | `name` | PlainText |
| `slug` | `slug` | PlainText |
| `omschrijvende_zin` | `omschrijvende-zin` | PlainText |
| `hero_afbeelding` | `hero-afbeelding` | Image |
| `meer_over_dit_project` | `meer-over-dit-project` | Link |
| `body` (markdown body) | `body` | RichText |
| `heeft_vimeo_link` | `vimeo-video-player-zichtbaarheid` ⚠️ | Switch |
| `vimeo_video_id` | `vimeo-video-id` | PlainText |
| `vimeo_thumbnail` | `vimeo-video-thumbnail` ⚠️ | Image |

### Highlights (`69ea2cde9c03cd55ab43e9a5`)

| Frontmatter | Webflow slug | Type |
|---|---|---|
| `name` | `name` | PlainText |
| `slug` | `slug` | PlainText |
| `afbeelding` | `afbeelding` | Image |

**Let op de ⚠️-markeringen**: de Webflow-veldnaam wijkt af van de logische naam. De importeur moet de frontmatter-naam vertalen naar de juiste Webflow slug.

---

## 15. Site- en collectie-ID's voor de importeur

Voor de importeur staat hier alvast de info die nodig is voor de Webflow MCP-calls. Zo hoeft die niet eerst te zoeken.

- **Site ID:** `69df906aaf5c49f620117493`
- **Site naam:** Lead Glocal
- **Collectie Projecten ID:** `69ea2a73c9ca9a72c1213dcc`
- **Collectie Archief Projecten ID:** `69fd9ed34388a1d1d49d41bb`
- **Collectie Highlights ID:** `69ea2cde9c03cd55ab43e9a5`
- **Collectie Thema's ID:** `69ea2a6921e841b54c74bee1` (alleen-lezen voor deze import)
- **Primaire locale:** Dutch (Netherlands), `nl-NL` (cmsLocaleId: `69ea2a696be55b1cdf878208`)

---

## 16. Versie en wijzigingen

- **Versie:** 1.0
- **Schema gecontroleerd op:** Webflow CMS van Lead Glocal site (`69df906aaf5c49f620117493`), live-state van de import-datum.

Als de Webflow CMS-schema wijzigt (nieuwe velden, hernoemde velden, gewijzigde validaties), moeten zowel deze guidelines als de geproduceerde markdown opnieuw worden geverifieerd. Doe geen import zonder eerst sectie 14 te checken tegen de live CMS-state.
