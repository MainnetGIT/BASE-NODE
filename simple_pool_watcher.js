#!/usr/bin/env node

/**
 * Simplified BASE Pool Watcher & Swap Simulator
 * Server: 185.191.117.142
 * RPC: http://localhost:8545
 */

const axios = require('axios');

class SimplePoolWatcher {
    constructor() {
        this.rpcUrl = 'http://localhost:8545';
        this.poolCreatedSignature = '0x783cca1c0412dd0d695e784568c96da2e9c22ff989357a2e8b1d9b2b4e6b7118';
        this.wethAddress = '0x4200000000000000000000000000000000000006';
        this.stats = {
            poolsFound: 0,
            swapsSimulated: 0,
            totalDetectionTime: 0,
            totalSwapTime: 0
        };
    }

    async rpcCall(method, params = []) {
        const response = await axios.post(this.rpcUrl, {
            jsonrpc: '2.0',
            method,
            params,
            id: 1
        });
        return response.data.result;
    }

    async getTokenInfo(address) {
        try {
            const start = Date.now();
            
            // Get symbol
            const symbolData = await this.rpcCall('eth_call', [{
                to: address,
                data: '0x95d89b41'  // symbol()
            }, 'latest']);
            
            // Get name
            const nameData = await this.rpcCall('eth_call', [{
                to: address,
                data: '0x06fdde03'  // name()
            }, 'latest']);
            
            // Get decimals
            const decimalsData = await this.rpcCall('eth_call', [{
                to: address,
                data: '0x313ce567'  // decimals()
            }, 'latest']);
            
            const queryTime = Date.now() - start;
            
            return {
                address,
                symbol: this.hexToString(symbolData) || 'UNKNOWN',
                name: this.hexToString(nameData) || 'Unknown Token',
                decimals: parseInt(decimalsData, 16) || 18,
                queryTime
            };
        } catch (error) {
            return {
                address,
                symbol: 'ERROR',
                name: 'Failed to load',
                decimals: 18,
                queryTime: 0,
                error: error.message
            };
        }
    }

    hexToString(hex) {
        try {
            if (!hex || hex === '0x') return '';
            
            // Remove 0x prefix
            hex = hex.replace('0x', '');
            
            // For ABI encoded strings, skip the first 64 chars (offset + length)
            if (hex.length > 128) {
                const lengthHex = hex.slice(64, 128);
                const length = parseInt(lengthHex, 16) * 2;
                const dataHex = hex.slice(128, 128 + length);
                
                // Convert to ASCII
                let result = '';
                for (let i = 0; i < dataHex.length; i += 2) {
                    const byte = parseInt(dataHex.substr(i, 2), 16);
                    if (byte > 0) result += String.fromCharCode(byte);
                }
                return result;
            }
            
            return '';
        } catch {
            return '';
        }
    }

    async simulateSwap(tokenAddress, tokenSymbol) {
        const start = Date.now();
        console.log(`\n⚡ SIMULATING SWAP: 0.0001 ETH → ${tokenSymbol}`);
        console.log('===========================================');
        
        try {
            // Simulate quote request (normally would call Uniswap quoter)
            const quoteStart = Date.now();
            await new Promise(resolve => setTimeout(resolve, 50 + Math.random() * 100)); // 50-150ms simulation
            const quoteTime = Date.now() - quoteStart;
            
            // Simulate random quote result
            const randomAmount = (Math.random() * 1000000 + 100).toFixed(2);
            console.log(`💱 Quote: 0.0001 ETH → ${randomAmount} ${tokenSymbol}`);
            console.log(`⚡ Quote Time: ${quoteTime}ms`);
            
            // Simulate swap execution
            const swapStart = Date.now();
            await new Promise(resolve => setTimeout(resolve, 200 + Math.random() * 300)); // 200-500ms simulation
            const swapTime = Date.now() - swapStart;
            
            console.log(`✅ Swap Simulation Complete`);
            console.log(`⚡ Swap Time: ${swapTime}ms`);
            
            const totalTime = Date.now() - start;
            console.log(`⚡ Total Time: ${totalTime}ms`);
            
            this.stats.swapsSimulated++;
            this.stats.totalSwapTime += totalTime;
            
            return {
                success: true,
                expectedAmount: randomAmount,
                quoteTime,
                swapTime,
                totalTime
            };
        } catch (error) {
            console.log(`❌ Swap simulation failed: ${error.message}`);
            return { success: false, error: error.message };
        }
    }

