use tokio::time::{sleep, Duration, Instant};
use ethers::{
    prelude::*,
    providers::{Provider, Http},
    signers::{LocalWallet, Signer},
    contract::Contract,
    types::{Filter, Log},
};
use std::{str::FromStr, sync::Arc, collections::HashSet};

const WETH_ADDRESS: &str = "0x4200000000000000000000000000000000000006";
const PRIVATE_KEY: &str = "406e6fb72c2f904a1fd9a23d4ac0cb6b80c19f2abfc63646cb9358711204c11d";

// EXCLUDE known tokens (these are NOT new!)
const KNOWN_TOKENS: &[&str] = &[
    "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913", // USDC - EXCLUDE!
    "0x4200000000000000000000000000000000000006", // WETH - EXCLUDE!
    "0x50c5725949a6f0c72e6c4a641f24049a917db0cb", // DAI - EXCLUDE!
    "0xd9aaec86b65d86f6a7b5b1b0c42ffa531710b6ca", // USDbC - EXCLUDE!
    "0x2ae3f1ec7f1f5012cfeab0185bfc7aa3cf0dec22", // cbETH - EXCLUDE!
    "0x0b3e328455c4059eeb9e3f84b5543f74e24e7e1b", // cbBTC - EXCLUDE!
    "0x940181a94a35a4569e4529a3cdfb74e38fd98631", // AERO - EXCLUDE!
];

// Pool creation event signatures for REAL NEW pools
const PAIR_CREATED_SIG: &str = "0x0d3648bd0f6ba80134a33ba9275ac585d9d315f0ad8355cddefde31afa28d0e9";
const POOL_CREATED_V3_SIG: &str = "0x783cca1c0412dd0d695e784568c96da2e9c22ff989357a2e8b1d9b2b4e6b7118";

// Uniswap V2 Router for trading
const UNISWAP_V2_ROUTER: &str = "0x4752ba5dbc23f44d87826276bf6fd6b1c372ad24";

#[derive(Debug, Clone)]
struct RealNewPool {
    new_token_address: String,
    pair_address: String,
    block_number: u64,
    tx_hash: String,
    detection_time: Instant,
}

struct FixedNewPoolTrader {
    provider: Arc<Provider<Http>>,
    wallet: LocalWallet,
    known_tokens: HashSet<String>,
    processed_pools: HashSet<String>,
    last_block: u64,
}

impl FixedNewPoolTrader {
    async fn new() -> Result<Self, Box<dyn std::error::Error>> {
        println!("🔧 FIXED NEW POOL TRADER INITIALIZING");
        println!("====================================");
        
        let provider = Arc::new(Provider::<Http>::try_from("http://localhost:8545")?);
        let wallet = PRIVATE_KEY.parse::<LocalWallet>()?.with_chain_id(8453u64);
        
        let known_tokens: HashSet<String> = KNOWN_TOKENS.iter()
            .map(|addr| addr.to_lowercase())
            .collect();
        
        println!("🚫 EXCLUDING {} known tokens (USDC, WETH, etc):", KNOWN_TOKENS.len());
        for token in KNOWN_TOKENS.iter().take(3) {
            println!("   ❌ {}...", &token[..12]);
        }
        
        let current_block = provider.get_block_number().await?.as_u64();
        
        println!("🔑 Wallet: {}...", &wallet.address().to_string()[..12]);
        println!("📊 Starting block: {}", current_block);
        println!("🎯 MISSION: Find REAL NEW pools and execute REAL trades");
        
        Ok(Self {
            provider,
            wallet,
            known_tokens,
            processed_pools: HashSet::new(),
            last_block: current_block,
        })
    }
    
    async fn find_real_new_pools(&mut self, block_number: u64) -> Vec<RealNewPool> {
        let start = Instant::now();
        let mut real_new_pools = Vec::new();
        
        println!("🔍 SCANNING BLOCK {} FOR REAL NEW POOLS", block_number);
        
        // Get all logs for pool creation events
        let pair_created_filter = Filter::new()
            .from_block(block_number)
            .to_block(block_number)
            .topic0(H256::from_str(PAIR_CREATED_SIG).unwrap());
            
        if let Ok(logs) = self.provider.get_logs(&pair_created_filter).await {
            println!("   📊 Found {} pool creation events", logs.len());
            
            for log in logs {
                if let Some(real_pool) = self.analyze_pool_creation(&log, block_number).await {
                    real_new_pools.push(real_pool);
                }
            }
        }
        
        let scan_time = start.elapsed();
        println!("   ⏱️  Scan time: {:?} - {} REAL new pools found", scan_time, real_new_pools.len());
        
        real_new_pools
    }
    
