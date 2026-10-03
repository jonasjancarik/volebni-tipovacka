export interface RacePlacing {
  id: string
  name: string
  /** How many people tipped this race. */
  tips: number
  rank: number
  error: number
  weightedRank: number
  weightedError: number
}

const points = (n: number) =>
  `${n.toLocaleString("cs-CZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} p. b.`

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]!)

/** The e-mail a tipper asked for: where they finished in both rankings of every race they tipped. */
export function buildResultEmail(nickname: string, origin: string, races: RacePlacing[]) {
  const subject = races.length === 1 ? `Jak dopadl váš tip: ${races[0].name}` : "Jak dopadly vaše tipy"
  const rules = `${origin}/pravidla`
  const farewell =
    "Tímto e-mailem jsme vaši adresu smazali. Zůstal nám jen její kryptografický otisk, podle kterého vás poznáme při příštím přihlášení."
  const text = [
    "Dobrý den,",
    "",
    `hlasy jsou sečtené. Tipovali jste pod přezdívkou ${nickname} a dopadli jste takto:`,
    "",
    ...races.flatMap((r) => [
      r.name,
      `Hlavní pořadí: ${r.rank}. místo z ${r.tips}, průměrná odchylka ${points(r.error)}`,
      `Vážené pořadí: ${r.weightedRank}. místo z ${r.tips}, vážená odchylka ${points(r.weightedError)}`,
      `${origin}/tip/${r.id}`,
      "",
    ]),
    "Hlavní pořadí se řídí průměrnou odchylkou v procentních bodech. Ve váženém pořadí se omyly u menších listin počítají víc.",
    `Podrobnosti najdete v pravidlech: ${rules}`,
    "",
    farewell,
    "",
    "Volební tipovačka",
  ].join("\n")

  const font = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif"
  const label = "font-size:12px;letter-spacing:.8px;text-transform:uppercase;color:#8a8a85;"
  const cards = races
    .map(
      (
        r
      ) => `<tr><td style="padding:0 32px 16px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f6f4;border-radius:12px;">
<tr><td colspan="2" style="padding:16px 20px 12px;font-size:18px;font-weight:600;"><a href="${origin}/tip/${encodeURIComponent(r.id)}" style="color:#111111;text-decoration:none;">${escapeHtml(r.name)}</a></td></tr>
<tr><td style="padding:12px 20px 16px;border-top:1px solid #e7e7e3;width:50%;vertical-align:top;"><div style="${label}">Hlavní pořadí</div>
<div style="font-size:18px;font-weight:600;color:#111111;">${r.rank}. místo z ${r.tips}</div><div style="font-size:14px;color:#4b4b47;">odchylka ${points(r.error)}</div></td>
<td style="padding:12px 20px 16px;border-top:1px solid #e7e7e3;width:50%;vertical-align:top;"><div style="${label}">Vážené pořadí</div>
<div style="font-size:18px;font-weight:600;color:#111111;">${r.weightedRank}. místo z ${r.tips}</div><div style="font-size:14px;color:#4b4b47;">odchylka ${points(r.weightedError)}</div></td></tr>
</table></td></tr>`
    )
    .join("\n")
  const html = `<!doctype html>
<html lang="cs"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#ecece8;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ecece8;padding:32px 12px;">
<tr><td align="center" style="font-family:${font};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;">
<tr><td style="padding:0 4px 16px;font-family:${font};font-size:15px;font-weight:700;color:#111111;letter-spacing:.2px;">
<span style="display:inline-block;width:22px;height:22px;line-height:22px;text-align:center;background:#111111;color:#ffffff;border-radius:6px;font-size:13px;margin-right:8px;">&#10003;</span>Volební tipovačka</td></tr>
<tr><td style="background:#ffffff;border-radius:16px;border:1px solid #e0e0db;font-family:${font};color:#1f1f1d;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
<tr><td style="padding:36px 32px 12px;font-size:26px;line-height:1.25;font-weight:700;color:#111111;">${escapeHtml(subject)}</td></tr>
<tr><td style="padding:0 32px 24px;font-size:16px;line-height:1.6;color:#4b4b47;">Dobrý den, hlasy jsou sečtené. Tipovali jste pod přezdívkou <strong style="color:#111111;">${escapeHtml(nickname)}</strong>.</td></tr>
${cards}
<tr><td style="padding:8px 32px 32px;font-size:14px;line-height:1.6;color:#4b4b47;">
Hlavní pořadí se řídí průměrnou odchylkou v procentních bodech. Ve váženém pořadí se omyly u menších listin počítají víc. Podrobnosti najdete v <a href="${rules}" style="color:#111111;font-weight:600;">pravidlech</a>.</td></tr>
</table></td></tr>
<tr><td style="padding:20px 8px 0;font-family:${font};font-size:12px;line-height:1.6;color:#8a8a85;">${farewell}</td></tr>
</table>
</td></tr></table>
</body></html>`
  return { subject, text, html }
}
