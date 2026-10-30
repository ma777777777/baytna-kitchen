# Baytna Kitchen · مطبخ بيتنا

A shared meal plan, shopping list and Lebanese recipe box for two people, as an installable phone web app (PWA) in Arabic and English.

- **Today**: tonight's dinner with an honest ingredient status, "Other ideas" (have it / missing 1–2 / 15-minute emergency), a "Too tired" mode, defrost and leftover reminders, and a snack and smoothie pick.
- **Week**: a drafted week (5 dinners, a leftovers night, a free night by default), swap any night, change servings, mark nights as takeout or away (family), then confirm.
- **Shop**: a list built from the plan. Ingredients are merged with safe unit maths and grouped by shop (khodarji, butcher, dairy…). It's split into the main shop and a midweek fresh top-up, with "check amount" when you have some but no quantity is recorded, freeze-on-purchase notes for raw meat used later, "I'll get it" claims, offline ticking and WhatsApp sharing.
- **Staples**: about 20 basics as Have / Low / Out, updated automatically when you tick items off the list, plus leftovers with use-first guidance.
- **Recipes**: 41 original recipes (23 dinners, 12 breakfasts/snacks, 6 smoothies) in both languages, Arabic/English/transliteration search, filters, scaling, cooking mode, Love / Okay / Never-again per person, your own recipes and "our version" of any recipe.

Without Supabase settings it runs as a **demo on one phone** (clearly labelled "Demo"; nothing is shared). With Supabase it's a real two-account household with live sync.

## Quick start (developers)

```bash
npm install
npm run dev            # demo mode at http://localhost:5173
npm test               # engine + sync unit tests (34)
npm run build          # production build in dist/
```

To run against Supabase, copy `.env.example` to `.env.local` and fill in the two values.

### Tests

| Command | What it checks |
| --- | --- |
| `npm test` | Planner, shopping-list merge and unit conversion, allergen/dislike filters, freeze/thaw guidance, "check amount" logic, scaling, leftovers, search, and the offline sync engine (two simulated phones, offline queue, last-write-wins). |
| `npm run test:db` | Applies the migration to a throwaway Postgres and checks security: cross-household isolation, invite expiry, single use, two-member cap, no anonymous access. Needs Postgres 16 binaries; run as a non-root user. |
| `npm run test:e2e:screens` | Demo walkthrough of every screen in English and Arabic (RTL) on an iPhone-sized viewport, failing on console errors. Needs `npm run build && npx vite preview --port 4173`. |
| `npm run test:e2e:sync` | Two real browsers against a running Supabase: email-code sign-in, create household, invite + join, live tick sync, live plan edits, offline queue and offline reload. Needs `npx supabase start` and a build pointed at it (see the script header). |

## Architecture

- React + TypeScript + Vite + Tailwind CSS, a hand-written service worker for offline use, and no UI framework beyond `lucide-react` icons.
- `src/domain`: pure, deterministic logic with no network: ingredients, recipes, planner, shopping list, suggestions, search. The app is fully useful without AI.
- `src/data/repo.ts`: an offline-first sync engine. All household data is stored as rows `(collection, key) → JSON` in a single `household_rows` table. Writes apply instantly, are queued on the device, and are pushed when online. The server stamps `updated_at`, and the last write to a row wins. Supabase Realtime pushes changes to the other phone, with a 60-second catch-up pull as a fallback.
- `supabase/migrations`: tables, Row Level Security on everything, and `SECURITY DEFINER` functions for creating a household, creating an invite (8 characters, 7 days, single use) and joining (max 2 members by default).
- Built-in recipes ship with the app as versioned data. Editing one saves a household copy ("our version"); deleting the copy restores the original.

## Food-safety and nutrition notes

Guidance follows general public sources and is labelled as guidance, not medical advice. Cooked leftovers: 3–4 days at ≤4 °C. Raw poultry and minced meat: 1–2 days in the fridge, so the list says to freeze on purchase when they're cooked later in the week, and Today reminds you to thaw in the fridge the night before. Dates you enter always win.

- Harvard Healthy Eating Plate: https://nutritionsource.hsph.harvard.edu/healthy-eating-plate/
- USDA, leftovers: https://ask.fsis.usda.gov/article/How-do-I-handle-leftovers-safely
- FoodSafety.gov cold storage: https://www.foodsafety.gov/food-safety-charts/cold-food-storage-charts
- AHA, healthy snacking: https://www.heart.org/en/healthy-living/healthy-eating/add-color/healthy-snacking
- AHA, sugary drinks: https://www.heart.org/en/healthy-living/healthy-eating/eat-smart/sugar/rethink-your-drink-reducing-sugary-drinks-in-your-diet

See `docs/SETUP_GUIDE.md` for deployment and phone installation, and `docs/DAY_ONE.md` for how to use it.
