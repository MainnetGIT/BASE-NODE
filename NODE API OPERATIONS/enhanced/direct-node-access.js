/**
 * Direct Node Access Module
 * Leverages sudo access for enhanced blockchain data retrieval
 */

const { execSync } = require('child_process');
const BaseRPCClient = require('../rpc/base-rpc-client');

class DirectNodeAccess {
    constructor(config = {}) {
        this.config = {
            sshHost: config.sshHost || '185.191.117.142',
            sshUser: config.sshUser || 'deanbot', 
            sshPassword: config.sshPassword || 'x37xJnS51EQboG3',
            gethIPC: config.gethIPC || '/mnt/d0/geth/geth.ipc',
            gethDataDir: config.gethDataDir || '/mnt/d0/geth',
            rpcEndpoint: config.rpcEndpoint || 'http://localhost:8545',
            ...config
        };

        this.rpc = new BaseRPCClient({ endpoint: this.config.rpcEndpoint });
    }

    /**
     * Execute Geth Console Commands via IPC
     * Direct access to node's internal state and debugging info
     */
    async executeGethCommand(command) {
        try {
            const sshCommand = this.buildSSHCommand();
            const gethCmd = `echo '${command}' | timeout 10s geth attach ${this.config.gethIPC}`;
            const fullCommand = `${sshCommand} -t '${gethCmd}'`;
            
            const result = execSync(fullCommand, { 
                encoding: 'utf8',
                timeout: 15000,
                maxBuffer: 1024 * 1024 * 10 // 10MB buffer
            });

            return this.parseGethOutput(result);
        } catch (error) {
            console.error(`Geth command failed: ${command}`, error.message);
            return null;
        }
    }

    /**
     * Get Transaction Pool Status
     * Access to pending and queued transactions
     */
    async getTransactionPoolStatus() {
        console.log('🔄 Getting transaction pool status...');
        
        const commands = [
            'txpool.status',
            'txpool.inspect.pending', 
            'txpool.content.pending'
        ];

        const results = {};
        for (const cmd of commands) {
            const result = await this.executeGethCommand(cmd);
            const key = cmd.split('.').pop();
            results[key] = result;
        }

        return {
            status: results.status,
            pendingCount: this.extractPendingCount(results.status),
            pendingTransactions: this.parsePendingTransactions(results.pending),
            timestamp: new Date().toISOString()
        };
    }

    /**
     * Get Detailed Peer Information
     * Network connectivity and peer analysis
     */
    async getDetailedPeerInfo() {
        console.log('👥 Getting detailed peer information...');
        
        const commands = [
            'admin.peers',
            'net.peerCount', 
            'admin.nodeInfo'
        ];

        const results = {};
        for (const cmd of commands) {
            const result = await this.executeGethCommand(cmd);
            const key = cmd.split('.').pop();
            results[key] = result;
        }

        return {
            peerCount: results.peerCount,
            peers: this.parsePeerData(results.peers),
            nodeInfo: results.nodeInfo,
            analysis: this.analyzePeerConnectivity(results.peers)
        };
    }

    /**
     * Get Node Sync Status and Performance
     * Detailed sync information and performance metrics
     */
    async getNodeSyncDetails() {
        console.log('⚡ Getting node sync details...');
        
        const commands = [
            'eth.syncing',
            'eth.blockNumber',
            'eth.chainId',
            'miner.hashrate',
            'debug.memStats'
        ];

        const results = {};
        for (const cmd of commands) {
            const result = await this.executeGethCommand(cmd);
            const key = cmd.split('.').pop();
            results[key] = result;
        }

        return {
            syncing: results.syncing,
            currentBlock: results.blockNumber,
            chainId: results.chainId,
            memoryStats: results.memStats,
            performance: this.calculatePerformanceMetrics(results)
        };
    }

    /**
     * Advanced Debug Tracing
     * Enable debug tracing if available
     */
    async enableDebugTracing() {
        console.log('🐛 Checking debug tracing capabilities...');
        
        try {
            // Check if debug API is available
            const debugAPIs = await this.executeGethCommand('rpc.modules');
            const hasDebug = debugAPIs && debugAPIs.debug;
            
            if (hasDebug) {
                console.log('✅ Debug API available');
                return {
                    available: true,
                    modules: debugAPIs
                };
            } else {
                console.log('❌ Debug API not available - would need to restart node with --debug flag');
                return {
                    available: false,
                    reason: 'Debug API not enabled',
                    instruction: 'Restart geth with --debug --trace flags'
                };
            }
        } catch (error) {
            return {
                available: false,
                error: error.message
            };
        }
    }

