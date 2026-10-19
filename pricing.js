// USD per 1M tokens. Source: Anthropic model table (first-party API rates).
// cacheRead is listed per model because the discount differs between generations.
// Cache writes: 5m TTL = 1.25x input, 1h TTL = 2x input (standard multipliers).
const PRICES = {
  'claude-fable-5-1': { input: 10, output: 50, cacheRead: 0.25 },
  'claude-fable-5': { input: 10, output: 50, cacheRead: 0.25 },
  'claude-mythos-5-1': { input: 10, output: 50, cacheRead: 0.25 },
  'claude-opus-5-5': { input: 4, output: 20, cacheRead: 0.2 },
  'claude-opus-5': { input: 5, output: 25, cacheRead: 0.5 },
  'claude-opus-4-8': { input: 5, output: 25, cacheRead: 0.5 },
  'claude-opus-4-7': { input: 5, output: 25, cacheRead: 0.5 },
  'claude-opus-4-6': { input: 5, output: 25, cacheRead: 0.5 },
  'claude-sonnet-5-5': { input: 2, output: 10, cacheRead: 0.2 },
  'claude-sonnet-5': { input: 2, output: 10, cacheRead: 0.2 },
  'claude-sonnet-4-6': { input: 3, output: 15, cacheRead: 0.3 },
  'claude-haiku-5-5': { input: 0.1, output: 0.5, cacheRead: 0.01 },
  'claude-haiku-4-5': { input: 1, output: 5, cacheRead: 0.1 },
};

const FALLBACK = PRICES['claude-sonnet-5-5'];

function priceFor(model) {
  return PRICES[model] || null;
}

// Returns { cost, known }. Unknown models are priced at the fallback and flagged.
function costOf(model, e) {
  const p = priceFor(model);
  const r = p || FALLBACK;
  const cost =
    (e.input * r.input +
      e.output * r.output +
      e.cacheRead * r.cacheRead +
      e.cacheWrite5m * r.input * 1.25 +
      e.cacheWrite1h * r.input * 2) /
    1e6;
  return { cost, known: !!p };
}

module.exports = { costOf };