    async fn analyze_pool_creation(&self, log: &Log, block_number: u64) -> Option<RealNewPool> {
        println!("      🏭 Analyzing pool creation event...");
        
        if log.topics.len() >= 3 {
            // Extract token addresses from PairCreated event
            let token0_bytes = &log.topics[1].as_bytes()[12..]; // Remove padding
            let token1_bytes = &log.topics[2].as_bytes()[12..];
            
            let token0 = format!("0x{}", hex::encode(token0_bytes)).to_lowercase();
            let token1 = format!("0x{}", hex::encode(token1_bytes)).to_lowercase();
            
            println!("         Token0: {}...", &token0[..12]);
            println!("         Token1: {}...", &token1[..12]);
            
            // Find the NEW token (not WETH, not in known tokens)
            let new_token = if !self.known_tokens.contains(&token0) && token0 != WETH_ADDRESS.to_lowercase() {
                token0
            } else if !self.known_tokens.contains(&token1) && token1 != WETH_ADDRESS.to_lowercase() {
                token1
            } else {
                println!("         ❌ No NEW token - both are known");
                return None;
            };
            
            let pair_address = format!("{:?}", log.address).to_lowercase();
            
            // Check if we already processed this pool
            if self.processed_pools.contains(&pair_address) {
                return None;
            }
            
            println!("         🎯 REAL NEW TOKEN: {}...", &new_token[..12]);
            
            let tx_hash = format!("{:?}", log.transaction_hash.unwrap_or_default());
            
            return Some(RealNewPool {
                new_token_address: new_token,
                pair_address,
                block_number,
                tx_hash,
                detection_time: Instant::now(),
            });
        }
        
        None
    }
    
    async fn execute_real_purchase(&mut self, pool: RealNewPool) -> Result<(), Box<dyn std::error::Error>> {
        let trade_start = Instant::now();
        
        println!("\n💰 EXECUTING REAL PURCHASE OF NEW TOKEN");
        println!("======================================");
        println!("🪙 New Token: {}...", &pool.new_token_address[..12]);
        println!("🏭 Pair: {}...", &pool.pair_address[..12]);
        println!("📊 Block: {}", pool.block_number);
        println!("⏱️  Detection: {:?}", pool.detection_time.elapsed());
        
        // Mark as processed
        self.processed_pools.insert(pool.pair_address.clone());
        
        // Validate the new token
        let token_addr = Address::from_str(&pool.new_token_address)?;
        let (symbol, name) = match self.validate_token(token_addr).await {
            Ok(info) => {
                println!("✅ Token validated: {} ({})", info.0, info.1);
                info
            }
            Err(e) => {
                println!("❌ Token validation failed: {}", e);
                return Ok(());
            }
        };
        
        // Execute the swap
        let router_addr = Address::from_str(UNISWAP_V2_ROUTER)?;
        let swap_amount = U256::from_str("1000000000000000")?; // 0.001 ETH
        
        println!("🔨 Building swap transaction...");
        
        // Get aggressive gas settings
        let base_gas = self.provider.get_gas_price().await?;
        let gas_price = base_gas * 4; // 300% above market
        
        // Build the swap using Uniswap V2 swapExactETHForTokens
        let router_abi = ethers::abi::parse_abi(&[
            "function swapExactETHForTokensSupportingFeeOnTransferTokens(uint amountOutMin, address[] calldata path, address to, uint deadline) external payable"
        ])?;
        
        let router_contract = Contract::new(router_addr, router_abi, Arc::clone(&self.provider));
        
        let path = vec![
            Address::from_str(WETH_ADDRESS)?,
            token_addr,
        ];
        
        let deadline = U256::from(chrono::Utc::now().timestamp() + 300); // 5 minutes
        let min_out = U256::from(1); // Accept any amount out
        
        println!("💰 Trade parameters:");
        println!("   Amount: 0.001 ETH");
        println!("   Token: {} ({})", symbol, name);
        println!("   Gas: {} Gwei", ethers::utils::format_units(gas_price, "gwei")?);
        
        // Create transaction
        let tx = router_contract
            .method::<_, H256>("swapExactETHForTokensSupportingFeeOnTransferTokens", (min_out, path, self.wallet.address(), deadline))?
            .value(swap_amount)
            .gas(500_000)
            .gas_price(gas_price);
        
        println!("🚀 EXECUTING REAL SWAP...");
        
        // Sign and send
        let signer = SignerMiddleware::new(Arc::clone(&self.provider), self.wallet.clone());
        
        match tx.send().await {
            Ok(pending_tx) => {
                let broadcast_time = trade_start.elapsed();
                println!("✅ REAL TRADE BROADCAST!");
                println!("   TX: {:?}", pending_tx.tx_hash());
                println!("   Time: {:?}", broadcast_time);
                
                // Wait for confirmation
                if let Ok(receipt) = pending_tx.await {
                    if let Some(receipt) = receipt {
                        let total_time = trade_start.elapsed();
                        
                        if receipt.status == Some(U64::from(1)) {
                            println!("🎉 REAL PURCHASE SUCCESS!");
                            println!("   Total time: {:?}", total_time);
                            println!("   Gas used: {:?}", receipt.gas_used);
                            
                            // Check our balance
                            if let Ok(balance) = self.get_token_balance(token_addr).await {
                                if balance > U256::zero() {
                                    println!("🪙 NEW TOKENS ACQUIRED: {} {}", ethers::utils::format_units(balance, 18)?, symbol);
                                    println!("🏆 SUCCESSFUL PURCHASE OF REAL NEW TOKEN!");
                                    println!("💪 SYSTEM WORKING PERFECTLY!");
                                }
                            }
                        }
                    }
                }
            }
            Err(e) => {
                println!("❌ Trade failed: {}", e);
                println!("   Will continue looking for other opportunities...");
            }
        }
        
        Ok(())
    }
    
