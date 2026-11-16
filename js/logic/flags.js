/**
 * The address's test switches, read at the door (the user's typed-input rule): a size limit, then
 * closed sets as allow-lists. Anything else is ignored, never coerced.
 */
const MAX_QUERY = 200;
const ALLOWED = Object.freeze({ motion: ['full', 'reduce'], tier: ['high', 'low'] });

export function readFlags(search) {
  const flags = { motion: null, tier: null, debug: false, checks: false };
  if (typeof search !== 'string' || search.length > MAX_QUERY) return flags;
  const params = new URLSearchParams(search);
  for (const key of Object.keys(ALLOWED)) {
    const value = params.get(key);
    if (value !== null && ALLOWED[key].includes(value)) flags[key] = value;
  }
  flags.debug = params.get('debug') === '1';
  // the shaders' error checks: on with the debug panel, unless `checks=0` (timing measurements)
  flags.checks = flags.debug && params.get('checks') !== '0';
  return flags;
}
