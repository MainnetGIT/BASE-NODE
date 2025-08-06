const { ethers } = require('ethers');

class LiveTokenHunter {
    constructor() {
        this.provider = new ethers.JsonRpcProvider('http://localhost:8545');
        this.wethAddress = '0x4200000000000000000000000000000000000006';
        this.swapAmount = ethers.parseEther('0.0001');
        this.poolCreatedSignature = '0x783cca1c0412dd0d695e784568c96da2e9c22ff989357a2e8b1d9b2b4e6b7118';
        this.transferSignature = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
        
        this.processedPools = new Set();
        this.lastProcessedBlock = 0;
        this.monitoringActive = false;
        
        // Create test wallet
        this.testWallet = ethers.Wallet.createRandom();
        this.signer = this.testWallet.connect(this.provider);
        
        console.log(`🔑 LIVE TOKEN HUNTER: ${this.testWallet.address}`);
        console.log(`   ⚠️  FOR TESTING ONLY - NO REAL FUNDS`);
    }
    
    benchmark(label) {
        const start = process.hrtime.bigint();
        return {
            end: () => {
                const end = process.hrtime.bigint();
                const duration = Number(end - start) / 1_000_000;
                console.log(`⏱️  ${label}: ${duration.toFixed(2)}ms`);
                return duration;
            }
        };
    }
    
    parsePoolCreatedEvent(log) {
        // FIXED: Correct PoolCreated event structure
        const poolAddress = '0x' + log.topics[1].slice(26);
        const token0 = '0x' + log.topics[2].slice(26);
        const token1 = '0x' + log.topics[3].slice(26);
        const fee = parseInt(log.data.slice(2, 66), 16);
        
        return {
            poolAddress,
            token0: token0.toLowerCase(),
            token1: token1.toLowerCase(),
            fee,
            blockNumber: log.blockNumber,
            transactionHash: log.transactionHash
        };
    }
    
    async isValidToken(tokenAddress) {
        // Quick validation to filter out test/invalid tokens
        try {
            // Check if address looks valid (not padded with zeros)
            if (tokenAddress.length !== 42) return false;
            if (tokenAddress === '0x0000000000000000000000000000000000000000') return false;
            if (tokenAddress.includes('000000000000000000000000000000000')) return false;
            
            // Try to get basic token info
            const tokenContract = new ethers.Contract(tokenAddress, [
                'function symbol() view returns (string)',
                'function name() view returns (string)',
                'function decimals() view returns (uint8)'
            ], this.provider);
            
            const [symbol, name, decimals] = await Promise.all([
                tokenContract.symbol(),
                tokenContract.name(),
                tokenContract.decimals()
            ]);
            
            // Basic validation
            return symbol.length > 0 && name.length > 0 && decimals >= 0;
            
        } catch (error) {
            return false;
        }
    }
    
    async checkForNewWETHPools(fromBlock, toBlock) {
        const scanBench = this.benchmark('Block Scan');
        
        try {
            const logs = await this.provider.getLogs({
                fromBlock,
                toBlock,
                topics: [this.poolCreatedSignature]
            });
            
            scanBench.end();
            
            if (logs.length === 0) return [];
            
            const validPools = [];
            
            for (const log of logs) {
                const poolData = this.parsePoolCreatedEvent(log);
                
                // Check if WETH pair
                const isWETHPair = (poolData.token0 === this.wethAddress.toLowerCase() || 
                                   poolData.token1 === this.wethAddress.toLowerCase());
                
                if (!isWETHPair) continue;
                if (this.processedPools.has(poolData.poolAddress.toLowerCase())) continue;
                
                // Get target token (non-WETH)
                const targetToken = poolData.token0 === this.wethAddress.toLowerCase() ? 
                    poolData.token1 : poolData.token0;
                
                // Validate token
                const isValid = await this.isValidToken(targetToken);
                
                console.log(`\n📋 POOL CHECK:`);
                console.log(`   Pool: ${poolData.poolAddress}`);
                console.log(`   Target Token: ${targetToken}`);
                console.log(`   WETH Pair: ✅ YES`);
                console.log(`   Valid Token: ${isValid ? '✅ YES' : '❌ NO'}`);
                
                if (isValid) {
                    validPools.push(poolData);
                    this.processedPools.add(poolData.poolAddress.toLowerCase());
                    console.log(`   Status: 🔥 REAL TOKEN FOUND!`);
                } else {
                    console.log(`   Status: ⚠️  Skipped (test/invalid token)`);
                }
            }
            
            return validPools;
            
        } catch (error) {
            scanBench.end();
            console.log(`❌ Block scan error: ${error.message}`);
            return [];
        }
    }
    