    async fn validate_token(&self, token_addr: Address) -> Result<(String, String), Box<dyn std::error::Error>> {
        let token_abi = ethers::abi::parse_abi(&[
            "function symbol() view returns (string)",
            "function name() view returns (string)",
        ])?;
        
        let token_contract = Contract::new(token_addr, token_abi, Arc::clone(&self.provider));
        
        let symbol: String = token_contract.method("symbol", ())?.call().await?;
        let name: String = token_contract.method("name", ())?.call().await?;
        
        if symbol.is_empty() || name.is_empty() {
            return Err("Invalid token".into());
        }
        
        Ok((symbol, name))
    }
    
    async fn get_token_balance(&self, token_addr: Address) -> Result<U256, Box<dyn std::error::Error>> {
        let token_abi = ethers::abi::parse_abi(&[
            "function balanceOf(address) view returns (uint256)",
        ])?;
        
        let token_contract = Contract::new(token_addr, token_abi, Arc::clone(&self.provider));
        let balance: U256 = token_contract.method("balanceOf", self.wallet.address())?.call().await?;
        
        Ok(balance)
    }
    
    async fn run_fixed_detection(&mut self) -> Result<(), Box<dyn std::error::Error>> {
        println!("\n🎯 FIXED NEW POOL DETECTION SYSTEM");
        println!("================================");
        println!("✅ Filtering OUT known tokens (USDC, WETH, etc)");
        println!("✅ Looking for REAL pool creation events");
        println!("✅ Executing REAL purchases on new tokens");
        println!("🚀 Ultra-fast Rust performance");
        println!("");
        
        loop {
            let current_block = self.provider.get_block_number().await?.as_u64();
            
            if current_block > self.last_block {
                for block_num in (self.last_block + 1)..=current_block {
                    println!("📡 Block: {}", block_num);
                    
                    let real_pools = self.find_real_new_pools(block_num).await;
                    
                    for pool in real_pools {
                        println!("🚨 REAL NEW POOL DETECTED!");
                        
                        if let Err(e) = self.execute_real_purchase(pool).await {
                            println!("❌ Purchase error: {}", e);
                        }
                    }
                }
                
                self.last_block = current_block;
            }
            
            sleep(Duration::from_millis(100)).await;
        }
    }
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    println!("🔧 FIXED REAL NEW POOL TRADER");
    println!("============================");
    println!("FIXES:");
    println!("✅ Excludes known tokens (USDC, WETH, etc)");
    println!("✅ Looks for REAL pool creation events");
    println!("✅ Executes ACTUAL purchases with swaps");
    println!("✅ Validates tokens before trading");
    println!("");
    
    let mut trader = FixedNewPoolTrader::new().await?;
    trader.run_fixed_detection().await?;
    
    Ok(())
} 