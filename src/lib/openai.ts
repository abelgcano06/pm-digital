// src/lib/openai.ts
import OpenAI from "openai";

const apiKey = process.env.OPENAI_API_KEY;

console.log(
  "OPENAI_API_KEY length:",
  apiKey ? apiKey.length : "undefined",
  "start:",
  apiKey ? apiKey.slice(0, 3) : "undefined"
);

if (!apiKey) {
  throw new Error(
    "OPENAI_API_KEY no está definido. Revisa tu archivo .env o variables de entorno."
  );
}

export const openai = new OpenAI({
  apiKey,
});