    /**
     * Get Database Statistics
     * Direct access to LevelDB statistics
     */
    async getDatabaseStats() {
        console.log('💽 Getting database statistics...');
        
        try {
            const sshCommand = this.buildSSHCommand();
            
            // Get database size and stats
            const commands = [
                `du -sh ${this.config.gethDataDir}`,
                `find ${this.config.gethDataDir} -name "*.ldb" | wc -l`,
                `ls -la ${this.config.gethDataDir}/geth/chaindata/ | head -10`
            ];

            const results = {};
            for (const cmd of commands) {
                try {
                    const result = execSync(`${sshCommand} -t '${cmd}'`, { 
                        encoding: 'utf8',
                        timeout: 10000 
                    });
                    results[cmd] = result.trim();
                } catch (error) {
                    results[cmd] = `Error: ${error.message}`;
                }
            }

            return {
                totalSize: results[commands[0]],
                levelDBFiles: results[commands[1]],
                chainDataSample: results[commands[2]],
                timestamp: new Date().toISOString()
            };
        } catch (error) {
            return {
                error: error.message
            };
        }
    }

    /**
     * Enhanced Gas Price Analysis
     * Historical gas price trends from recent blocks
     */
    async getGasPriceAnalysis(blocks = 100) {
        console.log(`⛽ Analyzing gas prices over ${blocks} blocks...`);
        
        try {
            const currentBlock = await this.rpc.call('eth_blockNumber', []);
            const blockNum = parseInt(currentBlock, 16);
            
            const gasPrices = [];
            const batchSize = 20;
            
            for (let i = 0; i < blocks; i += batchSize) {
                const batchCalls = [];
                for (let j = 0; j < batchSize && (i + j) < blocks; j++) {
                    const blockNumber = '0x' + (blockNum - i - j).toString(16);
                    batchCalls.push({
                        method: 'eth_getBlockByNumber',
                        params: [blockNumber, true] // Include transactions
                    });
                }
                
                const batchResults = await this.rpc.batchCall(batchCalls);
                
                for (const block of batchResults) {
                    if (block && block.transactions) {
                        const blockGasPrices = block.transactions
                            .map(tx => BigInt(tx.gasPrice || '0'))
                            .filter(price => price > 0n);
                        
                        if (blockGasPrices.length > 0) {
                            gasPrices.push({
                                block: parseInt(block.number, 16),
                                timestamp: parseInt(block.timestamp, 16),
                                minGasPrice: Math.min(...blockGasPrices.map(p => Number(p))),
                                maxGasPrice: Math.max(...blockGasPrices.map(p => Number(p))),
                                avgGasPrice: blockGasPrices.reduce((sum, price) => sum + price, 0n) / BigInt(blockGasPrices.length),
                                transactionCount: blockGasPrices.length
                            });
                        }
                    }
                }
            }

            return {
                blocks: gasPrices,
                analysis: this.analyzeGasTrends(gasPrices),
                recommendations: this.generateGasRecommendations(gasPrices)
            };
        } catch (error) {
            console.error('Gas price analysis failed:', error.message);
            return { error: error.message };
        }
    }

    /**
     * Advanced Token Discovery
     * Find new tokens by scanning contract creation transactions
     */
    async discoverNewTokens(blocks = 50) {
        console.log(`🔍 Discovering new tokens in last ${blocks} blocks...`);
        
        try {
            const currentBlock = await this.rpc.call('eth_blockNumber', []);
            const blockNum = parseInt(currentBlock, 16);
            const fromBlock = Math.max(0, blockNum - blocks);
            
            const newTokens = [];
            
            // Scan for contract creation transactions
            for (let i = fromBlock; i <= blockNum; i++) {
                const block = await this.rpc.call('eth_getBlockByNumber', [`0x${i.toString(16)}`, true]);
                
                if (block && block.transactions) {
                    for (const tx of block.transactions) {
                        // Contract creation (to: null)
                        if (!tx.to) {
                            const receipt = await this.rpc.call('eth_getTransactionReceipt', [tx.hash]);
                            
                            if (receipt && receipt.contractAddress) {
                                const isToken = await this.isERC20Token(receipt.contractAddress);
                                if (isToken) {
                                    const metadata = await this.getTokenMetadata(receipt.contractAddress);
                                    newTokens.push({
                                        address: receipt.contractAddress,
                                        creator: tx.from,
                                        block: i,
                                        txHash: tx.hash,
                                        ...metadata
                                    });
                                }
                            }
                        }
                    }
                }
            }

            return {
                blocks: `${fromBlock}-${blockNum}`,
                tokensFound: newTokens.length,
                tokens: newTokens
            };
        } catch (error) {
            console.error('Token discovery failed:', error.message);
            return { error: error.message };
        }
    }

