# Mixpanel Dashboard (Next.js version)

Yeh wahi automation hai jo pehle Google Apps Script mein tha, ab ek proper web app ke roop mein.
Data source wahi Google Sheet hai (`Reports` aur `Access` tabs) - kuch change nahi karna sheet mein.

## Kya kya chahiye (5 cheezein, ek baar setup)

### 1. Google Sheets Service Account (Sheet padhne ke liye)

1. https://console.cloud.google.com kholo, ek project banao (ya existing use karo)
2. "APIs & Services" -> "Library" -> search "Google Sheets API" -> Enable karo
3. "APIs & Services" -> "Credentials" -> "Create Credentials" -> "Service Account"
4. Naam do (jaise "sheets-reader"), Create karo, koi role assign karne ki zaroorat nahi
5. Service account bana ke uspe click karo -> "Keys" tab -> "Add Key" -> "Create new key" -> JSON
6. JSON file download hogi - usme `client_email` aur `private_key` dikhega, dono copy kar lo
7. Apni Google Sheet kholo -> "Share" button -> woh `client_email` (jaisa `xxx@xxx.iam.gserviceaccount.com`) ko **Viewer** access do

### 2. Google Sign-In (login ke liye)

1. Usi Google Cloud project mein: "APIs & Services" -> "OAuth consent screen" -> External -> basic details bharo -> Save
2. "Credentials" -> "Create Credentials" -> "OAuth client ID" -> Application type: "Web application"
3. "Authorized redirect URIs" mein add karo:
   - `http://localhost:3000/api/auth/callback/google` (local testing ke liye)
   - `https://<aapka-vercel-domain>/api/auth/callback/google` (deploy ke baad add karoge)
4. Client ID aur Client Secret copy kar lo

### 3. Mixpanel credentials

Wahi jo pehle use kiya tha:
- `MIXPANEL_AUTH_TOKEN` - aapka base64-encoded auth token
- `MIXPANEL_PROJECT_ID` - `3191947`

### 4. Sheet ID

Apni Google Sheet ka URL dekho: `https://docs.google.com/spreadsheets/d/SHEET_ID_YAHAN_HAI/edit`
Beech wala lamba ID copy kar lo.

### 5. NEXTAUTH_SECRET

Terminal mein yeh chalao aur output copy kar lo: `openssl rand -base64 32`

## Local mein test karna (optional, deploy se pehle)

```bash
npm install
cp .env.example .env.local
# .env.local mein upar wali saari values bharo
npm run dev
```

Browser mein `http://localhost:3000` kholo.

## Vercel pe deploy karna

1. Is poore folder ko GitHub pe ek naye repository mein push karo
2. https://vercel.com pe jaao, GitHub se sign in karo
3. "Add New Project" -> apna repository select karo -> Import
4. Deploy karne se pehle, "Environment Variables" section mein `.env.example` ki saari values daalo
   (GOOGLE_PRIVATE_KEY daalte waqt: JSON file mein jaisa hai waisa hi paste karo, `\n` characters ke saath)
5. `NEXTAUTH_URL` ko apna Vercel URL banao (jaise `https://mixpanel-dashboard-yourname.vercel.app`) - yeh deploy hone ke baad milega, ek baar deploy karke URL le lo, fir isse update karke redeploy karo
6. Deploy dabao
7. Deploy hone ke baad, us URL ko Google Cloud Console ke OAuth "Authorized redirect URIs" mein bhi add karo (jaisa Step 2 mein bataya)

## Data sync

- "All dashboards" list har 60 second mein refresh hoti hai (naya link Sheet mein paste karne ke 1 minute ke andar list mein aa jayega)
- Har dashboard ka data har 5 minute mein Mixpanel se fresh fetch hota hai automatically

## Naye features (Tags, Theme, Breakdown table)

### Reports sheet mein "Tag" column add karo

Column C mein har row ke liye ek tag likho (jaise `Marketing`, `Analytics`, `Product`, `Business`).
Khaali chhod sakte ho agar tag ki zaroorat nahi.

### Access sheet mein "AllowedTags" column add karo

Column C mein likho:
- `ALL` — sab tags/dashboards dikhenge
- ya comma-separated tags (jaise `Marketing,Product`) — sirf woh tag wale dashboards dikhenge
  aur baaki dashboards **poori tarah block** rahenge (link se bhi nahi khulenge)

### Theme toggle

Har page ke top-right mein ☾/☀ button se dark/light switch ho jaata hai, browser mein yaad rehta hai.

### Breakdown table

Har dashboard ke andar "Breakdown" tab — Mixpanel jaisi table: har source ek row, saare metrics
(Uniques/Events/Revenue) columns mein side-by-side, poore selected date range ka total.


