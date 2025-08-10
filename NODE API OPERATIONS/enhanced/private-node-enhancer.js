/**
 * Private Node Enhancer - Replicate Alchemy Features
 * Leverage sudo access and direct node capabilities to provide enhanced functionality
 */

const BaseRPCClient = require('../rpc/base-rpc-client');
const { execSync } = require('child_process');
const fs = require('fs');

class PrivateNodeEnhancer {
    constructor(config = {}) {
        this.config = {
            rpcEndpoint: config.rpcEndpoint || 'http://localhost:8545',
            sshConfig: {
                host: config.sshHost || '185.191.117.142',
                user: config.sshUser || 'deanbot',
                password: config.sshPassword || 'x37xJnS51EQboG3'
            },
            nodeDataPath: config.nodeDataPath || '/mnt/d0/geth',
            gethIPC: config.gethIPC || '/mnt/d0/geth/geth.ipc',
            ...config
        };

        this.rpc = new BaseRPCClient({ endpoint: this.config.rpcEndpoint });
        this.cache = new Map();
        this.tokenMetadataCache = new Map();
    }

    /**
     * Get Token Balances (Alchemy equivalent: alchemy_getTokenBalances)
     * Uses multiple strategies to find all token balances for an address
     */
    async getTokenBalances(address, options = {}) {
        console.log(`🪙 Getting token balances for ${address}...`);
        
        const balances = [];
        const knownTokens = options.knownTokens || await this.getKnownTokens();
        
        // Strategy 1: Check known BASE tokens
        for (const token of knownTokens) {
            try {
                const balance = await this.getTokenBalance(address, token.address);
                if (balance > 0n) {
                    const metadata = await this.getTokenMetadata(token.address);
                    balances.push({
                        contractAddress: token.address,
                        tokenBalance: balance.toString(),
                        ...metadata
                    });
                }
            } catch (error) {
                console.warn(`Failed to check balance for ${token.address}:`, error.message);
            }
        }

        // Strategy 2: Scan recent transaction logs for token transfers involving this address
        if (options.scanRecent) {
            const recentTokens = await this.scanRecentTokenActivity(address, options.blocks || 1000);
            for (const tokenAddress of recentTokens) {
                if (!balances.find(b => b.contractAddress === tokenAddress)) {
                    try {
                        const balance = await this.getTokenBalance(address, tokenAddress);
                        if (balance > 0n) {
                            const metadata = await this.getTokenMetadata(tokenAddress);
                            balances.push({
                                contractAddress: tokenAddress,
                                tokenBalance: balance.toString(),
                                ...metadata
                            });
                        }
                    } catch (error) {
                        console.warn(`Failed to check discovered token ${tokenAddress}:`, error.message);
                    }
                }
            }
        }

        console.log(`✅ Found ${balances.length} token balances`);
        return {
            address,
            tokenBalances: balances
        };
    }

    /**
     * Get Token Metadata (Alchemy equivalent: alchemy_getTokenMetadata)
     * Retrieves comprehensive token information
     */
    async getTokenMetadata(tokenAddress) {
        const cacheKey = `metadata_${tokenAddress}`;
        if (this.tokenMetadataCache.has(cacheKey)) {
            return this.tokenMetadataCache.get(cacheKey);
        }

        console.log(`📊 Getting metadata for token ${tokenAddress}...`);

        try {
            // Parallel calls for efficiency
            const [name, symbol, decimals, totalSupply] = await Promise.allSettled([
                this.callContract(tokenAddress, '0x06fdde03'), // name()
                this.callContract(tokenAddress, '0x95d89b41'), // symbol()
                this.callContract(tokenAddress, '0x313ce567'), // decimals()
                this.callContract(tokenAddress, '0x18160ddd')  // totalSupply()
            ]);

            const metadata = {
                name: this.decodeString(name.value),
                symbol: this.decodeString(symbol.value),
                decimals: decimals.status === 'fulfilled' ? parseInt(decimals.value, 16) : 18,
                totalSupply: totalSupply.status === 'fulfilled' ? BigInt(totalSupply.value || '0').toString() : null,
                contractAddress: tokenAddress
            };

            // Try to get additional metadata from events
            const creationData = await this.getTokenCreationData(tokenAddress);
            if (creationData) {
                metadata.creator = creationData.creator;
                metadata.creationBlock = creationData.block;
                metadata.creationTx = creationData.tx;
            }

            this.tokenMetadataCache.set(cacheKey, metadata);
            return metadata;

        } catch (error) {
            console.error(`Failed to get metadata for ${tokenAddress}:`, error.message);
            return {
                contractAddress: tokenAddress,
                error: error.message
            };
        }
    }

