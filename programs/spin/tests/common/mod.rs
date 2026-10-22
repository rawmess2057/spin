//! Shared harness for the litesvm integration tests: boots a LiteSVM with the
//! compiled program, bootstraps the house (treasury, ledger, chain, Plinko
//! limits) and offers typed helpers for every instruction.

#![allow(dead_code)]

use anchor_lang::prelude::Pubkey;
use anchor_lang::{AccountDeserialize, InstructionData, ToAccountMetas};
use litesvm::types::{FailedTransactionMetadata, TransactionMetadata};
use litesvm::LiteSVM;
use solana_address::Address;
use solana_instruction::Instruction;
use solana_keypair::Keypair;
use solana_sha256_hasher::hash;
use solana_signer::Signer;
use solana_transaction::Transaction;
use solana_transaction_error::TransactionError;

use spin::constants::*;
use spin::error::SpinError;
use spin::state::*;

pub const SOL: u64 = 1_000_000_000;
pub const DIAMOND: u64 = 100_000;
pub const SYSTEM_PROGRAM: Pubkey = Pubkey::new_from_array([0u8; 32]);

/// anchor's `Pubkey` and the sdk's `Address` may be distinct types across
/// crate versions; converting through bytes works either way.
pub fn addr(p: &Pubkey) -> Address {
    Address::new_from_array(p.to_bytes())
}
pub fn pk(a: &Address) -> Pubkey {
    Pubkey::new_from_array(a.to_bytes())
}

/// A pre-generated reveal chain: `values[0]` is the genesis commitment,
/// `values[i+1]` is the preimage of `values[i]`.
pub struct Chain {
    pub values: Vec<[u8; 32]>,
}

impl Chain {
    pub fn generate(length: usize, secret: [u8; 32]) -> Self {
        // s_N = sha256(secret), s_i = sha256(s_{i+1}); values[i] = s_i.
        let mut values = vec![[0u8; 32]; length + 1];
        values[length] = hash(&secret).to_bytes();
        for i in (0..length).rev() {
            values[i] = hash(&values[i + 1]).to_bytes();
        }
        Self { values }
    }
    pub fn genesis(&self) -> [u8; 32] {
        self.values[0]
    }
    /// The reveal that settles the bet consuming chain index `index`.
    pub fn reveal(&self, index: usize) -> [u8; 32] {
        self.values[index + 1]
    }
}

pub struct Harness {
    pub svm: LiteSVM,
    pub authority: Keypair,
    pub cranker: Keypair,
    pub chain: Chain,
    pub chain_len: u64,
}

pub type TxResult = Result<TransactionMetadata, FailedTransactionMetadata>;

