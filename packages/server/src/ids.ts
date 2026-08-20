import { randomBytes, randomInt } from "node:crypto";

/**
 * No O/0 or I/1: room codes get read aloud across a table and typed by people
 * who are not looking at a keyboard.
 */
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 4;

export const newRoomCode = (taken: (code: string) => boolean): string => {
  for (let attempt = 0; attempt < 200; attempt++) {
    let code = "";
    for (let i = 0; i < CODE_LENGTH; i++) {
      code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
    }
    if (!taken(code)) return code;
  }
  throw new Error("couldn't find a free room code");
};

export const newPlayerId = (): string => `p_${randomBytes(6).toString("hex")}`;

/** The only thing standing between a stranger and someone else's hand. */
export const newToken = (): string => randomBytes(24).toString("base64url");

export const newSeed = (): number => randomInt(1, 2 ** 31 - 1);

/**
 * A seat picked at random, for a table that has asked not to rotate the deal
 * (#198). The server's own randomness: nothing about choosing a dealer reaches
 * the engine, and the index it is handed is just a number.
 */
export const randomIndex = (count: number): number => (count > 0 ? randomInt(count) : 0);

/** Room codes are matched case-insensitively; people type them in lowercase. */
export const normaliseCode = (code: string): string => code.trim().toUpperCase();
