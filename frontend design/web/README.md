# Nexora · PledgeGuard

Frontend-only hackathon prototype for smart collateral allocation and double-pledge prevention.

## Run

```bash
cd web
npm install
npm run dev
```

The app runs on `http://localhost:5173`.

## API mode

`src/api.js` exports `USE_MOCK = true`. The in-memory mock simulates latency, optimiser plans,
commits, state changes, replay protection, five blocked attacks, and audit events.

To connect the parallel backend, change it to:

```js
export const USE_MOCK = false;
```

All components communicate only through `src/api.js`; real requests target
`http://localhost:8000` and use the same API contract.

## Keyboard

- `R` reset
- `O` optimise
- `C` commit
- `A` arena
- `P` presentation mode
