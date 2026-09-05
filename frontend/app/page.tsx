import { Hero } from "./components/home/hero";
import { BonusOffers } from "./components/home/bonus-offers";
import { PlinkoCard } from "./components/home/plinko-card";
import { PromoBlocks } from "./components/home/promo-blocks";
import { Features } from "./components/home/features";
import { Faq } from "./components/home/faq";
import { SiteFooter } from "./components/home/site-footer";

export default function Home() {
  return (
    <main className="juwa">
      <Hero />
      <BonusOffers />
      <PlinkoCard />
      <PromoBlocks />
      <Features />
      <Faq />
      <SiteFooter />
    </main>
  );
}