impl Harness {
    /// Program loaded, house funded with `treasury_sol`, Plinko registered.
    pub fn new(treasury_sol: u64) -> Self {
        let mut svm = LiteSVM::new();
        let so = concat!(env!("CARGO_MANIFEST_DIR"), "/../../target/deploy/spin.so");
        svm.add_program_from_file(addr(&spin::ID), so)
            .expect("run `anchor build` first");

        let authority = Keypair::new();
        let cranker = Keypair::new();
        svm.airdrop(&authority.pubkey(), (treasury_sol + 100) * SOL).unwrap();
        svm.airdrop(&cranker.pubkey(), 10 * SOL).unwrap();

        let chain_len = 64u64;
        let chain = Chain::generate(chain_len as usize, [7u8; 32]);

        let mut h = Self {
            svm,
            authority,
            cranker,
            chain,
            chain_len,
        };
        let auth = h.authority_pk();
        send_tx(&mut h.svm, 
            &[ix(
                spin::accounts::InitConfig {
                    authority: auth,
                    treasury: house_address(),
                    system_program: SYSTEM_PROGRAM,
                },
                spin::instruction::InitConfig {},
            )],
            &[&h.authority],
        )
        .unwrap();
        send_tx(&mut h.svm, 
            &[ix(
                spin::accounts::InitCredits {
                    authority: auth,
                    treasury: house_address(),
                    credits: credits_address(),
                    system_program: SYSTEM_PROGRAM,
                },
                spin::instruction::InitCredits { initial_total: 0 },
            )],
            &[&h.authority],
        )
        .unwrap();
        send_tx(&mut h.svm, 
            &[ix(
                spin::accounts::TreasuryDeposit {
                    authority: auth,
                    treasury: house_address(),
                    system_program: SYSTEM_PROGRAM,
                },
                spin::instruction::TreasuryDeposit {
                    amount: treasury_sol * SOL,
                },
            )],
            &[&h.authority],
        )
        .unwrap();
        h.init_game(GAME_PLINKO, DIAMOND, 10_000 * DIAMOND).unwrap();
        let genesis = h.chain.genesis();
        send_tx(&mut h.svm, 
            &[ix(
                spin::accounts::InitChain {
                    authority: auth,
                    treasury: house_address(),
                    chain: chain_address(),
                    system_program: SYSTEM_PROGRAM,
                },
                spin::instruction::InitChain {
                    genesis,
                    length: chain_len,
                },
            )],
            &[&h.authority],
        )
        .unwrap();
        h
    }

    pub fn authority_pk(&self) -> Pubkey {
        pk(&self.authority.pubkey())
    }

    pub fn send(&mut self, ixs: &[Instruction], signers: &[&Keypair]) -> TxResult {
        send_tx(&mut self.svm, ixs, signers)
    }

    pub fn new_player(&mut self, sol: u64) -> Keypair {
        let kp = Keypair::new();
        self.svm.airdrop(&kp.pubkey(), sol * SOL).unwrap();
        kp
    }

    // --- admin -------------------------------------------------------------

    pub fn init_game(&mut self, game_id: u8, min_bet: u64, max_bet: u64) -> TxResult {
        let auth = self.authority_pk();
        send_tx(&mut self.svm, 
            &[ix(
                spin::accounts::InitGameConfig {
                    authority: auth,
                    treasury: house_address(),
                    config: game_config_address(game_id),
                    system_program: SYSTEM_PROGRAM,
                },
                spin::instruction::InitGameConfig {
                    game_id,
                    min_bet,
                    max_bet,
                },
            )],
            &[&self.authority],
        )
    }

    pub fn rotate_chain(&mut self, genesis: [u8; 32], length: u64) -> TxResult {
        let auth = self.authority_pk();
        send_tx(&mut self.svm, 
            &[ix(
                spin::accounts::RotateChain {
                    authority: auth,
                    treasury: house_address(),
                    chain: chain_address(),
                },
                spin::instruction::RotateChain { genesis, length },
            )],
            &[&self.authority],
        )
    }

    pub fn treasury_withdraw(&mut self, amount: u64) -> TxResult {
        let auth = self.authority_pk();
        send_tx(&mut self.svm, 
            &[ix(
                spin::accounts::TreasuryWithdraw {
                    authority: auth,
                    treasury: house_address(),
                    credits: credits_address(),
                    system_program: SYSTEM_PROGRAM,
                },
                spin::instruction::TreasuryWithdraw { amount },
            )],
            &[&self.authority],
        )
    }

    // --- vault -------------------------------------------------------------

    pub fn deposit(&mut self, player: &Keypair, amount: u64) -> TxResult {
        let p = pk(&player.pubkey());
        send_tx(&mut self.svm, 
            &[ix(
                spin::accounts::Deposit {
                    player: p,
                    treasury: house_address(),
                    vault: player_vault_address(&p),
                    credits: credits_address(),
                    system_program: SYSTEM_PROGRAM,
                },
                spin::instruction::Deposit { amount },
            )],
            &[player],
        )
    }