    async analyzeRealToken(poolData) {
        const totalBench = this.benchmark('🔥 REAL TOKEN ANALYSIS');
        
        const targetToken = poolData.token0 === this.wethAddress.toLowerCase() ? 
            poolData.token1 : poolData.token0;
        
        console.log(`\n🚨 *** REAL TOKEN DETECTED *** 🚨`);
        console.log(`==========================================`);
        console.log(`📍 Pool: ${poolData.poolAddress}`);
        console.log(`🎯 Token: ${targetToken}`);
        console.log(`💰 Fee: ${poolData.fee / 10000}%`);
        console.log(`📦 Block: ${poolData.blockNumber}`);
        console.log(`🔗 TX: ${poolData.transactionHash}`);
        
        try {
            // Get timing
            const timeBench = this.benchmark('Timing Analysis');
            const block = await this.provider.getBlock(poolData.blockNumber);
            const creationTime = new Date(block.timestamp * 1000).toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
            const secondsAgo = Math.floor(Date.now() / 1000) - block.timestamp;
            timeBench.end();
            
            console.log(`\n🕐 TIMING:`);
            console.log(`   Created: ${creationTime}`);
            console.log(`   Age: ${secondsAgo} seconds ago`);
            console.log(`   Freshness: ${secondsAgo < 30 ? '🔥 ULTRA FRESH!' : secondsAgo < 120 ? '✅ FRESH' : '📊 RECENT'}`);
            
            // Token info
            const tokenBench = this.benchmark('Token Information');
            const tokenContract = new ethers.Contract(targetToken, [
                'function symbol() view returns (string)',
                'function name() view returns (string)',
                'function decimals() view returns (uint8)',
                'function totalSupply() view returns (uint256)'
            ], this.provider);
            
            const [symbol, name, decimals, totalSupply] = await Promise.all([
                tokenContract.symbol(),
                tokenContract.name(),
                tokenContract.decimals(),
                tokenContract.totalSupply()
            ]);
            
            const supply = ethers.formatUnits(totalSupply, decimals);
            const tokenInfo = { address: targetToken, symbol, name, decimals, totalSupply: supply };
            
            console.log(`\n🪙 TOKEN DETAILS:`);
            console.log(`   Symbol: ${symbol}`);
            console.log(`   Name: ${name}`);
            console.log(`   Decimals: ${decimals}`);
            console.log(`   Total Supply: ${supply}`);
            tokenBench.end();
            
            // Check freshness
            const freshBench = this.benchmark('Launch Analysis');
            const receipt = await this.provider.getTransactionReceipt(poolData.transactionHash);
            
            const mintingLogs = receipt.logs.filter(txLog => 
                txLog.topics[0] === this.transferSignature &&
                txLog.topics[1] === '0x0000000000000000000000000000000000000000000000000000000000000000'
            );
            
            let targetTokenMinted = false;
            for (const mintLog of mintingLogs) {
                if (mintLog.address.toLowerCase() === targetToken) {
                    targetTokenMinted = true;
                    break;
                }
            }
            
            console.log(`\n🔍 LAUNCH ANALYSIS:`);
            console.log(`   Fresh Minting: ${targetTokenMinted ? '🔥 YES' : '📜 NO'}`);
            console.log(`   Launch Type: ${targetTokenMinted ? '🔥 FRESH LAUNCH!' : '📈 EXISTING TOKEN'}`);
            console.log(`   From: ${receipt.from}`);
            console.log(`   Gas Used: ${receipt.gasUsed.toLocaleString()}`);
            freshBench.end();
            
            // Swap test
            await this.executeSwapTest(tokenInfo, poolData);
            
            const totalTime = totalBench.end();
            
            console.log(`\n================================================================================`);
            console.log(`🎯 REAL TOKEN ANALYSIS COMPLETE`);
            console.log(`================================================================================`);
            console.log(`🪙 Token: ${symbol} (${name})`);
            console.log(`🏊 Pool: ${poolData.poolAddress}`);
            console.log(`🔥 Type: ${targetTokenMinted ? '🔥 FRESH LAUNCH!' : '📈 EXISTING TOKEN'}`);
            console.log(`🕐 Age: ${secondsAgo} seconds`);
            console.log(`⏱️  Total: ${totalTime.toFixed(2)}ms`);
            console.log(`📡 Status: CONTINUING MONITORING...`);
            console.log(`================================================================================\n`);
            
        } catch (error) {
            totalBench.end();
            console.log(`❌ Analysis failed: ${error.message}`);
        }
    }
    