    async analyzePool(log) {
        const start = Date.now();
        console.log('\n🎯 NEW POOL DETECTED!');
        console.log('====================');
        
        try {
            // Parse log data
            const blockNum = parseInt(log.blockNumber, 16);
            const token0 = '0x' + log.topics[1].slice(26);
            const token1 = '0x' + log.topics[2].slice(26);
            const fee = parseInt(log.topics[3], 16);
            const poolAddress = '0x' + log.data.slice(90, 130);
            
            console.log(`📦 Block: ${blockNum}`);
            console.log(`🔗 Transaction: ${log.transactionHash}`);
            console.log(`🏊 Pool: ${poolAddress}`);
            console.log(`💰 Fee: ${fee / 10000}%`);
            
            // Get block timestamp
            const block = await this.rpcCall('eth_getBlockByNumber', [`0x${blockNum.toString(16)}`, false]);
            const timestamp = new Date(parseInt(block.timestamp, 16) * 1000);
            console.log(`⏰ Created: ${timestamp.toISOString()}`);
            
            // Get token info
            console.log('\n🪙 Token Analysis:');
            const [token0Info, token1Info] = await Promise.all([
                this.getTokenInfo(token0),
                this.getTokenInfo(token1)
            ]);
            
            console.log(`Token 0: ${token0Info.symbol} (${token0Info.name})`);
            console.log(`Token 1: ${token1Info.symbol} (${token1Info.name})`);
            
            // Determine target token (not WETH)
            const targetToken = token0 === this.wethAddress ? token1Info : token0Info;
            console.log(`🎯 Target: ${targetToken.symbol}`);
            
            const analysisTime = Date.now() - start;
            console.log(`⚡ Analysis: ${analysisTime}ms`);
            
            // Simulate swap if token is valid
            if (targetToken.symbol !== 'ERROR') {
                await this.simulateSwap(targetToken.address, targetToken.symbol);
            }
            
            this.stats.poolsFound++;
            this.stats.totalDetectionTime += analysisTime;
            
            this.printStats();
            
        } catch (error) {
            console.error(`❌ Analysis failed: ${error.message}`);
        }
    }

    async scanRecentBlocks(numBlocks = 50) {
        console.log('🚀 BASE Pool Watcher & Swap Simulator');
        console.log('====================================');
        
        const currentBlock = await this.rpcCall('eth_blockNumber');
        const currentBlockNum = parseInt(currentBlock, 16);
        const fromBlock = `0x${(currentBlockNum - numBlocks).toString(16)}`;
        
        console.log(`📡 Scanning blocks ${currentBlockNum - numBlocks} to ${currentBlockNum}`);
        console.log(`🔍 Looking for pool creation events...`);
        
        const logs = await this.rpcCall('eth_getLogs', [{
            fromBlock,
            toBlock: 'latest',
            topics: [this.poolCreatedSignature]
        }]);
        
        console.log(`\n📦 Found ${logs.length} pool creation events\n`);
        
        for (const log of logs) {
            await this.analyzePool(log);
        }
        
        console.log('\n🏁 Scan Complete!');
        this.printFinalStats();
    }

    printStats() {
        console.log('\n📊 CURRENT STATS');
        console.log('================');
        console.log(`🎯 Pools Found: ${this.stats.poolsFound}`);
        console.log(`⚡ Swaps Simulated: ${this.stats.swapsSimulated}`);
        const avgDetection = this.stats.poolsFound > 0 ? (this.stats.totalDetectionTime / this.stats.poolsFound).toFixed(0) : 0;
        const avgSwap = this.stats.swapsSimulated > 0 ? (this.stats.totalSwapTime / this.stats.swapsSimulated).toFixed(0) : 0;
        console.log(`⚡ Avg Detection: ${avgDetection}ms`);
        console.log(`⚡ Avg Swap: ${avgSwap}ms`);
        console.log('================\n');
    }

    printFinalStats() {
        console.log('\n🎉 FINAL PERFORMANCE RESULTS');
        console.log('============================');
        console.log(`🎯 Total Pools Detected: ${this.stats.poolsFound}`);
        console.log(`⚡ Total Swaps Simulated: ${this.stats.swapsSimulated}`);
        console.log(`📈 Success Rate: ${this.stats.poolsFound > 0 ? ((this.stats.swapsSimulated / this.stats.poolsFound) * 100).toFixed(1) : 0}%`);
        
        const avgDetection = this.stats.poolsFound > 0 ? (this.stats.totalDetectionTime / this.stats.poolsFound).toFixed(0) : 0;
        const avgSwap = this.stats.swapsSimulated > 0 ? (this.stats.totalSwapTime / this.stats.swapsSimulated).toFixed(0) : 0;
        
        console.log(`⚡ Average Detection Time: ${avgDetection}ms`);
        console.log(`⚡ Average Swap Time: ${avgSwap}ms`);
        console.log(`⚡ Total Processing Time: ${(parseInt(avgDetection) + parseInt(avgSwap))}ms per pool`);
        console.log('============================');
        
        // Performance assessment
        if (parseInt(avgDetection) < 500) {
            console.log('✅ EXCELLENT detection speed (<500ms)');
        } else if (parseInt(avgDetection) < 1000) {
            console.log('✅ GOOD detection speed (<1s)');
        } else {
            console.log('⚠️  SLOW detection speed (>1s)');
        }
        
        if (parseInt(avgSwap) < 1000) {
            console.log('✅ EXCELLENT swap speed (<1s)');
        } else {
            console.log('⚠️  SLOW swap speed (>1s)');
        }
    }
}

// Main execution
async function main() {
    const watcher = new SimplePoolWatcher();
    const blocks = parseInt(process.argv[2]) || 100;
    
    try {
        await watcher.scanRecentBlocks(blocks);
    } catch (error) {
        console.error('❌ Error:', error.message);
    }
}

if (require.main === module) {
    main();
}

module.exports = SimplePoolWatcher; 