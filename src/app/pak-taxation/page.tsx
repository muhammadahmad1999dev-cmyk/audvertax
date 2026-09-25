import Link from "next/link";
import { ArrowRight, ArrowUpRight } from "lucide-react";

import { Card, SectionLabel } from "@/components/ui/design-system";
import { serviceCatalog } from "@/lib/services";

const taxationServices = serviceCatalog
  .filter(
    (service) =>
      service.slug.startsWith("pak-") &&
      (service.category === "tax-compliance" || service.category === "business"),
  )
  .map((service) => ({
    slug: service.slug,
    name: service.name,
    price: service.price ?? 0,
    description: service.shortDescription || service.description,
  }));

export default function Page() {
  return (
    <main className="fm-page overflow-hidden">
      <section className="fm-page-hero relative isolate overflow-hidden border-b border-[var(--fm-border)] bg-[linear-gradient(135deg,var(--fm-graphite-deep)_0%,var(--fm-graphite)_100%)] px-5 text-[var(--fm-text-primary)] sm:px-8">
        <div className="fm-page-hero-grid" />
        <div className="fm-page-container relative z-[1]">
          <Link
            href="/services"
            className="inline-flex items-center gap-2 font-mono text-[11px] font-bold uppercase tracking-[.08em] text-[var(--fm-lime)] transition-[transform,color] duration-[var(--fm-motion-micro)] ease-[var(--fm-motion-ease)] hover:-translate-x-1 hover:text-[var(--fm-lime-bright)]"
          >
            <span aria-hidden="true">←</span> All services
          </Link>

          <div className="fm-page-hero-grid-layout mt-14">
            <div className="fm-page-hero-copy">
              <SectionLabel>Pakistan / Taxation</SectionLabel>
              <h1 className="fm-page-hero-title max-w-[11ch]">Pakistan taxation services.</h1>
              <p className="fm-page-hero-description max-w-[680px]">
                Choose the Pakistan tax service that matches your filing, registration, or
                compliance requirement.
              </p>
            </div>

            <div className="hidden lg:block" />
          </div>
        </div>
      </section>

      <section className="fm-page-section bg-[var(--fm-graphite-deep)] px-5 text-[var(--fm-text-primary)] sm:px-8">
        <div className="fm-page-container">
          <div className="mb-10">
            <SectionLabel>Tax / Compliance</SectionLabel>
            <h2 className="fm-page-section-heading mt-4 max-w-[760px]">
              Choose a taxation service.
            </h2>
          </div>

          <div className="grid grid-cols-1 gap-fm-4 md:grid-cols-2 xl:grid-cols-3">
            {taxationServices.map((item, index) => (
              <Link key={item.slug} href={`/${item.slug}`} className="group block">
                <Card
                  variant="interactive"
                  tone="default"
                  className="flex h-full min-h-[330px] flex-col items-start p-7 sm:p-8"
                >
                  <div className="flex w-full items-center justify-between">
                    <span className="font-mono text-[10px] font-bold tracking-[.16em] text-[var(--fm-lime-bright)]">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <ArrowUpRight className="size-4 text-[var(--fm-text-tertiary)] transition duration-[var(--fm-motion-micro)] ease-[var(--fm-motion-ease)] group-hover:-translate-y-1 group-hover:translate-x-1 group-hover:text-[var(--fm-lime-bright)]" />
                  </div>

                  <h3 className="mt-8 max-w-[260px] font-display text-2xl font-bold tracking-[-.04em] text-[var(--fm-card-text)] sm:text-3xl">
                    {item.name}
                  </h3>

                  <p className="mt-4 text-[15px] leading-7 text-[var(--fm-card-muted)]">
                    {item.description}
                  </p>

                  <div className="mt-7 font-display text-4xl font-extrabold tracking-[-.04em] text-[var(--fm-card-text)]">
                    PKR {item.price.toLocaleString()}
                  </div>

                  <span className="mt-auto inline-flex items-center gap-2 pt-8 text-sm font-bold text-[var(--fm-lime-bright)]">
                    View service <ArrowRight className="size-4 transition-transform duration-[var(--fm-motion-micro)] ease-[var(--fm-motion-ease)] group-hover:translate-x-1" />
                  </span>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}