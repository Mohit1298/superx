/** Demo members so dispatch and matching have something to work with. */
import { getOrCreateUser, updateProfile } from "./db.js";

const DEMO = [
  {
    phone: "15550001001",
    name: "Priya Shah",
    role: "Freelance brand designer",
    location: "Toronto",
    area: "Annex, Toronto",
    earn_with: "design work, logo packages, small errands near the Annex",
    availability: "weekdays after 3pm, weekends",
    bio: "Ex-Shopify designer. Rebranded three seed-stage startups.",
    skills: "brand identity, logo design, Figma, web design",
    offers: "design sprints, portfolio reviews",
    needs: "referrals to early-stage founders",
  },
  {
    phone: "15550001002",
    name: "Marcus Lee",
    role: "ML engineer",
    location: "Toronto",
    area: "Liberty Village, Toronto",
    earn_with: "tutoring (math, Python), ML consulting, dog walking",
    availability: "evenings and weekends",
    bio: "Builds recommender systems by day, hacks on agents by night.",
    skills: "Python, PyTorch, RAG, recommender systems",
    offers: "ML architecture reviews, mock interviews",
    needs: "co-founder ideas in agentic commerce",
  },
  {
    phone: "15550001003",
    name: "Dana Okafor",
    role: "Startup lawyer",
    location: "Toronto",
    area: "King West, Toronto",
    earn_with: "legal consults, contract reviews",
    availability: "weekday lunch hours",
    bio: "Incorporations, SAFEs, and employment agreements for early-stage companies.",
    skills: "incorporation, SAFE notes, contracts, privacy compliance",
    offers: "free 20-min consults for members",
    needs: "founder clients",
  },
  {
    phone: "15550001004",
    name: "Tomás Rivera",
    role: "Home chef",
    location: "Toronto",
    area: "Kensington Market, Toronto",
    earn_with: "meal drops, catering, grocery runs (I'm at the market daily anyway)",
    availability: "mornings and Sundays",
    bio: "Pop-up dinners and small-event catering. Michelin-trained, taco-obsessed.",
    skills: "catering, meal prep, menu design",
    offers: "event catering, weekly meal drops",
    needs: "event gigs, a food photographer",
  },
  {
    phone: "15550001005",
    name: "Amara Chen",
    role: "Growth marketer",
    location: "Waterloo",
    area: "Uptown Waterloo",
    earn_with: "growth audits, campus deliveries by bike",
    availability: "flexible, works remote",
    bio: "Took two B2B SaaS products from 0 to $1M ARR.",
    skills: "growth loops, paid ads, SEO, lifecycle email",
    offers: "growth audits, GTM strategy sessions",
    needs: "fractional CMO gigs",
  },
  {
    phone: "15550001006",
    name: "Yusuf Ali",
    role: "Student, part-time courier",
    location: "Toronto",
    area: "Harbord Village / UofT campus, Toronto",
    earn_with: "grocery runs, deliveries, moving help, line-standing — anything on a bike",
    availability: "most days after class (3pm+), all weekend",
    bio: "UofT student with a cargo bike, knows every shortcut downtown.",
    skills: "ops, logistics, student markets",
    offers: "UofT student network access",
    needs: "steady gig income, a startup lawyer someday",
  },
];

export async function seedDemoMembers(): Promise<number> {
  for (const m of DEMO) {
    const u = await getOrCreateUser(m.phone);
    await updateProfile(u.id, m);
  }
  return DEMO.length;
}

// Allow `npm run seed`
if (process.argv[1]?.endsWith("seed.ts")) {
  const n = await seedDemoMembers();
  console.log(`Seeded ${n} demo members.`);
  const { closeDb } = await import("./db.js");
  await closeDb();
}
