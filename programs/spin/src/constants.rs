use anchor_lang::prelude::*;

/// ORAO VRF Callback program (devnet & mainnet).
pub const VRF_PROGRAM_ID: Pubkey =
    pubkey!("VRFCBePmGTpZ234BhbzNNzmyg39Rgdd6VgdfhHwKypU");

/// ORAO VRF network state PDA seed.
pub const VRF_CONFIG_SEED: &[u8] = b"OraoVrfCbConfig";
/// ORAO VRF client PDA seed.
pub const VRF_CLIENT_SEED: &[u8] = b"OraoVrfCbClient";
/// ORAO VRF request account PDA seed.
pub const VRF_REQUEST_SEED: &[u8] = b"OraoVrfCbRequest";

/// Our program's house treasury PDA seed.
pub const HOUSE_SEED: &[u8] = b"house";
/// Our program's VRF request authority (state) PDA seed.
pub const VRF_STATE_SEED: &[u8] = b"vrf_state";
/// Per-bet pending spin PDA seed.
pub const PENDING_SEED: &[u8] = b"pending";
/// Per-game immutable config PDA seed.
pub const GAME_CONFIG_SEED: &[u8] = b"game_config";
/// Per-player credit vault PDA seed.
pub const VAULT_SEED: &[u8] = b"vault";
/// Global outstanding-player-credit ledger PDA seed.
pub const CREDITS_SEED: &[u8] = b"credits";
/// Per-player statistics PDA seed.
pub const SESSION_SEED: &[u8] = b"session";
/// House reveal chain PDA seed.
pub const CHAIN_SEED: &[u8] = b"chain";

/// Maximum number of reveals a single chain may hold.
pub const MAX_CHAIN_LENGTH: u64 = 100_000;

/// House bankroll rule: a single bet may not exceed this fraction of the
/// treasury (1% => 100x coverage of the max payout).
pub const TREASURY_BANKROLL_DIVISOR: u64 = 100;

/// Anchor instruction discriminator prefix.
pub const IX_DISCRIMINATOR_NAMESPACE: &str = "global:";

// ---------------------------------------------------------------------------
// Plinko
// ---------------------------------------------------------------------------

pub const GAME_PLINKO: u8 = 7;

pub const PLINKO_RISK_LOW: u8 = 0;
pub const PLINKO_RISK_MED: u8 = 1;
pub const PLINKO_RISK_HIGH: u8 = 2;

pub const PLINKO_MIN_ROWS: u8 = 8;
pub const PLINKO_MAX_ROWS: u8 = 16;

