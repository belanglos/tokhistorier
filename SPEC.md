# Läsflyt: spec

## Syfte

Ett browserspel på svenska som tränar läsflyt hos ett barn som läser stapplande men klarar enkla böcker med ca 10 korta meningar per sida. Spelet ska vara roligt, inte skolmässigt.

## Kärnidé

Barnet läser en kort mening och utför den på en bild genom att trycka. Scenen ändras först när rätt handling gjorts. Berättelserna är tokiga och korta. Avklarade berättelser blir klistermärken i ett album.

Småord (på, under, i, bakom, bredvid) ska avgöra vad som är rätt handling, så att barnet inte kan lyckas genom att bara gissa på de stora orden.

## MVP-scope

- 3 handskrivna berättelser, 6 steg vardera, 3–7 ord per mening. En berättelse har förgrening med två slut.
- 4 verb: take (ta), eat (äta), put (lägga/ställa/gömma), move (gå/hoppa/gömma sig).
- Emojis som grafik.
- Hemskärm = album med ett kort per berättelse. Avklarade berättelser visar klistermärke (ett per slut), övriga visar "?". Tryck på kort startar berättelsen (även avklarade, så barnet kan spela om).
- Framsteg och logg i localStorage.
- Dold exportfunktion för loggen: långtryck (800 ms) på titeln visar loggen som JSON i en textruta med en kopiera-knapp.

## Utanför MVP (bygg inte, föreslå inte)

Ljud, talsyntes, röstigenkänning, poäng, synliga timers, konton, backend, analytics, adaptiv svårighet, berättelseeditor, konfetti, inställningsmeny, animationsbibliotek, UI-ramverk (React, Vue m.fl.), externa fonter, CDN-anrop.

## Designregler (får inte brytas)

1. Texten visas före scenen ändras. Stor gemen text (minst 36 px), luftig, systemfont, inget rör sig medan barnet läser.
2. Målbilden visas aldrig. Scenen ändras först efter rätt handling.
3. Max 2 tryck per steg.
4. Tryck-tryck, inget drag-och-släpp.
5. Fel handling: kort rolig felanimation (max 600 ms), steget klaras inte, ingen ledtråd, ingen text om att det blev fel.
6. För varje tryckroll i ett steg ska scenen ha minst 3 kandidater men bara en rätt tolkning av meningen.
7. Allt fungerar utan hover och utan tangentbord.

## Tryck per verb

- take, eat: tryck på figuren (aktören), tryck på föremålet.
- put: tryck på föremålet, tryck på ett ankare (plats + läge).
- move: tryck på figuren, tryck på ett ankare.
- choice-steg: tryck på ett av två meningsalternativ (1 tryck). Den valda meningens handling spelas upp automatiskt.

## Datamodell (berättelser är data, inte kod)

```ts
type AnchorKind = "on" | "under" | "in" | "behind" | "beside";
type AnchorRef = { entity: string; anchor: AnchorKind };

type Effect =
  | { type: "bubble"; entity: string; emoji: string }
  | { type: "spawn"; entity: string; emoji: string; at: AnchorRef }
  | { type: "remove"; entity: string }
  | { type: "shake"; entity: string }
  | { type: "fall"; entity: string };

type ActionStep = {
  kind: "action";
  text: string;
  verb: "take" | "eat" | "put" | "move";
  anim?: "walk" | "jump" | "hide" | "crawl"; // move
  actor?: string; // take, eat, move
  object?: string; // take, eat, put
  target?: AnchorRef; // put, move
  effects?: Effect[];
};

type ChoiceStep = {
  kind: "choice";
  options: { step: ActionStep; ending?: string; branch: Step[] }[]; // exakt 2
};

type Step = ActionStep | ChoiceStep;

type Story = {
  id: string;
  title: string;
  sticker: string; // emoji i albumet
  entities: Entity[]; // figurer, föremål, platser med ankare, startposition
  steps: Step[];
  finale?: Effect[]; // spelas efter sista steget
};
```

- Entiteter som ligger på en annan figur följer med när figuren flyttas.
- take: aktören går till föremålet och tar upp det. Det följer sedan aktören.
- Effekter är data. Ingen berättelsespecifik kod.

## Logg

Per steg: storyId, stepIndex, timestamp, msTillFörstaTryck (från att meningen renderats), antalFelförsök. Inget annat. Max 2000 poster, äldsta tas bort först.

## surfplatta (iPad och lenovo, kallas i resten av projektet bara för iPad men ska funka på båda)

- `touch-action: manipulation`, `user-select: none`, `-webkit-touch-callout: none`.
- `100dvh`, inte `100vh`.
- Ingen zoom, ingen horisontell scroll.
- localStorage-anrop alltid i try/catch. Appen ska fungera (utan sparande) om localStorage inte går att använda.
- Testas på iPad, inte bara på dator.
