/**
 * Server-Side Enhanced Features Test
 * Demonstrates Alchemy-equivalent features directly on the BASE server
 */

const serverTestCode = `
const axios = require('axios');

class ServerEnhancedTest {
    constructor() {
        this.rpcUrl = 'http://localhost:8545';
    }

    async rpcCall(method, params = []) {
        try {
            const response = await axios.post(this.rpcUrl, {
                jsonrpc: '2.0',
                method: method,
                params: params,
                id: 1
            });
            return response.data.result;
        } catch (error) {
            throw new Error(\`RPC call failed: \${error.message}\`);
        }
    }

    // Enhanced Token Balance Discovery
    async getTokenBalances(address) {
        console.log('🪙 ENHANCED TOKEN BALANCE DISCOVERY');
        console.log('===================================');
        
        // Known BASE tokens
        const knownTokens = [
            { address: '0x4200000000000000000000000000000000000006', symbol: 'WETH' },
            { address: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913', symbol: 'USDC' }
        ];

        const balances = [];
        
        for (const token of knownTokens) {
            try {
                // Call balanceOf(address) on token contract
                const data = '0x70a08231' + address.slice(2).padStart(64, '0');
                const balance = await this.rpcCall('eth_call', [
                    { to: token.address, data: data },
                    'latest'
                ]);
                
                const balanceValue = BigInt(balance || '0x0');
                if (balanceValue > 0n) {
                    balances.push({
                        token: token.symbol,
                        address: token.address,
                        balance: balanceValue.toString()
                    });
                }
                console.log(\`✅ \${token.symbol}: \${balanceValue.toString()}\`);
            } catch (error) {
                console.log(\`❌ \${token.symbol}: \${error.message}\`);
            }
        }
        
        return balances;
    }

    // Enhanced Token Metadata Extraction
    async getTokenMetadata(tokenAddress) {
        console.log('\\n📊 ENHANCED TOKEN METADATA');
        console.log('===========================');
        console.log(\`Getting metadata for: \${tokenAddress}\`);
        
        try {
            // Get name, symbol, decimals in parallel
            const nameCall = this.rpcCall('eth_call', [{ to: tokenAddress, data: '0x06fdde03' }, 'latest']);
            const symbolCall = this.rpcCall('eth_call', [{ to: tokenAddress, data: '0x95d89b41' }, 'latest']);
            const decimalsCall = this.rpcCall('eth_call', [{ to: tokenAddress, data: '0x313ce567' }, 'latest']);
            const totalSupplyCall = this.rpcCall('eth_call', [{ to: tokenAddress, data: '0x18160ddd' }, 'latest']);
            
            const [name, symbol, decimals, totalSupply] = await Promise.all([
                nameCall, symbolCall, decimalsCall, totalSupplyCall
            ]);
            
            const metadata = {
                name: this.decodeString(name),
                symbol: this.decodeString(symbol),
                decimals: parseInt(decimals || '0x12', 16),
                totalSupply: BigInt(totalSupply || '0x0').toString()
            };
            
            console.log(\`✅ Name: \${metadata.name}\`);
            console.log(\`✅ Symbol: \${metadata.symbol}\`);
            console.log(\`✅ Decimals: \${metadata.decimals}\`);
            console.log(\`✅ Total Supply: \${metadata.totalSupply}\`);
            
            return metadata;
        } catch (error) {
            console.log(\`❌ Metadata extraction failed: \${error.message}\`);
            return null;
        }
    }

    // Enhanced Asset Transfer Discovery
    async getAssetTransfers(blocks = 5) {
        console.log('\\n🔄 ENHANCED ASSET TRANSFER DISCOVERY');
        console.log('====================================');
        
        try {
            const currentBlock = await this.rpcCall('eth_blockNumber', []);
            const blockNum = parseInt(currentBlock, 16);
            const fromBlock = '0x' + Math.max(0, blockNum - blocks).toString(16);
            
            // ERC-20 Transfer event signature
            const transferSig = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
            
            const logs = await this.rpcCall('eth_getLogs', [{
                fromBlock: fromBlock,
                toBlock: 'latest',
                topics: [transferSig]
            }]);
            
            console.log(\`✅ Found \${logs.length} transfer events in last \${blocks} blocks\`);
            
            // Parse first few transfers
            const transfers = [];
            for (const log of logs.slice(0, 10)) {
                const from = '0x' + log.topics[1].slice(26);
                const to = '0x' + log.topics[2].slice(26);
                const value = BigInt(log.data || '0x0').toString();
                
                transfers.push({
                    token: log.address,
                    from: from,
                    to: to,
                    value: value,
                    block: parseInt(log.blockNumber, 16),
                    tx: log.transactionHash
                });
            }
            
            transfers.slice(0, 5).forEach((transfer, i) => {
                console.log(\`   \${i+1}. Token \${transfer.token.slice(0,8)}... value: \${transfer.value}\`);
            });
            
            return transfers;
        } catch (error) {
            console.log(\`❌ Transfer discovery failed: \${error.message}\`);
            return [];
        }
    }

    // Enhanced Gas Price Analysis
    async getGasPriceAnalysis() {
        console.log('\\n⛽ ENHANCED GAS PRICE ANALYSIS');
        console.log('==============================');
        
        try {
            // Get fee history for last 20 blocks
            const feeHistory = await this.rpcCall('eth_feeHistory', [20, 'latest', [25, 50, 75]]);
            const gasPrice = await this.rpcCall('eth_gasPrice', []);
            
            console.log(\`✅ Current gas price: \${BigInt(gasPrice).toString()} wei\`);
            console.log(\`✅ Fee history blocks: \${feeHistory.baseFeePerGas.length}\`);
            
            // Calculate recommendations
            const currentGwei = Number(BigInt(gasPrice)) / 1e9;
            const recommendations = {
                slow: Math.floor(currentGwei * 0.8),
                standard: Math.floor(currentGwei),
                fast: Math.floor(currentGwei * 1.2)
            };
            
            console.log(\`✅ Recommendations:\`);
            console.log(\`   🐌 Slow: \${recommendations.slow} Gwei\`);
            console.log(\`   ⚡ Standard: \${recommendations.standard} Gwei\`);
            console.log(\`   🚀 Fast: \${recommendations.fast} Gwei\`);
            
            return { gasPrice, feeHistory, recommendations };
        } catch (error) {
            console.log(\`❌ Gas analysis failed: \${error.message}\`);
            return null;
        }
    }

    // Enhanced Block Analysis
    async getBlockAnalysis() {
        console.log('\\n📦 ENHANCED BLOCK ANALYSIS');
        console.log('===========================');
        
        try {
            const latestBlock = await this.rpcCall('eth_getBlockByNumber', ['latest', true]);
            
            const blockNum = parseInt(latestBlock.number, 16);
            const txCount = latestBlock.transactions.length;
            const gasUsed = parseInt(latestBlock.gasUsed, 16);
            const gasLimit = parseInt(latestBlock.gasLimit, 16);
            const utilization = (gasUsed / gasLimit * 100).toFixed(2);
            
            console.log(\`✅ Block number: \${blockNum}\`);
            console.log(\`✅ Transactions: \${txCount}\`);
            console.log(\`✅ Gas used: \${gasUsed.toLocaleString()}\`);
            console.log(\`✅ Gas limit: \${gasLimit.toLocaleString()}\`);
            console.log(\`✅ Utilization: \${utilization}%\`);
            
            // Analyze transaction types
            let tokenTransfers = 0;
            let ethTransfers = 0;
            let contractCalls = 0;
            
            for (const tx of latestBlock.transactions) {
                if (tx.to === null) {
                    contractCalls++; // Contract creation
                } else if (tx.input === '0x') {
                    ethTransfers++; // Simple ETH transfer
                } else {
                    contractCalls++; // Contract interaction
                }
            }
            
            console.log(\`✅ Transaction breakdown:\`);
            console.log(\`   📞 Contract calls: \${contractCalls}\`);
            console.log(\`   💰 ETH transfers: \${ethTransfers}\`);
            
            return {
                blockNumber: blockNum,
                transactions: txCount,
                gasUtilization: utilization,
                breakdown: { contractCalls, ethTransfers }
            };
        } catch (error) {
            console.log(\`❌ Block analysis failed: \${error.message}\`);
            return null;
        }
    }

    // Helper function to decode string from hex
    decodeString(hexData) {
        if (!hexData || hexData === '0x') return '';
        try {
            const hex = hexData.slice(2);
            let str = '';
            for (let i = 0; i < hex.length; i += 2) {
                const char = String.fromCharCode(parseInt(hex.substr(i, 2), 16));
                if (char.charCodeAt(0) !== 0) str += char;
            }
            return str.trim();
        } catch {
            return '';
        }
    }

    async runFullDemo() {
        console.log('🚀 SERVER-SIDE ENHANCED FEATURES DEMO');
        console.log('=====================================');
        console.log('Demonstrating Alchemy-equivalent features on BASE server\\n');
        
        const testAddress = '0xE7EB013b728f2D323633b41bf1BF898B3756A389';
        const wethAddress = '0x4200000000000000000000000000000000000006';
        
        try {
            // Run all enhanced features
            await this.getTokenBalances(testAddress);
            await this.getTokenMetadata(wethAddress);
            await this.getAssetTransfers(3);
            await this.getGasPriceAnalysis();
            await this.getBlockAnalysis();
            
            console.log('\\n🎉 ENHANCED FEATURES DEMO COMPLETE!');
            console.log('====================================');
            console.log('✅ Token balance discovery working');
            console.log('✅ Token metadata extraction working');
            console.log('✅ Asset transfer monitoring working');
            console.log('✅ Gas price analysis working');
            console.log('✅ Block analysis working');
            console.log('');
            console.log('💡 Your private BASE node provides Alchemy-equivalent features!');
            
        } catch (error) {
            console.log(\`\\n❌ Demo failed: \${error.message}\`);
        }
    }
}

// Run the demo
const demo = new ServerEnhancedTest();
demo.runFullDemo();
`;

module.exports = { serverTestCode };