    /**
     * Helper Methods
     */
    buildSSHCommand() {
        return `sshpass -p '${this.config.sshPassword}' ssh ${this.config.sshUser}@${this.config.sshHost}`;
    }

    parseGethOutput(output) {
        try {
            // Extract JSON from geth console output
            const lines = output.split('\n');
            const jsonLine = lines.find(line => {
                const trimmed = line.trim();
                return (trimmed.startsWith('{') || trimmed.startsWith('[')) && 
                       (trimmed.endsWith('}') || trimmed.endsWith(']'));
            });
            
            return jsonLine ? JSON.parse(jsonLine) : output;
        } catch {
            return output;
        }
    }

    extractPendingCount(status) {
        if (status && status.pending) {
            return parseInt(status.pending, 16);
        }
        return 0;
    }

    parsePendingTransactions(pending) {
        if (!pending) return [];
        
        const transactions = [];
        for (const [address, txs] of Object.entries(pending)) {
            for (const [nonce, tx] of Object.entries(txs)) {
                transactions.push({
                    from: address,
                    nonce: parseInt(nonce),
                    gasPrice: tx.gasPrice,
                    gas: tx.gas,
                    to: tx.to,
                    value: tx.value
                });
            }
        }
        return transactions.sort((a, b) => b.gasPrice - a.gasPrice);
    }

    parsePeerData(peers) {
        if (!Array.isArray(peers)) return [];
        
        return peers.map(peer => ({
            id: peer.id,
            name: peer.name,
            network: {
                localAddress: peer.network?.localAddress,
                remoteAddress: peer.network?.remoteAddress
            },
            protocols: peer.protocols
        }));
    }

    analyzePeerConnectivity(peers) {
        if (!Array.isArray(peers)) return {};
        
        return {
            total: peers.length,
            inbound: peers.filter(p => p.network?.inbound).length,
            outbound: peers.filter(p => !p.network?.inbound).length,
            countries: [...new Set(peers.map(p => p.network?.remoteAddress?.split(':')[0]))].length
        };
    }

    calculatePerformanceMetrics(results) {
        return {
            syncStatus: results.syncing === false ? 'synced' : 'syncing',
            blockNumber: results.blockNumber,
            memoryUsage: results.memStats?.Sys || 'unknown'
        };
    }

    analyzeGasTrends(gasPrices) {
        if (gasPrices.length === 0) return {};
        
        const prices = gasPrices.map(g => Number(g.avgGasPrice));
        const avg = prices.reduce((sum, price) => sum + price, 0) / prices.length;
        const min = Math.min(...prices);
        const max = Math.max(...prices);
        
        return {
            average: avg,
            minimum: min,
            maximum: max,
            trend: prices[0] > prices[prices.length - 1] ? 'decreasing' : 'increasing'
        };
    }

    generateGasRecommendations(gasPrices) {
        if (gasPrices.length === 0) return {};
        
        const recentAvg = gasPrices.slice(0, 10).reduce((sum, g) => sum + Number(g.avgGasPrice), 0) / 10;
        
        return {
            slow: Math.floor(recentAvg * 0.8),
            standard: Math.floor(recentAvg),
            fast: Math.floor(recentAvg * 1.2),
            urgent: Math.floor(recentAvg * 1.5)
        };
    }

    async isERC20Token(contractAddress) {
        try {
            // Check if contract implements ERC20 by calling totalSupply()
            const result = await this.rpc.call('eth_call', [
                { to: contractAddress, data: '0x18160ddd' }, // totalSupply()
                'latest'
            ]);
            return result && result !== '0x';
        } catch {
            return false;
        }
    }

    async getTokenMetadata(tokenAddress) {
        try {
            const [name, symbol, decimals] = await Promise.allSettled([
                this.rpc.call('eth_call', [{ to: tokenAddress, data: '0x06fdde03' }, 'latest']), // name()
                this.rpc.call('eth_call', [{ to: tokenAddress, data: '0x95d89b41' }, 'latest']), // symbol()
                this.rpc.call('eth_call', [{ to: tokenAddress, data: '0x313ce567' }, 'latest'])  // decimals()
            ]);

            return {
                name: this.decodeString(name.value),
                symbol: this.decodeString(symbol.value),
                decimals: decimals.status === 'fulfilled' ? parseInt(decimals.value, 16) : 18
            };
        } catch {
            return { name: '', symbol: '', decimals: 18 };
        }
    }

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
}

module.exports = DirectNodeAccess;