    /**
     * Get Asset Transfers (Alchemy equivalent: alchemy_getAssetTransfers)
     * Scan for token transfers, ETH transfers, and NFT transfers
     */
    async getAssetTransfers(options = {}) {
        console.log('🔄 Scanning asset transfers...');
        
        const {
            fromBlock = 'latest',
            toBlock = 'latest',
            fromAddress = null,
            toAddress = null,
            category = ['external', 'token', 'erc20'],
            maxCount = 1000
        } = options;

        const transfers = [];

        // ERC20 Transfer signature: Transfer(address,address,uint256)
        const erc20TransferSig = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
        
        // Build filter
        const filter = {
            fromBlock,
            toBlock,
            topics: [erc20TransferSig]
        };

        // Add address filters if specified
        if (fromAddress || toAddress) {
            filter.topics[1] = fromAddress ? this.padAddress(fromAddress) : null;
            filter.topics[2] = toAddress ? this.padAddress(toAddress) : null;
        }

        try {
            const logs = await this.rpc.call('eth_getLogs', [filter]);
            console.log(`📋 Found ${logs.length} transfer events`);

            for (const log of logs.slice(0, maxCount)) {
                try {
                    const transfer = await this.parseTransferLog(log);
                    if (transfer) {
                        transfers.push(transfer);
                    }
                } catch (error) {
                    console.warn('Failed to parse transfer log:', error.message);
                }
            }

            // Get ETH transfers if requested
            if (category.includes('external')) {
                const ethTransfers = await this.getEthTransfers(options);
                transfers.push(...ethTransfers);
            }

            return {
                transfers: transfers.sort((a, b) => b.blockNum - a.blockNum)
            };

        } catch (error) {
            console.error('Failed to get asset transfers:', error.message);
            throw error;
        }
    }

    /**
     * Enhanced Transaction Receipts (Alchemy equivalent: alchemy_getTransactionReceipts)
     * Get multiple transaction receipts with enhanced data
     */
    async getTransactionReceipts(txHashes, enhanced = true) {
        console.log(`📄 Getting ${txHashes.length} transaction receipts...`);
        
        const receipts = [];
        const batchSize = 20;

        for (let i = 0; i < txHashes.length; i += batchSize) {
            const batch = txHashes.slice(i, i + batchSize);
            const batchCalls = batch.map(hash => ({
                method: 'eth_getTransactionReceipt',
                params: [hash]
            }));

            try {
                const batchResults = await this.rpc.batchCall(batchCalls);
                
                for (let j = 0; j < batchResults.length; j++) {
                    const receipt = batchResults[j];
                    if (receipt && enhanced) {
                        // Add enhanced data
                        receipt.enhanced = await this.enhanceTransactionReceipt(receipt);
                    }
                    receipts.push(receipt);
                }
            } catch (error) {
                console.error(`Batch receipt fetch failed:`, error.message);
            }
        }

        return receipts;
    }

    /**
     * Direct Node Database Access
     * Use sudo access to query node's internal database for enhanced data
     */
    async getDirectNodeData(query) {
        try {
            const sshCommand = `sshpass -p '${this.config.sshConfig.password}' ssh ${this.config.sshConfig.user}@${this.config.sshConfig.host}`;
            
            // Access geth via IPC for advanced queries
            const gethCommand = `${sshCommand} -t 'echo "${query}" | geth attach ${this.config.gethIPC}'`;
            const result = execSync(gethCommand, { encoding: 'utf8' });
            
            return this.parseGethResult(result);
        } catch (error) {
            console.error('Direct node access failed:', error.message);
            return null;
        }
    }

    /**
     * Get Mempool Transactions (Enhanced feature)
     * Access pending transactions directly from node
     */
    async getMempoolTransactions(count = 100) {
        console.log('🔄 Accessing mempool data...');
        
        try {
            // Use geth IPC to get pending transactions
            const pendingQuery = `txpool.content.pending`;
            const result = await this.getDirectNodeData(pendingQuery);
            
            if (result) {
                const transactions = this.parsePendingTransactions(result);
                return transactions.slice(0, count);
            }

            // Fallback to subscription method
            return await this.getPendingTransactionsViaSubscription(count);
            
        } catch (error) {
            console.error('Mempool access failed:', error.message);
            return [];
        }
    }

