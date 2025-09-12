const buckets = new Map(); // key -> {count, resetAt}

export function pinLimiter(key, max = 5, windowMin = 15) {
  const now = Date.now();
  const rec = buckets.get(key);
  if (!rec || rec.resetAt < now) {
    const resetAt = now + windowMin * 60 * 1000;
    buckets.set(key, { count: 1, resetAt });
    return { ok: true, remaining: max - 1, resetAt };
  }
  if (rec.count >= max) {
    return { ok: false, remaining: 0, resetAt: rec.resetAt };
  }
  rec.count++;
  return { ok: true, remaining: max - rec.count, resetAt: rec.resetAt };
}
