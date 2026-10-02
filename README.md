# Block 2048

Suika × 2048. Drop numbered balls into the well; two equal numbers that touch merge into their sum. Every ball is the same size. Play until it overflows.

```bash
npm install
npm run dev      # play at http://localhost:5173
npm test         # unit tests (queue, score, merge pairing, game rules)
npm run bot      # balancing bot: games must last and must end
npm run build    # static build in dist/
npm run deploy   # test, build and publish dist/ to the gh-pages branch (GitHub Pages)
```

Controls: mouse, touch or arrow keys to aim; click, lift or space to drop; Esc to pause.

Rules and look: [BLOCK_2048_SPEC.md](BLOCK_2048_SPEC.md).
