const { ethers } = require("ethers");
const axios = require("axios");

const WETH_ADDRESS = "0x4200000000000000000000000000000000000006";
const PRIVATE_KEY = "406e6fb72c2f904a1fd9a23d4ac0cb6b80c19f2abfc63646cb9358711204c11d";
const RPC_URL = "http://localhost:8545";
const UNISWAP_V2_ROUTER = "0x4752ba5dbc23f44d87826276bf6fd6b1c372ad24";

// KNOWN tokens to exclude
const KNOWN_TOKENS = new Set([
    "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913".toLowerCase(), // USDC
    "0x4200000000000000000000000000000000000006".toLowerCase(), // WETH
    "0x50c5725949a6f0c72e6c4a641f24049a917db0cb".toLowerCase(), // DAI
    "0xd9aaec86b65d86f6a7b5b1b0c42ffa531710b6ca".toLowerCase(), // USDbC
]);

class RealTokenHunter {
    constructor() {
        this.wallet = new ethers.Wallet(PRIVATE_KEY);
        this.seenTokens = new Set();
        this.lastBlock = 0;
        
        console.log("🎯 REAL TOKEN HUNTER");
        console.log("===================");
        console.log("🔑 Wallet:", this.wallet.address);
        console.log("🎯 STRATEGY: Find REAL new tokens, not fake pool events");
        console.log("🚀 MULTIPLE DETECTION METHODS");
    }
    
    async rpcCall(method, params = []) {
        try {
            const response = await axios.post(RPC_URL, {
                jsonrpc: "2.0",
                method: method,
                params: params,
                id: 1
            });
            return response.data.result;
        } catch (error) {
            console.log("❌ RPC error:", error.message);
            return null;
        }
    }
    
    async huntRealTokens(blockNumber) {
        console.log(`🎯 REAL TOKEN HUNT - Block ${blockNumber}`);
        
        const realTokens = [];
        
        // METHOD 1: Find NEW contract creations (token contracts)
        const newContracts = await this.findNewContracts(blockNumber);
        if (newContracts.length > 0) {
            console.log(`   📝 ${newContracts.length} new contracts created`);
            for (const contract of newContracts) {
                const tokenCheck = await this.isTokenContract(contract);
                if (tokenCheck) {
                    realTokens.push({
                        method: "Contract_Creation",
                        token: contract,
                        info: tokenCheck
                    });
                }
            }
        }
        
        // METHOD 2: Find FIRST-TIME token transfers (new tokens getting first activity)
        const firstTransfers = await this.findFirstTimeTransfers(blockNumber);
        if (firstTransfers.length > 0) {
            console.log(`   💸 ${firstTransfers.length} potential first transfers`);
            for (const transfer of firstTransfers) {
                if (!this.seenTokens.has(transfer.token) && !KNOWN_TOKENS.has(transfer.token)) {
                    const tokenCheck = await this.isTokenContract(transfer.token);
                    if (tokenCheck) {
                        realTokens.push({
                            method: "First_Transfer",
                            token: transfer.token,
                            info: tokenCheck
                        });
                    }
                }
            }
        }
        
        // METHOD 3: Monitor DEX router transactions for unknown tokens
        const dexTokens = await this.findDexTokenActivity(blockNumber);
        if (dexTokens.length > 0) {
            console.log(`   🏪 ${dexTokens.length} tokens active on DEX`);
            for (const dexToken of dexTokens) {
                if (!this.seenTokens.has(dexToken) && !KNOWN_TOKENS.has(dexToken)) {
                    const tokenCheck = await this.isTokenContract(dexToken);
                    if (tokenCheck) {
                        realTokens.push({
                            method: "DEX_Activity",
                            token: dexToken,
                            info: tokenCheck
                        });
                    }
                }
            }
        }
        
        // METHOD 4: Check for tokens with WETH pairs in transfers
        const wethPairTokens = await this.findWethPairActivity(blockNumber);
        if (wethPairTokens.length > 0) {
            console.log(`   🔄 ${wethPairTokens.length} tokens paired with WETH`);
            for (const token of wethPairTokens) {
                if (!this.seenTokens.has(token) && !KNOWN_TOKENS.has(token)) {
                    const tokenCheck = await this.isTokenContract(token);
                    if (tokenCheck) {
                        realTokens.push({
                            method: "WETH_Pair",
                            token: token,
                            info: tokenCheck
                        });
                    }
                }
            }
        }
        
        if (realTokens.length > 0) {
            console.log(`   🎯 FOUND ${realTokens.length} REAL NEW TOKENS!`);
        }
        
        return realTokens;
    }
    
    async findNewContracts(blockNumber) {
        // Look for contract creation transactions
        const block = await this.rpcCall("eth_getBlockByNumber", [`0x${blockNumber.toString(16)}`, true]);
        if (!block || !block.transactions) return [];
        
        const newContracts = [];
        for (const tx of block.transactions) {
            // Contract creation has no 'to' address
            if (!tx.to && tx.creates) {
                newContracts.push(tx.creates);
            }
        }
        
        return newContracts;
    }
    
