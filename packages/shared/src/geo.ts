import { z } from "zod";

/**
 * Indian states and union territories with two-letter codes (ISO 3166-2:IN, 2023 revision).
 * Addresses and vendor territory store the code, never free text, so vendors can later be
 * placed in the Super Vendor territory tree without cleanup.
 */
export const INDIAN_STATES = [
  { code: "AP", name: "Andhra Pradesh" },
  { code: "AR", name: "Arunachal Pradesh" },
  { code: "AS", name: "Assam" },
  { code: "BR", name: "Bihar" },
  { code: "CG", name: "Chhattisgarh" },
  { code: "GA", name: "Goa" },
  { code: "GJ", name: "Gujarat" },
  { code: "HR", name: "Haryana" },
  { code: "HP", name: "Himachal Pradesh" },
  { code: "JH", name: "Jharkhand" },
  { code: "KA", name: "Karnataka" },
  { code: "KL", name: "Kerala" },
  { code: "MP", name: "Madhya Pradesh" },
  { code: "MH", name: "Maharashtra" },
  { code: "MN", name: "Manipur" },
  { code: "ML", name: "Meghalaya" },
  { code: "MZ", name: "Mizoram" },
  { code: "NL", name: "Nagaland" },
  { code: "OD", name: "Odisha" },
  { code: "PB", name: "Punjab" },
  { code: "RJ", name: "Rajasthan" },
  { code: "SK", name: "Sikkim" },
  { code: "TN", name: "Tamil Nadu" },
  { code: "TS", name: "Telangana" },
  { code: "TR", name: "Tripura" },
  { code: "UP", name: "Uttar Pradesh" },
  { code: "UK", name: "Uttarakhand" },
  { code: "WB", name: "West Bengal" },
  { code: "AN", name: "Andaman and Nicobar Islands" },
  { code: "CH", name: "Chandigarh" },
  { code: "DH", name: "Dadra and Nagar Haveli and Daman and Diu" },
  { code: "DL", name: "Delhi" },
  { code: "JK", name: "Jammu and Kashmir" },
  { code: "LA", name: "Ladakh" },
  { code: "LD", name: "Lakshadweep" },
  { code: "PY", name: "Puducherry" },
] as const;

export type StateCode = (typeof INDIAN_STATES)[number]["code"];
export const STATE_CODES = INDIAN_STATES.map((s) => s.code) as [StateCode, ...StateCode[]];
export const stateName = (code: StateCode): string => INDIAN_STATES.find((s) => s.code === code)?.name ?? code;

export const stateCode = z.enum(STATE_CODES, { error: "Choose a state" });
export const PIN_RE = /^[1-9][0-9]{5}$/;
export const pinCode = z.string().trim().regex(PIN_RE, "Enter a valid 6-digit PIN code");
