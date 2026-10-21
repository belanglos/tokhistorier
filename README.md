# Tokhistorier

Ett browserspel på svenska som tränar läsflyt. Barnet läser en kort, tokig mening och utför den på en bild genom att trycka. Avklarade berättelser blir klistermärken i ett album. Spelet är gjort för surfplatta. Se [SPEC.md](SPEC.md) för detaljer.

## Köra lokalt

Kräver Node.js (aktuell LTS).

```sh
npm install
npm run dev
```

Öppna adressen som visas i terminalen. För att testa på en iPad i samma nätverk: `npm run dev -- --host`.

Övriga kommandon:

- `npm run typecheck`: typkontroll
- `npm run build`: bygger till `dist/`
- `npm run check`: typkontroll och build

Varje push till `main` byggs och publiceras automatiskt på GitHub Pages.