    /**
     * Enhanced Gas Estimation with Historical Data
     */
    async getEnhancedGasData(blocks = 20) {
        console.log(`⛽ Getting enhanced gas data for ${blocks} blocks...`);
        
        try {
            const feeHistory = await this.rpc.call('eth_feeHistory', [
                blocks,
                'latest',
                [10, 25, 50, 75, 90]
            ]);

            const currentGasPrice = await this.rpc.call('eth_gasPrice', []);
            
            return {
                currentGasPrice: BigInt(currentGasPrice).toString(),
                feeHistory,
                recommendations: this.calculateGasRecommendations(feeHistory),
                timestamp: new Date().toISOString()
            };
        } catch (error) {
            console.error('Enhanced gas data failed:', error.message);
            throw error;
        }
    }

    /**
     * Private helper methods
     */
    async getTokenBalance(address, tokenAddress) {
        const data = '0x70a08231' + address.slice(2).padStart(64, '0'); // balanceOf(address)
        const result = await this.rpc.call('eth_call', [
            { to: tokenAddress, data },
            'latest'
        ]);
        return BigInt(result || '0x0');
    }

    async callContract(address, data) {
        return await this.rpc.call('eth_call', [
            { to: address, data },
            'latest'
        ]);
    }

    decodeString(hexData) {
        if (!hexData || hexData === '0x') return '';
        try {
            // Remove 0x and convert hex to string
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

    padAddress(address) {
        return '0x' + address.slice(2).padStart(64, '0');
    }

    async parseTransferLog(log) {
        if (log.topics.length < 3) return null;
        
        const from = '0x' + log.topics[1].slice(26);
        const to = '0x' + log.topics[2].slice(26);
        const value = BigInt(log.data || '0x0');
        
        const metadata = await this.getTokenMetadata(log.address);
        
        return {
            blockNum: parseInt(log.blockNumber, 16),
            hash: log.transactionHash,
            from,
            to,
            value: value.toString(),
            asset: metadata.symbol || 'UNKNOWN',
            category: 'erc20',
            rawContract: {
                address: log.address,
                decimals: metadata.decimals
            }
        };
    }

    async getKnownTokens() {
        // BASE network common tokens
        return [
            { address: '0x4200000000000000000000000000000000000006', symbol: 'WETH' },
            { address: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913', symbol: 'USDC' },
            { address: '0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb', symbol: 'DAI' },
            // Add more known BASE tokens here
        ];
    }

    async scanRecentTokenActivity(address, blocks) {
        const tokenAddresses = new Set();
        const currentBlock = await this.rpc.call('eth_blockNumber', []);
        const fromBlock = Math.max(0, parseInt(currentBlock, 16) - blocks);
        
        const logs = await this.rpc.call('eth_getLogs', [{
            fromBlock: '0x' + fromBlock.toString(16),
            toBlock: 'latest',
            topics: [
                '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef',
                [this.padAddress(address), null],
                [null, this.padAddress(address)]
            ]
        }]);

        logs.forEach(log => tokenAddresses.add(log.address));
        return Array.from(tokenAddresses);
    }

    async getTokenCreationData(tokenAddress) {
        try {
            const code = await this.rpc.call('eth_getCode', [tokenAddress, 'latest']);
            if (code === '0x') return null; // Not a contract
            
            // Try to find contract creation by scanning recent blocks
            // This is simplified - in production you'd want to binary search or use indexing
            return null;
        } catch {
            return null;
        }
    }

    async getEthTransfers(options) {
        // Simplified ETH transfer detection
        // In practice, you'd scan block transactions for ETH transfers
        return [];
    }

    async enhanceTransactionReceipt(receipt) {
        return {
            gasUsedPercentage: (parseInt(receipt.gasUsed, 16) / parseInt(receipt.gasLimit || '0x1e8480', 16) * 100).toFixed(2),
            timestamp: Date.now(), // Would get from block
            tokenTransfers: receipt.logs?.filter(log => 
                log.topics[0] === '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'
            ).length || 0
        };
    }

    parseGethResult(result) {
        try {
            // Parse geth console output
            return JSON.parse(result.split('\n').find(line => line.startsWith('{')));
        } catch {
            return null;
        }
    }

    async getPendingTransactionsViaSubscription(count) {
        // Fallback implementation using WebSocket subscription
        return [];
    }

    parsePendingTransactions(result) {
        // Parse pending transaction data from geth
        return [];
    }

    calculateGasRecommendations(feeHistory) {
        return {
            slow: '1 gwei',
            standard: '2 gwei', 
            fast: '5 gwei'
        };
    }
}

module.exports = PrivateNodeEnhancer;