    pub fn withdraw(&mut self, player: &Keypair, amount: u64) -> TxResult {
        let p = pk(&player.pubkey());
        send_tx(&mut self.svm, 
            &[ix(
                spin::accounts::Withdraw {
                    player: p,
                    treasury: house_address(),
                    vault: player_vault_address(&p),
                    credits: credits_address(),
                    system_program: SYSTEM_PROGRAM,
                },
                spin::instruction::Withdraw { amount },
            )],
            &[player],
        )
    }

    pub fn set_delegate(
        &mut self,
        player: &Keypair,
        delegate: Pubkey,
        expiry_slot: u64,
        spend_limit: u64,
    ) -> TxResult {
        let p = pk(&player.pubkey());
        send_tx(&mut self.svm, 
            &[ix(
                spin::accounts::SetDelegate {
                    player: p,
                    vault: player_vault_address(&p),
                },
                spin::instruction::SetDelegate {
                    delegate,
                    expiry_slot,
                    spend_limit,
                },
            )],
            &[player],
        )
    }

    // --- betting -----------------------------------------------------------

    /// `authority` signs (the player or their session key); `player` owns the
    /// vault.
    pub fn place_bet(
        &mut self,
        authority: &Keypair,
        player: Pubkey,
        game_id: u8,
        amount: u64,
        target: u64,
        client_seed: [u8; 32],
    ) -> TxResult {
        send_tx(&mut self.svm, 
            &[ix(
                spin::accounts::PlaceBet {
                    authority: pk(&authority.pubkey()),
                    player,
                    treasury: house_address(),
                    chain: chain_address(),
                    config: game_config_address(game_id),
                    vault: player_vault_address(&player),
                    credits: credits_address(),
                    session: player_session_address(&player),
                    bet: bet_address(&player),
                    system_program: SYSTEM_PROGRAM,
                },
                spin::instruction::PlaceBet {
                    game_id,
                    amount,
                    target,
                    client_seed,
                },
            )],
            &[authority],
        )
    }

    pub fn settle_bet(&mut self, player: Pubkey, reveal: [u8; 32]) -> TxResult {
        self.settle_bet_with_cu(player, reveal, None)
    }

    /// Like the crank: optionally requests a compute-unit limit first.
    pub fn settle_bet_with_cu(
        &mut self,
        player: Pubkey,
        reveal: [u8; 32],
        cu_limit: Option<u32>,
    ) -> TxResult {
        let cranker = pk(&self.cranker.pubkey());
        let mut ixs = Vec::new();
        if let Some(units) = cu_limit {
            ixs.push(compute_unit_limit_ix(units));
        }
        ixs.push(ix(
            spin::accounts::SettleBet {
                cranker,
                player,
                bet: bet_address(&player),
                chain: chain_address(),
                vault: player_vault_address(&player),
                credits: credits_address(),
                session: player_session_address(&player),
            },
            spin::instruction::SettleBet { reveal },
        ));
        send_tx(&mut self.svm, &ixs, &[&self.cranker])
    }

    #[allow(dead_code)]
    fn settle_bet_old(&mut self, player: Pubkey, reveal: [u8; 32]) -> TxResult {
        let cranker = pk(&self.cranker.pubkey());
        send_tx(&mut self.svm, 
            &[ix(
                spin::accounts::SettleBet {
                    cranker,
                    player,
                    bet: bet_address(&player),
                    chain: chain_address(),
                    vault: player_vault_address(&player),
                    credits: credits_address(),
                    session: player_session_address(&player),
                },
                spin::instruction::SettleBet { reveal },
            )],
            &[&self.cranker],
        )
    }

    pub fn cancel_bet(&mut self, player: Pubkey) -> TxResult {
        let caller = pk(&self.cranker.pubkey());
        send_tx(&mut self.svm, 
            &[ix(
                spin::accounts::CancelBet {
                    caller,
                    player,
                    bet: bet_address(&player),
                    chain: chain_address(),
                    vault: player_vault_address(&player),
                    credits: credits_address(),
                },
                spin::instruction::CancelBet {},
            )],
            &[&self.cranker],
        )
    }