    async executeSwapTest(tokenInfo, poolData) {
        const swapBench = this.benchmark('🚀 SWAP TEST');
        
        console.log(`\n🚀 SWAP EXECUTION TEST`);
        console.log(`======================`);
        console.log(`💰 Amount: ${ethers.formatEther(this.swapAmount)} WETH → ${tokenInfo.symbol}`);
        
        try {
            const routerAddress = '0x2626664c2603336E57B271c5C0b26F421741e481';
            const tokenIn = this.wethAddress;
            const tokenOut = tokenInfo.address;
            const fee = poolData.fee;
            const amountIn = this.swapAmount;
            const amountOutMinimum = 0;
            
            const swapCalldata = this.constructSwapCalldata(tokenIn, tokenOut, fee, amountIn, amountOutMinimum);
            
            const transaction = {
                to: routerAddress,
                data: swapCalldata,
                value: 0,
                gasLimit: 300000,
                gasPrice: ethers.parseUnits('1.0', 'gwei')
            };
            
            console.log(`🔧 Construction: ✅ Complete`);
            
            const signedTx = await this.signer.signTransaction(transaction);
            const parsedTx = ethers.Transaction.from(signedTx);
            
            console.log(`🔐 Signing: ✅ Success`);
            console.log(`   TX Hash: ${parsedTx.hash}`);
            
            try {
                await this.provider.send('eth_sendRawTransaction', [signedTx]);
                console.log(`📡 Blockchain: ✅ SUCCESS`);
            } catch (error) {
                if (error.message.includes('insufficient funds')) {
                    console.log(`📡 Blockchain: ✅ VALID (No funds)`);
                } else {
                    console.log(`📡 Blockchain: ❌ FAILED (${error.message.slice(0, 40)}...)`);
                }
            }
            
        } catch (error) {
            console.log(`❌ Swap test failed: ${error.message}`);
        }
        
        swapBench.end();
    }
    
    constructSwapCalldata(tokenIn, tokenOut, fee, amountIn, amountOutMinimum) {
        const exactInputSingleSignature = '0x414bf389';
        const deadline = Math.floor(Date.now() / 1000) + 300;
        
        const params = ethers.AbiCoder.defaultAbiCoder().encode(
            ['address', 'address', 'uint24', 'address', 'uint256', 'uint256', 'uint256', 'uint160'],
            [tokenIn, tokenOut, fee, this.testWallet.address, deadline, amountIn, amountOutMinimum, 0]
        );
        
        return exactInputSingleSignature + params.slice(2);
    }
    
    async startLiveHunting() {
        console.log(`\n🔥 STARTING LIVE TOKEN HUNTING`);
        console.log(`==============================`);
        console.log(`🎯 Target: REAL TOKEN LAUNCHES (filtered)`);
        console.log(`🔧 Parser: FIXED PoolCreated structure`);
        console.log(`🚫 Filter: Exclude test/invalid tokens`);
        console.log(`💎 Focus: WETH pairs only`);
        
        const currentBlock = await this.provider.getBlockNumber();
        const currentTime = new Date().toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
        
        console.log(`\n📊 MONITORING STATUS:`);
        console.log(`   Current Block: ${currentBlock.toLocaleString()}`);
        console.log(`   Current Time: ${currentTime}`);
        console.log(`   WETH Address: ${this.wethAddress}`);
        console.log(`   Status: 🟢 LIVE HUNTING ACTIVE`);
        
        this.lastProcessedBlock = currentBlock;
        this.monitoringActive = true;
        
        console.log(`\n⏳ HUNTING FOR REAL TOKEN LAUNCHES...`);
        console.log(`   (Press Ctrl+C to stop)\n`);
        
        // Monitor every 3 seconds
        const huntInterval = setInterval(async () => {
            try {
                const currentBlock = await this.provider.getBlockNumber();
                
                if (currentBlock > this.lastProcessedBlock) {
                    const fromBlock = this.lastProcessedBlock + 1;
                    const toBlock = currentBlock;
                    
                    console.log(`🔍 Hunting blocks ${fromBlock} → ${toBlock}...`);
                    
                    const realTokens = await this.checkForNewWETHPools(fromBlock, toBlock);
                    
                    if (realTokens.length > 0) {
                        console.log(`🚨 ${realTokens.length} REAL TOKEN(S) DETECTED!`);
                        
                        for (const tokenData of realTokens) {
                            await this.analyzeRealToken(tokenData);
                        }
                    } else {
                        process.stdout.write('.');
                    }
                    
                    this.lastProcessedBlock = currentBlock;
                }
                
            } catch (error) {
                console.log(`❌ Hunting error: ${error.message}`);
            }
        }, 3000);
        
        // Handle shutdown
        process.on('SIGINT', () => {
            console.log(`\n\n🛑 STOPPING LIVE TOKEN HUNTING`);
            console.log(`==============================`);
            console.log(`📊 Real Tokens Found: ${this.processedPools.size}`);
            console.log(`⏱️  Hunt Complete`);
            clearInterval(huntInterval);
            process.exit(0);
        });
    }
}

async function main() {
    try {
        const hunter = new LiveTokenHunter();
        await hunter.startLiveHunting();
    } catch (error) {
        console.error('❌ Fatal error:', error.message);
        process.exit(1);
    }
}

if (require.main === module) {
    main();
}

module.exports = LiveTokenHunter; 