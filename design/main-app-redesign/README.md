# Jadon’s Arize design reference

Reviewed 2026-11-22, read-only, through Figma design context and screenshots.

Source: [Arize prototype / mockups — FINAL COPIES](https://www.figma.com/design/WKKcQuHiUXj9ujmglwnYOc/arize-prototype--mockups?node-id=44-16).

| Reference | Figma node |
| --- | --- |
| Home, phone / desktop | `34:114` / `34:426` |
| Goals, desktop | `44:2368` |
| Clarity conversation, phone | `44:1620` |
| Profile, desktop | `44:2616` |
| Village rooms, phone | `45:2916` |
| Village conversation, desktop | `45:3599` |
| Sign-in, desktop | `44:477` |
| Membership plans, phone | `57:3870` |

## Design roles, not a separate component system

The Student Edition’s `ink`, `muted`, `cream`, `green`, `yellow`, `orange`, surface and border roles are carried into `styles/arize-theme.css`. Adult screens consume those roles through one `.adult-theme` scope. `app/adult.css` supplies the shared shell, cards, buttons, profile groups and chat layout; `AdultAuthFrame` supplies the common sign-in/sign-up frame. No Student stylesheet or workspace is edited or imported into the adult application.

Jadon’s refinements: cream `#fffbf3`, ink `#0e1c12`, orange `#f99655`, sunrise yellow `#ffc93c`, green-soft `#e3f1e6`, white cards, Nunito, 20–24px card corners, 232px desktop sidebar and 680px content column. Green is darkened slightly from `#2f7d4f` to `#2b7449` so small green text on green-soft meets AA contrast. Decorative ring geometry stays at the exported SVG sizes.

## Assets

The eleven actual Figma SVG exports are saved in `public/design/arize/`: five navigation icons, two shortcut icons, a sun icon and three sun rings. They are inert, nonempty local assets; no temporary Figma URLs or whole-screen screenshots are shipped. The existing Arize flower logo is reused. SVG width/height and viewBox geometry are preserved.

The Home component note at `34:539` describes a **lion concept**, with final artwork to be swapped in. No usable lion illustration was supplied in the inspected frames. The implementation uses the provided sunrise-ring artwork without a fake lion or a customer-facing “concept” label. Final lion artwork remains blocked on Jadon.

## Adult adaptation

Several reference frames contain Student wording. Layout and visual hierarchy are reused, not school/grade fields, counselor routing, placeholder prices, “unlimited” AI claims or unimplemented preferences. Adult profile fields, Village rooms, goals/calendar, saved Clarity chats, consent and real configured membership limits remain intact. The Home support shortcut goes to the adult Village, not a Student counselor workflow.

Reflect and the Friday Reflection stub are held at the user’s request. Their source files are unchanged; the shared navigation shell surrounds them. Marketing and Founder screens belong to later phases.

See `docs/phase-4-adult-redesign.md` for the screen inventory, verification and remaining dependencies.
