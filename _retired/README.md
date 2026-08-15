# Retired

Code that was live and is not any more. Kept rather than deleted so the history and the
reasoning are recoverable, but **nothing in here is deployed or shipped**.

## crypto-checkout/ — retired 2026-08-15

A complete second checkout, live on tokenbrake.com at the same time as Gumroad:

- `buy.js` — `GET /api/buy` returned a USDC-on-Base wallet address and a price list of
  **$99/year solo, $490/year business**, publicly and unauthenticated. `POST` verified an
  on-chain payment and minted an **annual** licence. So two contradictory price lists were live
  simultaneously — $249 perpetual on Gumroad, $99/year here — and the cheaper one was reachable
  by anyone who read the (public) source.
- `lemonsqueezy.js` — a card webhook for the same $99/$490 annual plans. Dormant (no webhook
  secret configured) but would have minted on the old prices the moment one was set. The
  signature verification in it was correct; that is not why it was retired.
- `sales.js` + `lib-sales.js` — an admin view that read the wallet's payments off the Base chain
  and re-derived each buyer's key. Correctly protected by `TB_ADMIN_KEY` with a timing-safe
  compare. Meaningless once the crypto rail is gone.
- `payment.js` / `lib-payment.js` — the on-chain USDC verification.
- `sales.html`, `test-money.mjs` — the page and tests for the above.

**Why retired.** Chad's requirement is explicit: no crypto. Beyond that, running two checkouts
with different prices and different terms (annual vs perpetual) is a way to lose money and
confuse a buyer at the same time. One rail: Gumroad.

**No money was stranded.** Before retiring, the receiving wallet
`0x3de7b2de531053340cf132d29b837e5a0e924177` was checked directly against Base: 0 ETH, 0 USDC,
nonce 1. It never received a payment.

`TB_PAYEE` and `TB_ADMIN_KEY` can be deleted from the Vercel project; nothing reads them now.
