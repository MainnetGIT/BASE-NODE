const { ethers } = require('ethers');

class ProductionPoolBuyer {
    constructor() {
        this.provider = new ethers.JsonRpcProvider('http://localhost:8545');
        this.wethAddress = '0x4200000000000000000000000000000000000006';
        this.swapAmount = ethers.parseEther('0.0001');
        this.poolCreatedSignature = '0x783cca1c0412dd0d695e784568c96da2e9c22ff989357a2e8b1d9b2b4e6b7118';
        this.transferSignature = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
        this.targetPool = null;
        
        // PRODUCTION WALLET SETUP
        // Option 1: Use environment variable for private key
        const privateKey = process.env.WALLET_PRIVATE_KEY;
        
        if (!privateKey) {
            console.log('❌ ERROR: No wallet private key provided');
            console.log('💡 Set environment variable: export WALLET_PRIVATE_KEY="0x..."');
            console.log('⚠️  OR modify this script to hardcode your funded wallet key');
            process.exit(1);
        }
        
        try {
            this.wallet = new ethers.Wallet(privateKey);
            this.signer = this.wallet.connect(this.provider);
            
            console.log(`🔑 PRODUCTION WALLET LOADED: ${this.wallet.address}`);
            console.log(`   ⚠️  REAL FUNDS - PRODUCTION MODE`);
        } catch (error) {
            console.log('❌ ERROR: Invalid private key format');
            console.log('💡 Private key should start with 0x and be 64 characters');
            process.exit(1);
        }
        
        // Skip previously processed pools
        this.skipPools = [
            '0x934d985a35944d53b96f76a1164d0820fc991bd3',
            '0x7a3bd16e907e1d60c4464fdda7da4439779be7ee',
            '0x0622de1bf56912ebb84a8dbcbdc2c0a72d8a1a34',
            '0x6a5156afa1a2305b24c220f3b265ebe9c11943d6',
            '0x7e92bd1c332291c7f60c14556b9e29ea3d382622',
            '0x102c281999f2f331d79ca232935ad01dfe7f782f',
            '0xd68d7bb5ea3ee83d86253a52cd64ed1323cdfbce',
            '0xe967dc57dc65b626dc4612b86745d3c8ffd00d10',
            '0x6b4aa00162230db6e6c2cc41c8343b77a5a6cc4b',
            '0x91aba8532ca534c9e0dc7f6bb6e6a2f91acd03b4',
            '0xf1c813bf5714ae79f53eb24c08dfe307855f125c',
            '0x8cf630100117c43801ccba2badc22fe2a383c50d',
            '0x83b0579970bb528b0c6c48380f9bf0b5e78bcd81'
        ];
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
    
    async checkWalletBalance() {
        const balance = await this.provider.getBalance(this.wallet.address);
        const balanceEth = ethers.formatEther(balance);
        
        console.log(`\n💰 WALLET BALANCE CHECK:`);
        console.log(`   Address: ${this.wallet.address}`);
        console.log(`   Balance: ${balanceEth} ETH`);
        
        const requiredEth = '0.001'; // Minimum for gas + swap
        if (parseFloat(balanceEth) < parseFloat(requiredEth)) {
            console.log(`❌ INSUFFICIENT FUNDS!`);
            console.log(`   Required: ${requiredEth} ETH minimum`);
            console.log(`   Available: ${balanceEth} ETH`);
            console.log(`💡 Fund your wallet before running production trades`);
            return false;
        }
        
        console.log(`✅ SUFFICIENT FUNDS FOR TRADING`);
        return true;
    }
    
    async findNewestPool() {
        const bench = this.benchmark('Pool Discovery');
        
        const currentBlock = await this.provider.getBlockNumber();
        console.log(`✅ Current Block: ${currentBlock.toLocaleString()}`);
        
        const fromBlock = currentBlock - 1000;
        const toBlock = currentBlock;
        
        console.log(`📡 Scanning last 1000 blocks for pool creation...`);
        console.log(`   Scanning blocks ${fromBlock.toLocaleString()} to ${toBlock.toLocaleString()}...`);
        
        const logs = await this.provider.getLogs({
            fromBlock,
            toBlock,
            topics: [this.poolCreatedSignature]
        });
        
        const wethPools = logs.filter(log => {
            const data = log.data;
            const token0 = '0x' + data.slice(26, 66);
            const token1 = '0x' + data.slice(90, 130);
            
            return (token0.toLowerCase() === this.wethAddress.toLowerCase() || 
                    token1.toLowerCase() === this.wethAddress.toLowerCase());
        }).filter(log => {
            const poolAddress = '0x' + log.topics[1].slice(26);
            return !this.skipPools.includes(poolAddress.toLowerCase());
        });
        
        if (wethPools.length === 0) {
            console.log('❌ No new WETH pools found in recent blocks');
            return null;
        }
        
        console.log(`✅ Found ${wethPools.length} pools, selecting newest:`);
        
        const newestLog = wethPools[wethPools.length - 1];
        const data = newestLog.data;
        const poolAddress = '0x' + newestLog.topics[1].slice(26);
        const token0 = '0x' + data.slice(26, 66);
        const token1 = '0x' + data.slice(90, 130);
        const fee = parseInt(data.slice(130, 194), 16);
        
        this.targetPool = {
            address: poolAddress,
            token0,
            token1,
            fee,
            blockNumber: newestLog.blockNumber,
            transactionHash: newestLog.transactionHash
        };
        
        console.log(`📋 DISCOVERED POOL:`);
        console.log(`   Pool Address: ${poolAddress}`);
        console.log(`   Token 0: ${token0}`);
        console.log(`   Token 1: ${token1}`);
        console.log(`   Fee: ${Number(fee) / 10000}%`);
        console.log(`   Block: ${newestLog.blockNumber}`);
        console.log(`   Transaction: ${newestLog.transactionHash}`);
        
        const targetToken = token0.toLowerCase() === this.wethAddress.toLowerCase() ? token1 : token0;
        console.log(`💎 WETH PAIR FOUND!`);
        console.log(`   WETH: ${this.wethAddress}`);
        console.log(`   Target Token: ${targetToken}`);
        
        bench.end();
        return targetToken;
    }
    
    async analyzeTokenFreshness(targetToken) {
        const bench = this.benchmark('Token Freshness Analysis');
        
        const receipt = await this.provider.getTransactionReceipt(this.targetPool.transactionHash);
        
        console.log(`📋 TRANSACTION ANALYSIS:`);
        console.log(`   TX Hash: ${this.targetPool.transactionHash}`);
        console.log(`   From: ${receipt.from}`);
        console.log(`   Block: ${receipt.blockNumber}`);
        console.log(`   Gas Used: ${receipt.gasUsed.toLocaleString()}`);
        
        const mintingLogs = receipt.logs.filter(log => 
            log.topics[0] === this.transferSignature &&
            log.topics[1] === '0x0000000000000000000000000000000000000000000000000000000000000000'
        );
        
        let targetTokenMinted = false;
        const mintedTokens = [];
        
        for (const log of mintingLogs) {
            const tokenAddress = log.address.toLowerCase();
            mintedTokens.push(tokenAddress);
            console.log(`🪙 Token minting detected: ${log.address}`);
            
            if (tokenAddress === targetToken.toLowerCase()) {
                targetTokenMinted = true;
            }
        }
        
        console.log(`\n🎯 FRESHNESS ASSESSMENT:`);
        console.log(`   Token Minting Found: ${mintingLogs.length > 0 ? '✅ YES' : '❌ NO'}`);
        console.log(`   Target Token Minted: ${targetTokenMinted ? '🔥 YES' : '📜 NO'}`);
        console.log(`   Minted Tokens: ${mintedTokens.join(', ')}`);
        console.log(`   Overall Status: ${targetTokenMinted ? '🔥 FRESH LAUNCH!' : '📈 EXISTING TOKEN'}`);
        
        bench.end();
        return targetTokenMinted;
    }
    
    async getTokenInfo(tokenAddress) {
        const bench = this.benchmark('Token Information Retrieval');
        
        const tokenContract = new ethers.Contract(tokenAddress, [
            'function symbol() view returns (string)',
            'function name() view returns (string)',
            'function decimals() view returns (uint8)',
            'function totalSupply() view returns (uint256)'
        ], this.provider);
        
        try {
            const [symbol, name, decimals, totalSupply] = await Promise.all([
                tokenContract.symbol(),
                tokenContract.name(),
                tokenContract.decimals(),
                tokenContract.totalSupply()
            ]);
            
            const supply = ethers.formatUnits(totalSupply, decimals);
            
            console.log(`📋 TOKEN DETAILS:`);
            console.log(`   Address: ${tokenAddress}`);
            console.log(`   Symbol: ${symbol}`);
            console.log(`   Name: ${name}`);
            console.log(`   Decimals: ${decimals}`);
            console.log(`   Total Supply: ${supply}`);
            console.log(`   Supply (raw): ${totalSupply.toString()}`);
            
            bench.end();
            return { address: tokenAddress, symbol, name, decimals, totalSupply: supply };
        } catch (error) {
            console.log(`❌ Failed to get token info: ${error.message}`);
            bench.end();
            return null;
        }
    }
    
    async analyzePoolState() {
        const bench = this.benchmark('Pool State Analysis');
        
        const poolContract = new ethers.Contract(this.targetPool.address, [
            'function token0() view returns (address)',
            'function token1() view returns (address)',
            'function fee() view returns (uint24)',
            'function liquidity() view returns (uint128)',
            'function slot0() view returns (uint160, int24, uint16, uint16, uint16, uint8, bool)'
        ], this.provider);
        
        try {
            const [token0, token1, fee, liquidity, slot0] = await Promise.all([
                poolContract.token0(),
                poolContract.token1(),
                poolContract.fee(),
                poolContract.liquidity(),
                poolContract.slot0()
            ]);
            
            console.log(`📊 CURRENT POOL STATE:`);
            console.log(`   Pool Address: ${this.targetPool.address}`);
            console.log(`   Token 0: ${token0}`);
            console.log(`   Token 1: ${token1}`);
            console.log(`   Fee Tier: ${Number(fee) / 10000}% (${Number(fee)} basis points)`);
            console.log(`   Liquidity: ${liquidity.toString()}`);
            console.log(`   Price (sqrtPriceX96): ${slot0[0].toString()}`);
            console.log(`   Current Tick: ${slot0[1]}`);
            console.log(`   Pool Unlocked: ${slot0[6]}`);
            
            const hasLiquidity = liquidity > 0n;
            const isUnlocked = slot0[6];
            
            console.log(`\n✅ POOL READINESS:`);
            console.log(`   Has Liquidity: ${hasLiquidity ? '✅ YES' : '❌ NO'}`);
            console.log(`   Is Unlocked: ${isUnlocked ? '✅ YES' : '❌ NO'}`);
            console.log(`   Ready for Trading: ${hasLiquidity && isUnlocked ? '✅ YES' : '❌ NO'}`);
            
            bench.end();
            return { hasLiquidity, isUnlocked, liquidity, fee };
        } catch (error) {
            console.log(`❌ Pool state analysis failed: ${error.message}`);
            bench.end();
            return null;
        }
    }
    
    async executeRealSwap(tokenInfo, poolState) {
        console.log(`\n🚀 REAL SWAP EXECUTION`);
        console.log(`========================`);
        console.log(`⚠️  EXECUTING REAL TRANSACTION - PRODUCTION MODE`);
        
        const targetToken = tokenInfo.address;
        const tokenIn = this.wethAddress;
        const tokenOut = targetToken;
        const fee = poolState.fee;
        const amountIn = this.swapAmount;
        const amountOutMinimum = 0; // Accept any amount of tokens out
        
        console.log(`📋 REAL TRANSACTION PARAMETERS:`);
        console.log(`   🎯 Strategy: PRODUCTION BLOCKCHAIN TRANSACTION`);
        console.log(`   Router: 0x2626664c2603336E57B271c5C0b26F421741e481`);
        console.log(`   Token In: ${tokenIn} (WETH)`);
        console.log(`   Token Out: ${tokenOut} (${tokenInfo.symbol})`);
        console.log(`   Fee Tier: ${Number(fee) / 10000}%`);
        console.log(`   Amount In: ${ethers.formatEther(amountIn)} WETH`);
        console.log(`   Min Out: ${amountOutMinimum} ${tokenInfo.symbol}`);
        
        // Construct swap transaction
        const routerAddress = '0x2626664c2603336E57B271c5C0b26F421741e481';
        const swapCalldata = this.constructSwapCalldata(tokenIn, tokenOut, fee, amountIn, amountOutMinimum);
        
        const transaction = {
            to: routerAddress,
            data: swapCalldata,
            value: ethers.parseEther('0'), // No ETH value for WETH swap
            gasLimit: 300000,
            gasPrice: ethers.parseUnits('1.0', 'gwei')
        };
        
        console.log(`\n🔧 TRANSACTION CONSTRUCTION:`);
        console.log(`   Calldata Length: ${swapCalldata.length} bytes`);
        console.log(`   Gas Limit: 300,000`);
        console.log(`   Gas Price: 1.0 gwei`);
        
        try {
            console.log(`\n🚀 SENDING REAL TRANSACTION...`);
            const txResponse = await this.signer.sendTransaction(transaction);
            
            console.log(`✅ TRANSACTION SENT SUCCESSFULLY!`);
            console.log(`   TX Hash: ${txResponse.hash}`);
            console.log(`   Nonce: ${txResponse.nonce}`);
            console.log(`   Gas Limit: ${txResponse.gasLimit.toString()}`);
            console.log(`   Gas Price: ${txResponse.gasPrice.toString()}`);
            
            console.log(`\n⏳ WAITING FOR CONFIRMATION...`);
            const receipt = await txResponse.wait();
            
            console.log(`✅ TRANSACTION CONFIRMED!`);
            console.log(`   Block: ${receipt.blockNumber}`);
            console.log(`   Gas Used: ${receipt.gasUsed.toString()}`);
            console.log(`   Status: ${receipt.status === 1 ? 'SUCCESS' : 'FAILED'}`);
            
            return { success: true, hash: txResponse.hash, receipt };
            
        } catch (error) {
            console.log(`❌ TRANSACTION FAILED: ${error.message}`);
            return { success: false, error: error.message };
        }
    }
    
    constructSwapCalldata(tokenIn, tokenOut, fee, amountIn, amountOutMinimum) {
        const exactInputSingleSignature = '0x414bf389';
        const deadline = Math.floor(Date.now() / 1000) + 300; // 5 minutes
        
        const params = ethers.AbiCoder.defaultAbiCoder().encode(
            ['address', 'address', 'uint24', 'address', 'uint256', 'uint256', 'uint256', 'uint160'],
            [tokenIn, tokenOut, fee, this.wallet.address, deadline, amountIn, amountOutMinimum, 0]
        );
        
        return exactInputSingleSignature + params.slice(2);
    }
    
    async executeFullProcess() {
        const totalBench = this.benchmark('Total Process Time');
        
        console.log(`🚀 PRODUCTION POOL BUYER`);
        console.log(`========================`);
        console.log(`✅ Connected to Chain ID: 8453`);
        console.log(`✅ WETH Address: ${this.wethAddress}`);
        console.log(`✅ Buy Amount: ${ethers.formatEther(this.swapAmount)} WETH`);
        
        // Step 1: Check wallet balance
        const hasBalance = await this.checkWalletBalance();
        if (!hasBalance) {
            console.log(`❌ Cannot proceed without sufficient funds`);
            return;
        }
        
        // Step 2: Find newest pool
        const targetToken = await this.findNewestPool();
        if (!targetToken) return;
        
        // Step 3: Analyze token freshness
        const isFresh = await this.analyzeTokenFreshness(targetToken);
        
        // Step 4: Get token information
        const tokenInfo = await this.getTokenInfo(targetToken);
        if (!tokenInfo) return;
        
        // Step 5: Analyze pool state
        const poolState = await this.analyzePoolState();
        if (!poolState) return;
        
        if (!poolState.hasLiquidity || !poolState.isUnlocked) {
            console.log('❌ Pool not ready for trading');
            return;
        }
        
        // Step 6: Execute real swap
        const swapResult = await this.executeRealSwap(tokenInfo, poolState);
        
        const totalDuration = totalBench.end();
        
        console.log(`\n================================================================================`);
        console.log(`📊 PRODUCTION TRANSACTION COMPLETE`);
        console.log(`================================================================================`);
        console.log(`🎯 Target: ${tokenInfo.symbol} (${tokenInfo.name})`);
        console.log(`🏊 Pool: ${this.targetPool.address}`);
        console.log(`🔥 Fresh Launch: ${isFresh ? '✅ YES' : '❌ NO'}`);
        console.log(`💰 Trade Size: ${ethers.formatEther(this.swapAmount)} WETH`);
        console.log(`🚀 Real Transaction: ${swapResult.success ? '✅ SUCCESS' : '❌ FAILED'}`);
        console.log(`⏱️  Total Time: ${totalDuration.toFixed(2)}ms`);
        console.log(`⚡ Mode: 🔥 PRODUCTION`);
        console.log(`🔑 Wallet: ${this.wallet.address}`);
        if (swapResult.success) {
            console.log(`🔗 TX Hash: ${swapResult.hash}`);
            console.log(`📋 Status: ✅ CONFIRMED ON BLOCKCHAIN`);
        } else {
            console.log(`❌ Error: ${swapResult.error}`);
        }
        
        console.log(`\n🔥 PRODUCTION EXECUTION COMPLETED!`);
    }
}

async function main() {
    try {
        const buyer = new ProductionPoolBuyer();
        await buyer.executeFullProcess();
    } catch (error) {
        console.error('❌ Fatal error:', error.message);
        process.exit(1);
    }
}

if (require.main === module) {
    main();
}

module.exports = ProductionPoolBuyer; 