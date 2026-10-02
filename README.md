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
- **Uzávěrka:** `DEADLINE` ve `wrangler.jsonc` (pátek 9. 10. ve 14:00). Do té doby jsou cizí tipy skryté.
- **Výsledky:** cron každé 2 minuty od `POLLS_CLOSE` stahuje senátní feed a feedy obcí, kde někdo tipoval
  (`worker/results.ts`). Pořadí se počítá při zobrazení jako průměrná odchylka v procentních bodech,
  při shodě rozhoduje odhad účasti (`worker/scoring.ts`).

Vynechaný je Lišov, jediná obec rozdělená na více volebních obvodů, a jedna obec bez kandidátní listiny.

## Vývoj

```bash
pnpm install
pnpm seed:build
pnpm db:local
pnpm dev
```

S `DEV_MODE=1` v `.dev.vars` se e-maily neposílají a potvrzovací odkaz se vrátí rovnou ve stránce.
Testovací tipy a výsledky z lokální databáze smaže
`pnpm wrangler d1 execute DB --local --file scripts/reset-local.sql`.

Kontroly: `pnpm test`, `pnpm typecheck`, `pnpm lint`.

## Nasazení

Před prvním nasazením je potřeba:

1. vytvořit databázi D1 a její ID zapsat do `wrangler.jsonc`, pak spustit migrace a nahrát `seed/seed.sql`
   s přepínačem `--remote`,
2. povolit odesílání e-mailů pro doménu, přidat do `wrangler.jsonc` binding `send_email` se jménem `EMAIL`
   a nastavit `MAIL_FROM`,
3. založit widget Turnstile, nastavit `TURNSTILE_SITE_KEY` a secret `TURNSTILE_SECRET`,
4. nenastavovat `DEV_MODE`.

Seed nahrávejte jen před volbami: přepisuje řádky obcí včetně už stažených výsledků.
