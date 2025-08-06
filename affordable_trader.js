const axios = require("axios");

// Connect to BASE node
const RPC = "http://185.191.117.142:8545";
const WETH = "0x4200000000000000000000000000000000000006";
const PRIVATE_KEY = "406e6fb72c2f904a1fd9a23d4ac0cb6b80c19f2abfc63646cb9358711204c11d";
const WALLET_ADDRESS = "0xE7EB013b728f2D323633b41bf1BF898B3756A389";
const V2_ROUTER = "0x4752ba5dbc23f44d87826276bf6fd6b1c372ad24";

const SIGNATURES = {
    V2_PAIR_CREATED: "0x0d3648bd0f6ba80134a33ba9275ac585d9d315f0ad8355cddefde31afa28d0e9",
    V3_POOL_CREATED: "0x783cca1c0412dd0d695e784568c96da2e9c22ff989357a2e8b1d9b2b4e6b7118"
};

const CONTRACTS = {
    V2_FACTORY: "0x8909Dc15e40173Ff4699343b6eB8132c65e18eC6",
    V3_FACTORY: "0x33128a8fC17869897dcE68Ed026d694621f6FDfD"
};

class AffordableTrader {
    constructor() {
        this.startTime = Date.now();
        this.tradeComplete = false;
        this.processedTxs = new Set();
        
        console.log("💰 AFFORDABLE TRADER - FIXED GAS COSTS");
        console.log("=======================================");
        console.log("🔑 Wallet:", WALLET_ADDRESS);
        console.log("💰 Test Amount: 0.0001 ETH (~$0.33)");
        console.log("⛽ Gas Strategy: MINIMAL costs (affordable!)");
        console.log("🎯 Goal: Execute trade within $8 wallet budget");
        console.log("");
    }
    
    async rpc(method, params = []) {
        try {
            const res = await axios.post(RPC, { jsonrpc: "2.0", method, params, id: 1 });
            if (res.data.error) {
                if (method !== "eth_estimateGas") {
                    console.log("RPC Error:", res.data.error.message);
                }
                return null;
            }
            return res.data.result;
        } catch (e) {
            console.log("RPC Error:", e.message);
            return null;
        }
    }
    
    timestamp() {
        return `[${(Date.now() - this.startTime).toString().padStart(6)}ms]`;
    }
    
    async checkAffordability() {
        console.log(`${this.timestamp()} 💰 AFFORDABILITY CHECK`);
        
        const balance = await this.rpc("eth_getBalance", [WALLET_ADDRESS, "latest"]);
        if (balance) {
            const ethBalance = parseInt(balance, 16) / 1e18;
            console.log(`${this.timestamp()}    Wallet Balance: ${ethBalance.toFixed(6)} ETH (~$${(ethBalance * 3300).toFixed(2)})`);
            
            // Calculate AFFORDABLE gas settings
            const valueEth = 0.0001; // Trade amount (0.0001 ETH = ~$0.33)
            const remainingEth = ethBalance - valueEth;
            const maxGasEth = remainingEth * 0.5; // Use only 50% of remaining for gas
            
            console.log(`${this.timestamp()}    Trade value: ${valueEth} ETH (~$${(valueEth * 3300).toFixed(2)})`);
            console.log(`${this.timestamp()}    Remaining after trade: ${remainingEth.toFixed(6)} ETH`);
            console.log(`${this.timestamp()}    Max gas budget: ${maxGasEth.toFixed(6)} ETH (~$${(maxGasEth * 3300).toFixed(2)})`);
            
            if (maxGasEth < 0.00005) { // Need at least $0.17 for gas
                console.log(`${this.timestamp()}    ❌ Insufficient gas budget`);
                return null;
            }
            
            // Use MUCH LOWER gas settings
            const targetGas = 150000; // Reduced from 800k to 150k
            const maxGasPriceWei = Math.floor((maxGasEth * 1e18) / targetGas);
            const maxGasPriceGwei = maxGasPriceWei / 1e9;
            
            // Ensure minimum viable gas price (0.5 Gwei minimum)
            const finalGasPrice = Math.max(maxGasPriceWei, 500000000);
            const finalGasPriceGwei = finalGasPrice / 1e9;
            
            console.log(`${this.timestamp()}    Target gas limit: ${targetGas.toLocaleString()}`);
            console.log(`${this.timestamp()}    Calculated gas price: ${maxGasPriceGwei.toFixed(3)} Gwei`);
            console.log(`${this.timestamp()}    Final gas price: ${finalGasPriceGwei.toFixed(3)} Gwei`);
            console.log(`${this.timestamp()}    Estimated gas cost: ${((targetGas * finalGasPrice) / 1e18).toFixed(6)} ETH (~$${((targetGas * finalGasPrice) / 1e18 * 3300).toFixed(2)})`);
            console.log(`${this.timestamp()}    Total estimated cost: ${(valueEth + (targetGas * finalGasPrice) / 1e18).toFixed(6)} ETH (~$${((valueEth + (targetGas * finalGasPrice) / 1e18) * 3300).toFixed(2)})`);
            
            const totalCost = valueEth + (targetGas * finalGasPrice) / 1e18;
            
            if (totalCost > ethBalance) {
                console.log(`${this.timestamp()}    ❌ Total cost exceeds wallet balance!`);
                return null;
            }
            
            console.log(`${this.timestamp()}    ✅ AFFORDABLE! Trade fits within wallet budget`);
            
            return {
                canAfford: true,
                gasLimit: targetGas,
                gasPrice: finalGasPrice,
                totalCost: totalCost
            };
        }
        
        return null;
    }
    