    async findFirstTimeTransfers(blockNumber) {
        // Look for Transfer events from NEW token contracts
        const transferSig = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
        
        const logs = await this.rpcCall("eth_getLogs", [{
            fromBlock: `0x${blockNumber.toString(16)}`,
            toBlock: `0x${blockNumber.toString(16)}`,
            topics: [transferSig]
        }]);
        
        if (!logs) return [];
        
        const transfers = [];
        for (const log of logs) {
            const tokenAddress = log.address.toLowerCase();
            
            // Check if this is a new token we haven't seen
            if (!this.seenTokens.has(tokenAddress) && !KNOWN_TOKENS.has(tokenAddress)) {
                transfers.push({
                    token: tokenAddress,
                    from: "0x" + log.topics[1].slice(26),
                    to: "0x" + log.topics[2].slice(26)
                });
            }
        }
        
        return transfers;
    }
    
    async findDexTokenActivity(blockNumber) {
        // Monitor known DEX routers for token activity
        const dexRouters = [
            "0x4752ba5dbc23f44d87826276bf6fd6b1c372ad24", // Uniswap V2
            "0x327Df1E6de05895d2ab08513aaDD9313Fe505d86", // BaseSwap
        ];
        
        const tokens = new Set();
        
        for (const router of dexRouters) {
            const logs = await this.rpcCall("eth_getLogs", [{
                fromBlock: `0x${blockNumber.toString(16)}`,
                toBlock: `0x${blockNumber.toString(16)}`,
                address: router
            }]);
            
            if (logs) {
                for (const log of logs) {
                    // Extract token addresses from log data
                    if (log.data && log.data.length > 66) {
                        // Parse potential token addresses from transaction data
                        const dataHex = log.data.slice(2);
                        for (let i = 0; i < dataHex.length - 40; i += 2) {
                            const addr = "0x" + dataHex.substr(i, 40);
                            if (addr.match(/^0x[0-9a-fA-F]{40}$/)) {
                                tokens.add(addr.toLowerCase());
                            }
                        }
                    }
                }
            }
        }
        
        return Array.from(tokens);
    }
    
    async findWethPairActivity(blockNumber) {
        // Look for transactions involving both WETH and unknown tokens
        const transferSig = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
        
        const wethLogs = await this.rpcCall("eth_getLogs", [{
            fromBlock: `0x${blockNumber.toString(16)}`,
            toBlock: `0x${blockNumber.toString(16)}`,
            address: WETH_ADDRESS,
            topics: [transferSig]
        }]);
        
        if (!wethLogs) return [];
        
        const tokens = new Set();
        
        // For each WETH transfer, check other transfers in same transaction
        for (const wethLog of wethLogs) {
            if (wethLog.transactionHash) {
                const allLogs = await this.rpcCall("eth_getLogs", [{
                    fromBlock: `0x${blockNumber.toString(16)}`,
                    toBlock: `0x${blockNumber.toString(16)}`,
                    topics: [transferSig]
                }]);
                
                if (allLogs) {
                    for (const log of allLogs) {
                        if (log.transactionHash === wethLog.transactionHash && 
                            log.address.toLowerCase() !== WETH_ADDRESS.toLowerCase()) {
                            tokens.add(log.address.toLowerCase());
                        }
                    }
                }
            }
        }
        
        return Array.from(tokens);
    }
    
    async isTokenContract(address) {
        try {
            // Check if this is a valid ERC20 token
            const symbolData = await this.rpcCall("eth_call", [{
                to: address,
                data: "0x95d89b41" // symbol()
            }, "latest"]);
            
            const nameData = await this.rpcCall("eth_call", [{
                to: address,
                data: "0x06fdde03" // name()
            }, "latest"]);
            
            if (!symbolData || symbolData === "0x" || !nameData || nameData === "0x") {
                return null;
            }
            
            // Try to decode symbol and name
            let symbol = "";
            let name = "";
            
            try {
                symbol = ethers.utils.toUtf8String("0x" + symbolData.slice(130)).replace(/\0/g, "");
                name = ethers.utils.toUtf8String("0x" + nameData.slice(130)).replace(/\0/g, "");
            } catch (e) {
                return null;
            }
            
            if (symbol.length > 0 && name.length > 0) {
                return { symbol, name };
            }
            
            return null;
        } catch (error) {
            return null;
        }
    }
    
