# 🏠 Out & About by Putri

Putri's honest picks around Hong Kong, in one app with four options:

- **☕ Bean There:** the café app. Its map and café pages live here; Taste Match, Putri's Palate and the coffee crawl open the [Bean There site](https://amabelnapitu.github.io/bean-there-by-putri/).
- **🍽️ Seconds, Please:** restaurants. Craving Match (4 questions → an eating personality and a % match), an MTR map with a budget slider and a lunch-set filter, the Lunch Set Finder, and Spin the Chopsticks (a lazy Susan with every restaurant in the area you pick).
- **🍸 Pour Decisions:** bars and clubs. Vibe Match, hotspots with a Bars / Clubs switch and a price slider, and Spin the Bottle.
- **✨ Sip & Bite:** everything together. A plans match ("What are your plans today?", or just the time you're heading out), ready-made days (Lazy weekend, Work-day lunch, Coffee crawl + dinner, Night out), and one map of everything.

Shared by all four:

- **My day:** one list of stops, kept on the phone (no login). Reorder, remove, "Suggest an order" for the shortest walk, and open the whole route in Google Maps.
- **Place pages** for every café, restaurant, bar and dessert spot: what to order, Putri's review, 👍/👎 votes, and nearby pairings. Restaurants always suggest **dessert after**, plus coffee and drinks.
- **Near me** (uses the phone's location, or a district you pick), **Putri's page**, and **Send Putri a note** (suggest a place, report one that's closed, ideas, hellos).
- **Closed places disappear.** Anything tagged `closed` or `temp-closed` in the sheet is left out of everything.
- **Branches.** Places with several branches (NOC, Elephant Grounds, % Arabica…) count every open branch. Near me shows each place once, at the branch closest to you, with Putri's rating and which branch she visited. Place pages list the other branches with directions. My day and Sip & Bite use the branch nearest the previous stop, so routes stay short. Rankings and the district map still use the branch Putri reviewed.

A static site (HTML, CSS and JavaScript, no build step) on GitHub Pages. Everything is free.

## Where the data comes from

The **Review** Google Sheet. Each app tab is published as CSV and linked in `config.js`:

| Option | App tab | Filled from | `config.js` |
|---|---|---|---|
| Bean There | APP | Cafe tab | `cafesCsvUrl` (set) |
| Seconds, Please | FOOD | Restaurant tab | `foodCsvUrl` (set) |
| Pour Decisions | BAR | Bar tab | `barsCsvUrl` (empty until BAR is published) |
| Desserts | DESSERT | Dessert tab | `dessertCsvUrl` (empty until DESSERT exists) |
| Branches | BRANCHES | the monthly closed-place check | `branchesCsvUrl` (set) |

The sheet's script (in the Bean There repo, [`apps-script/Code.gs`](https://github.com/Amabelnapitu/bean-there-by-putri/blob/main/apps-script/Code.gs)) keeps each app tab in sync with its review tab, fills in Rank and Tags, looks up locations, and runs the monthly closed-place check. See the Bean There README for how it works.

If a link is empty or the sheet can't be reached, the app uses the saved copies in `data/` (`cafes.csv`, `food.csv`, `bars.csv`, `branches.csv`). Refresh them now and then by downloading each tab as CSV.

### BAR tab columns

District · Name · Rank · Rating · Type (`Bar`, `Club` or `Both`) · Must Order · Price (per drink) · Note · Tags · Area · Maps Link · Lat, Lng · Added

Bars with no rating yet show as "Review soon" and stay out of Vibe Match and the spinner.

### DESSERT tab

Add a **Dessert** tab with the same columns as the Restaurant tab (Location, No, Name, Order, Price, Rate, Review). The next sync creates the DESSERT app tab by itself. Publish it as CSV and paste the link into `dessertCsvUrl`. Until then, "something sweet" suggestions come from HeSheEat and cafés known for cake, waffles or croissants.

Optional: a **Dessert** column in the FOOD tab (e.g. "Tiramisu") makes that restaurant's page say "Stay for the tiramisu".

### Branches

The monthly closed-place check (in the sheet's script) finds every branch of each place on Google Maps and writes them to the **BRANCHES** tab. Only branches marked `open` are used. If Google matched something that isn't really a branch, type `yes` in its **Hide** column. Nothing else to maintain: new branches appear after the next monthly check.

### Tags the app understands

- Restaurants: `value`, `cheap`, `pricey`, `lunch-set`, `buffet`, `big-portion`, `small-portion`, `small-space`, `spicy`, `veggie-friendly`, `late-night`, `cute`, `group`, `healthy`
- Bars: `cocktails`, `wine`, `shots`, `dancing`, `pretty`, `small-space`, `crowded`, `best-on-weekdays`, `free-shots`, `cheap`, `pricey`
- Any place: `closed`, `temp-closed` (hide it everywhere)

## Votes and notes

They use the same Apps Script web app as Bean There (`apiUrl` in `config.js`). Votes land in the **Votes** tab with a **Kind** column (`food`, `bar`, `dessert`; blank for cafés). Notes land in **Feedback** with Type `food`, `bar`, `dessert`, `cafe` (suggestions), `closed` (someone says a place has closed), `idea` or `hi`, and you get an email for each.

After changing `Code.gs`, deploy a new version so the site uses it: **Deploy → Manage deployments → ✏️ → Version: New version → Deploy** (the URL stays the same).

## Hosting

GitHub Pages: **Settings → Pages → Deploy from a branch → `main` / `(root)`**. The site is then at https://amabelnapitu.github.io/out-and-about/

- `sw.js` keeps the app and the latest lists on the phone so it opens without signal (votes and notes need a connection).
- On a phone, **Share → Add to Home Screen** installs it like an app.
- `og-image.jpg` is the preview card WhatsApp and iMessage show for links.

## Links you can share

`#food`, `#food/quiz`, `#food/spin`, `#bar`, `#bar/spin`, `#sip`, `#sip/plans`, `#near`, `#myday`, `#note`, and any place page (`#p/food/central/motorino`).

## Run locally

```sh
python3 -m http.server 8000
# open http://localhost:8000
```
