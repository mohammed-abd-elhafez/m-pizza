# M Pizza Brand & Responsive UI Spec

## Design direction

M Pizza uses a warm, Arabic-first food-ordering interface: generous cream space, tomato-red action colour, cheese-yellow utility accents, and real food photography. The interface preserves the existing menu/cart/orders journey while adapting the content density to the viewport.

## Tokens

| Role | Token | Value |
|---|---|---|
| Primary action | `AppTheme.red` | `#C74634` |
| Deep brand / hero overlay | `AppTheme.deepRed` | `#8F2C24` |
| Page background | `AppTheme.cream` | `#FFF8EE` |
| Text / ink | `AppTheme.ink` | `#27211E` |
| Utility accent | `AppTheme.cheese` | `#F0C75E` |
| Success / location selected | `AppTheme.olive` | `#68734F` |

The spacing rhythm uses 8px increments. Cards use a 20px radius, the hero uses 24px on compact screens and 30px on desktop, and elevation is expressed through white surfaces with a low-contrast border instead of heavy shadows.

## Assets

- Logo: `apps/mobile/assets/brand/mpizza-mark.png`
- Hero: `apps/mobile/assets/food/hero-pizza.jpg`
- Products: `apps/mobile/assets/food/margherita.jpg`, `pepperoni.jpg`, `veggie.jpg`

## Responsive behavior

- **Compact mobile, below 680px:** one-column product cards, wrapped category chips, compact hero copy, and 12px page gutters.
- **Tablet, 680–919px:** two-column product grid, 28px page gutters, and a taller hero for comfortable touch targets.
- **Desktop, 920px and above:** 1180px maximum content width, two-column product grid, larger hero copy, and 28px page gutters.
- All primary actions remain at least 44px high through the shared Material button themes.

## Accessibility notes

The logo and food photography expose semantic labels, the location action has a tooltip, buttons keep visible focus behavior from Material 3, and layout changes never depend on colour alone. The public demo continues to use local assets and never sends a real order.