## Agar kabhi locked out ho jao (backup plan)

Vercel mein ek naya env var add karo: `SUPER_ADMIN_EMAIL` = aapka email.
Yeh email **hamesha** poora access karega, chahe `Access` sheet khaali ho, galat ho, ya
Google Sheets se connection hi fail ho jaye. Isse aap kabhi bhi khud ko lock nahi karoge.

## Request access

`NEXT_PUBLIC_ADMIN_EMAIL` env var set karo — jo bhi access-denied dekhega, use ek
"Request access" button milega jo aapko seedha email bhej dega.

## Reliability

- Har route ka apna `loading.js` (skeleton) aur `error.js` (retry button) hai
- Ek dashboard fail ho toh baaki dashboards par asar nahi padta (isolated error boundaries)
- Jin sources ka poore date range mein data hi nahi hai (sab zero), unhe automatically
  hata diya jaata hai — filter chips saaf rehte hain aur payload chhota rehta hai

## Future: Postgres ya kisi doosre database ka data mix karna

Abhi sirf Mixpanel se data aata hai. Future mein Postgres (ya koi aur source) add karne ke liye:
1. `lib/postgres.js` jaisi ek nayi file banao jo apna data isi shape mein return kare:
   `{ sources: [...], dates: [...], data: { source: { date: value } } }`
2. Dashboard page mein Mixpanel ke matrices ke saath is naye source ka data merge karo
   (same date keys use karke)
3. `DashboardClient` ko koi change nahi karna padega — woh sirf iss shape ko samajhta hai,
   data kahan se aaya usse farak nahi padta

## Postgres Dashboards (SSH tunnel)

Ek naya Google Sheet tab banao: `PostgresQueries` — headers: `Name | SQL Query | Tag`
Har row mein: dashboard ka naam, poora SQL query (SELECT statement), aur (optional) tag.

**Env vars chahiye (Vercel mein add karo):**
- `SSH_HOST`, `SSH_PORT` (default 22), `SSH_USER`, `SSH_PRIVATE_KEY` (poori PEM key, `.pem` file ka content)
- `PG_HOST` — Postgres ka host **jaisa SSH server se dikhta hai** (aksar `localhost` ya `127.0.0.1`)
- `PG_PORT`, `PG_DATABASE`, `PG_USER`, `PG_PASSWORD`

Yeh Mixpanel dashboards se **bilkul alag** hai — home page pe apna separate section
"Postgres Dashboards" mein dikhega, `/postgres/[row]` route pe.

**Zaroori:** Query ka result jo bhi columns return kare, table automatically wahi columns
dikha degi (generic renderer hai) — koi extra config nahi chahiye. Bas query likho, tag lagao, ho gaya.

**Security note:** Sirf woh log jo Sheet edit kar sakte hain, SQL likh sakte hain — yeh
utne hi trusted hain jitne Mixpanel links daalne wale. Read-only DB user use karna best practice hai
(taaki galti se koi UPDATE/DELETE query na chal jaye).

## Owner + specific-dashboard access

`Reports` sheet mein Column G add karo: header `Owner` — har row mein us dashboard
banane/manage karne wale ka naam likho. Yeh card pe avatar+naam dikhega, aur search box
se bhi milega.

`Access` sheet mein Column D add karo: header `AllowedDashboards` — comma-separated exact
dashboard names, jo tag se alag hatke specific dashboard access dene ke liye hai.
Jaise: agar kisi ko sirf "OOO day by day revenue" dikhana hai (uska tag allowed na ho
tab bhi), uske row mein yeh likho: `OOO day by day revenue`

## Compare tab (pehle "Funnel" tha)

Uniques/Events/Revenue jaise metrics **funnel ke stages nahi hain** (yeh sab ek hi event
ke alag measurements hain) - isliye yeh tab ab sirf side-by-side comparison dikhata hai,
galat "% conversion" nahi. Agar kabhi asli Mixpanel Funnel report (sequential steps wala)
chahiye ho, woh alag data source hai - bata dena, alag se support add karenge.

## AI features (Explain this + Chat) - Google Gemini free tier

1. https://aistudio.google.com/apikey pe jaake ek free API key banao (Google account se login karke)
2. Vercel mein env var add karo: `GEMINI_API_KEY` = woh key

Ho gaya - do naye cheezein har dashboard pe apne aap dikhengi:
- **"Explain this" button** (Key points section mein) - click karte hi AI plain English mein
  batayega kya hua trend mein
- **"Ask about this data" chat button** (bottom-right corner) - koi bhi sawal poocho
  us dashboard ke data ke baare mein, AI usi data se jawab dega

