import bcrypt from "bcryptjs";

const rounds = Number(process.env.BCRYPT_ROUNDS || 12);
const PIN_RE = /^[0-9]{4,6}$/; // 4Ã¢â‚¬"6 digits

export function validatePin(pin) {
  return typeof pin === "string" && PIN_RE.test(pin);
}

export async function hashPin(pin) {
  if (!validatePin(pin)) throw new Error("PIN must be 4Ã¢â‚¬"6 digits");
  const salt = await bcrypt.genSalt(rounds);
  return bcrypt.hash(pin, salt);
}

export async function verifyPin(pin, hash) {
  if (!hash) return false;
  if (!validatePin(pin)) return false;
  return bcrypt.compare(pin, hash);
}
