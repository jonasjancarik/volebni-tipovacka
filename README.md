# Volební tipovačka

Tipovací web pro komunální a senátní volby 9.–10. října 2026. Návštěvník si najde svou obec nebo senátní obvod,
odhadne procenta kandidátních listin (u Senátu kandidátů a vítěze) a volební účast. Po uzavření volebních místností
se výsledky stahují z otevřených dat ČSÚ a u každé obce vzniká pořadí tipujících.

## Jak to funguje

- **Frontend:** React, Vite, Tailwind a shadcn/ui v `src/`.
- **API:** Hono na Cloudflare Workers v `worker/`, data v D1 (`migrations/`).
- **Kandidátky:** registry ČSÚ v `data/csu/` (stav k 23. 9. 2026 pro obce a 15. 9. 2026 pro Senát),
  `pnpm seed:build` z nich vyrobí `seed/seed.sql`.
- **Přihlášení:** bez hesla. První tip se potvrzuje odkazem z e-mailu, který zároveň přihlásí zařízení.
  Odkaz vede na stránku s potvrzovacím tlačítkem a platí jen jednou, takže ho za uživatele nepotvrdí
  poštovní server, který odkazy sám otevírá.
  E-mailové adresy se neukládají, jen jejich otisk (HMAC s tajným klíčem `EMAIL_HASH_KEY`). Klíč se nesmí
  změnit, jinak se nikdo nepřihlásí ke svým tipům.
- **Jedna schránka, jeden účet:** `jmeno+cokoli@…` se počítá jako `jmeno@…` a u Gmailu se ignorují tečky
  (`worker/email.ts`). Na jednu adresu odejde nejvýš 5 e-mailů za hodinu a může na ni čekat nejvýš
  10 nepotvrzených odkazů.
- **Uzávěrka:** `DEADLINE` ve `wrangler.jsonc` (pátek 9. 10. ve 14:00). Do té doby jsou cizí tipy skryté.
- **Výsledky:** cron každé 2 minuty od `POLLS_CLOSE` stahuje senátní feed a feedy obcí, kde někdo tipoval
  (`worker/results.ts`). Pořadí se počítá při zobrazení jako průměrná odchylka v procentních bodech,
  při shodě rozhoduje odhad účasti (`worker/scoring.ts`). Spočítané pořadí se minutu drží v paměti.

- **Návštěvnost:** bez cookies a bez identifikátorů návštěvníků. Stránka po každém zobrazení zavolá
  `POST /api/view` a v tabulce `page_views` se zvýší denní součet pro danou stránku a odkazující web
  (`worker/telemetry.ts`). `visits` počítá zobrazení, kterými návštěva začala. IP adresa ani prohlížeč se
  neukládají, takže počet unikátních lidí zjistit nejde.

Vynechaný je Lišov, jediná obec rozdělená na více volebních obvodů, a jedna obec bez kandidátní listiny.

## Vývoj

```bash
pnpm install
pnpm seed:build
pnpm db:local
pnpm dev
```

S `DEV_MODE=1` v `.dev.vars` se e-maily neposílají a potvrzovací odkaz se vrátí rovnou ve stránce.
Platí to jen na vývojových adresách (`localhost`, `*.local`, `*.ts.net`); jinde se `DEV_MODE` ignoruje.
Testovací tipy a výsledky z lokální databáze smaže
`pnpm wrangler d1 execute DB --local --file scripts/reset-local.sql`.

Návštěvnost po dnech:

```bash
pnpm wrangler d1 execute DB --remote --command "SELECT day, SUM(views) AS views, SUM(visits) AS visits FROM page_views GROUP BY day ORDER BY day"
```

Kontroly: `pnpm test`, `pnpm typecheck`, `pnpm lint`.

## Nasazení

Před prvním nasazením je potřeba:

1. vytvořit databázi D1 a její ID zapsat do `wrangler.jsonc`, pak spustit migrace a nahrát `seed/seed.sql`
   s přepínačem `--remote`,
2. povolit odesílání e-mailů pro doménu, přidat do `wrangler.jsonc` binding `send_email` se jménem `EMAIL`
   a nastavit `MAIL_FROM`,
3. založit widget Turnstile, nastavit `TURNSTILE_SITE_KEY` a secret `TURNSTILE_SECRET`,
4. nastavit secret `EMAIL_HASH_KEY` na dlouhý náhodný řetězec,
5. nenastavovat `DEV_MODE`.

Bez `TURNSTILE_SECRET` produkce tipy od nepřihlášených ani přihlášení nepřijme. Bezpečnostní hlavičky
stránek jsou v `public/_headers`; kdyby web začal načítat něco z další domény, je potřeba ji tam povolit.

### Automatické nasazení

Každý push do větve `main` nasadí web sám přes Cloudflare Workers Builds. Spouštěč „Deploy main“ je
připojený k tomuto repozitáři na GitHubu a spouští `pnpm build` a `npx wrangler deploy`. Průběh sestavení
je v dashboardu Cloudflare u workeru `volebni-tipovacka` v části Builds, nebo přes
`cf builds list --external-script-id <tag workeru>`. Migrace databáze ani seed se při tom nespouštějí,
ty je potřeba pustit ručně (viz výše).

Seed nahrávejte jen před volbami: přepisuje řádky obcí včetně už stažených výsledků.
