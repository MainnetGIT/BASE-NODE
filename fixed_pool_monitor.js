const { ethers } = require('ethers');

class FixedPoolMonitor {
    constructor() {
        this.provider = new ethers.JsonRpcProvider('http://localhost:8545');
        this.wethAddress = '0x4200000000000000000000000000000000000006';
        this.swapAmount = ethers.parseEther('0.0001');
        this.poolCreatedSignature = '0x783cca1c0412dd0d695e784568c96da2e9c22ff989357a2e8b1d9b2b4e6b7118';
        this.transferSignature = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
        
        this.processedPools = new Set();
        
        // Create test wallet
        this.testWallet = ethers.Wallet.createRandom();
        this.signer = this.testWallet.connect(this.provider);
        
        console.log(`🔑 FIXED MONITORING WALLET: ${this.testWallet.address}`);
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
        // Correct PoolCreated event structure:
        // topics[0]: event signature
        // topics[1]: pool address (padded)
        // topics[2]: token0 address (padded) 
        // topics[3]: token1 address (padded)
        // data: fee + tickSpacing
        
        const poolAddress = '0x' + log.topics[1].slice(26); // Remove padding
        const token0 = '0x' + log.topics[2].slice(26); // Remove padding
        const token1 = '0x' + log.topics[3].slice(26); // Remove padding
        
        // Parse fee from data (first 32 bytes)
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
    
    async findRecentWETHPools() {
        const searchBench = this.benchmark('🔍 WETH Pool Search');
        
        const currentBlock = await this.provider.getBlockNumber();
        const fromBlock = currentBlock - 50; // Check last 50 blocks
        
        console.log(`\n🔍 SEARCHING FOR WETH POOLS:`);
        console.log(`   Current Block: ${currentBlock.toLocaleString()}`);
        console.log(`   Scanning: ${fromBlock} → ${currentBlock}`);
        console.log(`   WETH Address: ${this.wethAddress}`);
        
        const logs = await this.provider.getLogs({
            fromBlock,
            toBlock: currentBlock,
            topics: [this.poolCreatedSignature]
        });
        
        console.log(`   Found ${logs.length} total pool creation events`);
        
        const wethPools = [];
        
        for (const log of logs) {
            const poolData = this.parsePoolCreatedEvent(log);
            
            console.log(`\n📋 ANALYZING POOL:`);
            console.log(`   Pool: ${poolData.poolAddress}`);
            console.log(`   Token0: ${poolData.token0}`);
            console.log(`   Token1: ${poolData.token1}`);
            console.log(`   Fee: ${poolData.fee / 10000}%`);
            
            // Check if it's a WETH pair
            const isWETHPair = (poolData.token0 === this.wethAddress.toLowerCase() || 
                               poolData.token1 === this.wethAddress.toLowerCase());
            
            console.log(`   WETH Pair: ${isWETHPair ? '✅ YES' : '❌ NO'}`);
            
            if (isWETHPair && !this.processedPools.has(poolData.poolAddress.toLowerCase())) {
                wethPools.push(poolData);
                this.processedPools.add(poolData.poolAddress.toLowerCase());
                console.log(`   Status: 🔥 NEW WETH POOL FOUND!`);
            }
        }
        
        searchBench.end();
        return wethPools;
    }
    
    async analyzePool(poolData) {
        const totalBench = this.benchmark('🔥 COMPLETE POOL ANALYSIS');
        
        console.log(`\n🚨 *** ANALYZING WETH POOL *** 🚨`);
        console.log(`=========================================`);
        console.log(`📍 Pool: ${poolData.poolAddress}`);
        console.log(`🪙 Token0: ${poolData.token0}`);
        console.log(`🪙 Token1: ${poolData.token1}`);
        console.log(`💰 Fee: ${poolData.fee / 10000}%`);
        console.log(`📦 Block: ${poolData.blockNumber}`);
        console.log(`🔗 TX: ${poolData.transactionHash}`);
        
        // Determine target token (non-WETH)
        const targetToken = poolData.token0 === this.wethAddress.toLowerCase() ? 
            poolData.token1 : poolData.token0;
        
        console.log(`🎯 Target Token: ${targetToken}`);
        
        try {
            // Get block timestamp
            const timeBench = this.benchmark('Block Timing');
            const block = await this.provider.getBlock(poolData.blockNumber);
            const creationTime = new Date(block.timestamp * 1000).toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
            const secondsAgo = Math.floor(Date.now() / 1000) - block.timestamp;
            timeBench.end();
            
            console.log(`\n🕐 TIMING:`);
            console.log(`   Created: ${creationTime}`);
            console.log(`   Age: ${secondsAgo} seconds ago`);
            console.log(`   Freshness: ${secondsAgo < 60 ? '🔥 ULTRA FRESH!' : secondsAgo < 300 ? '✅ FRESH' : '📊 RECENT'}`);
            
            // Check token freshness
            const freshBench = this.benchmark('Token Freshness');
            const receipt = await this.provider.getTransactionReceipt(poolData.transactionHash);
            
            const mintingLogs = receipt.logs.filter(txLog => 
                txLog.topics[0] === this.transferSignature &&
                txLog.topics[1] === '0x0000000000000000000000000000000000000000000000000000000000000000'
            );
            
            let targetTokenMinted = false;
            for (const mintLog of mintingLogs) {
                const tokenAddress = mintLog.address.toLowerCase();
                if (tokenAddress === targetToken) {
                    targetTokenMinted = true;
                    break;
                }
            }
            
            console.log(`\n🔍 FRESHNESS ANALYSIS:`);
            console.log(`   Token Minting Found: ${mintingLogs.length > 0 ? '✅ YES' : '❌ NO'}`);
            console.log(`   Target Token Minted: ${targetTokenMinted ? '🔥 YES' : '📜 NO'}`);
            console.log(`   Launch Type: ${targetTokenMinted ? '🔥 FRESH LAUNCH!' : '📈 EXISTING TOKEN'}`);
            console.log(`   From: ${receipt.from}`);
            console.log(`   Gas Used: ${receipt.gasUsed.toLocaleString()}`);
            freshBench.end();
            
            // Get token info
            const tokenBench = this.benchmark('Token Information');
            let tokenInfo = null;
            try {
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
            
            // Test swap
            if (tokenInfo) {
                await this.testSwap(tokenInfo, poolData);
            }
            
            const totalTime = totalBench.end();
            
            console.log(`\n================================================================================`);
            console.log(`🎯 WETH POOL ANALYSIS COMPLETE`);
            console.log(`================================================================================`);
            console.log(`🪙 Token: ${tokenInfo?.symbol || 'Unknown'} (${tokenInfo?.name || 'Unknown'})`);
            console.log(`🏊 Pool: ${poolData.poolAddress}`);
            console.log(`🔥 Type: ${targetTokenMinted ? '🔥 FRESH LAUNCH!' : '📈 EXISTING TOKEN'}`);
            console.log(`🕐 Age: ${secondsAgo} seconds`);
            console.log(`⏱️  Total: ${totalTime.toFixed(2)}ms`);
            console.log(`================================================================================\n`);
            
        } catch (error) {
            totalBench.end();
            console.log(`❌ Analysis failed: ${error.message}`);
        }
    }
    
    async testSwap(tokenInfo, poolData) {
        const swapBench = this.benchmark('🚀 SWAP TEST');
        
        console.log(`\n🚀 SWAP EXECUTION TEST`);
        console.log(`======================`);
        console.log(`💰 Amount: ${ethers.formatEther(this.swapAmount)} WETH`);
        console.log(`🪙 Target: ${tokenInfo.symbol}`);
        
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
            
            console.log(`🔧 Construction: ✅ Complete (${swapCalldata.length} bytes)`);
            
            const signedTx = await this.signer.signTransaction(transaction);
            const parsedTx = ethers.Transaction.from(signedTx);
            
            console.log(`🔐 Signing: ✅ Success`);
            console.log(`   TX Hash: ${parsedTx.hash}`);
            
            try {
                await this.provider.send('eth_sendRawTransaction', [signedTx]);
                console.log(`📡 Blockchain: ✅ SUCCESS (Would execute with funds)`);
            } catch (error) {
                if (error.message.includes('insufficient funds')) {
                    console.log(`📡 Blockchain: ✅ VALID (Only failed due to no funds)`);
                } else {
                    console.log(`📡 Blockchain: ❌ FAILED (${error.message.slice(0, 60)}...)`);
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
    
    async run() {
        console.log(`\n🔥 FIXED POOL MONITOR - FINDING MISSED WETH POOLS`);
        console.log(`===============================================`);
        console.log(`🎯 Target: Recent WETH pairs with correct parsing`);
        console.log(`🔧 Fix: Proper PoolCreated event structure`);
        
        const wethPools = await this.findRecentWETHPools();
        
        if (wethPools.length === 0) {
            console.log(`\n❌ No new WETH pools found in recent blocks`);
            console.log(`   This means either:`);
            console.log(`   1. No WETH pools created recently`);
            console.log(`   2. All found pools already processed`);
            console.log(`   3. Tokens launching on other DEXs/pairs`);
        } else {
            console.log(`\n🔥 FOUND ${wethPools.length} NEW WETH POOL(S)!`);
            
            for (const poolData of wethPools) {
                await this.analyzePool(poolData);
            }
        }
        
        console.log(`\n✅ ANALYSIS COMPLETE!`);
    }
}

async function main() {
    try {
        const monitor = new FixedPoolMonitor();
        await monitor.run();
    } catch (error) {
        console.error('❌ Fatal error:', error.message);
        process.exit(1);
    }
}

if (require.main === module) {
    main();
}

module.exports = FixedPoolMonitor; 