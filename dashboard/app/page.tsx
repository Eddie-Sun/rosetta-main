import Link from "next/link";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DemoRosettaWindow } from "@/components/DemoRosettaWindow";

function Container({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto w-full max-w-6xl px-6">{children}</div>;
}

function Section({
  children,
  className = "",
  ...props
}: {
  children: React.ReactNode;
  className?: string;
} & React.ComponentProps<"section">) {
  return (
    <section {...props} className={`bg-background text-foreground ${className}`}>
      {children}
    </section>
  );
}

function Logo() {
  return (
    <Link
      href="/"
      aria-label="Homepage"
      className="relative inline-flex items-center leading-none"
    >
      <span className="text-[16px] font-semibold tracking-tight">Rosetta</span>
    </Link>
  );
}

export default function Home() {
  const logos = [
    { name: "Stripe", src: "https://ptht05hbb1ssoooe.public.blob.vercel-storage.com/assets/logos/stripe-logo.svg" },
    { name: "OpenAI", src: "https://ptht05hbb1ssoooe.public.blob.vercel-storage.com/assets/logos/openai-logo.svg" },
    { name: "Linear", src: "https://ptht05hbb1ssoooe.public.blob.vercel-storage.com/assets/logos/linear-logo.svg" },
    { name: "Datadog", src: "https://ptht05hbb1ssoooe.public.blob.vercel-storage.com/assets/logos/datadog-logo.svg" },
    { name: "NVIDIA", src: "https://ptht05hbb1ssoooe.public.blob.vercel-storage.com/assets/logos/nvidia-logo.svg" },
    { name: "Figma", src: "https://ptht05hbb1ssoooe.public.blob.vercel-storage.com/assets/logos/figma-logo.svg" },
    { name: "Ramp", src: "https://ptht05hbb1ssoooe.public.blob.vercel-storage.com/assets/logos/ramp-logo.svg" },
    { name: "Adobe", src: "https://ptht05hbb1ssoooe.public.blob.vercel-storage.com/assets/logos/adobe-logo.svg" },
  ];

  const quotes = [
    {
      quote:
        "It was night and day from one batch to another, adoption went from single digits to over 80%. It just spread like wildfire.",
      name: "Diana Hu",
      title: "General Partner, Y Combinator",
    },
    {
      quote:
        "The most useful AI tool that I currently pay for, hands down, is Cursor. It's fast, autocompletes when and where you need it to.",
      name: "shadcn",
      title: "Creator of shadcn/ui",
    },
    {
      quote:
        "The best LLM applications have an autonomy slider: you control how much independence to give the AI.",
      name: "Andrej Karpathy",
      title: "CEO, Eureka Labs",
    },
    {
      quote:
        "Cursor quickly grew from hundreds to thousands of extremely enthusiastic Stripe employees.",
      name: "Patrick Collison",
      title: "Co‑Founder & CEO, Stripe",
    },
    {
      quote: "It's official. I hate vibe coding. I love Cursor tab coding. It's wild.",
      name: "ThePrimeagen",
      title: "@ThePrimeagen",
    },
    {
      quote:
        "It's definitely becoming more fun to be a programmer. It's less about digging through pages and more about what you want to happen.",
      name: "Greg Brockman",
      title: "President, OpenAI",
    },
  ];

  return (
    <>
      <main>
        {/* Hero */}
        <Section className="pt-10">
          <Container>
            <div className="max-w-2xl">
              <h1 className="text-balance text-[26px] leading-tight font-semibold tracking-tight">
                Built to make your site visible to AI, Rosetta serves clean Markdown to crawlers—without changing your human HTML.
              </h1>
              <div className="mt-5 flex items-center gap-3">
                <Button variant="outline" asChild>
                  <Link href="/onboarding">See it in action</Link>
                </Button>
              </div>
            </div>

            <div className="mt-8 card card--media">
              <DemoRosettaWindow />
            </div>
          </Container>
        </Section>

        {/* Logo garden */}
        <Section className="py-14" aria-label="Logo garden">
          <Container>
            <div className="text-center">
              <h2 className="text-[14px] font-semibold tracking-tight">
                Trusted every day by millions of professional developers.
              </h2>
            </div>
            <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
              {logos.map((l) => (
                <div
                  key={l.name}
                  className="card card--has-logo flex h-[4rem] items-center justify-center sm:h-[4.5rem] md:h-[6.25rem]"
                >
                  <Image
                    alt={l.name}
                    src={l.src}
                    width={200}
                    height={64}
                    className="h-8 w-auto opacity-90"
                    unoptimized
                  />
                </div>
              ))}
            </div>
          </Container>
        </Section>

        {/* Feature blocks */}
        <Section id="features" className="py-10">
          <Container>
            <div className="grid gap-6">
              <Card className="card--large">
                <div className="grid gap-6 lg:grid-cols-[1fr_1.4fr] lg:items-center">
                  <div>
                    <div className="text-[16px] font-semibold">Agent turns ideas into code</div>
                    <div className="mt-2 text-[16px] text-muted-foreground">
                      A human‑AI programmer, orders of magnitude more effective than any developer alone.
                    </div>
                    <div className="mt-5">
                      <Link className="text-accent hover:underline underline-offset-4" href="/features#agent">
                        Learn about Agent →
                      </Link>
                    </div>
                  </div>
                  <div className="border border-border bg-muted h-[260px]" />
                </div>
              </Card>

              <Card className="card--large">
                <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr] lg:items-center">
                  <div className="border border-border bg-muted h-[260px]" />
                  <div>
                    <div className="text-[16px] font-semibold">Magically accurate autocomplete</div>
                    <div className="mt-2 text-[16px] text-muted-foreground">
                      Our custom Tab model predicts your next action with striking speed and precision.
                    </div>
                    <div className="mt-5">
                      <Link className="text-accent hover:underline underline-offset-4" href="/features#tab">
                        Learn about Tab →
                      </Link>
                    </div>
                  </div>
                </div>
              </Card>

              <Card className="card--large">
                <div className="grid gap-6 lg:grid-cols-[1fr_1.4fr] lg:items-center">
                  <div>
                    <div className="text-[16px] font-semibold">Everywhere software gets built</div>
                    <div className="mt-2 text-[16px] text-muted-foreground">
                      Rosetta is in GitHub reviewing your PRs, a teammate in Slack, and anywhere else you work.
                    </div>
                    <div className="mt-5">
                      <Link className="text-accent hover:underline underline-offset-4" href="/features#ecosystem">
                        Learn about Rosetta&apos;s ecosystem →
                      </Link>
                    </div>
                  </div>
                  <div className="border border-border bg-muted h-[260px]" />
                </div>
              </Card>
            </div>
          </Container>
        </Section>

        {/* Quotes */}
        <Section className="py-14">
          <Container>
            <div className="text-center">
              <h2 className="text-balance text-[26px] leading-tight font-semibold">
                The new way to build software.
              </h2>
            </div>
            <div className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {quotes.map((q) => (
                <Card key={q.name}>
                  <div className="text-[16px] leading-relaxed">{q.quote}</div>
                  <div className="mt-6 flex items-center gap-3">
                    <div className="h-10 w-10 border border-border bg-muted" aria-hidden="true" />
                    <div className="text-[14px]">
                      <div className="font-semibold">{q.name}</div>
                      <div className="text-muted-foreground">{q.title}</div>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </Container>
        </Section>

        {/* Changelog */}
        <Section className="py-14 bg-muted">
          <Container>
            <h2 className="text-[26px] leading-tight font-semibold">Changelog</h2>
            <div className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              {[
                { v: "2.2", date: "Dec 10, 2025", title: "Debug Mode, Plan Mode Improvements, Multi-Agent Judging, and Pinned Chats" },
                { v: "2.1", date: "Nov 21, 2025", title: "Improved Plan Mode, AI Code Review in Editor, and Instant Grep" },
                { v: "2.0", date: "Oct 29, 2025", title: "New Coding Model and Agent Interface" },
                { v: "1.7", date: "Sep 29, 2025", title: "Browser Controls, Plan Mode, and Hooks" },
              ].map((c) => (
                <Card key={c.v} className="card--text">
                  <div className="flex items-center gap-3 text-muted-foreground text-[14px]">
                    <span className="border border-border bg-background px-2 py-0.5 text-foreground">
                      {c.v}
                    </span>
                    <span>{c.date}</span>
                  </div>
                  <div className="mt-3 text-[16px]">{c.title}</div>
                </Card>
              ))}
            </div>
            <div className="mt-6">
              <Link className="text-accent hover:underline underline-offset-4" href="/changelog">
                See what&apos;s new in Rosetta →
              </Link>
            </div>
          </Container>
        </Section>

        {/* Final CTA */}
        <Section className="py-16">
          <Container>
            <div className="text-center">
              <h2 className="text-balance text-[32px] leading-tight font-semibold">Try Rosetta now.</h2>
              <div className="mt-6 flex justify-center gap-3">
                <Button asChild>
                  <Link href="/download">Download for macOS</Link>
                </Button>
                <Button variant="outline" asChild>
                  <Link href="/agents">Try mobile agent</Link>
                </Button>
              </div>
            </div>
          </Container>
        </Section>

        {/* Footer */}
        <footer className="bg-card py-12">
          <Container>
            <div className="grid gap-10 md:grid-cols-5">
              <div className="md:col-span-2">
                <div className="text-[14px] font-semibold text-muted-foreground">Rosetta</div>
                <div className="mt-3 text-[14px] text-muted-foreground">
                  © {new Date().getFullYear()} Rosetta
                </div>
              </div>
              {[
                {
                  title: "Product",
                  links: ["Features", "Enterprise", "Web Agents", "Bugbot", "CLI", "Pricing"],
                },
                { title: "Resources", links: ["Download", "Changelog", "Docs", "Learn", "Forum", "Status"] },
                { title: "Company", links: ["Careers", "Blog", "Community", "Workshops", "Students", "Brand"] },
              ].map((col) => (
                <div key={col.title}>
                  <div className="text-[14px] font-semibold text-muted-foreground">{col.title}</div>
                  <ul className="mt-3 space-y-2 text-[14px]">
                    {col.links.map((t) => (
                      <li key={t}>
                        <a className="text-muted-foreground hover:text-foreground" href="#">
                          {t}
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </Container>
        </footer>
      </main>
    </>
  );
}
