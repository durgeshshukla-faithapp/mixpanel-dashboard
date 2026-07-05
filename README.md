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