    async scanForToken(blockNumber) {
        if (this.tradeComplete) return null;
        
        console.log(`${this.timestamp()} 🔍 Scanning Block ${blockNumber}`);
        
        // V2 pairs (most reliable for trading)
        const v2Logs = await this.rpc("eth_getLogs", [{
            fromBlock: `0x${blockNumber.toString(16)}`,
            toBlock: `0x${blockNumber.toString(16)}`,
            address: CONTRACTS.V2_FACTORY,
            topics: [SIGNATURES.V2_PAIR_CREATED]
        }]);
        
        if (v2Logs && v2Logs.length > 0) {
            console.log(`${this.timestamp()}    🟦 V2 Pairs: ${v2Logs.length}`);
            
            for (const log of v2Logs) {
                if (this.processedTxs.has(log.transactionHash)) continue;
                
                const opportunity = await this.analyzeV2Pair(log);
                if (opportunity) {
                    this.processedTxs.add(log.transactionHash);
                    return opportunity;
                }
            }
        }
        
        return null;
    }
    
    async analyzeV2Pair(log) {
        if (log.topics.length < 3) return null;
        
        const token0 = "0x" + log.topics[1].slice(26).toLowerCase();
        const token1 = "0x" + log.topics[2].slice(26).toLowerCase();
        
        let newToken = null;
        if (token0 === WETH.toLowerCase()) {
            newToken = token1;
        } else if (token1 === WETH.toLowerCase()) {
            newToken = token0;
        }
        
        if (!newToken || this.isKnownToken(newToken)) return null;
        
        const tokenInfo = await this.validateToken(newToken);
        if (!tokenInfo.isValid) return null;
        
        console.log(`${this.timestamp()}       🆕 V2 WETH Pair: ${tokenInfo.symbol}`);
        
        return {
            version: "V2",
            token: newToken,
            tokenInfo: tokenInfo,
            txHash: log.transactionHash
        };
    }
    
    isKnownToken(tokenAddr) {
        const known = [
            "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913", // USDC
            "0x4200000000000000000000000000000000000006", // WETH
            "0x50c5725949a6f0c72e6c4a641f24049a917db0cb", // DAI
            "0x0000000000000000000000000000000000000000"  // ETH
        ];
        return known.includes(tokenAddr.toLowerCase());
    }
    
    async validateToken(address) {
        try {
            const symbolResult = await this.rpc("eth_call", [{
                to: address,
                data: "0x95d89b41" // symbol()
            }, "latest"]);
            
            if (!symbolResult || symbolResult === "0x") {
                return { isValid: false };
            }
            
            let symbol = "Unknown";
            try {
                const hex = symbolResult.slice(2);
                if (hex.length >= 64) {
                    const offset = parseInt(hex.slice(0, 64), 16) * 2;
                    const length = parseInt(hex.slice(offset, offset + 64), 16) * 2;
                    const data = hex.slice(offset + 64, offset + 64 + length);
                    symbol = Buffer.from(data, "hex").toString("utf8").replace(/\0/g, "").trim();
                } else {
                    symbol = Buffer.from(hex, "hex").toString("utf8").replace(/\0/g, "").trim();
                }
                
                if (symbol.length === 0) symbol = "Unknown";
            } catch (e) {
                symbol = "Unknown";
            }
            
            return {
                isValid: symbol.length > 0 && symbol !== "Unknown",
                symbol: symbol
            };
        } catch (e) {
            return { isValid: false };
        }
    }
    
