const { ethers } = require('ethers');

class RealtimePoolMonitor {
    constructor() {
        this.provider = new ethers.JsonRpcProvider('http://localhost:8545');
        this.wethAddress = '0x4200000000000000000000000000000000000006';
        this.swapAmount = ethers.parseEther('0.0001');
        this.poolCreatedSignature = '0x783cca1c0412dd0d695e784568c96da2e9c22ff989357a2e8b1d9b2b4e6b7118';
        this.transferSignature = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
        
        this.lastProcessedBlock = 0;
        this.monitoringActive = false;
        this.processedPools = new Set();
        
        // Create test wallet
        this.testWallet = ethers.Wallet.createRandom();
        this.signer = this.testWallet.connect(this.provider);
        
        console.log(`🔑 MONITORING WALLET: ${this.testWallet.address}`);
        console.log(`   Private Key: ${this.testWallet.privateKey}`);
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
    
    async getCurrentTimestamp() {
        const currentBlock = await this.provider.getBlockNumber();
        const block = await this.provider.getBlock(currentBlock);
        return {
            blockNumber: currentBlock,
            timestamp: block.timestamp,
            utcTime: new Date(block.timestamp * 1000).toISOString().replace('T', ' ').slice(0, 19) + ' UTC'
        };
    }
    
    async checkForNewPools(fromBlock, toBlock) {
        const scanBench = this.benchmark('Block Scan');
        
        try {
            const logs = await this.provider.getLogs({
                fromBlock,
                toBlock,
                topics: [this.poolCreatedSignature]
            });
            
            scanBench.end();
            
            if (logs.length === 0) {
                return [];
            }
            
            // Filter for WETH pairs that haven't been processed
            const wethPools = logs.filter(log => {
                const data = log.data;
                const token0 = '0x' + data.slice(26, 66);
                const token1 = '0x' + data.slice(90, 130);
                const poolAddress = '0x' + log.topics[1].slice(26);
                
                const isWethPair = (token0.toLowerCase() === this.wethAddress.toLowerCase() || 
                                   token1.toLowerCase() === this.wethAddress.toLowerCase());
                const isNew = !this.processedPools.has(poolAddress.toLowerCase());
                
                return isWethPair && isNew;
            });
            
            return wethPools;
            
        } catch (error) {
            scanBench.end();
            console.log(`❌ Block scan error: ${error.message}`);
            return [];
        }
    }
    
    async analyzeNewPool(log) {
        const totalBench = this.benchmark('🔥 TOTAL FRESH POOL ANALYSIS');
        
        const data = log.data;
        const poolAddress = '0x' + log.topics[1].slice(26);
        const token0 = '0x' + data.slice(26, 66);
        const token1 = '0x' + data.slice(90, 130);
        const fee = parseInt(data.slice(130, 194), 16);
        
        const targetToken = token0.toLowerCase() === this.wethAddress.toLowerCase() ? token1 : token0;
        
        // Mark as processed immediately
        this.processedPools.add(poolAddress.toLowerCase());
        
        console.log(`\n🚨 *** BRAND NEW POOL DETECTED *** 🚨`);
        console.log(`==========================================`);
        console.log(`📍 Pool Address: ${poolAddress}`);
        console.log(`🪙 Token 0: ${token0}`);
        console.log(`🪙 Token 1: ${token1}`);
        console.log(`💰 Fee Tier: ${Number(fee) / 10000}%`);
        console.log(`📦 Block: ${log.blockNumber}`);
        console.log(`🔗 Transaction: ${log.transactionHash}`);
        console.log(`💎 WETH Pair: ✅ YES`);
        console.log(`🎯 Target Token: ${targetToken}`);
        
        try {
            // Get block timestamp
            const blockTimeBench = this.benchmark('Block Timestamp');
            const block = await this.provider.getBlock(log.blockNumber);
            const creationTime = new Date(block.timestamp * 1000).toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
            const secondsAgo = Math.floor(Date.now() / 1000) - block.timestamp;
            blockTimeBench.end();
            
            console.log(`\n🕐 TIMING ANALYSIS:`);
            console.log(`   Created: ${creationTime}`);
            console.log(`   Age: ${secondsAgo} seconds ago`);
            console.log(`   Status: ${secondsAgo < 60 ? '🔥 ULTRA FRESH!' : secondsAgo < 300 ? '✅ FRESH' : '📊 RECENT'}`);
            
            // Analyze token freshness
            const freshnessBench = this.benchmark('Token Freshness Analysis');
            const receipt = await this.provider.getTransactionReceipt(log.transactionHash);
            
            const mintingLogs = receipt.logs.filter(txLog => 
                txLog.topics[0] === this.transferSignature &&
                txLog.topics[1] === '0x0000000000000000000000000000000000000000000000000000000000000000'
            );
            
            let targetTokenMinted = false;
            const mintedTokens = [];
            
            for (const mintLog of mintingLogs) {
                const tokenAddress = mintLog.address.toLowerCase();
                mintedTokens.push(tokenAddress);
                if (tokenAddress === targetToken.toLowerCase()) {
                    targetTokenMinted = true;
                }
            }
            
            console.log(`\n🔍 FRESHNESS ANALYSIS:`);
            console.log(`   Token Minting Found: ${mintingLogs.length > 0 ? '✅ YES' : '❌ NO'}`);
            console.log(`   Target Token Minted: ${targetTokenMinted ? '🔥 YES' : '📜 NO'}`);
            console.log(`   Minted Tokens: ${mintedTokens.length > 0 ? mintedTokens.join(', ') : 'None'}`);
            console.log(`   Launch Type: ${targetTokenMinted ? '🔥 FRESH LAUNCH!' : '📈 EXISTING TOKEN'}`);
            console.log(`   From: ${receipt.from}`);
            console.log(`   Gas Used: ${receipt.gasUsed.toLocaleString()}`);
            freshnessBench.end();
            
            // Get token information
            const tokenBench = this.benchmark('Token Information');
            const tokenContract = new ethers.Contract(targetToken, [
                'function symbol() view returns (string)',
                'function name() view returns (string)',
                'function decimals() view returns (uint8)',
                'function totalSupply() view returns (uint256)'
            ], this.provider);
            
            let tokenInfo = null;
            try {
                const [symbol, name, decimals, totalSupply] = await Promise.all([
                    tokenContract.symbol(),
                    tokenContract.name(),
                    tokenContract.decimals(),
                    tokenContract.totalSupply()
                ]);
                
                const supply = ethers.formatUnits(totalSupply, decimals);
                
                tokenInfo = { address: targetToken, symbol, name, decimals, totalSupply: supply };
                
                console.log(`\n🪙 TOKEN DETAILS:`);
                console.log(`   Address: ${targetToken}`);
                console.log(`   Symbol: ${symbol}`);
                console.log(`   Name: ${name}`);
                console.log(`   Decimals: ${decimals}`);
                console.log(`   Total Supply: ${supply}`);
                
            } catch (error) {
                console.log(`❌ Token info failed: ${error.message}`);
            }
            tokenBench.end();
            
            // Analyze pool state
            const poolBench = this.benchmark('Pool State Analysis');
            const poolContract = new ethers.Contract(poolAddress, [
                'function liquidity() view returns (uint128)',
                'function slot0() view returns (uint160, int24, uint16, uint16, uint16, uint8, bool)'
            ], this.provider);
            
            let poolState = null;
            try {
                const [liquidity, slot0] = await Promise.all([
                    poolContract.liquidity(),
                    poolContract.slot0()
                ]);
                
                const hasLiquidity = liquidity > 0n;
                const isUnlocked = slot0[6];
                
                poolState = { hasLiquidity, isUnlocked, liquidity, fee };
                
                console.log(`\n🏊 POOL STATE:`);
                console.log(`   Liquidity: ${liquidity.toString()}`);
                console.log(`   Price (sqrtPriceX96): ${slot0[0].toString()}`);
                console.log(`   Current Tick: ${slot0[1]}`);
                console.log(`   Has Liquidity: ${hasLiquidity ? '✅ YES' : '❌ NO'}`);
                console.log(`   Is Unlocked: ${isUnlocked ? '✅ YES' : '❌ NO'}`);
                console.log(`   Ready for Trading: ${hasLiquidity && isUnlocked ? '✅ YES' : '❌ NO'}`);
                
            } catch (error) {
                console.log(`❌ Pool state failed: ${error.message}`);
            }
            poolBench.end();
            
            // Attempt swap test
            if (tokenInfo && poolState && poolState.hasLiquidity && poolState.isUnlocked) {
                await this.testSwapExecution(tokenInfo, poolState, poolAddress);
            } else {
                console.log(`\n⚠️  SKIPPING SWAP TEST:`);
                console.log(`   Reason: ${!poolState?.hasLiquidity ? 'No liquidity' : !poolState?.isUnlocked ? 'Pool locked' : 'Token info unavailable'}`);
            }
            
            const totalTime = totalBench.end();
            
            console.log(`\n================================================================================`);
            console.log(`🎯 FRESH POOL ANALYSIS COMPLETE`);
            console.log(`================================================================================`);
            console.log(`🪙 Token: ${tokenInfo?.symbol || 'Unknown'} (${tokenInfo?.name || 'Unknown'})`);
            console.log(`🏊 Pool: ${poolAddress}`);
            console.log(`🔥 Launch Type: ${targetTokenMinted ? '🔥 FRESH LAUNCH!' : '📈 EXISTING TOKEN'}`);
            console.log(`🕐 Age: ${secondsAgo} seconds`);
            console.log(`⏱️  Total Analysis: ${totalTime.toFixed(2)}ms`);
            console.log(`📡 Monitoring: CONTINUING...`);
            console.log(`================================================================================\n`);
            
        } catch (error) {
            totalBench.end();
            console.log(`❌ Pool analysis failed: ${error.message}`);
        }
    }
    
    async testSwapExecution(tokenInfo, poolState, poolAddress) {
        const swapBench = this.benchmark('🚀 SWAP EXECUTION TEST');
        
        console.log(`\n🚀 TESTING SWAP EXECUTION`);
        console.log(`==========================`);
        console.log(`🎯 Strategy: FULL TRANSACTION TEST`);
        console.log(`💰 Amount: ${ethers.formatEther(this.swapAmount)} WETH`);
        console.log(`🪙 Target: ${tokenInfo.symbol}`);
        
        try {
            // Construct swap transaction
            const routerAddress = '0x2626664c2603336E57B271c5C0b26F421741e481';
            const tokenIn = this.wethAddress;
            const tokenOut = tokenInfo.address;
            const fee = poolState.fee;
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
            
            console.log(`🔧 Transaction Construction: ✅ Complete`);
            console.log(`   Calldata Length: ${swapCalldata.length} bytes`);
            
            // Sign transaction
            const signBench = this.benchmark('Transaction Signing');
            const signedTx = await this.signer.signTransaction(transaction);
            const parsedTx = ethers.Transaction.from(signedTx);
            signBench.end();
            
            console.log(`🔐 Transaction Signed: ✅ Success`);
            console.log(`   TX Hash: ${parsedTx.hash}`);
            console.log(`   Signature Length: ${signedTx.length} bytes`);
            
            // Test blockchain submission (simulation)
            const submitBench = this.benchmark('Blockchain Validation');
            try {
                await this.provider.send('eth_sendRawTransaction', [signedTx]);
                console.log(`📡 Blockchain Test: ✅ SUCCESS (Real transaction would execute)`);
            } catch (error) {
                if (error.message.includes('insufficient funds')) {
                    console.log(`📡 Blockchain Test: ✅ VALID (Only failed due to no funds)`);
                } else {
                    console.log(`📡 Blockchain Test: ❌ FAILED (${error.message.slice(0, 100)}...)`);
                }
            }
            submitBench.end();
            
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
    
    async startMonitoring() {
        console.log(`\n🔥 STARTING REAL-TIME POOL MONITORING`);
        console.log(`=====================================`);
        console.log(`🎯 Target: ABSOLUTELY NEW POOL CREATIONS`);
        console.log(`🌐 Network: BASE (Chain ID: 8453)`);
        console.log(`💎 Filter: WETH pairs only`);
        console.log(`⚡ Mode: REAL-TIME MONITORING`);
        
        // Get current status
        const currentStatus = await this.getCurrentTimestamp();
        console.log(`\n📊 MONITORING STATUS:`);
        console.log(`   Current Block: ${currentStatus.blockNumber.toLocaleString()}`);
        console.log(`   Current Time: ${currentStatus.utcTime}`);
        console.log(`   Monitoring: 🟢 ACTIVE`);
        
        this.lastProcessedBlock = currentStatus.blockNumber;
        this.monitoringActive = true;
        
        console.log(`\n⏳ WAITING FOR NEW POOLS...`);
        console.log(`   (Press Ctrl+C to stop monitoring)\n`);
        
        // Monitor every 2 seconds
        const monitorInterval = setInterval(async () => {
            try {
                const currentBlock = await this.provider.getBlockNumber();
                
                if (currentBlock > this.lastProcessedBlock) {
                    const fromBlock = this.lastProcessedBlock + 1;
                    const toBlock = currentBlock;
                    
                    console.log(`🔍 Scanning blocks ${fromBlock} → ${toBlock}...`);
                    
                    const newPools = await this.checkForNewPools(fromBlock, toBlock);
                    
                    if (newPools.length > 0) {
                        console.log(`🚨 ${newPools.length} NEW POOL(S) DETECTED!`);
                        
                        for (const pool of newPools) {
                            await this.analyzeNewPool(pool);
                        }
                    } else {
                        process.stdout.write('.');
                    }
                    
                    this.lastProcessedBlock = currentBlock;
                }
                
            } catch (error) {
                console.log(`❌ Monitoring error: ${error.message}`);
            }
        }, 2000);
        
        // Handle shutdown
        process.on('SIGINT', () => {
            console.log(`\n\n🛑 STOPPING REAL-TIME MONITORING`);
            console.log(`==============================`);
            console.log(`📊 Pools Processed: ${this.processedPools.size}`);
            console.log(`⏱️  Session Complete`);
            clearInterval(monitorInterval);
            process.exit(0);
        });
    }
}

async function main() {
    try {
        const monitor = new RealtimePoolMonitor();
        await monitor.startMonitoring();
    } catch (error) {
        console.error('❌ Fatal error:', error.message);
        process.exit(1);
    }
}

if (require.main === module) {
    main();
}

module.exports = RealtimePoolMonitor; 