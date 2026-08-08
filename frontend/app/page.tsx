import { Hero } from "./components/home/hero";
import { BonusOffers } from "./components/home/bonus-offers";
import { PromoBlocks } from "./components/home/promo-blocks";
import { GamesShowcase } from "./components/home/games-showcase";
import { Features } from "./components/home/features";
import { Faq } from "./components/home/faq";
import { SiteFooter } from "./components/home/site-footer";

export default function Home() {
  return (
    <main className="juwa">
      <Hero />
      <BonusOffers />
      <PromoBlocks />
      <GamesShowcase />
      <Features />
      <Faq />
      <SiteFooter />
    </main>
  );
}