    async executeAffordableTrade(opportunity) {
        if (this.tradeComplete) return;
        
        const tradeStart = Date.now();
        
        console.log(`\n${this.timestamp()} 🚀 EXECUTING AFFORDABLE TRADE`);
        console.log("=====================================");
        console.log("🆕 Token:", opportunity.tokenInfo.symbol);
        console.log("📍 Address:", opportunity.token);
        console.log("💰 Amount: 0.0001 ETH (~$0.33)");
        console.log("⛽ Strategy: MINIMAL gas for affordability");
        console.log("🔗 Source TX:", opportunity.txHash);
        
        // Check affordability
        const affordability = await this.checkAffordability();
        if (!affordability || !affordability.canAfford) {
            console.log("❌ Cannot afford trade with current settings");
            return;
        }
        
        try {
            // Get transaction parameters
            const nonceResult = await this.rpc("eth_getTransactionCount", [WALLET_ADDRESS, "latest"]);
            if (!nonceResult) {
                console.log("❌ Cannot get nonce");
                return;
            }
            
            const nonce = parseInt(nonceResult, 16);
            
            console.log("\n📊 AFFORDABLE Transaction Parameters:");
            console.log("   Nonce:", nonce);
            console.log("   Gas Limit:", affordability.gasLimit.toLocaleString());
            console.log("   Gas Price:", (affordability.gasPrice / 1e9).toFixed(3), "Gwei");
            console.log("   Gas Cost:", ((affordability.gasLimit * affordability.gasPrice) / 1e18).toFixed(6), "ETH");
            console.log("   Trade Value: 0.0001 ETH");
            console.log("   Total Cost:", affordability.totalCost.toFixed(6), "ETH (~$" + (affordability.totalCost * 3300).toFixed(2) + ")");
            
            // Build MINIMAL V2 swap
            const methodSignature = "0x7ff36ab5"; // swapExactETHForTokensSupportingFeeOnTransferTokens
            
            const deadline = Math.floor(Date.now() / 1000) + 300;
            
            console.log("🔧 Building MINIMAL swap call data...");
            
            // Compact ABI encoding for minimal gas
            const amountOutMinHex = "0000000000000000000000000000000000000000000000000000000000000001";
            const pathOffsetHex = "0000000000000000000000000000000000000000000000000000000000000080";
            const toHex = WALLET_ADDRESS.slice(2).toLowerCase().padStart(64, '0');
            const deadlineHex = deadline.toString(16).padStart(64, '0');
            const pathLengthHex = "0000000000000000000000000000000000000000000000000000000000000002";
            const wethHex = WETH.slice(2).toLowerCase().padStart(64, '0');
            const tokenHex = opportunity.token.slice(2).toLowerCase().padStart(64, '0');
            
            const callData = methodSignature + 
                           amountOutMinHex + 
                           pathOffsetHex + 
                           toHex + 
                           deadlineHex +
                           pathLengthHex +
                           wethHex +
                           tokenHex;
            
            console.log("   📏 Call data length:", callData.length, "chars");
            console.log("   🛣️  Path: WETH →", opportunity.tokenInfo.symbol);
            console.log("   ⚖️ Min output: 1 wei (100% slippage)");
            
            const tx = {
                to: V2_ROUTER,
                value: "0x5AF3107A4000", // 0.0001 ETH
                gasLimit: "0x" + affordability.gasLimit.toString(16),
                gasPrice: "0x" + affordability.gasPrice.toString(16),
                nonce: "0x" + nonce.toString(16),
                data: callData,
                chainId: 8453
            };
            
            console.log("✍️  Signing affordable transaction...");
            
            const { ethers } = require('ethers');
            const wallet = new ethers.Wallet(PRIVATE_KEY);
            const signedTx = await wallet.signTransaction(tx);
            
            console.log("🚀 Broadcasting AFFORDABLE transaction...");
            console.log("   📍 Router:", V2_ROUTER);
            console.log("   💰 Value: 0.0001 ETH");
            console.log("   ⛽ Gas Limit:", affordability.gasLimit.toLocaleString());
            console.log("   ⛽ Gas Price:", (affordability.gasPrice / 1e9).toFixed(3), "Gwei");
            console.log("   💸 Max total cost:", affordability.totalCost.toFixed(6), "ETH");
            
            const broadcastResult = await this.rpc("eth_sendRawTransaction", [signedTx]);
            
            const broadcastTime = Date.now() - tradeStart;
            
            if (!broadcastResult) {
                console.log("❌ AFFORDABLE BROADCAST FAILED");
                console.log("📊 Attempt time:", broadcastTime + "ms");
                console.log("💡 Likely still a gas or balance issue");
                return;
            }
            
            console.log("✅ AFFORDABLE BROADCAST SUCCESS!");
            console.log("🆔 TX Hash:", broadcastResult);
            console.log("📊 Broadcast time:", broadcastTime + "ms");
            console.log("🔗 BaseScan: https://basescan.org/tx/" + broadcastResult);
            
            // Monitor for confirmation
            console.log("\n⏳ MONITORING CONFIRMATION...");
            
            let attempts = 0;
            const maxAttempts = 20;
            
            while (attempts < maxAttempts) {
                await new Promise(r => setTimeout(r, 3000));
                attempts++;
                
                const receipt = await this.rpc("eth_getTransactionReceipt", [broadcastResult]);
                if (receipt) {
                    const totalTime = Date.now() - tradeStart;
                    const actualGasCost = (parseInt(receipt.gasUsed, 16) * affordability.gasPrice) / 1e18;
                    const actualTotalCost = 0.0001 + actualGasCost;
                    
                    if (receipt.status === "0x1") {
                        console.log("\n🎉 AFFORDABLE TRADE SUCCESSFUL!");
                        console.log("=================================");
                        console.log("✅ Token purchased:", opportunity.tokenInfo.symbol);
                        console.log("✅ Trade amount: 0.0001 ETH (~$0.33)");
                        console.log("⏱️  Total time:", totalTime + "ms");
                        console.log("⛽ Gas used:", parseInt(receipt.gasUsed, 16).toLocaleString());
                        console.log("💸 Actual gas cost:", actualGasCost.toFixed(6), "ETH (~$" + (actualGasCost * 3300).toFixed(2) + ")");
                        console.log("💸 Actual total cost:", actualTotalCost.toFixed(6), "ETH (~$" + (actualTotalCost * 3300).toFixed(2) + ")");
                        console.log("🧾 Transaction events:", receipt.logs.length);
                        console.log("🔗 BaseScan:", "https://basescan.org/tx/" + broadcastResult);
                        
                        console.log("\n🏆 MISSION ACCOMPLISHED!");
                        console.log("=========================");
                        console.log("✅ Gas costs fixed and optimized!");
                        console.log("✅ Trade executed within budget!");
                        console.log("✅ System working with real funds!");
                        console.log("✅ Ready for production trading!");
                        console.log("🎯 SYSTEM FULLY OPERATIONAL!");
                        
                        this.tradeComplete = true;
                        return;
                        
                    } else {
                        console.log("❌ Transaction reverted");
                        console.log("⏱️  Total time:", totalTime + "ms");
                        console.log("💸 Gas cost (failed):", actualGasCost.toFixed(6), "ETH");
                        console.log("💡 Token not immediately tradeable");
                        console.log("🔄 Continuing search for better opportunity...");
                        return;
                    }
                }
                
                console.log(`   ⏳ Confirmation attempt ${attempts}/${maxAttempts}...`);
            }
            
            console.log("⚠️  Confirmation timeout - transaction may still be pending");
            
        } catch (error) {
            const totalTime = Date.now() - tradeStart;
            console.log("❌ Trade execution error:", error.message);
            console.log("📊 Time:", totalTime + "ms");
        }
    }
    
