import { useConfig } from "@/App"
import { formatDeadline } from "@/lib/api"

export function Rules() {
  const { config } = useConfig()
  return (
    <article className="flex flex-col gap-6 pt-6 leading-relaxed">
      <h1 className="font-heading text-2xl font-semibold">Pravidla</h1>

      <section className="flex flex-col gap-2">
        <h2 className="font-heading text-lg font-semibold">Co se tipuje</h2>
        <p>
          U komunálních voleb odhadujete, kolik procent hlasů získá každá kandidátní listina ve vybrané obci, městě
          nebo městské části. U senátních voleb odhadujete procenta kandidátů v prvním kole a k tomu vybíráte, kdo se
          nakonec stane senátorem. V obou případech přidáte i svůj odhad volební účasti.
        </p>
        <p>
          Nemusíte vyplnit každou listinu nebo kandidáta. Stačí odhad u těch, na kterých vám záleží, a zbytek do
          100 % se rovným dílem rozdělí mezi nevyplněné. Když například pěti listinám dáte dohromady 88 % a dalších
          šest necháte prázdných, každá z nich dostane 2 %. Součet nesmí přesáhnout 100 %. Tipovat můžete
          v libovolném počtu obcí a obvodů.
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="font-heading text-lg font-semibold">Do kdy</h2>
        <p>
          Tip můžete odeslat i měnit do otevření volebních místností
          {config ? `, tedy do: ${formatDeadline(config.deadline)}` : ""}. Tip začne platit, až ho potvrdíte odkazem
          z e-mailu. Rozepsaný tip si váš prohlížeč pamatuje, takže se k němu můžete vrátit i po zavření stránky.
          Do uzávěrky nikdo cizí tipy nevidí, potom se zveřejní pod přezdívkami.
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="font-heading text-lg font-semibold">Jak se vyhodnocuje</h2>
        <p>
          U každé listiny nebo kandidáta spočítáme, o kolik procentních bodů jste se spletli, a z těchto rozdílů
          uděláme průměr. Čím nižší průměrná odchylka, tím lepší umístění. Při shodě rozhoduje přesnější odhad
          volební účasti. U senátních voleb navíc v pořadí ukazujeme, kdo správně určil vítěze.
        </p>
        <p>
          Výsledky přebíráme z průběžně zveřejňovaných dat Českého statistického úřadu, takže se pořadí během sčítání
          mění. Konečné je po sečtení všech okrsků.
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="font-heading text-lg font-semibold">Vaše údaje</h2>
        <p>
          Ukládáme vaše tipy a přezdívku, kterou vám při prvním tipu náhodně přidělíme a kterou najdete
          v potvrzovacím e-mailu. E-mailovou adresu použijeme jen k odeslání odkazu, kterým tip potvrdíte
          nebo se přihlásíte, a potom ji zahodíme. V databázi zůstává pouze její otisk, ze kterého adresu nejde
          zpětně přečíst a podle kterého vás při příštím přihlášení poznáme. Z toho plyne, že vám nemůžeme sami
          napsat, ani kdybyste vyhráli. Účet včetně všech tipů můžete kdykoli smazat na stránce Moje tipy.
        </p>
      </section>
    </article>
  )
}