/// Edge-payout multiplier table. Each entry is in units of 0.01× (e.g. 2816 =
/// 28.16×). Bucket `k` = index into the row's array (0..=rows). Values were
/// precomputed from the binomial distribution: `mult_k ∝ p_peak / p_k`, scaled
/// so each row/risk variant lands near its target RTP (Low ~99%, Med ~97.5%,
/// High ~96%). The tables are constants — no float math at runtime — and are
/// mirrored byte-for-byte in the client evaluator.
#[rustfmt::skip]
const PLINKO_TABLES_0_01: [&[u64]; 27] = [
    // rows 8: LOW, MED, HIGH
    &[2816, 352, 101, 50, 40, 50, 101, 352, 2816],
    &[2773, 347, 99, 50, 40, 50, 99, 347, 2773],
    &[2731, 341, 98, 49, 39, 49, 98, 341, 2731],
    // rows 9
    &[5069, 563, 141, 60, 40, 40, 60, 141, 563, 5069],
    &[4992, 555, 139, 59, 40, 40, 59, 139, 555, 4992],
    &[4915, 546, 137, 59, 39, 39, 59, 137, 546, 4915],
    // rows 10
    &[9216, 922, 205, 77, 44, 37, 44, 77, 205, 922, 9216],
    &[9076, 908, 202, 76, 43, 36, 43, 76, 202, 908, 9076],
    &[8937, 894, 199, 74, 43, 35, 43, 74, 199, 894, 8937],
    // rows 11
    &[16896, 1536, 307, 102, 51, 37, 37, 51, 102, 307, 1536, 16896],
    &[16640, 1513, 303, 101, 50, 36, 36, 50, 101, 303, 1513, 16640],
    &[16384, 1489, 298, 99, 50, 35, 35, 50, 99, 298, 1489, 16384],
    // rows 12
    &[31193, 2599, 473, 142, 63, 39, 34, 39, 63, 142, 473, 2599, 31193],
    &[30720, 2560, 465, 140, 62, 39, 33, 39, 62, 140, 465, 2560, 30720],
    &[30247, 2521, 458, 137, 61, 38, 33, 38, 61, 137, 458, 2521, 30247],
    // rows 13
    &[57929, 4456, 743, 203, 81, 45, 34, 34, 45, 81, 203, 743, 4456, 57929],
    &[57051, 4389, 731, 199, 80, 44, 33, 33, 44, 80, 199, 731, 4389, 57051],
    &[56174, 4321, 720, 196, 79, 44, 33, 33, 44, 79, 196, 720, 4321, 56174],
    // rows 14
    &[108134, 7724, 1188, 297, 108, 54, 36, 32, 36, 54, 108, 297, 1188, 7724, 108134],
    &[106496, 7607, 1170, 293, 106, 53, 35, 31, 35, 53, 106, 293, 1170, 7607, 106496],
    &[104858, 7490, 1152, 288, 105, 52, 35, 31, 35, 52, 105, 288, 1152, 7490, 104858],
    // rows 15
    &[202752, 13517, 1931, 446, 149, 68, 41, 32, 32, 41, 68, 149, 446, 1931, 13517, 202752],
    &[199680, 13312, 1902, 439, 146, 66, 40, 31, 31, 40, 66, 146, 439, 1902, 13312, 199680],
    &[196608, 13107, 1872, 432, 144, 65, 39, 31, 31, 39, 65, 144, 432, 1872, 13107, 196608],
    // rows 16
    &[381651, 23853, 3180, 682, 210, 87, 48, 33, 30, 33, 48, 87, 210, 682, 3180, 23853, 381651],
    &[375868, 23492, 3132, 671, 207, 86, 47, 33, 29, 33, 47, 86, 207, 671, 3132, 23492, 375868],
    &[370086, 23130, 3084, 661, 203, 85, 46, 32, 29, 32, 46, 85, 203, 661, 3084, 23130, 370086],
];

/// Returns the multiplier in basis points (10,000 = 1×) for a Plinko
/// (risk, rows, bucket) tuple, or 0 if the combination is invalid.
pub fn plinko_multiplier_bp(rows: u8, risk: u8, bucket: u8) -> u64 {
    if bucket > rows {
        return 0;
    }
    if risk > PLINKO_RISK_HIGH || rows < PLINKO_MIN_ROWS || rows > PLINKO_MAX_ROWS {
        return 0;
    }
    let table_index = (rows - PLINKO_MIN_ROWS) * 3 + risk;
    let table = PLINKO_TABLES_0_01[table_index as usize];
    let v = table[bucket as usize];
    v * 100
}

/// Encodes rows and risk into the `target` field of a Plinko bet:
/// `target = (rows << 8) | risk`
pub fn plinko_encode_target(rows: u8, risk: u8) -> u64 {
    ((rows as u64) << 8) | (risk as u64)
}

/// Decodes the `target` field back to (rows, risk). Returns `None` if the
/// values are outside the valid range.
pub fn plinko_decode_target(target: u64) -> Option<(u8, u8)> {
    let rows = ((target >> 8) & 0xFF) as u8;
    let risk = (target & 0xFF) as u8;
    if rows < PLINKO_MIN_ROWS || rows > PLINKO_MAX_ROWS {
        return None;
    }
    if risk > PLINKO_RISK_HIGH {
        return None;
    }
    Some((rows, risk))
}
