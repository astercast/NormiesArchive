export const AGENTS_API = "https://api.normies.art";
export const SPRITES_API = "https://fullnormies.vercel.app/api/v1";

export const PASSCODE = "4356";
export const LS_UNLOCK = "nl_unlocked_v3";
export const LS_DISCOVERED = "nl_discovered_v5";
export const LS_PINNED = "nl_pinned_v5";
export const LS_WITNESS = "nl_witness_v5";

export const MAX_PINS = 3;
export const CHAT_MAX = 32;
export const WITNESS_MAX = 50;
export const PAGE_SIZE = 24;
export const INITIAL_LIST_PAGES = 2;
export const MAX_LIST = 200;

export const SCALE = 2;
export const SPR_W = 40 * SCALE;
export const SPR_H = 80 * SCALE;
export const ANC_X = 20 * SCALE;
export const ANC_Y = 60 * SCALE;
export const FOOT_BELOW = SPR_H - ANC_Y;
export const SHEET_CSS_W = 7 * SPR_W;
export const FRAME_PX = SPR_W;
export const STAND_FRAME = 4;
export const SIT_FRAME = 5;

export const WALK_FRAME_MS = 140;
export const BASE_SPEED = 1.35;
export const TALK_DIST = SPR_W * 2.35;
export const TURN_GAP_MS = 2900;
export const TURNS_PER_CONV = 5;
export const TALK_MS = TURN_GAP_MS * (TURNS_PER_CONV - 1) + 3400;
export const CONV_COOL = 4800;
export const MAX_TALKS = 5;
export const ROTATE_MS = 90_000;