    async executeRealSwap(tokenData) {
        const start = Date.now();
        
        console.log("\n💰 EXECUTING REAL TOKEN SWAP");
        console.log("=============================");
        console.log("🎯 Method:", tokenData.method);
        console.log("🪙 Token:", tokenData.token.slice(0, 12) + "...");
        console.log("✅ Symbol:", tokenData.info.symbol);
        console.log("📝 Name:", tokenData.info.name);
        
        // Mark as seen
        this.seenTokens.add(tokenData.token);
        
        // Get transaction parameters
        const nonce = await this.rpcCall("eth_getTransactionCount", [this.wallet.address, "latest"]);
        const gasPrice = await this.rpcCall("eth_gasPrice", []);
        
        if (!nonce || !gasPrice) {
            console.log("❌ Could not get transaction parameters");
            return;
        }
        
        const boostedGasPrice = "0x" + (parseInt(gasPrice, 16) * 4).toString(16);
        const swapAmount = "0x38d7ea4c68000"; // 0.001 ETH
        
        console.log("💰 Real swap parameters:");
        console.log("   Amount: 0.001 ETH");
        console.log("   Token:", tokenData.info.symbol);
        console.log("   Detection:", tokenData.method);
        console.log("   Gas:", ethers.utils.formatUnits(boostedGasPrice, "gwei"), "Gwei");
        
        // Build swap transaction
        const tx = {
            to: UNISWAP_V2_ROUTER,
            value: swapAmount,
            gas: "0x7a120", // 500,000
            gasPrice: boostedGasPrice,
            nonce: nonce,
            data: "0x7ff36ab5" + // swapExactETHForTokensSupportingFeeOnTransferTokens
                  "0000000000000000000000000000000000000000000000000000000000000001" + // minOut
                  "0000000000000000000000000000000000000000000000000000000000000080" + // path offset
                  this.wallet.address.slice(2).padStart(64, "0") + // to
                  Math.floor(Date.now() / 1000 + 300).toString(16).padStart(64, "0") + // deadline
                  "0000000000000000000000000000000000000000000000000000000000000002" + // path length
                  WETH_ADDRESS.slice(2).padStart(64, "0") + // WETH
                  tokenData.token.slice(2).padStart(64, "0"), // new token
            chainId: 8453
        };
        
        console.log("🚀 EXECUTING REAL TOKEN SWAP...");
        
        try {
            const signedTx = await this.wallet.signTransaction(tx);
            const txHash = await this.rpcCall("eth_sendRawTransaction", [signedTx]);
            
            if (txHash) {
                const broadcastTime = Date.now() - start;
                console.log("✅ REAL TOKEN SWAP SUCCESS!");
                console.log("   TX:", txHash);
                console.log("   Time:", broadcastTime + "ms");
                console.log("   🎯 Method:", tokenData.method);
                console.log("   🏆 REAL TOKEN ACQUISITION!");
                
                // Monitor confirmation
                setTimeout(async () => {
                    const receipt = await this.rpcCall("eth_getTransactionReceipt", [txHash]);
                    if (receipt && receipt.status === "0x1") {
                        console.log("🎉 REAL SWAP CONFIRMED!");
                        console.log("   🪙 ACQUIRED:", tokenData.info.symbol);
                        console.log("   💪 REAL TOKEN HUNTER SUCCESS!");
                    }
                }, 3000);
                
            } else {
                console.log("❌ Transaction failed");
            }
            
        } catch (error) {
            console.log("❌ Swap failed:", error.message);
        }
    }
    
    async run() {
        console.log("\n🎯 REAL TOKEN HUNTER ACTIVE");
        console.log("===========================");
        console.log("✅ METHOD 1: Contract creation monitoring");
        console.log("✅ METHOD 2: First-time transfer detection");
        console.log("✅ METHOD 3: DEX activity monitoring");
        console.log("✅ METHOD 4: WETH pair activity");
        console.log("🚀 COMPREHENSIVE NEW TOKEN DETECTION");
        console.log("");
        
        const currentBlock = await this.rpcCall("eth_blockNumber", []);
        this.lastBlock = parseInt(currentBlock, 16);
        
        console.log("📊 Starting hunt from block:", this.lastBlock);
        
        while (true) {
            try {
                const latestBlock = await this.rpcCall("eth_blockNumber", []);
                const blockNumber = parseInt(latestBlock, 16);
                
                if (blockNumber > this.lastBlock) {
                    for (let block = this.lastBlock + 1; block <= blockNumber; block++) {
                        console.log("📡 Hunting Block:", block);
                        
                        const realTokens = await this.huntRealTokens(block);
                        
                        for (const tokenData of realTokens) {
                            console.log("🚨 REAL NEW TOKEN FOUND!");
                            await this.executeRealSwap(tokenData);
                        }
                    }
                    
                    this.lastBlock = blockNumber;
                }
                
                await new Promise(resolve => setTimeout(resolve, 100));
                
            } catch (error) {
                console.log("❌ Hunt error:", error.message);
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }
    }
}

console.log("🎯 REAL TOKEN HUNTER");
console.log("===================");
console.log("STRATEGY: Multiple detection methods for REAL new tokens");
console.log("APPROACH: Contract creation + First transfers + DEX activity + WETH pairs");
console.log("MISSION: Find and swap REAL new tokens (not fake pool events)");
console.log("");

const hunter = new RealTokenHunter();
hunter.run().catch(console.error); 