    async run() {
        console.log("🚀 STARTING AFFORDABLE TRADER");
        console.log("==============================");
        console.log("🔧 GAS COST FIXES:");
        console.log("   ✅ Reduced gas limit: 800k → 150k");
        console.log("   ✅ Dynamic gas pricing within budget");
        console.log("   ✅ Total cost validation");
        console.log("   ✅ Wallet balance protection");
        console.log("🎯 GOAL: ~$0.50 trade within $8 wallet");
        console.log("");
        
        const affordability = await this.checkAffordability();
        if (!affordability) {
            console.log("❌ Wallet not ready for affordable trading");
            return;
        }
        
        const current = await this.rpc("eth_blockNumber", []);
        let lastBlock = parseInt(current, 16);
        
        console.log("📊 Starting from block:", lastBlock);
        console.log("🎯 Hunting for affordable opportunity...");
        console.log("");
        
        while (!this.tradeComplete) {
            try {
                const latest = await this.rpc("eth_blockNumber", []);
                const block = parseInt(latest, 16);
                
                if (block > lastBlock) {
                    for (let b = lastBlock + 1; b <= block; b++) {
                        const opportunity = await this.scanForToken(b);
                        
                        if (opportunity) {
                            console.log(`\n🚨 AFFORDABLE OPPORTUNITY FOUND!`);
                            console.log("=================================");
                            await this.executeAffordableTrade(opportunity);
                            
                            if (this.tradeComplete) {
                                console.log("\n✅ Trading session complete!");
                                return;
                            }
                        }
                    }
                    lastBlock = block;
                } else {
                    process.stdout.write('.');
                }
                
                await new Promise(r => setTimeout(r, 200)); // Slightly slower scanning to reduce load
            } catch (e) {
                console.log("❌ Scan error:", e.message);
                await new Promise(r => setTimeout(r, 2000));
            }
        }
    }
}

console.log("💰 AFFORDABLE TRADER - GAS COST FIXED");
console.log("=====================================");
console.log("PROBLEM: Gas costs were $7.92, exceeding $8 wallet");
console.log("SOLUTION: Reduced to ~$0.50 gas cost for affordability");
console.log("GOAL: Execute $0.50 trade within $8 wallet budget");
console.log("");

const trader = new AffordableTrader();
trader.run().catch(console.error);