Agar `GEMINI_API_KEY` set nahi hai, yeh dono features automatically hide ho jaate hain -
baaki dashboard normal kaam karta hai.

**Free tier limits:** Gemini free tier roz ke reasonable requests allow karta hai
(chhoti team ke internal use ke liye kaafi hai). Agar kabhi limit cross ho jaye,
AI features thodi der ke liye kaam nahi karenge, baaki dashboard unaffected rahega.

## Naye Mixpanel report types add karte waqt

Ab dashboard **kabhi crash nahi hoga** agar koi naya report type ka data samajh na aaye -
uske bajaye dashboard ke top pe ek chhota warning banayega jisme **"Copy for Claude"** button hoga.
Bas woh button dabao, aur jo text copy ho, woh seedha Claude ko paste kar do - usme already poori
technical detail hoti hai (metric ka naam, raw data sample) taaki turant fix ho sake, bina Vercel
Logs mein dhundhne ke.

## Explore (Query Builder) - /explore

Har signed-in user ke liye ek dynamic query builder — bina saved report ke, seedha data explore karo:
- **Insights tab:** koi bhi event chuno, filters lagao (equals/contains/greater than), kisi bhi
  property se breakdown karo, Total events/Unique users/Average choose karo, line/bar/table dekho
- **Funnels tab:** project ke saved funnels list se chuno, date range ke saath steps + conversion dekho
- **Retention tab:** cohort event + return event chuno, daily/weekly/monthly retention table dekho

Yeh Mixpanel ke **documented Query API** (segmentation/retention/funnels) use karta hai — stable hai.
Dhyan rahe: har "Run query" Mixpanel ke 60/hour rate limit mein count hota hai (results 5 min cache hote hain).

## Admin Panel - /admin (sirf SUPER_ADMIN_EMAIL ke liye)

Dashboard se hi manage karo, Sheet kholne ki zaroorat nahi:
- **Add dashboard:** naam + Mixpanel link + tag + owner daalo → seedha Reports sheet mein row add ho jayega
- **Grant access:** email + allowed tags/sources/dashboards → Access sheet mein add ho jayega

**Zaroori setup:** Service account ko Sheet pe **Editor** access do (pehle Viewer tha):
Sheet kholo → Share → service account email ke saamne Viewer ko **Editor** kar do.

**Limitation (abhi):** Sirf naye rows add hote hain — existing ko edit/delete karne ke liye Sheet hi kholna
padega. Duplicate email add karne se pehla wala row hi effective rahega.

## Sheet-Sync Architecture (Mixpanel → Sheet → Dashboard)

Dashboards ab **live Mixpanel API se seedha nahi**, balki ek "SyncedData" Sheet tab se
padhte hain — jo har din (ya manually "Sync now" se) Mixpanel se fresh data leke Sheet
mein bharta hai. Isse har naye report ka "data-shape" issue ek hi jagah (sync ke waqt)
solve hota hai, dashboard hamesha simple/consistent data padhta hai.

### Setup

1. Google Sheet mein 2 naye tabs banao:
   - **`SyncedData`** — headers: `ReportRow | Metric | Source | Date | Value`
   - **`SyncMeta`** — bas khaali chhod do, code khud A1 mein timestamp likhega
2. Vercel env var add karo: `CRON_SECRET` = koi bhi random lambi string
   (`openssl rand -base64 24` se bana sakte ho)
3. Service account ko Sheet pe **Editor** access do (pehle se ho chuka hai agar Admin
   Panel setup kiya tha)

### Sync kaise chalta hai

- **Automatic:** Vercel ka apna Cron, roz raat ~3 AM UTC (Hobby plan ki 1x/day limit ke andar)
- **Manual:** Admin Panel (`/admin`) → "Data sync" tab → "Sync now" button — turant chalta hai,
  naya dashboard add karne ke baad yeh use karna taaki turant data aa jaye
- **Fallback:** Agar kisi dashboard ka abhi tak sync nahi hua (naya add kiya hai), dashboard
  khud-ba-khud live Mixpanel se fetch kar lega us waqt tak — kuch bhi break nahi hota

### Zyada frequent sync chahiye? (din mein ek se zyada baar)

Vercel ka free Cron sirf din mein 1 baar chalta hai. Zyada fresh chahiye toh:
1. https://cron-job.org pe free account banao
2. Naya cron job: URL = `https://mixpanel-dashboard-lilac.vercel.app/api/cron/sync?secret=YOUR_CRON_SECRET`
3. Frequency jitni chaho rakho (jaise har 30 minute) — bilkul free

## v63