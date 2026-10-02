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
          Procenta musí dohromady dát přesně 100. Listiny nebo kandidáty, které nevyplníte, počítáme jako 0 %.
          Tipovat můžete v libovolném počtu obcí a obvodů.
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="font-heading text-lg font-semibold">Do kdy</h2>
        <p>
          Tip můžete odeslat i měnit do otevření volebních místností
          {config ? `, tedy do: ${formatDeadline(config.deadline)}` : ""}. Tip začne platit, až ho potvrdíte odkazem
          z e-mailu. Do uzávěrky nikdo cizí tipy nevidí, potom se zveřejní pod přezdívkami.
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
          Ukládáme váš e-mail, přezdívku a tipy. E-mail slouží jen k potvrzení tipu a k přihlášení, nikde ho
          nezobrazujeme a nikomu ho nepředáváme. Účet včetně všech tipů můžete kdykoli smazat na stránce Moje tipy.
        </p>
      </section>
    </article>
  )
}