    // --- reads -------------------------------------------------------------

    pub fn account<T: AccountDeserialize>(&self, address: &Pubkey) -> T {
        let acct = self
            .svm
            .get_account(&addr(address))
            .unwrap_or_else(|| panic!("account {address} missing"));
        T::try_deserialize(&mut &acct.data[..]).expect("deserialize")
    }

    pub fn chain_state(&self) -> ChainState {
        self.account(&chain_address())
    }
    pub fn ledger(&self) -> CreditLedger {
        self.account(&credits_address())
    }
    pub fn vault(&self, player: &Pubkey) -> PlayerVault {
        self.account(&player_vault_address(player))
    }
    pub fn bet(&self, player: &Pubkey) -> BetState {
        self.account(&bet_address(player))
    }
    pub fn session(&self, player: &Pubkey) -> PlayerSession {
        self.account(&player_session_address(player))
    }
    pub fn treasury_lamports(&self) -> u64 {
        self.svm.get_balance(&addr(&house_address())).unwrap()
    }
    pub fn slot(&self) -> u64 {
        self.svm
            .get_sysvar::<anchor_lang::prelude::Clock>()
            .slot
    }
    pub fn warp(&mut self, delta: u64) {
        let s = self.slot();
        self.svm.warp_to_slot(s + delta);
    }
}

pub trait PubkeyAddr {
    fn pubkey_addr(&self) -> Address;
}
impl PubkeyAddr for Keypair {
    fn pubkey_addr(&self) -> Address {
        self.pubkey()
    }
}

/// Signs with `signers` (the first one pays) and sends. A fresh blockhash per
/// tx so identical retries aren't deduplicated.
pub fn send_tx(svm: &mut LiteSVM, ixs: &[Instruction], signers: &[&Keypair]) -> TxResult {
    let payer = signers[0].pubkey();
    let blockhash = svm.latest_blockhash();
    let tx = Transaction::new_signed_with_payer(ixs, Some(&payer), signers, blockhash);
    let r = svm.send_transaction(tx);
    svm.expire_blockhash();
    r
}

/// `ComputeBudget111…` SetComputeUnitLimit(units).
pub fn compute_unit_limit_ix(units: u32) -> Instruction {
    let mut data = vec![2u8];
    data.extend_from_slice(&units.to_le_bytes());
    Instruction {
        program_id: Pubkey::from_str_const("ComputeBudget111111111111111111111111111111"),
        accounts: vec![],
        data,
    }
}

pub fn ix<A: ToAccountMetas, D: InstructionData>(accounts: A, data: D) -> Instruction {
    Instruction {
        program_id: spin::ID,
        accounts: accounts.to_account_metas(None),
        data: data.data(),
    }
}

/// Asserts the transaction failed with our program's `expected` error.
pub fn expect_err(result: TxResult, expected: SpinError) {
    let code = anchor_lang::error::ERROR_CODE_OFFSET + expected as u32;
    match result {
        Ok(meta) => panic!(
            "expected error {expected:?} ({code}) but tx succeeded:\n{}",
            meta.pretty_logs()
        ),
        Err(failed) => match failed.err {
            TransactionError::InstructionError(_, solana_instruction::error::InstructionError::Custom(c)) => {
                assert_eq!(c, code, "wrong error code; logs:\n{}", failed.meta.pretty_logs())
            }
            other => panic!("unexpected failure {other:?}; logs:\n{}", failed.meta.pretty_logs()),
        },
    }
}

pub fn ok(result: TxResult) -> TransactionMetadata {
    match result {
        Ok(meta) => meta,
        Err(failed) => panic!("tx failed: {:?}\n{}", failed.err, failed.meta.pretty_logs()),
    }
}
